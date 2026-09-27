// Store module: session. Editor session (recording, undo, play/editor
// switching) and automatic solve / mistake detection. Part of the store split:
// import from src/store.js, never from this file directly.

import { computed, watch } from 'vue'
import { ATTEMPTS_KEY, clone, config, state, ui } from './state.js'
import { animationOf, revertControlFlips } from './board.js'
import { clearStoryStack } from './abilities.js'
import { purgeGeneratedCards } from './effects.js'
import { undo, withEditorSiteMana } from './mana.js'

// ---------- editor ----------

// Restore a zones snapshot, but keep cards that were added after the snapshot
// was taken by dropping them back into the pool instead of losing them.
export function restoreZones(snapshot) {
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
export const editingStart = () => state.mode === 'editor' && !state.recording

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
  clearStoryStack()
}

// `from`, `held` and `carrierId` are recorded for undo but deliberately not
// compared: they are consequences of the position, so two attempts that reach
// the same point by the same moves always agree on them.
export const sameEntry = (a, b) => {
  if (!a || !b) return false
  const type = a.type || 'move'
  if (type !== (b.type || 'move')) return false
  if (a.cardId !== b.cardId) return false
  if ((a.targetIds || []).join() !== (b.targetIds || []).join()) return false
  if ((a.castId ?? null) !== (b.castId ?? null)) return false
  if ((a.shooterId ?? null) !== (b.shooterId ?? null)) return false
  // Ally-fired projectiles its triggers shot (recordShot). None on either side
  // (every older entry) compares equal.
  if (shotsKey(a) !== shotsKey(b)) return false
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
    return (
      a.targetId === b.targetId &&
      (a.defenderId || null) === (b.defenderId || null) &&
      // The crossing an oversized attacker attacked from (absent for the rest).
      // Lines recorded before crossings were logged have none; absent on
      // either side matches any crossing, so those lines stay solvable.
      (a.crossing == null || b.crossing == null || a.crossing === b.crossing)
    )
  if (type === 'pickup' || type === 'shoot' || type === 'intercept')
    return a.targetId === b.targetId
  if (type === 'drop') return a.to === b.to
  return a.from === b.from && a.to === b.to
}

function shotsKey(e) {
  return (e.shots || []).map((s) => `${s.ownerId}:${s.abilityId}:${s.shooterId}>${s.targetId}`).join('|')
}

function modesKey(e) {
  return [...(e.modes || [])].sort((x, y) => x - y).join(',')
}

export const sameLine = (a, b) =>

  a.length === b.length && a.every((m, i) => sameEntry(m, b[i]))

// The cards a logged entry acts on: the actor and, where present, the thing it
// targets or the defender it drew in. Zones (from/to) are locations, not cards,
// so they are not counted -- the "objects" of a move are cards.
export function entryCards(entry) {
  const ids = new Set()
  if (entry.cardId) ids.add(entry.cardId)
  if (entry.targetId) ids.add(entry.targetId)
  if (entry.defenderId) ids.add(entry.defenderId)
  if (entry.shooterId) ids.add(entry.shooterId)
  for (const s of entry.shots || []) {
    ids.add(s.shooterId)
    if (s.targetId) ids.add(s.targetId)
  }
  return ids
}

// Every card a solution line manipulates -- the union of entryCards over its
// moves. An "in-between" move that touches none of these cards cannot change
// where the solution's own pieces end up, so it is harmless padding.
export function solutionCards(line) {
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
export function lineOutcome(line, moves) {
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
// The length of the shortest recorded solution line (0 with none): what the
// play header advertises and the editor marks as "shortest".
export const shortestLine = computed(() =>
  state.solutions.length ? Math.min(...state.solutions.map((l) => l.length)) : 0
)

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

export function restoreAttempt() {
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
