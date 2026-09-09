import { reactive } from 'vue'

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

const clone = (o) => JSON.parse(JSON.stringify(o))
const uid = () => Math.random().toString(36).slice(2, 10)

export function emptyZones() {
  const z = {
    'hand:player': [],
    'hand:opponent': [],
    'grave:player': [],
    'grave:opponent': [],
    'collection:player': [],
    'collection:opponent': [],
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

async function api(path, options = {}) {
  const headers = {}
  if (options.body) headers['Content-Type'] = 'application/json'
  if (config.nonce) headers['X-WP-Nonce'] = config.nonce
  const res = await fetch(config.apiUrl.replace(/\/+$/, '') + path, {
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
  // A card is in flight. The board's drop zones only take the pointer while
  // this is true or while a card is armed for a click-move; the rest of the
  // time they step aside so the site art underneath them stays clickable.
  dragging: false,
  // Card whose actions are offered in the docked action bar. Selecting is
  // also how a card is picked up without dragging: click the card, then
  // click the zone it should go to.
  selected: null,
})

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
  cards: {}, // id -> { id, name, img, imgId?, site?, aura?, unit?, avatar?, enemy? }
  zones: emptyZones(), // zoneId -> [cardId, ...]
  // Who is carrying what: itemId -> carrierId. A carried card is removed from
  // its zone entirely and lives only here, so it has no position of its own
  // and every zone rule (one site per square, auras only on intersections)
  // stops applying to it. Moving a carrier therefore needs no special case --
  // there is nothing to drag along, because the load was never in a zone.
  carry: {},
  initialZones: null, // snapshot taken when the solution recording starts
  initialCarry: null,
  stats: defaultStats(), // life, mana + elemental thresholds per player
  initialStats: null,
  tapped: {}, // cardId -> true
  initialTapped: null,
  // A puzzle can have several valid solutions; each line is a full move
  // sequence recorded from the same start position, and check() accepts an
  // attempt that matches any of them.
  solutions: [], // [[{ cardId, from, to } | { type: 'attack', ... }], ...]
  draft: [], // moves recorded since "Record" was pressed, committed on stop
  recording: false,
  moves: [], // player's attempt in play mode
  checked: false,
  firstWrong: -1, // index of first divergence after check(); -1 = fully correct
  targetLen: 0, // length of the closest solution line after check()
  tries: 0, // submits used today for this puzzle (non-editors only)
  solved: false, // this puzzle was solved today (non-editors only)
})

export function zoneLabel(zone) {
  if (zone === 'hand:player') return 'Player hand'
  if (zone === 'hand:opponent') return 'Opponent hand'
  if (zone === 'grave:player') return 'Player cemetery'
  if (zone === 'grave:opponent') return 'Opponent cemetery'
  if (zone === 'collection:player') return 'Player collection'
  if (zone === 'collection:opponent') return 'Opponent collection'
  if (zone === 'storyline') return 'Storyline'
  if (zone === 'pool') return 'Card pool'
  let m
  if ((m = zone.match(/^site:(\d+)$/))) return `${squareLabel(m[1])} (site)`
  if ((m = zone.match(/^cell:(\d+):top$/)))
    return `${squareLabel(m[1])} (surface)`
  if ((m = zone.match(/^cell:(\d+):bot$/))) return `${squareLabel(m[1])} (below)`
  if ((m = zone.match(/^cell:(\d+)$/))) return squareLabel(m[1])
  if ((m = zone.match(/^aura:(\d+)$/))) return intersectionLabel(m[1])
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
  if (!imgEl || !imgEl.naturalWidth) return
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
  let m
  if ((m = to.match(/^cell:(\d+):(top|bot)$/))) {
    if (card && card.site) return `site:${m[1]}`
  } else if ((m = to.match(/^site:(\d+)$/))) {
    if (!card || !card.site) return `cell:${m[1]}:top`
  }
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

function findSitePlayerUnit(side, siteZone) {
  const isEnemySide = side === 'opponent'
  const m = siteZone.match(/^site:(\d+)$/)
  const targetIdx = m ? Number(m[1]) : -1

  const candidateUnits = []
  for (let i = 0; i < GRID_SIZE; i++) {
    for (const slot of [`cell:${i}:top`, `cell:${i}:bot`]) {
      for (const id of state.zones[slot] || []) {
        const c = state.cards[id]
        if (c && isUnit(c) && (isEnemySide ? c.enemy : !c.enemy)) {
          candidateUnits.push({ id, card: c, cellIdx: i })
        }
      }
    }
  }

  if (!candidateUnits.length) return null

  // 1. Prefer Avatars
  const avatars = candidateUnits.filter((u) => isAvatar(u.card))
  if (avatars.length) {
    if (targetIdx !== -1) {
      const adjacentAvatar = avatars.find((u) => areAdjacent(u.cellIdx, targetIdx))
      if (adjacentAvatar) return adjacentAvatar.id
    }
    return avatars[0].id
  }

  // 2. Units on/adjacent to site square
  if (targetIdx !== -1) {
    const adjacentUnit = candidateUnits.find((u) => areAdjacent(u.cellIdx, targetIdx))
    if (adjacentUnit) return adjacentUnit.id
  }

  // 3. Any friendly unit on board
  return candidateUnits[0].id
}

export function moveCard(cardId, from, to, { tapOnMove } = {}) {
  // A carried card has no zone of its own, so it cannot be moved out of one:
  // it has to be put down first. Bailing here rather than letting the splice
  // below fail also keeps it out of the pool branch, which would otherwise
  // answer a move request by placing a *copy* of it.
  if (state.carry[cardId]) return
  to = routeZone(cardId, to)
  if (from === to || !state.zones[to]) return
  if (state.mode === 'play' && to === 'pool') return
  // Only one site per square.
  if (to.startsWith('site:') && state.zones[to].length) return
  // Intersections only hold aura cards, one per intersection.
  if (to.startsWith('aura:')) {
    const card = state.cards[cardId]
    if (!card || !card.aura) return
    if (state.zones[to].length) return
  }
  // In the editor the pool is a palette: dragging a card out places a copy
  // and the original stays in the pool, so one upload can be used many times.
  if (from === 'pool' && state.mode === 'editor' && !state.recording) {
    const card = state.cards[cardId]
    if (!card) return
    const copyId = uid()
    state.cards[copyId] = { ...card, id: copyId }
    state.zones[to].push(copyId)
    return
  }
  const src = state.zones[from]
  const i = src ? src.indexOf(cardId) : -1
  if (i === -1) return
  const prevTapped = clone(state.tapped)
  src.splice(i, 1)
  state.zones[to].push(cardId)

  const card = state.cards[cardId]
  const shouldTap = tapOnMove || ui.moving === cardId
  ui.moving = null

  // When a unit moves via the dedicated "Move" action, it taps.
  // Standard moves (spells, abilities, placement) do not tap automatically.
  if (card && isUnit(card) && shouldTap) {
    if (from.startsWith('cell:') && to.startsWith('cell:')) {
      state.tapped[cardId] = true
    }
  }
  // When playing a site from off-board, the controlling unit / avatar on the board taps
  if (card && card.site && !from.startsWith('site:') && to.startsWith('site:')) {
    const side = from.includes('opponent') || card.enemy ? 'opponent' : 'player'
    const unitId = findSitePlayerUnit(side, to)
    if (unitId) {
      state.tapped[unitId] = true
    }
  }

  const move = { cardId, from, to, prevTapped }
  if (state.recording) {
    state.draft.push(move)
  } else if (state.mode === 'play') {
    state.moves.push(move)
    state.checked = false
  }
}

// Flip a board card between the square's surface and underground slots.
export function toggleUnderOver(cardId, from) {
  const m = from.match(/^cell:(\d+):(top|bot)$/)
  if (!m) return
  moveCard(cardId, from, `cell:${m[1]}:${m[2] === 'top' ? 'bot' : 'top'}`)
}

// ---------- moves, attacks & strikes ----------

export function beginMove(cardId) {
  ui.moving = ui.moving === cardId ? null : cardId
  ui.attacker = null
  ui.striker = null
  ui.carrier = null
}

// Attacks and strikes don't change the board; they are logged as their own entry types
// so a solution can require them in sequence with moves.
export function beginAttack(cardId) {
  ui.attacker = ui.attacker === cardId ? null : cardId
  ui.striker = null
  ui.moving = null
  ui.carrier = null
}

export function beginStrike(cardId) {
  ui.striker = ui.striker === cardId ? null : cardId
  ui.attacker = null
  ui.moving = null
  ui.carrier = null
}

export function targetAttack(targetId) {
  if (!ui.attacker || ui.attacker === targetId) return
  const attackerId = ui.attacker
  const prevTapped = clone(state.tapped)
  if (isUnit(attackerId)) {
    state.tapped[attackerId] = true
  }
  const entry = { type: 'attack', cardId: attackerId, targetId, prevTapped }
  if (state.recording) {
    state.draft.push(entry)
  } else if (state.mode === 'play') {
    state.moves.push(entry)
    state.checked = false
  }
  ui.attacker = null
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
  let m
  if ((m = zone.match(/^aura:(\d+)$/))) {
    if (card && card.aura && !state.zones[zone].length) return zone
    const i = Number(m[1])
    const r = Math.floor(i / INTERSECTION_COLS)
    const c = i % INTERSECTION_COLS
    return `cell:${r * GRID_COLS + c}:top`
  }
  const routed = routeZone(itemId, zone)
  if ((m = routed.match(/^site:(\d+)$/)) && state.zones[routed].length) {
    return `cell:${m[1]}:top`
  }
  return routed
}

function logEntry(entry) {
  if (state.recording) {
    state.draft.push(entry)
  } else if (state.mode === 'play') {
    state.moves.push(entry)
    state.checked = false
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
  }
}

export function targetPickup(targetId) {
  const carrier = ui.carrier
  if (!carrier || carrier === targetId) return
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
    const i = src ? src.indexOf(targetId) : -1
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
  if (state.recording) {
    state.draft.push(entry)
  } else if (state.mode === 'play') {
    state.moves.push(entry)
    state.checked = false
  }
  ui.striker = null
}

export function undo() {
  const list = state.recording
    ? state.draft
    : state.mode === 'play'
      ? state.moves
      : null
  if (!list || !list.length) return
  const m = list.pop()
  if (m.prevTapped) {
    state.tapped = clone(m.prevTapped)
  }
  if (m.type === 'attack' || m.type === 'strike') {
    state.checked = false
    return
  }
  if (m.type === 'pickup') {
    if (m.held) state.carry[m.targetId] = m.held
    else {
      delete state.carry[m.targetId]
      if (state.zones[m.from]) state.zones[m.from].push(m.targetId)
    }
    state.checked = false
    return
  }
  if (m.type === 'drop') {
    const z = state.zones[m.to]
    const i = z ? z.indexOf(m.cardId) : -1
    if (i !== -1) z.splice(i, 1)
    state.carry[m.cardId] = m.carrierId
    state.checked = false
    return
  }
  const src = state.zones[m.to]
  const i = src.indexOf(m.cardId)
  if (i !== -1) {
    src.splice(i, 1)
    state.zones[m.from].push(m.cardId)
  }
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
    state.solutions = []
  }
  state.draft = []
  state.recording = true
}

function restoreInitial() {
  if (state.initialZones) {
    state.carry = clone(state.initialCarry || {})
    state.zones = restoreZones(state.initialZones)
  }
  if (state.initialStats) state.stats = clone(state.initialStats)
  state.tapped = clone(state.initialTapped || {})
}

// `from`, `held` and `carrierId` are recorded for undo but deliberately not
// compared: they are consequences of the position, so two attempts that reach
// the same point by the same moves always agree on them.
const sameEntry = (a, b) => {
  if (!a || !b) return false
  const type = a.type || 'move'
  if (type !== (b.type || 'move')) return false
  if (a.cardId !== b.cardId) return false
  if (type === 'attack' || type === 'pickup') return a.targetId === b.targetId
  if (type === 'drop') return a.to === b.to
  return a.from === b.from && a.to === b.to
}

const sameLine = (a, b) =>
  a.length === b.length && a.every((m, i) => sameEntry(m, b[i]))

export function stopRecording() {
  state.recording = false
  if (
    state.draft.length &&
    !state.solutions.some((line) => sameLine(line, state.draft))
  ) {
    state.solutions.push(clone(state.draft))
  }
  state.draft = []
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
  }
  restoreInitial()
  state.moves = []
  state.checked = false
  state.firstWrong = -1
  state.mode = 'play'
  ui.attacker = null
  ui.striker = null
  ui.moving = null
  ui.carrier = null
  ui.selected = null
}

export function enterEditor() {
  if (!config.canEdit) return
  state.mode = 'editor'
  state.recording = false
  state.moves = []
  state.checked = false
  restoreInitial()
  ui.attacker = null
  ui.carrier = null
  ui.striker = null
  ui.moving = null
  ui.selected = null
}

export function resetPlay() {
  restoreInitial()
  state.moves = []
  state.checked = false
  state.firstWrong = -1
  ui.attacker = null
  ui.carrier = null
  ui.striker = null
  ui.moving = null
  ui.selected = null
}

export function adjustStat(side, key, delta) {
  const s = state.stats[side]
  s[key] = Math.max(0, (s[key] || 0) + delta)
}

export function isUnit(cardOrId) {
  const card = typeof cardOrId === 'string' ? state.cards[cardOrId] : cardOrId
  return !!(card && (card.unit || card.avatar))
}

export function isAvatar(cardOrId) {
  const card = typeof cardOrId === 'string' ? state.cards[cardOrId] : cardOrId
  return !!(card && card.avatar)
}

export function isTapped(cardId) {
  return !!(state.tapped && state.tapped[cardId])
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
  card.site = !card.site
  if (card.site) {
    card.aura = false
    card.unit = false
    card.avatar = false
  }
}

export function toggleUnit(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  if (card.unit && !card.avatar) {
    card.unit = false
  } else {
    card.unit = true
    card.avatar = false
    card.site = false
    card.aura = false
  }
}

export function toggleAvatar(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  if (card.avatar) {
    card.avatar = false
    card.unit = false
  } else {
    card.avatar = true
    card.unit = true
    card.site = false
    card.aura = false
  }
}

// Cards controlled by the opponent render upside down, like on the mat.
export function toggleControl(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  card.enemy = !card.enemy
}

export function toggleAura(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  card.aura = !card.aura
  if (card.aura) {
    card.site = false
    card.unit = false
    card.avatar = false
  }
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
    const rec = (JSON.parse(localStorage.getItem(ATTEMPTS_KEY)) || {})[
      attemptKey()
    ]
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
      state.cards[id] = { id, name: file.name.replace(/\.[^.]+$/, ''), img }
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
  }
  state.zones.pool.push(id)
  return id
}

export function removeCard(cardId) {
  // Whatever it was holding is put down where it stood, rather than vanishing
  // with it into no zone at all.
  for (const itemId of carriedBy(cardId)) dropCarried(itemId)
  delete state.carry[cardId]
  delete state.cards[cardId]
  delete state.tapped[cardId]
  if (state.initialTapped) delete state.initialTapped[cardId]
  for (const zone of Object.values(state.zones)) {
    const i = zone.indexOf(cardId)
    if (i !== -1) zone.splice(i, 1)
  }
  const involves = (m) => m.cardId === cardId || m.targetId === cardId
  state.solutions = state.solutions.map((line) =>
    line.filter((m) => !involves(m))
  )
  state.draft = state.draft.filter((m) => !involves(m))
  state.moves = state.moves.filter((m) => !involves(m))
  if (ui.attacker === cardId) ui.attacker = null
  if (ui.carrier === cardId) ui.carrier = null
  if (ui.striker === cardId) ui.striker = null
  if (ui.moving === cardId) ui.moving = null
  if (ui.selected === cardId) ui.selected = null
  if (state.initialZones) {
    for (const zone of Object.values(state.initialZones)) {
      const i = zone.indexOf(cardId)
      if (i !== -1) zone.splice(i, 1)
    }
  }
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
    cards: state.cards,
    initial: state.initialZones || state.zones,
    tapped: state.initialTapped || state.tapped,
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
    cards: clone(state.cards),
    initial: clone(state.initialZones || state.zones),
    initialTapped: clone(state.initialTapped || state.tapped || {}),
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
      const m = k.match(/^cell:(\d+)$/)
      if (m && out[`cell:${m[1]}:top`]) out[`cell:${m[1]}:top`].push(...v)
    }
  }
  return out
}

function normalizeStats(s) {
  const out = defaultStats()
  for (const side of ['player', 'opponent']) {
    Object.assign(out[side], (s || {})[side] || {})
  }
  return out
}

export function loadPuzzle(data, { play = true } = {}) {
  state.puzzleId = data.id || uid()
  state.puzzleName = data.name || ''
  state.puzzleDesc = data.desc || ''
  state.puzzleDate = data.date || ''
  state.cards = clone(data.cards || {})
  for (const c of Object.values(state.cards)) {
    c.unit = !!(c.unit || c.avatar)
    c.avatar = !!c.avatar
    c.site = !!c.site
    c.aura = !!c.aura
  }
  state.initialZones = normalizeZones(data.initial)
  state.initialCarry = { ...(data.carry || {}) }
  state.carry = clone(state.initialCarry)
  state.zones = restoreZones(state.initialZones)
  state.initialStats = normalizeStats(data.stats)
  state.stats = clone(state.initialStats)
  state.initialTapped = clone(data.initialTapped || {})
  state.tapped = clone(state.initialTapped)
  state.solutions = clone(data.solutions || [])
  state.draft = []
  state.moves = []
  state.recording = false
  state.checked = false
  state.firstWrong = -1
  state.mode = play || !config.canEdit ? 'play' : 'editor'
  ui.attacker = null
  ui.striker = null
  ui.moving = null
  ui.carrier = null
  ui.selected = null
  restoreAttempt()
  markSaved()
}

export function newPuzzle() {
  state.puzzleId = null
  state.puzzleName = ''
  state.puzzleDesc = ''
  state.puzzleDate = ''
  state.cards = {}
  state.zones = emptyZones()
  state.carry = {}
  state.initialZones = null
  state.initialCarry = null
  state.stats = defaultStats()
  state.initialStats = null
  state.tapped = {}
  state.initialTapped = null
  state.solutions = []
  state.draft = []
  state.moves = []
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
export async function loadDaily() {
  if (remote()) {
    try {
      loadPuzzle(await api('/daily'))
      return true
    } catch {
      return false
    }
  }
  const current = (await listPuzzles())
    .filter(released)
    .sort((a, b) =>
      a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1
    )[0]
  if (!current) return false
  loadPuzzle(current)
  return true
}

// ---------- share links / URL loading ----------

const b64encode = (s) => btoa(unescape(encodeURIComponent(s)))
const b64decode = (s) => decodeURIComponent(escape(atob(s)))

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

// ---------- demo content ----------

function svgCard(name, color) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='168'>` +
    `<rect width='120' height='168' rx='10' fill='${color}'/>` +
    `<rect x='6' y='6' width='108' height='156' rx='7' fill='none' stroke='rgba(255,255,255,0.6)' stroke-width='2'/>` +
    `<text x='60' y='90' font-family='Georgia, serif' font-size='15' fill='white' text-anchor='middle'>${name}</text>` +
    `</svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

export function loadDemo() {
  newPuzzle()
  const defs = [
    ['Avatar of Fire', '#f59e0b', 'cell:8:top', 'avatar'],
    ['Squire', '#2563eb', 'hand:player', 'unit'],
    ['Fire Bolt', '#dc2626', 'hand:player', ''],
    ['Wolf Pack', '#57534e', 'cell:7:top', 'unit'],
    ['River Sprite', '#0891b2', 'cell:12:bot', 'unit'],
    ['Ogre', '#65a30d', 'hand:opponent', 'unit'],
    ['Dark Tower', '#7c3aed', 'site:2', 'site'],
    ['Steppe', '#a16207', 'site:7', 'site'],
    ['Lake', '#0e7490', 'site:12', 'site'],
    ['Ward of Embers', '#ea580c', 'aura:5', 'aura'],
  ]
  for (const [name, color, zone, kind] of defs) {
    const id = uid()
    state.cards[id] = {
      id,
      name,
      img: svgCard(name, color),
      site: kind === 'site',
      aura: kind === 'aura',
      unit: kind === 'unit' || kind === 'avatar',
      avatar: kind === 'avatar',
    }
    state.zones[zone].push(id)
  }
  state.stats.player.mana = 3
  state.stats.player.fire = 1
  state.stats.player.water = 1
  state.stats.player.life = 17
  state.stats.opponent.mana = 2
  state.stats.opponent.earth = 1
  state.stats.opponent.life = 4
  state.puzzleName = 'Demo puzzle'
  state.puzzleDesc =
    "Lethal puzzle: the opponent is on 4 life. Find the line that drops " +
    "them to Death's Door this turn."
}
