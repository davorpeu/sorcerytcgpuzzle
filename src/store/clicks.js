// Store module: clicks. What a click (or tap) on a card, a site, an aura or a
// zone does, given whatever action is armed. The order of the checks is game
// logic -- a paused trigger takes a click before an armed attack, and so on --
// so it lives here once instead of in each component. Components pass in what
// they know from the DOM (which square band is under the pointer) and call
// these. Part of the store split: import from src/store.js, never from this
// file directly.

import { cellSquare, crossingIndex, selectCard, state, ui, zoneOf } from './state.js'
import { armedAttackLegal, armedShootLegal, isOversized, playerControls } from './board.js'
import {
  armedDefendLegal,
  armedInterceptLegal,
  attackCrossingPickable,
  chooseDefender,
  manualMoveAllowed,
  moveCard,
  pickAttackCrossing,
  targetAttack,
  targetIntercept,
  targetShoot,
} from './moves.js'
import {
  activeGridPick,
  activeStoryGridPick,
  canActivateTarget,
  canPickAnyDest,
  canPickGridSquare,
  canStoryPickSquare,
  destPickArmed,
  isStoryChoiceTarget,
  pickAnyDest,
  pickGridSquare,
  pickStorySquare,
  resolveStoryChoice,
  targetPickup,
  targetStrike,
} from './abilities.js'
import { canCast, castByDrop, castControlled, spellCastable, targetActivate } from './mana.js'

// ---------- cards (tokens) ----------

// Whether a card token answers the armed attack / strike / shoot / intercept,
// defender prompt or trigger choice (it is highlighted as a target). `from` is
// the zone the token is drawn in.
export function cardTargetable(cardId, from) {
  const onBoard = cellSquare(from) != null
  if (ui.storyChoice) return isStoryChoiceTarget(cardId)
  if (ui.awaitingDefender) return armedDefendLegal(cardId)
  if (ui.shooting && ui.shooting !== cardId) return armedShootLegal(cardId)
  if (ui.intercepting && ui.intercepting !== cardId) return onBoard && armedInterceptLegal(cardId)
  if (!onBoard) return false
  if (ui.striker && ui.striker !== cardId) return true
  return armedAttackLegal(cardId)
}

// Whether a card token is where an armed pick-up lands.
export const cardLiftable = (cardId) => !!ui.carrier && ui.carrier !== cardId

// Only the formal Move action makes a click on a unit mean "move here". A
// plain selection leaves other units clickable to select instead, so you can
// switch between cards without moving. So clicking a unit standing in a square
// sends the moving card onto that square -- the same as clicking the bare felt
// or the site there -- rather than reselecting the card under the pointer.
// Only board squares are destinations; tokens in a hand or cemetery still
// select. Tokens live in the surface band, so that is where the move lands;
// the below band is a separate strip of its own that catches its own clicks.
export const cardMoveTarget = (cardId, from) =>
  !!ui.moving && ui.moving !== cardId && cellSquare(from) != null

export function clickCard(cardId, from) {
  // Picking a destination (teleport / token placement): a click on a card picks
  // its location -- its own layer if legal there, else that square's surface.
  if (destPickArmed()) {
    const sq = cellSquare(from)
    if (sq != null) {
      const zone = canPickAnyDest(from) ? from : `cell:${sq}:top`
      if (canPickAnyDest(zone)) pickAnyDest(zone)
    }
    return
  }
  // The storyline is paused for a trigger to pick a target.
  if (ui.storyChoice) {
    if (isStoryChoiceTarget(cardId)) resolveStoryChoice(cardId)
    return
  }
  // Aiming a grid ability: clicking a unit picks its square.
  if (activeGridPick()) {
    const sq = cellSquare(from)
    if (sq != null && canPickGridSquare(sq)) pickGridSquare(sq)
    return
  }
  // A pending attack is waiting for a defender: a highlighted unit takes the job.
  if (ui.awaitingDefender) {
    if (armedDefendLegal(cardId)) chooseDefender(cardId)
    return
  }
  if (cardTargetable(cardId, from)) {
    if (ui.shooting) targetShoot(cardId)
    else if (ui.intercepting) targetIntercept(cardId)
    else if (ui.attacker) targetAttack(cardId)
    else if (ui.striker) targetStrike(cardId)
    return
  }
  // An armed activated ability lands its target here.
  if (canActivateTarget(cardId)) {
    targetActivate(cardId)
    return
  }
  // An armed pick-up lands here too, or the highlight would be a lie: this is
  // the only click surface for cards on the board and in hand, and sites and
  // auras lift the same way (clickSite / clickAura).
  if (cardLiftable(cardId)) {
    targetPickup(cardId)
    return
  }
  // A click on a unit while the Move action is armed drops the moving card
  // onto this unit's square (surface band) instead of reselecting.
  if (cardMoveTarget(cardId, from)) {
    const movingFrom = zoneOf(ui.moving)
    if (movingFrom) {
      moveCard(ui.moving, movingFrom, `cell:${cellSquare(from)}:top`)
      return
    }
  }
  selectCard(cardId)
}

// ---------- sites and auras (painted on the board) ----------

// A click on square `idx`'s site art. `band` is the zone under the pointer
// (`cell:idx:top` or `cell:idx:bot`), which the board works out from the DOM;
// `siteId` is the site standing there, if any.
export function clickSite(idx, band, siteId) {
  // Picking a destination: the site art stands for its square's locations.
  if (destPickArmed()) {
    if (canPickAnyDest(band)) pickAnyDest(band)
    else if (canPickAnyDest(`cell:${idx}:top`)) pickAnyDest(`cell:${idx}:top`)
    return
  }
  // Only the formal Move action turns a click anywhere on the square -- bare
  // felt, the site art, or a unit standing here -- into a move; moveCard taps
  // the moving unit because ui.moving is set. A plain selection leaves the
  // site clickable to select (the else branch) so you can switch between
  // pieces without moving. The band under the pointer picks surface vs below.
  if (ui.moving && (!siteId || ui.moving !== siteId)) {
    const from = zoneOf(ui.moving)
    if (from) moveCard(ui.moving, from, band)
    return
  }
  if (!siteId) return
  if (ui.attacker && ui.attacker !== siteId) targetAttack(siteId)
  else if (ui.carrier && ui.carrier !== siteId) targetPickup(siteId)
  else if (ui.striker && ui.striker !== siteId) targetStrike(siteId)
  else selectCard(siteId)
}

export function clickAura(cardId) {
  if (!cardId) return
  // Any aura -- animated or not -- can be an ability's or trigger's target
  // (e.g. "animate an aura"); the ability's target spec decides.
  if (ui.storyChoice) {
    if (isStoryChoiceTarget(cardId)) resolveStoryChoice(cardId)
    return
  }
  if (canActivateTarget(cardId)) {
    targetActivate(cardId)
    return
  }
  // An oversized attacker picking its crossing: a card already standing there
  // (its own token, to attack from where it is) stands for the crossing, unless
  // it is itself something to attack.
  if (ui.attacker && !armedAttackLegal(cardId)) {
    const crossing = Number(zoneOf(cardId)?.slice('aura:'.length))
    if (attackCrossingPickable(crossing)) {
      pickAttackCrossing(crossing)
      return
    }
  }
  // An animated aura is an oversized minion, so it can be the target of the
  // same armed actions a unit token answers to.
  if (isOversized(cardId)) {
    if (ui.awaitingDefender) {
      if (armedDefendLegal(cardId)) chooseDefender(cardId)
      return
    }
    if (ui.shooting && ui.shooting !== cardId) {
      if (armedShootLegal(cardId)) targetShoot(cardId)
      return
    }
    if (ui.attacker && ui.attacker !== cardId) {
      if (armedAttackLegal(cardId)) targetAttack(cardId)
      return
    }
    if (ui.striker && ui.striker !== cardId) {
      targetStrike(cardId)
      return
    }
  }
  if (ui.carrier && ui.carrier !== cardId) targetPickup(cardId)
  else selectCard(cardId)
}

// ---------- zones (drop targets) ----------

// Board zones: a square's site slot, surface or below, and the crossings.
const isBoardZone = (zone) => /^(cell|site|aura):/.test(zone)

// Whether a zone turns the card away outright: while solving, a manual move
// must end in the realm, so hands, cemeteries and the other off-board zones
// refuse every card, and a realm card is refused everywhere unless its Move
// action is armed (moveCard enforces it; this just keeps the zone from
// advertising a move that would do nothing). A castable spell is cast, not
// moved, so the realm never refuses it -- but a pile or hand can't take a
// cast (castByDrop would silently do nothing), so off-board zones refuse it,
// all but the storyline for a magic.
export function zoneRefuses(cardId, zone) {
  if (!cardId) return false
  if (spellCastable(cardId)) {
    if (isBoardZone(zone)) return false
    return !(zone === 'storyline' && state.cards[cardId]?.magic)
  }
  return !manualMoveAllowed(cardId, zone)
}

// A zone takes a click while a card is selected (and no attack or strike is
// armed): the click moves that card there. The touch-friendly counterpart to
// dragging, and the only way to play on a tablet, where HTML5 drag-and-drop
// does not fire at all.
export const zoneArmed = (zone) =>
  !!ui.selected && !ui.attacker && !ui.striker && !zoneRefuses(ui.selected, zone)

// A card dropped (or click-moved) onto a zone. A spell dragged/clicked from a
// castable source into play is cast at the drop location (a magic targets
// what's there; a permanent enters the realm), not moved. The source is the
// hand, or the cemetery for a card that grants it -- spellCastable decides. In
// the editor it is false, so setting up a puzzle still just places cards. An
// unaffordable spell does nothing rather than moving in for free.
export function castOrMove(cardId, from, zone) {
  // In play mode the solver drives only their own side: an opponent's cards
  // (a spell in their hand, a unit of theirs on the board) can't be cast or
  // moved by dragging/clicking. The puzzle moves the opponent automatically.
  // A spell is gated by who casts it, which can be the solver even for an
  // opponent's card (out of a swapped cemetery, or by a cast permit).
  if (spellCastable(cardId)) {
    if (castControlled(cardId) && canCast(cardId)) castByDrop(cardId, zone)
    return
  }
  if (!playerControls(cardId)) return
  moveCard(cardId, from, zone)
}

// A click on a drop zone. `pickable` says whether the zone's square is a legal
// grid pick right now (DropZone already computes it for its highlight).
export function clickZone(zone, pickable) {
  // A destination pick (teleport / token placement) takes the click. This zone
  // is one exact location: the surface band or the below band of a square.
  if (destPickArmed()) {
    if (canPickAnyDest(zone)) pickAnyDest(zone)
    return
  }
  const sq = cellSquare(zone)
  // A paused trigger picking a grid square takes the click.
  if (activeStoryGridPick()) {
    if (sq != null && canStoryPickSquare(sq)) pickStorySquare(sq)
    return
  }
  // A grid-target ability being aimed takes the click as a square pick.
  if (activeGridPick()) {
    if (pickable) pickGridSquare(sq)
    return
  }
  // An oversized attacker's crossing: picked here, before or after the target.
  const crossing = crossingIndex(zone)
  if (crossing != null && ui.attacker) {
    if (attackCrossingPickable(crossing)) pickAttackCrossing(crossing)
    return
  }
  if (!zoneArmed(zone)) return
  const from = zoneOf(ui.selected)
  if (from) castOrMove(ui.selected, from, zone)
}
