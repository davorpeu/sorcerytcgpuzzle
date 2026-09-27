// Store module: state. Constants, the three reactive objects (config, ui,
// state) and small shared helpers. Imports nothing from the other store
// modules, so it always loads first. Part of the store split: import from
// src/store.js, never from this file directly.

import { reactive } from 'vue'

export const GRID_COLS = 5
export const GRID_ROWS = 4
export const GRID_SIZE = GRID_COLS * GRID_ROWS
// Interior crossings of the grid lines where four squares meet. Auras sit on
// these intersections rather than in a square.
export const INTERSECTION_COLS = GRID_COLS - 1
export const INTERSECTION_ROWS = GRID_ROWS - 1
export const INTERSECTIONS = INTERSECTION_COLS * INTERSECTION_ROWS

export const STORAGE_KEY = 'sorceryPuzzles.v1'
// Per-puzzle, per-day play progress (mistakes + solved/failed lock) for limited
// players. Soft: clearing localStorage resets it.
export const ATTEMPTS_KEY = 'sorceryAttempts.v1'
// 2: adjacent/nearby include the source's own square (rulebook glossary). Older
// files are not supported.
export const FORMAT_VERSION = 2

// A self-contained ?data= share link longer than this is treated as too big to
// be usable (browsers and chat apps truncate very long URLs). Past it we steer
// the user to a short ?puzzle= link or hosted JSON instead.
export const MAX_DATA_URL = 8000

// WordPress puzzle ids are numeric post IDs; localStorage ids are random
// strings. A numeric id means the puzzle lives on the server, so a share link
// can point at it directly instead of inlining the whole puzzle.
export const isServerId = (id) => /^\d+$/.test(String(id))

// Deep clone via JSON, not structuredClone: everything cloned here is reactive
// (a Vue reactive() Proxy or a subtree of one), and structuredClone throws
// DataCloneError on Proxy objects. The whole puzzle state is JSON-safe by design
// -- it is exactly what gets written to localStorage / the REST API -- so a JSON
// round-trip is both correct and the same shape the store already serializes to.
export const clone = (o) => JSON.parse(JSON.stringify(o))
// Short opaque ids for cards and puzzles. Sourced from the platform CSPRNG
// rather than Math.random -- not for secrecy, but so ids stay well-distributed
// and a static analyzer doesn't flag a weak generator. 8 base36 chars.
export const uid = () =>
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

export const remote = () => !!config.apiUrl

// Strip any trailing slashes from the REST base without a backtracking regex,
// so `${base}${path}` never doubles the separator.
function trimTrailingSlashes(url) {
  let end = url.length
  while (end > 0 && url[end - 1] === '/') end--
  return url.slice(0, end)
}

export async function api(path, options = {}) {
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
  // An oversized attacker also picks the crossing it steps to: the one chosen
  // (clicked before or after the target), and a target picked while several
  // crossings could reach it, waiting for that choice.
  attackCrossing: null,
  attackTarget: null,
  carrier: null, // card id armed to pick up; next click on a card carries it
  striker: null, // card id armed to strike; next click on a unit/site targets it
  moving: null, // card id armed for formal Move action; next zone click moves & taps unit
  // An activated ability that needs a target is waiting for one:
  // { cardId, abilityId }. The next click on a valid target performs it.
  activating: null,
  shooting: null, // card id armed to shoot (Ranged); next click on a unit fires
  intercepting: null, // card id armed to intercept; next click on an enemy fights it
  // An attack is paused for the defending side to interpose a defender:
  // { attackerId, targetId, crossing }. Resolved by chooseDefender / declineDefender.
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

// The one-card actions a card can be armed for (only one at a time: arming one
// clears the others). Esc, removing the card and arming another all clear from
// this one list.
export const ARMED_ACTIONS = ['attacker', 'striker', 'moving', 'carrier', 'shooting', 'intercepting']

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
