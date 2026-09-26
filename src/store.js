import { reactive, computed, watch } from 'vue'

export const GRID_COLS = 5
export const GRID_ROWS = 4
export const GRID_SIZE = GRID_COLS * GRID_ROWS
// Interior crossings of the grid lines where four squares meet. Auras sit on
// these intersections rather than in a square.
export const INTERSECTION_COLS = GRID_COLS - 1
export const INTERSECTION_ROWS = GRID_ROWS - 1
export const INTERSECTIONS = INTERSECTION_COLS * INTERSECTION_ROWS

const STORAGE_KEY = 'sorceryPuzzles.v1'
// Per-puzzle, per-day play progress (mistakes + solved/failed lock) for limited
// players. Soft: clearing localStorage resets it.
const ATTEMPTS_KEY = 'sorceryAttempts.v1'
// 2: adjacent/nearby include the source's own square (rulebook glossary). Older
// files are not supported.
const FORMAT_VERSION = 2

// A self-contained ?data= share link longer than this is treated as too big to
// be usable (browsers and chat apps truncate very long URLs). Past it we steer
// the user to a short ?puzzle= link or hosted JSON instead.
const MAX_DATA_URL = 8000

// WordPress puzzle ids are numeric post IDs; localStorage ids are random
// strings. A numeric id means the puzzle lives on the server, so a share link
// can point at it directly instead of inlining the whole puzzle.
const isServerId = (id) => /^\d+$/.test(String(id))

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
  // The card in flight, so a drop zone can refuse (and not light up for) a
  // drop moveCard would reject anyway -- e.g. a realm card over the hand.
  dragCard: null,
  // Card whose actions are offered in the docked action bar. Selecting is
  // also how a card is picked up without dragging: click the card, then
  // click the zone it should go to.
  selected: null,
  // Transient cosmetic effects queue (flashes, projectiles). Purely visual:
  // never serialized, never part of undo or solution checking. Entries are
  // { id, kind, cardId?, sourceId?, targetId?, style? } and auto-expire (see
  // emitFx). A projectile's style is 'arrow' | 'fireball' | 'bolt'.
  fx: [],
})

// How long each effect kind stays in `ui.fx` before it self-removes (ms).
const FX_DURATION = {
  cast: 800,
  genesis: 800,
  death: 700,
  impact: 500,
  projectile: 800,
  trigger: 1800,
}

// Fire a cosmetic effect. It only plays during solving (player-facing, so
// authoring/recording is never interrupted) and is
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
  // Reversible in-play water state by square. A site is water when its own
  // affinity has a water threshold or when this map marks it as flooded.
  floodedSites: {},
  initialFloodedSites: null,
  // Gameplay-only modifiers, populated by effects (Layer C) and folded into the
  // derived `effective` map. Base strength/keywords live on the card art and are
  // never stored; only in-play changes are: strengthMod is a signed counter, and
  // grantedKeywords is a list of keywords added during play.
  strengthMod: {}, // cardId -> signed strength delta
  grantedKeywords: {}, // cardId -> [keyword, ...]
  // Non-units turned into minions by an `animate` effect:
  // cardId -> { power, powerRef, powerBonus } (see animatedPower).
  // Lasts until the card leaves the realm. (A passive's conditional animation
  // is derived, not stored -- see passiveAnimated.)
  animated: {},
  // One-shot permissions to cast a card from where it lies (e.g. a spell a
  // banishAndCast effect let you cast from banishment):
  // cardId -> { side, free }. Consumed by the cast.
  castPermits: {},
  // Cards whose control changed in play (a spell cast out of the opponent's
  // cemetery): cardId -> true. card.enemy is flipped live; this remembers which
  // flips to reverse on undo, reset and save.
  controlFlips: {},
  // Units summoned this turn (entered the realm from hand during play) -- what
  // Charge keys off. Single-turn approximation: never cleared within a puzzle.
  summoned: {}, // cardId -> true
  // Stealth is lost once the unit interacts with the realm (takes any action).
  stealthLost: {}, // cardId -> true
  // A Ward breaks once it absorbs an opponent's targeting/damage/destroy ability.
  wardBroken: {}, // cardId -> true
  // Named counters placed on cards during play by addCounter/removeCounter
  // effects: cardId -> { name: count }. The reserved name 'shield' is damage
  // prevention: each point absorbs one point of damage to that card
  // (preventDamage adds them). Shed when the card leaves the realm.
  counters: {},
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
  // Automatic solve/mistake tracking (see evaluatePlay). Wrong moves are snapped
  // back and counted; solved/failed lock a limited player out for the day.
  mistakes: 0, // wrong moves made today for this puzzle (non-editors only)
  solved: false, // solved today (non-editors: persisted + locks input)
  failed: false, // hit the mistake cap today (non-editors: persisted + locks)
  solveQuality: '', // 'optimal' | 'partial' once solved, for the verdict banner
  // Puzzle setting: draw-deck zones the author isn't using. A hidden zone is
  // still drawn while it holds cards, so nothing on the table goes invisible.
  hideAtlas: false,
  hideSpellbook: false,
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
  if (m)
    return `${squareLabel(m[1])} (${
      regionOf(Number(m[1]), 'bot') === 'underwater' ? 'submerged' : 'buried'
    })`
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

// A site's water type is derived from its authored threshold, the transient
// Flood state, and any passive ability of its own that grants water affinity.
// Other elemental thresholds do not turn off water; the presence of a positive
// water affinity is enough. A granted affinity is an ability, so silencing the
// site takes it -- and with it the water -- away; its printed affinity stays.
export function isWaterSite(square) {
  const site = siteOn(square)
  if (!site) return false
  if (Number(site.affinity?.water) > 0 || !!state.floodedSites[String(square)]) return true
  return grantsWater(site)
}

// Guards: a passive's own condition may ask whether its site is water (onWater),
// and silence is derived from passives whose reach can depend on regions -- so
// while the passive traits are being resolved (resolvingPassives) silence isn't
// consulted, and a site's water grant never re-enters itself.
let resolvingPassives = false
const resolvingWater = new Set()
function grantsWater(site) {
  if (resolvingWater.has(site.id)) return false
  resolvingWater.add(site.id)
  try {
    if (!passivesOf(site).some((a) => Number(a.passive?.affinity?.water) > 0)) return false
    return resolvingPassives || !isSilenced(site.id)
  } finally {
    resolvingWater.delete(site.id)
  }
}

export function isLandSite(square) {
  return !!siteOn(square) && !isWaterSite(square)
}

export function isFloodedSite(square) {
  return !!siteOn(square) && !!state.floodedSites[String(square)]
}

// Change the reversible site state and immediately apply state-based survival.
// Ability entries pass their own snapshot; direct setup changes get a small
// synthetic transition so the same survival rules and death events are used.
export function setFloodedSite(square, flooded, entry = null) {
  const site = siteOn(square)
  const n = Number(square)
  if (!site || !Number.isInteger(n) || n < 0 || n >= GRID_SIZE) return false
  const key = String(n)
  const next = !!flooded
  const previous = !!state.floodedSites[key]
  if (previous === next) return false
  const before = clone(state.floodedSites)
  if (next) state.floodedSites[key] = true
  else delete state.floodedSites[key]
  // Survival only bites while a solution is played or recorded. The editor
  // stays free-form, so toggling water while building a position never sweeps
  // units off to the cemetery. An effect-driven change (with its own entry)
  // always resolves survival, since it only happens during play anyway.
  if (entry || enforcing()) {
    const transition = entry || { type: 'flood', square: n, flooded: next }
    if (!transition.prevFloodedSites) transition.prevFloodedSites = before
    checkSurvival(transition)
  }
  return true
}

// The square a site card currently sits on, or null if it is not on the board.
function squareOfSite(cardId) {
  const m = /^site:(\d+)$/.exec(zoneOf(cardId) || '')
  return m ? Number(m[1]) : null
}

// On-board orthogonal neighbours (up/down/left/right) of a grid square. Diagonals
// are deliberately excluded: a body of water is connected cardinally only.
function orthogonalSquares(square) {
  const n = Number(square)
  const row = Math.floor(n / GRID_COLS)
  const col = n % GRID_COLS
  const out = []
  if (row > 0) out.push(n - GRID_COLS)
  if (row < GRID_ROWS - 1) out.push(n + GRID_COLS)
  if (col > 0) out.push(n - 1)
  if (col < GRID_COLS - 1) out.push(n + 1)
  return out
}

// The body of water a square belongs to: the maximal set of orthogonally
// connected water sites reachable from it (flood-fill, cardinal steps only).
// Returns null when the square itself is not a water site. `sites`/`squares`
// are the member square indices (ascending) and `size` their count -- enough for
// an ability to target the connected set, its area, or scale off its size.
export function waterBodyAt(square) {
  const n = Number(square)
  if (!isWaterSite(n)) return null
  const seen = new Set([n])
  const stack = [n]
  while (stack.length) {
    const cur = stack.pop()
    for (const nb of orthogonalSquares(cur)) {
      if (!seen.has(nb) && isWaterSite(nb)) {
        seen.add(nb)
        stack.push(nb)
      }
    }
  }
  const sites = [...seen].sort((a, b) => a - b)
  return { sites, squares: sites, size: sites.length }
}

// How large the body of water at a square is (0 if it is not water).
export const waterBodySizeAt = (square) => waterBodyAt(square)?.size || 0

// The side that controls the site on a square (its owner), or null with no site.
// A minion may not be summoned onto a site the opponent controls unless its card
// explicitly allows it.
function siteControllerSide(square) {
  const site = siteOn(square)
  return site ? (site.enemy ? 'opponent' : 'player') : null
}

// Whether a minion may be cast onto a board location given site control. Only
// minions are gated; avatars, artifacts, auras, and magic use their own paths.
// An open square (no site) or one you control is always fine; an opponent's site
// needs the `summonOnEnemySites` trait, which comes from a passive ability (the
// card's own, or one day an aura lending it to other cards) via `effective`.
export function canCastMinionTo(cardId, zone) {
  const card = state.cards[cardId]
  if (!card || !card.unit || card.avatar) return true
  const m = /^cell:(\d+):(top|bot)$/.exec(routeZone(cardId, zone) || '')
  if (!m) return true
  const owner = siteControllerSide(Number(m[1]))
  if (!owner) return true
  const casterSide = card.enemy ? 'opponent' : 'player'
  if (owner === casterSide) return true
  return canSummonOnEnemySites(cardId)
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
    return isWaterSite(square) ? 'underwater' : 'underground'
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
  // Oversized units: anchored on their top-left square, with all four listed.
  for (let i = 0; i < INTERSECTIONS; i++) {
    for (const id of state.zones[`aura:${i}`] || []) {
      if (!isOversized(id)) continue
      const squares = intersectionSquares(i)
      out.push({ id, card: state.cards[id], square: squares[0], squares, region: 'surface' })
    }
  }
  return out
}

// Where a card sits, resolved to a { square, region }, or null if not on a cell.
function unitCell(cardId) {
  const big = oversizedAt(cardId)
  if (big != null) {
    const squares = intersectionSquares(big)
    return { square: squares[0], squares, region: 'surface' }
  }
  const m = /^cell:(\d+):(top|bot)$/.exec(zoneOf(cardId) || '')
  if (!m) return null
  return { square: Number(m[1]), region: regionOf(Number(m[1]), m[2]) }
}

// A card's authored abilities, including those it has gained. A grant (an
// assumed form) hands every ability of the granted card to its carrier: the
// carrier holds its triggers, activated abilities and passives, and the granted
// card -- carried only so the player can see what was gained -- holds none of
// its own. The basics every unit/avatar has (move, attack, draw) aren't
// authored abilities, so they never double up.
function abilitiesOf(cardId) {
  if (state.grants[cardId]) return []
  const out = [...(state.cards[cardId]?.abilities || [])]
  const seen = new Set([cardId])
  const walk = (id) => {
    for (const t of Object.keys(state.grants)) {
      if (state.grants[t].carrierId !== id || seen.has(t)) continue
      seen.add(t)
      out.push(...(state.cards[t]?.abilities || []))
      walk(t)
    }
  }
  walk(cardId)
  return out
}

// A passive applies only while its condition holds (always, by default).
const passivesOf = (card) =>
  card
    ? abilitiesOf(card.id).filter(
        (a) => a.kind === 'passive' && passiveConditionMet(card.id, a.condition)
      )
    : []

// Is a passive's "only while" condition true for its source right now? Reads
// only the raw board and stats -- never `effective` or a passive animation --
// so evaluating it can't feed back into the traits it switches on (see
// conditionHolds, `raw`).
function passiveConditionMet(sourceId, cond) {
  return conditionHolds(cond, { sourceId, raw: true })
}

// The card a condition's `subject` names in this context: the ability's own
// card (default), its first chosen target, or the card that set a trigger off.
function conditionSubject(cond, ctx) {
  if (cond.subject === 'target') return ctx.targetId ?? null
  if (cond.subject === 'triggering') return ctx.triggeringId ?? null
  if (cond.subject === 'other') return ctx.otherId ?? null
  return ctx.sourceId ?? null
}

// Does a condition hold? `ctx` is { sourceId, targetId, triggeringId, ... } --
// the same shape selectors read. With `raw` (a passive's condition, evaluated
// while the passive traits themselves are being derived) it reads only the raw
// board and stats: a keyword counts only if the card has it itself (its own
// unconditional passives, or gained in play), affinity is the stats plus what
// cards in play provide, and card kinds ignore passive animation.
export function conditionHolds(cond, ctx) {
  const type = cond?.type || 'always'
  if (type === 'always') return true
  const v = testCondition(cond, ctx)
  return cond.not ? !v : v
}

function testCondition(cond, ctx) {
  const type = cond.type
  if (type === 'all') return (cond.of || []).every((c) => conditionHolds(c, ctx))
  if (type === 'any') return (cond.of || []).some((c) => conditionHolds(c, ctx))
  const sourceId = ctx.sourceId
  const card = state.cards[sourceId]
  if (!card) return false
  const n = Number(cond.amount) || 0
  const own = sideOf(sourceId)
  const side = cond.whose === 'enemy' ? otherSide(own) : own
  const stats = state.stats[side] || {}
  if (type === 'lifeAtMost') return (stats.life || 0) <= n
  if (type === 'lifeAtLeast') return (stats.life || 0) >= n
  if (type === 'manaAtLeast') return (stats.mana || 0) >= n
  if (type === 'affinityAtLeast') {
    const el = cond.element || 'fire'
    return (ctx.raw ? rawThreshold(side, el) : effectiveThreshold(side, el)) >= n
  }
  if (type === 'controlsCard') {
    const sel = cond.selector || { who: 'area', area: normalizeArea({ shape: 'realm', side: 'friendly', filter: 'minion' }) }
    return selectCards(sel, ctx).length >= Math.max(1, n)
  }
  const id = conditionSubject(cond, ctx)
  if (!id || !state.cards[id]) return false
  if (type === 'untapped') return !state.tapped[id]
  if (type === 'tapped') return !!state.tapped[id]
  if (type === 'damaged') return damageOf(id) > 0
  if (type === 'hasKeyword')
    return ctx.raw ? ownKeywords(id).has(cond.keyword) : hasKeyword(id, cond.keyword)
  if (type === 'region') return regionOfCard(id) === cond.region
  // The rest look at where the card stands on the board.
  if (state.carry[id]) return false
  const node = nodeOf(id)
  if (!node) return false
  if (type === 'onWater') return isWaterSite(node.sq)
  if (type === 'onLand') return isLandSite(node.sq)
  if (type === 'onFlooded') return isFloodedSite(node.sq)
  return true
}

// Keywords a card has of itself, read raw: its own unconditional self
// passives and keywords gained in play (not those lent by other cards).
function ownKeywords(id) {
  const out = new Set(state.grantedKeywords[id] || [])
  for (const a of abilitiesOf(id)) {
    if (a.kind !== 'passive' || a.scope !== 'self' || (a.condition?.type || 'always') !== 'always') continue
    for (const k of a.passive?.keywords || []) out.add(k)
  }
  return out
}

// A side's threshold read raw: its stat plus what its cards in play provide
// (a site animated into a minion provides nothing).
function rawThreshold(side, el) {
  let sum = state.stats[side]?.[el] || 0
  for (const id of inPlayCards(side)) {
    if (state.cards[id].site && state.animated[id]) continue
    sum += Number(state.cards[id].affinity?.[el]) || 0
  }
  return sum
}

// A card's region: a unit's cell region, a site's (or an oversized minion's)
// surface; a carried card its bearer's (zoneOf resolves carry).
function regionOfCard(id) {
  const z = zoneOf(id) || ''
  if (/^(site|aura):\d+$/.test(z)) return 'surface'
  return zoneRegion(z)
}

// A card-kind filter read raw (a unit is printed as one or animated by an
// effect), for conditions evaluated inside the passive computation.
function rawMatchesFilter(id, filter) {
  const c = state.cards[id]
  if (!c) return false
  const unit = !!(c.unit || c.avatar || state.animated[id])
  if (filter === 'unit') return unit
  if (filter === 'minion') return unit && !c.avatar
  return matchesFilter(c, filter)
}

// Non-units a self-scoped "animate" passive currently makes into minions:
// cardId -> { power }. Only a card standing on a realm square (not carried, not
// a site) can be animated, and only while the passive's condition holds -- so a
// conditional animation switches on and off with the board, like any passive.
const passiveAnimated = computed(() => {
  const out = {}
  for (const c of Object.values(state.cards)) {
    // Sites animate only through an effect: leaving Rubble behind is a one-way
    // change a condition switching off couldn't undo.
    if (c.unit || c.avatar || c.site || state.carry[c.id]) continue
    const z = zoneOf(c.id) || ''
    if (!/^cell:\d+:(top|bot)$/.test(z) && !(c.aura && /^aura:\d+$/.test(z))) continue
    for (const a of c.abilities || []) {
      if (a.kind !== 'passive' || a.scope !== 'self' || !a.passive?.animate) continue
      if (!passiveConditionMet(c.id, a.condition)) continue
      out[c.id] = {
        power: Number(a.passive.animatePower) || 0,
        powerRef: a.passive.animatePowerRef,
        powerBonus: Number(a.passive.animatePowerBonus) || 0,
      }
      break
    }
  }
  return out
})

// Where an animated object's power comes from: a fixed number, or one of the
// card's own characteristics (plus a bonus), so "a minion with power equal to
// its mana cost" is authored once and follows the card.
export const ANIMATE_POWER_REFS = ['literal', 'manaCost', 'thresholdCost', 'totalCost']

export function animatedPower(cardId, spec) {
  const ref = spec?.powerRef || 'literal'
  if (ref === 'literal') return Math.max(0, Number(spec?.power) || 0)
  const cost = state.cards[cardId]?.spellCost || {}
  const mana = Number(cost.mana) || 0
  const threshold = ELEMENTS.reduce((n, el) => n + (Number(cost[el]) || 0), 0)
  const base = ref === 'manaCost' ? mana : ref === 'thresholdCost' ? threshold : mana + threshold
  return Math.max(0, base + (Number(spec?.powerBonus) || 0))
}

// A card's animation in force, from an effect or a passive, or null.
export function animationOf(cardId) {
  const a = state.animated?.[cardId]
  if (a && !animationExpired(cardId, a, false)) return a
  return passiveAnimated.value[cardId] || null
}

// How long an effect's animation lasts. Puzzles are a single turn, so there is
// no "until end of turn": that is simply 'permanent' (until it leaves the realm).
export const ANIMATE_DURATIONS = ['permanent', 'taps', 'damaged', 'sourceLeaves']

// Has an effect's animation run out? Checked live (so undo simply restores it),
// except 'damaged', which is settled only after deaths resolve: a hit big enough
// to kill it must kill it as a minion rather than first turning it back into an
// object that shrugs the damage off.
function animationExpired(cardId, a, includeDamage) {
  switch (a.duration) {
    case 'taps':
      return !a.tapped0 && !!state.tapped[cardId]
    case 'damaged':
      return includeDamage && (state.damage[cardId] || 0) > (a.damage0 || 0)
    case 'sourceLeaves': {
      if (!a.sourceId || a.sourceId === cardId) return false
      return !['realm', 'aura'].includes(zoneCategory(zoneOf(a.sourceId)))
    }
    default:
      return false
  }
}

// Tidy up animations that have run out, as a consequence of `entry`: announce
// it, and put an animated site back into a site slot -- its current square's if
// that is empty or only Rubble (which it replaces), else it goes to its
// cemetery, as a site can't stand on a square's surface. Undo rides the entry's
// prevAnimated / structural snapshots.
function settleAnimations(entry) {
  for (const id of Object.keys(state.animated || {})) {
    const a = state.animated[id]
    if (!animationExpired(id, a, true)) continue
    delete state.animated[id]
    const c = state.cards[id]
    if (!c) continue
    let text = `${cardName(id)} is no longer animated.`
    const m = /^cell:(\d+):(top|bot)$/.exec(zoneOf(id) || '')
    if (c.site && m) {
      snapshotStructural(entry)
      removeFromZones(state.zones, id)
      const slot = `site:${m[1]}`
      const occupant = state.zones[slot][0]
      if (occupant && state.cards[occupant]?.token === 'rubble') {
        state.zones[slot].splice(0, 1)
      }
      if (!state.zones[slot].length) {
        state.zones[slot].push(id)
        text = `${cardName(id)} settles back into a site.`
      } else {
        const grave = `grave:${sideOf(id)}`
        state.zones[grave].push(id)
        shedInPlayState(id, grave, entry)
        text = `${cardName(id)} has no site to return to and goes to the cemetery.`
      }
    }
    state.events.push({ id: uid(), seq: entry?.seq, cardId: id, name: 'Animation ends', text })
  }
}
export const isAnimated = (cardId) => !!animationOf(cardId)

// ---------- global passives: swapped cemeteries, cemetery tax ----------

// Passives that apply from where their card is in play (realm, site slots,
// intersections), condition met and source not silenced: [{ card, a }].
function passivesInPlay() {
  const out = []
  for (const card of Object.values(state.cards)) {
    if (!['realm', 'aura'].includes(cardZoneCategory(card.id))) continue
    if (isSilenced(card.id)) continue
    for (const a of passivesOf(card)) out.push({ card, a })
  }
  return out
}

// "You consider your opponent's cemetery yours, and vice versa." A swap, not a
// share: each player's cemetery is the opponent's, and their own is not theirs.
export function cemeteriesSwapped() {
  return passivesInPlay().some(({ a }) => a.passive.swapCemeteries)
}

// Extra mana `side` pays to interact with a cemetery card right now.
export function cemeteryTaxFor(side) {
  let tax = 0
  for (const { card, a } of passivesInPlay()) {
    const n = Number(a.passive.cemeteryTax) || 0
    if (!n) continue
    const mine = sideOf(card.id) === side
    const on = a.passive.cemeteryTaxOn || 'everyone'
    if (on === 'everyone' || (on === 'you' && mine) || (on === 'opponent' && !mine)) tax += n
  }
  return tax
}

// Who casts this card from where it lies: a permit names its caster; with
// cemeteries swapped, a cemetery card belongs to the other side's "own"
// cemetery (the solver casts the opponent's graveyard cards, not their own);
// otherwise its controller.
export function castSide(cardId) {
  const permit = state.castPermits[cardId]
  if (permit) return permit.side
  if (cardZoneCategory(cardId) === 'cemetery' && cemeteriesSwapped())
    return sideOf(cardId) === 'player' ? 'opponent' : 'player'
  return sideOf(cardId)
}

// Hand a card to `side`, remembering the change so undo/reset can reverse it.
function takeControl(cardId, side) {
  const c = state.cards[cardId]
  if (!c || sideOf(cardId) === side) return
  c.enemy = side === 'opponent'
  if (state.controlFlips[cardId]) delete state.controlFlips[cardId]
  else state.controlFlips[cardId] = true
}

// Bring control back in line with a snapshot of the flips map (undo).
function restoreControlFlips(prev) {
  const ids = new Set([...Object.keys(state.controlFlips), ...Object.keys(prev || {})])
  for (const id of ids) {
    if (!!state.controlFlips[id] !== !!prev?.[id] && state.cards[id]) {
      state.cards[id].enemy = !state.cards[id].enemy
    }
  }
  state.controlFlips = clone(prev || {})
}
const revertControlFlips = () => restoreControlFlips({})

// How many more times this card may activate this ability this turn (Infinity
// when unlimited). Counted from the logged moves, so undo gives a use back and
// a reset clears them all.
export function abilityUsesLeft(cardId, ability) {
  const limit = Number(ability?.cost?.perTurn) || 0
  if (!limit) return Infinity
  const list = state.recording ? state.draft : state.moves
  const used = list.filter(
    (m) => m.type === 'ability' && m.cardId === cardId && m.abilityId === ability.id
  ).length
  return Math.max(0, limit - used)
}

// Whether a card's side can pay an activated ability's mana (abilityManaCost)
// and meet its elemental threshold (checked, not spent) -- the same test a spell
// cast uses.
export function canAffordAbility(cardId, ability) {
  if (!ability) return false
  const side = sideOf(cardId)
  const s = state.stats[side]
  if (!s) return false
  if ((s.mana || 0) < abilityManaCost(cardId, ability)) return false
  for (const el of ELEMENTS)
    if (effectiveThreshold(side, el) < (Number(ability.cost?.threshold?.[el]) || 0)) return false
  const cost = ability.cost || {}
  if ((s.life || 0) < (Number(cost.life) || 0)) return false
  if (costCards(cardId, 'hand').length < (Number(cost.discard) || 0)) return false
  if (costCards(cardId, 'grave').length < (Number(cost.banish) || 0)) return false
  if (cost.sacrifice === 'self' && !sacrificeable(cardId, cardId)) return false
  if (cost.sacrifice === 'target') {
    const t = ability.target
    const any = Object.keys(state.cards).some(
      (id) => id !== cardId && sacrificeable(cardId, id) && (!t?.required || satisfiesTarget(cardId, id, t))
    )
    if (!any) return false
  }
  return true
}

// A card an ability of `sourceId` may sacrifice: a non-avatar in play on the
// source's side (the source itself, for a self-sacrifice).
function sacrificeable(sourceId, id) {
  const c = state.cards[id]
  if (!c || c.avatar) return false
  if (!inPlay(id)) return false
  return !oppositeSides(sourceId, id)
}

// The cards a discard ('hand') or banish-from-cemetery ('grave') cost draws on,
// in the order they are paid: the source's side, first cards first (there is no
// choice UI for costs yet), never the source itself.
function costCards(sourceId, zonePrefix) {
  return (state.zones[`${zonePrefix}:${sideOf(sourceId)}`] || []).filter((id) => id !== sourceId)
}

// Pay an activated ability's card costs (after it is logged, so their events
// and "move" triggers key off its seq). Pays what it can: the free-form editor
// doesn't gate on affordability.
function payCardCosts(cardId, ability, targetId, entry) {
  const cost = ability.cost || {}
  const side = sideOf(cardId)
  for (const id of costCards(cardId, 'hand').slice(0, Number(cost.discard) || 0))
    effectMove(id, `grave:${side}`, entry, 'Discarded', `${cardName(id)} is discarded as a cost.`)
  for (const id of costCards(cardId, 'grave').slice(0, Number(cost.banish) || 0))
    effectMove(id, `banished:${side}`, entry, 'Banished', `${cardName(id)} is banished from the cemetery as a cost.`)
  const victim = cost.sacrifice === 'self' ? cardId : cost.sacrifice === 'target' ? targetId : null
  if (victim && sacrificeable(cardId, victim)) {
    const text = `${cardName(victim)} is sacrificed.`
    // A sacrificed unit dies (Deathrite fires); anything else just goes.
    if (isUnit(victim)) sendToCemetery(victim, entry, 'Sacrificed', text)
    else effectMove(victim, `grave:${sideOf(victim)}`, entry, 'Sacrificed', text)
  }
}

// Cost gating bites only while rules are enforced (play and recording), like
// the other activation gates; the free-form editor never activates anyway.
export const abilityCostBlocked = (cardId, ability) =>
  enforcing() && !canAffordAbility(cardId, ability)

// An activated ability's mana cost now: its printed cost, plus any cemetery
// tax when it picks cemetery cards.
export function abilityManaCost(cardId, ability) {
  // A passive 'abilities' cost modifier on the card changes its printed cost
  // (never below 0).
  let mana = Math.max(0, (Number(ability?.cost?.mana) || 0) + (traits(cardId)?.abilityCostMod || 0))
  const t = ability?.target
  if (t?.mode === 'card' && t.required && t.from === 'cemetery') {
    mana += cemeteryTaxFor(sideOf(cardId))
  }
  return mana
}

// ---------- oversized minions (animated auras) ----------

// An animated aura on an intersection is an oversized minion: it occupies the
// surface of all four squares around that crossing and moves crossing to
// crossing. Taken off an intersection it is an ordinary one-square minion.
function oversizedAt(cardId) {
  const c = state.cards[cardId]
  if (!c?.aura || !animationOf(cardId)) return null
  const m = /^aura:(\d+)$/.exec(zoneOf(cardId) || '')
  return m ? Number(m[1]) : null
}
export const isOversized = (cardId) => oversizedAt(cardId) != null

// The four squares around intersection `i`, top-left first.
export function intersectionSquares(i) {
  const r = Math.floor(i / INTERSECTION_COLS)
  const c = i % INTERSECTION_COLS
  const tl = r * GRID_COLS + c
  return [tl, tl + 1, tl + GRID_COLS, tl + GRID_COLS + 1]
}

// Every square a unit occupies (four for an oversized one), or [] off-board.
export function squaresOf(cardId) {
  const i = oversizedAt(cardId)
  if (i != null) return intersectionSquares(i)
  const n = nodeOf(cardId)
  return n ? [n.sq] : []
}

// Intersections an oversized unit can reach within its movement: a step goes
// to an orthogonally neighbouring crossing (diagonal too while Airborne), and it
// may only stand where none of its four squares is void, unless it Voidwalks.
function reachableIntersections(unitId) {
  const start = oversizedAt(unitId)
  const set = new Set()
  if (start == null || isDisabled(unitId)) return set
  const kw = effectiveKeywords(unitId)
  const standable = (i) =>
    kw.has('voidwalk') ||
    intersectionSquares(i).every((sq) => regionOf(sq, 'top') !== 'void')
  set.add(start)
  let frontier = [start]
  for (let d = 0; d < effectiveMovement(unitId); d++) {
    const next = []
    for (const f of frontier) {
      const fr = Math.floor(f / INTERSECTION_COLS)
      const fc = f % INTERSECTION_COLS
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue
          if (dr && dc && !kw.has('airborne')) continue
          const r = fr + dr
          const c = fc + dc
          if (r < 0 || c < 0 || r >= INTERSECTION_ROWS || c >= INTERSECTION_COLS) continue
          const g = r * INTERSECTION_COLS + c
          if (set.has(g) || !standable(g)) continue
          set.add(g)
          next.push(g)
        }
      }
    }
    frontier = next
  }
  return set
}

// Oversized units standing on a square (they are in an aura zone, not a cell).
function oversizedOnSquare(idx) {
  const out = []
  for (let i = 0; i < INTERSECTIONS; i++) {
    for (const id of state.zones[`aura:${i}`] || []) {
      if (isOversized(id) && intersectionSquares(i).includes(idx)) out.push(id)
    }
  }
  return out
}

// The units a passive on `sourceId` reaches. Area scopes are region-aware (same
// region as the source); as in the rulebook, adjacent/nearby include the source's
// own square. The source itself is left out unless `includeSelf`. Side suffixes
// filter by controller. A site projects from its square's surface.
function unitsInScope(sourceId, scope, includeSelf = false) {
  if (scope === 'self') return [sourceId]
  const siteSq = squareOfSite(sourceId)
  const src = unitCell(sourceId) || (siteSq == null ? null : { square: siteSq, region: 'surface' })
  const srcCard = state.cards[sourceId]
  if (!src || !srcCard) return []
  const near = scope.startsWith('nearby')
  const wantFriendly = scope.endsWith('friendly')
  const wantEnemy = scope.endsWith('enemy')
  const out = []
  for (const u of boardUnits()) {
    if (u.id === sourceId && !includeSelf) continue
    if (u.region !== src.region) continue
    // Oversized units cover four squares: in range if any pair of squares is.
    const inRange = (src.squares || [src.square]).some((a) =>
      (u.squares || [u.square]).some(
        (b) => a === b || (near ? areNearby(a, b) : areAdjacent(a, b))
      )
    )
    if (!inRange) continue
    const sameSide = !!u.card.enemy === !!srcCard.enemy
    if (wantFriendly && !sameSide) continue
    if (wantEnemy && sameSide) continue
    out.push(u.id)
  }
  return out
}

// The squares a source "is" on: an aura's four around its intersection, an
// (oversized) unit's own square(s), a site's square, or a carried card's
// carrier's square. [] off the board.
function areaSquares(sourceId) {
  const m = /^aura:(\d+)$/.exec(zoneOf(sourceId) || '')
  if (m) return intersectionSquares(Number(m[1]))
  const sq = squaresOf(sourceId)
  if (sq.length) return sq
  const site = squareOfSite(sourceId)
  return site == null ? [] : [site]
}

// The board square a non-unit card sits on (carried cards: their carrier's).
function cardSquare(id) {
  const m = /^(?:cell|site):(\d+)/.exec(zoneOf(id) || '')
  return m ? Number(m[1]) : null
}

// Every card a passive on `sourceId` reaches, by its scope and `affects` kinds.
// Units use the region-aware unit scopes; sites and artifacts are matched by
// square (the aura's area, or the source's square and those around it). Side
// suffixes filter by controller. The source itself only with `includeSelf`.
function passiveTargets(sourceId, a) {
  const scope = a.scope
  if (scope === 'self') return [sourceId]
  const srcCard = state.cards[sourceId]
  if (!srcCard) return []
  const affects = a.passive?.affects || ['units']
  const includeSelf = !!a.passive?.includeSelf
  const other = (id) => includeSelf || id !== sourceId
  const wantFriendly = scope.endsWith('friendly')
  const wantEnemy = scope.endsWith('enemy')
  const sideOk = (id) => {
    const same = !!state.cards[id]?.enemy === !!srcCard.enemy
    return !(wantFriendly && !same) && !(wantEnemy && same)
  }
  // Whoever carries the source (a carried artifact's wielder).
  if (scope === 'bearer') {
    const c = inPlay(sourceId) ? carrierOf(sourceId) : null
    return c ? [c] : []
  }
  // Board-wide scopes: everything of the affected kinds, or a side's Avatar.
  if (scope.startsWith('all') || scope.startsWith('avatar')) {
    if (!inPlay(sourceId)) return []
    const out = new Set()
    if (scope.startsWith('avatar')) {
      for (const u of boardUnits()) if (u.card.avatar && u.id !== sourceId && sideOk(u.id)) out.add(u.id)
      return [...out]
    }
    if (affects.includes('units'))
      for (const u of boardUnits()) if (other(u.id) && sideOk(u.id)) out.add(u.id)
    if (affects.includes('sites'))
      for (let sq = 0; sq < GRID_SIZE; sq++) {
        const id = state.zones[`site:${sq}`]?.[0]
        if (id && other(id) && sideOk(id)) out.add(id)
      }
    if (affects.includes('artifacts'))
      for (const c of Object.values(state.cards)) {
        if (!c.artifact || !other(c.id) || isUnit(c) || !sideOk(c.id)) continue
        if (cardSquare(c.id) != null) out.add(c.id)
      }
    return [...out]
  }
  const area = scope.startsWith('aura-area')
  const srcSquares = areaSquares(sourceId)
  if (!srcSquares.length) return []
  // The squares sites/artifacts are looked for on.
  let squares
  if (area) squares = srcSquares
  else {
    const near = scope.startsWith('nearby')
    squares = []
    for (let s = 0; s < GRID_SIZE; s++) {
      if (srcSquares.some((q) => q === s || (near ? areNearby(q, s) : areAdjacent(q, s)))) squares.push(s)
    }
  }
  const out = new Set()
  if (affects.includes('units')) {
    if (area) {
      // Units on those squares, in the chosen layer(s) (oversized ones -- always
      // on the surface -- if any of their squares overlap).
      const layers = a.passive?.unitLayers || 'surface'
      for (const u of boardUnits()) {
        if (!other(u.id) || !sideOk(u.id)) continue
        const below = /:bot$/.test(zoneOf(u.id) || '')
        if (layers === 'surface' && below) continue
        if (layers === 'below' && !below) continue
        if ((u.squares || [u.square]).some((s) => squares.includes(s))) out.add(u.id)
      }
    } else {
      for (const id of unitsInScope(sourceId, scope, includeSelf)) out.add(id)
    }
  }
  if (affects.includes('sites')) {
    for (const s of squares) {
      const id = state.zones[`site:${s}`]?.[0]
      if (id && other(id) && sideOk(id)) out.add(id)
    }
  }
  if (affects.includes('artifacts')) {
    for (const c of Object.values(state.cards)) {
      if (!c.artifact || !other(c.id) || isUnit(c) || !sideOk(c.id)) continue
      const sq = cardSquare(c.id)
      if (sq != null && squares.includes(sq)) out.add(c.id)
    }
  }
  return [...out]
}

function accumPassive(p, acc) {
  if (!p) return
  for (const k of p.keywords || []) acc.keywords.add(k)
  acc.movement += Number(p.movement) || 0
  acc.strength += Number(p.strength) || 0
  acc.ranged += Number(p.ranged) || 0
  if (p.summonOnEnemySites) acc.summonOnEnemySites = true
  if (p.costOn === 'own') acc.costMod += Number(p.costMod) || 0
  if (p.costOn === 'abilities') acc.abilityCostMod += Number(p.costMod) || 0
  if (p.cantAttack) acc.cantAttack = true
  if (p.cantBeTargeted) acc.cantBeTargeted = true
  if (p.cantMove) acc.cantMove = true
  if (p.cantDefend) acc.cantDefend = true
}

// spellCost is a list of { amount, filter }: each passive discount/tax and the
// kind of spell it applies to (see PASSIVE_COST_FILTERS).
const emptySideMods = () => ({ spellCost: [], affinity: { air: 0, earth: 0, fire: 0, water: 0 } })

// The side(s) a passive's side-wide modifiers (spell cost, affinity) land on.
// Keyed off the scope and the source's own side -- never off which cards the
// scope happens to reach -- so "your spells cost 1 less" doesn't blink on and
// off as units move in and out of range. self -> the source's side; bearer ->
// the carrier's side; -friendly / -enemy -> that side; unsuffixed area and
// board-wide scopes -> both sides.
function scopeSides(sourceId, scope) {
  const own = sideOf(sourceId)
  if (scope === 'self') return [own]
  if (scope === 'bearer') {
    const c = carrierOf(sourceId)
    return c ? [sideOf(c)] : []
  }
  if (scope.endsWith('friendly')) return [own]
  if (scope.endsWith('enemy')) return [otherSide(own)]
  return ['player', 'opponent']
}

// Every unit's continuous traits, derived from passive abilities (self and
// region-aware auras) plus gameplay grants. A single computed so it recomputes
// once when the board changes and is shared by every reader. Silence removes a
// unit's ability-sourced traits (keywords, movement, strength auras, and even
// granted keywords -- all "non-basic"); a raw strengthMod counter is a stat
// change, not an ability, so it survives. Disable is silence that also strips
// the basics, so the unit can't act at all. Auras from a silenced/disabled
// source stop applying (resolved in one pass; mutual silence isn't chased).
const passiveState = computed(() => {
  resolvingPassives = true
  try {
    return resolvePassives()
  } finally {
    resolvingPassives = false
  }
})

function resolvePassives() {
  const cards = state.cards
  const silenced = new Set()
  const disabled = new Set()
  for (const src of Object.values(cards)) {
    for (const a of passivesOf(src)) {
      if (!a.passive.silence && !a.passive.disable) continue
      if (a.scope === 'self') continue
      for (const tid of passiveTargets(src.id, a)) {
        if (a.passive.silence) silenced.add(tid)
        if (a.passive.disable) disabled.add(tid)
      }
    }
  }

  // Area passives from sources that still work, resolved once: id -> [passive].
  // Side-wide modifiers (spell cost, affinity) land once per side the scope
  // names (scopeSides), and only from a source in play -- a card in hand doesn't
  // lend its side affinity or discounts.
  const lent = {}
  const sides = { player: emptySideMods(), opponent: emptySideMods() }
  for (const src of Object.values(cards)) {
    if (silenced.has(src.id) || disabled.has(src.id)) continue
    for (const a of passivesOf(src)) {
      if (a.scope !== 'self')
        for (const tid of passiveTargets(src.id, a)) (lent[tid] || (lent[tid] = [])).push(a)
      const p = a.passive
      const spells = p.costOn === 'spells' ? Number(p.costMod) || 0 : 0
      const hasAff = ELEMENTS.some((el) => Number(p.affinity?.[el]))
      if ((!spells && !hasAff) || !inPlay(src.id)) continue
      for (const side of scopeSides(src.id, a.scope)) {
        if (spells) sides[side].spellCost.push({ amount: spells, filter: p.costFilter || 'any' })
        for (const el of ELEMENTS) sides[side].affinity[el] += Number(p.affinity?.[el]) || 0
      }
    }
  }

  const map = {}
  for (const id of Object.keys(cards)) {
    const disabledHere = disabled.has(id)
    const silencedHere = silenced.has(id) || disabledHere
    const acc = {
      keywords: new Set(),
      movement: 0,
      strength: 0,
      ranged: 0,
      summonOnEnemySites: false,
      costMod: 0,
      abilityCostMod: 0,
      cantAttack: false,
      cantBeTargeted: false,
      cantMove: false,
      cantDefend: false,
    }
    if (!silencedHere) {
      for (const a of passivesOf(cards[id])) {
        if (a.scope === 'self') accumPassive(a.passive, acc)
      }
      for (const a of lent[id] || []) accumPassive(a.passive, acc)
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
      summonOnEnemySites: acc.summonOnEnemySites,
      costMod: acc.costMod,
      abilityCostMod: acc.abilityCostMod,
      cantAttack: acc.cantAttack,
      cantBeTargeted: acc.cantBeTargeted,
      cantMove: acc.cantMove,
      cantDefend: acc.cantDefend,
    }
  }
  return { map, sides }
}

export const effective = computed(() => passiveState.value.map)

// Side-wide passive modifiers for 'player' / 'opponent': the mana deltas on the
// spells that side casts (each with its spell-kind filter), and extra affinity
// per element.
export const sidePassiveMods = (side) => passiveState.value.sides[side] || emptySideMods()

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
// May be summoned onto an opponent-controlled site (a passive-granted trait).
export const canSummonOnEnemySites = (id) => !!traits(id)?.summonOnEnemySites

// The side a card belongs to.
const sideOf = (id) => (state.cards[id]?.enemy ? 'opponent' : 'player')

// In play mode the solver controls only their own side: an opponent's cards --
// spells in their hand, the actions on their units' bar -- are look-only, since
// the puzzle drives the opponent automatically. Editing and recording keep full
// control of both sides so an author can set up and demonstrate a solution.
export function playerControls(cardId) {
  if (state.mode !== 'play') return true
  return !state.cards[cardId]?.enemy
}

// Combat stats: base Power/Life from the card (authored, shown on the art),
// modified in play. An avatar's Life is its side's life total.
export const effectivePower = (id) => basePower(id) + effectiveStrengthMod(id)

// An animated object fights with its animation's power; a real unit (or
// anything else) with the power printed on it.
function basePower(id) {
  const c = state.cards[id]
  if (!c) return 0
  const anim = !c.unit && !c.avatar ? animationOf(id) : null
  return anim ? animatedPower(id, anim) : c.power || 0
}

// A minion has no separate Life -- its toughness IS its power (damage >= power
// kills it). An optional `defense` overrides toughness for the few cards whose
// attack and defense powers differ; strength boosts raise both. Avatars are the
// exception: their toughness is the side's life total.
export function effectiveLife(id) {
  const c = state.cards[id]
  if (!c) return 0
  if (c.avatar) return state.stats[sideOf(id)]?.life || 0
  const d = c.defense
  const base = d === '' || d == null || (!c.unit && animationOf(id)) ? basePower(id) : Number(d) || 0
  return base + effectiveStrengthMod(id)
}
export const isDisabled = (id) => !!traits(id)?.disabled
// Passive restrictions (lifted by silence/disable like any other passive trait).
export const cantAttack = (id) => !!traits(id)?.cantAttack
export const cantBeTargeted = (id) => !!traits(id)?.cantBeTargeted
export const cantMove = (id) => !!traits(id)?.cantMove
export const cantDefend = (id) => !!traits(id)?.cantDefend

// Keywords added during play (not the base ones on the card art), for badging.
export const grantedKeywordsOf = (id) => state.grantedKeywords[id] || []

// Steps a unit may take: base 1, plus passive/granted movement, zeroed by
// Immobile, Disable or a passive "can't move". Non-units never move. (With no
// steps a unit still reaches its own square, so it may attack there.)
export function effectiveMovement(id) {
  const e = traits(id)
  if (!e || !isUnit(id)) return 0
  if (e.disabled || e.cantMove || e.keywords.has('immobile')) return 0
  return 1 + e.movement
}

// ---------- movement / attack reachability (enforcement) ----------

// A position is a (square, layer) node; layer 'top' is the surface/void, 'bot'
// the subsurface. Reachability is a BFS over legal single steps.
const nodeKey = (sq, layer) => `${sq}:${layer}`

function nodeOf(cardId) {
  const z = zoneOf(cardId)
  // An oversized unit anchors on its top-left square (squaresOf has all four).
  const big = oversizedAt(cardId)
  if (big != null) return { sq: intersectionSquares(big)[0], layer: 'top' }
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
  // An oversized unit reaches every surface square under a crossing it can reach.
  if (isOversized(unitId)) {
    for (const i of reachableIntersections(unitId)) {
      for (const sq of intersectionSquares(i)) set.add(nodeKey(sq, 'top'))
    }
    return set
  }
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

// A minion that entered the realm this turn has summoning sickness: it cannot
// tap, or be tapped, to pay for the costs of abilities (so no Move & Attack,
// shoot, intercept, or tap-cost activated ability) until end of turn -- unless
// it has Charge, which explicitly lets a just-summoned unit tap. Avatars are
// never "summoned", so they are never sick. hasKeyword() reads the effective
// traits, so Charge printed on the card, lent by a passive/aura, or granted
// mid-turn by a spell or ability all lift the sickness at once.
// (Rulebook p. 19, glossary "Charge".)
export function hasSummoningSickness(cardId) {
  return !!state.summoned[cardId] && !hasKeyword(cardId, 'charge')
}

// Player-initiated tap costs are refused for a summon-sick actor, but only while
// rules are enforced (play/record) -- the free-form editor and forced effects
// (the effect `move`/`tap` ops never route through these helpers) are
// unaffected, mirroring how `enforcing()`/`combat` already scope the checks.
export const tapBlockedBySickness = (cardId) => enforcing() && hasSummoningSickness(cardId)

// Passive "can't move" / "can't attack", for the action bar: like the other
// rule gates they only bite while enforcing (canMoveUnit/canAttack refuse them).
export const moveBlockedByPassive = (cardId) => enforcing() && cantMove(cardId)
export const attackBlockedByPassive = (cardId) => enforcing() && cantAttack(cardId)

// May this unit legally move to a board zone? Non-cell destinations aren't
// movement-gated (summoning from hand, etc.). A summon-sick unit can't move at
// all: the Move action taps it (Move & Attack), so it is barred while enforcing.
export function canMoveUnit(unitId, toZone) {
  // An oversized unit moves crossing to crossing, never onto a single square.
  if (isOversized(unitId)) {
    if (/^cell:/.test(toZone || '')) return false
    const a = /^aura:(\d+)$/.exec(toZone || '')
    if (!a) return true
    if (tapBlockedBySickness(unitId)) return false
    return reachableIntersections(unitId).has(Number(a[1]))
  }
  const m = /^cell:(\d+):(top|bot)$/.exec(toZone || '')
  if (!m) return true
  if (tapBlockedBySickness(unitId)) return false
  return reachableNodes(unitId).has(nodeKey(Number(m[1]), m[2]))
}

// May attacker legally attack target: within reach, and past the targeting
// keywords -- Airborne can only be hit by Airborne, Stealth not by opponents.
export function canAttack(attackerId, targetId) {
  if (!isUnit(attackerId) || isDisabled(attackerId) || cantAttack(attackerId)) return false
  if (tapBlockedBySickness(attackerId)) return false // Move & Attack taps
  const target = state.cards[targetId]
  // You may only attack the opposing side, and only its units or sites --
  // never friendly cards, and never a non-unit/non-site (aura, artifact, etc.).
  if (!target || (!isUnit(targetId) && !target.site)) return false
  if (!oppositeSides(attackerId, targetId)) return false
  const t = nodeOf(targetId)
  if (!t) return false
  const reach = reachableNodes(attackerId)
  const hit = isOversized(targetId)
    ? squaresOf(targetId).some((sq) => reach.has(nodeKey(sq, 'top')))
    : reach.has(nodeKey(t.sq, t.layer))
  if (!hit) return false
  if (isUnit(targetId)) {
    const atk = effectiveKeywords(attackerId)
    const tgt = effectiveKeywords(targetId)
    if (tgt.has('airborne') && !atk.has('airborne')) return false
    if (isStealthed(targetId)) return false
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
  const out = oversizedOnSquare(idx)
  for (const layer of ['top', 'bot']) {
    for (const id of state.zones[`cell:${idx}:${layer}`] || []) {
      if (isUnit(id)) out.push(id)
    }
  }
  return out
}

// Units on a square that sit in a given region (surface / void / underground /
// underwater). Region is a (square, layer) property, so this picks the layer(s)
// whose region matches -- used to keep a ranged shot within one region.
function unitsInRegionOnSquare(idx, region) {
  const out = regionOf(idx, 'top') === region ? oversizedOnSquare(idx) : []
  for (const layer of ['top', 'bot']) {
    if (regionOf(idx, layer) !== region) continue
    for (const id of state.zones[`cell:${idx}:${layer}`] || []) {
      if (isUnit(id)) out.push(id)
    }
  }
  return out
}

// Units a Ranged shooter can hit: fire a projectile down each of the four
// cardinal lines up to its range. The shot stays in the shooter's own region --
// no firing across surface/subsurface/void. Any unit (friend or foe) occupying a
// square blocks the line, so the shot reaches only the first occupied square in
// each direction; every unit on that square is choosable. The exception is the
// shooter's own square: allies standing with the shooter are optional targets
// (you may shoot them, but they don't block). Stealth units are transparent --
// they can't be hit and don't block.
export function rangedTargets(shooterId) {
  const set = new Set()
  const range = effectiveRanged(shooterId)
  const start = nodeOf(shooterId)
  if (!range || isDisabled(shooterId) || !start) return set
  // Origin square: same-region units standing with the shooter are optional
  // targets and never block the outgoing shot.
  for (const id of state.zones[`cell:${start.sq}:${start.layer}`] || []) {
    if (id !== shooterId && isUnit(id) && !isStealthed(id)) set.add(id)
  }
  for (const hit of lineHits(start, range)) for (const id of hit.units) set.add(id)
  return set
}

// Walk each of the four cardinal lines out from a (square, layer) node, staying
// in the node's region, and stop at the first square holding a unit -- any
// unit, friend or foe, blocks the line beyond it; Stealth units are transparent.
// One record per direction that hits something: { dr, dc, sq, units }. A range
// of 0 or less is unlimited (the line runs to the edge of the realm).
function lineHits(start, range) {
  const out = []
  const region = regionOf(start.sq, start.layer)
  const max = range > 0 ? range : Math.max(GRID_ROWS, GRID_COLS)
  const row = Math.floor(start.sq / GRID_COLS)
  const col = start.sq % GRID_COLS
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    for (let step = 1; step <= max; step++) {
      const r = row + dr * step
      const c = col + dc * step
      if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) break
      const sq = r * GRID_COLS + c
      const units = unitsInRegionOnSquare(sq, region).filter((id) => !isStealthed(id))
      if (units.length) {
        out.push({ dr, dc, sq, units })
        break
      }
    }
  }
  return out
}

// ---------- projectiles ----------

// A projectile is fired from its source in one cardinal direction and flies in
// a straight line like a Ranged shot (same region, blocked by the first unit,
// Stealth transparent), but its distance is unlimited unless the ability gives
// it a range. It stops at -- and hits -- the first unit in its path, so the
// units it can hit are exactly the first occupied square in each direction;
// choosing one of them is choosing the direction. Unlike a Ranged shot it
// leaves its origin, so units sharing the source's location are never hit.
//
// A source that isn't on the board (a spell cast from hand) fires from its
// controller's avatar.
function projectileOrigin(sourceId) {
  const own = nodeOf(sourceId)
  if (own) return own
  const side = sideOf(sourceId)
  for (const id of Object.keys(state.cards)) {
    if (isAvatar(id) && sideOf(id) === side) {
      const n = nodeOf(id)
      if (n) return n
    }
  }
  return null
}

// The units a projectile from this source could hit, each mapped to the line
// record (direction, square) that reaches it.
export function projectileTargets(sourceId, range = 0) {
  const hits = new Map()
  const start = projectileOrigin(sourceId)
  if (!start) return hits
  for (const hit of lineHits(start, range)) {
    for (const id of hit.units) hits.set(id, hit)
  }
  return hits
}

// A square on the projectile's line relative to the unit it hit: -1 is where
// it stopped (the square just before the hit, toward the source), +1 the square
// past the hit (knockback). Same layer as the hit unit; null off the board or
// when the target isn't in a straight line from the source.
function projectileStep(sourceId, targetId, step) {
  const o = projectileOrigin(sourceId)
  const t = nodeOf(targetId)
  if (!o || !t) return null
  const or = Math.floor(o.sq / GRID_COLS)
  const oc = o.sq % GRID_COLS
  const tr = Math.floor(t.sq / GRID_COLS)
  const tc = t.sq % GRID_COLS
  if (or !== tr && oc !== tc) return null
  const r = tr + Math.sign(tr - or) * step
  const c = tc + Math.sign(tc - oc) * step
  if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) return null
  return `cell:${r * GRID_COLS + c}:${t.layer}`
}

export const canShoot = (shooterId, targetId) =>
  !tapBlockedBySickness(shooterId) && rangedTargets(shooterId).has(targetId)

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

// A card on the mat: in the realm (a cell or site slot, or carried there) or on
// an intersection (an aura, or an oversized minion).
const inPlay = (id) => ['realm', 'aura'].includes(cardZoneCategory(id))

// A batch of simultaneous hits: who a Lethal source touched, every damage
// instance dealt, and where each party stood when it landed, so the batch can
// settle (deaths, then damage triggers) as one.
const newHits = () => ({ lethal: new Set(), dealt: [], at: {}, prevented: [] })

// ---------- counters & damage prevention ----------

export const counterOf = (id, name) => state.counters[id]?.[name] || 0
// The named counters on a card, for its badge.
export const countersOf = (id) =>
  Object.entries(state.counters[id] || {}).filter(([, n]) => n > 0)

// Add (or, negative, remove) counters on a card; never below zero, and an
// emptied name/card is dropped so the map stays tidy. Returns the change.
function addCounters(id, name, delta) {
  if (!id || !name) return 0
  const cur = counterOf(id, name)
  const next = Math.max(0, cur + delta)
  const map = state.counters[id] || (state.counters[id] = {})
  if (next) map[name] = next
  else delete map[name]
  if (!Object.keys(map).length) delete state.counters[id]
  return next - cur
}

// Consume shield counters on a card against incoming damage; how much they
// prevented.
function absorbDamage(id, amount) {
  const shield = counterOf(id, SHIELD_COUNTER)
  if (!shield || amount <= 0) return 0
  const n = Math.min(shield, amount)
  addCounters(id, SHIELD_COUNTER, -n)
  return n
}

function announcePrevented(entry, prevented) {
  for (const p of prevented) {
    state.events.push({
      id: uid(),
      seq: entry?.seq,
      cardId: p.targetId,
      name: 'Damage prevented',
      text: `${p.amount} damage to ${cardName(p.targetId)} is prevented.`,
    })
  }
}

// Note where a card stood (square and layer) when a hit in this batch landed.
function recordHitAt(hits, id) {
  if (!id || hits.at[id]) return
  const n = nodeOf(id)
  if (n) hits.at[id] = n
}

// One source->target damage instance. A minion accumulates damage (and a lethal
// flag if the source has Lethal); a site or avatar has no toughness, so its
// controller loses that much life instead. Recorded on `hits` so settleHits can
// announce it as a damage event.
function applyHit(sourceId, targetId, amount, hits) {
  if (amount <= 0) return
  const tgt = state.cards[targetId]
  if (!tgt) return
  // A card already off the mat (killed earlier in this storyline, say) can't be
  // hit -- otherwise damage triggers could ping a dead card forever. An Avatar
  // is the exception: a puzzle may keep it off the board as a life stat, and
  // damage to it is only life loss (it never dies, so it can't loop on death).
  const offBoard = !inPlay(targetId)
  if (offBoard && !tgt.avatar) return
  // Where both parties stood, so a trigger's `within` can still measure a unit
  // the hit went on to kill (and its Deathrite's area can be measured there).
  recordHitAt(hits, targetId)
  recordHitAt(hits, sourceId)
  // Damage prevention: shield counters soak it up first.
  const prevented = absorbDamage(targetId, amount)
  if (prevented) {
    hits.prevented.push({ targetId, amount: prevented })
    amount -= prevented
    if (amount <= 0) return
  }
  if (isUnit(targetId) && !tgt.avatar) {
    state.damage[targetId] = (state.damage[targetId] || 0) + amount
    if (hasKeyword(sourceId, 'lethal')) hits.lethal.add(targetId)
  } else {
    adjustStat(sideOf(targetId), 'life', -amount)
  }
  hits.dealt.push({ sourceId, targetId, amount })
}

// Announce damage as trigger events ("when damaged", "whenever this deals
// damage") and to the loseWhen watcher. Not a logged move -- like a death's
// replayed move it is a consequence of the causing entry: it carries that
// entry's seq, and `root` so effects snapshot onto it for undo. `killed` is the
// set of cards this batch's deaths removed (only their own damage triggers may
// still resolve from the cemetery); `at` maps a card to the node it stood on.
function fireDamage(entry, dealt, killed = null, at = null) {
  for (const d of dealt) {
    if (!(d.amount > 0)) continue
    const ev = {
      type: 'damage',
      cardId: d.targetId,
      sourceId: d.sourceId || null,
      amount: d.amount,
      seq: entry?.seq,
      root: entry,
      killed,
      at,
    }
    fireTriggers(ev)
    checkGrantLoss(ev)
  }
}

// Settle a batch of hits: state-based deaths first (damage is immediate), then
// the damage events go onto the storyline.
function settleHits(entry, hits) {
  announcePrevented(entry, hits.prevented)
  const before = Object.keys(hits.at).filter(inPlay)
  resolveDeaths(entry, hits.lethal)
  const killed = new Set(before.filter((id) => !inPlay(id)))
  fireDamage(entry, hits.dealt, killed, hits.at)
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
  state.events.push({ id: uid(), seq: entry.seq, cardId: unitId, name, text })
  emitFx('death', { cardId: unitId })
  shedInPlayState(unitId, `grave:${side}`, entry)
  fireTriggers({ type: 'move', cardId: unitId, from, to: `grave:${side}`, seq: entry.seq, root: entry })
}

// State-based death after damage: any minion at or over its Life, or hit by a
// Lethal source, dies to its cemetery. Avatars never leave for the cemetery --
// they bleed life and sit at Death's Door on 0. The zoneOf guard skips a unit a
// nested Deathrite already removed, so it is never sent twice.
// Repeats until a pass kills nobody: a death can lower another unit's Life (it
// was the source of a strength passive), and that unit must then die too,
// whatever order the squares were checked in.
function resolveDeaths(entry, lethalHit) {
  let died = true
  while (died) {
    died = false
    for (const u of boardUnits()) {
      if (u.card.avatar) continue
      if (!zoneOf(u.id)?.startsWith('cell:') && !isOversized(u.id)) continue
      const dmg = state.damage[u.id] || 0
      if (!lethalHit.has(u.id) && dmg < Math.max(1, effectiveLife(u.id))) continue
      sendToCemetery(u.id, entry, 'Slain', `${cardName(u.id)} was slain.`)
      died = true
    }
  }
  // Survivors animated "until damaged" now revert.
  settleAnimations(entry)
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
    const hits = newHits()
    applyHit(attackerId, targetId, aDmg, hits)
    if (isUnit(targetId)) applyHit(targetId, attackerId, dDmg, hits)
    settleHits(entry, hits)
    return
  }
  // One strikes first; the other hits back only if it survived that strike.
  const first = aFS ? attackerId : targetId
  const second = aFS ? targetId : attackerId
  const firstDmg = aFS ? aDmg : dDmg
  const secondDmg = aFS ? dDmg : aDmg
  const h1 = newHits()
  applyHit(first, second, firstDmg, h1)
  settleHits(entry, h1)
  if (isUnit(second) && zoneOf(second)?.startsWith('cell:')) {
    const h2 = newHits()
    applyHit(second, first, secondDmg, h2)
    settleHits(entry, h2)
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
  const hits = newHits()
  applyHit(sourceId, targetId, amount, hits)
  settleHits(entry, hits)
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
  'storyline',
  'hand',
  'cemetery',
  'collection',
  'banished',
  'atlas',
  'spellbook',
]

// Auras are in the realm (rulebook): an ability's 'realm' zone covers the aura
// intersections too.
const catMatches = (want, cat) => want === cat || (want === 'realm' && cat === 'aura')
const zoneListHas = (list, cat) => (list || []).some((want) => catMatches(want, cat))

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
  // Convenience: a card comes into the realm from outside it -- cast, summoned,
  // conjured, reanimated (Genesis).
  'enter',
  // Convenience: a unit goes from the realm to a cemetery (dies).
  'death',
]

// Which party of the action is the trigger's subject: the card performing it
// ('actor' -- the mover, attacker, caster; for damage, the source dealing it) or
// the card it is done to ('target' -- the attacked/struck/targeted card, the
// damaged card). "When this is attacked" = action attack, role target, subject self.
export const TRIGGER_ROLES = ['actor', 'target']
// Actions that have an acted-upon party, so a 'target' role can mean something.
// For the rest (a move, drop or death) the role is always 'actor'.
export const TARGETED_TRIGGER_ACTIONS = ['attack', 'strike', 'pickup', 'ability', 'cast', 'damage']
// What a triggered ability's effects auto-target: the trigger's subject, or the
// other party of the action (e.g. the attacker, for a role-target attack trigger).
export const TRIGGER_TARGET_REFS = ['subject', 'other']

// The structured effect ops an ability can carry, for the editor's picker.
export const EFFECT_OPS = [
  'adjustStat',
  'tap',
  'dealDamage',
  'strike',
  'modifyStrength',
  'grantKeyword',
  'move',
  'destroy',
  'banish',
  'bounce',
  'heal',
  'grantFrom',
  'release',
  'flood',
  'unflood',
  'summonToken',
  'animate',
  'banishAndCast',
  'untap',
  'draw',
  'discard',
  'search',
  'reanimate',
  'gainControl',
  'swap',
  'addCounter',
  'removeCounter',
  'preventDamage',
]

// Which deck a draw/search reads: the Spellbook (spells) or the Atlas (sites).
export const DECKS = ['spellbook', 'atlas']
// Whose hand/deck a draw, discard or search uses, relative to the source.
export const EFFECT_SIDES = ['self', 'enemy']
// How a discard picks its cards: the cards its selector names (e.g. a target
// chosen from hand), or a number of cards from a side's hand. The count form
// takes the first cards in hand order -- there is no hand-choice UI yet.
export const DISCARD_PICKS = ['chosen', 'count']
// Where a reanimated card may be summoned, relative to the source: a picked
// location anywhere, or one adjacent/nearby.
export const REANIMATE_REACH = ['any', 'nearby', 'adjacent']

// Where a granted card goes when the grant ends: back where it was taken from
// (a banished avatar assumed as a form simply returns to banishment), or to its
// owner's banished zone / cemetery / hand.
export const GRANT_RELEASE = ['origin', 'banished', 'cemetery', 'hand']
export const GRANT_RELEASE_LABELS = {
  origin: 'back where it came from',
  banished: 'to banishment',
  cemetery: 'to the cemetery',
  hand: 'to hand',
}

// An activated ability's sacrifice cost: nothing, the card itself, or the
// ability's chosen target (which must then be a friendly card in play).
export const SACRIFICE_COSTS = ['none', 'self', 'target']
// The counter name damage prevention uses.
export const SHIELD_COUNTER = 'shield'

// Authoring options for a grid target.
export const TARGET_MODES = ['card', 'grid']
export const GRID_ORIGINS = ['self', 'pick']
export const GRID_SHAPES = ['location', 'adjacent', 'nearby']
// Card-target restrictions relative to the source, and by side.
// 'projectile' = the first unit hit by a projectile fired in a cardinal
// direction (see projectileTargets); `target.range` limits its flight, 0 = no
// limit.
export const TARGET_WITHIN = ['any', 'adjacent', 'nearby', 'projectile']
export const TARGET_SIDES = ['any', 'friendly', 'enemy']
// Where a `move` effect sends its subject. 'picked' asks the player for a
// destination when the ability resolves (or uses a grid ability's picked square).
// With a projectile target, 'projectileStop' is the square the projectile
// stopped in (just before the unit it hit) and 'projectileBeyond' the square
// past that unit (knockback).
export const LOCATION_REFS = [
  'sourceLocation',
  'targetLocation',
  'picked',
  'projectileStop',
  'projectileBeyond',
]
// How a `move` effect moves its subject. Both are forced movement -- the unit
// takes no step of its own, so Immobile doesn't stop it. Teleportation may
// cross regions by default; other forced movement (push/pull/drag) may not.
export const MOVE_KINDS = ['teleport', 'forced']
// How far a picked destination may be from the moving unit. Only locations in
// the same region are adjacent/nearby one another, so those reaches never
// change region; 'any' reaches anywhere in the realm.
export const MOVE_REACH = ['adjacent', 'nearby', 'any']

// Tokens an ability can generate. Minion tokens enter the realm like a summon
// (not movement); a lance is a carriable artifact; a ward is a Ward granted to a
// unit.
// (A Ward is granted with grantKeyword; 'ward' only remains a template kind for
// the Ward token's art.)
export const TOKEN_KINDS = ['soldier', 'skeleton', 'frog', 'lance']
const TOKEN_DEFS = {
  soldier: { name: 'Foot Soldier', unit: true, power: 1 },
  skeleton: { name: 'Skeleton', unit: true, power: 1 },
  frog: { name: 'Frog', unit: true, power: 1 },
  lance: { name: 'Lance', artifact: true, lanceToken: true },
  // Left in a site's place when the site is animated: a land site that
  // provides no mana or threshold. Not offered by summonToken.
  rubble: { name: 'Rubble', site: true },
}
// Every kind a card can be designated as the template of (Rubble included: it
// is generated by animating a site).
export const TOKEN_TEMPLATE_KINDS = [...TOKEN_KINDS, 'ward', 'rubble']
export const TOKEN_NAMES = {
  soldier: 'Foot Soldier',
  skeleton: 'Skeleton',
  frog: 'Frog',
  lance: 'Lance',
  ward: 'Ward',
  rubble: 'Rubble',
}

// The card the author designated as a token kind's template (its art, name and
// abilities), or null to fall back to the plain generated face. Prefers one on
// the same side, so each player's tokens can have their own art.
export function tokenTemplate(kind, enemy) {
  let any = null
  for (const c of Object.values(state.cards)) {
    if (c.generated || c.tokenKind !== kind) continue
    if (!!c.enemy === !!enemy) return c
    any = any || c
  }
  return any
}

// Designate a card as a token kind's template ('' clears it). A template takes
// the type its kind needs, so a Lance template is a carriable lance artifact, a
// Rubble template a site, and a minion token's template a minion.
export function setTokenTemplate(cardId, kind) {
  const card = state.cards[cardId]
  if (!card) return
  const was = card.tokenKind
  card.tokenKind = TOKEN_TEMPLATE_KINDS.includes(kind) ? kind : ''
  if (was === 'lance' && card.tokenKind !== 'lance') card.lanceToken = false
  const def = TOKEN_DEFS[card.tokenKind]
  if (!def) return
  if (def.unit) {
    card.unit = true
    card.site = card.aura = card.artifact = card.monument = card.magic = false
    card.lanceToken = false
  }
  if (def.artifact) {
    card.artifact = true
    card.lanceToken = !!def.lanceToken
    card.unit = card.avatar = card.site = card.aura = card.monument = card.magic = false
  }
  if (def.site) {
    card.site = true
    card.unit = card.avatar = card.aura = card.artifact = card.monument = card.magic = false
    card.manaProvided = 0
  }
}

// Where a generated token appears:
//   self / target            -- on that unit (lance: carried by it; ward: granted)
//   selfSurface / selfBelow  -- the source's square, surface or subsurface
//   targetLocation           -- wherever the target is
//   adjacent / nearby        -- a square the player picks near the source
//   anySite                  -- any square with a site, picked by the player
export const TOKEN_LOCATIONS = [
  'self',
  'target',
  'selfSurface',
  'selfBelow',
  'targetLocation',
  'adjacent',
  'nearby',
  'anySite',
]
// The locations that make sense for each token kind, for the editor.
export function tokenLocationsFor(kind) {
  if (kind === 'lance') return TOKEN_LOCATIONS
  return TOKEN_LOCATIONS.filter((l) => l !== 'self' && l !== 'target')
}
const PICKED_TOKEN_LOCATIONS = ['adjacent', 'nearby', 'anySite']
// How a damage/strength amount is computed.
// 'power' is the source unit's current combat power (what it would strike for).
// 'count' counts the cards a nested selector (`eff.countOf`) picks -- e.g. the
// friendly minions nearby.
// 'counter' totals the named counter (`eff.counterName`) on the cards `countOf`
// picks.
export const AMOUNT_REFS = ['literal', 'power', 'carriedCount', 'waterBodySize', 'count', 'counter']

// Who an effect hits (its selector):
//   self       -- the card whose ability it is
//   target     -- the ability's chosen card target
//   triggering -- the card whose action set a triggered ability off (which may
//                 differ from a picked target)
//   avatar     -- a side's avatar (`avatarSide`: 'self' | 'enemy', relative to
//                 the source)
//   carrier    -- whatever is carrying the source
//   area       -- a set of cards (`area`): the ability's grid target ('grid'),
//                 or a region-aware area around the source, filtered by card
//                 kind (TARGET_FILTERS) and side (TARGET_SIDES)
//   other      -- a triggered ability's other party (the attacker, for "when
//                 this is attacked"); shielded by Stealth / "can't be targeted"
export const EFFECT_WHO = ['self', 'target', 'triggering', 'other', 'avatar', 'carrier', 'area']
export const AVATAR_SIDES = ['self', 'enemy']
// A relative area's reach: the source's own location, or that plus the squares
// adjacent (4 cardinal) or nearby (8 around) it -- the same shapes as passive
// scopes.
// 'realm' is every card in play, any region (still minus the source) -- "if you
// control a Knight".
export const AREA_SHAPES = ['grid', 'location', 'adjacent', 'nearby', 'realm']
// Ops whose subject is a selector.
const WHO_OPS = new Set([
  'tap',
  'dealDamage',
  'strike',
  'modifyStrength',
  'grantKeyword',
  'move',
  'destroy',
  'banish',
  'bounce',
  'heal',
  'animate',
  'flood',
  'unflood',
  'untap',
  'discard',
  'reanimate',
  'gainControl',
  'swap',
  'addCounter',
  'removeCounter',
  'preventDamage',
])
// Ops whose number is an amount (and so take an amountRef).
const AMOUNT_OPS = new Set([
  'dealDamage',
  'modifyStrength',
  'addCounter',
  'removeCounter',
  'preventDamage',
])

// Whose action fires a trigger: the card's own move, anyone's, or one side's.
export const TRIGGER_SUBJECTS = ['self', 'any', 'enemy', 'friendly']

// What a grant-style ability's gained abilities are lost to (Layer 4). 'never'
// keeps them for good.
export const LOSE_CONDITIONS = ['never', 'damaged', 'dies', 'leaves-realm', 'taps']

// Card-kind filter for a target picker. 'unit' = avatar or minion; 'minion' =
// non-avatar unit; 'monument' = an artifact that can't be carried. As in the
// rulebook, 'spell' is any Spellbook card -- magic, minion, artifact or aura --
// and 'magic' just the one-shot kind.
export const TARGET_FILTERS = [
  'any',
  'unit',
  'minion',
  'avatar',
  'site',
  'aura',
  'artifact',
  'monument',
  'magic',
  'spell',
]
// How the editor names each kind (singular, and plural for areas / counts).
export const FILTER_LABELS = {
  any: 'any card',
  unit: 'unit',
  minion: 'minion',
  avatar: 'avatar',
  site: 'site',
  aura: 'aura',
  artifact: 'artifact',
  monument: 'monument',
  magic: 'magic',
  spell: 'spell (magic, minion, artifact or aura)',
}
export const FILTER_PLURALS = {
  any: 'cards',
  unit: 'units',
  minion: 'minions',
  avatar: 'avatars',
  site: 'sites',
  aura: 'auras',
  artifact: 'artifacts',
  monument: 'monuments',
  magic: 'magics',
  spell: 'spells (any)',
}

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
  // Where the source is: an aura's four squares around its intersection (any
  // other card: its own square). Surface units, the sites, and artifacts there.
  'aura-area',
  'aura-area-friendly',
  'aura-area-enemy',
  // Whoever carries the source (a carried artifact's wielder).
  'bearer',
  // Everything on the board (of the kinds it affects), and a side's Avatar.
  'all',
  'all-friendly',
  'all-enemy',
  'avatar-friendly',
  'avatar-enemy',
]
// What kinds of card a non-self passive reaches.
export const PASSIVE_AFFECTS = ['units', 'sites', 'artifacts']

// What a passive cost modifier applies to: the affected card's own cast cost,
// every spell the affected side casts, or the mana cost of the affected cards'
// activated abilities.
export const PASSIVE_COST_ON = ['own', 'spells', 'abilities']


// Which spells a side-wide cost modifier applies to: the target filters that
// make sense for a cast card, plus magic and "permanent" (any non-magic spell).
export const PASSIVE_COST_FILTERS = [
  'any',
  'magic',
  'permanent',
  'minion',
  'aura',
  'artifact',
  'monument',
]

function matchesCostFilter(card, filter) {
  if (filter === 'permanent') return !!card && !card.magic
  return matchesFilter(card, filter)
}
// Which layer's units an aura-area passive reaches: the surface, below the
// site (underground / underwater), or both.
export const UNIT_LAYERS = ['surface', 'below', 'both']

// Whom a passive's cemetery tax applies to, relative to its controller.
export const CEMETERY_TAX_ON = ['everyone', 'opponent', 'you']

// Conditions (see conditionHolds). A passive applies only while its condition
// holds; a triggered ability's is an intervening "if" (tested as it triggers
// and again as it resolves); an effect's skips it -- running its `else` effects
// instead -- when false. Amount-based ones read a side's stats (`whose`: the
// card's side or the enemy's); card ones read the `subject` (the ability's card,
// its target, or the triggering card); `not` negates; all/any combine `of`.
export const PASSIVE_CONDITIONS = [
  'always',
  'onWater',
  'onLand',
  'onFlooded',
  'lifeAtMost',
  'lifeAtLeast',
  'manaAtLeast',
  'affinityAtLeast',
  'untapped',
  'tapped',
  'damaged',
  'hasKeyword',
  'region',
  'controlsCard',
  'all',
  'any',
]
export const CONDITION_TYPES = PASSIVE_CONDITIONS
export const CONDITION_SUBJECTS = ['self', 'target', 'triggering', 'other']
// Types that test a card (`subject`), and types that read a side's stats (`whose`).
export const SUBJECT_CONDITIONS = [
  'onWater',
  'onLand',
  'onFlooded',
  'untapped',
  'tapped',
  'damaged',
  'hasKeyword',
  'region',
]
export const STAT_CONDITIONS = [
  'lifeAtMost',
  'lifeAtLeast',
  'manaAtLeast',
  'affinityAtLeast',
]

// A condition's full shape: type, amount and element always; the rest only when
// set, so saved puzzles stay small.
export function normalizeCondition(c) {
  const type = PASSIVE_CONDITIONS.includes(c?.type) ? c.type : 'always'
  const out = {
    type,
    amount: Number(c?.amount) || 0,
    element: ELEMENTS.includes(c?.element) ? c.element : 'fire',
  }
  if (type === 'always') return out
  if (c.not) out.not = true
  if (SUBJECT_CONDITIONS.includes(type) && ['target', 'triggering', 'other'].includes(c.subject))
    out.subject = c.subject
  if (STAT_CONDITIONS.includes(type) && c.whose === 'enemy') out.whose = 'enemy'
  if (type === 'hasKeyword') out.keyword = KEYWORDS.includes(c.keyword) ? c.keyword : KEYWORDS[0]
  if (type === 'region') out.region = REGIONS.includes(c.region) ? c.region : 'surface'
  if (type === 'controlsCard')
    out.selector = normalizeSelector(
      c.selector || { who: 'area', area: { shape: 'realm', side: 'friendly', filter: 'minion' } },
      'area'
    )
  if (type === 'all' || type === 'any')
    out.of = Array.isArray(c.of) ? c.of.map(normalizeCondition) : []
  return out
}

// Change a condition's type in place (the editor binds to the object), keeping
// `not`/subject/whose and re-defaulting the rest.
export function setConditionType(cond, type) {
  const next = normalizeCondition({
    type,
    not: cond.not,
    subject: cond.subject,
    whose: cond.whose,
    element: cond.element,
    amount: cond.amount,
  })
  for (const k of Object.keys(cond)) delete cond[k]
  Object.assign(cond, next)
}

// An effect's condition is only saved while it has one: 'always' drops it and
// its `else` list.
export function setEffectCondition(eff, type) {
  if (type === 'always') {
    delete eff.condition
    delete eff.else
    return
  }
  if (!eff.condition) eff.condition = normalizeCondition({ type })
  else setConditionType(eff.condition, type)
  if (!Array.isArray(eff.else)) eff.else = []
}

export function addSubCondition(cond) {
  if (!Array.isArray(cond.of)) cond.of = []
  cond.of.push(normalizeCondition({ type: 'tapped' }))
}

export function removeSubCondition(cond, i) {
  cond.of.splice(i, 1)
}

// Coerce any stored/partial ability into the full shape the editor and runtime
// expect, so older files and hand-edited JSON never surface an undefined nested
// field. Also used to build a fresh ability (pass just { kind }).
export function normalizeAbility(a = {}) {
  return pointTriggerRefs(buildAbility(a))
}

// A triggered ability that doesn't ask the player for a target has no separate
// "target": its effects name the trigger's cards as 'triggering' / 'other', so
// one card has one name in the editor. Point any `target` there at the card the
// trigger names (trigger.targets). Idempotent; run on every new or retyped
// effect, since fresh effects default to `target`.
function pointTriggerRefs(ab) {
  if (ab.kind !== 'triggered' || ab.target.mode === 'grid' || ab.target.required) return ab
  const ref = ab.trigger.targets === 'other' ? 'other' : 'triggering'
  const fixCond = (c) => {
    if (!c) return
    if (c.subject === 'target') c.subject = ref
    if (c.selector) fixSel(c.selector)
    ;(c.of || []).forEach(fixCond)
  }
  const fixSel = (sel) => {
    if (sel?.who === 'target') sel.who = ref
  }
  const fixEffects = (list) =>
    (list || []).forEach((e) => {
      if (e.op !== 'banishAndCast') fixSel(e)
      if (e.countOf) fixSel(e.countOf)
      fixCond(e.condition)
      fixEffects(e.else)
    })
  fixCond(ab.condition)
  fixEffects(ab.effects)
  for (const m of ab.modes || []) fixEffects(m.effects)
  return ab
}

function buildAbility(a) {
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
      // May be summoned onto an opponent-controlled site. A trait rather than a
      // card flag so a future aura scope can lend it to other cards.
      summonOnEnemySites: !!a.passive?.summonOnEnemySites,
      // Area scopes: the source itself counts too.
      includeSelf: !!a.passive?.includeSelf,
      // Which kinds of card an area passive reaches (units only, by default).
      affects: Array.isArray(a.passive?.affects)
        ? a.passive.affects.filter((k) => PASSIVE_AFFECTS.includes(k))
        : ['units'],
      unitLayers: UNIT_LAYERS.includes(a.passive?.unitLayers) ? a.passive.unitLayers : 'surface',
      // This (non-unit) card becomes a minion with this power while the passive
      // applies. Self scope only.
      animate: !!a.passive?.animate,
      animatePower: a.passive?.animatePower == null ? 1 : Number(a.passive.animatePower) || 0,
      animatePowerRef: ANIMATE_POWER_REFS.includes(a.passive?.animatePowerRef)
        ? a.passive.animatePowerRef
        : 'literal',
      animatePowerBonus: Number(a.passive?.animatePowerBonus) || 0,
      // Both players treat both cemeteries as their own while this applies.
      swapCemeteries: !!a.passive?.swapCemeteries,
      // Extra mana to interact with cemetery cards (cast one, or use an
      // ability that targets one), and whom it taxes.
      cemeteryTax: Number(a.passive?.cemeteryTax) || 0,
      cemeteryTaxOn: CEMETERY_TAX_ON.includes(a.passive?.cemeteryTaxOn)
        ? a.passive.cemeteryTaxOn
        : 'everyone',
      // Mana delta on a cast (negative = cheaper) and what it applies to.
      costMod: Number(a.passive?.costMod) || 0,
      costOn: PASSIVE_COST_ON.includes(a.passive?.costOn) ? a.passive.costOn : 'own',
      // Spell kind a costOn 'spells' modifier applies to.
      costFilter: PASSIVE_COST_FILTERS.includes(a.passive?.costFilter)
        ? a.passive.costFilter
        : 'any',
      // Extra elemental affinity for the affected side's threshold. Grants
      // only -- clamped so hand-edited JSON can't dip below the base stat.
      affinity: {
        air: Math.max(0, Number(a.passive?.affinity?.air) || 0),
        earth: Math.max(0, Number(a.passive?.affinity?.earth) || 0),
        fire: Math.max(0, Number(a.passive?.affinity?.fire) || 0),
        water: Math.max(0, Number(a.passive?.affinity?.water) || 0),
      },
      // Restrictions on the affected cards.
      cantAttack: !!a.passive?.cantAttack,
      cantBeTargeted: !!a.passive?.cantBeTargeted,
      cantMove: !!a.passive?.cantMove,
      cantDefend: !!a.passive?.cantDefend,
    },

    // Passive-only: the passive applies only while this holds.
    // Passive: the passive applies only while this holds. Triggered: an
    // intervening "if", tested as it triggers and again as it resolves.
    condition: normalizeCondition(a.condition),
    trigger: {
      action: a.trigger?.action || 'move',
      from: a.trigger?.from || 'any',
      to: a.trigger?.to || 'any',
      subject: a.trigger?.subject || 'self',
      // Older files had no role, and their damage triggers keyed off the damaged
      // card -- which is now the 'target' role -- so back-fill accordingly.
      role: TRIGGER_ROLES.includes(a.trigger?.role)
        ? a.trigger.role
        : a.trigger?.action === 'damage'
        ? 'target'
        : 'actor',
      // Card-kind and range restrictions on the subject (range measured from the
      // ability's owner), as for an ability's target.
      filter: TARGET_FILTERS.includes(a.trigger?.filter) ? a.trigger.filter : 'any',
      within: TARGET_WITHIN.includes(a.trigger?.within) ? a.trigger.within : 'any',
      targets: TRIGGER_TARGET_REFS.includes(a.trigger?.targets) ? a.trigger.targets : 'subject',
    },
    cost: {
      mana: Number(a.cost?.mana) || 0,
      tap: !!a.cost?.tap,
      // Extra costs paid on activation (activated abilities): sacrifice this
      // card or the chosen target, discard / banish-from-cemetery N cards (the
      // first ones -- there is no choice UI for costs yet), pay N life.
      sacrifice: SACRIFICE_COSTS.includes(a.cost?.sacrifice) ? a.cost.sacrifice : 'none',
      discard: Math.max(0, Number(a.cost?.discard) || 0),
      life: Math.max(0, Number(a.cost?.life) || 0),
      banish: Math.max(0, Number(a.cost?.banish) || 0),
      // Activations allowed per turn; 0 = unlimited. A puzzle is one turn, so
      // this is per attempt.
      perTurn: Math.max(0, Number(a.cost?.perTurn) || 0),
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
      // Card mode, activated: how many different cards to pick (e.g. "banish
      // three spells from your cemetery").
      count: Math.max(1, Number(a.target?.count) || 1),
      // With `count` > 1: "up to" that many -- the player may stop early.
      upTo: !!a.target?.upTo,
    },
    effects: Array.isArray(a.effects) ? a.effects.map(normalizeEffect) : [],
    loseWhen: a.loseWhen || 'never',
    // Modal ("choose one..."): only saved when the ability has modes.
    ...(Array.isArray(a.modes) && a.modes.length
      ? {
          modes: a.modes.map(normalizeMode),
          chooseCount: Math.min(Math.max(1, Number(a.chooseCount) || 1), a.modes.length),
        }
      : {}),
  }
}

// ---------- modes ----------

// A modal ability ("choose one: ...") carries `modes: [{ name, target, effects }]`
// and `chooseCount`. The player picks that many modes before targeting; the
// ability then resolves as its *view* for those modes -- the chosen modes'
// effects (in mode order) followed by the ability's own effects, targeting with
// the first chosen mode that needs a pick (else the first chosen mode's target).
// Several chosen modes therefore share one target pick. When chooseCount covers
// every mode there is nothing to choose and all of them resolve.
export const hasModes = (a) => Array.isArray(a?.modes) && a.modes.length > 0
export const modeChoiceCount = (a) =>
  hasModes(a) ? Math.min(Math.max(1, Number(a.chooseCount) || 1), a.modes.length) : 0
export const needsModeChoice = (a) => hasModes(a) && modeChoiceCount(a) < a.modes.length

const targetNeedsPick = (t) =>
  !!t && ((t.mode === 'grid' && t.origin === 'pick') || (t.mode === 'card' && t.required))

// Canonical mode list: valid indices, deduped, sorted.
function cleanModes(ability, modes) {
  const n = ability.modes.length
  return [...new Set((modes || []).map(Number))]
    .filter((i) => i >= 0 && i < n)
    .sort((a, b) => a - b)
}

// The ability as it resolves for a set of chosen modes (see above). An ability
// without modes is returned unchanged. With `modes` omitted, an ability whose
// modes need no choice resolves all of them.
export function abilityView(ability, modes) {
  if (!hasModes(ability)) return ability
  const all = ability.modes.map((_, i) => i)
  const picked = cleanModes(ability, modes ?? (needsModeChoice(ability) ? [] : all))
  const chosen = picked.map((i) => ability.modes[i])
  const aim = chosen.find((m) => targetNeedsPick(m.target)) || chosen[0]
  return {
    ...ability,
    target: aim ? aim.target : ability.target,
    effects: [...chosen.flatMap((m) => m.effects || []), ...(ability.effects || [])],
    modes: [],
    chosenModes: picked,
  }
}

function normalizeMode(m = {}, i = 0) {
  return {
    name: m.name || `Mode ${i + 1}`,
    target: normalizeAbility({ kind: 'activated', target: m.target }).target,
    effects: Array.isArray(m.effects) ? m.effects.map(normalizeEffect) : [],
  }
}

export function addMode(ability) {
  if (!Array.isArray(ability.modes)) ability.modes = []
  ability.modes.push(normalizeMode({}, ability.modes.length))
  if (!ability.chooseCount) ability.chooseCount = 1
}

export function removeMode(ability, i) {
  ability.modes.splice(i, 1)
  if (!ability.modes.length) {
    delete ability.modes
    delete ability.chooseCount
  } else ability.chooseCount = Math.min(ability.chooseCount || 1, ability.modes.length)
}

// ---------- presets ----------

// A trigger's full default shape; presets override parts of it.
const TRIGGER_BASE = {
  action: 'move',
  from: 'any',
  to: 'any',
  subject: 'self',
  role: 'actor',
  filter: 'any',
  within: 'any',
  targets: 'subject',
}
// The common triggers, named as the rulebook / card text words them. Picking one
// fills in the raw trigger fields (still editable under "advanced").
export const TRIGGER_PRESETS = {
  genesis: { label: 'Genesis — when this enters the realm', name: 'Genesis', trigger: { action: 'enter' } },
  deathrite: { label: 'Deathrite — when this dies', name: 'Deathrite', trigger: { action: 'death' } },
  attacked: {
    label: 'When this is attacked',
    trigger: { action: 'attack', role: 'target', targets: 'other' },
  },
  attacks: { label: 'When this attacks', trigger: { action: 'attack', targets: 'other' } },
  damaged: { label: 'When this takes damage', trigger: { action: 'damage', role: 'target' } },
  moves: { label: 'When this moves', trigger: { action: 'move', from: 'realm', to: 'realm' } },
  nearbyEnemyDies: {
    label: 'When a nearby enemy dies',
    trigger: { action: 'death', subject: 'enemy', within: 'nearby' },
  },
  allyDies: { label: 'When an ally dies', trigger: { action: 'death', subject: 'friendly' } },
  enemyEnters: {
    label: 'When an enemy enters the realm',
    trigger: { action: 'enter', subject: 'enemy' },
  },
}

// Which preset a trigger currently is, or 'custom'.
export function triggerPresetOf(trigger) {
  for (const [key, p] of Object.entries(TRIGGER_PRESETS)) {
    const full = { ...TRIGGER_BASE, ...p.trigger }
    if (Object.keys(full).every((k) => trigger[k] === full[k])) return key
  }
  return 'custom'
}

export function applyTriggerPreset(ability, key) {
  const p = TRIGGER_PRESETS[key]
  if (!p) return
  Object.assign(ability.trigger, TRIGGER_BASE, p.trigger)
  if (!ability.name) ability.name = p.name || ''
}

// The "+ add ability" menu: trigger presets, then activated and passive starts.
export const ABILITY_STARTERS = [
  ...Object.entries(TRIGGER_PRESETS).map(([key, p]) => ({ key, kind: 'triggered', label: p.label })),
  { key: 'triggered', kind: 'triggered', label: 'Other trigger (custom)…' },
  { key: 'tap', kind: 'activated', label: 'Tap: … (activated)' },
  { key: 'activated', kind: 'activated', label: 'Activated, other cost…' },
  { key: 'passive', kind: 'passive', label: 'Passive — always on while in play' },
]

export function addAbility(cardId, kind = 'activated', preset = null) {
  const card = state.cards[cardId]
  if (!card) return
  if (!Array.isArray(card.abilities)) card.abilities = []
  const ability = normalizeAbility({ kind })
  if (kind === 'triggered' && preset) applyTriggerPreset(ability, preset)
  if (kind === 'activated' && preset === 'tap') ability.cost.tap = true
  card.abilities.push(ability)
  return ability.id
}

// Point a triggered ability's effects at a player-picked target (or back at the
// trigger's cards). Turning the pick off hands `target` effects back to the
// card the trigger names, as a load would.
export function setTriggerPick(ability, on) {
  ability.target.required = !!on
  if (!on) pointTriggerRefs(ability)
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
  if (op === 'strike') e.who = 'target'
  if (op === 'modifyStrength') Object.assign(e, { who: 'target', amount: 1, amountRef: 'literal' })
  if (op === 'grantKeyword') Object.assign(e, { who: 'target', keyword: 'airborne' })
  if (op === 'move')
    Object.assign(e, {
      who: 'target',
      to: 'sourceLocation',
      kind: 'teleport',
      reach: 'nearby',
      crossRegions: true,
    })
  if (op === 'summonToken')
    Object.assign(e, { token: 'soldier', count: 1, at: 'selfSurface', side: 'self', power: 1 })
  if (op === 'destroy' || op === 'banish' || op === 'bounce') e.who = 'target'
  if (op === 'heal') e.who = 'self'
  if (op === 'banishAndCast') Object.assign(e, { who: 'target', free: false })
  if (op === 'grantFrom') e.releaseTo = 'origin'
  if (op === 'animate')
    Object.assign(e, {
      who: 'target',
      power: 1,
      powerRef: 'literal',
      powerBonus: 0,
      duration: 'permanent',
    })
  // Flood/unflood a site: whose square, and whether the whole connected body of
  // water is drained (unflood) rather than the single targeted site.
  if (op === 'flood' || op === 'unflood') Object.assign(e, { who: 'target', scope: 'site' })
  if (op === 'untap') e.who = 'self'
  if (op === 'draw') Object.assign(e, { side: 'self', count: 1, deck: 'spellbook' })
  if (op === 'discard') Object.assign(e, { who: 'target', pick: 'chosen', side: 'enemy', count: 1 })
  if (op === 'search') Object.assign(e, { side: 'self', deck: 'spellbook', filter: 'any' })
  if (op === 'reanimate' || op === 'gainControl' || op === 'swap')
    e.who = 'target'
  if (op === 'addCounter' || op === 'removeCounter')
    Object.assign(e, { who: 'self', name: 'charge', amount: 1, amountRef: 'literal' })
  if (op === 'preventDamage') Object.assign(e, { who: 'self', amount: 1, amountRef: 'literal' })
  return normalizeEffect(e)
}

export function addEffect(ability, op = 'adjustStat') {
  if (!Array.isArray(ability.effects)) ability.effects = []
  ability.effects.push(newEffect(op))
  pointTriggerRefs(ability)
}

export function removeEffect(ability, i) {
  ability.effects.splice(i, 1)
}

// An area selector's shape, with defaults.
// `includeSelf` (the source counts too) is only saved while set.
function normalizeArea(a = {}) {
  const out = {
    shape: AREA_SHAPES.includes(a.shape) ? a.shape : 'nearby',
    filter: TARGET_FILTERS.includes(a.filter) ? a.filter : 'unit',
    side: TARGET_SIDES.includes(a.side) ? a.side : 'enemy',
  }
  if (a.includeSelf) out.includeSelf = true
  return out
}

// A selector's shape: `who`, plus `avatarSide` / `area` only when that `who`
// reads them (so saved effects stay small).
function normalizeSelector(s = {}, fallbackWho = 'self') {
  const who = EFFECT_WHO.includes(s.who) ? s.who : fallbackWho
  const out = { who }
  if (who === 'avatar') out.avatarSide = s.avatarSide === 'enemy' ? 'enemy' : 'self'
  if (who === 'area') out.area = normalizeArea(s.area)
  return out
}

// Point a selector (an effect, or its countOf) at another `who` in the editor,
// filling in the params that `who` reads.
export function setSelectorWho(sel, who) {
  const next = normalizeSelector({ ...sel, who }, sel.who)
  delete sel.avatarSide
  delete sel.area
  Object.assign(sel, next)
}

// Switch an effect's amount source in the editor; a count needs its selector.
export function setAmountRef(eff, ref) {
  eff.amountRef = AMOUNT_REFS.includes(ref) ? ref : 'literal'
  const counted = eff.amountRef === 'count' || eff.amountRef === 'counter'
  if (counted && !eff.countOf)
    eff.countOf = normalizeSelector({ who: 'area', area: { side: 'friendly', filter: 'minion' } }, 'area')
  if (eff.amountRef === 'counter' && !eff.counterName) eff.counterName = 'charge'
}

// Back-fill params added to an op after puzzles were saved with it, so older
// files load with sensible defaults. A move saved before kinds existed keeps its
// old behavior: a teleport that goes anywhere.
function normalizeEffect(eff) {
  const e = clone(eff)
  // Resolve only if `condition` holds, else run the `else` effects instead.
  // Only saved while the effect has a condition.
  if (e.condition && (e.condition.type || 'always') !== 'always') {
    e.condition = normalizeCondition(e.condition)
    e.else = Array.isArray(e.else) ? e.else.map(normalizeEffect) : []
  } else {
    delete e.condition
    delete e.else
  }
  // A missing `who` has always resolved to the activator (effectSubject treated
  // anything but 'target' as self), so that is what an old file keeps.
  if (WHO_OPS.has(e.op)) {
    const sel = normalizeSelector(e, 'self')
    if (!('avatarSide' in sel)) delete e.avatarSide
    if (!('area' in sel)) delete e.area
    Object.assign(e, sel)
  }
  if (AMOUNT_OPS.has(e.op)) {
    if (!AMOUNT_REFS.includes(e.amountRef)) e.amountRef = 'literal'
    if (e.amountRef === 'count' || e.amountRef === 'counter')
      e.countOf = normalizeSelector(e.countOf || { who: 'area', area: { side: 'friendly', filter: 'minion' } }, 'area')
    else delete e.countOf
    if (e.amountRef === 'counter') e.counterName = String(e.counterName || 'charge')
    else delete e.counterName
  }
  if (e.op === 'draw' || e.op === 'search') {
    e.side = EFFECT_SIDES.includes(e.side) ? e.side : 'self'
    e.deck = DECKS.includes(e.deck) ? e.deck : 'spellbook'
  }
  if (e.op === 'draw') e.count = Math.max(1, Number(e.count) || 1)
  if (e.op === 'search') e.filter = TARGET_FILTERS.includes(e.filter) ? e.filter : 'any'
  if (e.op === 'discard') {
    e.pick = DISCARD_PICKS.includes(e.pick) ? e.pick : 'chosen'
    e.side = EFFECT_SIDES.includes(e.side) ? e.side : 'enemy'
    e.count = Math.max(1, Number(e.count) || 1)
  }
  if (e.op === 'reanimate') e.reach = REANIMATE_REACH.includes(e.reach) ? e.reach : 'any'
  if (e.op === 'grantFrom') e.releaseTo = GRANT_RELEASE.includes(e.releaseTo) ? e.releaseTo : 'origin'
  if (e.op === 'addCounter' || e.op === 'removeCounter') e.name = String(e.name || 'charge')
  if (e.op === 'animate') {
    if (!ANIMATE_POWER_REFS.includes(e.powerRef)) e.powerRef = 'literal'
    e.powerBonus = Number(e.powerBonus) || 0
    if (!ANIMATE_DURATIONS.includes(e.duration)) e.duration = 'permanent'
  }
  if (e.op === 'move') {
    if (!MOVE_KINDS.includes(e.kind)) e.kind = 'teleport'
    if (!MOVE_REACH.includes(e.reach)) e.reach = 'nearby'
    if (typeof e.crossRegions !== 'boolean') e.crossRegions = e.kind === 'teleport'
  }
  if (e.op === 'summonToken') {
    if (!TOKEN_KINDS.includes(e.token)) e.token = 'soldier'
    if (!tokenLocationsFor(e.token).includes(e.at)) e.at = tokenLocationsFor(e.token)[0]
    e.count = Math.max(1, Number(e.count) || 1)
    e.side = e.side === 'enemy' ? 'enemy' : 'self'
    e.power = e.power == null ? 1 : Number(e.power) || 0
  }
  return e
}

// Switching a move between teleport and other forced movement resets whether it
// may change region to that kind's rule.
export function setMoveKind(eff, kind) {
  eff.kind = kind
  eff.crossRegions = kind === 'teleport'
}

// Switching token kind keeps the location only if the new kind supports it.
export function setTokenKind(eff, kind) {
  eff.token = kind
  const ok = tokenLocationsFor(kind)
  if (!ok.includes(eff.at)) eff.at = ok[0]
}

// Re-default an effect's params when its op changes in the editor, so a stale
// param from the previous op doesn't linger.
export function retypeEffect(ability, i, op) {
  ability.effects.splice(i, 1, newEffect(op))
  pointTriggerRefs(ability)
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
// Callers set the card payload before calling, and dragstart is the one moment
// the payload is readable, so the dragged card is picked up from it here.
export function beginDrag(e, imgEl, width) {
  ui.dragging = true
  try {
    ui.dragCard = JSON.parse(e.dataTransfer.getData('text/plain')).cardId || null
  } catch {
    ui.dragCard = null
  }
  setDragGhost(e, imgEl, width)
}

export function endDrag() {
  ui.dragging = false
  ui.dragCard = null
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
  // An animated site has left its slot to stand as a minion; route it like one.
  const asSite = card?.site && !animationOf(cardId)
  const cellMatch = /^cell:(\d+):(top|bot)$/.exec(to)
  if (cellMatch) return asSite ? `site:${cellMatch[1]}` : to
  const siteMatch = /^site:(\d+)$/.exec(to)
  if (siteMatch) return asSite ? to : `cell:${siteMatch[1]}:top`
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
// only aura cards on an intersection (any number may share a crossing).
function canPlace(cardId, to) {
  if (!state.zones[to]) return false
  if (state.mode === 'play' && to === 'pool') return false
  if (to.startsWith('site:') && state.zones[to].length) return false
  if (to.startsWith('aura:') && !state.cards[cardId]?.aura) return false
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
    ((from.startsWith('cell:') && to.startsWith('cell:')) ||
      (from.startsWith('aura:') && to.startsWith('aura:')))
  ) {
    state.tapped[card.id] = true
  }
  if (card.site && !from.startsWith('site:') && to.startsWith('site:')) {
    const side = from.includes('opponent') || card.enemy ? 'opponent' : 'player'
    const unitId = findSitePlayerUnit(side, to)
    if (unitId) state.tapped[unitId] = true
  }
}

// A token that leaves the realm ceases to exist: it is taken out of whatever
// zone it just landed in (after any death triggers keyed to its move, which
// fire off the entry regardless). Tokens are generated cards and cards the
// author designated as a token kind. Only while solving/recording -- the editor
// moves them freely. Undo rides the entry's structural snapshot, taken here
// after the card landed, so undoing the causing move puts it back.
function vanishToken(cardId, toZone, entry) {
  const c = state.cards[cardId]
  if (!c || !(c.generated || c.tokenKind)) return
  if (!state.recording && state.mode !== 'play') return
  if (!state.zones[toZone]?.includes(cardId)) return
  if (entry) snapshotStructural(entry)
  removeFromZones(state.zones, cardId)
  // Anything it was carrying goes with it to that zone rather than being
  // orphaned in `carry` with no carrier.
  for (const held of carriedBy(cardId)) {
    delete state.carry[held]
    delete state.grants[held]
    state.zones[toZone].push(held)
  }
  state.events.push({
    id: uid(),
    seq: entry?.seq,
    cardId,
    name: 'Token gone',
    text: `${cardName(cardId)} is a token and ceases to exist.`,
  })
}

// Leaving the realm makes a card a fresh object: it sheds every in-play change
// -- damage counters, strength counters, keywords granted during play, and the
// once-per-life Ward/Stealth flags -- and untaps. Called wherever a card is put
// into a non-realm zone; a no-op when it lands back in the realm (or never had
// any of this state). Undo-safe as long as the causing entry already snapshotted
// these maps (prevDamage/prevStrengthMod/... in logEntry), so clear only after.
function shedInPlayState(cardId, toZone, entry) {
  // Intersections are part of the realm too (an animated aura steps between them).
  if (['realm', 'aura'].includes(zoneCategory(toZone))) return
  vanishToken(cardId, toZone, entry)
  delete state.damage[cardId]
  delete state.strengthMod[cardId]
  delete state.grantedKeywords[cardId]
  delete state.animated[cardId]
  delete state.wardBroken[cardId]
  delete state.stealthLost[cardId]
  delete state.summoned[cardId]
  delete state.tapped[cardId]
  delete state.counters[cardId]
}

const inRealm = (zone) => ['realm', 'aura'].includes(zoneCategory(zone))

// Whether the player may move a card by hand (drag, or select-then-click) to
// `to`. While solving, a manual move always ends in the realm: an off-board card
// may only be played into it, and a realm card moves within it only through the
// armed Move action (ui.moving; Move & Attack's attack moves via targetAttack),
// subject to canMoveUnit. Nothing -- the avatar included -- goes to a hand,
// cemetery, collection, the storyline, etc. by hand; only abilities, triggers
// and effects (death, bounce, banish, draw, ...) do that, and those relocate
// cards without going through this check. The editor, recording included, is free.
export function manualMoveAllowed(cardId, to) {
  if (state.mode !== 'play') return true
  if (!inRealm(routeZone(cardId, to))) return false
  return !inRealm(zoneOf(cardId)) || ui.moving === cardId
}

// moveCard is the manual move -- every drag/click/keyboard relocation in the UI
// lands here; effects use forceMove/relocateCard instead. `draw` marks the one
// rules action routed through here that leaves the realm out (deck -> hand).
export function moveCard(cardId, from, to, opts = {}) {
  return withEditorSiteMana(() => moveCardImpl(cardId, from, to, opts))
}

function moveCardImpl(cardId, from, to, { tapOnMove, draw } = {}) {
  // A carried card has no zone of its own, so it cannot be moved out of one:
  // it has to be put down first. Bailing here rather than letting the splice
  // below fail also keeps it out of the pool branch, which would otherwise
  // answer a move request by placing a *copy* of it.
  if (state.carry[cardId]) return
  if (!draw && !manualMoveAllowed(cardId, to)) return
  to = routeZone(cardId, to)
  if (from === to || !canPlace(cardId, to)) return
  // When enforcing, a unit can only step cell-to-cell within its reach. Other
  // relocations (summoning from hand, editor placement) are not movement steps.
  if (
    enforcing() &&
    isUnit(cardId) &&
    ((from.startsWith('cell:') && to.startsWith('cell:')) ||
      (isOversized(cardId) && to.startsWith('aura:'))) &&
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
  const prevFloodedSites = clone(state.floodedSites)
  src.splice(i, 1)
  state.zones[to].push(cardId)

  const card = state.cards[cardId]
  if (card?.site && from.startsWith('site:')) {
    delete state.floodedSites[from.slice('site:'.length)]
  }
  const shouldTap = tapOnMove || ui.moving === cardId
  ui.moving = null
  applyMoveTaps(card, from, to, shouldTap)

  const entry = { cardId, from, to, prevTapped, prevFloodedSites }
  logEntry(entry)
  // After the entry snapshots the pre-move maps, a unit that left the realm
  // sheds its in-play state (damage, strength, granted keywords, ward, ...).
  shedInPlayState(cardId, to, entry)
  // A plain Move & Attack without the attack: the opponent may intercept the
  // unit where it stopped (a separate, deterministic entry). Only the dedicated
  // cell-to-cell Move action offers this -- not summons or effect relocations.
  if (
    shouldTap &&
    isUnit(card) &&
    from.startsWith('cell:') &&
    to.startsWith('cell:')
  )
    maybeAutoIntercept(cardId)
}

// ---------- moves, attacks & strikes ----------

export function beginMove(cardId) {
  if (!playerControls(cardId)) return
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
  if (!playerControls(cardId)) return
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
  if (!playerControls(cardId)) return
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
  emitFx('projectile', { sourceId: shooterId, targetId, style: 'arrow' })
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

// Y may intercept X: opposing units already sharing X's square (the location the
// move ended on -- an intercept never steps to engage), and -- if X is Airborne
// -- Y is Airborne or Ranged.
export function canIntercept(interceptorId, targetId) {
  if (!isUnit(interceptorId) || isDisabled(interceptorId) || !isUnit(targetId)) return false
  if (tapBlockedBySickness(interceptorId)) return false // intercepting taps
  const iCard = state.cards[interceptorId]
  const tCard = state.cards[targetId]
  if (!iCard || !tCard || !!iCard.enemy === !!tCard.enemy) return false
  if (isStealthed(targetId)) return false // Stealth can't be intercepted
  // Intercept only where the move ends: the interceptor must already stand on
  // the exact same location -- same square and same layer (both on the surface,
  // or both below) -- as the unit it fights.
  const i = nodeOf(interceptorId)
  const t = nodeOf(targetId)
  if (!i || !t || i.sq !== t.sq || i.layer !== t.layer) return false
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

// Resolve one intercept: the interceptor taps, the fight is logged, and (with
// combat on) damage is dealt. Shared by the manual and auto-intercept paths.
function performIntercept(interceptorId, targetId) {
  const prevTapped = clone(state.tapped)
  if (isUnit(interceptorId)) state.tapped[interceptorId] = true
  const entry = { type: 'intercept', cardId: interceptorId, targetId, prevTapped }
  logEntry(entry)
  if (combatActive()) resolveAttack(interceptorId, targetId, entry)
}

export function targetIntercept(targetId) {
  if (!ui.intercepting || ui.intercepting === targetId) return
  const interceptorId = ui.intercepting
  if (blockedByStealth(interceptorId, targetId)) return
  if (enforcing() && !canIntercept(interceptorId, targetId)) return
  performIntercept(interceptorId, targetId)
  ui.intercepting = null
}

// Number of on-board units on a side (true = opponent/enemy, false = player).
function boardUnitCount(enemySide) {
  let n = 0
  for (const u of boardUnits()) if (!!u.card.enemy === enemySide) n++
  return n
}

// The opponent's auto-intercept: after a player unit finishes a plain move on a
// square the opponent shares, decide whether an opposing unit steps up to fight
// it. Deterministic (like chooseAutoDefender) so a recorded solution replays the
// same way. Two modes mirror how a player weighs it:
//  - Survival: while the opponent avatar faces a lethal swing (or is already at
//    Death's Door), every unit that could defend the avatar is reserved -- never
//    spent intercepting. Units that can't defend it anyway intercept freely when
//    they can remove the mover, thinning the attack.
//  - Otherwise: play for material like chess -- only intercept to actually kill
//    the moved unit, and only at parity or a material edge, preferring a fight
//    the interceptor survives.
function chooseAutoInterceptor(movedUnitId) {
  if (!combatActive()) return null
  const mover = state.cards[movedUnitId]
  if (!mover || !isUnit(movedUnitId) || mover.enemy) return null
  const node = nodeOf(movedUnitId)
  if (!node) return null

  const candidates = []
  for (const id of unitsOnSquare(node.sq)) {
    // The avatar never intercepts -- it can't defend and must save itself.
    if (isAvatar(id)) continue
    if (state.cards[id]?.enemy && canIntercept(id, movedUnitId)) candidates.push(id)
  }
  if (!candidates.length) return null

  const avatar = oppAvatarUnit()
  const survival = avatarUnderThreat(avatar) || (state.stats.opponent?.life || 0) <= 0
  const edge = boardUnitCount(true) >= boardUnitCount(false)

  const mPow = effectivePower(movedUnitId)
  const mLife = Math.max(1, effectiveLife(movedUnitId))
  const mLethal = hasKeyword(movedUnitId, 'lethal')
  const value = (id) => defenderValue(id, avatar)
  const cheapestFirst = [...candidates].sort((a, b) => value(a) - value(b) || (a < b ? -1 : 1))

  for (const id of cheapestFirst) {
    if (survival && canReachAvatar(id, avatar)) continue // reserved to defend the avatar
    const kills = effectivePower(id) >= mLife || hasKeyword(id, 'lethal')
    if (!kills) continue // never spend an intercept without removing the piece
    const survives = effectiveLife(id) > mPow && !mLethal
    if (survival) return id // free removal of an attacker helps us survive
    if (survives || edge) return id // trade only at parity/advantage
  }
  return null
}

// After a plain move, let the opponent interpose an intercept if its AI wants to.
function maybeAutoIntercept(movedUnitId) {
  const interceptorId = chooseAutoInterceptor(movedUnitId)
  if (interceptorId) performIntercept(interceptorId, movedUnitId)
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
    if (!canDefendAt(u.id, targetId)) continue
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

// Every node a card stands on: its one square and layer, or all four squares of
// an oversized unit (which stands on the surface).
function occupiedNodes(cardId) {
  const n = nodeOf(cardId)
  if (!n) return []
  return squaresOf(cardId).map((sq) => nodeKey(sq, n.layer))
}

// Could this unit defend the given card? It must be able to reach it; a passive
// "can't move to defend" limits it to defending where it already stands -- any
// square it occupies shared with any square the defended card occupies.
function canDefendAt(unitId, targetId) {
  if (cantDefend(unitId)) {
    const here = new Set(occupiedNodes(unitId))
    return occupiedNodes(targetId).some((k) => here.has(k))
  }
  const node = nodeOf(targetId)
  return !!node && reachableNodes(unitId).has(nodeKey(node.sq, node.layer))
}

// Could this unit reach the given avatar's square (i.e. defend it)?
function canReachAvatar(unitId, avatarUnit) {
  return !!avatarUnit && canDefendAt(unitId, avatarUnit.id)
}

function defenderValue(id, avatarUnit) {
  const pLife = state.stats.player?.life || 0
  // A unit that can't attack threatens nothing, however strong.
  const threat = !cantAttack(id) && effectivePower(id) >= pLife && pLife > 0 ? DEF_THREAT : 0
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
    if (cantAttack(u.id)) continue // a passive forbids it to attack at all
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
// intersection holds auras and nothing else, so anything else dropped by an
// aura goes to the square up and left of the crossing.
function dropTarget(itemId, zone) {
  const card = state.cards[itemId]
  const auraMatch = /^aura:(\d+)$/.exec(zone)
  if (auraMatch) {
    if (card?.aura) return zone
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
  if (!entry.prevFloodedSites) entry.prevFloodedSites = clone(state.floodedSites)
  if (!entry.prevStrengthMod) entry.prevStrengthMod = clone(state.strengthMod)
  if (!entry.prevGrantedKeywords)
    entry.prevGrantedKeywords = clone(state.grantedKeywords)
  if (!entry.prevAnimated) entry.prevAnimated = clone(state.animated)
  if (!entry.prevCastPermits) entry.prevCastPermits = clone(state.castPermits)
  if (!entry.prevControlFlips) entry.prevControlFlips = clone(state.controlFlips)
  if (!entry.prevSummoned) entry.prevSummoned = clone(state.summoned)
  if (!entry.prevStealthLost) entry.prevStealthLost = clone(state.stealthLost)
  if (!entry.prevWardBroken) entry.prevWardBroken = clone(state.wardBroken)
  if (!entry.prevCounters) entry.prevCounters = clone(state.counters)
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
  settleAnimations(entry)
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

// The card performing an entry. A damage event's actor is its source (a manual
// damage mark has none); everything else is performed by its cardId.
const entryActor = (entry) =>
  entry.type === 'damage' ? entry.sourceId || null : entry.cardId || null

// The cards an entry is done to. An attack is done to both the attacked card and
// any defender that stepped in (the one actually fought); damage to the damaged
// card; an ability or cast to every card it picked.
function entryTargets(entry) {
  const type = entry.type || 'move'
  if (type === 'attack') return [entry.defenderId, entry.targetId].filter(Boolean)
  if (type === 'damage') return [entry.cardId].filter(Boolean)
  if (['strike', 'shoot', 'intercept', 'pickup', 'ability', 'cast'].includes(type))
    return (entry.targetIds?.length ? entry.targetIds : [entry.targetId]).filter(Boolean)
  return []
}

// A trigger's candidate { subject, other } pairs from an entry, by its role.
function triggerParties(trigger, entry) {
  const actor = entryActor(entry)
  const targets = entryTargets(entry)
  if (trigger.role === 'target' && TARGETED_TRIGGER_ACTIONS.includes(trigger.action))
    return targets.map((t) => ({ subject: t, other: actor }))
  return [{ subject: actor, other: targets[0] || null }]
}

// Does the entry's type fit the trigger's action? 'death' is a convenience for a
// unit's realm->cemetery move; damage only counts when some was actually dealt.
function actionMatches(action, entry) {
  const type = entry.type || 'move'
  if (action === 'death')
    return (
      type === 'move' &&
      ['realm', 'aura'].includes(zoneCategory(entry.from)) &&
      zoneCategory(entry.to) === 'cemetery' &&
      isUnit(entry.cardId)
    )
  if (action === 'enter')
    return (
      type === 'move' &&
      !['realm', 'aura'].includes(zoneCategory(entry.from)) &&
      ['realm', 'aura'].includes(zoneCategory(entry.to))
    )
  if (action !== type) return false
  if (type === 'damage' && !((entry.amount || 0) > 0)) return false
  return true
}

// Where the subject is for a trigger's range: the square(s) it is on now, else
// where it was when the event happened (hit on, or left from -- a unit that
// just died).
function subjectSquares(subjectId, entry) {
  const now = areaSquares(subjectId)
  if (now.length) return now
  if (entry.at?.[subjectId]) return [entry.at[subjectId].sq]
  if (subjectId === entry.cardId) {
    const m = /^(?:cell|site):(\d+)/.exec(entry.from || '')
    if (m) return [Number(m[1])]
    const a = /^aura:(\d+)$/.exec(entry.from || '')
    if (a) return intersectionSquares(Number(a[1]))
  }
  return []
}

// Range from the owner to the subject for a trigger's `within` (adjacent =
// cardinal, nearby = king), measured from any square the owner is on (an aura's
// four). Unlike a target pick, an unmeasurable card is never in range.
function triggerWithin(ownerId, subjectId, within, entry) {
  if (within === 'any' || !within) return true
  if (ownerId === subjectId) return true
  const t = subjectSquares(subjectId, entry)
  if (!t.length) return false
  return areaSquares(ownerId).some((s) =>
    t.some((q) => (within === 'adjacent' ? areAdjacent(s, q) : s === q || areNearby(s, q)))
  )
}

// Does a logged entry satisfy a triggered ability's condition? Returns the
// matched { subject, other } party, or null. Zone parts are compared as
// categories, and a wildcard ('any') side matches an entry that has no such zone
// (an attack has neither from nor to, for instance).
function triggerMatches(trigger, owner, entry) {
  if (!actionMatches(trigger.action, entry)) return null
  if (trigger.from !== 'any' && !catMatches(trigger.from, zoneCategory(entry.from)))
    return null
  if (trigger.to !== 'any' && !catMatches(trigger.to, zoneCategory(entry.to)))
    return null
  for (const party of triggerParties(trigger, entry)) {
    if (!party.subject) continue
    if (!subjectMatches(trigger.subject, owner, party.subject)) continue
    if (!matchesFilter(state.cards[party.subject], trigger.filter || 'any')) continue
    if (!triggerWithin(owner.id, party.subject, trigger.within, entry)) continue
    return party
  }
  return null
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
// Events resolved in the current drain, capped by STORY_LIMIT.
let storyResolved = 0
const STORY_LIMIT = 200

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
  return cat === 'realm' || cat === 'aura' || zoneListHas(ability.zones, cat)
}

function collectTriggers(entry) {
  const out = []
  for (const owner of Object.values(state.cards)) {
    // A gained trigger is the carrier's: "when this attacks" watches the unit
    // that assumed the form, not the carried card.
    for (const a of abilitiesOf(owner.id)) {
      if (a.kind !== 'triggered') continue
      const party = triggerMatches(a.trigger, owner, entry)
      if (!party) continue
      if (!triggerLive(owner, a)) continue
      // Silence strips abilities: a silenced card's triggers don't fire --
      // except one resolving after its owner has left play (Deathrite), which
      // silence no longer reaches.
      if (isSilenced(owner.id) && !(departureTrigger(a, owner.id, party.subject) && !inPlay(owner.id)))
        continue
      // Intervening "if": a trigger whose condition is false doesn't trigger at
      // all (and is tested again as it resolves -- see storyIgnored).
      const cctx = {
        sourceId: owner.id,
        targetId: (a.trigger?.targets === 'other' ? party.other : party.subject) || null,
        triggeringId: party.subject,
        otherId: party.other || null,
      }
      if (!conditionHolds(a.condition, cctx)) continue
      // A consequence event (damage, a death's replayed move) snapshots onto the
      // logged entry that caused it.
      out.push({
        ownerId: owner.id,
        ability: a,
        triggeringId: party.subject,
        otherId: party.other,
        killed: entry.killed || null,
        ownerAt: ownerOrigin(owner.id, entry),
        entry: entry.root || entry,
      })
    }
  }
  return out
}

// Source-left-realm: a queued ability is ignored if its owner is no longer in
// the realm -- UNLESS it is a departure trigger (fires on the owner reaching the
// cemetery or banished zone, i.e. Deathrite), which is meant to resolve after
// the owner has left.
function sourceGone(ev) {
  // Departure triggers (Deathrite) are meant to resolve after the owner leaves.
  if (departureTrigger(ev.ability, ev.ownerId, ev.triggeringId)) return false
  // Deaths settle before damage events do, so a unit killed in the exchange still
  // gets its own "when damaged" / "whenever this deals damage" ability -- but
  // only from the batch that killed it: later damage to or from a dead card must
  // not keep its abilities alive.
  if (
    ev.ability.trigger.action === 'damage' &&
    ev.killed?.has(ev.ownerId) &&
    (ev.triggeringId === ev.ownerId || ev.otherId === ev.ownerId)
  )
    return false
  // Otherwise the event is ignored once its source has left the board (it is no
  // longer in the realm nor an aura on the mat) -- or has been silenced since
  // it triggered.
  if (!inPlay(ev.ownerId)) return true
  return isSilenced(ev.ownerId)
}

// A departure trigger resolves after its owner has left play: a Deathrite-style
// move to the cemetery/banished zone, or the owner's own death.
function departureTrigger(ability, ownerId, subjectId) {
  const t = ability.trigger
  if (t.to === 'cemetery' || t.to === 'banished') return true
  return t.action === 'death' && subjectId === ownerId
}

// Where a trigger's owner is measured from when it has no board position of its
// own (it just died, or was hit and then left): the node it left, or where it
// stood when the causing hit landed. Null when it is on the board (its own
// position is used) or can't be placed.
function ownerOrigin(ownerId, event) {
  if (nodeOf(ownerId)) return null
  if (event.cardId === ownerId && (event.type || 'move') === 'move') {
    const m = /^cell:(\d+):(top|bot)$/.exec(event.from || '')
    if (m) return { sq: Number(m[1]), layer: m[2] }
    const s = /^site:(\d+)$/.exec(event.from || '')
    if (s) return { sq: Number(s[1]), layer: 'top' }
    const a = /^aura:(\d+)$/.exec(event.from || '')
    if (a) return { sq: intersectionSquares(Number(a[1]))[0], layer: 'top' }
  }
  return event.at?.[ownerId] || null
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
  return needsCardChoice(ev) || needsDestChoice(ev, autoTarget(ev))
}

function needsCardChoice(ev) {
  const t = ev.ability.target
  if (t.mode === 'grid' && t.origin === 'pick') return true
  if (t.mode === 'card' && t.required)
    return triggerTargets(ev.ownerId, ev.ability).length > 0
  return false
}

// A destination pick is asked for only when it can be answered (the same rule
// continueActivate applies to activated abilities).
function needsDestChoice(ev, targetId) {
  const spec = destSpec(ev.ability)
  if (!spec || (specNeedsTarget(spec) && !targetId)) return false
  return anyDestLegal(spec, ev.ownerId, targetId)
}

function logStoryEvent(ev, ignored) {
  const a = ev.ability
  // Why it was ignored: its source left or was silenced, or its intervening
  // "if" failed.
  const reason = !ignored
    ? null
    : !sourceGone(ev)
    ? 'its condition no longer holds'
    : inPlay(ev.ownerId)
    ? 'its source was silenced'
    : 'its source left the realm'
  state.events.push({
    ...(reason ? { reason } : {}),
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
  return fallbackTarget(ev)
}

// The card a trigger refers to by default: its subject, or the other party.
const triggerRef = (ev) =>
  ev.ability.trigger?.targets === 'other' ? ev.otherId || null : ev.triggeringId

// The trigger's default card, when it may stand in as the ability's target. With
// a required card target it must be a legal pick (so an untargetable card is
// never hit through the fallback); the other party is also shielded by Stealth
// and "can't be targeted". Otherwise the ability resolves with no target: its
// `who: target` effects are skipped and the rest still run.
function fallbackTarget(ev) {
  const ref = triggerRef(ev)
  if (!ref) return null
  const t = ev.ability.target
  if (t.mode === 'card' && t.required && !satisfiesTarget(ev.ownerId, ref, t)) return null
  if (
    ev.ability.trigger?.targets === 'other' &&
    (blockedByStealth(ev.ownerId, ref) || (cantBeTargeted(ref) && oppositeSides(ev.ownerId, ref)))
  )
    return null
  return ref
}

// Drain the storyline. Resumable: if an event needs a player choice, it pauses
// (leaving the rest on storyStack) and returns; resolveStoryChoice runs the
// choice then calls this again to continue.
function resolveStory() {
  while (storyStack && storyStack.length) {
    const ev = storyStack.shift()
    // Safety net against abilities that keep re-triggering each other: halt the
    // storyline rather than freeze the page.
    if (++storyResolved > STORY_LIMIT) {
      state.events.push({
        id: uid(),
        seq: ev.entry.seq,
        cardId: ev.ownerId,
        name: 'Storyline halted',
        text: `Too many chained abilities (over ${STORY_LIMIT}); the rest are ignored.`,
        status: 'ignored',
        reason: 'the storyline was halted',
      })
      storyStack = null
      return
    }
    // Modes that need no choice all resolve.
    if (hasModes(ev.ability) && !needsModeChoice(ev.ability)) ev.ability = abilityView(ev.ability)
    const ignored = storyIgnored(ev)
    if (!ignored && needsModeChoice(ev.ability)) {
      // Choose the modes first (ChoicePopup); targeting follows.
      ui.storyChoice = { ...storyFields(ev), pickModes: true, dest: false, targetId: null }
      return
    }
    if (!ignored && needsChoice(ev)) {
      pauseForChoice(ev)
      return
    }
    logStoryEvent(ev, ignored)
    // Effects resolve against the card that set it off. New triggers unshift onto
    // storyStack and so resolve next (interrupt).
    if (!ignored)
      runEffects(ev.ability, ev.ownerId, autoTarget(ev), ev.entry, null, null, {
        triggeringId: ev.triggeringId,
        otherId: ev.otherId,
        ownerAt: ev.ownerAt,
      })
  }
  storyStack = null
}

// A queued trigger is ignored when its source has left, or when its intervening
// "if" no longer holds as it resolves.
function storyIgnored(ev) {
  if (sourceGone(ev)) return true
  const ctx = {
    sourceId: ev.ownerId,
    targetId: triggerRef(ev),
    triggeringId: ev.triggeringId,
    otherId: ev.otherId,
  }
  return !conditionHolds(ev.ability.condition, ctx)
}

const storyFields = (ev) => ({
  ownerId: ev.ownerId,
  ability: ev.ability,
  entry: ev.entry,
  triggeringId: ev.triggeringId,
  otherId: ev.otherId,
  killed: ev.killed,
  ownerAt: ev.ownerAt,
})

// Suspend for the player to choose. The rest of the storyline waits. With no
// card to pick it goes straight to the destination pick.
function pauseForChoice(ev) {
  const pickCard = needsCardChoice(ev)
  ui.storyChoice = {
    ...storyFields(ev),
    dest: !pickCard,
    targetId: pickCard ? null : autoTarget(ev),
    picked: [],
  }
}

// The paused trigger's modes are chosen: resolve it as that mode view -- asking
// for a target/destination if it now needs one -- then resume the storyline.
function chooseStoryModes(picked) {
  const c = ui.storyChoice
  const ev = { ...storyFields(c), ability: abilityView(c.ability, picked) }
  ui.storyChoice = null
  if (needsChoice(ev)) {
    pauseForChoice(ev)
    return
  }
  finishStoryChoice(ev, autoTarget(ev), null, null)
}

// Any card still pickable for the paused trigger besides those picked.
function storyTargetsLeft(c, picks) {
  return Object.keys(state.cards).some(
    (id) => id !== c.ownerId && !picks.includes(id) && satisfiesTarget(c.ownerId, id, c.ability.target)
  )
}

// The player picked a target (or square) for the paused triggered ability;
// resolve it, then continue the storyline.
export function resolveStoryChoice(targetId, gridSquare) {
  const c = ui.storyChoice
  if (!c || c.dest || c.pickModes) return
  // A multi-target trigger collects `count` distinct targets -- or all there
  // are (a trigger has to resolve, so it never waits on an impossible pick).
  const needed = pickCount(c.ability)
  if (targetId != null && needed > 1) {
    const picks = [...(c.picked || []), targetId]
    if (picks.length < needed && storyTargetsLeft(c, picks)) {
      ui.storyChoice = { ...c, picked: picks }
      return
    }
    ui.storyChoice = null
    finishStoryChoice(c, picks[0], null, null, picks)
    return
  }
  const t = targetId ?? fallbackTarget(c)
  // A destination still to pick: stay paused, now asking for the square.
  if (gridSquare == null && needsDestChoice(c, t)) {
    ui.storyChoice = { ...c, dest: true, targetId: t }
    return
  }
  ui.storyChoice = null
  finishStoryChoice(c, t, gridSquare, null)
}

// Resolve a paused trigger with everything chosen, then resume the storyline.
// `ids` are a multi-target trigger's picks.
function finishStoryChoice(c, targetId, gridSquare, destZone, ids = null) {
  const ev = {
    ability: c.ability,
    ownerId: c.ownerId,
    entry: c.entry,
    triggeringId: c.triggeringId,
    otherId: c.otherId,
    killed: c.killed,
    ownerAt: c.ownerAt,
  }
  const ignored = storyIgnored(ev)
  logStoryEvent(ev, ignored)
  if (!ignored)
    runAbilityEffects(c.ability, c.ownerId, targetId, c.entry, ids, gridSquare, destZone, {
      triggeringId: c.triggeringId,
      otherId: c.otherId,
      ownerAt: c.ownerAt,
    })
  resolveStory() // resume the rest of the storyline
}

// "Up to N" on a paused trigger: stop picking and resolve with what is picked.
export function finishStoryPicks() {
  const c = ui.storyChoice
  if (!c || c.dest || c.pickModes || !c.ability.target.upTo || !c.picked?.length) return
  ui.storyChoice = null
  finishStoryChoice(c, c.picked[0], null, null, c.picked)
}

// Decline the paused trigger's optional ("may") target: resolve it with no
// target, so its `who: target` effects are skipped and the rest still run, then
// continue the storyline. Only offered while an optional choice is pending.
export function declineStoryChoice() {
  const c = ui.storyChoice
  if (!c || c.dest || c.pickModes || c.picked?.length || !c.ability.target.optional) return
  if (needsDestChoice(c, null)) {
    ui.storyChoice = { ...c, dest: true, targetId: null }
    return
  }
  ui.storyChoice = null
  finishStoryChoice(c, null, null, null)
}

// Whether a click on this card resolves the paused trigger's card target.
export function isStoryChoiceTarget(id) {
  const c = ui.storyChoice
  if (!c || c.dest || c.pickModes || c.ability.target.mode !== 'card') return false
  if (c.picked?.includes(id)) return false
  return id !== c.ownerId && satisfiesTarget(c.ownerId, id, c.ability.target)
}

// The paused trigger's grid pick, if it wants a square.
export function activeStoryGridPick() {
  const c = ui.storyChoice
  return c && !c.pickModes && c.ability.target.mode === 'grid' && c.ability.target.origin === 'pick'
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
    storyResolved = 0
    resolveStory()
  }
}

// Arm a card to pick something up; the next click on another card carries it.
// Sites are deliberately not excluded: the app has no notion of a site that
// has become a unit -- card.site stays true either way -- so refusing by that
// flag would block the one case that most needs carrying.
export function beginPickup(cardId) {
  if (!playerControls(cardId)) return
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
  if (!playerControls(carrierId)) return
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
  if (filter === 'minion') return isUnit(card) && !card.avatar
  if (filter === 'avatar') return isAvatar(card)
  if (filter === 'site') return !!card.site
  if (filter === 'aura') return !!card.aura
  if (filter === 'artifact') return !!card.artifact
  if (filter === 'monument') return !!card.monument
  if (filter === 'magic') return !!card.magic
  if (filter === 'spell') return isSpell(card.id)
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

// The activated abilities a card can use right now: its own (including those
// gained via a grant, see abilitiesOf) plus those of every card it carries,
// filtered to the ones live in the card's current zone category. A granted card
// offers none -- its abilities are its carrier's now.
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
    for (const a of abilitiesOf(id)) {
      if (a.kind === 'activated' && zoneListHas(a.zones, cat)) out.push(a)
    }
    for (const held of carriedBy(id)) if (!state.grants[held]) collect(held)
  }
  collect(cardId)
  return out
}

// The ability currently waiting for a target, if any.
// As it resolves for the chosen modes (abilityView); null while the player is
// still choosing modes.
export function activeAbility() {
  if (!ui.activating || ui.activating.pickModes) return null
  return abilityView(findAbility(ui.activating.cardId, ui.activating.abilityId), ui.activating.modes)
}

// The chosen modes riding along an activation (for the `extra` of
// continueActivate/performAbility/performCast), or null.
const modesExtra = (a) => (a?.modes ? { modes: a.modes } : null)

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
  const extra = modesExtra(ui.activating)
  ui.activating = null
  if (cast) performCast(cardId, abilityId, null, sq, null, extra)
  else performAbility(cardId, abilityId, null, sq, null, extra)
}

// ---------- destination picks (teleport / token placement) ----------

// Some effects need a location chosen when the ability resolves: a `move` to a
// picked location, or a token placed at an adjacent / nearby / any site. For a
// card-target ability that is a second pick, after the target. A grid ability
// already has its picked square, which these effects use instead. One pick per
// ability: the first effect that needs one sets the rules for it.
// In a triggered ability without a pick, the card its trigger names is the
// resolving target, whichever of target / triggering / other spells it.
const namesTarget = (eff) => ['target', 'triggering', 'other'].includes(eff.who)
function destSpec(ability) {
  if (!ability || ability.target?.mode === 'grid') return null
  for (const eff of ability.effects || []) {
    if (eff.op === 'move' && eff.to === 'picked') {
      const reach = eff.reach || 'nearby'
      return {
        anchor: namesTarget(eff) ? 'target' : 'source',
        mover: namesTarget(eff) ? 'target' : 'source',
        reach,
        needSite: false,
        layers: ['top', 'bot'],
        // Adjacent/nearby locations are always in the same region; an 'any'
        // move may change region only if it is allowed to (teleport default).
        sameRegion: reach !== 'any' || eff.crossRegions === false,
        label: eff.kind === 'forced' ? 'where to move it' : 'where to teleport',
      }
    }
    // Reanimate always summons onto a picked location; when it names the target
    // (or the source itself), the pick is checked as a legal summon of that card.
    if (eff.op === 'reanimate') {
      return {
        anchor: 'source',
        mover: null,
        summon: namesTarget(eff) ? 'target' : eff.who === 'self' ? 'source' : null,
        reach: eff.reach || 'any',
        needSite: false,
        layers: ['top', 'bot'],
        sameRegion: false,
        label: 'where it is summoned',
      }
    }
    if (eff.op === 'summonToken' && PICKED_TOKEN_LOCATIONS.includes(eff.at)) {
      return {
        anchor: 'source',
        mover: null,
        reach: eff.at === 'anySite' ? 'any' : eff.at,
        needSite: eff.at === 'anySite',
        layers: ['top'],
        sameRegion: false,
        label: 'where the token appears',
      }
    }
  }
  return null
}

// The square a card stands on (a unit's cell, or a site's own square).
function squareOf(id) {
  if (!id) return null
  return nodeOf(id)?.sq ?? squareOfSite(id) ?? null
}

// Whether a board zone is a legal destination for a spec, resolved against the
// ability's source and chosen target. An anchor that isn't on the board (a
// spell cast from hand) can't be measured from, so reach doesn't constrain it.
function destLegal(spec, sourceId, targetId, zone) {
  if (!spec) return false
  const m = /^cell:(\d+):(top|bot)$/.exec(zone || '')
  if (!m) return false
  const sq = Number(m[1])
  const layer = m[2]
  if (!spec.layers.includes(layer)) return false
  const region = regionOf(sq, layer)
  if (!region) return false
  if (spec.needSite && !siteOn(sq)) return false
  const anchorSq = squareOf(spec.anchor === 'target' ? targetId : sourceId)
  if (anchorSq != null) {
    if (spec.reach === 'adjacent' && !(areAdjacent(anchorSq, sq) && anchorSq !== sq))
      return false
    if (spec.reach === 'nearby' && !areNearby(anchorSq, sq)) return false
  }
  const summonId =
    spec.summon === 'target' ? targetId : spec.summon === 'source' ? sourceId : null
  if (summonId && enforcing() && isUnit(summonId) && !state.cards[summonId]?.avatar) {
    if (!legalSummonLocation(summonId, zone)) return false
  }
  const moverId =
    spec.mover === 'target' ? targetId : spec.mover === 'source' ? sourceId : null
  if (moverId) {
    const from = zoneOf(moverId)
    // Moving to where it already is isn't movement at all.
    if (from === zone) return false
    const fromRegion = zoneRegion(from)
    if (spec.sameRegion && fromRegion && fromRegion !== region) return false
  }
  return true
}

const CELL_ZONES = Array.from({ length: GRID_SIZE }, (_, i) => [
  `cell:${i}:top`,
  `cell:${i}:bot`,
]).flat()

// A destination measured from, moving, or summoning the target needs one.
const specNeedsTarget = (spec) =>
  spec.anchor === 'target' || spec.mover === 'target' || spec.summon === 'target'

const anyDestLegal = (spec, sourceId, targetId) =>
  CELL_ZONES.some((z) => destLegal(spec, sourceId, targetId, z))

// Advance an armed activation/cast once its card target (possibly none) is
// settled: ask for a destination if an effect needs one, else resolve now. A
// spec with no legal destination resolves without one (those effects skip),
// rather than leaving the player stuck on an impossible pick.
// `dropSquare` is where a drag-cast spell landed (kept on its entry so an area
// can be measured from there).
// `extra` carries a multi-pick's targetIds/castId and a modal ability's chosen
// modes; a multi-pick takes no destination.
function continueActivate(cardId, abilityId, cast, targetId, extra = null, dropSquare = null) {
  const spec = destSpec(abilityView(findAbility(cardId, abilityId), extra?.modes))
  if (
    !extra?.targetIds &&
    spec &&
    !(specNeedsTarget(spec) && !targetId) &&
    anyDestLegal(spec, cardId, targetId)
  ) {
    ui.activating = {
      cardId,
      abilityId,
      cast: !!cast,
      targetId: targetId || null,
      dest: true,
      dropSquare,
      ...(extra?.modes ? { modes: extra.modes } : {}),
    }
    return
  }
  ui.activating = null
  if (cast) performCast(cardId, abilityId, targetId || null, null, null, extra, dropSquare)
  else performAbility(cardId, abilityId, targetId || null, null, null, extra)
}

// Run an ability's effects. With several picked targets (`ids`, by default the
// entry's own), each `who: target` effect runs once per target; everything else
// (and banishAndCast, which takes the whole pick) runs once.
function runAbilityEffects(ability, cardId, targetId, entry, ids = entry.targetIds, gridSquare, destZone, extra = {}) {
  if (!ids || ids.length < 2) {
    runEffects(ability, cardId, targetId, entry, gridSquare, destZone, extra)
    return
  }
  const perTarget = (ability.effects || []).filter(
    (e) => e.who === 'target' && e.op !== 'banishAndCast'
  )
  const once = (ability.effects || []).filter((e) => !perTarget.includes(e))
  runEffects({ ...ability, effects: once }, cardId, ids[0], entry, gridSquare, destZone, extra)
  for (const t of ids)
    runEffects({ ...ability, effects: perTarget }, cardId, t, entry, gridSquare, destZone, extra)
}

// The armed activation's destination pick, if it is waiting for one.
export function activeDestPick() {
  return ui.activating?.dest ? destSpec(activeAbility()) : null
}

export function canPickDest(zone) {
  const spec = activeDestPick()
  return !!spec && destLegal(spec, ui.activating.cardId, ui.activating.targetId, zone)
}

export function pickDest(zone) {
  if (!canPickDest(zone)) return
  const { cardId, abilityId, cast, targetId, dropSquare } = ui.activating
  const extra = modesExtra(ui.activating)
  ui.activating = null
  if (cast) performCast(cardId, abilityId, targetId, null, zone, extra, dropSquare)
  else performAbility(cardId, abilityId, targetId, null, zone, extra)
}

// The paused trigger's destination pick, if it is waiting for one.
export function activeStoryDestPick() {
  const c = ui.storyChoice
  return c?.dest ? destSpec(c.ability) : null
}

export function canStoryPickDest(zone) {
  const spec = activeStoryDestPick()
  return !!spec && destLegal(spec, ui.storyChoice.ownerId, ui.storyChoice.targetId, zone)
}

export function pickStoryDest(zone) {
  if (!canStoryPickDest(zone)) return
  const c = ui.storyChoice
  ui.storyChoice = null
  finishStoryChoice(c, c.targetId, null, zone)
}

// Either kind of destination pick is armed (activation or paused trigger).
export const destPickArmed = () => !!(activeDestPick() || activeStoryDestPick())
export const canPickAnyDest = (zone) => canPickDest(zone) || canStoryPickDest(zone)
export function pickAnyDest(zone) {
  if (activeStoryDestPick()) pickStoryDest(zone)
  else pickDest(zone)
}

// What the player is being asked to pick, for the prompts.
export function destPrompt(ability) {
  const spec = destSpec(ability)
  return spec ? `Click a highlighted square: ${spec.label}.` : ''
}

// The target must be on the right side relative to the source.
function matchesTargetSide(sourceId, targetId, side, invert = false) {
  if (side === 'any' || !side) return true
  const same = (!!state.cards[sourceId]?.enemy === !!state.cards[targetId]?.enemy) !== invert
  return side === 'friendly' ? same : !same
}

// The target must be within range of the source (adjacent = cardinal, nearby =
// king). Unmeasurable sources (a spell cast from hand) don't constrain range.
function withinTargetRange(sourceId, targetId, within, range) {
  if (within === 'any' || !within) return true
  if (within === 'projectile') return projectileTargets(sourceId, range).has(targetId)
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
  if (!catMatches(t.from, cardZoneCategory(targetId))) return false
  if (!matchesFilter(state.cards[targetId], t.filter)) return false
  // With cemeteries swapped, "your" cemetery is the opponent's and vice versa,
  // so the side restriction flips for cemetery cards.
  const swappedGrave = t.from === 'cemetery' && cemeteriesSwapped()
  if (!matchesTargetSide(sourceId, targetId, t.side, swappedGrave)) return false
  if (!withinTargetRange(sourceId, targetId, t.within, t.range)) return false
  if (blockedByStealth(sourceId, targetId)) return false
  // A passive "can't be targeted" only shields against the opponent.
  if (cantBeTargeted(targetId) && oppositeSides(sourceId, targetId)) return false
  return true
}

// Whether a click on this card would satisfy the armed ability's target.
export function canActivateTarget(targetId) {
  const ability = activeAbility()
  if (!ability || ui.activating.dest) return false
  // Choosing which of the picked cards to cast.
  if (ui.activating.choosing) return (ui.activating.picked || []).includes(targetId)
  if (targetId === ui.activating.cardId) return false
  if ((ui.activating.picked || []).includes(targetId)) return false
  // A target that is also the sacrifice cost must be sacrificeable.
  if (ability.cost?.sacrifice === 'target' && !sacrificeable(ui.activating.cardId, targetId))
    return false
  return satisfiesTarget(ui.activating.cardId, targetId, ability.target)
}

// How many cards the armed ability picks, and whether it then asks which of
// them to cast.
const pickCount = (ability) =>
  ability?.target?.mode === 'card' ? Math.max(1, Number(ability.target.count) || 1) : 1
const choosesCast = (ability) =>
  (ability?.effects || []).some((e) => e.op === 'banishAndCast')

// The picker's progress, for the prompt: { picked, needed, choosing, upTo }.
export function activatePickState() {
  if (!ui.activating || ui.activating.dest || ui.activating.pickModes) return null
  const ability = activeAbility()
  const needed = pickCount(ability)
  if (needed <= 1 && !choosesCast(ability)) return null
  return {
    picked: (ui.activating.picked || []).length,
    needed,
    choosing: !!ui.activating.choosing,
    upTo: !!ability?.target?.upTo && needed > 1,
  }
}

// A paused trigger's multi-target progress: { picked, needed, upTo }, or null.
export function storyPickState() {
  const c = ui.storyChoice
  if (!c || c.dest || c.pickModes) return null
  const needed = pickCount(c.ability)
  if (needed <= 1) return null
  return { picked: (c.picked || []).length, needed, upTo: !!c.ability.target.upTo }
}

// Whether a card is already picked by a multi-target pick in progress.
export function isPickedTarget(id) {
  return !!(ui.activating?.picked?.includes(id) || ui.storyChoice?.picked?.includes(id))
}

// ---------- effect ops ----------

const STRUCTURAL_OPS = new Set(['grantFrom', 'release'])

const otherSide = (side) => (side === 'player' ? 'opponent' : 'player')

// The cards a selector picks (see EFFECT_WHO). `ctx` is the resolving
// ability's { ability, sourceId, targetId, triggeringId, pickSquare,
// castSquare }. Only existing cards are returned; Ward is applied by the caller,
// per recipient.
function selectCards(sel, ctx) {
  const src = ctx.sourceId
  const one = (id) => (id && state.cards[id] ? [id] : [])
  switch (sel?.who) {
    case 'target':
      return one(ctx.targetId)
    case 'triggering':
      return one(ctx.triggeringId)
    case 'other': {
      const id = ctx.otherId
      if (!id || blockedByStealth(src, id) || (cantBeTargeted(id) && oppositeSides(src, id))) return []
      return one(id)
    }
    case 'carrier':
      return one(carrierOf(src))
    case 'avatar': {
      const wantEnemy =
        sel.avatarSide === 'enemy' ? !state.cards[src]?.enemy : !!state.cards[src]?.enemy
      const all = Object.keys(state.cards).filter(
        (id) => isAvatar(id) && !!state.cards[id].enemy === wantEnemy
      )
      // The one on the board; else one kept off it as a life stat.
      const onMat = all.filter(inPlay)
      return onMat.length ? onMat : all.slice(0, 1)
    }
    case 'area':
      return selectArea(sel.area || {}, ctx)
    default:
      return one(src)
  }
}

// Where a relative area is measured from: the source's own position; for a
// triggered ability whose owner has left the board (a Deathrite), the node it
// left or was hit on; for a spell resolving from hand, which has none, the
// square it was dropped on, else its caster (the side's avatar). Anything else
// with no position has no area.
function areaOrigin(ctx) {
  const own = nodeOf(ctx.sourceId)
  if (own) return own
  if (ctx.ownerAt) return ctx.ownerAt
  if (!ctx.isSpellCast) return null
  if (ctx.castSquare != null) return { sq: ctx.castSquare, layer: 'top' }
  const caster = selectCards({ who: 'avatar', avatarSide: 'self' }, ctx)[0]
  return caster ? nodeOf(caster) : null
}

// An area selector's cards. 'grid' reuses the ability's own grid target (and so
// its origin/shape/layers and target filter); the relative shapes look around
// the source within its own region, like passive scopes. As in the rulebook,
// adjacent/nearby include the source's own square. The source itself is left
// out unless
// `includeSelf`. Sites are only picked up by a 'site' filter -- an area of "any"
// cards means what stands in it, not the ground.
function selectArea(area, ctx) {
  const src = ctx.sourceId
  const other = (id) => area.includeSelf || id !== src
  let ids = []
  if (area.shape === 'grid') {
    const t = ctx.ability?.target
    if (t?.mode === 'grid') ids = resolveGridArea(src, ctx.pickSquare, t)
  } else if (area.shape === 'realm') {
    // Everything in play, any region. Sites only for a 'site' filter, as below.
    ids = Object.keys(state.cards).filter(
      (id) => other(id) && inPlay(id) && (area.filter === 'site' || !state.cards[id].site)
    )
  } else {
    const s = areaOrigin(ctx)
    if (!s) return []
    const region = regionOf(s.sq, s.layer)
    const squares =
      area.shape === 'location'
        ? [s.sq]
        : squaresInShape(s.sq, area.shape)
    for (const sq of squares) {
      for (const layer of ['top', 'bot']) {
        if (regionOf(sq, layer) !== region) continue
        ids.push(...(state.zones[`cell:${sq}:${layer}`] || []))
      }
      if (area.filter === 'site') ids.push(...(state.zones[`site:${sq}`] || []))
    }
    // Oversized minions standing over any of those squares (surface).
    if (!ctx.raw && (region === 'surface' || region === 'void')) {
      for (const sq of squares) for (const id of oversizedOnSquare(sq)) if (!ids.includes(id)) ids.push(id)
    }
    ids = ids.filter(other)
  }
  // Read raw inside the passive computation (see conditionHolds).
  const kindOk = ctx.raw
    ? (id) => rawMatchesFilter(id, area.filter)
    : (id) => matchesFilter(state.cards[id], area.filter)
  return ids.filter((id) => kindOk(id) && matchesTargetSide(src, id, area.side))
}

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

// The board squares an ability's grid target covers (as opposed to the cards
// standing on them). Shared by area effects so a site-state change (flood) and a
// damage effect aim through exactly the same origin/shape logic. A picked origin
// uses the chosen square; a self origin uses the source's own square, but a spell
// cast from hand has none, so it falls back to the square it was dropped on.
function resolveGridSquares(sourceId, pickedSquare, target) {
  const src = nodeOf(sourceId)
  const originSq = target.origin === 'pick' || src == null ? pickedSquare : src.sq
  if (originSq == null) return []
  return squaresInShape(originSq, target.shape)
}

function resolveGridArea(sourceId, pickedSquare, target) {
  const src = nodeOf(sourceId)
  const squares = resolveGridSquares(sourceId, pickedSquare, target)
  if (!squares.length) return []
  const layers = target.throughLayers ? ['top', 'bot'] : [src?.layer || 'top']
  const out = []
  for (const sq of squares) {
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
// it came from and where it goes on release. A pseudo-pickup, so cycles are
// refused like a real one.
function grantFrom(carrierId, targetId, ability, entry, eff) {
  if (!targetId || state.carry[targetId] || wouldCycle(carrierId, targetId)) return
  const from = zoneOf(targetId)
  const arr = state.zones[from]
  const i = arr?.indexOf(targetId) ?? -1
  if (i === -1) return
  snapshotStructural(entry)
  arr.splice(i, 1)
  state.carry[targetId] = carrierId
  state.grants[targetId] = {
    carrierId,
    from,
    abilityId: ability.id,
    releaseTo: eff?.releaseTo || 'origin',
  }
}

// The zone a released grant's card lands in (see GRANT_RELEASE). Its origin
// square may be gone; fall back to the pool rather than lose it.
function grantReleaseZone(cardId, g) {
  const side = sideOf(cardId)
  const to =
    g.releaseTo === 'banished'
      ? `banished:${side}`
      : g.releaseTo === 'cemetery'
      ? `grave:${side}`
      : g.releaseTo === 'hand'
      ? `hand:${side}`
      : g.from
  return state.zones[to] ? to : 'pool'
}

// Release every grant a carrier holds: the carried card is removed from the
// carrier and put where its grant says (grantReleaseZone). Used by an explicit
// `release` effect and by the loseWhen watcher.
function releaseGrant(carrierId, entry) {
  for (const t of Object.keys(state.grants)) {
    const g = state.grants[t]
    if (g.carrierId !== carrierId) continue
    snapshotStructural(entry)
    delete state.carry[t]
    delete state.grants[t]
    state.zones[grantReleaseZone(t, g)].push(t)
  }
}

// Banish the picked cemetery cards; the one chosen may then be cast (paying its
// cost, or free) by the ability's controller -- from banishment, and back to
// banishment once a magic resolves. The permission is a cast permit, so the
// player casts it through the normal cast flow as a move of its own.
function banishAndCast(eff, cardId, targetId, entry) {
  const ids = entry?.targetIds || (targetId ? [targetId] : [])
  const banished = []
  for (const id of ids) {
    if (cardZoneCategory(id) !== 'cemetery') continue
    snapshotStructural(entry)
    removeFromZones(state.zones, id)
    const bz = `banished:${sideOf(id)}`
    state.zones[bz].push(id)
    shedInPlayState(id, bz, entry)
    banished.push(id)
  }
  const castId = entry?.castId || (ids.length === 1 ? ids[0] : null)
  if (castId && banished.includes(castId) && isSpell(castId)) {
    state.castPermits[castId] = { side: sideOf(cardId), free: !!eff.free }
  }
  if (!banished.length) return
  const names = banished.map(cardName).join(', ')
  state.events.push({
    id: uid(),
    seq: entry?.seq,
    cardId: castId || banished[0],
    name: 'Banished',
    text:
      castId && state.castPermits[castId]
        ? `${names} ${banished.length > 1 ? 'are' : 'is'} banished. ${cardName(castId)} may be cast${eff.free ? ' for free' : ''}.`
        : `${names} ${banished.length > 1 ? 'are' : 'is'} banished.`,
  })
}

// Animate: a non-unit object in the realm becomes a minion of the given power
// until it leaves the realm. A carried object is set down first on its
// carrier's square, since a minion stands on its own. A site steps off its slot
// onto its square's surface and leaves Rubble; an aura becomes an oversized
// minion on its intersection. Undo rides the entry's
// prevAnimated snapshot (plus the structural one if it was set down).
function animateCard(id, spec, entry, sourceId) {
  const c = state.cards[id]
  if (!c || c.unit || c.avatar || animationOf(id)) return
  const zone = zoneOf(id) || ''
  if (!['realm', 'aura'].includes(zoneCategory(zone))) return
  const carrier = state.carry[id]
  const siteSlot = carrier ? null : /^site:(\d+)$/.exec(zone)
  if (siteSlot) {
    // A site gets up and walks off: it stands on its own square's surface as a
    // minion, and Rubble takes its place so the square stays land.
    const sq = siteSlot[1]
    snapshotStructural(entry)
    removeFromZones(state.zones, id)
    delete state.floodedSites[sq]
    state.zones[`cell:${sq}:top`].push(id)
    const rubbleId = nextTokenId(id, 'rubble')
    state.cards[rubbleId] = makeTokenCard(rubbleId, 'rubble', c.enemy, 0)
    state.zones[`site:${sq}`].push(rubbleId)
  } else if (!carrier && /^aura:\d+$/.test(zone)) {
    // An aura stays on its intersection: an oversized minion on all four squares.
  } else if (carrier) {
    const zone = zoneOf(carrier)
    if (!/^cell:\d+:(top|bot)$/.test(zone || '')) return
    snapshotStructural(entry)
    delete state.carry[id]
    delete state.grants[id]
    state.zones[zone].push(id)
  } else if (!/^cell:\d+:(top|bot)$/.test(zoneOf(id) || '')) {
    return
  }
  state.animated[id] = {
    power: Number(spec.power) || 0,
    powerRef: spec.powerRef || 'literal',
    powerBonus: Number(spec.powerBonus) || 0,
    // How long it lasts, with the baselines each duration measures against.
    duration: ANIMATE_DURATIONS.includes(spec.duration) ? spec.duration : 'permanent',
    tapped0: !!state.tapped[id],
    damage0: state.damage[id] || 0,
    sourceId: sourceId || null,
  }
  const power = animatedPower(id, state.animated[id])
  const how = siteSlot
    ? ', leaving Rubble behind'
    : isOversized(id)
    ? ', occupying all four squares around it'
    : ''
  state.events.push({
    id: uid(),
    seq: entry?.seq,
    cardId: id,
    name: 'Animated',
    text: `${cardName(id)} becomes a ${power}-power minion${how}.`,
  })
}

// The numeric amount an effect uses: a literal, or a computed value like the
// number of cards the source is carrying (a projectile's picked-up payload).
function effectAmount(eff, sourceId, ctx) {
  if (eff.amountRef === 'carriedCount') return carriedBy(sourceId).length
  // How many cards a nested selector picks (counting doesn't touch them, so
  // Ward is not involved), or the total of a named counter on them.
  if (eff.amountRef === 'count') return ctx ? selectCards(eff.countOf, ctx).length : 0
  if (eff.amountRef === 'counter')
    return ctx ? selectCards(eff.countOf, ctx).reduce((n, id) => n + counterOf(id, eff.counterName), 0) : 0
  if (eff.amountRef === 'power') return combatPower(sourceId)
  // Scale off the body of water the source stands on (or the site it is).
  if (eff.amountRef === 'waterBodySize') {
    const sq = nodeOf(sourceId)?.sq ?? squareOfSite(sourceId)
    return sq == null ? 0 : waterBodySizeAt(sq)
  }
  return Number(eff.amount) || 0
}

// Resolve a `move` effect's location reference to a board zone id. A picked
// location is the chosen destination, or a grid ability's picked square.
function resolveLocation(ref, sourceId, targetId, destZone, pickSquare) {
  if (ref === 'picked') {
    if (destZone) return destZone
    return typeof pickSquare === 'number' ? `cell:${pickSquare}:top` : null
  }
  if (ref === 'projectileStop') return projectileStep(sourceId, targetId, -1)
  if (ref === 'projectileBeyond') return projectileStep(sourceId, targetId, 1)
  return zoneOf(ref === 'targetLocation' ? targetId : sourceId)
}

// Forced movement (teleport, push, pull, drag, being carried): the unit takes no
// step of its own, so Immobile doesn't stop it and no Move is spent. Teleports
// may cross regions by default; other forced movement stays in its region unless
// the effect says otherwise. Moving to the location it is already in is not
// movement at all -- nothing happens and nothing triggers. What it carries comes
// along (carried cards follow their carrier). Fires "move" triggers like any
// other movement; undo rides the causing entry's structural snapshot.
function forceMove(id, to, eff, entry) {
  if (!id || !to || !state.cards[id]) return
  const routed = routeZone(id, to)
  if (!state.zones[routed]) return
  const from = zoneOf(id)
  if (from === routed) return
  const fromRegion = zoneRegion(from)
  const toRegion = zoneRegion(routed)
  const crosses = eff.crossRegions ?? (eff.kind || 'teleport') === 'teleport'
  if (fromRegion && toRegion && fromRegion !== toRegion && !crosses) return
  relocateCard(id, routed, entry)
  const teleport = (eff.kind || 'teleport') === 'teleport'
  state.events.push({
    id: uid(),
    seq: entry?.seq,
    cardId: id,
    name: teleport ? 'Teleports' : 'Moved',
    text: `${cardName(id)} ${teleport ? 'teleports' : 'is moved'} to ${zoneLabel(routed)}.`,
  })
  fireTriggers({ type: 'move', cardId: id, from, to: routed, seq: entry?.seq, forced: true, root: entry })
  checkSurvival(entry) // moving into a hostile region can kill
}

// ---------- tokens ----------

// A small generated face for a token card, so it reads on the board without an
// uploaded image.
function tokenImage(name, enemy) {
  const fill = enemy ? '#5a2330' : '#23405a'
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="250" height="350" viewBox="0 0 250 350">` +
    `<rect x="6" y="6" width="238" height="338" rx="18" fill="${fill}" stroke="#d8c690" stroke-width="6"/>` +
    `<text x="125" y="160" font-family="Georgia,serif" font-size="30" fill="#f3e9c9" text-anchor="middle">${name}</text>` +
    `<text x="125" y="205" font-family="Georgia,serif" font-size="20" fill="#d8c690" text-anchor="middle">token</text>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// Token ids are deterministic -- source, kind and the first free index -- so a
// recorded solution that later moves a token names the same card when the
// solver replays it. An index is free when no zone or carrier holds that id;
// after an undo the id is simply reused.
function nextTokenId(sourceId, kind) {
  const held = new Set(Object.values(state.zones).flat())
  for (let k = 0; ; k++) {
    const id = `${sourceId}~${kind}~${k}`
    if (!held.has(id) && !state.carry[id]) return id
  }
}

function makeTokenCard(id, kind, enemy, power) {
  const def = TOKEN_DEFS[kind]
  // A designated template lends its name, art and abilities; the effect still
  // sets the power, and the kind still decides the card type.
  const tpl = tokenTemplate(kind, enemy)
  return {
    id,
    name: tpl?.name || def.name,
    img: tpl?.img || tokenImage(def.name, enemy),
    imgId: tpl?.imgId,
    abilities: tpl ? clone(tpl.abilities || []) : [],
    affinity: tpl?.site
      ? { air: 0, earth: 0, fire: 0, water: 0 }
      : clone(tpl?.affinity || { air: 0, earth: 0, fire: 0, water: 0 }),
    defense: tpl?.defense ?? '',
    enemy: !!enemy,
    // Generated during play: purged on reset and never saved with the puzzle.
    generated: true,
    token: kind,
    unit: !!def.unit,
    avatar: false,
    site: !!def.site,
    aura: false,
    water: false,
    magic: false,
    artifact: !!def.artifact,
    monument: false,
    lanceToken: !!def.lanceToken,
    castFromCemetery: false,
    power: def.unit ? power : 0,
    spellCost: { mana: 0, air: 0, earth: 0, fire: 0, water: 0 },
    manaProvided: 0,
    tokenKind: '',
  }
}

// The art of the designated Ward token, drawn on a unit whose Ward is intact.
export function wardTokenArt(unitId) {
  if (!hasWard(unitId)) return null
  return tokenTemplate('ward', state.cards[unitId]?.enemy)?.img || null
}

// The board zone a token lands in for an effect's `at`, or null if it can't be
// placed. self/target are handled by the caller (they attach to a unit).
function tokenZone(at, sourceId, targetId, destZone, pickSquare) {
  if (at === 'selfSurface' || at === 'selfBelow') {
    const sq = squareOf(sourceId)
    if (sq == null) return null
    if (at === 'selfBelow') return regionOf(sq, 'bot') ? `cell:${sq}:bot` : null
    return `cell:${sq}:top`
  }
  if (at === 'targetLocation') {
    const z = zoneOf(targetId)
    if (/^cell:\d+:(top|bot)$/.test(z || '')) return z
    const sq = squareOf(targetId) ?? (typeof pickSquare === 'number' ? pickSquare : null)
    return sq == null ? null : `cell:${sq}:top`
  }
  if (PICKED_TOKEN_LOCATIONS.includes(at)) {
    if (destZone) return destZone
    if (typeof pickSquare !== 'number') return null
    if (at === 'anySite' && !siteOn(pickSquare)) return null
    return `cell:${pickSquare}:top`
  }
  return null
}

// Generate token(s). Entering the realm is not movement (it comes from outside),
// but it is a genesis: "enters" triggers fire, a minion token is summoned this
// turn, and a unit that lands where it can't survive dies/is banished at once.
function summonTokens(eff, cardId, targetId, entry, destZone, pickSquare) {
  const source = state.cards[cardId]
  if (!source) return
  const kind = eff.token || 'soldier'
  const enemy = eff.side === 'enemy' ? !source.enemy : !!source.enemy
  const onUnit = eff.at === 'self' ? cardId : eff.at === 'target' ? targetId : null

  if (!TOKEN_DEFS[kind]) return

  const count = Math.max(1, Number(eff.count) || 1)
  for (let n = 0; n < count; n++) {
    const id = nextTokenId(cardId, kind)
    let carrierId = null
    let zone = null
    if (onUnit) {
      // A lance on a unit is carried by it.
      if (kind !== 'lance' || !isUnit(onUnit)) return
      carrierId = onUnit
    } else {
      zone = tokenZone(eff.at, cardId, targetId, destZone, pickSquare)
      if (!zone || !state.zones[zone]) return
    }
    snapshotStructural(entry)
    state.cards[id] = makeTokenCard(id, kind, enemy, Number(eff.power ?? 1) || 0)
    if (carrierId) state.carry[id] = carrierId
    else state.zones[zone].push(id)
    if (state.cards[id].unit) state.summoned[id] = true
    const landed = carrierId ? zoneOf(carrierId) : zone
    state.events.push({
      id: uid(),
      seq: entry?.seq,
      cardId: id,
      name: 'Token',
      text: carrierId
        ? `${cardName(id)} token enters carried by ${cardName(carrierId)}.`
        : `${cardName(id)} token enters the realm.`,
    })
    emitFx('genesis', { cardId: id })
    fireTriggers({ type: 'move', cardId: id, from: null, to: landed, seq: entry?.seq, root: entry })
  }
  checkSurvival(entry)
}

// Generated tokens exist only for the play session that made them. Drop them
// from the card map (a reset or a new line starts without them, and a save never
// records them).
function purgeGeneratedCards() {
  for (const [id, c] of Object.entries(state.cards)) {
    if (c.generated) delete state.cards[id]
  }
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
  shedInPlayState(id, routed, entry)
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
  state.events.push({
    id: uid(),
    seq: entry.seq,
    cardId: id,
    name: label,
    text: `${cardName(id)} ${
      kind === 'banish' ? 'is banished' : kind === 'bounce' ? 'returns to hand' : 'is destroyed'
    }.`,
  })
  shedInPlayState(id, zone, entry)
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

// An effect list as it resolves: each effect whose condition holds, else its
// `else` effects (recursively). Lazy, so each condition is tested only when its
// effect is reached -- after the effects before it have changed the board.
function* conditionalEffects(list, ctx) {
  for (const eff of list || []) {
    if (conditionHolds(eff.condition, ctx)) yield eff
    else yield* conditionalEffects(eff.else, ctx)
  }
}

function runEffects(ability, cardId, targetId, entry, gridSquare, destZone, extra = {}) {

  const card = state.cards[cardId]
  const side = card?.enemy ? 'opponent' : 'player'
  // Ward: an opponent's ability that would target or affect a warded object is
  // prevented for it, and the Ward breaks instead. Checked per recipient; once a
  // Ward has absorbed this ability, that card is spared the rest of its effects.
  // The chosen target's Ward breaks up front, on being targeted.
  const shielded = new Set()
  const wardStops = (id) => {
    if (shielded.has(id)) return true
    if (!id || !wardBlocks(cardId, id)) return false
    breakWard(id, entry)
    shielded.add(id)
    return true
  }
  const wardedTarget = !!targetId && wardStops(targetId)
  // For a grid ability, the affected cards are resolved once from its area. A
  // trigger that picked a square passes it here; otherwise the entry carries it.
  const pickSquare = gridSquare == null ? entry?.gridSquare : gridSquare
  // A chosen destination (teleport / token placement): passed in by a paused
  // trigger, or carried on an activation's own entry.
  const dest = destZone || (entry?.type === 'ability' || entry?.type === 'cast' ? entry.destZone : null)
  // A cast spell's drop square (a grid spell's is its picked square), for areas
  // measured around a spell that has no board position of its own.
  // Only the spell being cast measures an area from its caster as a last resort.
  const isSpellCast = entry?.type === 'cast' && entry.cardId === cardId
  const castSquare = isSpellCast ? entry.dropSquare ?? entry.gridSquare ?? null : null
  const ctx = {
    ability,
    sourceId: cardId,
    targetId,
    triggeringId: extra.triggeringId ?? null,
    otherId: extra.otherId ?? null,
    ownerAt: extra.ownerAt ?? null,
    isSpellCast,
    pickSquare,
    castSquare,
  }
  // The cards an effect lands on, resolved when that effect runs (an earlier
  // effect may have changed the board) and minus any a Ward protects.
  const recipients = (sel) => selectCards(sel, ctx).filter((id) => !wardStops(id))
  for (const eff of conditionalEffects(ability.effects, ctx)) {
    if (wardedTarget && (eff.who === 'target' || eff.op === 'grantFrom')) continue

    if (eff.op === 'adjustStat') {
      const s =
        eff.side === 'self' || !eff.side
          ? side
          : eff.side === 'enemy'
          ? otherSide(side)
          : eff.side
      adjustStat(s, eff.key || 'mana', Number(eff.delta) || 0)
    } else if (eff.op === 'tap') {
      for (const t of recipients(eff)) state.tapped[t] = true
    } else if (eff.op === 'dealDamage') {
      const ts = recipients(eff)
      const amount = effectAmount(eff, cardId, ctx)
      // With combat on, an ability's damage resolves like a hit (Lethal-aware,
      // life loss to avatars/sites, death) -- every recipient is hit, then
      // deaths and damage events settle together; otherwise it just marks
      // counters. Only a card on the mat (or an Avatar kept off it as a life
      // stat) announces the damage -- a dead card must not keep triggering.
      if (ts.length && combatActive()) {
        const hits = newHits()
        for (const t of ts) applyHit(cardId, t, amount, hits)
        settleHits(entry, hits)
      } else if (ts.length) {
        const dealt = []
        for (const t of ts) {
          const prevented = absorbDamage(t, amount)
          if (prevented) announcePrevented(entry, [{ targetId: t, amount: prevented }])
          if (amount - prevented <= 0) continue
          adjustDamage(t, amount - prevented)
          if (inPlay(t) || isAvatar(t)) dealt.push({ sourceId: cardId, targetId: t, amount: amount - prevented })
        }
        if (dealt.length) fireDamage(entry, dealt)
      }
    } else if (eff.op === 'strike') {
      // The source strikes each recipient: its power plus any Lance bonus (the
      // lances break), resolved like a manual strike. Without combat it just
      // marks the power as damage counters.
      for (const t of recipients(eff)) {
        if (combatActive()) strikeWithLance(cardId, t, entry)
        else adjustDamage(t, combatPower(cardId))
      }
    } else if (eff.op === 'modifyStrength') {
      const amount = effectAmount(eff, cardId, ctx)
      for (const t of recipients(eff)) state.strengthMod[t] = (state.strengthMod[t] || 0) + amount
    } else if (eff.op === 'grantKeyword') {
      if (!eff.keyword) continue
      for (const t of recipients(eff)) {
        const list = state.grantedKeywords[t] || (state.grantedKeywords[t] = [])
        if (!list.includes(eff.keyword)) list.push(eff.keyword)
        // Granting a Ward also restores a broken one.
        if (eff.keyword === 'ward' && state.wardBroken[t]) {
          delete state.wardBroken[t]
          state.events.push({ id: uid(), seq: entry?.seq, cardId: t, name: 'Ward', text: `${cardName(t)} gains a Ward.` })
        }
      }
    } else if (eff.op === 'move') {
      const to = resolveLocation(eff.to, cardId, targetId, dest, pickSquare)
      for (const who of recipients(eff)) forceMove(who, to, eff, entry)
    } else if (eff.op === 'summonToken') {
      summonTokens(eff, cardId, targetId, entry, dest, pickSquare)
    } else if (eff.op === 'destroy' || eff.op === 'banish' || eff.op === 'bounce') {
      // Resolved up front; skip one an earlier removal's Deathrite already took
      // out of play. (A card picked where it lies off the mat -- a cemetery
      // target to bounce, say -- is still removed from there.)
      // A card already in a cemetery (or banished) is never destroyed, but the
      // card that set a trigger off may still be banished or returned from
      // there ("whenever a nearby enemy dies, banish it").

      const ids = recipients(eff)
      const wasInPlay = new Set(ids.filter(inPlay))
      for (const who of ids) {
        if (wasInPlay.has(who) && !inPlay(who)) continue
        if (eff.op === 'destroy' && ['cemetery', 'banished'].includes(cardZoneCategory(who))) continue
        effectRemove(who, eff.op, entry)
      }
    } else if (eff.op === 'heal') {
      for (const who of recipients(eff)) adjustDamage(who, -damageOf(who))
    } else if (eff.op === 'banishAndCast') {
      banishAndCast(eff, cardId, targetId, entry)
    } else if (eff.op === 'animate') {
      for (const who of recipients(eff)) animateCard(who, eff, entry, cardId)
    } else if (eff.op === 'grantFrom') {
      grantFrom(cardId, targetId, ability, entry, eff)
    } else if (eff.op === 'release') {
      releaseGrant(cardId, entry)
    } else if (eff.op === 'flood' || eff.op === 'unflood') {
      const flooding = eff.op === 'flood'
      // How many sites a flood/unflood reaches:
      //  - self/target on a grid ability: every site its shape covers (the
      //    picked site, its adjacent ring, or a wider nearby area -- from self or
      //    a chosen square), so "flood the sites you target / adjacent sites" is
      //    authored entirely through the existing grid target;
      //  - self/target on a card ability: the single targeted (or own) site, or,
      //    when its scope is 'body', the whole orthogonally connected water body;
      //  - any other selector: the site under each card it picks (or the site
      //    itself), with the same 'body' option for unflood.
      const legacy = eff.who === 'self' || eff.who === 'target'
      let squares
      if (legacy && ability.target?.mode === 'grid') {
        squares = resolveGridSquares(cardId, pickSquare, ability.target)
      } else {
        const picked = typeof pickSquare === 'number' ? pickSquare : null
        const bases = recipients(eff).map((w) =>
          legacy ? squareOfSite(w) ?? picked : squareOfSite(w) ?? nodeOf(w)?.sq ?? null
        )
        if (legacy && !bases.length && picked != null) bases.push(picked)
        const set = new Set()
        for (const sq of bases) {
          if (sq == null) continue
          const covered = !flooding && eff.scope === 'body' ? waterBodyAt(sq)?.squares || [sq] : [sq]
          for (const c of covered) set.add(c)
        }
        squares = [...set]
      }
      for (const s of squares) setFloodedSite(s, flooding, entry)
    } else if (eff.op === 'untap') {
      for (const t of recipients(eff)) {
        if (!state.tapped[t]) continue
        delete state.tapped[t]
        state.events.push({ id: uid(), seq: entry?.seq, cardId: t, name: 'Untaps', text: `${cardName(t)} untaps.` })
      }
    } else if (eff.op === 'draw') {
      effectDraw(eff, cardId, entry)
    } else if (eff.op === 'discard') {
      effectDiscard(eff.pick === 'count' ? [] : recipients(eff), eff, cardId, entry)
    } else if (eff.op === 'search') {
      effectSearch(eff, cardId, entry)
    } else if (eff.op === 'reanimate') {
      const to = dest || (typeof pickSquare === 'number' ? `cell:${pickSquare}:top` : null)
      for (const who of recipients(eff)) effectReanimate(who, to, entry)
      checkSurvival(entry)
    } else if (eff.op === 'gainControl') {
      for (const who of recipients(eff)) effectGainControl(who, cardId, entry)
    } else if (eff.op === 'swap') {
      const other = recipients(eff).find((id) => id !== cardId)
      effectSwap(cardId, other, entry)
    } else if (eff.op === 'addCounter' || eff.op === 'removeCounter' || eff.op === 'preventDamage') {
      const name = eff.op === 'preventDamage' ? SHIELD_COUNTER : eff.name
      const amount = effectAmount(eff, cardId, ctx) * (eff.op === 'removeCounter' ? -1 : 1)
      for (const who of recipients(eff)) counterEvent(entry, who, name, addCounters(who, name, amount))
    }
  }
}

// ---------- card-flow effects (draw, discard, search, reanimate, ...) ----------

// A side named relative to an effect's source ('self' | 'enemy').
const relSide = (sourceId, rel) => (rel === 'enemy' ? otherSide(sideOf(sourceId)) : sideOf(sourceId))
const sideWho = (side) => (side === 'player' ? 'You' : 'The opponent')
const verbFor = (side, verb) => (side === 'player' ? verb : `${verb}s`)
// The side a player-owned off-board zone (hand:x, grave:x, ...) belongs to.
const zoneSide = (zone) => (zone || '').split(':')[1] || null

// Move a card between zones as a consequence of `entry` (not a logged move):
// snapshot for undo, announce it, and fire "move" triggers as a replay keyed to
// the causing entry, like sendToCemetery.
function effectMove(id, to, entry, name, text) {
  if (!id || !state.zones[to]) return false
  const from = zoneOf(id)
  if (from === to) return false
  snapshotStructural(entry)
  delete state.carry[id]
  delete state.grants[id]
  removeFromZones(state.zones, id)
  state.zones[to].push(id)
  state.events.push({ id: uid(), seq: entry?.seq, cardId: id, name, text })
  shedInPlayState(id, to, entry)
  fireTriggers({ type: 'move', cardId: id, from, to, seq: entry?.seq, root: entry })
  return true
}

// Draw the top card(s) of a deck (the last in its zone, as drawFromDeck).
function effectDraw(eff, sourceId, entry) {
  const side = relSide(sourceId, eff.side)
  const deck = `${eff.deck || 'spellbook'}:${side}`
  for (let n = 0; n < Math.max(1, Number(eff.count) || 1); n++) {
    const pile = state.zones[deck]
    if (!pile?.length) break
    const id = pile[pile.length - 1]
    effectMove(id, `hand:${side}`, entry, 'Draws', `${sideWho(side)} ${verbFor(side, 'draw')} ${cardName(id)}.`)
  }
}

// Discard: the selector's cards that are in a hand, or (pick 'count') the first
// N cards of a side's hand -- hand order, as there is no hand-choice UI yet.
function effectDiscard(ids, eff, sourceId, entry) {
  let picked = ids
  if (eff.pick === 'count') {
    const side = relSide(sourceId, eff.side)
    picked = (state.zones[`hand:${side}`] || []).slice(0, Math.max(1, Number(eff.count) || 1))
  }
  for (const id of picked) {
    const z = zoneOf(id)
    if (zoneCategory(z) !== 'hand') continue
    effectMove(id, `grave:${zoneSide(z)}`, entry, 'Discarded', `${cardName(id)} is discarded.`)
  }
}

// Search a deck for its first card (from the top) matching a kind filter and put
// it into that side's hand. Deterministic: no shuffle and no choice among
// several matches yet.
function effectSearch(eff, sourceId, entry) {
  const side = relSide(sourceId, eff.side)
  const deck = state.zones[`${eff.deck || 'spellbook'}:${side}`] || []
  const found = [...deck].reverse().find((id) => matchesFilter(state.cards[id], eff.filter || 'any'))
  if (!found) {
    state.events.push({
      id: uid(),
      seq: entry?.seq,
      cardId: sourceId,
      name: 'Search',
      text: `${sideWho(side)} ${verbFor(side, 'find')} nothing in the ${eff.deck}.`,
    })
    return
  }
  effectMove(found, `hand:${side}`, entry, 'Search', `${cardName(found)} is searched out of the ${eff.deck} into hand.`)
}

// Reanimate: summon a card from a cemetery onto a location. A real summon (not
// movement): it is summoned this turn, fires its genesis ("move" into the
// realm) and faces the survival check (run by the caller).
function effectReanimate(id, to, entry) {
  if (!to || zoneCategory(zoneOf(id)) !== 'cemetery') return
  const routed = routeZone(id, to)
  if (!/^cell:\d+:(top|bot)$/.test(routed) || !state.zones[routed]) return
  if (enforcing() && isUnit(id) && !state.cards[id].avatar && !legalSummonLocation(id, routed)) return
  const from = zoneOf(id)
  snapshotStructural(entry)
  removeFromZones(state.zones, id)
  state.zones[routed].push(id)
  if (isUnit(id) && !state.cards[id].avatar) state.summoned[id] = true
  state.events.push({
    id: uid(),
    seq: entry?.seq,
    cardId: id,
    name: 'Reanimated',
    text: `${cardName(id)} returns from the cemetery to ${zoneLabel(routed)}.`,
  })
  emitFx('genesis', { cardId: id })
  fireTriggers({ type: 'move', cardId: id, from, to: routed, seq: entry?.seq, root: entry })
}

// Gain control: the card joins the source's side (takeControl, so undo, a
// reset and a save hand it back).
function effectGainControl(id, sourceId, entry) {
  const c = state.cards[id]
  if (!c || c.avatar || !inPlay(id)) return
  const side = sideOf(sourceId)
  if (sideOf(id) === side) return
  takeControl(id, side)
  state.events.push({
    id: uid(),
    seq: entry?.seq,
    cardId: id,
    name: 'Changes sides',
    text: `${side === 'opponent' ? 'The opponent gains' : 'You gain'} control of ${cardName(id)}.`,
  })
}

// Swap two units' locations. Forced movement for both (no step, Immobile
// doesn't stop it), so both fire "move" triggers; survival is rechecked.
function effectSwap(a, b, entry) {
  if (!a || !b || a === b || !isUnit(a) || !isUnit(b)) return
  const za = zoneOf(a)
  const zb = zoneOf(b)
  if (za === zb || state.carry[a] || state.carry[b]) return
  if (!/^cell:/.test(za || '') || !/^cell:/.test(zb || '')) return
  snapshotStructural(entry)
  removeFromZones(state.zones, a)
  removeFromZones(state.zones, b)
  state.zones[zb].push(a)
  state.zones[za].push(b)
  state.events.push({
    id: uid(),
    seq: entry?.seq,
    cardId: a,
    name: 'Swap',
    text: `${cardName(a)} and ${cardName(b)} swap places.`,
  })
  fireTriggers({ type: 'move', cardId: a, from: za, to: zb, seq: entry?.seq, forced: true, root: entry })
  fireTriggers({ type: 'move', cardId: b, from: zb, to: za, seq: entry?.seq, forced: true, root: entry })
  checkSurvival(entry)
}

function counterEvent(entry, id, name, delta) {
  if (!delta) return
  const n = Math.abs(delta)
  const text =
    name === SHIELD_COUNTER
      ? delta > 0
        ? `${cardName(id)} will prevent the next ${n} damage.`
        : `${cardName(id)} loses ${n} damage prevention.`
      : `${cardName(id)} ${delta > 0 ? 'gets' : 'loses'} ${n} ${name} counter${n === 1 ? '' : 's'}.`
  state.events.push({
    id: uid(),
    seq: entry?.seq,
    cardId: id,
    name: name === SHIELD_COUNTER ? 'Damage shield' : 'Counters',
    text,
  })
}

// ---------- loseWhen: gained abilities fall away ----------

// Does this entry meet a grant's loss condition for its carrier?
function matchesLoseWhen(cond, carrierId, entry) {
  if (!cond || cond === 'never') return false
  if (cond === 'damaged')
    return entry.type === 'damage' && entry.cardId === carrierId && (entry.amount || 0) > 0
  // A damage event is done *to* the carrier, not an action it took.
  if (entry.type === 'damage') return false
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
    const ability = findAbility(carrierId, g.abilityId)
    if (matchesLoseWhen(ability?.loseWhen, carrierId, entry)) {
      releaseGrant(carrierId, entry.root || entry)
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
      shedInPlayState(u.id, bz, entry)
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
function performAbility(cardId, abilityId, targetId, gridSquare, destZone, extra = null) {
  const base = findAbility(cardId, abilityId)
  const ability = abilityView(base, extra?.modes)
  const card = state.cards[cardId]
  if (!ability || !card) return
  const entry = {
    type: 'ability',
    cardId,
    abilityId,
    targetId: targetId || null,
    targetIds: extra?.targetIds || null,
    castId: extra?.castId || null,
    gridSquare: gridSquare == null ? null : gridSquare,
    destZone: destZone || null,
    prevTapped: clone(state.tapped),
    prevStats: clone(state.stats),
    prevDamage: clone(state.damage),
    prevStrengthMod: clone(state.strengthMod),
    prevGrantedKeywords: clone(state.grantedKeywords),
  }
  // A modal ability's chosen modes are part of the move (compared as a set).
  if (hasModes(base)) entry.modes = ability.chosenModes
  const side = card.enemy ? 'opponent' : 'player'
  const mana = abilityManaCost(cardId, ability)
  if (mana) adjustStat(side, 'mana', -mana)
  if (ability.cost.life) adjustStat(side, 'life', -ability.cost.life)
  if (ability.cost.tap) state.tapped[cardId] = true
  // Log first so the entry has its seq before effects run -- a damage effect can
  // kill a minion and queue a death event, which undo keys off that seq.
  logEntry(entry)
  payCardCosts(cardId, ability, targetId, entry)

  // A projectile ability flies from its source to the unit it hits. Emitted
  // before the effects run; FxOverlay reads positions pre-render, so a "pull
  // the shooter in" effect still launches from where the source stood.
  if (targetId && ability.target?.within === 'projectile') {
    emitFx('projectile', { sourceId: cardId, targetId, style: 'fireball' })
  }
  runAbilityEffects(ability, cardId, targetId, entry)
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
  for (const id of inPlayCards(side)) {
    if (state.cards[id].site && animationOf(id)) continue // a minion now, not a site
    sum += Number(state.cards[id].affinity?.[el]) || 0
  }
  return sum
}

// A side's effective threshold: an authored base on the stat, plus affinity from
// its board. This is what casting compares a spell's threshold requirement to.
// Passives may grant a side extra affinity too (sidePassiveMods).
export function effectiveThreshold(side, el) {
  return (
    (state.stats[side]?.[el] || 0) +
    providedAffinity(side, el) +
    (sidePassiveMods(side).affinity[el] || 0)
  )
}

// Mana a side's sites (and other providers) would yield when collected.
export function providedMana(side) {
  let sum = 0
  for (const id of inPlayCards(side)) {
    if (state.cards[id].site && animationOf(id)) continue
    sum += Number(state.cards[id].manaProvided) || 0
  }
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
  if (animationOf(cardId)) return 'Animated'
  if (c.site) return 'Site'
  if (c.aura) return 'Aura'
  if (c.monument) return 'Monument'
  if (c.artifact) return 'Artifact'
  if (c.magic) return 'Magic'
  return 'Card'
}

// A spell's cast cost lives on the card: mana is spent, the elemental amounts
// are threshold requirements (compared, not spent).
// Passive cost modifiers adjust the mana (never below 0): the card's own
// costMod, plus the side-wide spell cost modifiers of whoever casts it that match
// this kind of spell.
export function castCostOf(cardId) {
  const card = state.cards[cardId]
  const c = card?.spellCost
  let mod = traits(cardId)?.costMod || 0
  if (isSpell(cardId)) {
    for (const m of sidePassiveMods(castSide(cardId)).spellCost) {
      if (matchesCostFilter(card, m.filter)) mod += m.amount
    }
  }
  return {
    mana: Math.max(0, (Number(c?.mana) || 0) + mod),
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
  const side = castSide(cardId)
  const s = state.stats[side]
  if (!s) return false
  const cost = castCostOf(cardId)
  if ((s.mana || 0) < castManaCost(cardId)) return false
  // Threshold is affinity: the authored base plus what the board provides.
  for (const el of ELEMENTS) if (effectiveThreshold(side, el) < cost[el]) return false
  return true
}

// Mana a cast costs from where the card lies: nothing with a free permit; the
// printed cost otherwise, plus any cemetery tax when cast out of a cemetery.
export function castManaCost(cardId) {
  if (state.castPermits[cardId]?.free) return 0
  let mana = castCostOf(cardId).mana
  if (cardZoneCategory(cardId) === 'cemetery') mana += cemeteryTaxFor(castSide(cardId))
  return mana
}

// A spell is normally cast from hand. A card may also grant casting from the
// cemetery (Sorcery cards that "cast from your cemetery"); only then is a spell
// sitting in the graveyard a castable source.
export function castsFromCemetery(cardId) {
  return !!state.cards[cardId]?.castFromCemetery
}

// A spell in a zone it can be cast from during play/recording (subject to cost):
// the hand always, the cemetery only when the card grants it.
export function spellCastable(cardId) {
  if (!isSpell(cardId) || !casting()) return false
  return castSourceOk(cardId)
}

// Whether the card sits somewhere it may be cast from (ignoring play mode):
// the hand; the cemetery when the card grants it; or anywhere a cast permit
// (banishAndCast) allows.
export function castSourceOk(cardId) {
  if (!isSpell(cardId)) return false
  if (state.castPermits[cardId]) return true
  const cat = cardZoneCategory(cardId)
  if (cat === 'hand') return true
  return cat === 'cemetery' && castsFromCemetery(cardId)
}

// Only Magic and Aura cards are true spells that need a caster; minions are
// summoned and artifacts conjured with mana alone.
function needsCaster(cardId) {
  const c = state.cards[cardId]
  return !!(c && (c.magic || c.aura))
}

// A caster is your Avatar or a unit with the Spellcaster keyword, in the realm.
export function hasCaster(side) {
  return unitsOnBoard(side === 'opponent').some(
    (u) => isAvatar(u.card) || effectiveKeywords(u.id).has('spellcaster')
  )
}

// Whether the caster's side can legally cast this spell -- i.e. it has a caster
// when the spell needs one. Enforced only under `enforce`, so casual puzzles
// (and those with the Avatar off-board as a life stat) are unchanged.
export function canCastFrom(cardId) {
  if (!enforcing() || !needsCaster(cardId)) return true
  return hasCaster(castSide(cardId))
}

// The solver may cast a card in play mode when they are its caster (their own
// card, or one a permit / swapped cemetery hands them).
export const castControlled = (cardId) =>
  state.mode !== 'play' || castSide(cardId) === 'player'

export function canCast(cardId) {
  return (
    castControlled(cardId) &&
    spellCastable(cardId) &&
    canAffordCast(cardId) &&
    canCastFrom(cardId)
  )
}

// Pay the cost, resolve the magic's effect from the storyline, then send the
// card to the cemetery (a magic is not a permanent). Mirrors performAbility's
// snapshot-before-pay so undo refunds mana; the cast is a gradeable `cast` entry
// and fires "when cast" triggers before it resolves.
function performCast(cardId, abilityId, targetId, gridSquare, destZone, extra = null, dropSquare = null) {
  const card = state.cards[cardId]
  if (!card) return
  const base = abilityId ? findAbility(cardId, abilityId) : null
  const ability = base ? abilityView(base, extra?.modes) : null
  const owner = sideOf(cardId)
  const side = castSide(cardId)
  const mana = castManaCost(cardId)
  const permit = state.castPermits[cardId]
  const entry = {
    type: 'cast',
    cardId,
    abilityId: abilityId || null,
    targetId: targetId || null,
    targetIds: extra?.targetIds || null,
    castId: extra?.castId || null,
    prevCastPermits: clone(state.castPermits),
    prevControlFlips: clone(state.controlFlips),
    gridSquare: gridSquare == null ? null : gridSquare,
    destZone: destZone || null,
    prevTapped: clone(state.tapped),
    prevStats: clone(state.stats),
    prevDamage: clone(state.damage),
    prevStrengthMod: clone(state.strengthMod),
    prevGrantedKeywords: clone(state.grantedKeywords),
  }
  // Where a dropped spell landed -- only kept when there is one, so entries of
  // spells cast from the bar are unchanged. Not compared by sameEntry.
  if (dropSquare != null) entry.dropSquare = dropSquare
  if (hasModes(base)) entry.modes = ability.chosenModes
  if (mana) adjustStat(side, 'mana', -mana)
  delete state.castPermits[cardId]
  // Cast by the other side (out of a swapped cemetery / by permit): the caster
  // controls it while it resolves, so its effects' self/enemy read from them.
  takeControl(cardId, side)
  logEntry(entry) // fires "when a spell is cast" triggers, before it resolves
  emitFx('cast', { cardId })
  // A targeted spell fires a projectile from the caster to its victim -- a
  // fireball if it's a true projectile spell, an arcane bolt otherwise.
  if (targetId) {
    const style = ability?.target?.within === 'projectile' ? 'fireball' : 'bolt'
    emitFx('projectile', { sourceId: cardId, targetId, style })
  }
  if (ability) runAbilityEffects(ability, cardId, targetId, entry)
  // The spell resolves and the card goes to its owner's cemetery -- or back to
  // banishment when it was cast from there by permit.
  takeControl(cardId, owner)
  const from = zoneOf(cardId)
  const to = permit ? `banished:${owner}` : `grave:${owner}`
  snapshotStructural(entry)
  removeFromZones(state.zones, cardId)
  state.zones[to].push(cardId)
  state.events.push({
    id: uid(),
    seq: entry.seq,
    cardId,
    name: 'Spell resolves',
    text: `${cardName(cardId)} resolves and goes to ${permit ? 'banishment' : 'the cemetery'}.`,
  })
  fireTriggers({ type: 'move', cardId, from, to, seq: entry.seq, root: entry })
}

// Whether a minion may be summoned onto this location (enforced casts). Surface
// of a site by default; the sub-surface / void need the matching keyword.
function legalSummonLocation(cardId, to) {
  const m = /^cell:(\d+):(top|bot)$/.exec(to)
  const site = /^site:(\d+)$/.exec(to)
  if (site) return false // minions summon to a cell, not the site slot
  if (!m) return false
  // A minion cannot be summoned onto an opponent-controlled site unless its card
  // grants that capability -- checked here so every cast path shares the rule.
  if (!canCastMinionTo(cardId, to)) return false
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
  const side = castSide(cardId)
  const mana = castManaCost(cardId)
  const from = zoneOf(cardId)
  const entry = {
    type: 'cast',
    cardId,
    abilityId: null,
    targetId: carrierId || null,
    gridSquare: null,
    to: carrierId ? null : to,
    prevCastPermits: clone(state.castPermits),
    prevControlFlips: clone(state.controlFlips),
    prevTapped: clone(state.tapped),
    prevStats: clone(state.stats),
    prevDamage: clone(state.damage),
    prevStrengthMod: clone(state.strengthMod),
    prevGrantedKeywords: clone(state.grantedKeywords),
  }
  if (mana) adjustStat(side, 'mana', -mana)
  delete state.castPermits[cardId]
  // A permanent cast by the other side enters under the caster's control.
  takeControl(cardId, side)
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
  fireTriggers({ type: 'move', cardId, from, to: landedZone, seq: entry.seq, root: entry }) // genesis
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
  const m = /^(?:cell|site):(\d+)/.exec(zone || '')
  const sq = m ? Number(m[1]) : null
  // A modal spell asks for its modes first; the drop is kept to aim with after.
  if (needsModeChoice(ability)) {
    disarmOthers()
    ui.activating = { cardId, abilityId: ability.id, cast: true, pickModes: true, dropZone: zone, dropSquare: sq }
    return true
  }
  const t = abilityView(ability)?.target
  if (t?.mode === 'grid') {
    if (sq == null) return false // grid spells must land on a square
    performCast(cardId, ability.id, null, sq)
    return true
  }
  if (t?.mode === 'card' && t.required) {
    const targetId = findDropTarget(cardId, abilityView(ability), zone, sq)
    if (!targetId) return false
    continueActivate(cardId, ability.id, true, targetId, null, sq)
    return true
  }
  if (ability) continueActivate(cardId, ability.id, true, null, null, sq)
  else performCast(cardId, null, null, null, null, null, sq)
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
  disarmOthers()
  const abilityId = ability?.id || null
  if (needsModeChoice(ability)) {
    ui.activating = { cardId, abilityId, cast: true, pickModes: true }
    return
  }
  const t = abilityView(ability)?.target
  if (t?.mode === 'grid' && t.origin === 'pick') {
    ui.activating = { cardId, abilityId, cast: true }
  } else if (t?.mode === 'card' && t.required) {
    ui.activating = { cardId, abilityId, cast: true }
  } else if (abilityId) {
    continueActivate(cardId, abilityId, true, null)
  } else {
    ui.activating = null
    performCast(cardId, null, null, null)
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
  if (!playerControls(avatarId)) return
  if (!isAvatar(avatarId)) return
  if (kind !== 'atlas' && kind !== 'spellbook') return
  const side = sideOf(avatarId)
  const from = `${kind}:${side}`
  const deck = state.zones[from]
  if (!deck?.length) return
  moveCard(deck[deck.length - 1], from, `hand:${side}`, { draw: true })
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
  if (!playerControls(cardId)) return
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
  if (!playerControls(cardId)) return
  const ability = findAbility(cardId, abilityId)
  if (!ability) return
  // A tap cost can't be paid by a summon-sick card (Charge exempts).
  if (ability.cost?.tap && tapBlockedBySickness(cardId)) return
  // Used up its activations for this turn.
  if (casting() && abilityUsesLeft(cardId, ability) <= 0) return
  const armed =
    ui.activating && ui.activating.cardId === cardId && ui.activating.abilityId === abilityId
  // Under enforcement the cost (mana with any cemetery tax, and the elemental
  // threshold) must be affordable -- but an armed ability can still be cancelled.
  if (!armed && abilityCostBlocked(cardId, ability)) return
  if (armed) {
    ui.activating = null
    return
  }
  disarmOthers()
  // A modal ability asks for its modes first (ChoicePopup); targeting follows.
  if (needsModeChoice(ability)) {
    ui.activating = { cardId, abilityId, pickModes: true }
    return
  }
  const t = abilityView(ability).target
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
    continueActivate(cardId, abilityId, false, null)
  }
}

export function targetActivate(targetId) {
  if (!ui.activating || !canActivateTarget(targetId)) return
  const { cardId, abilityId, cast } = ui.activating
  const ability = activeAbility()
  const modes = modesExtra(ui.activating)
  const needed = pickCount(ability)
  if (needed <= 1 && !choosesCast(ability)) {
    continueActivate(cardId, abilityId, cast, targetId, modes, ui.activating.dropSquare ?? null)
    return
  }
  // The final click names which picked card may be cast.
  if (ui.activating.choosing) {
    const picked = ui.activating.picked
    continueActivate(cardId, abilityId, cast, picked[0], { ...modes, targetIds: picked, castId: targetId })
    return
  }
  const picked = [...(ui.activating.picked || []), targetId]
  if (picked.length < needed) {
    ui.activating = { ...ui.activating, picked }
    return
  }
  settlePicks(picked)
}

// The armed multi-pick is complete (or stopped early): ask which picked card to
// cast, or resolve.
function settlePicks(picked) {
  const { cardId, abilityId, cast } = ui.activating
  if (choosesCast(activeAbility())) {
    ui.activating = { ...ui.activating, picked, choosing: true }
    return
  }
  continueActivate(cardId, abilityId, cast, picked[0], { ...modesExtra(ui.activating), targetIds: picked })
}

// "Up to N": stop picking and go on with the cards picked so far (one or more).
export function canFinishPicks() {
  const p = activatePickState()
  return !!p && p.upTo && !p.choosing && p.picked > 0
}

export function finishPicks() {
  if (canFinishPicks()) settlePicks(ui.activating.picked)
}

// ---------- mode choice (activation, cast or storyline) ----------

// Only one action is ever armed: clear the others before arming an ability.
function disarmOthers() {
  ui.attacker = null
  ui.striker = null
  ui.moving = null
  ui.carrier = null
  ui.shooting = null
  ui.intercepting = null
}

// The mode choice waiting on the player, if any: { cardId, ability, count, story }.
export function pendingModeChoice() {
  const a = ui.activating
  if (a?.pickModes) {
    const ability = findAbility(a.cardId, a.abilityId)
    return ability ? { cardId: a.cardId, ability, count: modeChoiceCount(ability), story: false } : null
  }
  const c = ui.storyChoice
  if (c?.pickModes)
    return { cardId: c.ownerId, ability: c.ability, count: modeChoiceCount(c.ability), story: true }
  return null
}

// Commit the chosen modes (exactly the ability's chooseCount of them), then go
// on to targeting -- aiming with the drop, for a drag-cast spell.
export function chooseModes(modes) {
  const p = pendingModeChoice()
  if (!p) return
  const picked = cleanModes(p.ability, modes)
  if (picked.length !== p.count) return
  if (p.story) return chooseStoryModes(picked)
  const { cardId, abilityId, cast, dropZone, dropSquare } = ui.activating
  ui.activating = null
  const view = abilityView(findAbility(cardId, abilityId), picked)
  const t = view.target
  const extra = { modes: picked }
  const dropped = dropZone != null || dropSquare != null
  if (t?.mode === 'grid') {
    if (cast && dropSquare != null) performCast(cardId, abilityId, null, dropSquare, null, extra)
    else if (t.origin === 'pick') ui.activating = { cardId, abilityId, cast: !!cast, modes: picked }
    else continueActivate(cardId, abilityId, cast, null, extra, dropSquare ?? null)
    return
  }
  if (t?.mode === 'card' && t.required) {
    // A drop that lands on a legal target aims there; otherwise pick by click.
    const hit = dropped && pickCount(view) <= 1 ? findDropTarget(cardId, view, dropZone, dropSquare) : null
    if (hit) continueActivate(cardId, abilityId, cast, hit, extra, dropSquare ?? null)
    else ui.activating = { cardId, abilityId, cast: !!cast, modes: picked, dropSquare: dropSquare ?? null }
    return
  }
  continueActivate(cardId, abilityId, cast, null, extra, dropSquare ?? null)
}

// An activation can be called off at the mode choice; a triggered ability
// can't (it has to resolve), so there is no cancel for the storyline.
export function cancelModeChoice() {
  if (ui.activating?.pickModes) ui.activating = null
}

// Whether the armed ability/cast has an optional ("may") card target that the
// player can decline right now.
export function canDeclineActivate() {
  const ab = activeAbility()
  return !!(
    ui.activating &&
    !ui.activating.dest &&
    ab &&
    ab.target.mode === 'card' &&
    ab.target.optional
  )
}

// Resolve the armed optional ability/cast with no target: its `who: target`
// effects are skipped, the rest still run (e.g. still draws a card).
export function declineActivate() {
  if (!canDeclineActivate()) return
  const { cardId, abilityId, cast } = ui.activating
  continueActivate(cardId, abilityId, cast, null, modesExtra(ui.activating), ui.activating.dropSquare ?? null)
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
  if (m.prevFloodedSites) state.floodedSites = clone(m.prevFloodedSites)
  if (m.prevStrengthMod) state.strengthMod = clone(m.prevStrengthMod)
  if (m.prevGrantedKeywords) state.grantedKeywords = clone(m.prevGrantedKeywords)
  if (m.prevAnimated) state.animated = clone(m.prevAnimated)
  if (m.prevCastPermits) state.castPermits = clone(m.prevCastPermits)
  if (m.prevControlFlips) restoreControlFlips(m.prevControlFlips)
  if (m.prevSummoned) state.summoned = clone(m.prevSummoned)
  if (m.prevStealthLost) state.stealthLost = clone(m.prevStealthLost)
  if (m.prevWardBroken) state.wardBroken = clone(m.prevWardBroken)
  if (m.prevCounters) state.counters = clone(m.prevCounters)
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

// Outside a recording, the editor board IS the start position -- a load,
// enterEditor() and stopRecording() all restore it there -- so an edit on it is
// an edit to the start position. The initial* snapshot is only a copy, though,
// and anything that reads it (play, another solution line, a save) would
// silently drop the edit: a card added after the snapshot was swept into the
// hidden pool. Commit the board before any of those read it.
const editingStart = () => state.mode === 'editor' && !state.recording

function commitStartPosition() {
  if (!editingStart()) return
  state.initialZones = clone(state.zones)
  state.initialCarry = clone(state.carry)
  state.initialStats = clone(state.stats)
  state.initialTapped = clone(state.tapped)
  state.initialDamage = clone(state.damage)
}

export function startRecording() {
  if (state.initialZones) commitStartPosition()
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
    state.initialFloodedSites = clone(state.floodedSites)
    state.solutions = []
  }
  state.draft = []
  state.events = []
  state.recording = true
}

function restoreInitial() {
  revertControlFlips()
  purgeGeneratedCards()
  if (state.initialZones) {
    state.carry = clone(state.initialCarry || {})
    state.zones = restoreZones(state.initialZones)
  }
  if (state.initialStats) state.stats = clone(state.initialStats)
  state.tapped = clone(state.initialTapped || {})
  state.damage = clone(state.initialDamage || {})
  state.floodedSites = clone(state.initialFloodedSites || {})
  // Grants and gameplay modifiers only exist mid-play; a start position has none.
  state.grants = {}
  state.strengthMod = {}
  state.grantedKeywords = {}
  state.animated = {}
  state.castPermits = {}
  state.controlFlips = {}
  state.summoned = {}
  state.stealthLost = {}
  state.wardBroken = {}
  state.counters = {}
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
  if ((a.targetIds || []).join() !== (b.targetIds || []).join()) return false
  if ((a.castId ?? null) !== (b.castId ?? null)) return false
  // A modal ability's chosen modes, as a set. No `modes` (every older entry, and
  // every non-modal ability) is the empty set, so those compare as before.
  if (modesKey(a) !== modesKey(b)) return false
  if (type === 'ability')
    return (
      a.abilityId === b.abilityId &&
      a.targetId === b.targetId &&
      (a.destZone ?? null) === (b.destZone ?? null)
    )
  if (type === 'cast')
    return (
      a.abilityId === b.abilityId &&
      a.targetId === b.targetId &&
      (a.gridSquare ?? null) === (b.gridSquare ?? null) &&
      (a.destZone ?? null) === (b.destZone ?? null) &&
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

function modesKey(e) {
  return [...(e.modes || [])].sort((x, y) => x - y).join(',')
}

const sameLine = (a, b) =>

  a.length === b.length && a.every((m, i) => sameEntry(m, b[i]))

// The cards a logged entry acts on: the actor and, where present, the thing it
// targets or the defender it drew in. Zones (from/to) are locations, not cards,
// so they are not counted -- the "objects" of a move are cards.
function entryCards(entry) {
  const ids = new Set()
  if (entry.cardId) ids.add(entry.cardId)
  if (entry.targetId) ids.add(entry.targetId)
  if (entry.defenderId) ids.add(entry.defenderId)
  return ids
}

// Every card a solution line manipulates -- the union of entryCards over its
// moves. An "in-between" move that touches none of these cards cannot change
// where the solution's own pieces end up, so it is harmless padding.
function solutionCards(line) {
  const s = new Set()
  for (const e of line) for (const id of entryCards(e)) s.add(id)
  return s
}

// How an attempt lines up with one solution line:
//   'exact'    -- the same moves, same length (the optimal path)
//   'loose'    -- every solution move is present in order, and the extra moves
//                 in between only touch cards the solution never manipulates (so
//                 they can't disturb the puzzle's objects): solved, not optimal
//   'progress' -- a valid partial run: every move so far is a solution move in
//                 order or a harmless extra, but not all solution moves are in
//                 yet, so the line can still be completed from here
//   'dead'     -- a solution move is missing/out of order, or an extra move
//                 touches one of the solution's own cards (a real detour): this
//                 line can no longer be reached, so it is not being solved
// Greedy is safe: a move that equals the next needed solution move necessarily
// touches a solution card, so it could never be reclassified as harmless padding.
function lineOutcome(line, moves) {
  const solCards = solutionCards(line)
  let j = 0
  let extras = 0
  for (const m of moves) {
    if (j < line.length && sameEntry(m, line[j])) {
      j++
      continue
    }
    for (const id of entryCards(m)) {
      if (solCards.has(id)) return 'dead'
    }
    extras++
  }
  if (j < line.length) return 'progress'
  return extras > 0 ? 'loose' : 'exact'
}

// The attempt is still on track when at least one solution line is not dead --
// it is complete, or a completable partial run. An empty attempt is on track
// (every line is 'progress'), so a fresh board never reads as a mistake.
const attemptViable = (moves) =>
  state.solutions.some((l) => lineOutcome(l, moves) !== 'dead')

// The undo-only fields on a logged entry -- snapshots and the seq tag. They are
// consequences of the position, never compared by sameEntry(), and (prevZones
// especially) large, so a committed solution line drops them.
function stripBookkeeping(entry) {
  const {
    prevTapped,
    prevStats,
    prevDamage,
    prevFloodedSites,
    prevStrengthMod,
    prevGrantedKeywords,
    prevSummoned,
    prevStealthLost,
    prevWardBroken,
    prevAnimated,
    prevCastPermits,
    prevControlFlips,
    prevCounters,
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
  commitStartPosition()
  if (!state.initialZones) {
    state.initialZones = clone(state.zones)
    state.initialCarry = clone(state.carry)
    state.initialStats = clone(state.stats)
    state.initialTapped = clone(state.tapped)
    state.initialDamage = clone(state.damage)
    state.initialFloodedSites = clone(state.floodedSites)
  }
  restoreInitial()
  state.moves = []
  state.events = []
  state.checked = false
  state.firstWrong = -1
  state.mode = 'play'
  resetPlayTracking()
  restoreAttempt()
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
  // Reset restores the starting position but keeps the day's mistake count and
  // any solved/failed lock -- the limit is cumulative for the day, not per run.
  resetPlayTracking()
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
  return !!(card?.unit || card?.avatar || (card?.id && animationOf(card.id)))
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

// Whether this spell may also be cast from its owner's cemetery, not just the
// hand. A per-card capability for the few cards that grant it.
export function toggleCastFromCemetery(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  card.castFromCemetery = !card.castFromCemetery
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

// Live solve verdict, recomputed on every move (push, undo, reset). Null while
// the board is not yet solved; 'optimal' when the attempt matches a solution
// line exactly; 'partial' when it reaches a line with harmless extra moves --
// the correct sequence plus fiddling that never touches the solution's objects.
// There is no submit button: the verdict reflects the board as it stands, so a
// detour that disturbs a puzzle piece un-solves it as honestly as it solved it.
export const solveStatus = computed(() => {
  if (state.mode !== 'play' || !hasSolution()) return null
  let best = null
  for (const line of state.solutions) {
    const o = lineOutcome(line, state.moves)
    if (o === 'exact') return 'optimal'
    if (o === 'loose') best = 'partial'
  }
  return best
})

// ---------- automatic solve / mistake detection ----------

// A wrong move never stays on the board: the whole action that broke the
// attempt is snapped back to the last on-track position, and a mistake is
// counted. After this many mistakes a limited player fails the puzzle for the
// day. Editors are exempt from the cap but still get the snap-back feedback.
export const MAX_MISTAKES = 5

// Only regular players are limited; editors test their own puzzles freely.
const triesLimited = () => !config.canEdit

// Input is sealed for the day once a limited player has solved or failed. The
// verdict banner stays up; Undo/Reset can no longer change the outcome.
export const playLocked = computed(
  () => triesLimited() && (state.solved || state.failed)
)

export const localToday = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD

const attemptKey = () => `${state.puzzleId || 'adhoc'}:${localToday()}`

// The day's progress on this puzzle, persisted so a reload (or coming back
// later the same day) restores the mistake count and any solved/failed lock.
// Soft by design: clearing localStorage resets it.
function persistAttempt() {
  if (!triesLimited()) return
  try {
    const prev = JSON.parse(localStorage.getItem(ATTEMPTS_KEY)) || {}
    const map = {}
    const suffix = `:${localToday()}`
    for (const [k, v] of Object.entries(prev)) {
      if (k.endsWith(suffix)) map[k] = v // keep only today's records
    }
    map[attemptKey()] = {
      mistakes: state.mistakes,
      solved: state.solved,
      failed: state.failed,
      quality: state.solveQuality,
    }
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(map))
  } catch {
    /* storage unavailable: the limit degrades to per-pageload */
  }
}

function restoreAttempt() {
  state.mistakes = 0
  state.solved = false
  state.failed = false
  state.solveQuality = ''
  if (!triesLimited()) return
  try {
    const rec = JSON.parse(localStorage.getItem(ATTEMPTS_KEY))?.[attemptKey()]
    if (rec) {
      state.mistakes = rec.mistakes || 0
      state.solved = !!rec.solved
      state.failed = !!rec.failed
      state.solveQuality = rec.quality || ''
    }
  } catch {
    /* ignore */
  }
}

// Length of the last on-track move list. A wrong move is rewound to here.
let lastGoodLen = 0
let evaluatingPlay = false

export function resetPlayTracking() {
  lastGoodLen = 0
}

// Runs after every change to the play move list (see the watch below). It keeps
// the invariant that `state.moves` is always on track: a move (or whole action)
// that leaves no solution line reachable is snapped back and counted; a move
// that completes a line marks the puzzle solved.
function evaluatePlay(len) {
  if (evaluatingPlay) return
  if (state.mode !== 'play' || state.recording || !hasSolution()) return
  if (state.solved || state.failed) return
  // A rewind (undo/reset) can only land on an on-track position, so just move
  // the checkpoint back with it -- never read a shrinking list as a mistake.
  if (len <= lastGoodLen) {
    lastGoodLen = len
    return
  }
  if (attemptViable(state.moves)) {
    lastGoodLen = len
    const status = solveStatus.value
    if (status) {
      state.solveQuality = status === 'optimal' && state.mistakes === 0
        ? 'optimal'
        : 'partial'
      // The daily lock is only meaningful for limited players; editors keep
      // testing without being sealed out.
      if (triesLimited()) {
        state.solved = true
        persistAttempt()
      }
    }
    return
  }
  // Off track: rewind the offending action back to the last good checkpoint.
  evaluatingPlay = true
  try {
    while (state.moves.length > lastGoodLen) undo()
  } finally {
    evaluatingPlay = false
  }
  state.mistakes++
  if (triesLimited() && state.mistakes >= MAX_MISTAKES) state.failed = true
  persistAttempt()
}

watch(
  () => state.moves.length,
  (len) => evaluatePlay(len)
)

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

// The start position a save writes. Read-only (fingerprint() runs on page
// unload), so it reads the live board where commitStartPosition() would commit
// it rather than committing.
function startPosition() {
  const live = editingStart() || !state.initialZones
  const pick = (initial, current) => (live ? current : initial || current)
  return {
    initial: pick(state.initialZones, state.zones),
    initialTapped: pick(state.initialTapped, state.tapped) || {},
    initialDamage: pick(state.initialDamage, state.damage) || {},
    carry: pick(state.initialCarry, state.carry),
    stats: pick(state.initialStats, state.stats),
  }
}

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
    hideAtlas: state.hideAtlas,
    hideSpellbook: state.hideSpellbook,
    cards: state.cards,
    initial: state.initialZones || state.zones,
    tapped: state.initialTapped || state.tapped,
    damage: state.initialDamage || state.damage,
    floodedSites: state.initialFloodedSites || state.floodedSites,
    carry: state.initialCarry || state.carry,
    stats: state.initialStats || state.stats,
    ...startPosition(),
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
    hideAtlas: !!state.hideAtlas,
    hideSpellbook: !!state.hideSpellbook,
    // Tokens generated while recording/playing are not part of the puzzle.
    // A card taken over in play is saved under its original owner.
    cards: Object.fromEntries(
      Object.entries(clone(state.cards))
        .filter(([, c]) => !c.generated)
        .map(([id, c]) => [id, state.controlFlips[id] ? { ...c, enemy: !c.enemy } : c])
    ),
    initial: clone(state.initialZones || state.zones),
    initialTapped: clone(state.initialTapped || state.tapped || {}),
    initialDamage: clone(state.initialDamage || state.damage || {}),
    initialFloodedSites: clone(state.initialFloodedSites || state.floodedSites || {}),
    carry: clone(state.initialCarry || state.carry),
    stats: clone(state.initialStats || state.stats),
    ...clone(startPosition()),
    solutions: clone(state.solutions),
    savedAt: new Date().toISOString(),
  }
}

// Fetch an image URL and return it as a data: URL. Same-origin in the WordPress
// editor (uploads live on the same site), so no CORS issue in practice.
async function imageToDataUrl(url) {
  const res = await fetch(url)
  const blob = await res.blob()
  return await new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

// serialize(), but with every card image embedded as base64 and imgId dropped,
// so the exported file is portable to localStorage or another site rather than
// carrying URLs that only resolve on the site it came from. A destination
// WordPress re-interns and re-dedups the images on save. On a fetch failure the
// remote URL is kept -- a working remote reference beats a missing card.
export async function serializePortable() {
  const data = serialize()
  for (const card of Object.values(data.cards)) {
    if (card.img && !card.img.startsWith('data:')) {
      try {
        card.img = await imageToDataUrl(card.img)
        delete card.imgId
      } catch (e) {
        console.error('Could not inline image for export', card.id, e)
      }
    } else if (card.img?.startsWith('data:')) {
      // Already inline; a leftover id would mislead a re-import.
      delete card.imgId
    }
  }
  return data
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

function normalizeFloodedSites(sites) {
  const out = {}
  if (Array.isArray(sites)) {
    for (const square of sites) {
      const n = Number(square)
      if (Number.isInteger(n) && n >= 0 && n < GRID_SIZE) out[String(n)] = true
    }
    return out
  }
  for (const [square, flooded] of Object.entries(sites || {})) {
    const n = Number(square)
    if (flooded && Number.isInteger(n) && n >= 0 && n < GRID_SIZE) out[String(n)] = true
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
  state.hideAtlas = !!data.hideAtlas
  state.hideSpellbook = !!data.hideSpellbook
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
    // Spell capability: may be cast from the cemetery, not just the hand.
    c.castFromCemetery = !!c.castFromCemetery
    // Designated as the template for a token kind ('' = an ordinary card).
    c.tokenKind = TOKEN_TEMPLATE_KINDS.includes(c.tokenKind) ? c.tokenKind : ''
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
      ? c.abilities.map((a) => normalizeAbility(a))
      : []
    // Enemy-site summoning used to be a per-card flag; it is now a passive
    // ability trait. Carry an old flag over as a self passive.
    if (c.allowOpponentSiteSummon) {
      if (!c.abilities.some((a) => a.kind === 'passive' && a.passive.summonOnEnemySites)) {
        c.abilities.push(
          normalizeAbility({
            kind: 'passive',
            name: 'Enemy-site summon',
            scope: 'self',
            passive: { summonOnEnemySites: true },
          })
        )
      }
    }
    delete c.allowOpponentSiteSummon
  }
  state.initialZones = normalizeZones(data.initial)
  state.initialFloodedSites = normalizeFloodedSites(
    data.initialFloodedSites ?? data.floodedSites
  )
  // Older puzzles stored a manual `water` flag on the site card. Migrate that
  // authored state to the reversible Flood map so their board topology stays
  // intact without making the legacy card field part of the rule calculation.
  for (let square = 0; square < GRID_SIZE; square++) {
    const id = state.initialZones[`site:${square}`]?.[0]
    if (id && state.cards[id]?.water && !state.initialFloodedSites[String(square)]) {
      state.initialFloodedSites[String(square)] = true
    }
  }
  state.initialCarry = { ...data.carry }
  state.carry = clone(state.initialCarry)
  state.grants = {}
  state.strengthMod = {}
  state.grantedKeywords = {}
  state.animated = {}
  state.castPermits = {}
  state.controlFlips = {}
  state.summoned = {}
  state.stealthLost = {}
  state.wardBroken = {}
  state.counters = {}
  storyStack = null
  state.zones = restoreZones(state.initialZones)
  state.floodedSites = clone(state.initialFloodedSites)
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
  resetPlayTracking()
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
  state.hideAtlas = false
  state.hideSpellbook = false
  state.cards = {}
  state.zones = emptyZones()
  state.carry = {}
  state.grants = {}
  state.strengthMod = {}
  state.grantedKeywords = {}
  state.animated = {}
  state.castPermits = {}
  state.controlFlips = {}
  state.summoned = {}
  state.stealthLost = {}
  state.wardBroken = {}
  state.counters = {}
  storyStack = null
  state.initialZones = null
  state.initialCarry = null
  state.stats = defaultStats()
  state.initialStats = null
  state.tapped = {}
  state.initialTapped = null
  state.damage = {}
  state.initialDamage = null
  state.floodedSites = {}
  state.initialFloodedSites = null
  state.solutions = []
  state.draft = []
  state.moves = []
  state.events = []
  state.recording = false
  state.checked = false
  state.firstWrong = -1
  state.mistakes = 0
  state.solved = false
  state.failed = false
  state.solveQuality = ''
  state.mode = config.canEdit ? 'editor' : 'play'
  resetPlayTracking()
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
  if (!state.initialFloodedSites) state.initialFloodedSites = clone(state.floodedSites)
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

// A share link for the current puzzle. Returns { url, kind, oversized } so the
// caller can message correctly. A puzzle already stored on the server needs no
// payload in the URL, so it gets a short ?puzzle=<id> link; otherwise the whole
// puzzle is inlined as a self-contained ?data= link, flagged oversized when it
// grows past what URLs reliably carry.
export function shareLink() {
  const base = location.origin + location.pathname
  if (remote() && isServerId(state.puzzleId) && !hasUnsavedWork()) {
    return { url: `${base}?puzzle=${state.puzzleId}`, kind: 'puzzle', oversized: false }
  }
  const data = b64encode(JSON.stringify(serialize()))
  const url = `${base}?data=${encodeURIComponent(data)}`
  return { url, kind: 'data', oversized: url.length > MAX_DATA_URL }
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
