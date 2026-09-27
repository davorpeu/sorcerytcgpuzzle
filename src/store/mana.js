// Store module: mana. Affinity and mana from cards in play, damage as a logged
// action, draw decks and mode choice. Part of the store split: import from
// src/store.js, never from this file directly.

import { ARMED_ACTIONS, ELEMENTS, clone, emitFx, state, ui, uid, zoneOf } from './state.js'
import {
  abilityCostBlocked,
  abilityUsesLeft,
  animationOf,
  canCastMinionTo,
  cardName,
  castSide,
  cemeteryTaxFor,
  combatActive,
  effectiveKeywords,
  enforcing,
  hasKeyword,
  playerControls,
  regionOf,
  restoreControlFlips,
  sideOf,
  sidePassiveMods,
  takeControl,
  tapBlockedBySickness,
  traits,
  unitsOnSquare,
} from './board.js'
import {
  abilityView,
  adjustDamage,
  cardZoneCategory,
  cleanModes,
  hasModes,
  matchesCostFilter,
  modeChoiceCount,
  needsModeChoice,
  resolveDeaths,
} from './counters.js'
import { canPlace, logEntry, moveCard, routeZone, unitsOnBoard } from './moves.js'
import {
  activatePickState,
  activeAbility,
  allyShoots,
  awaitingShooter,
  canActivateTarget,
  chooseStoryModes,
  choosesCast,
  clearStoryStack,
  continueActivate,
  findAbility,
  findDropShooter,
  fireTriggers,
  modesExtra,
  pickCount,
  runAbilityEffects,
  satisfiesTarget,
  setDropCastId,
} from './abilities.js'
import {
  casting,
  checkSurvival,
  performAbility,
  snapshotStructural,
  spellAbility,
} from './effects.js'
import { adjustStat, isAvatar, isTapped } from './session.js'
import { removeFromZones } from './persistence.js'

// ---------- affinity & mana provided by cards in play ----------

// Cards of a side currently in play (in the realm: sites, units, carried items).
export function inPlayCards(side) {
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
export function withEditorSiteMana(fn) {
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

// What stands between a castable-from-here spell and casting it, for the hand to
// say out loud: [{ kind: 'mana'|'air'|'earth'|'fire'|'water', short: n }] plus
// { kind: 'caster' } when a magic/aura has no one to cast it. Empty when it can
// be cast, or when it isn't the solver's to cast from here at all.
export function castShortfall(cardId) {
  if (!castControlled(cardId) || !spellCastable(cardId)) return []
  const side = castSide(cardId)
  const s = state.stats[side]
  if (!s) return []
  const out = []
  const mana = castManaCost(cardId) - (s.mana || 0)
  if (mana > 0) out.push({ kind: 'mana', short: mana })
  const cost = castCostOf(cardId)
  for (const el of ELEMENTS) {
    const short = cost[el] - effectiveThreshold(side, el)
    if (short > 0) out.push({ kind: el, short })
  }
  if (!canCastFrom(cardId)) out.push({ kind: 'caster' })
  return out
}

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
export function performCast(cardId, abilityId, targetId, gridSquare, destZone, extra = null, dropSquare = null) {
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
    ...(extra?.shooterId ? { shooterId: extra.shooterId } : {}),
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
    emitFx('projectile', { sourceId: entry.shooterId || cardId, targetId, style })
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
export function legalSummonLocation(cardId, to) {
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
  // Dropped on the ally who shoots: arm the hit pick.
  if (allyShoots(t) && t.required) {
    const shooterId = findDropShooter(cardId, t, zone, sq)
    if (!shooterId) return false
    disarmOthers()
    ui.activating = { cardId, abilityId: ability.id, cast: true, shooterId, dropSquare: sq }
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
  setDropCastId(casterId)
  try {
    return ids.find((id) => satisfiesTarget(casterId, id, ability.target)) || null
  } finally {
    setDropCastId(null)
  }
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
  if (awaitingShooter()) {
    ui.activating = { ...ui.activating, shooterId: targetId }
    return
  }
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
  for (const k of ARMED_ACTIONS) ui[k] = null
}

// Esc: drop the armed action, a pending ability target or defender prompt,
// and the selection. A trigger's choice (ui.storyChoice) stays: a triggered
// ability has to resolve.
export function cancelArmed() {
  disarmOthers()
  ui.activating = null
  ui.awaitingDefender = null
  ui.selected = null
}

// The prompts' Cancel buttons.
export function cancelActivation() {
  ui.activating = null
}
export function cancelDefenderPrompt() {
  ui.awaitingDefender = null
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
    const armed = { cardId, abilityId, cast: !!cast, modes: picked, dropSquare: dropSquare ?? null }
    if (allyShoots(t)) {
      const shooterId = dropped ? findDropShooter(cardId, t, dropZone, dropSquare) : null
      ui.activating = shooterId ? { ...armed, shooterId } : armed
      return
    }
    const hit = dropped && pickCount(view) <= 1 ? findDropTarget(cardId, view, dropZone, dropSquare) : null
    if (hit) continueActivate(cardId, abilityId, cast, hit, extra, dropSquare ?? null)
    else ui.activating = armed
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
  clearStoryStack()
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
