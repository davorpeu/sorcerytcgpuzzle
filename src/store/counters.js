// Store module: counters. Counters, damage prevention, ability modes, presets
// and damage counters. Part of the store split: import from src/store.js, never
// from this file directly.

import {
  adjustStat,
  checkGrantLoss,
  fireTriggers,
  isUnit,
  matchesFilter,
  removeFromZones,
  snapshotStructural,
} from '../store.js'
import { ELEMENTS, clone, emitFx, state, ui, uid, zoneOf } from './state.js'
import {
  ANIMATE_DURATIONS,
  ANIMATE_POWER_REFS,
  REGIONS,
  boardUnits,
  cardName,
  combatPower,
  effectiveLife,
  hasKeyword,
  inPlay,
  isOversized,
  newHits,
  nodeOf,
  settleAnimations,
  sideOf,
  zoneCategory,
} from './board.js'
import { carriedBy, shedInPlayState } from './moves.js'

// ---------- counters & damage prevention ----------

export const counterOf = (id, name) => state.counters[id]?.[name] || 0
// The named counters on a card, for its badge.
export const countersOf = (id) =>
  Object.entries(state.counters[id] || {}).filter(([, n]) => n > 0)

// Add (or, negative, remove) counters on a card; never below zero, and an
// emptied name/card is dropped so the map stays tidy. Returns the change.
export function addCounters(id, name, delta) {
  if (!id || !name) return 0
  const cur = counterOf(id, name)
  const next = Math.max(0, cur + delta)
  const map = state.counters[id] || (state.counters[id] = {})
  if (next) map[name] = next
  else delete map[name]
  if (!Object.keys(map).length) delete state.counters[id]
  return next - cur
}

// Consume shield counters on a card against incoming damage; how much they
// prevented.
export function absorbDamage(id, amount) {
  const shield = counterOf(id, SHIELD_COUNTER)
  if (!shield || amount <= 0) return 0
  const n = Math.min(shield, amount)
  addCounters(id, SHIELD_COUNTER, -n)
  return n
}

export function announcePrevented(entry, prevented) {
  for (const p of prevented) {
    state.events.push({
      id: uid(),
      seq: entry?.seq,
      cardId: p.targetId,
      name: 'Damage prevented',
      text: `${p.amount} damage to ${cardName(p.targetId)} is prevented.`,
    })
  }
}

// Note where a card stood (square and layer) when a hit in this batch landed.
function recordHitAt(hits, id) {
  if (!id || hits.at[id]) return
  const n = nodeOf(id)
  if (n) hits.at[id] = n
}

// One source->target damage instance. A minion accumulates damage (and a lethal
// flag if the source has Lethal); a site or avatar has no toughness, so its
// controller loses that much life instead. Recorded on `hits` so settleHits can
// announce it as a damage event.
export function applyHit(sourceId, targetId, amount, hits) {
  if (amount <= 0) return
  const tgt = state.cards[targetId]
  if (!tgt) return
  // A card already off the mat (killed earlier in this storyline, say) can't be
  // hit -- otherwise damage triggers could ping a dead card forever. An Avatar
  // is the exception: a puzzle may keep it off the board as a life stat, and
  // damage to it is only life loss (it never dies, so it can't loop on death).
  const offBoard = !inPlay(targetId)
  if (offBoard && !tgt.avatar) return
  // Where both parties stood, so a trigger's `within` can still measure a unit
  // the hit went on to kill (and its Deathrite's area can be measured there).
  recordHitAt(hits, targetId)
  recordHitAt(hits, sourceId)
  // Damage prevention: shield counters soak it up first.
  const prevented = absorbDamage(targetId, amount)
  if (prevented) {
    hits.prevented.push({ targetId, amount: prevented })
    amount -= prevented
    if (amount <= 0) return
  }
  if (isUnit(targetId) && !tgt.avatar) {
    state.damage[targetId] = (state.damage[targetId] || 0) + amount
    if (hasKeyword(sourceId, 'lethal')) hits.lethal.add(targetId)
  } else {
    adjustStat(sideOf(targetId), 'life', -amount)
  }
  hits.dealt.push({ sourceId, targetId, amount })
}

// Announce damage as trigger events ("when damaged", "whenever this deals
// damage") and to the loseWhen watcher. Not a logged move -- like a death's
// replayed move it is a consequence of the causing entry: it carries that
// entry's seq, and `root` so effects snapshot onto it for undo. `killed` is the
// set of cards this batch's deaths removed (only their own damage triggers may
// still resolve from the cemetery); `at` maps a card to the node it stood on.
export function fireDamage(entry, dealt, killed = null, at = null) {
  for (const d of dealt) {
    if (!(d.amount > 0)) continue
    const ev = {
      type: 'damage',
      cardId: d.targetId,
      sourceId: d.sourceId || null,
      amount: d.amount,
      seq: entry?.seq,
      root: entry,
      killed,
      at,
    }
    fireTriggers(ev)
    checkGrantLoss(ev)
  }
}

// Settle a batch of hits: state-based deaths first (damage is immediate), then
// the damage events go onto the storyline.
export function settleHits(entry, hits) {
  announcePrevented(entry, hits.prevented)
  const before = Object.keys(hits.at).filter(inPlay)
  resolveDeaths(entry, hits.lethal)
  const killed = new Set(before.filter((id) => !inPlay(id)))
  fireDamage(entry, hits.dealt, killed, hits.at)
}

// Move a unit to its cemetery as a consequence of `entry`: snapshot for undo,
// announce it, and fire Deathrite (and any "when a unit dies" triggers) by
// replaying the death as a realm->cemetery move keyed to the same seq.
export function sendToCemetery(unitId, entry, name, text) {
  const from = zoneOf(unitId)
  const side = sideOf(unitId)
  snapshotStructural(entry)
  removeFromZones(state.zones, unitId)
  state.zones[`grave:${side}`].push(unitId)
  state.events.push({ id: uid(), seq: entry.seq, cardId: unitId, name, text })
  emitFx('death', { cardId: unitId })
  shedInPlayState(unitId, `grave:${side}`, entry)
  fireTriggers({ type: 'move', cardId: unitId, from, to: `grave:${side}`, seq: entry.seq, root: entry })
}

// State-based death after damage: any minion at or over its Life, or hit by a
// Lethal source, dies to its cemetery. Avatars never leave for the cemetery --
// they bleed life and sit at Death's Door on 0. The zoneOf guard skips a unit a
// nested Deathrite already removed, so it is never sent twice.
// Repeats until a pass kills nobody: a death can lower another unit's Life (it
// was the source of a strength passive), and that unit must then die too,
// whatever order the squares were checked in.
export function resolveDeaths(entry, lethalHit) {
  let died = true
  while (died) {
    died = false
    for (const u of boardUnits()) {
      if (u.card.avatar) continue
      if (!zoneOf(u.id)?.startsWith('cell:') && !isOversized(u.id)) continue
      const dmg = state.damage[u.id] || 0
      if (!lethalHit.has(u.id) && dmg < Math.max(1, effectiveLife(u.id))) continue
      sendToCemetery(u.id, entry, 'Slain', `${cardName(u.id)} was slain.`)
      died = true
    }
  }
  // Survivors animated "until damaged" now revert.
  settleAnimations(entry)
}

// A fight: both combatants strike simultaneously (a site deals nothing back),
// then deaths resolve together so mutual kills work.
// Lance tokens a unit is carrying: +1 strike damage each and (in a fight) first
// strike, consumed on its strike.
const lanceCount = (id) => carriedBy(id).filter((c) => state.cards[c]?.lanceToken).length
const strikesFirst = (id) => hasKeyword(id, 'firststrike') || lanceCount(id) > 0

// Remove a unit's lances from the realm (orphaned from carry, not sent to a zone).
function breakLances(unitId, entry) {
  const lances = carriedBy(unitId).filter((c) => state.cards[c]?.lanceToken)
  if (!lances.length) return
  snapshotStructural(entry)
  for (const l of lances) delete state.carry[l]
  state.events.push({
    id: uid(),
    seq: entry.seq,
    cardId: unitId,
    name: 'Lance breaks',
    text: `${cardName(unitId)}'s lance breaks.`,
  })
}

export function resolveAttack(attackerId, targetId, entry) {
  const aFS = strikesFirst(attackerId)
  const dFS = isUnit(targetId) && strikesFirst(targetId)
  // Lance bonus is added to each striker's damage; capture before the lances break.
  const aDmg = combatPower(attackerId) + lanceCount(attackerId)
  const dDmg = isUnit(targetId) ? combatPower(targetId) + lanceCount(targetId) : 0
  breakLances(attackerId, entry)
  if (isUnit(targetId)) breakLances(targetId, entry)
  // Both or neither strike first -> the usual simultaneous exchange.
  if (aFS === dFS) {
    const hits = newHits()
    applyHit(attackerId, targetId, aDmg, hits)
    if (isUnit(targetId)) applyHit(targetId, attackerId, dDmg, hits)
    settleHits(entry, hits)
    return
  }
  // One strikes first; the other hits back only if it survived that strike.
  const first = aFS ? attackerId : targetId
  const second = aFS ? targetId : attackerId
  const firstDmg = aFS ? aDmg : dDmg
  const secondDmg = aFS ? dDmg : aDmg
  const h1 = newHits()
  applyHit(first, second, firstDmg, h1)
  settleHits(entry, h1)
  if (isUnit(second) && zoneOf(second)?.startsWith('cell:')) {
    const h2 = newHits()
    applyHit(second, first, secondDmg, h2)
    settleHits(entry, h2)
  }
}

// A one-way strike/shoot including its Lance bonus (consumes the lances).
export function strikeWithLance(sourceId, targetId, entry) {
  const dmg = combatPower(sourceId) + lanceCount(sourceId)
  breakLances(sourceId, entry)
  resolveHit(sourceId, targetId, dmg, entry)
}

// A one-way hit (strike, shoot, or a damage effect).
function resolveHit(sourceId, targetId, amount, entry) {
  const hits = newHits()
  applyHit(sourceId, targetId, amount, hits)
  settleHits(entry, hits)
}

// The category a card is actually in right now, resolving a carried card to
// wherever its carrier sits (via zoneOf).
export function cardZoneCategory(cardId) {
  return zoneCategory(zoneOf(cardId))
}

// Categories offered in the ability editor's zone / from / to pickers. Order is
// deliberate: the realm first, then the off-board zones roughly as they sit
// around the table.
export const ZONE_CATEGORIES = [
  'realm',
  'storyline',
  'hand',
  'cemetery',
  'collection',
  'banished',
  'atlas',
  'spellbook',
]

// Auras are in the realm (rulebook): an ability's 'realm' zone covers the aura
// intersections too.
export const catMatches = (want, cat) => want === cat || (want === 'realm' && cat === 'aura')
export const zoneListHas = (list, cat) => (list || []).some((want) => catMatches(want, cat))

// The actions a triggered ability can watch. Mirrors the logged entry `type`s
// (a plain move logs no type, so it is spelled out here as 'move').
export const TRIGGER_ACTIONS = [
  'move',
  'attack',
  'strike',
  'pickup',
  'drop',
  'ability',
  'cast',
  'damage',
  // Convenience: a card comes into the realm from outside it -- cast, summoned,
  // conjured, reanimated (Genesis).
  'enter',
  // Convenience: a unit goes from the realm to a cemetery (dies).
  'death',
]

// Which party of the action is the trigger's subject: the card performing it
// ('actor' -- the mover, attacker, caster; for damage, the source dealing it) or
// the card it is done to ('target' -- the attacked/struck/targeted card, the
// damaged card). "When this is attacked" = action attack, role target, subject self.
export const TRIGGER_ROLES = ['actor', 'target']
// Actions that have an acted-upon party, so a 'target' role can mean something.
// For the rest (a move, drop or death) the role is always 'actor'.
export const TARGETED_TRIGGER_ACTIONS = ['attack', 'strike', 'pickup', 'ability', 'cast', 'damage']
// What a triggered ability's effects auto-target: the trigger's subject, or the
// other party of the action (e.g. the attacker, for a role-target attack trigger).
export const TRIGGER_TARGET_REFS = ['subject', 'other']

// The structured effect ops an ability can carry, for the editor's picker.
export const EFFECT_OPS = [
  'adjustStat',
  'tap',
  'dealDamage',
  'strike',
  'modifyStrength',
  'grantKeyword',
  'move',
  'destroy',
  'banish',
  'bounce',
  'heal',
  'grantFrom',
  'release',
  'flood',
  'unflood',
  'summonToken',
  'animate',
  'banishAndCast',
  'untap',
  'draw',
  'discard',
  'search',
  'reanimate',
  'gainControl',
  'swap',
  'addCounter',
  'removeCounter',
  'preventDamage',
]

// Which deck a draw/search reads: the Spellbook (spells) or the Atlas (sites).
export const DECKS = ['spellbook', 'atlas']
// Whose hand/deck a draw, discard or search uses, relative to the source.
export const EFFECT_SIDES = ['self', 'enemy']
// How a discard picks its cards: the cards its selector names (e.g. a target
// chosen from hand), or a number of cards from a side's hand. The count form
// takes the first cards in hand order -- there is no hand-choice UI yet.
export const DISCARD_PICKS = ['chosen', 'count']
// Where a reanimated card may be summoned, relative to the source: a picked
// location anywhere, or one adjacent/nearby.
export const REANIMATE_REACH = ['any', 'nearby', 'adjacent']

// Where a granted card goes when the grant ends: back where it was taken from
// (a banished avatar assumed as a form simply returns to banishment), or to its
// owner's banished zone / cemetery / hand.
export const GRANT_RELEASE = ['origin', 'banished', 'cemetery', 'hand']
export const GRANT_RELEASE_LABELS = {
  origin: 'back where it came from',
  banished: 'to banishment',
  cemetery: 'to the cemetery',
  hand: 'to hand',
}

// An activated ability's sacrifice cost: nothing, the card itself, or the
// ability's chosen target (which must then be a friendly card in play).
export const SACRIFICE_COSTS = ['none', 'self', 'target']
// The counter name damage prevention uses.
export const SHIELD_COUNTER = 'shield'

// Authoring options for a grid target.
export const TARGET_MODES = ['card', 'grid']
export const GRID_ORIGINS = ['self', 'pick']
export const GRID_SHAPES = ['location', 'adjacent', 'nearby']
// Card-target restrictions relative to the source, and by side.
// 'projectile' = the first unit hit by a projectile fired in a cardinal
// direction (see projectileTargets); `target.range` limits its flight, 0 = no
// limit.
export const TARGET_WITHIN = ['any', 'adjacent', 'nearby', 'projectile']
// Who fires a projectile target's projectile: the ability's own card (a spell
// in hand fires from its caster's avatar), or an ally the player picks first --
// "An ally shoots a projectile" (Grapple Shot). Effects reach that ally as
// `who: shooter`.
export const TARGET_SHOOTERS = ['source', 'ally']
export const TARGET_SIDES = ['any', 'friendly', 'enemy']
// Where a `move` effect sends its subject. 'picked' asks the player for a
// destination when the ability resolves (or uses a grid ability's picked square).
// With a projectile target, 'projectileStop' is the square the projectile
// stopped in (just before the unit it hit) and 'projectileBeyond' the square
// past that unit (knockback).
export const LOCATION_REFS = [
  'sourceLocation',
  'targetLocation',
  'picked',
  'projectileStop',
  'projectileBeyond',
]
// How a `move` effect moves its subject. Both are forced movement -- the unit
// takes no step of its own, so Immobile doesn't stop it. Teleportation may
// cross regions by default; other forced movement (push/pull/drag) may not.
export const MOVE_KINDS = ['teleport', 'forced']
// How far a picked destination may be from the moving unit. Only locations in
// the same region are adjacent/nearby one another, so those reaches never
// change region; 'any' reaches anywhere in the realm.
export const MOVE_REACH = ['adjacent', 'nearby', 'any']

// Tokens an ability can generate. Minion tokens enter the realm like a summon
// (not movement); a lance is a carriable artifact; a ward is a Ward granted to a
// unit.
// (A Ward is granted with grantKeyword; 'ward' only remains a template kind for
// the Ward token's art.)
export const TOKEN_KINDS = ['soldier', 'skeleton', 'frog', 'lance']
export const TOKEN_DEFS = {
  soldier: { name: 'Foot Soldier', unit: true, power: 1 },
  skeleton: { name: 'Skeleton', unit: true, power: 1 },
  frog: { name: 'Frog', unit: true, power: 1 },
  lance: { name: 'Lance', artifact: true, lanceToken: true },
  // Left in a site's place when the site is animated: a land site that
  // provides no mana or threshold. Not offered by summonToken.
  rubble: { name: 'Rubble', site: true },
}
// Every kind a card can be designated as the template of (Rubble included: it
// is generated by animating a site).
export const TOKEN_TEMPLATE_KINDS = [...TOKEN_KINDS, 'ward', 'rubble']
export const TOKEN_NAMES = {
  soldier: 'Foot Soldier',
  skeleton: 'Skeleton',
  frog: 'Frog',
  lance: 'Lance',
  ward: 'Ward',
  rubble: 'Rubble',
}

// The card the author designated as a token kind's template (its art, name and
// abilities), or null to fall back to the plain generated face. Prefers one on
// the same side, so each player's tokens can have their own art.
export function tokenTemplate(kind, enemy) {
  let any = null
  for (const c of Object.values(state.cards)) {
    if (c.generated || c.tokenKind !== kind) continue
    if (!!c.enemy === !!enemy) return c
    any = any || c
  }
  return any
}

// Designate a card as a token kind's template ('' clears it). A template takes
// the type its kind needs, so a Lance template is a carriable lance artifact, a
// Rubble template a site, and a minion token's template a minion.
export function setTokenTemplate(cardId, kind) {
  const card = state.cards[cardId]
  if (!card) return
  const was = card.tokenKind
  card.tokenKind = TOKEN_TEMPLATE_KINDS.includes(kind) ? kind : ''
  if (was === 'lance' && card.tokenKind !== 'lance') card.lanceToken = false
  const def = TOKEN_DEFS[card.tokenKind]
  if (!def) return
  if (def.unit) {
    card.unit = true
    card.site = card.aura = card.artifact = card.monument = card.magic = false
    card.lanceToken = false
  }
  if (def.artifact) {
    card.artifact = true
    card.lanceToken = !!def.lanceToken
    card.unit = card.avatar = card.site = card.aura = card.monument = card.magic = false
  }
  if (def.site) {
    card.site = true
    card.unit = card.avatar = card.aura = card.artifact = card.monument = card.magic = false
    card.manaProvided = 0
  }
}

// Where a generated token appears:
//   self / target            -- on that unit (lance: carried by it; ward: granted)
//   selfSurface / selfBelow  -- the source's square, surface or subsurface
//   targetLocation           -- wherever the target is
//   adjacent / nearby        -- a square the player picks near the source
//   anySite                  -- any square with a site, picked by the player
export const TOKEN_LOCATIONS = [
  'self',
  'target',
  'selfSurface',
  'selfBelow',
  'targetLocation',
  'adjacent',
  'nearby',
  'anySite',
]
// The locations that make sense for each token kind, for the editor.
export function tokenLocationsFor(kind) {
  if (kind === 'lance') return TOKEN_LOCATIONS
  return TOKEN_LOCATIONS.filter((l) => l !== 'self' && l !== 'target')
}
export const PICKED_TOKEN_LOCATIONS = ['adjacent', 'nearby', 'anySite']
// How a damage/strength amount is computed.
// 'power' is the source unit's current combat power (what it would strike for).
// 'count' counts the cards a nested selector (`eff.countOf`) picks -- e.g. the
// friendly minions nearby.
// 'counter' totals the named counter (`eff.counterName`) on the cards `countOf`
// picks.
export const AMOUNT_REFS = ['literal', 'power', 'carriedCount', 'waterBodySize', 'count', 'counter']

// Who an effect hits (its selector):
//   self       -- the card whose ability it is
//   target     -- the ability's chosen card target
//   shooter    -- the ally that fired a projectile target (target.shooter 'ally')
//   triggering -- the card whose action set a triggered ability off (which may
//                 differ from a picked target)
//   avatar     -- a side's avatar (`avatarSide`: 'self' | 'enemy', relative to
//                 the source)
//   carrier    -- whatever is carrying the source
//   area       -- a set of cards (`area`): the ability's grid target ('grid'),
//                 or a region-aware area around the source, filtered by card
//                 kind (TARGET_FILTERS) and side (TARGET_SIDES)
//   other      -- a triggered ability's other party (the attacker, for "when
//                 this is attacked"); shielded by Stealth / "can't be targeted"
export const EFFECT_WHO = ['self', 'target', 'shooter', 'triggering', 'other', 'avatar', 'carrier', 'area']
// Who deals a `strike` effect's blow: the ability's own card, or the ally that
// shot its projectile target.
export const STRIKE_BY = ['self', 'shooter']
export const AVATAR_SIDES = ['self', 'enemy']
// A relative area's reach: the source's own location, or that plus the squares
// adjacent (4 cardinal) or nearby (8 around) it -- the same shapes as passive
// scopes.
// 'realm' is every card in play, any region (still minus the source) -- "if you
// control a Knight".
export const AREA_SHAPES = ['grid', 'location', 'adjacent', 'nearby', 'realm']
// Ops whose subject is a selector.
const WHO_OPS = new Set([
  'tap',
  'dealDamage',
  'strike',
  'modifyStrength',
  'grantKeyword',
  'move',
  'destroy',
  'banish',
  'bounce',
  'heal',
  'animate',
  'flood',
  'unflood',
  'untap',
  'discard',
  'reanimate',
  'gainControl',
  'swap',
  'addCounter',
  'removeCounter',
  'preventDamage',
])
// Ops whose number is an amount (and so take an amountRef).
const AMOUNT_OPS = new Set([
  'dealDamage',
  'modifyStrength',
  'addCounter',
  'removeCounter',
  'preventDamage',
])

// Whose action fires a trigger: the card's own move, anyone's, or one side's.
export const TRIGGER_SUBJECTS = ['self', 'any', 'enemy', 'friendly']

// What a grant-style ability's gained abilities are lost to (Layer 4). An
// ability's `loseWhen` is a list of these -- any one ends the form; an empty
// list keeps it for good. 'reassumes': using the ability again sheds the form
// it gave before.
export const LOSE_CONDITIONS = ['damaged', 'dies', 'leaves-realm', 'taps', 'reassumes']
export const LOSE_LABELS = {
  damaged: 'it takes damage',
  dies: 'it dies',
  'leaves-realm': 'it leaves the realm',
  taps: 'it taps',
  reassumes: 'it assumes a form again',
}
// Older files store one condition as a string ('never' = none).
export function loseConditions(v) {
  const list = Array.isArray(v) ? v : v ? [v] : []
  return LOSE_CONDITIONS.filter((c) => list.includes(c))
}

// Card-kind filter for a target picker. 'unit' = avatar or minion; 'minion' =
// non-avatar unit; 'monument' = an artifact that can't be carried. As in the
// rulebook, 'spell' is any Spellbook card -- magic, minion, artifact or aura --
// and 'magic' just the one-shot kind.
export const TARGET_FILTERS = [
  'any',
  'unit',
  'minion',
  'avatar',
  'site',
  'aura',
  'artifact',
  'monument',
  'magic',
  'spell',
]
// How the editor names each kind (singular, and plural for areas / counts).
export const FILTER_LABELS = {
  any: 'any card',
  unit: 'unit',
  minion: 'minion',
  avatar: 'avatar',
  site: 'site',
  aura: 'aura',
  artifact: 'artifact',
  monument: 'monument',
  magic: 'magic',
  spell: 'spell (magic, minion, artifact or aura)',
}
export const FILTER_PLURALS = {
  any: 'cards',
  unit: 'units',
  minion: 'minions',
  avatar: 'avatars',
  site: 'sites',
  aura: 'auras',
  artifact: 'artifacts',
  monument: 'monuments',
  magic: 'magics',
  spell: 'spells (any)',
}

// Boolean keyword abilities a passive can grant. Base ones live on the card art
// (authored here only so the engine can enforce them); granted ones are badged.
// Ranged is deliberately absent -- it carries a value and is an activated ability.
export const KEYWORDS = [
  'airborne',
  'burrowing',
  'submerge',
  'voidwalk',
  'immobile',
  'stealth',
  'spellcaster',
  'lethal',
  'firststrike',
  'ward',
  'charge',
]

// Who a passive ability affects. Area scopes are region-aware (same region as the
// source) and exclude the source itself. nearby = 8 surrounding squares (king),
// adjacent = 4 cardinal squares.
export const PASSIVE_SCOPES = [
  'self',
  'nearby',
  'adjacent',
  'nearby-friendly',
  'nearby-enemy',
  'adjacent-friendly',
  'adjacent-enemy',
  // Where the source is: an aura's four squares around its intersection (any
  // other card: its own square). Surface units, the sites, and artifacts there.
  'aura-area',
  'aura-area-friendly',
  'aura-area-enemy',
  // Whoever carries the source (a carried artifact's wielder).
  'bearer',
  // Everything on the board (of the kinds it affects), and a side's Avatar.
  'all',
  'all-friendly',
  'all-enemy',
  'avatar-friendly',
  'avatar-enemy',
]
// What kinds of card a non-self passive reaches.
export const PASSIVE_AFFECTS = ['units', 'sites', 'artifacts']

// What a passive cost modifier applies to: the affected card's own cast cost,
// every spell the affected side casts, or the mana cost of the affected cards'
// activated abilities.
export const PASSIVE_COST_ON = ['own', 'spells', 'abilities']


// Which spells a side-wide cost modifier applies to: the target filters that
// make sense for a cast card, plus magic and "permanent" (any non-magic spell).
export const PASSIVE_COST_FILTERS = [
  'any',
  'magic',
  'permanent',
  'minion',
  'aura',
  'artifact',
  'monument',
]

export function matchesCostFilter(card, filter) {
  if (filter === 'permanent') return !!card && !card.magic
  return matchesFilter(card, filter)
}
// Which layer's units an aura-area passive reaches: the surface, below the
// site (underground / underwater), or both.
export const UNIT_LAYERS = ['surface', 'below', 'both']

// Whom a passive's cemetery tax applies to, relative to its controller.
export const CEMETERY_TAX_ON = ['everyone', 'opponent', 'you']

// Conditions (see conditionHolds). A passive applies only while its condition
// holds; a triggered ability's is an intervening "if" (tested as it triggers
// and again as it resolves); an effect's skips it -- running its `else` effects
// instead -- when false. Amount-based ones read a side's stats (`whose`: the
// card's side or the enemy's); card ones read the `subject` (the ability's card,
// its target, or the triggering card); `not` negates; all/any combine `of`.
export const PASSIVE_CONDITIONS = [
  'always',
  'onWater',
  'onLand',
  'onFlooded',
  'lifeAtMost',
  'lifeAtLeast',
  'manaAtLeast',
  'affinityAtLeast',
  'untapped',
  'tapped',
  'damaged',
  'hasKeyword',
  'region',
  'controlsCard',
  'all',
  'any',
]
export const CONDITION_TYPES = PASSIVE_CONDITIONS
export const CONDITION_SUBJECTS = ['self', 'target', 'triggering', 'other']
// Types that test a card (`subject`), and types that read a side's stats (`whose`).
export const SUBJECT_CONDITIONS = [
  'onWater',
  'onLand',
  'onFlooded',
  'untapped',
  'tapped',
  'damaged',
  'hasKeyword',
  'region',
]
export const STAT_CONDITIONS = [
  'lifeAtMost',
  'lifeAtLeast',
  'manaAtLeast',
  'affinityAtLeast',
]

// A condition's full shape: type, amount and element always; the rest only when
// set, so saved puzzles stay small.
export function normalizeCondition(c) {
  const type = PASSIVE_CONDITIONS.includes(c?.type) ? c.type : 'always'
  const out = {
    type,
    amount: Number(c?.amount) || 0,
    element: ELEMENTS.includes(c?.element) ? c.element : 'fire',
  }
  if (type === 'always') return out
  if (c.not) out.not = true
  if (SUBJECT_CONDITIONS.includes(type) && ['target', 'triggering', 'other'].includes(c.subject))
    out.subject = c.subject
  if (STAT_CONDITIONS.includes(type) && c.whose === 'enemy') out.whose = 'enemy'
  if (type === 'hasKeyword') out.keyword = KEYWORDS.includes(c.keyword) ? c.keyword : KEYWORDS[0]
  if (type === 'region') out.region = REGIONS.includes(c.region) ? c.region : 'surface'
  if (type === 'controlsCard')
    out.selector = normalizeSelector(
      c.selector || { who: 'area', area: { shape: 'realm', side: 'friendly', filter: 'minion' } },
      'area'
    )
  if (type === 'all' || type === 'any')
    out.of = Array.isArray(c.of) ? c.of.map(normalizeCondition) : []
  return out
}

// Change a condition's type in place (the editor binds to the object), keeping
// `not`/subject/whose and re-defaulting the rest.
export function setConditionType(cond, type) {
  const next = normalizeCondition({
    type,
    not: cond.not,
    subject: cond.subject,
    whose: cond.whose,
    element: cond.element,
    amount: cond.amount,
  })
  for (const k of Object.keys(cond)) delete cond[k]
  Object.assign(cond, next)
}

// An effect's condition is only saved while it has one: 'always' drops it and
// its `else` list.
export function setEffectCondition(eff, type) {
  if (type === 'always') {
    delete eff.condition
    delete eff.else
    return
  }
  if (!eff.condition) eff.condition = normalizeCondition({ type })
  else setConditionType(eff.condition, type)
  if (!Array.isArray(eff.else)) eff.else = []
}

export function addSubCondition(cond) {
  if (!Array.isArray(cond.of)) cond.of = []
  cond.of.push(normalizeCondition({ type: 'tapped' }))
}

export function removeSubCondition(cond, i) {
  cond.of.splice(i, 1)
}

// Coerce any stored/partial ability into the full shape the editor and runtime
// expect, so older files and hand-edited JSON never surface an undefined nested
// field. Also used to build a fresh ability (pass just { kind }).
export function normalizeAbility(a = {}) {
  return pointTriggerRefs(buildAbility(a))
}

// A triggered ability that doesn't ask the player for a target has no separate
// "target": its effects name the trigger's cards as 'triggering' / 'other', so
// one card has one name in the editor. Point any `target` there at the card the
// trigger names (trigger.targets). Idempotent; run on every new or retyped
// effect, since fresh effects default to `target`.
function pointTriggerRefs(ab) {
  if (ab.kind !== 'triggered' || ab.target.mode === 'grid' || ab.target.required) return ab
  const ref = ab.trigger.targets === 'other' ? 'other' : 'triggering'
  const fixCond = (c) => {
    if (!c) return
    if (c.subject === 'target') c.subject = ref
    if (c.selector) fixSel(c.selector)
    ;(c.of || []).forEach(fixCond)
  }
  const fixSel = (sel) => {
    if (sel?.who === 'target') sel.who = ref
  }
  const fixEffects = (list) =>
    (list || []).forEach((e) => {
      if (e.op !== 'banishAndCast') fixSel(e)
      if (e.countOf) fixSel(e.countOf)
      fixCond(e.condition)
      fixEffects(e.else)
    })
  fixCond(ab.condition)
  fixEffects(ab.effects)
  for (const m of ab.modes || []) fixEffects(m.effects)
  return ab
}

function buildAbility(a) {
  const kind = ['triggered', 'passive'].includes(a.kind) ? a.kind : 'activated'
  return {
    id: a.id || uid(),
    kind,
    name: a.name || '',
    text: a.text || '',
    zones: Array.isArray(a.zones) ? [...a.zones] : ['realm'],
    // Passive-only: who it affects, and what continuous modifier it applies.
    scope: PASSIVE_SCOPES.includes(a.scope) ? a.scope : 'self',
    passive: {
      keywords: Array.isArray(a.passive?.keywords) ? [...a.passive.keywords] : [],
      movement: Number(a.passive?.movement) || 0,
      strength: Number(a.passive?.strength) || 0,
      ranged: Number(a.passive?.ranged) || 0,
      silence: !!a.passive?.silence,
      disable: !!a.passive?.disable,
      // May be summoned onto an opponent-controlled site. A trait rather than a
      // card flag so a future aura scope can lend it to other cards.
      summonOnEnemySites: !!a.passive?.summonOnEnemySites,
      // Area scopes: the source itself counts too.
      includeSelf: !!a.passive?.includeSelf,
      // Which kinds of card an area passive reaches (units only, by default).
      affects: Array.isArray(a.passive?.affects)
        ? a.passive.affects.filter((k) => PASSIVE_AFFECTS.includes(k))
        : ['units'],
      unitLayers: UNIT_LAYERS.includes(a.passive?.unitLayers) ? a.passive.unitLayers : 'surface',
      // This (non-unit) card becomes a minion with this power while the passive
      // applies. Self scope only.
      animate: !!a.passive?.animate,
      animatePower: a.passive?.animatePower == null ? 1 : Number(a.passive.animatePower) || 0,
      animatePowerRef: ANIMATE_POWER_REFS.includes(a.passive?.animatePowerRef)
        ? a.passive.animatePowerRef
        : 'literal',
      animatePowerBonus: Number(a.passive?.animatePowerBonus) || 0,
      // Both players treat both cemeteries as their own while this applies.
      swapCemeteries: !!a.passive?.swapCemeteries,
      // Extra mana to interact with cemetery cards (cast one, or use an
      // ability that targets one), and whom it taxes.
      cemeteryTax: Number(a.passive?.cemeteryTax) || 0,
      cemeteryTaxOn: CEMETERY_TAX_ON.includes(a.passive?.cemeteryTaxOn)
        ? a.passive.cemeteryTaxOn
        : 'everyone',
      // Mana delta on a cast (negative = cheaper) and what it applies to.
      costMod: Number(a.passive?.costMod) || 0,
      costOn: PASSIVE_COST_ON.includes(a.passive?.costOn) ? a.passive.costOn : 'own',
      // Spell kind a costOn 'spells' modifier applies to.
      costFilter: PASSIVE_COST_FILTERS.includes(a.passive?.costFilter)
        ? a.passive.costFilter
        : 'any',
      // Extra elemental affinity for the affected side's threshold. Grants
      // only -- clamped so hand-edited JSON can't dip below the base stat.
      affinity: {
        air: Math.max(0, Number(a.passive?.affinity?.air) || 0),
        earth: Math.max(0, Number(a.passive?.affinity?.earth) || 0),
        fire: Math.max(0, Number(a.passive?.affinity?.fire) || 0),
        water: Math.max(0, Number(a.passive?.affinity?.water) || 0),
      },
      // Restrictions on the affected cards.
      cantAttack: !!a.passive?.cantAttack,
      cantBeTargeted: !!a.passive?.cantBeTargeted,
      cantMove: !!a.passive?.cantMove,
      cantDefend: !!a.passive?.cantDefend,
    },

    // Passive-only: the passive applies only while this holds.
    // Passive: the passive applies only while this holds. Triggered: an
    // intervening "if", tested as it triggers and again as it resolves.
    condition: normalizeCondition(a.condition),
    trigger: {
      action: a.trigger?.action || 'move',
      from: a.trigger?.from || 'any',
      to: a.trigger?.to || 'any',
      subject: a.trigger?.subject || 'self',
      // Older files had no role, and their damage triggers keyed off the damaged
      // card -- which is now the 'target' role -- so back-fill accordingly.
      role: TRIGGER_ROLES.includes(a.trigger?.role)
        ? a.trigger.role
        : a.trigger?.action === 'damage'
        ? 'target'
        : 'actor',
      // Card-kind and range restrictions on the subject (range measured from the
      // ability's owner), as for an ability's target.
      filter: TARGET_FILTERS.includes(a.trigger?.filter) ? a.trigger.filter : 'any',
      within: TARGET_WITHIN.includes(a.trigger?.within) ? a.trigger.within : 'any',
      targets: TRIGGER_TARGET_REFS.includes(a.trigger?.targets) ? a.trigger.targets : 'subject',
    },
    cost: {
      mana: Number(a.cost?.mana) || 0,
      tap: !!a.cost?.tap,
      // Extra costs paid on activation (activated abilities): sacrifice this
      // card or the chosen target, discard / banish-from-cemetery N cards (the
      // first ones -- there is no choice UI for costs yet), pay N life.
      sacrifice: SACRIFICE_COSTS.includes(a.cost?.sacrifice) ? a.cost.sacrifice : 'none',
      discard: Math.max(0, Number(a.cost?.discard) || 0),
      life: Math.max(0, Number(a.cost?.life) || 0),
      banish: Math.max(0, Number(a.cost?.banish) || 0),
      // Activations allowed per turn; 0 = unlimited. A puzzle is one turn, so
      // this is per attempt.
      perTurn: Math.max(0, Number(a.cost?.perTurn) || 0),
      // Elemental threshold required (checked, not spent) -- used by spell casts.
      threshold: {
        air: Number(a.cost?.threshold?.air) || 0,
        earth: Number(a.cost?.threshold?.earth) || 0,
        fire: Number(a.cost?.threshold?.fire) || 0,
        water: Number(a.cost?.threshold?.water) || 0,
      },
    },
    target: {
      required: !!a.target?.required,
      // Optional ("may"): the player can decline the target. Its target effects
      // are then skipped while the ability's other effects still resolve -- e.g.
      // "you may give a minion +2 power. Draw a card." always draws.
      optional: !!a.target?.optional,
      // 'card' = pick a card in a zone; 'grid' = a location/area on the realm.
      mode: a.target?.mode === 'grid' ? 'grid' : 'card',
      from: a.target?.from || 'realm',
      filter: a.target?.filter || 'any',
      // card-mode restrictions: relative to the source and by side.
      within: TARGET_WITHIN.includes(a.target?.within) ? a.target.within : 'any',
      side: TARGET_SIDES.includes(a.target?.side) ? a.target.side : 'any',
      // grid-mode: where the area starts, how far you may aim, its shape, and
      // whether it punches through both layers (square-based) or just the
      // source's layer.
      origin: a.target?.origin === 'pick' ? 'pick' : 'self',
      range: Number(a.target?.range) || 0,
      shape: ['location', 'adjacent', 'nearby'].includes(a.target?.shape)
        ? a.target.shape
        : 'location',
      throughLayers: !!a.target?.throughLayers,
      prompt: a.target?.prompt || '',
      // Card mode, activated: how many different cards to pick (e.g. "banish
      // three spells from your cemetery").
      count: Math.max(1, Number(a.target?.count) || 1),
      // With `count` > 1: "up to" that many -- the player may stop early.
      upTo: !!a.target?.upTo,
      // Projectile targets: who fires it (see TARGET_SHOOTERS).
      shooter: TARGET_SHOOTERS.includes(a.target?.shooter) ? a.target.shooter : 'source',
    },
    effects: Array.isArray(a.effects) ? a.effects.map(normalizeEffect) : [],
    loseWhen: loseConditions(a.loseWhen),
    // Modal ("choose one..."): only saved when the ability has modes.
    ...(Array.isArray(a.modes) && a.modes.length
      ? {
          modes: a.modes.map(normalizeMode),
          chooseCount: Math.min(Math.max(1, Number(a.chooseCount) || 1), a.modes.length),
        }
      : {}),
  }
}

// ---------- modes ----------

// A modal ability ("choose one: ...") carries `modes: [{ name, target, effects }]`
// and `chooseCount`. The player picks that many modes before targeting; the
// ability then resolves as its *view* for those modes -- the chosen modes'
// effects (in mode order) followed by the ability's own effects, targeting with
// the first chosen mode that needs a pick (else the first chosen mode's target).
// Several chosen modes therefore share one target pick. When chooseCount covers
// every mode there is nothing to choose and all of them resolve.
export const hasModes = (a) => Array.isArray(a?.modes) && a.modes.length > 0
export const modeChoiceCount = (a) =>
  hasModes(a) ? Math.min(Math.max(1, Number(a.chooseCount) || 1), a.modes.length) : 0
export const needsModeChoice = (a) => hasModes(a) && modeChoiceCount(a) < a.modes.length

const targetNeedsPick = (t) =>
  !!t && ((t.mode === 'grid' && t.origin === 'pick') || (t.mode === 'card' && t.required))

// Canonical mode list: valid indices, deduped, sorted.
export function cleanModes(ability, modes) {
  const n = ability.modes.length
  return [...new Set((modes || []).map(Number))]
    .filter((i) => i >= 0 && i < n)
    .sort((a, b) => a - b)
}

// The ability as it resolves for a set of chosen modes (see above). An ability
// without modes is returned unchanged. With `modes` omitted, an ability whose
// modes need no choice resolves all of them.
export function abilityView(ability, modes) {
  if (!hasModes(ability)) return ability
  const all = ability.modes.map((_, i) => i)
  const picked = cleanModes(ability, modes ?? (needsModeChoice(ability) ? [] : all))
  const chosen = picked.map((i) => ability.modes[i])
  // A mode that doesn't aim anywhere of its own ("strike it" / "don't") leaves
  // the ability's own target in charge when that one needs a pick.
  const aim =
    chosen.find((m) => targetNeedsPick(m.target)) ||
    (targetNeedsPick(ability.target) ? null : chosen[0])
  return {
    ...ability,
    target: aim ? aim.target : ability.target,
    effects: [...chosen.flatMap((m) => m.effects || []), ...(ability.effects || [])],
    modes: [],
    chosenModes: picked,
  }
}

function normalizeMode(m = {}, i = 0) {
  return {
    name: m.name || `Mode ${i + 1}`,
    target: normalizeAbility({ kind: 'activated', target: m.target }).target,
    effects: Array.isArray(m.effects) ? m.effects.map(normalizeEffect) : [],
  }
}

export function addMode(ability) {
  if (!Array.isArray(ability.modes)) ability.modes = []
  ability.modes.push(normalizeMode({}, ability.modes.length))
  if (!ability.chooseCount) ability.chooseCount = 1
}

export function removeMode(ability, i) {
  ability.modes.splice(i, 1)
  if (!ability.modes.length) {
    delete ability.modes
    delete ability.chooseCount
  } else ability.chooseCount = Math.min(ability.chooseCount || 1, ability.modes.length)
}

// ---------- presets ----------

// A trigger's full default shape; presets override parts of it.
const TRIGGER_BASE = {
  action: 'move',
  from: 'any',
  to: 'any',
  subject: 'self',
  role: 'actor',
  filter: 'any',
  within: 'any',
  targets: 'subject',
}
// The common triggers, named as the rulebook / card text words them. Picking one
// fills in the raw trigger fields (still editable under "advanced").
export const TRIGGER_PRESETS = {
  genesis: { label: 'Genesis — when this enters the realm', name: 'Genesis', trigger: { action: 'enter' } },
  deathrite: { label: 'Deathrite — when this dies', name: 'Deathrite', trigger: { action: 'death' } },
  attacked: {
    label: 'When this is attacked',
    trigger: { action: 'attack', role: 'target', targets: 'other' },
  },
  attacks: { label: 'When this attacks', trigger: { action: 'attack', targets: 'other' } },
  damaged: { label: 'When this takes damage', trigger: { action: 'damage', role: 'target' } },
  moves: { label: 'When this moves', trigger: { action: 'move', from: 'realm', to: 'realm' } },
  nearbyEnemyDies: {
    label: 'When a nearby enemy dies',
    trigger: { action: 'death', subject: 'enemy', within: 'nearby' },
  },
  allyDies: { label: 'When an ally dies', trigger: { action: 'death', subject: 'friendly' } },
  enemyEnters: {
    label: 'When an enemy enters the realm',
    trigger: { action: 'enter', subject: 'enemy' },
  },
}

// Which preset a trigger currently is, or 'custom'.
export function triggerPresetOf(trigger) {
  for (const [key, p] of Object.entries(TRIGGER_PRESETS)) {
    const full = { ...TRIGGER_BASE, ...p.trigger }
    if (Object.keys(full).every((k) => trigger[k] === full[k])) return key
  }
  return 'custom'
}

export function applyTriggerPreset(ability, key) {
  const p = TRIGGER_PRESETS[key]
  if (!p) return
  Object.assign(ability.trigger, TRIGGER_BASE, p.trigger)
  if (!ability.name) ability.name = p.name || ''
}

// The "+ add ability" menu: trigger presets, then activated and passive starts.
export const ABILITY_STARTERS = [
  ...Object.entries(TRIGGER_PRESETS).map(([key, p]) => ({ key, kind: 'triggered', label: p.label })),
  { key: 'triggered', kind: 'triggered', label: 'Other trigger (custom)…' },
  { key: 'tap', kind: 'activated', label: 'Tap: … (activated)' },
  { key: 'activated', kind: 'activated', label: 'Activated, other cost…' },
  { key: 'passive', kind: 'passive', label: 'Passive — always on while in play' },
]

export function addAbility(cardId, kind = 'activated', preset = null) {
  const card = state.cards[cardId]
  if (!card) return
  if (!Array.isArray(card.abilities)) card.abilities = []
  const ability = normalizeAbility({ kind })
  if (kind === 'triggered' && preset) applyTriggerPreset(ability, preset)
  if (kind === 'activated' && preset === 'tap') ability.cost.tap = true
  card.abilities.push(ability)
  return ability.id
}

// Point a triggered ability's effects at a player-picked target (or back at the
// trigger's cards). Turning the pick off hands `target` effects back to the
// card the trigger names, as a load would.
export function setTriggerPick(ability, on) {
  ability.target.required = !!on
  if (!on) pointTriggerRefs(ability)
}

export function removeAbility(cardId, abilityId) {
  const card = state.cards[cardId]
  if (!Array.isArray(card?.abilities)) return
  card.abilities = card.abilities.filter((a) => a.id !== abilityId)
}

// Toggle membership of a category in an ability's `zones` list -- the editor's
// "where is it usable" checkboxes.
export function toggleAbilityZone(ability, category) {
  const i = ability.zones.indexOf(category)
  if (i === -1) ability.zones.push(category)
  else ability.zones.splice(i, 1)
}

// Toggle a keyword in a passive ability's granted-keyword list.
export function togglePassiveKeyword(ability, keyword) {
  const list = ability.passive.keywords
  const i = list.indexOf(keyword)
  if (i === -1) list.push(keyword)
  else list.splice(i, 1)
}

// A fresh effect of the given op, with the params that op reads defaulted.
function newEffect(op = 'adjustStat') {
  const e = { op }
  if (op === 'adjustStat') Object.assign(e, { side: 'self', key: 'mana', delta: 0 })
  if (op === 'tap') e.who = 'self'
  if (op === 'dealDamage') Object.assign(e, { who: 'target', amount: 1, amountRef: 'literal' })
  if (op === 'strike') e.who = 'target'
  if (op === 'modifyStrength') Object.assign(e, { who: 'target', amount: 1, amountRef: 'literal' })
  if (op === 'grantKeyword') Object.assign(e, { who: 'target', keyword: 'airborne' })
  if (op === 'move')
    Object.assign(e, {
      who: 'target',
      to: 'sourceLocation',
      kind: 'teleport',
      reach: 'nearby',
      crossRegions: true,
    })
  if (op === 'summonToken')
    Object.assign(e, { token: 'soldier', count: 1, at: 'selfSurface', side: 'self', power: 1 })
  if (op === 'destroy' || op === 'banish' || op === 'bounce') e.who = 'target'
  if (op === 'heal') e.who = 'self'
  if (op === 'banishAndCast') Object.assign(e, { who: 'target', free: false })
  if (op === 'grantFrom') e.releaseTo = 'origin'
  if (op === 'animate')
    Object.assign(e, {
      who: 'target',
      power: 1,
      powerRef: 'literal',
      powerBonus: 0,
      duration: 'permanent',
    })
  // Flood/unflood a site: whose square, and whether the whole connected body of
  // water is drained (unflood) rather than the single targeted site.
  if (op === 'flood' || op === 'unflood') Object.assign(e, { who: 'target', scope: 'site' })
  if (op === 'untap') e.who = 'self'
  if (op === 'draw') Object.assign(e, { side: 'self', count: 1, deck: 'spellbook' })
  if (op === 'discard') Object.assign(e, { who: 'target', pick: 'chosen', side: 'enemy', count: 1 })
  if (op === 'search') Object.assign(e, { side: 'self', deck: 'spellbook', filter: 'any' })
  if (op === 'reanimate' || op === 'gainControl' || op === 'swap')
    e.who = 'target'
  if (op === 'addCounter' || op === 'removeCounter')
    Object.assign(e, { who: 'self', name: 'charge', amount: 1, amountRef: 'literal' })
  if (op === 'preventDamage') Object.assign(e, { who: 'self', amount: 1, amountRef: 'literal' })
  return normalizeEffect(e)
}

export function addEffect(ability, op = 'adjustStat') {
  if (!Array.isArray(ability.effects)) ability.effects = []
  ability.effects.push(newEffect(op))
  pointTriggerRefs(ability)
}

export function removeEffect(ability, i) {
  ability.effects.splice(i, 1)
}

// An area selector's shape, with defaults.
// `includeSelf` (the source counts too) is only saved while set.
export function normalizeArea(a = {}) {
  const out = {
    shape: AREA_SHAPES.includes(a.shape) ? a.shape : 'nearby',
    filter: TARGET_FILTERS.includes(a.filter) ? a.filter : 'unit',
    side: TARGET_SIDES.includes(a.side) ? a.side : 'enemy',
  }
  if (a.includeSelf) out.includeSelf = true
  return out
}

// A selector's shape: `who`, plus `avatarSide` / `area` only when that `who`
// reads them (so saved effects stay small).
function normalizeSelector(s = {}, fallbackWho = 'self') {
  const who = EFFECT_WHO.includes(s.who) ? s.who : fallbackWho
  const out = { who }
  if (who === 'avatar') out.avatarSide = s.avatarSide === 'enemy' ? 'enemy' : 'self'
  if (who === 'area') out.area = normalizeArea(s.area)
  return out
}

// Point a selector (an effect, or its countOf) at another `who` in the editor,
// filling in the params that `who` reads.
export function setSelectorWho(sel, who) {
  const next = normalizeSelector({ ...sel, who }, sel.who)
  delete sel.avatarSide
  delete sel.area
  Object.assign(sel, next)
}

// Switch an effect's amount source in the editor; a count needs its selector.
export function setAmountRef(eff, ref) {
  eff.amountRef = AMOUNT_REFS.includes(ref) ? ref : 'literal'
  const counted = eff.amountRef === 'count' || eff.amountRef === 'counter'
  if (counted && !eff.countOf)
    eff.countOf = normalizeSelector({ who: 'area', area: { side: 'friendly', filter: 'minion' } }, 'area')
  if (eff.amountRef === 'counter' && !eff.counterName) eff.counterName = 'charge'
}

// Back-fill params added to an op after puzzles were saved with it, so older
// files load with sensible defaults. A move saved before kinds existed keeps its
// old behavior: a teleport that goes anywhere.
function normalizeEffect(eff) {
  const e = clone(eff)
  // Resolve only if `condition` holds, else run the `else` effects instead.
  // Only saved while the effect has a condition.
  if (e.condition && (e.condition.type || 'always') !== 'always') {
    e.condition = normalizeCondition(e.condition)
    e.else = Array.isArray(e.else) ? e.else.map(normalizeEffect) : []
  } else {
    delete e.condition
    delete e.else
  }
  // A missing `who` has always resolved to the activator (effectSubject treated
  // anything but 'target' as self), so that is what an old file keeps.
  if (WHO_OPS.has(e.op)) {
    const sel = normalizeSelector(e, 'self')
    if (!('avatarSide' in sel)) delete e.avatarSide
    if (!('area' in sel)) delete e.area
    Object.assign(e, sel)
  }
  if (AMOUNT_OPS.has(e.op)) {
    if (!AMOUNT_REFS.includes(e.amountRef)) e.amountRef = 'literal'
    if (e.amountRef === 'count' || e.amountRef === 'counter')
      e.countOf = normalizeSelector(e.countOf || { who: 'area', area: { side: 'friendly', filter: 'minion' } }, 'area')
    else delete e.countOf
    if (e.amountRef === 'counter') e.counterName = String(e.counterName || 'charge')
    else delete e.counterName
  }
  if (e.op === 'draw' || e.op === 'search') {
    e.side = EFFECT_SIDES.includes(e.side) ? e.side : 'self'
    e.deck = DECKS.includes(e.deck) ? e.deck : 'spellbook'
  }
  if (e.op === 'draw') e.count = Math.max(1, Number(e.count) || 1)
  if (e.op === 'search') e.filter = TARGET_FILTERS.includes(e.filter) ? e.filter : 'any'
  if (e.op === 'discard') {
    e.pick = DISCARD_PICKS.includes(e.pick) ? e.pick : 'chosen'
    e.side = EFFECT_SIDES.includes(e.side) ? e.side : 'enemy'
    e.count = Math.max(1, Number(e.count) || 1)
  }
  if (e.op === 'reanimate') e.reach = REANIMATE_REACH.includes(e.reach) ? e.reach : 'any'
  // The source strikes unless `by: shooter`; left implicit so older files are
  // unchanged.
  if (e.op === 'strike' && e.by !== 'shooter') delete e.by
  if (e.op === 'grantFrom') e.releaseTo = GRANT_RELEASE.includes(e.releaseTo) ? e.releaseTo : 'origin'
  if (e.op === 'addCounter' || e.op === 'removeCounter') e.name = String(e.name || 'charge')
  if (e.op === 'animate') {
    if (!ANIMATE_POWER_REFS.includes(e.powerRef)) e.powerRef = 'literal'
    e.powerBonus = Number(e.powerBonus) || 0
    if (!ANIMATE_DURATIONS.includes(e.duration)) e.duration = 'permanent'
  }
  if (e.op === 'move') {
    if (!MOVE_KINDS.includes(e.kind)) e.kind = 'teleport'
    if (!MOVE_REACH.includes(e.reach)) e.reach = 'nearby'
    if (typeof e.crossRegions !== 'boolean') e.crossRegions = e.kind === 'teleport'
  }
  if (e.op === 'summonToken') {
    if (!TOKEN_KINDS.includes(e.token)) e.token = 'soldier'
    if (!tokenLocationsFor(e.token).includes(e.at)) e.at = tokenLocationsFor(e.token)[0]
    e.count = Math.max(1, Number(e.count) || 1)
    e.side = e.side === 'enemy' ? 'enemy' : 'self'
    e.power = e.power == null ? 1 : Number(e.power) || 0
  }
  return e
}

// Switching a move between teleport and other forced movement resets whether it
// may change region to that kind's rule.
export function setMoveKind(eff, kind) {
  eff.kind = kind
  eff.crossRegions = kind === 'teleport'
}

// Switching token kind keeps the location only if the new kind supports it.
export function setTokenKind(eff, kind) {
  eff.token = kind
  const ok = tokenLocationsFor(kind)
  if (!ok.includes(eff.at)) eff.at = ok[0]
}

// Re-default an effect's params when its op changes in the editor, so a stale
// param from the previous op doesn't linger.
export function retypeEffect(ability, i, op) {
  ability.effects.splice(i, 1, newEffect(op))
  pointTriggerRefs(ability)
}

// ---------- damage counters ----------

export function damageOf(cardId) {
  return state.damage?.[cardId] || 0
}

export function adjustDamage(cardId, delta) {
  const next = Math.max(0, damageOf(cardId) + delta)
  if (next) state.damage[cardId] = next
  else delete state.damage[cardId]
}

// Every dragstart in the app goes through here: it arms the drag flag the
// board reads to decide whether its zones are listening, then sets the ghost.
// Callers set the card payload before calling, and dragstart is the one moment
// the payload is readable, so the dragged card is picked up from it here.
export function beginDrag(e, imgEl, width) {
  ui.dragging = true
  try {
    ui.dragCard = JSON.parse(e.dataTransfer.getData('text/plain')).cardId || null
  } catch {
    ui.dragCard = null
  }
  setDragGhost(e, imgEl, width)
}

export function endDrag() {
  ui.dragging = false
  ui.dragCard = null
}

// Use the card's artwork as the drag image: the default ghost is a snapshot
// of the element, which is invisible for the site handle and gets clipped by
// the cell's overflow for board cards. Drawn onto a fixed-size canvas from an
// already-rendered <img>, because a freshly created img may not be decoded at
// dragstart and would fall back to its huge natural size.
export function setDragGhost(e, imgEl, width = 90) {
  if (!imgEl?.naturalWidth) return
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
