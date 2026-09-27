import { computed, watch } from 'vue'
import {
  ATTEMPTS_KEY,
  ELEMENTS,
  FORMAT_VERSION,
  GRID_SIZE,
  MAX_DATA_URL,
  STORAGE_KEY,
  api,
  clone,
  config,
  defaultStats,
  emitFx,
  emptyZones,
  isServerId,
  remote,
  state,
  ui,
  uid,
  zoneOf,
} from './store/state.js'
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
  revertControlFlips,
  sideOf,
  sidePassiveMods,
  takeControl,
  tapBlockedBySickness,
  traits,
  unitsOnSquare,
} from './store/board.js'
import {
  TOKEN_TEMPLATE_KINDS,
  abilityView,
  adjustDamage,
  cardZoneCategory,
  cleanModes,
  hasModes,
  matchesCostFilter,
  modeChoiceCount,
  needsModeChoice,
  normalizeAbility,
  resolveDeaths,
} from './store/counters.js'
import {
  canPlace,
  carriedBy,
  logEntry,
  moveCard,
  ownByZone,
  routeZone,
  unitsOnBoard,
  wouldCycle,
} from './store/moves.js'
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
  dropCarried,
  findAbility,
  findDropShooter,
  fireTriggers,
  modesExtra,
  pickCount,
  runAbilityEffects,
  satisfiesTarget,
  setDropCastId,
} from './store/abilities.js'
import {
  casting,
  checkSurvival,
  performAbility,
  purgeGeneratedCards,
  snapshotStructural,
  spellAbility,
} from './store/effects.js'
export {
  ELEMENTS,
  GRID_COLS,
  GRID_ROWS,
  GRID_SIZE,
  INTERSECTIONS,
  INTERSECTION_COLS,
  INTERSECTION_ROWS,
  START_LIFE,
  clearSelection,
  config,
  defaultStats,
  emitFx,
  emptyZones,
  selectCard,
  state,
  ui,
  zoneOf,
} from './store/state.js'
export {
  ANIMATE_DURATIONS,
  ANIMATE_POWER_REFS,
  REGIONS,
  abilityCostBlocked,
  abilityManaCost,
  abilityUsesLeft,
  animatedPower,
  animationOf,
  armedAttackLegal,
  armedMoveLegal,
  armedShootLegal,
  attackBlockedByPassive,
  canAffordAbility,
  canAttack,
  canCastMinionTo,
  canMoveUnit,
  canShoot,
  canSummonOnEnemySites,
  cantAttack,
  cantBeTargeted,
  cantDefend,
  cantMove,
  cardName,
  castSide,
  cemeteriesSwapped,
  cemeteryTaxFor,
  conditionHolds,
  effective,
  effectiveKeywords,
  effectiveLife,
  effectiveMovement,
  effectivePower,
  effectiveRanged,
  effectiveStrengthMod,
  grantedKeywordsOf,
  hasKeyword,
  hasSummoningSickness,
  hasWard,
  intersectionSquares,
  isAnimated,
  isDisabled,
  isFloodedSite,
  isLandSite,
  isOversized,
  isSilenced,
  isStealthed,
  isWaterSite,
  moveBlockedByPassive,
  playerControls,
  projectileTargets,
  rangedTargets,
  reachableNodes,
  regionOf,
  setFloodedSite,
  sidePassiveMods,
  squareCue,
  squaresOf,
  tapBlockedBySickness,
  waterBodyAt,
  waterBodySizeAt,
  zoneCategory,
  zoneLabel,
  zoneRegion,
} from './store/board.js'
export {
  ABILITY_STARTERS,
  AMOUNT_REFS,
  AREA_SHAPES,
  AVATAR_SIDES,
  CEMETERY_TAX_ON,
  CONDITION_SUBJECTS,
  CONDITION_TYPES,
  DECKS,
  DISCARD_PICKS,
  EFFECT_OPS,
  EFFECT_SIDES,
  EFFECT_WHO,
  FILTER_LABELS,
  FILTER_PLURALS,
  GRANT_RELEASE,
  GRANT_RELEASE_LABELS,
  GRID_ORIGINS,
  GRID_SHAPES,
  KEYWORDS,
  LOCATION_REFS,
  LOSE_CONDITIONS,
  LOSE_LABELS,
  MOVE_KINDS,
  MOVE_REACH,
  PASSIVE_AFFECTS,
  PASSIVE_CONDITIONS,
  PASSIVE_COST_FILTERS,
  PASSIVE_COST_ON,
  PASSIVE_SCOPES,
  REANIMATE_REACH,
  SACRIFICE_COSTS,
  SHIELD_COUNTER,
  STAT_CONDITIONS,
  STRIKE_BY,
  SUBJECT_CONDITIONS,
  TARGETED_TRIGGER_ACTIONS,
  TARGET_FILTERS,
  TARGET_MODES,
  TARGET_SHOOTERS,
  TARGET_SIDES,
  TARGET_WITHIN,
  TOKEN_KINDS,
  TOKEN_LOCATIONS,
  TOKEN_NAMES,
  TOKEN_TEMPLATE_KINDS,
  TRIGGER_ACTIONS,
  TRIGGER_PRESETS,
  TRIGGER_ROLES,
  TRIGGER_SUBJECTS,
  TRIGGER_TARGET_REFS,
  UNIT_LAYERS,
  ZONE_CATEGORIES,
  abilityView,
  addAbility,
  addEffect,
  addMode,
  addSubCondition,
  adjustDamage,
  applyTriggerPreset,
  beginDrag,
  cardZoneCategory,
  counterOf,
  countersOf,
  damageOf,
  endDrag,
  hasModes,
  loseConditions,
  modeChoiceCount,
  needsModeChoice,
  normalizeAbility,
  normalizeCondition,
  removeAbility,
  removeEffect,
  removeMode,
  removeSubCondition,
  retypeEffect,
  setAmountRef,
  setConditionType,
  setDragGhost,
  setEffectCondition,
  setMoveKind,
  setSelectorWho,
  setTokenKind,
  setTokenTemplate,
  setTriggerPick,
  toggleAbilityZone,
  togglePassiveKeyword,
  tokenLocationsFor,
  tokenTemplate,
  triggerPresetOf,
} from './store/counters.js'
export {
  areNearby,
  armedDefendLegal,
  armedInterceptLegal,
  attackCrossingPickable,
  beginAttack,
  beginIntercept,
  beginMove,
  beginShoot,
  beginStrike,
  canIntercept,
  carriedBy,
  carrierOf,
  chooseDefender,
  declineDefender,
  engageCrossings,
  legalDefenders,
  manualMoveAllowed,
  moveCard,
  pickAttackCrossing,
  targetAttack,
  targetIntercept,
  targetShoot,
} from './store/moves.js'
export {
  activatePickState,
  activatedAbilities,
  activeAbility,
  activeDestPick,
  activeGridPick,
  activeStoryDestPick,
  activeStoryGridPick,
  awaitingShooter,
  beginPickup,
  canActivateTarget,
  canPickAnyDest,
  canPickDest,
  canPickGridSquare,
  canStoryPickDest,
  canStoryPickSquare,
  declineStoryChoice,
  destPickArmed,
  destPrompt,
  dropCarried,
  finishStoryPicks,
  isAssumedForm,
  isPickedTarget,
  isStoryChoiceTarget,
  pickAnyDest,
  pickDest,
  pickGridSquare,
  pickStoryDest,
  pickStorySquare,
  resolveStoryChoice,
  shooterStage,
  storyPickState,
  storyShooterStage,
  targetPickup,
  targetStrike,
} from './store/abilities.js'
export {
  spellAbility,
  wardTokenArt,
} from './store/effects.js'

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
const sameEntry = (a, b) => {
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
      (a.crossing ?? null) === (b.crossing ?? null)
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
export function removeFromZones(zones, cardId) {
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
  // Older setups could leave a card in the opponent's hand or cemetery still
  // marked as the player's; the zone it starts in says whose it is.
  for (const [zone, ids] of Object.entries(state.initialZones))
    for (const id of ids) ownByZone(id, zone)
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
  clearStoryStack()
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
  clearStoryStack()
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

// Internals exposed for the unit tests in tests/ only. Not part of the app's
// API: components must not import this.
export const __test = {
  sameEntry,
  sameLine,
  lineOutcome,
  entryCards,
  solutionCards,
  routeZone,
  wouldCycle,
}
