import { computed, nextTick, reactive, watch } from 'vue'
import {
  ATTEMPTS_KEY,
  ELEMENTS,
  FORMAT_VERSION,
  GRID_COLS,
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
  ANIMATE_DURATIONS,
  abilitiesOf,
  abilityCostBlocked,
  abilityManaCost,
  abilityUsesLeft,
  animatedPower,
  animationOf,
  areaSquares,
  blockedByStealth,
  boardUnits,
  canCastMinionTo,
  cantBeTargeted,
  cardName,
  castSide,
  cemeteriesSwapped,
  cemeteryTaxFor,
  combatActive,
  combatPower,
  conditionHolds,
  effectiveKeywords,
  enforcing,
  hasKeyword,
  hasWard,
  inPlay,
  intersectionSquares,
  isDisabled,
  isOversized,
  isSilenced,
  isStealthed,
  newHits,
  nodeOf,
  oppositeSides,
  oversizedOnSquare,
  payCardCosts,
  playerControls,
  projectileStep,
  projectileTargets,
  rawMatchesFilter,
  regionOf,
  restoreControlFlips,
  revertControlFlips,
  sacrificeable,
  setFloodedSite,
  sideOf,
  sidePassiveMods,
  siteOn,
  squareOfSite,
  takeControl,
  tapBlockedBySickness,
  traits,
  unitsOnSquare,
  wardBlocks,
  waterBodyAt,
  waterBodySizeAt,
  zoneCategory,
  zoneLabel,
  zoneRegion,
} from './store/board.js'
import {
  PICKED_TOKEN_LOCATIONS,
  SHIELD_COUNTER,
  TARGETED_TRIGGER_ACTIONS,
  TOKEN_DEFS,
  TOKEN_TEMPLATE_KINDS,
  abilityView,
  absorbDamage,
  addCounters,
  adjustDamage,
  announcePrevented,
  applyHit,
  cardZoneCategory,
  catMatches,
  cleanModes,
  counterOf,
  damageOf,
  fireDamage,
  hasModes,
  loseConditions,
  matchesCostFilter,
  modeChoiceCount,
  needsModeChoice,
  normalizeAbility,
  resolveDeaths,
  sendToCemetery,
  settleHits,
  strikeWithLance,
  tokenTemplate,
  zoneListHas,
} from './store/counters.js'
import {
  areAdjacent,
  areNearby,
  canPlace,
  carriedBy,
  carrierOf,
  dropTarget,
  logEntry,
  moveCard,
  ownByZone,
  routeZone,
  shedInPlayState,
  unitsOnBoard,
  wouldCycle,
} from './store/moves.js'
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
// Other modules reset it through this: an imported binding can't be assigned.
function clearStoryStack() {
  storyStack = null
}
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

// Cards a triggered ability could target, evaluated from its owner. An
// ally-fired projectile's first pick is the ally, so what it offers is the
// allies with something to hit.
function triggerTargets(ownerId, ability) {
  if (allyShoots(ability.target)) return shootersFor(ownerId, ability.target)
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
  // An ally-fired projectile hits only what the picked ally shoots.
  if (t.required && allyShoots(t)) return null
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
    (id) =>
      id !== c.ownerId &&
      !picks.includes(id) &&
      satisfiesTarget(c.ownerId, id, c.ability.target, c.shooterId || null)
  )
}

// The player picked a target (or square) for the paused triggered ability;
// resolve it, then continue the storyline.
export function resolveStoryChoice(targetId, gridSquare) {
  const c = ui.storyChoice
  if (!c || c.dest || c.pickModes) return
  // "An ally shoots": the first pick is the ally; the storyline stays paused
  // for what it hits.
  if (storyAwaitingShooter(c)) {
    if (targetId != null) ui.storyChoice = { ...c, shooterId: targetId }
    return
  }
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
  if (!ignored && c.shooterId) recordShot(c, targetId)
  if (!ignored && c.shooterId && targetId)
    emitFx('projectile', { sourceId: c.shooterId, targetId, style: 'fireball' })
  if (!ignored)
    runAbilityEffects(c.ability, c.ownerId, targetId, c.entry, ids, gridSquare, destZone, {
      triggeringId: c.triggeringId,
      otherId: c.otherId,
      ownerAt: c.ownerAt,
      shooterId: c.shooterId || null,
    })
  resolveStory() // resume the rest of the storyline
}

// A trigger's ally-fired projectile is part of the move that set it off: which
// ally shot and what it hit (null: declined) are kept on that logged entry as
// `shots`, in resolution order, so a solution line grades them like a spell's
// own shooterId/targetId. Written through the reactive proxy so the solve
// verdict re-runs -- the entry was logged before the storyline paused.
function recordShot(c, targetId) {
  const e = reactive(c.entry)
  e.shots = [
    ...(e.shots || []),
    { abilityId: c.ability.id, ownerId: c.ownerId, shooterId: c.shooterId, targetId: targetId || null },
  ]
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
  if (storyAwaitingShooter(c)) return shootersFor(c.ownerId, c.ability.target).includes(id)
  return id !== c.ownerId && satisfiesTarget(c.ownerId, id, c.ability.target, c.shooterId || null)
}

// The paused trigger still needs the ally that fires its projectile.
const storyAwaitingShooter = (c) =>
  !!c && !c.dest && !c.pickModes && !c.shooterId && allyShoots(c.ability.target)

// Where a paused trigger's ally-fired projectile picks stand, for the prompt:
// 'shooter', 'hit', or null (see shooterStage).
export function storyShooterStage() {
  const c = ui.storyChoice
  if (storyAwaitingShooter(c)) return 'shooter'
  if (c?.shooterId && !c.dest && !c.pickModes) return 'hit'
  return null
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
export function fireTriggers(entry) {
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
  // An assumed form isn't held, it's worn: only its lose conditions or a
  // release effect end it.
  if (isAssumedForm(itemId)) return
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
export function matchesFilter(card, filter) {
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

// A card taken on as an assumed form (grantFrom): it rides with its carrier,
// whose abilities its own now are, so it has no actions of its own.
export const isAssumedForm = (cardId) => !!state.grants[cardId]

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
// The choices an armed activation carries into its resolution: a modal
// ability's chosen modes, and the ally that shot its projectile target.
const modesExtra = (a) => {
  const out = {}
  if (a?.modes) out.modes = a.modes
  if (a?.shooterId) out.shooterId = a.shooterId
  return Object.keys(out).length ? out : null
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
      ...(extra?.shooterId ? { shooterId: extra.shooterId } : {}),
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

// A spell being aimed (armed cast, or a drag-cast looking for its target) takes
// sides as its caster -- the other side when it is cast out of a swapped
// cemetery or by permit -- though control only passes to them as it resolves.
let dropCastId = null
// Other modules set it through this: an imported binding can't be assigned.
function setDropCastId(id) {
  dropCastId = id
}
const beingCast = (id) => dropCastId === id || (!!ui.activating?.cast && ui.activating.cardId === id)
const actsAsEnemy = (id) =>
  beingCast(id) ? castSide(id) === 'opponent' : !!state.cards[id]?.enemy
const opposes = (sourceId, id) => actsAsEnemy(sourceId) !== !!state.cards[id]?.enemy

// The target must be on the right side relative to the source.
function matchesTargetSide(sourceId, targetId, side, invert = false) {
  if (side === 'any' || !side) return true
  const same = !opposes(sourceId, targetId) !== invert
  return side === 'friendly' ? same : !same
}

// The target must be within range of the source (adjacent = cardinal, nearby =
// king). Unmeasurable sources (a spell cast from hand) don't constrain range.
function withinTargetRange(sourceId, targetId, within, range, shooterId = null) {
  if (within === 'any' || !within) return true
  if (within === 'projectile')
    return projectileTargets(shooterId || sourceId, range).has(targetId)
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
// `shooterId` is the ally that fires a projectile target, once picked.
export function satisfiesTarget(sourceId, targetId, t, shooterId = null) {
  if (!catMatches(t.from, cardZoneCategory(targetId))) return false
  if (!matchesFilter(state.cards[targetId], t.filter)) return false
  // With cemeteries swapped, "your" cemetery is the opponent's and vice versa,
  // so the side restriction flips for cemetery cards.
  const swappedGrave = t.from === 'cemetery' && cemeteriesSwapped()
  if (!matchesTargetSide(sourceId, targetId, t.side, swappedGrave)) return false
  if (!withinTargetRange(sourceId, targetId, t.within, t.range, shooterId)) return false
  // Stealth and a passive "can't be targeted" only shield against the opponent.
  if (isStealthed(targetId) && opposes(sourceId, targetId)) return false
  if (cantBeTargeted(targetId) && opposes(sourceId, targetId)) return false
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
  // "An ally shoots": the first click picks the shooter, the next what it hits.
  if (awaitingShooter())
    return shootersFor(ui.activating.cardId, ability.target).includes(targetId)
  return satisfiesTarget(
    ui.activating.cardId,
    targetId,
    ability.target,
    ui.activating.shooterId || null
  )
}

// ---------- ally-fired projectiles ----------

// Whether a target spec has an ally fire its projectile (Grapple Shot).
const allyShoots = (t) => t?.mode === 'card' && t.within === 'projectile' && t.shooter === 'ally'

// The armed ability is still waiting for the ally who shoots.
export function awaitingShooter() {
  const a = ui.activating
  if (!a || a.dest || a.pickModes || a.shooterId) return false
  return allyShoots(activeAbility()?.target)
}

// Where an ally-fired projectile's picks stand, for the prompts: 'shooter'
// (waiting for the ally), 'hit' (waiting for what it hits), or null.
export function shooterStage() {
  if (awaitingShooter()) return 'shooter'
  const a = ui.activating
  if (a?.shooterId && !a.dest && !a.pickModes) return 'hit'
  return null
}

// An ally that may fire the projectile: a unit in play on the source's side,
// other than the source itself.
function canShootFor(sourceId, id) {
  return (
    id !== sourceId &&
    isUnit(id) &&
    inPlay(id) &&
    !opposes(sourceId, id) &&
    !isDisabled(id)
  )
}

// The allies that could fire `t`'s projectile at something legal.
function shootersFor(sourceId, t) {
  return Object.keys(state.cards).filter(
    (s) =>
      canShootFor(sourceId, s) &&
      Object.keys(state.cards).some((id) => id !== sourceId && satisfiesTarget(sourceId, id, t, s))
  )
}

// A drag-cast spell aimed by its drop: an ally-fired projectile's drop names
// the shooter (the hit is then clicked). Null when the drop holds no such ally.
function findDropShooter(sourceId, t, zone, sq) {
  const ids =
    sq != null
      ? [`cell:${sq}:top`, `cell:${sq}:bot`].flatMap((z) => state.zones[z] || [])
      : [...(state.zones[zone] || [])]
  dropCastId = sourceId
  try {
    const allies = shootersFor(sourceId, t)
    return ids.find((id) => allies.includes(id)) || null
  } finally {
    dropCastId = null
  }
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

export const otherSide = (side) => (side === 'player' ? 'opponent' : 'player')

// The cards a selector picks (see EFFECT_WHO). `ctx` is the resolving
// ability's { ability, sourceId, targetId, triggeringId, pickSquare,
// castSquare }. Only existing cards are returned; Ward is applied by the caller,
// per recipient.
export function selectCards(sel, ctx) {
  const src = ctx.sourceId
  const one = (id) => (id && state.cards[id] ? [id] : [])
  switch (sel?.who) {
    case 'target':
      return one(ctx.targetId)
    case 'shooter':
      return one(ctx.shooterId)
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
export function snapshotStructural(entry) {
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
  // "Lost when assumed again": the form this ability gave before is shed first.
  if (loseConditions(ability.loseWhen).includes('reassumes'))
    releaseGrant(carrierId, entry, { abilityId: ability.id })
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
// `release` effect and by the loseWhen watcher. `only` narrows it to one
// grant's card, or to the grants one ability made ({ abilityId }).
function releaseGrant(carrierId, entry, only = null) {
  for (const t of Object.keys(state.grants)) {
    const g = state.grants[t]
    if (g.carrierId !== carrierId) continue
    if (typeof only === 'string' && t !== only) continue
    if (only?.abilityId && g.abilityId !== only.abilityId) continue
    snapshotStructural(entry)
    delete state.carry[t]
    delete state.grants[t]
    state.zones[grantReleaseZone(t, g)].push(t)
  }
}

// Banish the picked cemetery cards; the one chosen may then be cast (paying its
// cost, or free) by the ability's controller -- from banishment, and back to
// banishment once a magic resolves. The permission is a cast permit, so the
// cast is a move of its own through the normal cast flow -- started for the
// player straight away (autoCastPermit), with the permit left as the way back
// in should they cancel it. If the spell can't be cast (not enough mana or
// threshold), the activation takes itself back.
function banishAndCast(eff, cardId, targetId, entry) {
  const ids = entry?.targetIds || (targetId ? [targetId] : [])
  const banished = []
  for (const id of ids) {
    // Already banished by the ability's own banish cost: it counts as banished.
    if (cardZoneCategory(id) === 'banished') {
      banished.push(id)
      continue
    }
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
    // After the granting move has finished resolving (and been judged).
    nextTick(() => autoCastPermit(castId, entry))
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

// Start casting a spell a banishAndCast just permitted, if it still may be: a
// magic arms (or resolves) its cast as if Cast were clicked; a permanent is
// selected, ready to be dropped onto the board. When it can't be cast -- the
// caster lacks the mana or threshold -- the activated ability that granted it
// is undone, so the banishment and its paid costs are taken back.
function autoCastPermit(castId, entry) {
  // Already gone: the granting move was snapped back (or otherwise undone).
  if (!state.castPermits[castId] || ui.activating) return
  if (!canCast(castId)) {
    undoGrantingAbility(entry)
    return
  }
  ui.selected = castId
  if (state.cards[castId].magic) beginCast(castId)
}

// Take back an activated ability whose granted cast turned out unaffordable --
// only when it is still the latest logged move (a trigger's banishAndCast, or a
// move already rewound, is left alone). A plain undo: no mistake is counted.
function undoGrantingAbility(entry) {
  if (entry?.type !== 'ability') return
  const list = state.recording ? state.draft : state.mode === 'play' ? state.moves : null
  if (!list?.length || entry.seq == null || list[list.length - 1].seq !== entry.seq) return
  undo()
  ui.selected = null
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
// A projectile's line is measured from whoever shot it (`shooterId`, when an
// ally fired it), else from the source.
function resolveLocation(ref, sourceId, targetId, destZone, pickSquare, shooterId = null) {
  if (ref === 'picked') {
    if (destZone) return destZone
    return typeof pickSquare === 'number' ? `cell:${pickSquare}:top` : null
  }
  if (ref === 'projectileStop') return projectileStep(shooterId || sourceId, targetId, -1)
  if (ref === 'projectileBeyond') return projectileStep(shooterId || sourceId, targetId, 1)
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
    // The ally that shot this ability's projectile target -- only for the
    // ability that logged the entry, not a trigger resolving under it.
    // A trigger passes its own in (`extra`); a trigger never inherits one.
    shooterId:
      'shooterId' in extra
        ? extra.shooterId
        : !('triggeringId' in extra) && entry?.cardId === cardId
        ? entry.shooterId ?? null
        : null,
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
      // `by: shooter` has the ally that fired the projectile strike instead.
      const striker = eff.by === 'shooter' ? ctx.shooterId : cardId
      if (!striker || !state.cards[striker]) continue
      for (const t of recipients(eff)) {
        if (t === striker) continue
        if (combatActive()) strikeWithLance(striker, t, entry)
        else adjustDamage(t, combatPower(striker))
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
      const to = resolveLocation(eff.to, cardId, targetId, dest, pickSquare, ctx.shooterId)
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
export function effectMove(id, to, entry, name, text) {
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

// Does this entry meet any of a grant's loss conditions for its carrier?
// ('reassumes' is handled by grantFrom itself.)
function matchesLoseWhen(loseWhen, carrierId, entry) {
  return loseConditions(loseWhen).some((c) => matchesLoseCondition(c, carrierId, entry))
}

function matchesLoseCondition(cond, carrierId, entry) {
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
// Each grant answers to the ability that made it.
export function checkGrantLoss(entry) {
  for (const [t, g] of Object.entries(state.grants)) {
    if (!state.grants[t]) continue
    const ability = findAbility(g.carrierId, g.abilityId)
    if (matchesLoseWhen(ability?.loseWhen, g.carrierId, entry)) {
      releaseGrant(g.carrierId, entry.root || entry, t)
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
export function checkSurvival(entry) {
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
    ...(extra?.shooterId ? { shooterId: extra.shooterId } : {}),
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
    emitFx('projectile', { sourceId: entry.shooterId || cardId, targetId, style: 'fireball' })
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
