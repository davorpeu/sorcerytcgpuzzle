// Store module: moves. Moving cards, attacks, strikes and carrying. Part of the
// store split: import from src/store.js, never from this file directly.

import { watch } from 'vue'
import {
  GRID_COLS,
  GRID_SIZE,
  INTERSECTION_COLS,
  clone,
  emitFx,
  state,
  ui,
  uid,
  zoneOf,
} from './state.js'
import {
  animationOf,
  blockedByStealth,
  boardUnits,
  canAttack,
  canMoveUnit,
  canShoot,
  cantAttack,
  cantDefend,
  cardName,
  combatActive,
  effectiveLife,
  effectivePower,
  effectiveRanged,
  enforcing,
  hasKeyword,
  intersectionSquares,
  isDisabled,
  isOversized,
  isStealthed,
  nodeKey,
  nodeOf,
  oversizedAt,
  playerControls,
  reachableIntersections,
  reachableNodes,
  settleAnimations,
  sideOf,
  squaresOf,
  tapBlockedBySickness,
  unitsOnSquare,
  zoneCategory,
} from './board.js'
import { resolveAttack, strikeWithLance } from './counters.js'
import { fireTriggers } from './abilities.js'
import { checkGrantLoss, checkSurvival, snapshotStructural } from './effects.js'
import { withEditorSiteMana } from './mana.js'
import { editingStart, isAvatar, isUnit } from './session.js'
import { removeFromZones } from './persistence.js'

// ---------- moves ----------

// Site cards dropped anywhere on a square land in its site slot; non-site
// cards dropped on a site slot land on the surface instead.
export function routeZone(cardId, to) {
  const card = state.cards[cardId]
  // An animated site has left its slot to stand as a minion; route it like one.
  const asSite = card?.site && !animationOf(cardId)
  const cellMatch = /^cell:(\d+):(top|bot)$/.exec(to)
  if (cellMatch) return asSite ? `site:${cellMatch[1]}` : to
  const siteMatch = /^site:(\d+)$/.exec(to)
  if (siteMatch) return asSite ? to : `cell:${siteMatch[1]}:top`
  return to
}

export function areAdjacent(idxA, idxB) {
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
export function unitsOnBoard(isEnemySide) {
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
export function canPlace(cardId, to) {
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
  ownByZone(copyId, to)
}

// The player an off-board zone belongs to (hand, cemetery, banished,
// collection, atlas, spellbook), or null for the board and shared zones.
function zoneOwner(zone) {
  const m = /^(hand|grave|banished|collection|atlas|spellbook):(player|opponent)$/.exec(zone || '')
  return m ? m[2] : null
}

// A card set up in a player's hand, cemetery, etc. is that player's: placing it
// there in the editor hands it to them, so it doesn't need toggling by hand.
export function ownByZone(cardId, zone) {
  const owner = zoneOwner(zone)
  if (owner && state.cards[cardId]) state.cards[cardId].enemy = owner === 'opponent'
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
export function shedInPlayState(cardId, toZone, entry) {
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

export const inRealm = (zone) => ['realm', 'aura'].includes(zoneCategory(zone))

// Whether the player may move a card by hand (drag, or select-then-click) to
// `to`. While solving, a manual move always ends in the realm: an off-board card
// may only be played into it, and a realm card moves within it only through the
// armed Move action (ui.moving; Move & Attack's attack moves via targetAttack),
// subject to canMoveUnit. Nothing -- the avatar included -- goes to a hand,
// cemetery, collection, the storyline, etc. by hand; only abilities, triggers
// and effects (death, bounce, banish, draw, ...) do that, and those relocate
// cards without going through this check. The editor, recording included, is free.
export function manualMoveAllowed(cardId, to) {
  // The Move action is a step through the realm, in every mode: an armed mover
  // never goes to a hand, cemetery, collection, the pool, etc.
  if (ui.moving === cardId && !inRealm(routeZone(cardId, to))) return false
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
  if (editingStart()) ownByZone(cardId, to)

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
  // An oversized attacker steps to a crossing over the target first. With a
  // crossing already picked, the target must lie under it; with none picked and
  // several that reach the target, wait for the player to choose one.
  let crossing = null
  if (isOversized(attackerId)) {
    const options = engageCrossings(attackerId, targetId)
    if (ui.attackCrossing != null) {
      if (!options.includes(ui.attackCrossing)) return
      crossing = ui.attackCrossing
    } else if (options.length > 1) {
      ui.attackTarget = targetId
      return
    } else {
      crossing = options[0] ?? null
    }
  }
  // With combat on: the opponent defends automatically (its own AI), while a
  // player-side target still prompts the solver to choose.
  if (combatActive()) {
    const target = state.cards[targetId]
    if (target?.enemy) {
      performAttack(attackerId, targetId, chooseAutoDefender(attackerId, targetId), crossing)
      return
    }
    if (legalDefenders(attackerId, targetId).length) {
      ui.awaitingDefender = { attackerId, targetId, crossing }
      ui.attacker = null
      return
    }
  }
  performAttack(attackerId, targetId, null, crossing)
}

// The crossings an oversized attacker can step to that stand over the target
// (any of the target's squares, on the surface) -- its own crossing included,
// when it already stands over it. Sorted, so the choice reads in board order.
export function engageCrossings(attackerId, targetId) {
  if (!isOversized(attackerId)) return []
  const t = nodeOf(targetId)
  if (!t || t.layer !== 'top') return []
  const squares = squaresOf(targetId)
  return [...reachableIntersections(attackerId)]
    .filter((i) => intersectionSquares(i).some((sq) => squares.includes(sq)))
    .sort((a, b) => a - b)
}

// Is crossing `i` a pick for the armed oversized attacker? With a target waiting,
// only the crossings over it; otherwise any crossing it can reach (clicking the
// chosen one again clears it).
export function attackCrossingPickable(i) {
  const a = ui.attacker
  if (!a || !isOversized(a)) return false
  if (ui.attackTarget) return engageCrossings(a, ui.attackTarget).includes(i)
  return reachableIntersections(a).has(i)
}

export function pickAttackCrossing(i) {
  if (!attackCrossingPickable(i)) return
  if (ui.attackTarget) {
    const targetId = ui.attackTarget
    ui.attackTarget = null
    ui.attackCrossing = i
    targetAttack(targetId)
    return
  }
  ui.attackCrossing = ui.attackCrossing === i ? null : i
}

// A fresh (or cancelled) attack starts with no crossing chosen.
watch(
  () => ui.attacker,
  () => {
    ui.attackCrossing = null
    ui.attackTarget = null
  }
)

// Step an oversized unit to the chosen crossing (the Move half of its Move &
// Attack). Recorded on the entry so undo puts it back and a solution can tell
// which crossing it attacked from (the attacker's only: `record`).
function engageCrossing(unitId, crossing, entry, record = true) {
  const from = zoneOf(unitId)
  if (crossing == null || !/^aura:\d+$/.test(from || '')) return
  const to = `aura:${crossing}`
  if (record) entry.crossing = crossing
  if (from === to) return
  const src = state.zones[from]
  const i = src.indexOf(unitId)
  if (i === -1) return
  snapshotStructural(entry)
  src.splice(i, 1)
  state.zones[to].push(unitId)
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
function performAttack(attackerId, targetId, defenderId, crossing = null) {
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
  // An oversized unit steps crossing to crossing instead: the attacker to the
  // one chosen, a defender to one over the target (staying put if it already is).
  if (crossing != null) engageCrossing(attackerId, crossing, entry)
  else engageMove(attackerId, targetId, entry)
  if (defenderId) {
    const options = engageCrossings(defenderId, targetId)
    const here = oversizedAt(defenderId)
    if (options.length)
      engageCrossing(defenderId, options.includes(here) ? here : options[0], entry, false)
    else engageMove(defenderId, targetId, entry)
  }
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
export function wouldCycle(carrierId, targetId) {
  for (let n = carrierId, hops = 0; n && hops < 64; n = state.carry[n], hops++) {
    if (n === targetId) return true
  }
  return false
}

// Where a dropped card lands. Normally the carrier's own zone, but an
// intersection holds auras and nothing else, so anything else dropped by an
// aura goes to the square up and left of the crossing.
export function dropTarget(itemId, zone) {
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

export function logEntry(entry) {
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
