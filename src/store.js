import { reactive, computed } from 'vue'

export const GRID_COLS = 5
export const GRID_ROWS = 4
export const GRID_SIZE = GRID_COLS * GRID_ROWS
// Interior crossings of the grid lines where four squares meet. Auras sit on
// these intersections rather than in a square.
export const INTERSECTION_COLS = GRID_COLS - 1
export const INTERSECTION_ROWS = GRID_ROWS - 1
export const INTERSECTIONS = INTERSECTION_COLS * INTERSECTION_ROWS

const STORAGE_KEY = 'sorceryPuzzles.v1'
const ATTEMPTS_KEY = 'sorceryAttempts.v1'
const FORMAT_VERSION = 1

// Wordle-style limit: non-editors get this many submits per puzzle per day,
// tracked in the browser's localStorage.
export const MAX_TRIES = 3

// Deep clone via JSON, not structuredClone: everything cloned here is reactive
// (a Vue reactive() Proxy or a subtree of one), and structuredClone throws
// DataCloneError on Proxy objects. The whole puzzle state is JSON-safe by design
// -- it is exactly what gets written to localStorage / the REST API -- so a JSON
// round-trip is both correct and the same shape the store already serializes to.
const clone = (o) => JSON.parse(JSON.stringify(o))
// Short opaque ids for cards and puzzles. Sourced from the platform CSPRNG
// rather than Math.random -- not for secrecy, but so ids stay well-distributed
// and a static analyzer doesn't flag a weak generator. 8 base36 chars.
const uid = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) =>
    (b % 36).toString(36)
  ).join('')

export function emptyZones() {
  const z = {
    'hand:player': [],
    'hand:opponent': [],
    'grave:player': [],
    'grave:opponent': [],
    'collection:player': [],
    'collection:opponent': [],
    // Removed-from-game cards. In the physical game these are just set aside;
    // here they get their own off-board zone, per player like the cemetery.
    'banished:player': [],
    'banished:opponent': [],
    // Draw decks, per player: the Atlas holds sites, the Spellbook holds
    // spells. An avatar draws the top card of either into its owner's hand.
    'atlas:player': [],
    'atlas:opponent': [],
    'spellbook:player': [],
    'spellbook:opponent': [],
    storyline: [],
    pool: [],
  }
  // Each grid square has a site slot plus surface (top) and underground
  // (bot) slots for minions.
  for (let i = 0; i < GRID_SIZE; i++) {
    z[`site:${i}`] = []
    z[`cell:${i}:top`] = []
    z[`cell:${i}:bot`] = []
  }
  // One slot per grid-line intersection for aura cards.
  for (let i = 0; i < INTERSECTIONS; i++) {
    z[`aura:${i}`] = []
  }
  return z
}

export const ELEMENTS = ['air', 'earth', 'fire', 'water']

// Avatars start at 20 life in Sorcery; 0 is not "dead" but Death's Door,
// a distinct game state, so the UI never prints a bare 0 for life.
export const START_LIFE = 20

export function defaultStats() {
  const side = () => ({
    life: START_LIFE,
    mana: 0,
    air: 0,
    earth: 0,
    fire: 0,
    water: 0,
  })
  return { player: side(), opponent: side() }
}

// Host-page configuration (not part of the puzzle data). The WordPress
// shortcode sets canEdit from the viewer's capability; when false the app is
// locked to play mode and the editor UI is never shown. When apiUrl is set
// (the shortcode's data-api), puzzles are stored on the server through the
// plugin's REST API instead of localStorage.
export const config = reactive({
  canEdit: true,
  apiUrl: '', // REST base, e.g. https://site/wp-json/sorcery-puzzle/v1
  nonce: '', // WordPress REST nonce, authenticates writes as the editor
})

const remote = () => !!config.apiUrl

// Strip any trailing slashes from the REST base without a backtracking regex,
// so `${base}${path}` never doubles the separator.
function trimTrailingSlashes(url) {
  let end = url.length
  while (end > 0 && url[end - 1] === '/') end--
  return url.slice(0, end)
}

async function api(path, options = {}) {
  const headers = {}
  if (options.body) headers['Content-Type'] = 'application/json'
  if (config.nonce) headers['X-WP-Nonce'] = config.nonce
  const res = await fetch(trimTrailingSlashes(config.apiUrl) + path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...headers, ...options.headers },
  })
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      msg = (await res.json()).message || msg
    } catch {
      /* non-JSON error body */
    }
    throw new Error(msg)
  }
  return res.json()
}

// Transient UI state (not part of the puzzle data).
export const ui = reactive({
  hoverCard: null, // card id currently under the mouse
  alt: false, // Alt key held -> show enlarged preview of hovered card
  attacker: null, // card id armed to attack; next click on a unit/site targets it
  carrier: null, // card id armed to pick up; next click on a card carries it
  striker: null, // card id armed to strike; next click on a unit/site targets it
  moving: null, // card id armed for formal Move action; next zone click moves & taps unit
  // An activated ability that needs a target is waiting for one:
  // { cardId, abilityId }. The next click on a valid target performs it.
  activating: null,
  shooting: null, // card id armed to shoot (Ranged); next click on a unit fires
  intercepting: null, // card id armed to intercept; next click on an enemy fights it
  // An attack is paused for the defending side to interpose a defender:
  // { attackerId, targetId }. Resolved by chooseDefender / declineDefender.
  awaitingDefender: null,
  // The storyline is paused for a triggered ability to be given a target the
  // player picks: { ownerId, ability, entry, triggeringId }. Resolved by
  // resolveStoryChoice; the rest of the storyline resumes after.
  storyChoice: null,
  // A card is in flight. The board's drop zones only take the pointer while
  // this is true or while a card is armed for a click-move; the rest of the
  // time they step aside so the site art underneath them stays clickable.
  dragging: false,
  // Card whose actions are offered in the docked action bar. Selecting is
  // also how a card is picked up without dragging: click the card, then
  // click the zone it should go to.
  selected: null,
  // Transient cosmetic effects queue (flashes, projectiles). Purely visual:
  // never serialized, never part of undo or solution checking. Entries are
  // { id, kind, cardId?, sourceId?, targetId? } and auto-expire (see emitFx).
  fx: [],
})

// How long each effect kind stays in `ui.fx` before it self-removes (ms).
const FX_DURATION = { cast: 800, genesis: 800, death: 700, impact: 500, projectile: 650 }

// Fire a cosmetic effect. It only plays during solving (matches EventPopup's
// player-facing gating, so authoring/recording is never interrupted) and is
// suppressed when the visitor asked for reduced motion. The entry removes
// itself after its duration; a unique id means overlapping effects coexist.
export function emitFx(kind, opts = {}) {
  if (state.mode !== 'play') return
  if (
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return
  }
  const entry = { id: uid(), kind, ...opts }
  ui.fx.push(entry)
  const ttl = FX_DURATION[kind] || 700
  setTimeout(() => {
    const i = ui.fx.indexOf(entry)
    if (i !== -1) ui.fx.splice(i, 1)
  }, ttl)
}

// Which zone currently holds a card. The action bar reads this live rather
// than remembering where the card was when it got selected, so it stays
// right after the card moves.
export function zoneOf(cardId) {
  for (const [zone, ids] of Object.entries(state.zones)) {
    if (ids.includes(cardId)) return zone
  }
  // A carried card is in no zone of its own -- it is wherever its carrier is.
  // The loop guard is belt and braces: pickUp already refuses to make a cycle.
  let n = state.carry[cardId]
  for (let hops = 0; n && hops < 64; hops++) {
    for (const [zone, ids] of Object.entries(state.zones)) {
      if (ids.includes(n)) return zone
    }
    n = state.carry[n]
  }
  return null
}

export function selectCard(cardId) {
  ui.selected = ui.selected === cardId ? null : cardId
}

export function clearSelection() {
  ui.selected = null
}

export const state = reactive({
  mode: 'editor', // 'editor' | 'play'
  puzzleId: null,
  puzzleName: '',
  puzzleDesc: '', // short brief: what kind of puzzle this is and what to achieve
  puzzleDate: '', // optional YYYY-MM-DD, used by the daily-puzzle picker
  // When true, Move and Attack are enforced by reachability/targeting rules
  // during play and recording. Off by default so free-form puzzles are unchanged.
  enforce: true,
  // When true, attack/strike/shoot resolve real damage (Power vs Life, Lethal,
  // avatar/site life loss) during play and recording. Independent of `enforce`.
  combat: true,
  cards: {}, // id -> { id, name, img, imgId?, site?, aura?, unit?, avatar?, enemy? }
  zones: emptyZones(), // zoneId -> [cardId, ...]
  // Who is carrying what: itemId -> carrierId. A carried card is removed from
  // its zone entirely and lives only here, so it has no position of its own
  // and every zone rule (one site per square, auras only on intersections)
  // stops applying to it. Moving a carrier therefore needs no special case --
  // there is nothing to drag along, because the load was never in a zone.
  carry: {},
  // Ability grants in force: grantedCardId -> { carrierId, from, abilityId }.
  // A grant is a pseudo-pickup (the granted card is carried, so the carrier
  // gains its abilities); `from` remembers where it was taken from so releasing
  // it returns it there rather than dumping it on the carrier's square.
  // Transient like `carry`'s runtime edits -- created only during play.
  grants: {},
  initialZones: null, // snapshot taken when the solution recording starts
  initialCarry: null,
  stats: defaultStats(), // life, mana + elemental thresholds per player
  initialStats: null,
  tapped: {}, // cardId -> true
  initialTapped: null,
  damage: {}, // cardId -> number of damage counters on that card
  initialDamage: null,
  // Gameplay-only modifiers, populated by effects (Layer C) and folded into the
  // derived `effective` map. Base strength/keywords live on the card art and are
  // never stored; only in-play changes are: strengthMod is a signed counter, and
  // grantedKeywords is a list of keywords added during play.
  strengthMod: {}, // cardId -> signed strength delta
  grantedKeywords: {}, // cardId -> [keyword, ...]
  // Units summoned this turn (entered the realm from hand during play) -- what
  // Charge keys off. Single-turn approximation: never cleared within a puzzle.
  summoned: {}, // cardId -> true
  // Stealth is lost once the unit interacts with the realm (takes any action).
  stealthLost: {}, // cardId -> true
  // A Ward breaks once it absorbs an opponent's targeting/damage/destroy ability.
  wardBroken: {}, // cardId -> true
  // A puzzle can have several valid solutions; each line is a full move
  // sequence recorded from the same start position, and check() accepts an
  // attempt that matches any of them.
  solutions: [], // [[{ cardId, from, to } | { type: 'attack', ... }], ...]
  draft: [], // moves recorded since "Record" was pressed, committed on stop
  recording: false,
  moves: [], // player's attempt in play mode
  // Triggered-ability events fired by the moves so far, in order. Transient
  // (never serialized); each carries the `seq` of the entry that fired it so
  // undo can drop exactly the events that move produced.
  events: [],
  checked: false,
  firstWrong: -1, // index of first divergence after check(); -1 = fully correct
  targetLen: 0, // length of the closest solution line after check()
  tries: 0, // submits used today for this puzzle (non-editors only)
  solved: false, // this puzzle was solved today (non-editors only)
})

const FIXED_ZONE_LABELS = {
  'hand:player': 'Player hand',
  'hand:opponent': 'Opponent hand',
  'grave:player': 'Player cemetery',
  'grave:opponent': 'Opponent cemetery',
  'collection:player': 'Player collection',
  'collection:opponent': 'Opponent collection',
  'banished:player': 'Player banished',
  'banished:opponent': 'Opponent banished',
  'atlas:player': 'Your Atlas',
  'atlas:opponent': 'Opponent Atlas',
  'spellbook:player': 'Your Spellbook',
  'spellbook:opponent': 'Opponent Spellbook',
  storyline: 'Storyline',
  pool: 'Card pool',
}

export function zoneLabel(zone) {
  if (FIXED_ZONE_LABELS[zone]) return FIXED_ZONE_LABELS[zone]
  let m = /^site:(\d+)$/.exec(zone)
  if (m) return `${squareLabel(m[1])} (site)`
  m = /^cell:(\d+):top$/.exec(zone)
  if (m) return `${squareLabel(m[1])} (surface)`
  m = /^cell:(\d+):bot$/.exec(zone)
  if (m) return `${squareLabel(m[1])} (below)`
  m = /^cell:(\d+)$/.exec(zone)
  if (m) return squareLabel(m[1])
  m = /^aura:(\d+)$/.exec(zone)
  if (m) return intersectionLabel(m[1])
  return zone
}

function squareLabel(i) {
  i = Number(i)
  return `Square ${Math.floor(i / GRID_COLS) + 1},${(i % GRID_COLS) + 1}`
}

function intersectionLabel(i) {
  i = Number(i)
  return `Intersection ${Math.floor(i / INTERSECTION_COLS) + 1},${
    (i % INTERSECTION_COLS) + 1
  }`
}

export function cardName(cardId) {
  const c = state.cards[cardId]
  return c ? c.name : cardId
}

// ---------- abilities (data model) ----------

// The board has many raw zone ids (site:7, cell:12:bot, aura:3, hand:player…).
// Abilities are authored against these coarse *categories* instead, so a
// condition like "onto the storyline" or "from the realm" holds whatever square
// or side is involved. Returns null for an unknown zone (or a carried card,
// which has no zone of its own).
export function zoneCategory(zoneId) {
  if (!zoneId) return null
  if (zoneId === 'storyline') return 'storyline'
  if (zoneId === 'pool') return 'pool'
  if (zoneId.startsWith('hand:')) return 'hand'
  if (zoneId.startsWith('grave:')) return 'cemetery'
  if (zoneId.startsWith('collection:')) return 'collection'
  if (zoneId.startsWith('banished:')) return 'banished'
  if (zoneId.startsWith('atlas:')) return 'atlas'
  if (zoneId.startsWith('spellbook:')) return 'spellbook'
  if (zoneId.startsWith('aura:')) return 'aura'
  if (zoneId.startsWith('site:') || zoneId.startsWith('cell:')) return 'realm'
  return null
}

// ---------- regions ----------

// The four realm regions. Which one a board slot is depends entirely on the site
// (if any) sitting on that square, so region is derived, never stored.
export const REGIONS = ['surface', 'underground', 'underwater', 'void']

// The site card occupying a square, or null.
function siteOn(square) {
  const id = state.zones[`site:${square}`]?.[0]
  return id ? state.cards[id] : null
}

// Region of a square's surface / below slot:
//   surface slot  -> 'surface' with a site, else 'void' (open air over the square)
//   below slot    -> 'underwater' on a water site, 'underground' on a land site,
//                    and nothing at all with no site (you can't go below the void)
export function regionOf(square, layer) {
  const site = siteOn(square)
  if (layer === 'top' || layer === 'surface') return site ? 'surface' : 'void'
  if (layer === 'bot' || layer === 'below') {
    // No site means no subsurface at all -- you can't go below the open void.
    if (!site) return null
    return site.water ? 'underwater' : 'underground'
  }
  return null
}

// Region of a raw board zone id (cell:N:top / cell:N:bot). Null for off-board
// zones and for a below slot on a square with no site.
export function zoneRegion(zoneId) {
  const m = /^cell:(\d+):(top|bot)$/.exec(zoneId || '')
  return m ? regionOf(Number(m[1]), m[2]) : null
}

// ---------- passive abilities: the effective traits map ----------

// Units physically standing on the board, tagged with square, layer and region.
function boardUnits() {
  const out = []
  for (let i = 0; i < GRID_SIZE; i++) {
    for (const layer of ['top', 'bot']) {
      for (const id of state.zones[`cell:${i}:${layer}`] || []) {
        const c = state.cards[id]
        if (c && isUnit(c)) {
          out.push({ id, card: c, square: i, region: regionOf(i, layer) })
        }
      }
    }
  }
  return out
}

// Where a card sits, resolved to a { square, region }, or null if not on a cell.
function unitCell(cardId) {
  const m = /^cell:(\d+):(top|bot)$/.exec(zoneOf(cardId) || '')
  if (!m) return null
  return { square: Number(m[1]), region: regionOf(Number(m[1]), m[2]) }
}

const passivesOf = (card) =>
  (card?.abilities || []).filter((a) => a.kind === 'passive')

// The units a passive on `sourceId` reaches. Area scopes are region-aware (same
// region as the source) and drop the source itself; side suffixes filter by
// controller.
function unitsInScope(sourceId, scope) {
  if (scope === 'self') return [sourceId]
  const src = unitCell(sourceId)
  const srcCard = state.cards[sourceId]
  if (!src || !srcCard) return []
  const near = scope.startsWith('nearby')
  const wantFriendly = scope.endsWith('friendly')
  const wantEnemy = scope.endsWith('enemy')
  const out = []
  for (const u of boardUnits()) {
    if (u.id === sourceId) continue
    if (u.region !== src.region) continue
    const inRange = near
      ? areNearby(src.square, u.square)
      : areAdjacent(src.square, u.square) && src.square !== u.square
    if (!inRange) continue
    const sameSide = !!u.card.enemy === !!srcCard.enemy
    if (wantFriendly && !sameSide) continue
    if (wantEnemy && sameSide) continue
    out.push(u.id)
  }
  return out
}

function accumPassive(p, acc) {
  if (!p) return
  for (const k of p.keywords || []) acc.keywords.add(k)
  acc.movement += Number(p.movement) || 0
  acc.strength += Number(p.strength) || 0
  acc.ranged += Number(p.ranged) || 0
}

// Every unit's continuous traits, derived from passive abilities (self and
// region-aware auras) plus gameplay grants. A single computed so it recomputes
// once when the board changes and is shared by every reader. Silence removes a
// unit's ability-sourced traits (keywords, movement, strength auras, and even
// granted keywords -- all "non-basic"); a raw strengthMod counter is a stat
// change, not an ability, so it survives. Disable is silence that also strips
// the basics, so the unit can't act at all. Auras from a silenced/disabled
// source stop applying (resolved in one pass; mutual silence isn't chased).
export const effective = computed(() => {
  const cards = state.cards
  const silenced = new Set()
  const disabled = new Set()
  for (const src of Object.values(cards)) {
    for (const a of passivesOf(src)) {
      if (!a.passive.silence && !a.passive.disable) continue
      for (const tid of unitsInScope(src.id, a.scope)) {
        if (a.passive.silence) silenced.add(tid)
        if (a.passive.disable) disabled.add(tid)
      }
    }
  }

  const map = {}
  for (const id of Object.keys(cards)) {
    const disabledHere = disabled.has(id)
    const silencedHere = silenced.has(id) || disabledHere
    const acc = { keywords: new Set(), movement: 0, strength: 0, ranged: 0 }
    if (!silencedHere) {
      for (const a of passivesOf(cards[id])) {
        if (a.scope === 'self') accumPassive(a.passive, acc)
      }
      for (const src of Object.values(cards)) {
        if (src.id === id || silenced.has(src.id) || disabled.has(src.id)) continue
        for (const a of passivesOf(src)) {
          if (a.scope === 'self') continue
          if (unitsInScope(src.id, a.scope).includes(id)) accumPassive(a.passive, acc)
        }
      }
      for (const k of state.grantedKeywords[id] || []) acc.keywords.add(k)
    }
    map[id] = {
      keywords: acc.keywords,
      movement: acc.movement,
      ranged: acc.ranged,
      // The counter persists through silence; passive/aura strength does not.
      strengthMod: acc.strength + (state.strengthMod[id] || 0),
      silenced: silencedHere,
      disabled: disabledHere,
    }
  }
  return map
})

const traits = (id) => effective.value[id] || null

export const effectiveKeywords = (id) => traits(id)?.keywords || new Set()
export const hasKeyword = (id, kw) => !!traits(id)?.keywords?.has(kw)

// Stealth is active only until the unit acts (then the token is lost).
export const isStealthed = (id) => hasKeyword(id, 'stealth') && !state.stealthLost[id]

const oppositeSides = (a, b) => !!state.cards[a]?.enemy !== !!state.cards[b]?.enemy

// A Ward is intact until it absorbs something. It breaks when an opponent's
// spell/ability would target/damage/destroy the warded object.
export const hasWard = (id) => hasKeyword(id, 'ward') && !state.wardBroken[id]
const wardBlocks = (sourceId, targetId) =>
  hasWard(targetId) && oppositeSides(sourceId, targetId)

// Stealth can't be targeted by opponents -- a targeting rule that holds whether
// or not reach is being enforced.
const blockedByStealth = (sourceId, targetId) =>
  isStealthed(targetId) && oppositeSides(sourceId, targetId)
export const effectiveStrengthMod = (id) => traits(id)?.strengthMod || 0
export const effectiveRanged = (id) => traits(id)?.ranged || 0
export const isSilenced = (id) => !!traits(id)?.silenced

// The side a card belongs to.
const sideOf = (id) => (state.cards[id]?.enemy ? 'opponent' : 'player')

// Combat stats: base Power/Life from the card (authored, shown on the art),
// modified in play. An avatar's Life is its side's life total.
export const effectivePower = (id) =>
  (state.cards[id]?.power || 0) + effectiveStrengthMod(id)

// A minion has no separate Life -- its toughness IS its power (damage >= power
// kills it). An optional `defense` overrides toughness for the few cards whose
// attack and defense powers differ; strength boosts raise both. Avatars are the
// exception: their toughness is the side's life total.
export function effectiveLife(id) {
  const c = state.cards[id]
  if (!c) return 0
  if (c.avatar) return state.stats[sideOf(id)]?.life || 0
  const d = c.defense
  const base = d === '' || d == null ? c.power || 0 : Number(d) || 0
  return base + effectiveStrengthMod(id)
}
export const isDisabled = (id) => !!traits(id)?.disabled

// Keywords added during play (not the base ones on the card art), for badging.
export const grantedKeywordsOf = (id) => state.grantedKeywords[id] || []

// Steps a unit may take: base 1, plus passive/granted movement, zeroed by
// Immobile or Disable. Non-units never move.
export function effectiveMovement(id) {
  const e = traits(id)
  if (!e || !isUnit(id)) return 0
  if (e.disabled || e.keywords.has('immobile')) return 0
  return 1 + e.movement
}

// ---------- movement / attack reachability (enforcement) ----------

// A position is a (square, layer) node; layer 'top' is the surface/void, 'bot'
// the subsurface. Reachability is a BFS over legal single steps.
const nodeKey = (sq, layer) => `${sq}:${layer}`

function nodeOf(cardId) {
  const z = zoneOf(cardId)
  let m = /^cell:(\d+):(top|bot)$/.exec(z || '')
  if (m) return { sq: Number(m[1]), layer: m[2] }
  m = /^site:(\d+)$/.exec(z || '')
  if (m) return { sq: Number(m[1]), layer: 'top' }
  return null
}

// Whether a unit with keyword set `kw` may take one step from node F to node G.
// Encodes the movement table: cardinal surface steps for anyone, diagonals for
// Airborne, vertical steps for Burrowing/Submerge, and void entry/exit (cardinal
// only) for Voidwalk.
function canStep(kw, F, G) {
  // Vertical: same square, surface <-> subsurface, gated by the sub-region.
  if (F.sq === G.sq) {
    if (F.layer === G.layer) return false
    const sub = regionOf(F.sq, 'bot')
    if (sub === 'underground') return kw.has('burrowing')
    if (sub === 'underwater') return kw.has('submerge')
    return false
  }
  const cardinal = areAdjacent(F.sq, G.sq)
  const diagonal = areNearby(F.sq, G.sq) && !cardinal
  if (!cardinal && !diagonal) return false
  const regF = regionOf(F.sq, F.layer)
  const regG = regionOf(G.sq, G.layer)
  // Voidwalk directly from the void into an adjacent site's subsurface.
  if (G.layer === 'bot') {
    if (regF !== 'void' || !cardinal || !kw.has('voidwalk')) return false
    if (regG === 'underground') return kw.has('burrowing')
    if (regG === 'underwater') return kw.has('submerge')
    return false
  }
  // Cross-square surface/void steps only leave from a surface/void node.
  if (F.layer !== 'top') return false
  if (regF === 'void' || regG === 'void') return cardinal && kw.has('voidwalk')
  // surface <-> surface: cardinal for anyone, diagonal only while Airborne.
  return cardinal || kw.has('airborne')
}

// Candidate neighbour nodes to test from F: the vertical partner plus both
// layers of every king-adjacent square.
function neighborNodes(F) {
  const out = [{ sq: F.sq, layer: F.layer === 'top' ? 'bot' : 'top' }]
  for (let s = 0; s < GRID_SIZE; s++) {
    if (s !== F.sq && areNearby(F.sq, s)) {
      out.push({ sq: s, layer: 'top' }, { sq: s, layer: 'bot' })
    }
  }
  return out
}

// The set of node keys a unit can reach within its movement, including where it
// stands (so a unit can attack an enemy sharing its square). Empty for a
// disabled unit or one not on the board.
export function reachableNodes(unitId) {
  const set = new Set()
  if (!isUnit(unitId) || isDisabled(unitId)) return set
  const start = nodeOf(unitId)
  if (!start) return set
  const kw = effectiveKeywords(unitId)
  const steps = effectiveMovement(unitId)
  set.add(nodeKey(start.sq, start.layer))
  let frontier = [start]
  for (let d = 0; d < steps; d++) {
    const next = []
    for (const F of frontier) {
      for (const G of neighborNodes(F)) {
        const key = nodeKey(G.sq, G.layer)
        if (!set.has(key) && canStep(kw, F, G)) {
          set.add(key)
          next.push(G)
        }
      }
    }
    frontier = next
  }
  return set
}

// Enforcement is per-puzzle and only bites while playing or recording; the
// editor stays free-form for building positions.
const enforcing = () =>
  state.enforce && (state.mode === 'play' || state.recording)

// May this unit legally move to a board zone? Non-cell destinations aren't
// movement-gated (summoning from hand, etc.).
export function canMoveUnit(unitId, toZone) {
  const m = /^cell:(\d+):(top|bot)$/.exec(toZone || '')
  if (!m) return true
  return reachableNodes(unitId).has(nodeKey(Number(m[1]), m[2]))
}

// May attacker legally attack target: within reach, and past the targeting
// keywords -- Airborne can only be hit by Airborne, Stealth not by opponents.
export function canAttack(attackerId, targetId) {
  if (!isUnit(attackerId) || isDisabled(attackerId)) return false
  const t = nodeOf(targetId)
  if (!t || !reachableNodes(attackerId).has(nodeKey(t.sq, t.layer))) return false
  if (isUnit(targetId)) {
    const atk = effectiveKeywords(attackerId)
    const tgt = effectiveKeywords(targetId)
    if (tgt.has('airborne') && !atk.has('airborne')) return false
    const oppose =
      !!state.cards[attackerId].enemy !== !!state.cards[targetId].enemy
    if (oppose && isStealthed(targetId)) return false
  }
  return true
}

// UI helpers: is a card/zone a legal target of the currently armed action? When
// not enforcing they fall back to the old free-form behaviour (any on-board
// target; every square a move destination).
export function armedAttackLegal(targetId) {
  if (!ui.attacker || ui.attacker === targetId) return false
  if (blockedByStealth(ui.attacker, targetId)) return false
  return enforcing() ? canAttack(ui.attacker, targetId) : true
}

// null = no move armed or not enforcing (no highlight); else whether the armed
// unit may reach this zone.
export function armedMoveLegal(zone) {
  if (!ui.moving || !enforcing()) return null
  return canMoveUnit(ui.moving, zone)
}

// ---------- ranged (line-of-fire) ----------

function unitsOnSquare(idx) {
  const out = []
  for (const layer of ['top', 'bot']) {
    for (const id of state.zones[`cell:${idx}:${layer}`] || []) {
      if (isUnit(id)) out.push(id)
    }
  }
  return out
}

// Units a Ranged shooter can hit: fire a projectile down each of the four
// cardinal lines up to its range, striking the first non-Stealth unit in the
// line (which then blocks it). Stealth units are transparent -- projectiles
// can't hit them and pass through. When several units share the first
// reachable square, all of them are choosable (the square still blocks the
// line beyond it), so the player targets a specific unit in the stack.
export function rangedTargets(shooterId) {
  const set = new Set()
  const range = effectiveRanged(shooterId)
  const start = nodeOf(shooterId)
  if (!range || isDisabled(shooterId) || !start) return set
  const row = Math.floor(start.sq / GRID_COLS)
  const col = start.sq % GRID_COLS
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    for (let step = 1; step <= range; step++) {
      const r = row + dr * step
      const c = col + dc * step
      if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) break
      const hittable = unitsOnSquare(r * GRID_COLS + c).filter(
        (id) => !isStealthed(id)
      )
      if (hittable.length) {
        for (const id of hittable) set.add(id)
        break // the projectile stops at the first square it can hit
      }
    }
  }
  return set
}

export const canShoot = (shooterId, targetId) =>
  rangedTargets(shooterId).has(targetId)

export function armedShootLegal(targetId) {
  if (!ui.shooting || ui.shooting === targetId) return false
  if (blockedByStealth(ui.shooting, targetId)) return false
  return enforcing() ? canShoot(ui.shooting, targetId) : isUnit(targetId)
}

// ---------- combat resolution ----------

const combatActive = () =>
  state.combat && (state.mode === 'play' || state.recording)

// Power a unit actually deals: none while Disabled ("doesn't strike when fighting").
const combatPower = (id) => (isDisabled(id) ? 0 : effectivePower(id))

// One source->target damage instance. A minion accumulates damage (and a lethal
// flag if the source has Lethal); a site or avatar has no toughness, so its
// controller loses that much life instead.
function applyHit(sourceId, targetId, amount, lethalHit) {
  if (amount <= 0) return
  const tgt = state.cards[targetId]
  if (!tgt) return
  if (isUnit(targetId) && !tgt.avatar) {
    state.damage[targetId] = (state.damage[targetId] || 0) + amount
    if (hasKeyword(sourceId, 'lethal')) lethalHit.add(targetId)
  } else {
    adjustStat(sideOf(targetId), 'life', -amount)
  }
}

// Move a unit to its cemetery as a consequence of `entry`: snapshot for undo,
// announce it, and fire Deathrite (and any "when a unit dies" triggers) by
// replaying the death as a realm->cemetery move keyed to the same seq.
function sendToCemetery(unitId, entry, name, text) {
  const from = zoneOf(unitId)
  const side = sideOf(unitId)
  snapshotStructural(entry)
  removeFromZones(state.zones, unitId)
  state.zones[`grave:${side}`].push(unitId)
  shedInPlayState(unitId, `grave:${side}`)
  state.events.push({ id: uid(), seq: entry.seq, cardId: unitId, name, text })
  emitFx('death', { cardId: unitId })
  fireTriggers({ type: 'move', cardId: unitId, from, to: `grave:${side}`, seq: entry.seq })
}

// State-based death after damage: any minion at or over its Life, or hit by a
// Lethal source, dies to its cemetery. Avatars never leave for the cemetery --
// they bleed life and sit at Death's Door on 0. The zoneOf guard skips a unit a
// nested Deathrite already removed, so it is never sent twice.
function resolveDeaths(entry, lethalHit) {
  for (const u of boardUnits()) {
    if (u.card.avatar) continue
    if (!zoneOf(u.id)?.startsWith('cell:')) continue
    const dmg = state.damage[u.id] || 0
    if (!lethalHit.has(u.id) && dmg < Math.max(1, effectiveLife(u.id))) continue
    sendToCemetery(u.id, entry, 'Slain', `${cardName(u.id)} was slain.`)
  }
}

// A fight: both combatants strike simultaneously (a site deals nothing back),
// then deaths resolve together so mutual kills work.
// Lance tokens a unit is carrying: +1 strike damage each and (in a fight) first
// strike, consumed on its strike.
const lanceCount = (id) => carriedBy(id).filter((c) => state.cards[c]?.lanceToken).length
const strikesFirst = (id) => hasKeyword(id, 'firststrike') || lanceCount(id) > 0

// Remove a unit's lances from the realm (orphaned from carry, not sent to a zone).
function breakLances(unitId, entry) {
  const lances = carriedBy(unitId).filter((c) => state.cards[c]?.lanceToken)
  if (!lances.length) return
  snapshotStructural(entry)
  for (const l of lances) delete state.carry[l]
  state.events.push({
    id: uid(),
    seq: entry.seq,
    cardId: unitId,
    name: 'Lance breaks',
    text: `${cardName(unitId)}'s lance breaks.`,
  })
}

function resolveAttack(attackerId, targetId, entry) {
  const aFS = strikesFirst(attackerId)
  const dFS = isUnit(targetId) && strikesFirst(targetId)
  // Lance bonus is added to each striker's damage; capture before the lances break.
  const aDmg = combatPower(attackerId) + lanceCount(attackerId)
  const dDmg = isUnit(targetId) ? combatPower(targetId) + lanceCount(targetId) : 0
  breakLances(attackerId, entry)
  if (isUnit(targetId)) breakLances(targetId, entry)
  // Both or neither strike first -> the usual simultaneous exchange.
  if (aFS === dFS) {
    const lethalHit = new Set()
    applyHit(attackerId, targetId, aDmg, lethalHit)
    if (isUnit(targetId)) applyHit(targetId, attackerId, dDmg, lethalHit)
    resolveDeaths(entry, lethalHit)
    return
  }
  // One strikes first; the other hits back only if it survived that strike.
  const first = aFS ? attackerId : targetId
  const second = aFS ? targetId : attackerId
  const firstDmg = aFS ? aDmg : dDmg
  const secondDmg = aFS ? dDmg : aDmg
  const l1 = new Set()
  applyHit(first, second, firstDmg, l1)
  resolveDeaths(entry, l1)
  if (isUnit(second) && zoneOf(second)?.startsWith('cell:')) {
    const l2 = new Set()
    applyHit(second, first, secondDmg, l2)
    resolveDeaths(entry, l2)
  }
}

// A one-way strike/shoot including its Lance bonus (consumes the lances).
function strikeWithLance(sourceId, targetId, entry) {
  const dmg = combatPower(sourceId) + lanceCount(sourceId)
  breakLances(sourceId, entry)
  resolveHit(sourceId, targetId, dmg, entry)
}

// A one-way hit (strike, shoot, or a damage effect).
function resolveHit(sourceId, targetId, amount, entry) {
  const lethalHit = new Set()
  applyHit(sourceId, targetId, amount, lethalHit)
  resolveDeaths(entry, lethalHit)
}

// The category a card is actually in right now, resolving a carried card to
// wherever its carrier sits (via zoneOf).
export function cardZoneCategory(cardId) {
  return zoneCategory(zoneOf(cardId))
}

// Categories offered in the ability editor's zone / from / to pickers. Order is
// deliberate: the realm first, then the off-board zones roughly as they sit
// around the table.
export const ZONE_CATEGORIES = [
  'realm',
  'aura',
  'storyline',
  'hand',
  'cemetery',
  'collection',
  'banished',
  'atlas',
  'spellbook',
]

// The actions a triggered ability can watch. Mirrors the logged entry `type`s
// (a plain move logs no type, so it is spelled out here as 'move').
export const TRIGGER_ACTIONS = [
  'move',
  'attack',
  'strike',
  'pickup',
  'drop',
  'ability',
  'cast',
  'damage',
]

// The structured effect ops an ability can carry, for the editor's picker.
export const EFFECT_OPS = [
  'adjustStat',
  'tap',
  'dealDamage',
  'gridDamage',
  'modifyStrength',
  'grantKeyword',
  'move',
  'destroy',
  'banish',
  'bounce',
  'heal',
  'grantFrom',
  'release',
]

// Authoring options for a grid target.
export const TARGET_MODES = ['card', 'grid']
export const GRID_ORIGINS = ['self', 'pick']
export const GRID_SHAPES = ['location', 'adjacent', 'nearby']
// Card-target restrictions relative to the source, and by side.
export const TARGET_WITHIN = ['any', 'adjacent', 'nearby']
export const TARGET_SIDES = ['any', 'friendly', 'enemy']
// Where a `move` effect sends its subject.
export const LOCATION_REFS = ['sourceLocation', 'targetLocation']
// How a damage/strength amount is computed.
export const AMOUNT_REFS = ['literal', 'carriedCount']

// Whose action fires a trigger: the card's own move, anyone's, or one side's.
export const TRIGGER_SUBJECTS = ['self', 'any', 'enemy', 'friendly']

// What a grant-style ability's gained abilities are lost to (Layer 4). 'never'
// keeps them for good.
export const LOSE_CONDITIONS = ['never', 'damaged', 'dies', 'leaves-realm', 'taps']

// Card-kind filter for a target picker. 'unit' = avatar or minion; 'minion' =
// non-avatar unit; 'monument' = an artifact that can't be carried.
export const TARGET_FILTERS = [
  'any',
  'unit',
  'minion',
  'avatar',
  'site',
  'aura',
  'artifact',
  'monument',
]

// Boolean keyword abilities a passive can grant. Base ones live on the card art
// (authored here only so the engine can enforce them); granted ones are badged.
// Ranged is deliberately absent -- it carries a value and is an activated ability.
export const KEYWORDS = [
  'airborne',
  'burrowing',
  'submerge',
  'voidwalk',
  'immobile',
  'stealth',
  'spellcaster',
  'lethal',
  'firststrike',
  'ward',
  'charge',
]

// Who a passive ability affects. Area scopes are region-aware (same region as the
// source) and exclude the source itself. nearby = 8 surrounding squares (king),
// adjacent = 4 cardinal squares.
export const PASSIVE_SCOPES = [
  'self',
  'nearby',
  'adjacent',
  'nearby-friendly',
  'nearby-enemy',
  'adjacent-friendly',
  'adjacent-enemy',
]

// Coerce any stored/partial ability into the full shape the editor and runtime
// expect, so older files and hand-edited JSON never surface an undefined nested
// field. Also used to build a fresh ability (pass just { kind }).
export function normalizeAbility(a = {}) {
  const kind = ['triggered', 'passive'].includes(a.kind) ? a.kind : 'activated'
  return {
    id: a.id || uid(),
    kind,
    name: a.name || '',
    text: a.text || '',
    zones: Array.isArray(a.zones) ? [...a.zones] : ['realm'],
    // Passive-only: who it affects, and what continuous modifier it applies.
    scope: PASSIVE_SCOPES.includes(a.scope) ? a.scope : 'self',
    passive: {
      keywords: Array.isArray(a.passive?.keywords) ? [...a.passive.keywords] : [],
      movement: Number(a.passive?.movement) || 0,
      strength: Number(a.passive?.strength) || 0,
      ranged: Number(a.passive?.ranged) || 0,
      silence: !!a.passive?.silence,
      disable: !!a.passive?.disable,
    },
    trigger: {
      action: a.trigger?.action || 'move',
      from: a.trigger?.from || 'any',
      to: a.trigger?.to || 'any',
      subject: a.trigger?.subject || 'self',
    },
    cost: {
      mana: Number(a.cost?.mana) || 0,
      tap: !!a.cost?.tap,
      // Elemental threshold required (checked, not spent) -- used by spell casts.
      threshold: {
        air: Number(a.cost?.threshold?.air) || 0,
        earth: Number(a.cost?.threshold?.earth) || 0,
        fire: Number(a.cost?.threshold?.fire) || 0,
        water: Number(a.cost?.threshold?.water) || 0,
      },
    },
    target: {
      required: !!a.target?.required,
      // Optional ("may"): the player can decline the target. Its target effects
      // are then skipped while the ability's other effects still resolve -- e.g.
      // "you may give a minion +2 power. Draw a card." always draws.
      optional: !!a.target?.optional,
      // 'card' = pick a card in a zone; 'grid' = a location/area on the realm.
      mode: a.target?.mode === 'grid' ? 'grid' : 'card',
      from: a.target?.from || 'realm',
      filter: a.target?.filter || 'any',
      // card-mode restrictions: relative to the source and by side.
      within: TARGET_WITHIN.includes(a.target?.within) ? a.target.within : 'any',
      side: TARGET_SIDES.includes(a.target?.side) ? a.target.side : 'any',
      // grid-mode: where the area starts, how far you may aim, its shape, and
      // whether it punches through both layers (square-based) or just the
      // source's layer.
      origin: a.target?.origin === 'pick' ? 'pick' : 'self',
      range: Number(a.target?.range) || 0,
      shape: ['location', 'adjacent', 'nearby'].includes(a.target?.shape)
        ? a.target.shape
        : 'location',
      throughLayers: !!a.target?.throughLayers,
      prompt: a.target?.prompt || '',
    },
    effects: Array.isArray(a.effects) ? clone(a.effects) : [],
    loseWhen: a.loseWhen || 'never',
  }
}

export function addAbility(cardId, kind = 'activated') {
  const card = state.cards[cardId]
  if (!card) return
  if (!Array.isArray(card.abilities)) card.abilities = []
  const ability = normalizeAbility({ kind })
  card.abilities.push(ability)
  return ability.id
}

export function removeAbility(cardId, abilityId) {
  const card = state.cards[cardId]
  if (!Array.isArray(card?.abilities)) return
  card.abilities = card.abilities.filter((a) => a.id !== abilityId)
}

// Toggle membership of a category in an ability's `zones` list -- the editor's
// "where is it usable" checkboxes.
export function toggleAbilityZone(ability, category) {
  const i = ability.zones.indexOf(category)
  if (i === -1) ability.zones.push(category)
  else ability.zones.splice(i, 1)
}

// Toggle a keyword in a passive ability's granted-keyword list.
export function togglePassiveKeyword(ability, keyword) {
  const list = ability.passive.keywords
  const i = list.indexOf(keyword)
  if (i === -1) list.push(keyword)
  else list.splice(i, 1)
}

// A fresh effect of the given op, with the params that op reads defaulted.
function newEffect(op = 'adjustStat') {
  const e = { op }
  if (op === 'adjustStat') Object.assign(e, { side: 'self', key: 'mana', delta: 0 })
  if (op === 'tap') e.who = 'self'
  if (op === 'dealDamage') Object.assign(e, { who: 'target', amount: 1, amountRef: 'literal' })
  if (op === 'gridDamage') Object.assign(e, { amount: 1, amountRef: 'literal' })
  if (op === 'modifyStrength') Object.assign(e, { who: 'target', amount: 1 })
  if (op === 'grantKeyword') Object.assign(e, { who: 'target', keyword: 'airborne' })
  if (op === 'move') Object.assign(e, { who: 'target', to: 'sourceLocation' })
  if (op === 'destroy' || op === 'banish' || op === 'bounce') e.who = 'target'
  if (op === 'heal') e.who = 'self'
  return e
}

export function addEffect(ability, op = 'adjustStat') {
  if (!Array.isArray(ability.effects)) ability.effects = []
  ability.effects.push(newEffect(op))
}

export function removeEffect(ability, i) {
  ability.effects.splice(i, 1)
}

// Re-default an effect's params when its op changes in the editor, so a stale
// param from the previous op doesn't linger.
export function retypeEffect(ability, i, op) {
  ability.effects.splice(i, 1, newEffect(op))
}

// ---------- damage counters ----------

export function damageOf(cardId) {
  return state.damage?.[cardId] || 0
}

export function adjustDamage(cardId, delta) {
  const next = Math.max(0, damageOf(cardId) + delta)
  if (next) state.damage[cardId] = next
  else delete state.damage[cardId]
}

// Every dragstart in the app goes through here: it arms the drag flag the
// board reads to decide whether its zones are listening, then sets the ghost.
export function beginDrag(e, imgEl, width) {
  ui.dragging = true
  setDragGhost(e, imgEl, width)
}

export function endDrag() {
  ui.dragging = false
}

// Use the card's artwork as the drag image: the default ghost is a snapshot
// of the element, which is invisible for the site handle and gets clipped by
// the cell's overflow for board cards. Drawn onto a fixed-size canvas from an
// already-rendered <img>, because a freshly created img may not be decoded at
// dragstart and would fall back to its huge natural size.
export function setDragGhost(e, imgEl, width = 90) {
  if (!imgEl?.naturalWidth) return
  const h = Math.round((width * imgEl.naturalHeight) / imgEl.naturalWidth)
  const c = document.createElement('canvas')
  c.width = width
  c.height = h
  c.getContext('2d').drawImage(imgEl, 0, 0, width, h)
  c.style.cssText = 'position:fixed;top:-1000px;left:-1000px;'
  document.body.appendChild(c)
  try {
    e.dataTransfer.setDragImage(c, width / 2, h / 2)
  } catch {
    // A card image served from another origin (a CDN in front of the Media
    // Library) taints the canvas; fall back to the browser's default ghost
    // rather than breaking the drag.
  }
  setTimeout(() => c.remove(), 0)
}

// ---------- moves ----------

// Site cards dropped anywhere on a square land in its site slot; non-site
// cards dropped on a site slot land on the surface instead.
function routeZone(cardId, to) {
  const card = state.cards[cardId]
  const cellMatch = /^cell:(\d+):(top|bot)$/.exec(to)
  if (cellMatch) return card?.site ? `site:${cellMatch[1]}` : to
  const siteMatch = /^site:(\d+)$/.exec(to)
  if (siteMatch) return card?.site ? to : `cell:${siteMatch[1]}:top`
  return to
}

function areAdjacent(idxA, idxB) {
  idxA = Number(idxA)
  idxB = Number(idxB)
  const rowA = Math.floor(idxA / GRID_COLS)
  const colA = idxA % GRID_COLS
  const rowB = Math.floor(idxB / GRID_COLS)
  const colB = idxB % GRID_COLS
  return Math.abs(rowA - rowB) + Math.abs(colA - colB) <= 1
}

// "Nearby" = the up-to-8 surrounding squares (king move, diagonals included),
// distinct from "adjacent" (the 4 cardinal squares). Excludes the square itself.
export function areNearby(idxA, idxB) {
  idxA = Number(idxA)
  idxB = Number(idxB)
  if (idxA === idxB) return false
  const dr = Math.abs(Math.floor(idxA / GRID_COLS) - Math.floor(idxB / GRID_COLS))
  const dc = Math.abs((idxA % GRID_COLS) - (idxB % GRID_COLS))
  return dr <= 1 && dc <= 1
}

// All units of one side currently on the board, tagged with the square they
// sit in, surface and below both.
function unitsOnBoard(isEnemySide) {
  const units = []
  for (let i = 0; i < GRID_SIZE; i++) {
    for (const slot of [`cell:${i}:top`, `cell:${i}:bot`]) {
      for (const id of state.zones[slot] || []) {
        const c = state.cards[id]
        if (c && isUnit(c) && (isEnemySide ? c.enemy : !c.enemy)) {
          units.push({ id, card: c, cellIdx: i })
        }
      }
    }
  }
  return units
}

function findSitePlayerUnit(side, siteZone) {
  const candidates = unitsOnBoard(side === 'opponent')
  if (!candidates.length) return null
  const m = /^site:(\d+)$/.exec(siteZone)
  const targetIdx = m ? Number(m[1]) : -1
  const nearTarget = (u) => targetIdx !== -1 && areAdjacent(u.cellIdx, targetIdx)

  // 1. Prefer Avatars, closest to the site if we know where it is.
  const avatars = candidates.filter((u) => isAvatar(u.card))
  if (avatars.length) return (avatars.find(nearTarget) || avatars[0]).id
  // 2. A unit on/adjacent to the site square, else 3. any friendly unit.
  return (candidates.find(nearTarget) || candidates[0]).id
}

// Whether a card may land in `to` (already routed). Enforces the per-zone
// limits: no dropping into the pool while playing, one site per square, and
// only aura cards on an intersection, one per crossing.
function canPlace(cardId, to) {
  if (!state.zones[to]) return false
  if (state.mode === 'play' && to === 'pool') return false
  if (to.startsWith('site:') && state.zones[to].length) return false
  if (to.startsWith('aura:')) {
    const card = state.cards[cardId]
    if (!card?.aura || state.zones[to].length) return false
  }
  return true
}

// In the editor the pool is a palette: dragging a card out places a copy and
// the original stays in the pool, so one upload can be used many times.
function placePoolCopy(cardId, to) {
  const card = state.cards[cardId]
  if (!card) return
  const copyId = uid()
  // Deep clone, not a spread: the card carries nested arrays (abilities, and
  // their effects/zones) that a shallow copy would share by reference, so
  // editing one placed copy's ability would silently change every other.
  const copy = clone(card)
  copy.id = copyId
  state.cards[copyId] = copy
  state.zones[to].push(copyId)
}

// Tapping that a move can trigger. A unit moved cell-to-cell via the dedicated
// "Move" action taps; ordinary moves (spells, abilities, placement) do not.
// Playing a site from off-board taps the controlling unit / avatar instead.
function applyMoveTaps(card, from, to, shouldTap) {
  if (!card) return
  if (
    isUnit(card) &&
    shouldTap &&
    from.startsWith('cell:') &&
    to.startsWith('cell:')
  ) {
    state.tapped[card.id] = true
  }
  if (card.site && !from.startsWith('site:') && to.startsWith('site:')) {
    const side = from.includes('opponent') || card.enemy ? 'opponent' : 'player'
    const unitId = findSitePlayerUnit(side, to)
    if (unitId) state.tapped[unitId] = true
  }
}

// Leaving the realm makes a card a fresh object: it sheds every in-play change
// -- damage counters, strength counters, keywords granted during play, and the
// once-per-life Ward/Stealth flags -- and untaps. Called wherever a card is put
// into a non-realm zone; a no-op when it lands back in the realm (or never had
// any of this state). Undo-safe as long as the causing entry already snapshotted
// these maps (prevDamage/prevStrengthMod/... in logEntry), so clear only after.
function shedInPlayState(cardId, toZone) {
  if (zoneCategory(toZone) === 'realm') return
  delete state.damage[cardId]
  delete state.strengthMod[cardId]
  delete state.grantedKeywords[cardId]
  delete state.wardBroken[cardId]
  delete state.stealthLost[cardId]
  delete state.summoned[cardId]
  delete state.tapped[cardId]
}

export function moveCard(cardId, from, to, opts = {}) {
  return withEditorSiteMana(() => moveCardImpl(cardId, from, to, opts))
}

function moveCardImpl(cardId, from, to, { tapOnMove } = {}) {
  // A carried card has no zone of its own, so it cannot be moved out of one:
  // it has to be put down first. Bailing here rather than letting the splice
  // below fail also keeps it out of the pool branch, which would otherwise
  // answer a move request by placing a *copy* of it.
  if (state.carry[cardId]) return
  to = routeZone(cardId, to)
  if (from === to || !canPlace(cardId, to)) return
  // When enforcing, a unit can only step cell-to-cell within its reach. Other
  // relocations (summoning from hand, editor placement) are not movement steps.
  if (
    enforcing() &&
    isUnit(cardId) &&
    from.startsWith('cell:') &&
    to.startsWith('cell:') &&
    !canMoveUnit(cardId, to)
  )
    return
  if (from === 'pool' && state.mode === 'editor' && !state.recording) {
    placePoolCopy(cardId, to)
    return
  }
  const src = state.zones[from]
  const i = src?.indexOf(cardId) ?? -1
  if (i === -1) return
  const prevTapped = clone(state.tapped)
  src.splice(i, 1)
  state.zones[to].push(cardId)

  const card = state.cards[cardId]
  const shouldTap = tapOnMove || ui.moving === cardId
  ui.moving = null
  applyMoveTaps(card, from, to, shouldTap)

  logEntry({ cardId, from, to, prevTapped })
  // After the entry snapshots the pre-move maps, a unit that left the realm
  // sheds its in-play state (damage, strength, granted keywords, ward, ...).
  shedInPlayState(cardId, to)
}

// ---------- moves, attacks & strikes ----------

export function beginMove(cardId) {
  ui.moving = ui.moving === cardId ? null : cardId
  ui.attacker = null
  ui.striker = null
  ui.carrier = null
  ui.activating = null
  ui.shooting = null
  ui.intercepting = null
}

// Attacks and strikes don't change the board; they are logged as their own entry types
// so a solution can require them in sequence with moves.
export function beginAttack(cardId) {
  ui.attacker = ui.attacker === cardId ? null : cardId
  ui.awaitingDefender = null
  ui.striker = null
  ui.moving = null
  ui.carrier = null
  ui.activating = null
  ui.shooting = null
  ui.intercepting = null
}

export function beginStrike(cardId) {
  ui.striker = ui.striker === cardId ? null : cardId
  ui.attacker = null
  ui.moving = null
  ui.carrier = null
  ui.activating = null
  ui.shooting = null
  ui.intercepting = null
}

// Ranged: tap to fire at a unit in line of sight. Its own armed slot, mutually
// exclusive with the other actions like attack/strike.
export function beginShoot(cardId) {
  ui.shooting = ui.shooting === cardId ? null : cardId
  ui.attacker = null
  ui.striker = null
  ui.moving = null
  ui.carrier = null
  ui.activating = null
  ui.intercepting = null
}

export function targetShoot(targetId) {
  if (!ui.shooting || ui.shooting === targetId) return
  const shooterId = ui.shooting
  if (blockedByStealth(shooterId, targetId)) return
  if (enforcing() && !canShoot(shooterId, targetId)) return
  const prevTapped = clone(state.tapped)
  if (isUnit(shooterId)) state.tapped[shooterId] = true
  const entry = { type: 'shoot', cardId: shooterId, targetId, prevTapped }
  logEntry(entry)
  emitFx('projectile', { sourceId: shooterId, targetId })
  if (combatActive()) strikeWithLance(shooterId, targetId, entry)
  ui.shooting = null
}

// Intercept: a unit steps in to fight an enemy (one moving past, say). Its own
// armed slot; unlike a plain Attack, a Ranged or Airborne unit may intercept an
// Airborne enemy.
export function beginIntercept(cardId) {
  ui.intercepting = ui.intercepting === cardId ? null : cardId
  ui.attacker = null
  ui.striker = null
  ui.moving = null
  ui.carrier = null
  ui.activating = null
  ui.shooting = null
}

// Y may intercept X: opposing units, X within Y's reach, and -- if X is Airborne
// -- Y is Airborne or Ranged.
export function canIntercept(interceptorId, targetId) {
  if (!isUnit(interceptorId) || isDisabled(interceptorId) || !isUnit(targetId)) return false
  const iCard = state.cards[interceptorId]
  const tCard = state.cards[targetId]
  if (!iCard || !tCard || !!iCard.enemy === !!tCard.enemy) return false
  if (isStealthed(targetId)) return false // Stealth can't be intercepted
  const t = nodeOf(targetId)
  if (!t || !reachableNodes(interceptorId).has(nodeKey(t.sq, t.layer))) return false
  if (hasKeyword(targetId, 'airborne')) {
    return hasKeyword(interceptorId, 'airborne') || effectiveRanged(interceptorId) > 0
  }
  return true
}

export function armedInterceptLegal(targetId) {
  if (!ui.intercepting || ui.intercepting === targetId) return false
  if (blockedByStealth(ui.intercepting, targetId)) return false
  return enforcing() ? canIntercept(ui.intercepting, targetId) : isUnit(targetId)
}

export function targetIntercept(targetId) {
  if (!ui.intercepting || ui.intercepting === targetId) return
  const interceptorId = ui.intercepting
  if (blockedByStealth(interceptorId, targetId)) return
  if (enforcing() && !canIntercept(interceptorId, targetId)) return
  const prevTapped = clone(state.tapped)
  if (isUnit(interceptorId)) state.tapped[interceptorId] = true
  const entry = { type: 'intercept', cardId: interceptorId, targetId, prevTapped }
  logEntry(entry)
  if (combatActive()) resolveAttack(interceptorId, targetId, entry)
  ui.intercepting = null
}

export function targetAttack(targetId) {
  if (!ui.attacker || ui.attacker === targetId) return
  const attackerId = ui.attacker
  if (blockedByStealth(attackerId, targetId)) return
  // Illegal target while enforcing: ignore the click, keep the attack armed so
  // the player can pick a legal one.
  if (enforcing() && !canAttack(attackerId, targetId)) return
  // With combat on: the opponent defends automatically (its own AI), while a
  // player-side target still prompts the solver to choose.
  if (combatActive()) {
    const target = state.cards[targetId]
    if (target?.enemy) {
      performAttack(attackerId, targetId, chooseAutoDefender(attackerId, targetId))
      return
    }
    if (legalDefenders(attackerId, targetId).length) {
      ui.awaitingDefender = { attackerId, targetId }
      ui.attacker = null
      return
    }
  }
  performAttack(attackerId, targetId, null)
}

// Move a unit onto the target's square to engage it -- the "move" half of Move &
// Attack (and a defender stepping in to interpose). Recorded on the entry so undo
// puts it back. Only while enforcing, where reach makes the move legal.
function engageMove(unitId, targetId, entry) {
  const from = zoneOf(unitId)
  if (!from?.startsWith('cell:')) return
  const t = nodeOf(targetId)
  if (!t || !reachableNodes(unitId).has(nodeKey(t.sq, t.layer))) return
  const to = `cell:${t.sq}:${t.layer}`
  if (from === to) return
  const src = state.zones[from]
  const i = src.indexOf(unitId)
  if (i === -1) return
  snapshotStructural(entry)
  src.splice(i, 1)
  state.zones[to].push(unitId)
}

// Carry out an attack: the attacker moves to engage and taps, an interposing
// defender moves in and taps too, then the fight resolves.
function performAttack(attackerId, targetId, defenderId) {
  const prevTapped = clone(state.tapped)
  if (isUnit(attackerId)) state.tapped[attackerId] = true
  if (defenderId && isUnit(defenderId)) state.tapped[defenderId] = true
  const entry = {
    type: 'attack',
    cardId: attackerId,
    targetId,
    defenderId: defenderId || null,
    prevTapped,
  }
  // Move to engage is the "Move" half of the action -- always happens when the
  // unit can reach the target (independent of the combat/enforce flags).
  engageMove(attackerId, targetId, entry)
  if (defenderId) engageMove(defenderId, targetId, entry)
  logEntry(entry)
  if (defenderId) {
    state.events.push({
      id: uid(),
      seq: entry.seq,
      cardId: defenderId,
      name: 'Defends',
      text: `${cardName(defenderId)} defends ${cardName(targetId)}.`,
    })
  }
  if (combatActive()) resolveAttack(attackerId, defenderId || targetId, entry)
  ui.attacker = null
  ui.awaitingDefender = null
}

// Units on the target's side that could move to it (reach), and so may defend
// it. An Airborne attacker can only be met by Airborne or Ranged defenders.
export function legalDefenders(attackerId, targetId) {
  const target = state.cards[targetId]
  const tnode = nodeOf(targetId)
  if (!target || !tnode) return []
  if (isStealthed(attackerId)) return [] // a Stealth attacker can't be defended against
  const attackerAirborne = hasKeyword(attackerId, 'airborne')
  const out = []
  for (const u of boardUnits()) {
    if (u.id === targetId || u.id === attackerId) continue
    if (!!u.card.enemy !== !!target.enemy) continue // same side as the target
    if (!reachableNodes(u.id).has(nodeKey(tnode.sq, tnode.layer))) continue
    if (attackerAirborne && !(hasKeyword(u.id, 'airborne') || effectiveRanged(u.id) > 0))
      continue
    out.push(u.id)
  }
  return out
}

// How much the opponent prizes keeping a unit. Win-conditions (can kill the
// player's avatar) and guards (can reach its own avatar) are the crown jewels;
// then raw stats. Default weights -- tune here.
const DEF_THREAT = 1000
const DEF_BLOCKER = 500

// The opponent's avatar on the board, if any.
function oppAvatarUnit() {
  for (const u of boardUnits()) if (u.card.avatar && u.card.enemy) return u
  return null
}

// Could this unit reach the given avatar's square (i.e. defend it)?
function canReachAvatar(unitId, avatarUnit) {
  const a = avatarUnit && nodeOf(avatarUnit.id)
  return !!a && reachableNodes(unitId).has(nodeKey(a.sq, a.layer))
}

function defenderValue(id, avatarUnit) {
  const pLife = state.stats.player?.life || 0
  const threat = effectivePower(id) >= pLife && pLife > 0 ? DEF_THREAT : 0
  const blocker = canReachAvatar(id, avatarUnit) ? DEF_BLOCKER : 0
  return threat + blocker + effectivePower(id) * 10 + effectiveLife(id)
}

// Is the opponent avatar facing a lethal swing right now? Then avatar-capable
// units are reserved and won't be spent defending lesser things.
function avatarUnderThreat(avatarUnit) {
  const a = avatarUnit && nodeOf(avatarUnit.id)
  if (!a) return false
  const life = state.stats.opponent.life
  for (const u of boardUnits()) {
    if (u.card.enemy) continue // player-side attackers only
    if (effectivePower(u.id) >= life && reachableNodes(u.id).has(nodeKey(a.sq, a.layer)))
      return true
  }
  return false
}

// The opponent's auto-defence: which defender (if any) it interposes. Deterministic
// so a solution replays the same way. It spends the most expendable legal unit,
// keeps threats and avatar-guards, and -- while its avatar is under a lethal
// threat -- reserves every avatar-capable unit (so stripping its guards works).
function chooseAutoDefender(attackerId, targetId) {
  const target = state.cards[targetId]
  if (!target) return null
  const defenders = legalDefenders(attackerId, targetId)
  if (!defenders.length) return null
  const avatar = oppAvatarUnit()
  const apow = effectivePower(attackerId)
  const lethal = hasKeyword(attackerId, 'lethal')
  const value = (id) => defenderValue(id, avatar)
  const cheapestFirst = [...defenders].sort((a, b) => value(a) - value(b) || (a < b ? -1 : 1))

  // Life-loss attack (avatar/site): block to avoid Death's Door, or block free.
  if (target.avatar || target.site) {
    const chosen = cheapestFirst[0]
    const critical = state.stats[sideOf(targetId)].life - apow <= 0
    const survives = effectiveLife(chosen) > apow && !lethal
    return critical || survives ? chosen : null
  }

  // Minion attack: trade only with a strictly cheaper unit, and only when the
  // trade is good (the defender survives, or it saves something much bigger).
  if (!isUnit(targetId)) return null
  const threatened = avatarUnderThreat(avatar)
  const mval = value(targetId)
  for (const d of cheapestFirst) {
    if (value(d) >= mval) break // nothing cheaper than what we'd save
    if (threatened && canReachAvatar(d, avatar)) continue // reserved for the avatar
    const survives = effectiveLife(d) > apow && !lethal
    if (survives || mval - value(d) >= DEF_BLOCKER) return d
  }
  return null
}

export function armedDefendLegal(cardId) {
  if (!ui.awaitingDefender) return false
  const { attackerId, targetId } = ui.awaitingDefender
  return legalDefenders(attackerId, targetId).includes(cardId)
}

export function chooseDefender(defenderId) {
  if (!ui.awaitingDefender || !armedDefendLegal(defenderId)) return
  const { attackerId, targetId } = ui.awaitingDefender
  performAttack(attackerId, targetId, defenderId)
}

export function declineDefender() {
  if (!ui.awaitingDefender) return
  const { attackerId, targetId } = ui.awaitingDefender
  performAttack(attackerId, targetId, null)
}

// ---------- carrying ----------

// What this card is holding, outermost first. Derived from state.carry rather
// than stored on the carrier so there is only one place to keep consistent.
export function carriedBy(cardId) {
  return Object.keys(state.carry).filter((id) => state.carry[id] === cardId)
}

export function carrierOf(cardId) {
  return state.carry[cardId] || null
}

// Would picking targetId up with carrierId close a loop? Walk the carrier's
// own chain of holders: if the target is anywhere in it, refuse.
function wouldCycle(carrierId, targetId) {
  for (let n = carrierId, hops = 0; n && hops < 64; n = state.carry[n], hops++) {
    if (n === targetId) return true
  }
  return false
}

// Where a dropped card lands. Normally the carrier's own zone, but an
// intersection holds one aura and nothing else, so anything else dropped by an
// aura goes to the square up and left of the crossing.
function dropTarget(itemId, zone) {
  const card = state.cards[itemId]
  const auraMatch = /^aura:(\d+)$/.exec(zone)
  if (auraMatch) {
    if (card?.aura && !state.zones[zone].length) return zone
    const i = Number(auraMatch[1])
    const r = Math.floor(i / INTERSECTION_COLS)
    const c = i % INTERSECTION_COLS
    return `cell:${r * GRID_COLS + c}:top`
  }
  const routed = routeZone(itemId, zone)
  const siteMatch = /^site:(\d+)$/.exec(routed)
  if (siteMatch && state.zones[routed].length) {
    return `cell:${siteMatch[1]}:top`
  }
  return routed
}

// Monotonic tag stamped on every logged entry so a fired event can point back
// at the move that produced it. Reset points don't need to reset it -- it only
// has to be unique within the live moves/draft list, and undo matches on it.
let entrySeq = 0

function logEntry(entry) {
  if (!state.recording && state.mode !== 'play') return
  entry.seq = ++entrySeq
  // Ensure the reversible snapshots exist before any trigger effect runs, so
  // undo can refund stat/tap/damage changes a trigger causes. They are captured
  // post-base-action but pre-trigger, which is exactly what undo needs to peel
  // the triggers off before reversing the base action structurally.
  if (!entry.prevTapped) entry.prevTapped = clone(state.tapped)
  if (!entry.prevStats) entry.prevStats = clone(state.stats)
  if (!entry.prevDamage) entry.prevDamage = clone(state.damage)
  if (!entry.prevStrengthMod) entry.prevStrengthMod = clone(state.strengthMod)
  if (!entry.prevGrantedKeywords)
    entry.prevGrantedKeywords = clone(state.grantedKeywords)
  if (!entry.prevSummoned) entry.prevSummoned = clone(state.summoned)
  if (!entry.prevStealthLost) entry.prevStealthLost = clone(state.stealthLost)
  if (!entry.prevWardBroken) entry.prevWardBroken = clone(state.wardBroken)
  // A card played from hand into the realm is summoned this turn (Charge).
  if (
    (entry.type || 'move') === 'move' &&
    zoneCategory(entry.from) === 'hand' &&
    zoneCategory(entry.to) === 'realm'
  ) {
    state.summoned[entry.cardId] = true
  }
  // Acting interacts with the realm, so a Stealth unit drops its token. The
  // decision that used its stealth (e.g. an undefendable attack) already ran.
  if (entry.cardId && hasKeyword(entry.cardId, 'stealth')) {
    state.stealthLost[entry.cardId] = true
  }
  if (state.recording) {
    state.draft.push(entry)
  } else {
    state.moves.push(entry)
    state.checked = false
  }
  fireTriggers(entry)
  checkGrantLoss(entry)
  checkSurvival(entry)
}

// ---------- triggered abilities ----------

// Whether the card that performed `entry` stands in the right relation to the
// ability's owner for the trigger's subject.
function subjectMatches(subject, owner, actingId) {
  if (subject === 'any') return true
  if (subject === 'self') return owner.id === actingId
  const acting = state.cards[actingId]
  if (!acting) return false
  const sameSide = !!acting.enemy === !!owner.enemy
  return subject === 'friendly' ? sameSide : !sameSide
}

// Does a logged entry satisfy a triggered ability's condition? Zone parts are
// compared as categories, and a wildcard ('any') side matches an entry that has
// no such zone (an attack has neither from nor to, for instance).
function triggerMatches(trigger, owner, entry) {
  if (trigger.action !== (entry.type || 'move')) return false
  if (!subjectMatches(trigger.subject, owner, entry.cardId)) return false
  if (trigger.from !== 'any' && zoneCategory(entry.from) !== trigger.from)
    return false
  if (trigger.to !== 'any' && zoneCategory(entry.to) !== trigger.to)
    return false
  return true
}

// ---------- the storyline (trigger resolution stack) ----------
//
// Abilities do not resolve the instant they trigger; they go onto the storyline
// and resolve from it in order. A new event created while one is resolving
// interrupts -- it is inserted to resolve next (rulebook: "new events interrupt
// the storyline"). And an event whose source has since left the realm is ignored
// ("source is no longer in the realm"). Resolution is automatic here: there are
// no player choices in an ability's resolution yet (a triggered ability targets
// the card that set it off), so the whole stack drains within the causing entry
// -- which keeps undo working, since every effect still snapshots onto that root
// entry exactly as before.

// The stack being drained right now, or null when idle. A nested trigger (a
// death mid-resolution, say) sees this set and unshifts onto it to interrupt.
let storyStack = null

// The events one logged entry sets off: one per matching triggered ability. The
// `entry` carried is the object effects snapshot onto (the root causing entry),
// so reversal is unchanged.
// A card only reacts to others' actions while it is live where its ability
// works (normally the realm) -- a card sitting in the pool, hand or cemetery is
// not in play and must not fire. Self-triggers are already gated by card id in
// triggerMatches, so a card acting on itself (a genesis as it enters) is fine.
function triggerLive(owner, ability) {
  if (ability.trigger.subject === 'self') return true
  const cat = cardZoneCategory(owner.id)
  // On-board reactors (a unit/site in the realm, or an aura on the mat) are live.
  // A card in the pool/hand/cemetery is not, unless its ability lists that zone.
  return cat === 'realm' || cat === 'aura' || (ability.zones || []).includes(cat)
}

function collectTriggers(entry) {
  const out = []
  for (const owner of Object.values(state.cards)) {
    if (!owner.abilities?.length) continue
    for (const a of owner.abilities) {
      if (a.kind !== 'triggered') continue
      if (!triggerMatches(a.trigger, owner, entry)) continue
      if (!triggerLive(owner, a)) continue
      out.push({ ownerId: owner.id, ability: a, triggeringId: entry.cardId, entry })
    }
  }
  return out
}

// Source-left-realm: a queued ability is ignored if its owner is no longer in
// the realm -- UNLESS it is a departure trigger (fires on the owner reaching the
// cemetery or banished zone, i.e. Deathrite), which is meant to resolve after
// the owner has left.
function sourceGone(ev) {
  const to = ev.ability.trigger.to
  // Departure triggers (Deathrite) are meant to resolve after the owner leaves.
  if (to === 'cemetery' || to === 'banished') return false
  // Otherwise the event is ignored once its source has left the board (it is no
  // longer in the realm nor an aura on the mat).
  const cat = cardZoneCategory(ev.ownerId)
  return cat !== 'realm' && cat !== 'aura'
}

// Cards a triggered ability could target, evaluated from its owner.
function triggerTargets(ownerId, ability) {
  return Object.keys(state.cards).filter(
    (id) => id !== ownerId && satisfiesTarget(ownerId, id, ability.target)
  )
}

// Does resolving this triggered event need the player to pick a target/square?
// Only when the author gave the ability a required card target (with legal
// choices) or a picked grid origin.
function needsChoice(ev) {
  const t = ev.ability.target
  if (t.mode === 'grid' && t.origin === 'pick') return true
  if (t.mode === 'card' && t.required)
    return triggerTargets(ev.ownerId, ev.ability).length > 0
  return false
}

function logStoryEvent(ev, ignored) {
  const a = ev.ability
  state.events.push({
    id: uid(),
    seq: ev.entry.seq,
    cardId: ev.ownerId,
    triggeringId: ev.triggeringId,
    abilityId: a.id,
    name: a.name || 'Ability',
    text: a.text || a.name || 'Triggered ability',
    status: ignored ? 'ignored' : 'resolved',
  })
}

// The target a triggered ability resolves against when the player is not asked
// to pick: the card that set it off. But an *optional* card target with no legal
// pick resolves as "no target" -- its `who: target` effects are skipped and the
// rest of the ability (draw a card, etc.) still runs.
function autoTarget(ev) {
  const t = ev.ability.target
  if (t.mode === 'card' && t.required && t.optional) return null
  return ev.triggeringId
}

// Drain the storyline. Resumable: if an event needs a player choice, it pauses
// (leaving the rest on storyStack) and returns; resolveStoryChoice runs the
// choice then calls this again to continue.
function resolveStory() {
  while (storyStack && storyStack.length) {
    const ev = storyStack.shift()
    if (!sourceGone(ev) && needsChoice(ev)) {
      // Suspend for the player to choose. The rest of the storyline waits.
      ui.storyChoice = {
        ownerId: ev.ownerId,
        ability: ev.ability,
        entry: ev.entry,
        triggeringId: ev.triggeringId,
      }
      return
    }
    const ignored = sourceGone(ev)
    logStoryEvent(ev, ignored)
    // Effects resolve against the card that set it off. New triggers unshift onto
    // storyStack and so resolve next (interrupt).
    if (!ignored) runEffects(ev.ability, ev.ownerId, autoTarget(ev), ev.entry)
  }
  storyStack = null
}

// The player picked a target (or square) for the paused triggered ability;
// resolve it, then continue the storyline.
export function resolveStoryChoice(targetId, gridSquare) {
  const c = ui.storyChoice
  if (!c) return
  ui.storyChoice = null
  const ev = { ability: c.ability, ownerId: c.ownerId, entry: c.entry, triggeringId: c.triggeringId }
  const ignored = sourceGone(ev)
  logStoryEvent(ev, ignored)
  if (!ignored)
    runEffects(c.ability, c.ownerId, targetId ?? c.triggeringId, c.entry, gridSquare)
  resolveStory() // resume the rest of the storyline
}

// Decline the paused trigger's optional ("may") target: resolve it with no
// target, so its `who: target` effects are skipped and the rest still run, then
// continue the storyline. Only offered while an optional choice is pending.
export function declineStoryChoice() {
  const c = ui.storyChoice
  if (!c || !c.ability.target.optional) return
  ui.storyChoice = null
  const ev = { ability: c.ability, ownerId: c.ownerId, entry: c.entry, triggeringId: c.triggeringId }
  const ignored = sourceGone(ev)
  logStoryEvent(ev, ignored)
  if (!ignored) runEffects(c.ability, c.ownerId, null, c.entry)
  resolveStory() // resume the rest of the storyline
}

// Whether a click on this card resolves the paused trigger's card target.
export function isStoryChoiceTarget(id) {
  const c = ui.storyChoice
  if (!c || c.ability.target.mode !== 'card') return false
  return id !== c.ownerId && satisfiesTarget(c.ownerId, id, c.ability.target)
}

// The paused trigger's grid pick, if it wants a square.
export function activeStoryGridPick() {
  const c = ui.storyChoice
  return c && c.ability.target.mode === 'grid' && c.ability.target.origin === 'pick'
    ? c.ability.target
    : null
}

export function canStoryPickSquare(sq) {
  const c = ui.storyChoice
  if (!activeStoryGridPick()) return false
  const src = nodeOf(c.ownerId)
  return !!src && kingDistance(src.sq, sq) <= (c.ability.target.range || 0)
}

export function pickStorySquare(sq) {
  if (canStoryPickSquare(sq)) resolveStoryChoice(null, sq)
}

// Put an entry's triggered abilities onto the storyline. Mid-drain they interrupt
// (resolve next); otherwise they start a fresh drain.
function fireTriggers(entry) {
  const events = collectTriggers(entry)
  if (!events.length) return
  if (storyStack) storyStack.unshift(...events)
  else {
    storyStack = events
    resolveStory()
  }
}

// Arm a card to pick something up; the next click on another card carries it.
// Sites are deliberately not excluded: the app has no notion of a site that
// has become a unit -- card.site stays true either way -- so refusing by that
// flag would block the one case that most needs carrying.
export function beginPickup(cardId) {
  ui.carrier = ui.carrier === cardId ? null : cardId
  if (ui.carrier) {
    // Only one action is ever armed: a leftover striker or move would swallow
    // the next click that was meant to name the card being lifted.
    ui.attacker = null
    ui.striker = null
    ui.moving = null
    ui.activating = null
    ui.shooting = null
    ui.intercepting = null
  }
}

export function targetPickup(targetId) {
  const carrier = ui.carrier
  if (!carrier || carrier === targetId) return
  if (state.cards[targetId]?.monument) return // monuments can't be carried
  if (wouldCycle(carrier, targetId)) return
  const from = zoneOf(targetId)
  // The pool is a palette: its cards stay in it so one upload can be used many
  // times, so nothing is ever lifted out of it.
  if (from === 'pool') return
  const held = state.carry[targetId]
  // Taking something out of another card's hands is a pick-up too, so the
  // item may already be carried rather than sitting in a zone.
  if (held) {
    if (held === carrier) return
  } else {
    const src = state.zones[from]
    const i = src?.indexOf(targetId) ?? -1
    if (i === -1) return
    src.splice(i, 1)
  }
  state.carry[targetId] = carrier
  logEntry({ type: 'pickup', cardId: carrier, targetId, from, held })
  ui.carrier = null
}

// The holder puts it down: it lands in the holder's zone and is a free card
// again.
export function dropCarried(itemId) {
  const carrierId = state.carry[itemId]
  if (!carrierId) return
  const zone = zoneOf(carrierId)
  if (!zone) return
  const to = dropTarget(itemId, zone)
  if (!state.zones[to]) return
  delete state.carry[itemId]
  state.zones[to].push(itemId)
  logEntry({ type: 'drop', cardId: itemId, to, carrierId })
}

export function targetStrike(targetId) {
  if (!ui.striker || ui.striker === targetId) return
  const strikerId = ui.striker
  const prevTapped = clone(state.tapped)
  // Strike deals strike damage / ability without automatically tapping the card
  const entry = { type: 'strike', cardId: strikerId, targetId, prevTapped }
  logEntry(entry)
  if (combatActive()) strikeWithLance(strikerId, targetId, entry)
  ui.striker = null
}

// ---------- activated abilities ----------

// Does a card satisfy an ability target's card-kind filter?
function matchesFilter(card, filter) {
  if (!card) return false
  if (filter === 'unit') return isUnit(card)
  if (filter === 'minion') return !!card.unit && !card.avatar
  if (filter === 'avatar') return isAvatar(card)
  if (filter === 'site') return !!card.site
  if (filter === 'aura') return !!card.aura
  if (filter === 'artifact') return !!card.artifact
  if (filter === 'monument') return !!card.monument
  return true // 'any'
}

// Find an ability by id on a card or anything it carries -- a card gains the
// abilities of whatever it is holding (a granted "assumed" card, say), so the
// search walks the carry tree.
function findAbility(cardId, abilityId) {
  const seen = new Set()
  const walk = (id) => {
    if (!id || seen.has(id)) return null
    seen.add(id)
    const c = state.cards[id]
    const a = c?.abilities?.find((x) => x.id === abilityId)
    if (a) return a
    for (const held of carriedBy(id)) {
      const r = walk(held)
      if (r) return r
    }
    return null
  }
  return walk(cardId)
}

// The activated abilities a card can use right now: its own plus those of every
// card it carries (gained via a grant), filtered to the ones live in the card's
// current zone category.
export function activatedAbilities(cardId) {
  // Silence (and Disable) strip non-basic abilities, so a silenced unit offers
  // none -- including any it gained from a carried card.
  if (isSilenced(cardId)) return []
  const cat = cardZoneCategory(cardId)
  const out = []
  const seen = new Set()
  const collect = (id) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    const c = state.cards[id]
    for (const a of c?.abilities || []) {
      if (a.kind === 'activated' && a.zones.includes(cat)) out.push(a)
    }
    for (const held of carriedBy(id)) collect(held)
  }
  collect(cardId)
  return out
}

// The ability currently waiting for a target, if any.
export function activeAbility() {
  if (!ui.activating) return null
  return findAbility(ui.activating.cardId, ui.activating.abilityId)
}

// The grid target waiting for a square to be picked, if any.
export function activeGridPick() {
  const ab = activeAbility()
  return ab && ab.target.mode === 'grid' && ab.target.origin === 'pick'
    ? ab.target
    : null
}

// A square is a legal pick if it is within the ability's range of its source.
export function canPickGridSquare(sq) {
  const t = activeGridPick()
  if (!t) return false
  const src = nodeOf(ui.activating.cardId)
  return !!src && kingDistance(src.sq, sq) <= (t.range || 0)
}

export function pickGridSquare(sq) {
  if (!canPickGridSquare(sq)) return
  const { cardId, abilityId, cast } = ui.activating
  ui.activating = null
  if (cast) performCast(cardId, abilityId, null, sq)
  else performAbility(cardId, abilityId, null, sq)
}

// The target must be on the right side relative to the source.
function matchesTargetSide(sourceId, targetId, side) {
  if (side === 'any' || !side) return true
  const same = !!state.cards[sourceId]?.enemy === !!state.cards[targetId]?.enemy
  return side === 'friendly' ? same : !same
}

// The target must be within range of the source (adjacent = cardinal, nearby =
// king). Unmeasurable sources (a spell cast from hand) don't constrain range.
function withinTargetRange(sourceId, targetId, within) {
  if (within === 'any' || !within) return true
  const s = nodeOf(sourceId)
  const t = nodeOf(targetId)
  if (!s || !t) return true
  const dr = Math.abs(Math.floor(s.sq / GRID_COLS) - Math.floor(t.sq / GRID_COLS))
  const dc = Math.abs((s.sq % GRID_COLS) - (t.sq % GRID_COLS))
  if (within === 'adjacent') return dr + dc <= 1
  if (within === 'nearby') return dr <= 1 && dc <= 1
  return true
}

// Does a card satisfy an ability's full card-target spec (zone, kind, side,
// range, stealth)? `sourceId` is the card whose ability it is.
function satisfiesTarget(sourceId, targetId, t) {
  if (cardZoneCategory(targetId) !== t.from) return false
  if (!matchesFilter(state.cards[targetId], t.filter)) return false
  if (!matchesTargetSide(sourceId, targetId, t.side)) return false
  if (!withinTargetRange(sourceId, targetId, t.within)) return false
  if (blockedByStealth(sourceId, targetId)) return false
  return true
}

// Whether a click on this card would satisfy the armed ability's target.
export function canActivateTarget(targetId) {
  const ability = activeAbility()
  if (!ability) return false
  if (targetId === ui.activating.cardId) return false
  return satisfiesTarget(ui.activating.cardId, targetId, ability.target)
}

// ---------- effect ops ----------

const STRUCTURAL_OPS = new Set(['grantFrom', 'release'])

const otherSide = (side) => (side === 'player' ? 'opponent' : 'player')

// Which card an effect acts on: the activator by default, or the chosen target.
const effectSubject = (who, cardId, targetId) =>
  who === 'target' ? targetId : cardId

// King-move distance between two squares -- how "grid targeting" measures range.
const kingDistance = (a, b) =>
  Math.max(
    Math.abs(Math.floor(a / GRID_COLS) - Math.floor(b / GRID_COLS)),
    Math.abs((a % GRID_COLS) - (b % GRID_COLS))
  )

// The squares an area shape covers from an origin: just it, plus its cardinal
// (adjacent) or king (nearby) ring.
function squaresInShape(originSq, shape) {
  const out = [originSq]
  if (shape === 'adjacent' || shape === 'nearby') {
    for (let s = 0; s < GRID_SIZE; s++) {
      if (s === originSq) continue
      if (shape === 'adjacent' ? areAdjacent(originSq, s) : areNearby(originSq, s)) out.push(s)
    }
  }
  return out
}

// The cards an ability's grid target covers. The area emanates from the source's
// layer (so it only hits same-layer locations) unless it is square-based
// (throughLayers), which punches through both the surface and the under-site.
function resolveGridArea(sourceId, pickedSquare, target) {
  const src = nodeOf(sourceId)
  // A picked origin uses the chosen square; a self origin uses the source's own
  // square, but a spell cast from hand has none, so it falls back to the square
  // it was dropped on.
  const originSq = target.origin === 'pick' || src == null ? pickedSquare : src.sq
  if (originSq == null) return []
  const layers = target.throughLayers ? ['top', 'bot'] : [src?.layer || 'top']
  const out = []
  for (const sq of squaresInShape(originSq, target.shape)) {
    for (const layer of layers) {
      for (const id of state.zones[`cell:${sq}:${layer}`] || []) {
        if (matchesFilter(state.cards[id], target.filter)) out.push(id)
      }
    }
    for (const id of state.zones[`site:${sq}`] || []) {
      if (matchesFilter(state.cards[id], target.filter)) out.push(id)
    }
  }
  return out
}

// Snapshot the structural state (zones / carry / grants) onto the entry the
// first time an effect on this entry needs to change it, so undo can put it all
// back. Lazy and idempotent: plain moves that trigger nothing pay nothing, and
// several effects on one entry share the one snapshot taken before any of them.
function snapshotStructural(entry) {
  if (!entry.prevZones) entry.prevZones = clone(state.zones)
  if (!entry.prevCarry) entry.prevCarry = clone(state.carry)
  if (!entry.prevGrants) entry.prevGrants = clone(state.grants)
}

// Grant: carry the target so the carrier gains its abilities, remembering where
// it came from for release. A pseudo-pickup, so cycles are refused like a real
// one.
function grantFrom(carrierId, targetId, ability, entry) {
  if (!targetId || state.carry[targetId] || wouldCycle(carrierId, targetId)) return
  const from = zoneOf(targetId)
  const arr = state.zones[from]
  const i = arr?.indexOf(targetId) ?? -1
  if (i === -1) return
  snapshotStructural(entry)
  arr.splice(i, 1)
  state.carry[targetId] = carrierId
  state.grants[targetId] = { carrierId, from, abilityId: ability.id }
}

// Release every grant a carrier holds, returning each card to where it was
// taken from (its square may be gone; fall back to the pool rather than lose
// it). Used by an explicit `release` effect and by the loseWhen watcher.
function releaseGrant(carrierId, entry) {
  for (const t of Object.keys(state.grants)) {
    const g = state.grants[t]
    if (g.carrierId !== carrierId) continue
    snapshotStructural(entry)
    delete state.carry[t]
    delete state.grants[t]
    const to = state.zones[g.from] ? g.from : 'pool'
    state.zones[to].push(t)
  }
}

// The numeric amount an effect uses: a literal, or a computed value like the
// number of cards the source is carrying (a projectile's picked-up payload).
function effectAmount(eff, sourceId) {
  if (eff.amountRef === 'carriedCount') return carriedBy(sourceId).length
  return Number(eff.amount) || 0
}

// Resolve a `move` effect's location reference to a board zone id.
function resolveLocation(ref, sourceId, targetId) {
  return zoneOf(ref === 'targetLocation' ? targetId : sourceId)
}

// Relocate a card as an effect (not a logged move): drop what it carried onto it
// -- actually keep it simple and move only the card, releasing any grant it held
// is not implied. Undoable via the structural snapshot; may enter a hostile
// region, so survival is rechecked by the caller.
function relocateCard(id, to, entry) {
  if (!id || !to) return
  const routed = routeZone(id, to)
  if (!state.zones[routed]) return
  snapshotStructural(entry)
  delete state.carry[id]
  removeFromZones(state.zones, id)
  state.zones[routed].push(id)
  shedInPlayState(id, routed)
}

// Send a card out of play as an effect. Avatars can't be removed this way.
// Destroying a unit is a death (fires Deathrite); other removals are not.
function effectRemove(id, kind, entry) {
  const c = state.cards[id]
  if (!c || c.avatar) return
  if (kind === 'destroy' && isUnit(id)) {
    sendToCemetery(id, entry, 'Destroyed', `${cardName(id)} is destroyed.`)
    return
  }
  const zone =
    kind === 'banish'
      ? `banished:${sideOf(id)}`
      : kind === 'bounce'
      ? `hand:${sideOf(id)}`
      : `grave:${sideOf(id)}`
  const label =
    kind === 'banish' ? 'Banished' : kind === 'bounce' ? 'Returned' : 'Destroyed'
  snapshotStructural(entry)
  delete state.carry[id]
  removeFromZones(state.zones, id)
  state.zones[zone].push(id)
  shedInPlayState(id, zone)
  state.events.push({
    id: uid(),
    seq: entry.seq,
    cardId: id,
    name: label,
    text: `${cardName(id)} ${
      kind === 'banish' ? 'is banished' : kind === 'bounce' ? 'returns to hand' : 'is destroyed'
    }.`,
  })
}

// Run an ability's structured effects. Stat/tap/damage changes are reversed from
// the entry's prev* snapshots; structural ops snapshot lazily via snapshotStructural.
function breakWard(id, entry) {
  state.wardBroken[id] = true
  state.events.push({
    id: uid(),
    seq: entry?.seq,
    cardId: id,
    name: 'Ward breaks',
    text: `${cardName(id)}'s Ward breaks.`,
  })
}

function runEffects(ability, cardId, targetId, entry, gridSquare) {
  const card = state.cards[cardId]
  const side = card?.enemy ? 'opponent' : 'player'
  // Ward: an opponent's ability that would target the warded object is prevented,
  // and the Ward breaks instead of the effect landing.
  const wardedTarget = targetId && wardBlocks(cardId, targetId)
  if (wardedTarget) breakWard(targetId, entry)
  // For a grid ability, the affected cards are resolved once from its area. A
  // trigger that picked a square passes it here; otherwise the entry carries it.
  const pickSquare = gridSquare == null ? entry?.gridSquare : gridSquare
  const gridArea =
    ability.target?.mode === 'grid'
      ? resolveGridArea(cardId, pickSquare, ability.target)
      : null
  for (const eff of ability.effects || []) {
    if (wardedTarget && (eff.who === 'target' || eff.op === 'grantFrom')) continue
    if (eff.op === 'gridDamage') {
      const amt = effectAmount(eff, cardId)
      const lethalHit = new Set()
      for (const id of gridArea || []) {
        const c = state.cards[id]
        // Area damage hits minions on the square; it never causes life loss to
        // an avatar or a site's controller (unlike an attack).
        if (isUnit(id) && !c.avatar) {
          state.damage[id] = (state.damage[id] || 0) + amt
          if (hasKeyword(cardId, 'lethal')) lethalHit.add(id)
        }
      }
      resolveDeaths(entry, lethalHit)
      continue
    }

    if (eff.op === 'adjustStat') {
      const s =
        eff.side === 'self' || !eff.side
          ? side
          : eff.side === 'enemy'
          ? otherSide(side)
          : eff.side
      adjustStat(s, eff.key || 'mana', Number(eff.delta) || 0)
    } else if (eff.op === 'tap') {
      const t = effectSubject(eff.who, cardId, targetId)
      if (t) state.tapped[t] = true
    } else if (eff.op === 'dealDamage') {
      const t = effectSubject(eff.who, cardId, targetId)
      const amount = effectAmount(eff, cardId)
      // With combat on, an ability's damage resolves like a hit (Lethal-aware,
      // life loss to avatars/sites, death); otherwise it just marks counters.
      if (t && combatActive()) resolveHit(cardId, t, amount, entry)
      else if (t) adjustDamage(t, amount)
    } else if (eff.op === 'modifyStrength') {
      const t = effectSubject(eff.who, cardId, targetId)
      if (t) state.strengthMod[t] = (state.strengthMod[t] || 0) + (Number(eff.amount) || 0)
    } else if (eff.op === 'grantKeyword') {
      const t = effectSubject(eff.who, cardId, targetId)
      if (t && eff.keyword) {
        const list = state.grantedKeywords[t] || (state.grantedKeywords[t] = [])
        if (!list.includes(eff.keyword)) list.push(eff.keyword)
      }
    } else if (eff.op === 'move') {
      const who = effectSubject(eff.who, cardId, targetId)
      const to = resolveLocation(eff.to, cardId, targetId)
      relocateCard(who, to, entry)
      checkSurvival(entry) // moving into a hostile region can kill
    } else if (eff.op === 'destroy' || eff.op === 'banish' || eff.op === 'bounce') {
      const who = effectSubject(eff.who, cardId, targetId)
      if (who) effectRemove(who, eff.op, entry)
    } else if (eff.op === 'heal') {
      const who = effectSubject(eff.who, cardId, targetId)
      if (who) adjustDamage(who, -damageOf(who))
    } else if (eff.op === 'grantFrom') {
      grantFrom(cardId, targetId, ability, entry)
    } else if (eff.op === 'release') {
      releaseGrant(cardId, entry)
    }
  }
}

// ---------- loseWhen: gained abilities fall away ----------

// Does this entry meet a grant's loss condition for its carrier?
function matchesLoseWhen(cond, carrierId, entry) {
  if (!cond || cond === 'never') return false
  if (cond === 'damaged')
    return entry.type === 'damage' && entry.cardId === carrierId && (entry.amount || 0) > 0
  if (entry.cardId !== carrierId) return false
  if (cond === 'dies') return zoneCategory(entry.to) === 'cemetery'
  if (cond === 'leaves-realm')
    return zoneCategory(entry.from) === 'realm' && zoneCategory(entry.to) !== 'realm'
  if (cond === 'taps') return isTapped(carrierId)
  return false
}

// After each logged entry, drop any grant whose loss condition it just met.
function checkGrantLoss(entry) {
  const carriers = new Set(Object.values(state.grants).map((g) => g.carrierId))
  for (const carrierId of carriers) {
    const g = Object.values(state.grants).find((x) => x.carrierId === carrierId)
    const ability = state.cards[carrierId]?.abilities?.find((a) => a.id === g.abilityId)
    if (matchesLoseWhen(ability?.loseWhen, carrierId, entry)) {
      releaseGrant(carrierId, entry)
    }
  }
}

// ---------- automatic survival ----------

// A region a unit can't survive without the matching keyword, and what happens
// when it can't: the void banishes, the sub-surface regions kill.
const SURVIVAL = {
  underwater: { keyword: 'submerge', verb: 'drowned', name: 'Drowned', banish: false },
  underground: { keyword: 'burrowing', verb: 'was buried', name: 'Buried', banish: false },
  void: { keyword: 'voidwalk', verb: 'was banished', name: 'Banished', banish: true },
}

// After a placement, any unit sitting in a region it can't survive (underwater
// without Submerge, underground without Burrowing, the void without Voidwalk)
// dies to its cemetery or is banished. A consequence of the causing entry, not a
// solution step: snapshotted on that entry for undo, and announced as an event.
function checkSurvival(entry) {
  for (const u of boardUnits()) {
    if (!zoneOf(u.id)?.startsWith('cell:')) continue
    const rule = SURVIVAL[u.region]
    if (!rule || hasKeyword(u.id, rule.keyword)) continue
    const text = `${cardName(u.id)} ${rule.verb}.`
    if (rule.banish) {
      // Banishment removes from the game (not a death), so no Deathrite.
      snapshotStructural(entry)
      removeFromZones(state.zones, u.id)
      const bz = `banished:${sideOf(u.id)}`
      state.zones[bz].push(u.id)
      shedInPlayState(u.id, bz)
      state.events.push({ id: uid(), seq: entry.seq, cardId: u.id, name: rule.name, text })
    } else {
      sendToCemetery(u.id, entry, rule.name, text)
    }
  }
}

// ---------- performing an activated ability ----------

// Pay an ability's cost, run its effects, and log it. Cost and effects are
// auto-applied and reversed on undo via the snapshots on the entry. Only card
// moves count toward the solution, and an ability activation is one -- it logs
// like an attack or strike, and check() compares it by cardId+abilityId+target.
function performAbility(cardId, abilityId, targetId, gridSquare) {
  const ability = findAbility(cardId, abilityId)
  const card = state.cards[cardId]
  if (!ability || !card) return
  const entry = {
    type: 'ability',
    cardId,
    abilityId,
    targetId: targetId || null,
    gridSquare: gridSquare == null ? null : gridSquare,
    prevTapped: clone(state.tapped),
    prevStats: clone(state.stats),
    prevDamage: clone(state.damage),
    prevStrengthMod: clone(state.strengthMod),
    prevGrantedKeywords: clone(state.grantedKeywords),
  }
  const side = card.enemy ? 'opponent' : 'player'
  if (ability.cost.mana) adjustStat(side, 'mana', -ability.cost.mana)
  if (ability.cost.tap) state.tapped[cardId] = true
  // Log first so the entry has its seq before effects run -- a damage effect can
  // kill a minion and queue a death event, which undo keys off that seq.
  logEntry(entry)
  runEffects(ability, cardId, targetId, entry)
}

// ---------- casting spells ----------

// A magic spell's effect lives on its first authored ability (its target,
// effects and cost). Casting reads it.
export function spellAbility(cardId) {
  return state.cards[cardId]?.abilities?.[0] || null
}

// Casting is only meaningful while a solution is played or recorded.
const casting = () => state.recording || state.mode === 'play'

// ---------- affinity & mana provided by cards in play ----------

// Cards of a side currently in play (in the realm: sites, units, carried items).
function inPlayCards(side) {
  return Object.keys(state.cards).filter(
    (id) =>
      cardZoneCategory(id) === 'realm' &&
      (state.cards[id].enemy ? 'opponent' : 'player') === side
  )
}

// Elemental affinity a side has, summed from its in-play cards (sites mostly,
// some minions). Affinity is the threshold spells are checked against.
export function providedAffinity(side, el) {
  let sum = 0
  for (const id of inPlayCards(side)) sum += Number(state.cards[id].affinity?.[el]) || 0
  return sum
}

// A side's effective threshold: an authored base on the stat, plus affinity from
// its board. This is what casting compares a spell's threshold requirement to.
export function effectiveThreshold(side, el) {
  return (state.stats[side]?.[el] || 0) + providedAffinity(side, el)
}

// Mana a side's sites (and other providers) would yield when collected.
export function providedMana(side) {
  let sum = 0
  for (const id of inPlayCards(side)) sum += Number(state.cards[id].manaProvided) || 0
  return sum
}

// Collect mana from your sites into your pool (a "start of turn" gain). Not a
// logged move -- mana is a resource stat, like the +/- steppers.
export function gainManaFromSites(side) {
  adjustStat(side, 'mana', providedMana(side))
}

// In the editor (but not while recording a solution), a side's starting mana
// pool tracks the sites it controls: placing or gaining a site raises it,
// deleting one or handing it to the other side lowers it. This matches how you
// set a board up -- sites first, then decide who owns them. In play, mana is a
// spent resource collected only at start of turn, so we never auto-adjust
// there (nor while recording, which plays the solution out). Callers run their
// board mutation through this and it reconciles each side's mana by the change
// in its site-provided mana. Thresholds need no equivalent: effectiveThreshold
// already sums affinity live, so they update instantly in every mode.
function withEditorSiteMana(fn) {
  if (state.mode !== 'editor' || state.recording) return fn()
  const before = { player: providedMana('player'), opponent: providedMana('opponent') }
  const result = fn()
  for (const side of ['player', 'opponent']) {
    const delta = providedMana(side) - before[side]
    if (delta) adjustStat(side, 'mana', delta)
  }
  return result
}

// A short human label for a card's type, for the UI.
export function cardTypeLabel(cardId) {
  const c = state.cards[cardId]
  if (!c) return ''
  if (c.avatar) return 'Avatar'
  if (c.unit) return 'Minion'
  if (c.site) return 'Site'
  if (c.aura) return 'Aura'
  if (c.monument) return 'Monument'
  if (c.artifact) return 'Artifact'
  if (c.magic) return 'Magic'
  return 'Card'
}

// A spell's cast cost lives on the card: mana is spent, the elemental amounts
// are threshold requirements (compared, not spent).
export function castCostOf(cardId) {
  const c = state.cards[cardId]?.spellCost
  return {
    mana: Number(c?.mana) || 0,
    air: Number(c?.air) || 0,
    earth: Number(c?.earth) || 0,
    fire: Number(c?.fire) || 0,
    water: Number(c?.water) || 0,
  }
}

// Any card you cast from hand: a magic, or a permanent (minion/artifact/aura).
// Sites are played, not cast; an avatar is never cast.
export function isSpell(cardId) {
  const c = state.cards[cardId]
  if (!c) return false
  if (c.magic) return true
  if (c.site || c.avatar) return false
  return !!(c.unit || c.artifact || c.aura)
}

// Whether the caster's side has the mana and elemental threshold a spell needs.
export function canAffordCast(cardId) {
  const side = sideOf(cardId)
  const s = state.stats[side]
  if (!s) return false
  const cost = castCostOf(cardId)
  if ((s.mana || 0) < cost.mana) return false
  // Threshold is affinity: the authored base plus what the board provides.
  for (const el of ELEMENTS) if (effectiveThreshold(side, el) < cost[el]) return false
  return true
}

// A spell sitting in hand during play/recording is castable (subject to cost).
export function spellInHand(cardId) {
  return isSpell(cardId) && casting() && cardZoneCategory(cardId) === 'hand'
}

export function canCast(cardId) {
  return spellInHand(cardId) && canAffordCast(cardId)
}

// Pay the cost, resolve the magic's effect from the storyline, then send the
// card to the cemetery (a magic is not a permanent). Mirrors performAbility's
// snapshot-before-pay so undo refunds mana; the cast is a gradeable `cast` entry
// and fires "when cast" triggers before it resolves.
function performCast(cardId, abilityId, targetId, gridSquare) {
  const card = state.cards[cardId]
  if (!card) return
  const ability = abilityId ? findAbility(cardId, abilityId) : null
  const side = card.enemy ? 'opponent' : 'player'
  const entry = {
    type: 'cast',
    cardId,
    abilityId: abilityId || null,
    targetId: targetId || null,
    gridSquare: gridSquare == null ? null : gridSquare,
    prevTapped: clone(state.tapped),
    prevStats: clone(state.stats),
    prevDamage: clone(state.damage),
    prevStrengthMod: clone(state.strengthMod),
    prevGrantedKeywords: clone(state.grantedKeywords),
  }
  const cost = castCostOf(cardId)
  if (cost.mana) adjustStat(side, 'mana', -cost.mana)
  logEntry(entry) // fires "when a spell is cast" triggers, before it resolves
  emitFx('cast', { cardId })
  // A targeted spell fires a projectile from the caster to its victim.
  if (targetId) emitFx('projectile', { sourceId: cardId, targetId })
  if (ability) runEffects(ability, cardId, targetId, entry)
  // The spell resolves and the card goes to the cemetery.
  const from = zoneOf(cardId)
  snapshotStructural(entry)
  removeFromZones(state.zones, cardId)
  state.zones[`grave:${side}`].push(cardId)
  state.events.push({
    id: uid(),
    seq: entry.seq,
    cardId,
    name: 'Spell resolves',
    text: `${cardName(cardId)} resolves and goes to the cemetery.`,
  })
  fireTriggers({ type: 'move', cardId, from, to: `grave:${side}`, seq: entry.seq })
}

// Whether a minion may be summoned onto this location (enforced casts). Surface
// of a site by default; the sub-surface / void need the matching keyword.
function legalSummonLocation(cardId, to) {
  const m = /^cell:(\d+):(top|bot)$/.exec(to)
  const site = /^site:(\d+)$/.exec(to)
  if (site) return false // minions summon to a cell, not the site slot
  if (!m) return false
  const region = regionOf(Number(m[1]), m[2])
  if (region === 'surface') return true
  if (region === 'void') return hasKeyword(cardId, 'voidwalk')
  if (region === 'underground') return hasKeyword(cardId, 'burrowing')
  if (region === 'underwater') return hasKeyword(cardId, 'submerge')
  return false
}

// Cast a permanent (minion / artifact / aura): pay cost, fire cast triggers,
// then the card enters the realm at the declared location (firing its genesis
// and the survival check). One gradeable `cast` entry; undo rides its snapshots.
function performPermanentCast(cardId, zone) {
  const card = state.cards[cardId]
  const to = routeZone(cardId, zone)
  // A carriable artifact dropped on one of your units enters carried by it
  // (drop on an empty surface conjures it there as normal).
  let carrierId = null
  if (card.artifact && !card.monument) {
    const m = /^cell:(\d+):(top|bot)$/.exec(to)
    if (m) {
      carrierId =
        unitsOnSquare(Number(m[1])).find(
          (id) => !!state.cards[id].enemy === !!card.enemy
        ) || null
    }
  }
  if (!carrierId && !canPlace(cardId, to)) return false
  if (enforcing() && card.unit && !card.avatar && !legalSummonLocation(cardId, to))
    return false
  const side = card.enemy ? 'opponent' : 'player'
  const from = zoneOf(cardId)
  const entry = {
    type: 'cast',
    cardId,
    abilityId: null,
    targetId: carrierId || null,
    gridSquare: null,
    to: carrierId ? null : to,
    prevTapped: clone(state.tapped),
    prevStats: clone(state.stats),
    prevDamage: clone(state.damage),
    prevStrengthMod: clone(state.strengthMod),
    prevGrantedKeywords: clone(state.grantedKeywords),
  }
  const cost = castCostOf(cardId)
  if (cost.mana) adjustStat(side, 'mana', -cost.mana)
  logEntry(entry) // fires "when a spell is cast" triggers (card still in hand)
  // The spell resolves: the card enters the realm (or a carrier's hands).
  snapshotStructural(entry)
  removeFromZones(state.zones, cardId)
  const landedZone = carrierId ? zoneOf(carrierId) : to
  if (carrierId) state.carry[cardId] = carrierId
  else state.zones[to].push(cardId)
  if (card.unit && !card.avatar) state.summoned[cardId] = true
  state.events.push({
    id: uid(),
    seq: entry.seq,
    cardId,
    name: 'Enters the realm',
    text: carrierId
      ? `${cardName(cardId)} enters carried by ${cardName(carrierId)}.`
      : `${cardName(cardId)} enters the realm.`,
  })
  emitFx('genesis', { cardId })
  fireTriggers({ type: 'move', cardId, from, to: landedZone, seq: entry.seq }) // genesis
  checkSurvival(entry) // it may enter a region it can't survive
  return true
}

// Drag-to-cast: a spell dragged from hand and dropped onto the board casts. For a
// magic the drop chooses the target (a card there, a grid square, or anywhere);
// for a permanent the drop is the summon/conjure location.
export function castByDrop(cardId, zone) {
  if (!canCast(cardId)) return false
  if (!state.cards[cardId].magic) return performPermanentCast(cardId, zone)
  const ability = spellAbility(cardId)
  const t = ability?.target
  const m = /^(?:cell|site):(\d+)/.exec(zone || '')
  const sq = m ? Number(m[1]) : null
  if (t?.mode === 'grid') {
    if (sq == null) return false // grid spells must land on a square
    performCast(cardId, ability.id, null, sq)
    return true
  }
  if (t?.mode === 'card' && t.required) {
    const targetId = findDropTarget(cardId, ability, zone, sq)
    if (!targetId) return false
    performCast(cardId, ability.id, targetId, null)
    return true
  }
  performCast(cardId, ability?.id || null, null, null)
  return true
}

// A legal target for a dropped card-target spell: a card in the dropped square
// (site or either layer) or zone whose category and kind match, excluding
// opponents hidden by Stealth. A warded target is allowed -- the Ward absorbs
// the spell as it resolves.
function findDropTarget(casterId, ability, zone, sq) {
  const ids =
    sq != null
      ? [`site:${sq}`, `cell:${sq}:top`, `cell:${sq}:bot`].flatMap(
          (z) => state.zones[z] || []
        )
      : [...(state.zones[zone] || [])]
  return ids.find((id) => satisfiesTarget(casterId, id, ability.target)) || null
}

// Invoke a cast from the bar. A spell whose effect needs a target/square arms the
// picker (reusing ui.activating, tagged cast); otherwise it resolves at once.
export function beginCast(cardId) {
  if (!canCast(cardId)) return
  const ability = spellAbility(cardId)
  if (
    ui.activating?.cast &&
    ui.activating.cardId === cardId
  ) {
    ui.activating = null
    return
  }
  ui.attacker = null
  ui.striker = null
  ui.moving = null
  ui.carrier = null
  ui.shooting = null
  ui.intercepting = null
  const t = ability?.target
  const abilityId = ability?.id || null
  if (t?.mode === 'grid' && t.origin === 'pick') {
    ui.activating = { cardId, abilityId, cast: true }
  } else if (t?.mode === 'card' && t.required) {
    ui.activating = { cardId, abilityId, cast: true }
  } else {
    ui.activating = null
    performCast(cardId, abilityId, null, null)
  }
}

// ---------- damage as a logged action ----------

// Mark or heal damage on a card. In editor setup it just sets the counter (part
// of the start position); while recording or playing it is a logged, undoable,
// gradeable action that can also set off "when damaged" triggers and loseWhen.
export function markDamage(cardId, amount = 1) {
  if (!state.recording && state.mode !== 'play') {
    adjustDamage(cardId, amount)
    return
  }
  const prevDamage = clone(state.damage)
  adjustDamage(cardId, amount)
  const entry = { type: 'damage', cardId, amount, prevDamage }
  logEntry(entry)
  // With combat on, a damage mark can push a minion to/over its Life; resolve
  // state-based death like any other damage source (keyed to this entry's seq
  // so the death undoes and fires Deathrite together with it).
  if (combatActive() && amount > 0) resolveDeaths(entry, new Set())
}

// ---------- draw decks (Atlas / Spellbook) ----------

// How many cards sit in one of an avatar's owner's decks, so the UI can hide the
// draw button (and disable it) when the deck is empty.
export function deckSize(avatarId, kind) {
  const side = sideOf(avatarId)
  return state.zones[`${kind}:${side}`]?.length || 0
}

// An avatar's basic activated ability: draw the top card of one of its owner's
// decks -- the Atlas (sites) or the Spellbook (spells) -- into that owner's
// hand. Reuses moveCard, so the draw is a logged, undoable, gradeable move like
// any other. The "top" of a deck is the last card in its zone.
export function drawFromDeck(avatarId, kind) {
  if (!isAvatar(avatarId)) return
  if (kind !== 'atlas' && kind !== 'spellbook') return
  const side = sideOf(avatarId)
  const from = `${kind}:${side}`
  const deck = state.zones[from]
  if (!deck?.length) return
  moveCard(deck[deck.length - 1], from, `hand:${side}`)
}

// Charge: a unit summoned this turn may tap to pay for costs. Modelled as
// tapping for +1 mana to its side, which any ability cost then draws on -- so it
// reuses the mana stat rather than a bespoke payment flow.
export function canCharge(cardId) {
  return (
    hasKeyword(cardId, 'charge') &&
    !!state.summoned[cardId] &&
    !isTapped(cardId) &&
    cardZoneCategory(cardId) === 'realm'
  )
}

export function chargeForMana(cardId) {
  if (!canCharge(cardId)) return
  const entry = {
    type: 'charge',
    cardId,
    prevTapped: clone(state.tapped),
    prevStats: clone(state.stats),
  }
  state.tapped[cardId] = true
  adjustStat(sideOf(cardId), 'mana', 1)
  logEntry(entry)
}

// Invoke an activated ability from the bar. One that needs a target arms the
// target picker (like attack/strike); one that doesn't fires straight away.
// Re-invoking the armed ability cancels it.
export function beginActivate(cardId, abilityId) {
  const ability = findAbility(cardId, abilityId)
  if (!ability) return
  if (
    ui.activating &&
    ui.activating.cardId === cardId &&
    ui.activating.abilityId === abilityId
  ) {
    ui.activating = null
    return
  }
  ui.attacker = null
  ui.striker = null
  ui.moving = null
  ui.carrier = null
  ui.shooting = null
  ui.intercepting = null
  const t = ability.target
  if (t.mode === 'grid') {
    // Self-origin fires straight away; a picked origin waits for a square click.
    if (t.origin === 'pick') ui.activating = { cardId, abilityId }
    else {
      ui.activating = null
      performAbility(cardId, abilityId, null, null)
    }
  } else if (t.required) {
    ui.activating = { cardId, abilityId }
  } else {
    ui.activating = null
    performAbility(cardId, abilityId, null)
  }
}

export function targetActivate(targetId) {
  if (!ui.activating || !canActivateTarget(targetId)) return
  const { cardId, abilityId, cast } = ui.activating
  ui.activating = null
  if (cast) performCast(cardId, abilityId, targetId, null)
  else performAbility(cardId, abilityId, targetId)
}

// Whether the armed ability/cast has an optional ("may") card target that the
// player can decline right now.
export function canDeclineActivate() {
  const ab = activeAbility()
  return !!(ui.activating && ab && ab.target.mode === 'card' && ab.target.optional)
}

// Resolve the armed optional ability/cast with no target: its `who: target`
// effects are skipped, the rest still run (e.g. still draws a card).
export function declineActivate() {
  if (!canDeclineActivate()) return
  const { cardId, abilityId, cast } = ui.activating
  ui.activating = null
  if (cast) performCast(cardId, abilityId, null, null)
  else performAbility(cardId, abilityId, null)
}

// Reverse a pickup: give the item back to its previous holder, or return it to
// the zone it was lifted from.
function undoPickup(m) {
  if (m.held) {
    state.carry[m.targetId] = m.held
  } else {
    delete state.carry[m.targetId]
    if (state.zones[m.from]) state.zones[m.from].push(m.targetId)
  }
}

// Reverse a drop: take the item back out of the zone and into its carrier.
function undoDrop(m) {
  const z = state.zones[m.to]
  const i = z?.indexOf(m.cardId) ?? -1
  if (i !== -1) z.splice(i, 1)
  state.carry[m.cardId] = m.carrierId
}

// Reverse a plain move: pull the card back from `to` and put it in `from`.
function undoMove(m) {
  const src = state.zones[m.to]
  const i = src.indexOf(m.cardId)
  if (i !== -1) {
    src.splice(i, 1)
    state.zones[m.from].push(m.cardId)
  }
}

function undoEntry(m) {
  // Attacks, strikes, damage marks and ability activations run no base zone
  // change; their effects on stats/tap/damage/zones/carry are reversed from the
  // snapshots in undo().
  if (
    m.type === 'attack' ||
    m.type === 'strike' ||
    m.type === 'shoot' ||
    m.type === 'intercept' ||
    m.type === 'ability' ||
    m.type === 'cast' ||
    m.type === 'damage' ||
    m.type === 'charge'
  )
    return
  if (m.type === 'pickup') return undoPickup(m)
  if (m.type === 'drop') return undoDrop(m)
  undoMove(m)
}

export function undo() {
  let list
  if (state.recording) list = state.draft
  else if (state.mode === 'play') list = state.moves
  else return
  if (!list.length) return
  // A pending trigger choice belongs to the move being undone; drop it.
  ui.storyChoice = null
  storyStack = null
  const m = list.pop()
  if (m.prevTapped) state.tapped = clone(m.prevTapped)
  if (m.prevStats) state.stats = clone(m.prevStats)
  if (m.prevDamage) state.damage = clone(m.prevDamage)
  if (m.prevStrengthMod) state.strengthMod = clone(m.prevStrengthMod)
  if (m.prevGrantedKeywords) state.grantedKeywords = clone(m.prevGrantedKeywords)
  if (m.prevSummoned) state.summoned = clone(m.prevSummoned)
  if (m.prevStealthLost) state.stealthLost = clone(m.prevStealthLost)
  if (m.prevWardBroken) state.wardBroken = clone(m.prevWardBroken)
  // Structural snapshots (present only when an effect/trigger changed the board)
  // peel the effects off first, back to just after the base action; undoEntry
  // then reverses the base action itself.
  if (m.prevCarry) state.carry = clone(m.prevCarry)
  if (m.prevGrants) state.grants = clone(m.prevGrants)
  if (m.prevZones) state.zones = clone(m.prevZones)
  undoEntry(m)
  // Drop the triggered events this move set off, so undo rewinds the story too.
  if (m.seq != null) state.events = state.events.filter((e) => e.seq !== m.seq)
  state.checked = false
}

// ---------- editor ----------

// Restore a zones snapshot, but keep cards that were added after the snapshot
// was taken by dropping them back into the pool instead of losing them.
function restoreZones(snapshot) {
  const z = clone(snapshot)
  const placed = new Set(Object.values(z).flat())
  for (const id of Object.keys(state.cards)) {
    // A carried card is in no zone on purpose -- don't sweep it into the pool.
    if (!placed.has(id) && !state.carry[id]) z.pool.push(id)
  }
  return z
}

export function startRecording() {
  if (state.solutions.length && state.initialZones) {
    // Every solution line must start from the same position, so recording
    // an alternative line first snaps the board back to it.
    restoreInitial()
  } else {
    // First line: the board as it stands becomes the start position.
    state.initialZones = clone(state.zones)
    state.initialCarry = clone(state.carry)
    state.initialStats = clone(state.stats)
    state.initialTapped = clone(state.tapped)
    state.initialDamage = clone(state.damage)
    state.solutions = []
  }
  state.draft = []
  state.events = []
  state.recording = true
}

function restoreInitial() {
  if (state.initialZones) {
    state.carry = clone(state.initialCarry || {})
    state.zones = restoreZones(state.initialZones)
  }
  if (state.initialStats) state.stats = clone(state.initialStats)
  state.tapped = clone(state.initialTapped || {})
  state.damage = clone(state.initialDamage || {})
  // Grants and gameplay modifiers only exist mid-play; a start position has none.
  state.grants = {}
  state.strengthMod = {}
  state.grantedKeywords = {}
  state.summoned = {}
  state.stealthLost = {}
  state.wardBroken = {}
  storyStack = null
}

// `from`, `held` and `carrierId` are recorded for undo but deliberately not
// compared: they are consequences of the position, so two attempts that reach
// the same point by the same moves always agree on them.
const sameEntry = (a, b) => {
  if (!a || !b) return false
  const type = a.type || 'move'
  if (type !== (b.type || 'move')) return false
  if (a.cardId !== b.cardId) return false
  if (type === 'ability')
    return a.abilityId === b.abilityId && a.targetId === b.targetId
  if (type === 'cast')
    return (
      a.abilityId === b.abilityId &&
      a.targetId === b.targetId &&
      (a.gridSquare ?? null) === (b.gridSquare ?? null) &&
      (a.to ?? null) === (b.to ?? null)
    )
  if (type === 'damage') return (a.amount || 0) === (b.amount || 0)
  if (type === 'charge') return true
  if (type === 'attack')
    return a.targetId === b.targetId && (a.defenderId || null) === (b.defenderId || null)
  if (type === 'pickup' || type === 'shoot' || type === 'intercept')
    return a.targetId === b.targetId
  if (type === 'drop') return a.to === b.to
  return a.from === b.from && a.to === b.to
}

const sameLine = (a, b) =>
  a.length === b.length && a.every((m, i) => sameEntry(m, b[i]))

// The undo-only fields on a logged entry -- snapshots and the seq tag. They are
// consequences of the position, never compared by sameEntry(), and (prevZones
// especially) large, so a committed solution line drops them.
function stripBookkeeping(entry) {
  const {
    prevTapped,
    prevStats,
    prevDamage,
    prevStrengthMod,
    prevGrantedKeywords,
    prevSummoned,
    prevStealthLost,
    prevWardBroken,
    prevZones,
    prevCarry,
    prevGrants,
    seq,
    held,
    ...rest
  } = entry
  return rest
}

export function stopRecording() {
  state.recording = false
  const line = state.draft.map(stripBookkeeping)
  if (line.length && !state.solutions.some((l) => sameLine(l, line))) {
    state.solutions.push(clone(line))
  }
  state.draft = []
  state.events = []
  restoreInitial()
}

export function removeSolutionLine(i) {
  state.solutions.splice(i, 1)
}

export function enterPlay() {
  if (state.recording) stopRecording()
  if (!state.initialZones) {
    state.initialZones = clone(state.zones)
    state.initialCarry = clone(state.carry)
    state.initialStats = clone(state.stats)
    state.initialTapped = clone(state.tapped)
    state.initialDamage = clone(state.damage)
  }
  restoreInitial()
  state.moves = []
  state.events = []
  state.checked = false
  state.firstWrong = -1
  state.mode = 'play'
  ui.attacker = null
  ui.striker = null
  ui.moving = null
  ui.carrier = null
  ui.activating = null
  ui.shooting = null
  ui.intercepting = null
  ui.awaitingDefender = null
  ui.storyChoice = null
  ui.selected = null
}

export function enterEditor() {
  if (!config.canEdit) return
  state.mode = 'editor'
  state.recording = false
  state.moves = []
  state.events = []
  state.checked = false
  restoreInitial()
  ui.attacker = null
  ui.carrier = null
  ui.striker = null
  ui.moving = null
  ui.activating = null
  ui.shooting = null
  ui.intercepting = null
  ui.awaitingDefender = null
  ui.storyChoice = null
  ui.selected = null
}

export function resetPlay() {
  restoreInitial()
  state.moves = []
  state.events = []
  state.checked = false
  state.firstWrong = -1
  ui.attacker = null
  ui.carrier = null
  ui.striker = null
  ui.moving = null
  ui.activating = null
  ui.shooting = null
  ui.intercepting = null
  ui.awaitingDefender = null
  ui.storyChoice = null
  ui.selected = null
}

export function adjustStat(side, key, delta) {
  const s = state.stats[side]
  s[key] = Math.max(0, (s[key] || 0) + delta)
}

export function isUnit(cardOrId) {
  const card = typeof cardOrId === 'string' ? state.cards[cardOrId] : cardOrId
  return !!(card?.unit || card?.avatar)
}

export function isAvatar(cardOrId) {
  const card = typeof cardOrId === 'string' ? state.cards[cardOrId] : cardOrId
  return !!card?.avatar
}

export function isTapped(cardId) {
  return !!state.tapped?.[cardId]
}

export function tapCard(cardId) {
  state.tapped[cardId] = true
}

export function untapCard(cardId) {
  delete state.tapped[cardId]
}

export function toggleTap(cardId) {
  if (state.tapped[cardId]) {
    delete state.tapped[cardId]
  } else {
    state.tapped[cardId] = true
  }
}

// Site, aura, and unit/avatar designations.
export function toggleSite(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  withEditorSiteMana(() => {
    card.site = !card.site
    if (card.site) {
      card.aura = false
      card.unit = false
      card.avatar = false
      card.artifact = false
      card.monument = false
      card.magic = false
      // A site provides 1 mana by default.
      if (!card.manaProvided) card.manaProvided = 1
    }
  })
}

// A magic spell: cast from hand, resolves its effect, then goes to the cemetery
// (it is not a permanent). Its own type.
export function toggleMagic(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  withEditorSiteMana(() => {
    card.magic = !card.magic
    if (card.magic) {
      card.site = false
      card.aura = false
      card.unit = false
      card.avatar = false
      card.artifact = false
      card.monument = false
      card.lanceToken = false
    }
  })
}

// Artifacts are their own type (carriable items). A Monument is an artifact that
// can't be carried.
export function toggleArtifact(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  withEditorSiteMana(() => {
    card.artifact = !card.artifact
    if (card.artifact) {
      card.site = false
      card.aura = false
      card.unit = false
      card.avatar = false
      card.magic = false
    } else {
      card.monument = false
    }
  })
}

export function toggleMonument(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  card.monument = !card.monument
  if (card.monument) {
    card.artifact = true
    card.lanceToken = false // monuments can't be carried; lances must be
  }
}

// A lance token is a carriable artifact that grants +1 strike damage and first
// strike, then breaks when its carrier strikes.
export function toggleLanceToken(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  card.lanceToken = !card.lanceToken
  if (card.lanceToken) {
    card.artifact = true
    card.monument = false
  }
}

// A water site's subsurface is underwater rather than underground; only
// meaningful on a site card, but harmless to carry otherwise.
export function toggleWater(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  card.water = !card.water
}

export function toggleUnit(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  withEditorSiteMana(() => {
    if (card.unit && !card.avatar) {
      card.unit = false
    } else {
      card.unit = true
      card.avatar = false
      card.site = false
      card.aura = false
      card.artifact = false
      card.monument = false
      card.magic = false
    }
  })
}

export function toggleAvatar(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  withEditorSiteMana(() => {
    if (card.avatar) {
      card.avatar = false
      card.unit = false
    } else {
      card.avatar = true
      card.unit = true
      card.site = false
      card.aura = false
      card.artifact = false
      card.monument = false
      card.magic = false
    }
  })
}

// Cards controlled by the opponent render upside down, like on the mat.
export function toggleControl(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  withEditorSiteMana(() => {
    card.enemy = !card.enemy
  })
}

export function toggleAura(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  withEditorSiteMana(() => {
    card.aura = !card.aura
    if (card.aura) {
      card.site = false
      card.unit = false
      card.avatar = false
      card.artifact = false
      card.monument = false
      card.magic = false
    }
  })
}

// First index where the attempt diverges from a solution line; -1 = full
// match (same moves, same length).
function divergence(sol, mv) {
  const n = Math.max(sol.length, mv.length)
  for (let i = 0; i < n; i++) {
    if (!sameEntry(mv[i], sol[i])) return i
  }
  return -1
}

// Whether this puzzle has anything to be checked against. A puzzle can reach
// a player with no recorded line -- an editor who forgot to record, a daily
// that failed to load -- and there is no verdict to give in that case.
export const hasSolution = () => state.solutions.length > 0

// The attempt is correct if it fully matches any solution line. Otherwise
// feedback is given against the closest line: the one the attempt follows
// deepest (ties broken by fewer remaining moves). Returns null when there is
// no recorded solution: "no lines" used to stand in as "the empty line", so
// submitting an untouched board -- or a board with no puzzle on it at all --
// matched it and reported a win.
export function check() {
  if (!hasSolution()) return null
  state.checked = true
  const mv = state.moves
  let best = null
  for (const sol of state.solutions) {
    const fw = divergence(sol, mv)
    if (fw === -1) {
      state.firstWrong = -1
      state.targetLen = sol.length
      return true
    }
    if (!best || fw > best.fw || (fw === best.fw && sol.length < best.len)) {
      best = { fw, len: sol.length }
    }
  }
  state.firstWrong = best.fw
  state.targetLen = best.len
  return false
}

// ---------- daily attempt limit ----------

// Editors test their own puzzles, so only regular players are limited.
const triesLimited = () => !config.canEdit

export const localToday = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD

const attemptKey = () => `${state.puzzleId || 'adhoc'}:${localToday()}`

export const outOfTries = () =>
  triesLimited() && !state.solved && state.tries >= MAX_TRIES

function persistAttempt() {
  try {
    const prev = JSON.parse(localStorage.getItem(ATTEMPTS_KEY)) || {}
    // Only today's records are worth keeping, so stale days are dropped.
    const map = {}
    const suffix = `:${localToday()}`
    for (const [k, v] of Object.entries(prev)) {
      if (k.endsWith(suffix)) map[k] = v
    }
    map[attemptKey()] = { tries: state.tries, solved: state.solved }
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(map))
  } catch {
    /* storage unavailable: the limit degrades to per-pageload */
  }
}

function restoreAttempt() {
  state.tries = 0
  state.solved = false
  if (!triesLimited()) return
  try {
    const rec = JSON.parse(localStorage.getItem(ATTEMPTS_KEY))?.[attemptKey()]
    if (rec) {
      state.tries = rec.tries || 0
      state.solved = !!rec.solved
    }
  } catch {
    /* ignore */
  }
}

// A submit is a checked attempt that consumes a try (for non-editors).
// Returns true/false like check(), or null when there was nothing to check --
// no recorded solution, or no try left. A puzzle with no solution must not
// spend a try or set `solved`, or one click on an empty board would lock the
// player out for the rest of the day.
export function submit() {
  if (!hasSolution()) return null
  if (triesLimited() && (state.solved || state.tries >= MAX_TRIES)) return null
  const ok = check()
  if (triesLimited()) {
    state.tries++
    if (ok) state.solved = true
    persistAttempt()
  }
  return ok
}

// ---------- cards ----------

function fileToThumb(file, maxDim = 640) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(img.width * scale))
        c.height = Math.max(1, Math.round(img.height * scale))
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', 0.82))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function addCardFiles(fileList) {
  for (const file of Array.from(fileList)) {
    try {
      const img = await fileToThumb(file)
      const id = uid()
      state.cards[id] = {
        id,
        name: file.name.replace(/\.[^.]+$/, ''),
        img,
        spellCost: { mana: 0, air: 0, earth: 0, fire: 0, water: 0 },
        affinity: { air: 0, earth: 0, fire: 0, water: 0 },
        manaProvided: 0,
      }
      state.zones.pool.push(id)
    } catch (e) {
      console.error('Could not load image', file.name, e)
    }
  }
}

// Card art already uploaded to the WordPress Media Library, searched by
// title and filename. Only available when the app runs inside WordPress
// (config.apiUrl set); the endpoint is editor-only.
export const canSearchMedia = () => remote()

export async function searchMedia(search, page = 1) {
  if (!remote()) return { items: [], total: 0, pages: 0 }
  const q = new URLSearchParams({ search, page: String(page) })
  return api(`/media?${q}`)
}

// Add a Media Library image to the pool as a card. The attachment id is
// kept alongside the URL so saving stores the reference rather than the
// resolved URL, and the image survives a site move.
export function addCardFromMedia(item) {
  const id = uid()
  state.cards[id] = {
    id,
    name: item.name || 'Card',
    img: item.url,
    imgId: item.id,
    spellCost: { mana: 0, air: 0, earth: 0, fire: 0, water: 0 },
    affinity: { air: 0, earth: 0, fire: 0, water: 0 },
    manaProvided: 0,
  }
  state.zones.pool.push(id)
  return id
}

// Remove every occurrence of a card from a set of zones in place.
function removeFromZones(zones, cardId) {
  for (const zone of Object.values(zones)) {
    const i = zone.indexOf(cardId)
    if (i !== -1) zone.splice(i, 1)
  }
}

// Clear any armed action or selection that was pointing at this card.
function clearArmed(cardId) {
  if (ui.attacker === cardId) ui.attacker = null
  if (ui.carrier === cardId) ui.carrier = null
  if (ui.striker === cardId) ui.striker = null
  if (ui.moving === cardId) ui.moving = null
  if (ui.selected === cardId) ui.selected = null
}

export function removeCard(cardId) {
  return withEditorSiteMana(() => removeCardImpl(cardId))
}

function removeCardImpl(cardId) {
  // Whatever it was holding is put down where it stood, rather than vanishing
  // with it into no zone at all.
  for (const itemId of carriedBy(cardId)) dropCarried(itemId)
  delete state.carry[cardId]
  for (const t of Object.keys(state.grants)) {
    if (t === cardId || state.grants[t].carrierId === cardId) delete state.grants[t]
  }
  delete state.cards[cardId]
  delete state.tapped[cardId]
  if (state.initialTapped) delete state.initialTapped[cardId]
  delete state.damage[cardId]
  if (state.initialDamage) delete state.initialDamage[cardId]
  removeFromZones(state.zones, cardId)
  const involves = (m) => m.cardId === cardId || m.targetId === cardId
  state.solutions = state.solutions.map((line) =>
    line.filter((m) => !involves(m))
  )
  state.draft = state.draft.filter((m) => !involves(m))
  state.moves = state.moves.filter((m) => !involves(m))
  clearArmed(cardId)
  if (state.initialZones) removeFromZones(state.initialZones, cardId)
}

// ---------- serialization / persistence ----------

// Everything a save would write, minus the timestamp and the generated id --
// both change on every call and would make the puzzle look permanently dirty.
// Taken on demand (a page unload, a New) rather than watched, so editing pays
// nothing for it.
export function fingerprint() {
  return JSON.stringify({
    name: state.puzzleName,
    desc: state.puzzleDesc,
    date: state.puzzleDate,
    enforce: state.enforce,
    combat: state.combat,
    cards: state.cards,
    initial: state.initialZones || state.zones,
    tapped: state.initialTapped || state.tapped,
    damage: state.initialDamage || state.damage,
    carry: state.initialCarry || state.carry,
    stats: state.initialStats || state.stats,
    solutions: state.solutions,
  })
}

// The fingerprint as of the last save, load or New. Everything since then is
// work a reload would silently destroy -- there is no autosave and no undo
// that reaches across a page load.
let savedPrint = fingerprint()

export function markSaved() {
  savedPrint = fingerprint()
}

export const hasUnsavedWork = () =>
  config.canEdit && !!Object.keys(state.cards).length && fingerprint() !== savedPrint

export function serialize() {
  return {
    version: FORMAT_VERSION,
    id: state.puzzleId || uid(),
    name: state.puzzleName || 'Untitled puzzle',
    desc: state.puzzleDesc || '',
    date: state.puzzleDate || null,
    enforce: !!state.enforce,
    combat: !!state.combat,
    cards: clone(state.cards),
    initial: clone(state.initialZones || state.zones),
    initialTapped: clone(state.initialTapped || state.tapped || {}),
    initialDamage: clone(state.initialDamage || state.damage || {}),
    carry: clone(state.initialCarry || state.carry),
    stats: clone(state.initialStats || state.stats),
    solutions: clone(state.solutions),
    savedAt: new Date().toISOString(),
  }
}

function normalizeZones(z) {
  const out = emptyZones()
  for (const [k, v] of Object.entries(z || {})) {
    if (out[k]) {
      out[k] = [...v]
    } else {
      // Legacy format: plain cell:N becomes the square's surface slot.
      const m = /^cell:(\d+)$/.exec(k)
      if (m) out[`cell:${m[1]}:top`]?.push(...v)
    }
  }
  return out
}

function normalizeStats(s) {
  const out = defaultStats()
  for (const side of ['player', 'opponent']) {
    Object.assign(out[side], s?.[side])
  }
  return out
}

export function loadPuzzle(data, { play = true } = {}) {
  state.puzzleId = data.id || uid()
  state.puzzleName = data.name || ''
  state.puzzleDesc = data.desc || ''
  state.puzzleDate = data.date || ''
  state.enforce = !!data.enforce
  state.combat = !!data.combat
  state.cards = clone(data.cards || {})
  for (const c of Object.values(state.cards)) {
    c.unit = !!(c.unit || c.avatar)
    c.avatar = !!c.avatar
    c.site = !!c.site
    c.aura = !!c.aura
    c.water = !!c.water
    c.artifact = !!c.artifact || !!c.monument || !!c.lanceToken
    c.monument = !!c.monument
    c.lanceToken = !!c.lanceToken
    c.magic = !!c.magic
    c.spellCost = {
      mana: Number(c.spellCost?.mana) || 0,
      air: Number(c.spellCost?.air) || 0,
      earth: Number(c.spellCost?.earth) || 0,
      fire: Number(c.spellCost?.fire) || 0,
      water: Number(c.spellCost?.water) || 0,
    }
    // Elemental affinity and mana a card provides in play (sites mainly). Sites
    // default to 1 mana.
    c.affinity = {
      air: Number(c.affinity?.air) || 0,
      earth: Number(c.affinity?.earth) || 0,
      fire: Number(c.affinity?.fire) || 0,
      water: Number(c.affinity?.water) || 0,
    }
    c.manaProvided = c.manaProvided == null ? (c.site ? 1 : 0) : Number(c.manaProvided) || 0
    c.power = Number(c.power) || 0
    // Toughness now derives from power; carry any old separate `life` over as a
    // `defense` override so earlier combat puzzles still resolve the same.
    if (c.defense == null && c.life != null) c.defense = Number(c.life) || 0
    delete c.life
    // Older puzzles predate abilities; normalize whatever is there (or nothing)
    // into the full shape the editor and runtime read, so no nested field is
    // ever undefined.
    c.abilities = Array.isArray(c.abilities)
      ? c.abilities.map(normalizeAbility)
      : []
  }
  state.initialZones = normalizeZones(data.initial)
  state.initialCarry = { ...data.carry }
  state.carry = clone(state.initialCarry)
  state.grants = {}
  state.strengthMod = {}
  state.grantedKeywords = {}
  state.summoned = {}
  state.stealthLost = {}
  state.wardBroken = {}
  storyStack = null
  state.zones = restoreZones(state.initialZones)
  state.initialStats = normalizeStats(data.stats)
  state.stats = clone(state.initialStats)
  state.initialTapped = clone(data.initialTapped || {})
  state.tapped = clone(state.initialTapped)
  state.initialDamage = clone(data.initialDamage || {})
  state.damage = clone(state.initialDamage)
  state.solutions = clone(data.solutions || [])
  state.draft = []
  state.moves = []
  state.events = []
  state.recording = false
  state.checked = false
  state.firstWrong = -1
  state.mode = play || !config.canEdit ? 'play' : 'editor'
  ui.attacker = null
  ui.striker = null
  ui.moving = null
  ui.carrier = null
  ui.activating = null
  ui.shooting = null
  ui.intercepting = null
  ui.awaitingDefender = null
  ui.storyChoice = null
  ui.selected = null
  restoreAttempt()
  markSaved()
}

export function newPuzzle() {
  state.puzzleId = null
  state.puzzleName = ''
  state.puzzleDesc = ''
  state.puzzleDate = ''
  state.enforce = false
  state.combat = false
  state.cards = {}
  state.zones = emptyZones()
  state.carry = {}
  state.grants = {}
  state.strengthMod = {}
  state.grantedKeywords = {}
  state.summoned = {}
  state.stealthLost = {}
  state.wardBroken = {}
  storyStack = null
  state.initialZones = null
  state.initialCarry = null
  state.stats = defaultStats()
  state.initialStats = null
  state.tapped = {}
  state.initialTapped = null
  state.damage = {}
  state.initialDamage = null
  state.solutions = []
  state.draft = []
  state.moves = []
  state.events = []
  state.recording = false
  state.checked = false
  state.firstWrong = -1
  state.tries = 0
  state.solved = false
  state.mode = config.canEdit ? 'editor' : 'play'
  ui.attacker = null
  ui.striker = null
  ui.moving = null
  ui.carrier = null
  ui.activating = null
  ui.shooting = null
  ui.intercepting = null
  ui.awaitingDefender = null
  ui.storyChoice = null
  ui.selected = null
  markSaved()
}

function readStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch {
    return {}
  }
}

function writeStore(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

// Persistence goes to the WordPress REST API when config.apiUrl is set
// (shared, site-wide storage) and falls back to localStorage when the app
// runs standalone. All four operations are async either way so callers
// don't care which backend is active. Save/delete errors propagate to the
// caller; load/list errors resolve to false/[] like a missing puzzle.

export async function savePuzzle() {
  if (!state.initialZones) state.initialZones = clone(state.zones)
  const data = serialize()
  if (remote()) {
    const saved = await api('/puzzles', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    state.puzzleId = saved.id
    markSaved()
    return saved
  }
  state.puzzleId = data.id
  const map = readStore()
  map[data.id] = data
  writeStore(map)
  markSaved()
  return data
}

export async function listPuzzles() {
  if (remote()) {
    try {
      return await api('/puzzles')
    } catch {
      return []
    }
  }
  return Object.values(readStore()).sort((a, b) =>
    (a.savedAt || '') < (b.savedAt || '') ? 1 : -1
  )
}

// A puzzle is released once it has a date and that date has arrived.
// Undated puzzles are drafts only editors can see. In remote mode the
// server enforces this; the local checks mirror it for standalone use.
const released = (p) => !!p.date && p.date <= localToday()

export async function loadById(id, opts) {
  if (remote()) {
    try {
      loadPuzzle(await api(`/puzzles/${encodeURIComponent(id)}`), opts)
      return true
    } catch {
      return false
    }
  }
  const p = readStore()[id]
  if (!p || (!config.canEdit && !released(p))) return false
  loadPuzzle(p, opts)
  return true
}

// Dated puzzle summaries for the archive calendar, oldest first. Remote
// lists are already filtered per viewer by the server (players only get
// released puzzles; editors also get upcoming ones, which the calendar
// shows dimmed).
export async function listArchive() {
  let list
  if (remote()) {
    try {
      list = await api('/puzzles')
    } catch {
      return []
    }
  } else {
    list = Object.values(readStore())
    if (!config.canEdit) list = list.filter(released)
  }
  return list
    .filter((x) => x.date)
    .map((x) => ({ id: x.id, name: x.name, date: x.date }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

export async function deletePuzzle(id) {
  if (remote()) {
    await api(`/puzzles/${encodeURIComponent(id)}`, { method: 'DELETE' })
    return
  }
  const map = readStore()
  delete map[id]
  writeStore(map)
}

// ---------- current puzzle ----------

// The current puzzle is the released one with the latest date, tie-broken
// by id, so a weekly (or daily) schedule just means saving puzzles with
// the right release dates. The server's /daily mirrors this exactly.
// Newest release first, ties broken by id descending -- the same order the
// server's /daily endpoint uses to pick the current puzzle.
function byReleaseDesc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return a.id < b.id ? 1 : -1
}

export async function loadDaily() {
  if (remote()) {
    try {
      loadPuzzle(await api('/daily'))
      return true
    } catch {
      return false
    }
  }
  const current = (await listPuzzles()).filter(released).sort(byReleaseDesc)[0]
  if (!current) return false
  loadPuzzle(current)
  return true
}

// ---------- share links / URL loading ----------

// UTF-8-safe base64. btoa/atob only handle Latin-1, so the string is taken
// through its byte representation rather than the deprecated escape/unescape.
const b64encode = (s) => {
  const bytes = new TextEncoder().encode(s)
  const binary = Array.from(bytes, (b) => String.fromCodePoint(b)).join('')
  return btoa(binary)
}
const b64decode = (s) => {
  const bytes = Uint8Array.from(atob(s), (ch) => ch.codePointAt(0))
  return new TextDecoder().decode(bytes)
}

export function shareLink() {
  const data = b64encode(JSON.stringify(serialize()))
  const base = location.origin + location.pathname
  return `${base}?data=${encodeURIComponent(data)}`
}

export async function initFromUrl(options = {}) {
  const q = new URLSearchParams(location.search)
  const data = options.data || q.get('data')
  const src = options.src || q.get('src')
  const puzzle = options.puzzle || q.get('puzzle')
  const daily = options.daily || q.has('daily')

  try {
    if (data) {
      loadPuzzle(JSON.parse(b64decode(data)))
      return true
    }
    if (src) {
      const res = await fetch(src)
      loadPuzzle(await res.json())
      return true
    }
    if (puzzle) return loadById(puzzle)
    if (daily) return loadDaily()
  } catch (e) {
    console.error('Failed to load puzzle from URL', e)
  }
  return false
}
