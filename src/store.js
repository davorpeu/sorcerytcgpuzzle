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

export function defaultStats() {
  const side = () => ({ mana: 0, air: 0, earth: 0, fire: 0, water: 0 })
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
})

export const state = reactive({
  mode: 'editor', // 'editor' | 'play'
  puzzleId: null,
  puzzleName: '',
  puzzleDate: '', // optional YYYY-MM-DD, used by the daily-puzzle picker
  cards: {}, // id -> { id, name, img, site?, aura?, enemy? }
  zones: emptyZones(), // zoneId -> [cardId, ...]
  initialZones: null, // snapshot taken when the solution recording starts
  stats: defaultStats(), // mana + elemental thresholds per player
  initialStats: null,
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
  e.dataTransfer.setDragImage(c, width / 2, h / 2)
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

export function moveCard(cardId, from, to) {
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
  src.splice(i, 1)
  state.zones[to].push(cardId)
  const move = { cardId, from, to }
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

// ---------- attacks ----------

// Attacks don't change the board; they are logged as their own entry type
// so a solution can require them in sequence with moves.
export function beginAttack(cardId) {
  ui.attacker = ui.attacker === cardId ? null : cardId
}

export function targetAttack(targetId) {
  if (!ui.attacker || ui.attacker === targetId) return
  const entry = { type: 'attack', cardId: ui.attacker, targetId }
  if (state.recording) {
    state.draft.push(entry)
  } else if (state.mode === 'play') {
    state.moves.push(entry)
    state.checked = false
  }
  ui.attacker = null
}

export function undo() {
  const list = state.recording
    ? state.draft
    : state.mode === 'play'
      ? state.moves
      : null
  if (!list || !list.length) return
  const m = list.pop()
  if (m.type === 'attack') {
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
    if (!placed.has(id)) z.pool.push(id)
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
    state.initialStats = clone(state.stats)
    state.solutions = []
  }
  state.draft = []
  state.recording = true
}

function restoreInitial() {
  if (state.initialZones) state.zones = restoreZones(state.initialZones)
  if (state.initialStats) state.stats = clone(state.initialStats)
}

const sameEntry = (a, b) =>
  a &&
  b &&
  (a.type || 'move') === (b.type || 'move') &&
  a.cardId === b.cardId &&
  (a.type === 'attack'
    ? a.targetId === b.targetId
    : a.from === b.from && a.to === b.to)

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
    state.initialStats = clone(state.stats)
  }
  restoreInitial()
  state.moves = []
  state.checked = false
  state.firstWrong = -1
  state.mode = 'play'
  ui.attacker = null
}

export function enterEditor() {
  if (!config.canEdit) return
  state.mode = 'editor'
  state.recording = false
  state.moves = []
  state.checked = false
  restoreInitial()
  ui.attacker = null
}

export function resetPlay() {
  restoreInitial()
  state.moves = []
  state.checked = false
  state.firstWrong = -1
  ui.attacker = null
}

export function adjustStat(side, key, delta) {
  const s = state.stats[side]
  s[key] = Math.max(0, (s[key] || 0) + delta)
}

// Site and aura are mutually exclusive designations.
export function toggleSite(cardId) {
  const card = state.cards[cardId]
  if (!card) return
  card.site = !card.site
  if (card.site) card.aura = false
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
  if (card.aura) card.site = false
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

// The attempt is correct if it fully matches any solution line. Otherwise
// feedback is given against the closest line: the one the attempt follows
// deepest (ties broken by fewer remaining moves).
export function check() {
  state.checked = true
  const mv = state.moves
  const lines = state.solutions.length ? state.solutions : [[]]
  let best = null
  for (const sol of lines) {
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
// Returns true/false like check(), or null when no try was available.
export function submit() {
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

export function removeCard(cardId) {
  delete state.cards[cardId]
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
  if (state.initialZones) {
    for (const zone of Object.values(state.initialZones)) {
      const i = zone.indexOf(cardId)
      if (i !== -1) zone.splice(i, 1)
    }
  }
}

// ---------- serialization / persistence ----------

export function serialize() {
  return {
    version: FORMAT_VERSION,
    id: state.puzzleId || uid(),
    name: state.puzzleName || 'Untitled puzzle',
    date: state.puzzleDate || null,
    cards: clone(state.cards),
    initial: clone(state.initialZones || state.zones),
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
  state.puzzleDate = data.date || ''
  state.cards = clone(data.cards || {})
  state.initialZones = normalizeZones(data.initial)
  state.zones = restoreZones(state.initialZones)
  state.initialStats = normalizeStats(data.stats)
  state.stats = clone(state.initialStats)
  state.solutions = clone(data.solutions || [])
  state.draft = []
  state.moves = []
  state.recording = false
  state.checked = false
  state.firstWrong = -1
  state.mode = play || !config.canEdit ? 'play' : 'editor'
  restoreAttempt()
}

export function newPuzzle() {
  state.puzzleId = null
  state.puzzleName = ''
  state.puzzleDate = ''
  state.cards = {}
  state.zones = emptyZones()
  state.initialZones = null
  state.stats = defaultStats()
  state.initialStats = null
  state.solutions = []
  state.draft = []
  state.moves = []
  state.recording = false
  state.checked = false
  state.firstWrong = -1
  state.tries = 0
  state.solved = false
  state.mode = config.canEdit ? 'editor' : 'play'
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
    return saved
  }
  state.puzzleId = data.id
  const map = readStore()
  map[data.id] = data
  writeStore(map)
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
    ['Squire', '#2563eb', 'hand:player', ''],
    ['Fire Bolt', '#dc2626', 'hand:player', ''],
    ['Wolf Pack', '#57534e', 'cell:7:top', ''],
    ['River Sprite', '#0891b2', 'cell:12:bot', ''],
    ['Ogre', '#65a30d', 'hand:opponent', ''],
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
    }
    state.zones[zone].push(id)
  }
  state.stats.player.mana = 3
  state.stats.player.fire = 1
  state.stats.player.water = 1
  state.stats.opponent.mana = 2
  state.stats.opponent.earth = 1
  state.puzzleName = 'Demo puzzle'
}
