// Store module: abilities. Triggered abilities, the storyline (trigger
// resolution stack), activated abilities, destination picks and ally-fired
// projectiles. Part of the store split: import from src/store.js, never from
// this file directly.

import { reactive } from 'vue'
import {
  isAvatar,
  isSpell,
  isUnit,
  kingDistance,
  legalSummonLocation,
  performAbility,
  performCast,
  runEffects,
} from '../store.js'
import { GRID_COLS, GRID_SIZE, clone, emitFx, state, ui, uid, zoneOf } from './state.js'
import {
  abilitiesOf,
  areaSquares,
  blockedByStealth,
  cantBeTargeted,
  castSide,
  cemeteriesSwapped,
  combatActive,
  conditionHolds,
  enforcing,
  inPlay,
  intersectionSquares,
  isDisabled,
  isSilenced,
  isStealthed,
  nodeOf,
  oppositeSides,
  playerControls,
  projectileTargets,
  regionOf,
  sacrificeable,
  siteOn,
  squareOfSite,
  zoneCategory,
  zoneRegion,
} from './board.js'
import {
  PICKED_TOKEN_LOCATIONS,
  TARGETED_TRIGGER_ACTIONS,
  abilityView,
  cardZoneCategory,
  catMatches,
  hasModes,
  needsModeChoice,
  strikeWithLance,
  zoneListHas,
} from './counters.js'
import { areAdjacent, areNearby, carriedBy, dropTarget, logEntry, wouldCycle } from './moves.js'

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
export function clearStoryStack() {
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
export function chooseStoryModes(picked) {
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
export function findAbility(cardId, abilityId) {
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
export const modesExtra = (a) => {
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
export function squareOf(id) {
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
export function continueActivate(cardId, abilityId, cast, targetId, extra = null, dropSquare = null) {
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
export function runAbilityEffects(ability, cardId, targetId, entry, ids = entry.targetIds, gridSquare, destZone, extra = {}) {
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
export function setDropCastId(id) {
  dropCastId = id
}
const beingCast = (id) => dropCastId === id || (!!ui.activating?.cast && ui.activating.cardId === id)
const actsAsEnemy = (id) =>
  beingCast(id) ? castSide(id) === 'opponent' : !!state.cards[id]?.enemy
const opposes = (sourceId, id) => actsAsEnemy(sourceId) !== !!state.cards[id]?.enemy

// The target must be on the right side relative to the source.
export function matchesTargetSide(sourceId, targetId, side, invert = false) {
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
export const allyShoots = (t) => t?.mode === 'card' && t.within === 'projectile' && t.shooter === 'ally'

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
export function findDropShooter(sourceId, t, zone, sq) {
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
export const pickCount = (ability) =>
  ability?.target?.mode === 'card' ? Math.max(1, Number(ability.target.count) || 1) : 1
export const choosesCast = (ability) =>
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
