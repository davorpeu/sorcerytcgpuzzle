// Store module: board. Zone labels and categories, regions, passive traits,
// global passives, oversized minions, movement/attack reach, line of fire,
// projectiles and combat resolution. Part of the store split: import from
// src/store.js, never from this file directly.

import { computed } from 'vue'
import { removeFromZones } from '../store.js'
import {
  ELEMENTS,
  GRID_COLS,
  GRID_ROWS,
  GRID_SIZE,
  INTERSECTIONS,
  INTERSECTION_COLS,
  INTERSECTION_ROWS,
  clone,
  state,
  ui,
  uid,
  zoneOf,
} from './state.js'
import { cardZoneCategory, damageOf, normalizeArea, sendToCemetery } from './counters.js'
import {
  areAdjacent,
  areNearby,
  carrierOf,
  engageCrossings,
  inRealm,
  routeZone,
  shedInPlayState,
} from './moves.js'
import { matchesFilter, satisfiesTarget } from './abilities.js'
import { checkSurvival, effectMove, otherSide, selectCards, snapshotStructural } from './effects.js'
import { canCast, effectiveThreshold, inPlayCards, legalSummonLocation } from './mana.js'
import { isAvatar, isUnit } from './session.js'

const FIXED_ZONE_LABELS = {
  'hand:player': 'Player hand',
  'hand:opponent': 'Opponent hand',
  'grave:player': 'Player cemetery',
  'grave:opponent': 'Opponent cemetery',
  'collection:player': 'Player collection',
  'collection:opponent': 'Opponent collection',
  'banished:player': 'Player banished',
  'banished:opponent': 'Opponent banished',
  'atlas:player': 'Your Atlas',
  'atlas:opponent': 'Opponent Atlas',
  'spellbook:player': 'Your Spellbook',
  'spellbook:opponent': 'Opponent Spellbook',
  storyline: 'Storyline',
  pool: 'Card pool',
}

export function zoneLabel(zone) {
  if (FIXED_ZONE_LABELS[zone]) return FIXED_ZONE_LABELS[zone]
  let m = /^site:(\d+)$/.exec(zone)
  if (m) return `${squareLabel(m[1])} (site)`
  m = /^cell:(\d+):top$/.exec(zone)
  if (m) return `${squareLabel(m[1])} (surface)`
  m = /^cell:(\d+):bot$/.exec(zone)
  if (m)
    return `${squareLabel(m[1])} (${
      regionOf(Number(m[1]), 'bot') === 'underwater' ? 'submerged' : 'buried'
    })`
  m = /^cell:(\d+)$/.exec(zone)
  if (m) return squareLabel(m[1])
  m = /^aura:(\d+)$/.exec(zone)
  if (m) return intersectionLabel(m[1])
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

// ---------- abilities (data model) ----------

// The board has many raw zone ids (site:7, cell:12:bot, aura:3, hand:player…).
// Abilities are authored against these coarse *categories* instead, so a
// condition like "onto the storyline" or "from the realm" holds whatever square
// or side is involved. Returns null for an unknown zone (or a carried card,
// which has no zone of its own).
export function zoneCategory(zoneId) {
  if (!zoneId) return null
  if (zoneId === 'storyline') return 'storyline'
  if (zoneId === 'pool') return 'pool'
  if (zoneId.startsWith('hand:')) return 'hand'
  if (zoneId.startsWith('grave:')) return 'cemetery'
  if (zoneId.startsWith('collection:')) return 'collection'
  if (zoneId.startsWith('banished:')) return 'banished'
  if (zoneId.startsWith('atlas:')) return 'atlas'
  if (zoneId.startsWith('spellbook:')) return 'spellbook'
  if (zoneId.startsWith('aura:')) return 'aura'
  if (zoneId.startsWith('site:') || zoneId.startsWith('cell:')) return 'realm'
  return null
}

// ---------- regions ----------

// The four realm regions. Which one a board slot is depends entirely on the site
// (if any) sitting on that square, so region is derived, never stored.
export const REGIONS = ['surface', 'underground', 'underwater', 'void']

// The site card occupying a square, or null.
export function siteOn(square) {
  const id = state.zones[`site:${square}`]?.[0]
  return id ? state.cards[id] : null
}

// A site's water type is derived from its authored threshold, the transient
// Flood state, and any passive ability of its own that grants water affinity.
// Other elemental thresholds do not turn off water; the presence of a positive
// water affinity is enough. A granted affinity is an ability, so silencing the
// site takes it -- and with it the water -- away; its printed affinity stays.
export function isWaterSite(square) {
  const site = siteOn(square)
  if (!site) return false
  if (Number(site.affinity?.water) > 0 || !!state.floodedSites[String(square)]) return true
  return grantsWater(site)
}

// Guards: a passive's own condition may ask whether its site is water (onWater),
// and silence is derived from passives whose reach can depend on regions -- so
// while the passive traits are being resolved (resolvingPassives) silence isn't
// consulted, and a site's water grant never re-enters itself.
let resolvingPassives = false
const resolvingWater = new Set()
function grantsWater(site) {
  if (resolvingWater.has(site.id)) return false
  resolvingWater.add(site.id)
  try {
    if (!passivesOf(site).some((a) => Number(a.passive?.affinity?.water) > 0)) return false
    return resolvingPassives || !isSilenced(site.id)
  } finally {
    resolvingWater.delete(site.id)
  }
}

export function isLandSite(square) {
  return !!siteOn(square) && !isWaterSite(square)
}

export function isFloodedSite(square) {
  return !!siteOn(square) && !!state.floodedSites[String(square)]
}

// Change the reversible site state and immediately apply state-based survival.
// Ability entries pass their own snapshot; direct setup changes get a small
// synthetic transition so the same survival rules and death events are used.
export function setFloodedSite(square, flooded, entry = null) {
  const site = siteOn(square)
  const n = Number(square)
  if (!site || !Number.isInteger(n) || n < 0 || n >= GRID_SIZE) return false
  const key = String(n)
  const next = !!flooded
  const previous = !!state.floodedSites[key]
  if (previous === next) return false
  const before = clone(state.floodedSites)
  if (next) state.floodedSites[key] = true
  else delete state.floodedSites[key]
  // Survival only bites while a solution is played or recorded. The editor
  // stays free-form, so toggling water while building a position never sweeps
  // units off to the cemetery. An effect-driven change (with its own entry)
  // always resolves survival, since it only happens during play anyway.
  if (entry || enforcing()) {
    const transition = entry || { type: 'flood', square: n, flooded: next }
    if (!transition.prevFloodedSites) transition.prevFloodedSites = before
    checkSurvival(transition)
  }
  return true
}

// The square a site card currently sits on, or null if it is not on the board.
export function squareOfSite(cardId) {
  const m = /^site:(\d+)$/.exec(zoneOf(cardId) || '')
  return m ? Number(m[1]) : null
}

// On-board orthogonal neighbours (up/down/left/right) of a grid square. Diagonals
// are deliberately excluded: a body of water is connected cardinally only.
function orthogonalSquares(square) {
  const n = Number(square)
  const row = Math.floor(n / GRID_COLS)
  const col = n % GRID_COLS
  const out = []
  if (row > 0) out.push(n - GRID_COLS)
  if (row < GRID_ROWS - 1) out.push(n + GRID_COLS)
  if (col > 0) out.push(n - 1)
  if (col < GRID_COLS - 1) out.push(n + 1)
  return out
}

// The body of water a square belongs to: the maximal set of orthogonally
// connected water sites reachable from it (flood-fill, cardinal steps only).
// Returns null when the square itself is not a water site. `sites`/`squares`
// are the member square indices (ascending) and `size` their count -- enough for
// an ability to target the connected set, its area, or scale off its size.
export function waterBodyAt(square) {
  const n = Number(square)
  if (!isWaterSite(n)) return null
  const seen = new Set([n])
  const stack = [n]
  while (stack.length) {
    const cur = stack.pop()
    for (const nb of orthogonalSquares(cur)) {
      if (!seen.has(nb) && isWaterSite(nb)) {
        seen.add(nb)
        stack.push(nb)
      }
    }
  }
  const sites = [...seen].sort((a, b) => a - b)
  return { sites, squares: sites, size: sites.length }
}

// How large the body of water at a square is (0 if it is not water).
export const waterBodySizeAt = (square) => waterBodyAt(square)?.size || 0

// The side that controls the site on a square (its owner), or null with no site.
// A minion may not be summoned onto a site the opponent controls unless its card
// explicitly allows it.
function siteControllerSide(square) {
  const site = siteOn(square)
  return site ? (site.enemy ? 'opponent' : 'player') : null
}

// Whether a minion may be cast onto a board location given site control. Only
// minions are gated; avatars, artifacts, auras, and magic use their own paths.
// An open square (no site) or one you control is always fine; an opponent's site
// needs the `summonOnEnemySites` trait, which comes from a passive ability (the
// card's own, or one day an aura lending it to other cards) via `effective`.
export function canCastMinionTo(cardId, zone) {
  const card = state.cards[cardId]
  if (!card || !card.unit || card.avatar) return true
  const m = /^cell:(\d+):(top|bot)$/.exec(routeZone(cardId, zone) || '')
  if (!m) return true
  const owner = siteControllerSide(Number(m[1]))
  if (!owner) return true
  const casterSide = card.enemy ? 'opponent' : 'player'
  if (owner === casterSide) return true
  return canSummonOnEnemySites(cardId)
}

// Region of a square's surface / below slot:
//   surface slot  -> 'surface' with a site, else 'void' (open air over the square)
//   below slot    -> 'underwater' on a water site, 'underground' on a land site,
//                    and nothing at all with no site (you can't go below the void)
export function regionOf(square, layer) {
  const site = siteOn(square)
  if (layer === 'top' || layer === 'surface') return site ? 'surface' : 'void'
  if (layer === 'bot' || layer === 'below') {
    // No site means no subsurface at all -- you can't go below the open void.
    if (!site) return null
    return isWaterSite(square) ? 'underwater' : 'underground'
  }
  return null
}

// Region of a raw board zone id (cell:N:top / cell:N:bot). Null for off-board
// zones and for a below slot on a square with no site.
export function zoneRegion(zoneId) {
  const m = /^cell:(\d+):(top|bot)$/.exec(zoneId || '')
  return m ? regionOf(Number(m[1]), m[2]) : null
}

// ---------- passive abilities: the effective traits map ----------

// Units physically standing on the board, tagged with square, layer and region.
export function boardUnits() {
  const out = []
  for (let i = 0; i < GRID_SIZE; i++) {
    for (const layer of ['top', 'bot']) {
      for (const id of state.zones[`cell:${i}:${layer}`] || []) {
        const c = state.cards[id]
        if (c && isUnit(c)) {
          out.push({ id, card: c, square: i, region: regionOf(i, layer) })
        }
      }
    }
  }
  // Oversized units: anchored on their top-left square, with all four listed.
  for (let i = 0; i < INTERSECTIONS; i++) {
    for (const id of state.zones[`aura:${i}`] || []) {
      if (!isOversized(id)) continue
      const squares = intersectionSquares(i)
      out.push({ id, card: state.cards[id], square: squares[0], squares, region: 'surface' })
    }
  }
  return out
}

// Where a card sits, resolved to a { square, region }, or null if not on a cell.
function unitCell(cardId) {
  const big = oversizedAt(cardId)
  if (big != null) {
    const squares = intersectionSquares(big)
    return { square: squares[0], squares, region: 'surface' }
  }
  const m = /^cell:(\d+):(top|bot)$/.exec(zoneOf(cardId) || '')
  if (!m) return null
  return { square: Number(m[1]), region: regionOf(Number(m[1]), m[2]) }
}

// A card's authored abilities, including those it has gained. A grant (an
// assumed form) hands every ability of the granted card to its carrier: the
// carrier holds its triggers, activated abilities and passives, and the granted
// card -- carried only so the player can see what was gained -- holds none of
// its own. The basics every unit/avatar has (move, attack, draw) aren't
// authored abilities, so they never double up.
export function abilitiesOf(cardId) {
  if (state.grants[cardId]) return []
  const out = [...(state.cards[cardId]?.abilities || [])]
  const seen = new Set([cardId])
  const walk = (id) => {
    for (const t of Object.keys(state.grants)) {
      if (state.grants[t].carrierId !== id || seen.has(t)) continue
      seen.add(t)
      out.push(...(state.cards[t]?.abilities || []))
      walk(t)
    }
  }
  walk(cardId)
  return out
}

// A passive applies only while its condition holds (always, by default).
const passivesOf = (card) =>
  card
    ? abilitiesOf(card.id).filter(
        (a) => a.kind === 'passive' && passiveConditionMet(card.id, a.condition)
      )
    : []

// Is a passive's "only while" condition true for its source right now? Reads
// only the raw board and stats -- never `effective` or a passive animation --
// so evaluating it can't feed back into the traits it switches on (see
// conditionHolds, `raw`).
function passiveConditionMet(sourceId, cond) {
  return conditionHolds(cond, { sourceId, raw: true })
}

// The card a condition's `subject` names in this context: the ability's own
// card (default), its first chosen target, or the card that set a trigger off.
function conditionSubject(cond, ctx) {
  if (cond.subject === 'target') return ctx.targetId ?? null
  if (cond.subject === 'triggering') return ctx.triggeringId ?? null
  if (cond.subject === 'other') return ctx.otherId ?? null
  return ctx.sourceId ?? null
}

// Does a condition hold? `ctx` is { sourceId, targetId, triggeringId, ... } --
// the same shape selectors read. With `raw` (a passive's condition, evaluated
// while the passive traits themselves are being derived) it reads only the raw
// board and stats: a keyword counts only if the card has it itself (its own
// unconditional passives, or gained in play), affinity is the stats plus what
// cards in play provide, and card kinds ignore passive animation.
export function conditionHolds(cond, ctx) {
  const type = cond?.type || 'always'
  if (type === 'always') return true
  const v = testCondition(cond, ctx)
  return cond.not ? !v : v
}

function testCondition(cond, ctx) {
  const type = cond.type
  if (type === 'all') return (cond.of || []).every((c) => conditionHolds(c, ctx))
  if (type === 'any') return (cond.of || []).some((c) => conditionHolds(c, ctx))
  const sourceId = ctx.sourceId
  const card = state.cards[sourceId]
  if (!card) return false
  const n = Number(cond.amount) || 0
  const own = sideOf(sourceId)
  const side = cond.whose === 'enemy' ? otherSide(own) : own
  const stats = state.stats[side] || {}
  if (type === 'lifeAtMost') return (stats.life || 0) <= n
  if (type === 'lifeAtLeast') return (stats.life || 0) >= n
  if (type === 'manaAtLeast') return (stats.mana || 0) >= n
  if (type === 'affinityAtLeast') {
    const el = cond.element || 'fire'
    return (ctx.raw ? rawThreshold(side, el) : effectiveThreshold(side, el)) >= n
  }
  if (type === 'controlsCard') {
    const sel = cond.selector || { who: 'area', area: normalizeArea({ shape: 'realm', side: 'friendly', filter: 'minion' }) }
    return selectCards(sel, ctx).length >= Math.max(1, n)
  }
  const id = conditionSubject(cond, ctx)
  if (!id || !state.cards[id]) return false
  if (type === 'untapped') return !state.tapped[id]
  if (type === 'tapped') return !!state.tapped[id]
  if (type === 'damaged') return damageOf(id) > 0
  if (type === 'hasKeyword')
    return ctx.raw ? ownKeywords(id).has(cond.keyword) : hasKeyword(id, cond.keyword)
  if (type === 'region') return regionOfCard(id) === cond.region
  // The rest look at where the card stands on the board.
  if (state.carry[id]) return false
  const node = nodeOf(id)
  if (!node) return false
  if (type === 'onWater') return isWaterSite(node.sq)
  if (type === 'onLand') return isLandSite(node.sq)
  if (type === 'onFlooded') return isFloodedSite(node.sq)
  return true
}

// Keywords a card has of itself, read raw: its own unconditional self
// passives and keywords gained in play (not those lent by other cards).
function ownKeywords(id) {
  const out = new Set(state.grantedKeywords[id] || [])
  for (const a of abilitiesOf(id)) {
    if (a.kind !== 'passive' || a.scope !== 'self' || (a.condition?.type || 'always') !== 'always') continue
    for (const k of a.passive?.keywords || []) out.add(k)
  }
  return out
}

// A side's threshold read raw: its stat plus what its cards in play provide
// (a site animated into a minion provides nothing).
function rawThreshold(side, el) {
  let sum = state.stats[side]?.[el] || 0
  for (const id of inPlayCards(side)) {
    if (state.cards[id].site && state.animated[id]) continue
    sum += Number(state.cards[id].affinity?.[el]) || 0
  }
  return sum
}

// A card's region: a unit's cell region, a site's (or an oversized minion's)
// surface; a carried card its bearer's (zoneOf resolves carry).
function regionOfCard(id) {
  const z = zoneOf(id) || ''
  if (/^(site|aura):\d+$/.test(z)) return 'surface'
  return zoneRegion(z)
}

// A card-kind filter read raw (a unit is printed as one or animated by an
// effect), for conditions evaluated inside the passive computation.
export function rawMatchesFilter(id, filter) {
  const c = state.cards[id]
  if (!c) return false
  const unit = !!(c.unit || c.avatar || state.animated[id])
  if (filter === 'unit') return unit
  if (filter === 'minion') return unit && !c.avatar
  return matchesFilter(c, filter)
}

// Non-units a self-scoped "animate" passive currently makes into minions:
// cardId -> { power }. Only a card standing on a realm square (not carried, not
// a site) can be animated, and only while the passive's condition holds -- so a
// conditional animation switches on and off with the board, like any passive.
const passiveAnimated = computed(() => {
  const out = {}
  for (const c of Object.values(state.cards)) {
    // Sites animate only through an effect: leaving Rubble behind is a one-way
    // change a condition switching off couldn't undo.
    if (c.unit || c.avatar || c.site || state.carry[c.id]) continue
    const z = zoneOf(c.id) || ''
    if (!/^cell:\d+:(top|bot)$/.test(z) && !(c.aura && /^aura:\d+$/.test(z))) continue
    for (const a of c.abilities || []) {
      if (a.kind !== 'passive' || a.scope !== 'self' || !a.passive?.animate) continue
      if (!passiveConditionMet(c.id, a.condition)) continue
      out[c.id] = {
        power: Number(a.passive.animatePower) || 0,
        powerRef: a.passive.animatePowerRef,
        powerBonus: Number(a.passive.animatePowerBonus) || 0,
      }
      break
    }
  }
  return out
})

// Where an animated object's power comes from: a fixed number, or one of the
// card's own characteristics (plus a bonus), so "a minion with power equal to
// its mana cost" is authored once and follows the card.
export const ANIMATE_POWER_REFS = ['literal', 'manaCost', 'thresholdCost', 'totalCost']

export function animatedPower(cardId, spec) {
  const ref = spec?.powerRef || 'literal'
  if (ref === 'literal') return Math.max(0, Number(spec?.power) || 0)
  const cost = state.cards[cardId]?.spellCost || {}
  const mana = Number(cost.mana) || 0
  const threshold = ELEMENTS.reduce((n, el) => n + (Number(cost[el]) || 0), 0)
  const base = ref === 'manaCost' ? mana : ref === 'thresholdCost' ? threshold : mana + threshold
  return Math.max(0, base + (Number(spec?.powerBonus) || 0))
}

// A card's animation in force, from an effect or a passive, or null.
export function animationOf(cardId) {
  const a = state.animated?.[cardId]
  if (a && !animationExpired(cardId, a, false)) return a
  return passiveAnimated.value[cardId] || null
}

// How long an effect's animation lasts. Puzzles are a single turn, so there is
// no "until end of turn": that is simply 'permanent' (until it leaves the realm).
export const ANIMATE_DURATIONS = ['permanent', 'taps', 'damaged', 'sourceLeaves']

// Has an effect's animation run out? Checked live (so undo simply restores it),
// except 'damaged', which is settled only after deaths resolve: a hit big enough
// to kill it must kill it as a minion rather than first turning it back into an
// object that shrugs the damage off.
function animationExpired(cardId, a, includeDamage) {
  switch (a.duration) {
    case 'taps':
      return !a.tapped0 && !!state.tapped[cardId]
    case 'damaged':
      return includeDamage && (state.damage[cardId] || 0) > (a.damage0 || 0)
    case 'sourceLeaves': {
      if (!a.sourceId || a.sourceId === cardId) return false
      return !['realm', 'aura'].includes(zoneCategory(zoneOf(a.sourceId)))
    }
    default:
      return false
  }
}

// Tidy up animations that have run out, as a consequence of `entry`: announce
// it, and put an animated site back into a site slot -- its current square's if
// that is empty or only Rubble (which it replaces), else it goes to its
// cemetery, as a site can't stand on a square's surface. Undo rides the entry's
// prevAnimated / structural snapshots.
export function settleAnimations(entry) {
  for (const id of Object.keys(state.animated || {})) {
    const a = state.animated[id]
    if (!animationExpired(id, a, true)) continue
    delete state.animated[id]
    const c = state.cards[id]
    if (!c) continue
    let text = `${cardName(id)} is no longer animated.`
    const m = /^cell:(\d+):(top|bot)$/.exec(zoneOf(id) || '')
    if (c.site && m) {
      snapshotStructural(entry)
      removeFromZones(state.zones, id)
      const slot = `site:${m[1]}`
      const occupant = state.zones[slot][0]
      if (occupant && state.cards[occupant]?.token === 'rubble') {
        state.zones[slot].splice(0, 1)
      }
      if (!state.zones[slot].length) {
        state.zones[slot].push(id)
        text = `${cardName(id)} settles back into a site.`
      } else {
        const grave = `grave:${sideOf(id)}`
        state.zones[grave].push(id)
        shedInPlayState(id, grave, entry)
        text = `${cardName(id)} has no site to return to and goes to the cemetery.`
      }
    }
    state.events.push({ id: uid(), seq: entry?.seq, cardId: id, name: 'Animation ends', text })
  }
}
export const isAnimated = (cardId) => !!animationOf(cardId)

// ---------- global passives: swapped cemeteries, cemetery tax ----------

// Passives that apply from where their card is in play (realm, site slots,
// intersections), condition met and source not silenced: [{ card, a }].
function passivesInPlay() {
  const out = []
  for (const card of Object.values(state.cards)) {
    if (!['realm', 'aura'].includes(cardZoneCategory(card.id))) continue
    if (isSilenced(card.id)) continue
    for (const a of passivesOf(card)) out.push({ card, a })
  }
  return out
}

// "You consider your opponent's cemetery yours, and vice versa." A swap, not a
// share: each player's cemetery is the opponent's, and their own is not theirs.
export function cemeteriesSwapped() {
  return passivesInPlay().some(({ a }) => a.passive.swapCemeteries)
}

// Extra mana `side` pays to interact with a cemetery card right now.
export function cemeteryTaxFor(side) {
  let tax = 0
  for (const { card, a } of passivesInPlay()) {
    const n = Number(a.passive.cemeteryTax) || 0
    if (!n) continue
    const mine = sideOf(card.id) === side
    const on = a.passive.cemeteryTaxOn || 'everyone'
    if (on === 'everyone' || (on === 'you' && mine) || (on === 'opponent' && !mine)) tax += n
  }
  return tax
}

// Who casts this card from where it lies: a permit names its caster; with
// cemeteries swapped, a cemetery card belongs to the other side's "own"
// cemetery (the solver casts the opponent's graveyard cards, not their own);
// otherwise its controller.
export function castSide(cardId) {
  const permit = state.castPermits[cardId]
  if (permit) return permit.side
  if (cardZoneCategory(cardId) === 'cemetery' && cemeteriesSwapped())
    return sideOf(cardId) === 'player' ? 'opponent' : 'player'
  return sideOf(cardId)
}

// Hand a card to `side`, remembering the change so undo/reset can reverse it.
export function takeControl(cardId, side) {
  const c = state.cards[cardId]
  if (!c || sideOf(cardId) === side) return
  c.enemy = side === 'opponent'
  if (state.controlFlips[cardId]) delete state.controlFlips[cardId]
  else state.controlFlips[cardId] = true
}

// Bring control back in line with a snapshot of the flips map (undo).
export function restoreControlFlips(prev) {
  const ids = new Set([...Object.keys(state.controlFlips), ...Object.keys(prev || {})])
  for (const id of ids) {
    if (!!state.controlFlips[id] !== !!prev?.[id] && state.cards[id]) {
      state.cards[id].enemy = !state.cards[id].enemy
    }
  }
  state.controlFlips = clone(prev || {})
}
export const revertControlFlips = () => restoreControlFlips({})

// How many more times this card may activate this ability this turn (Infinity
// when unlimited). Counted from the logged moves, so undo gives a use back and
// a reset clears them all.
export function abilityUsesLeft(cardId, ability) {
  const limit = Number(ability?.cost?.perTurn) || 0
  if (!limit) return Infinity
  const list = state.recording ? state.draft : state.moves
  const used = list.filter(
    (m) => m.type === 'ability' && m.cardId === cardId && m.abilityId === ability.id
  ).length
  return Math.max(0, limit - used)
}

// Whether a card's side can pay an activated ability's mana (abilityManaCost)
// and meet its elemental threshold (checked, not spent) -- the same test a spell
// cast uses.
export function canAffordAbility(cardId, ability) {
  if (!ability) return false
  const side = sideOf(cardId)
  const s = state.stats[side]
  if (!s) return false
  if ((s.mana || 0) < abilityManaCost(cardId, ability)) return false
  for (const el of ELEMENTS)
    if (effectiveThreshold(side, el) < (Number(ability.cost?.threshold?.[el]) || 0)) return false
  const cost = ability.cost || {}
  if ((s.life || 0) < (Number(cost.life) || 0)) return false
  if (costCards(cardId, 'hand').length < (Number(cost.discard) || 0)) return false
  if (costCards(cardId, 'grave').length < (Number(cost.banish) || 0)) return false
  if (cost.sacrifice === 'self' && !sacrificeable(cardId, cardId)) return false
  if (cost.sacrifice === 'target') {
    const t = ability.target
    const any = Object.keys(state.cards).some(
      (id) => id !== cardId && sacrificeable(cardId, id) && (!t?.required || satisfiesTarget(cardId, id, t))
    )
    if (!any) return false
  }
  return true
}

// A card an ability of `sourceId` may sacrifice: a non-avatar in play on the
// source's side (the source itself, for a self-sacrifice).
export function sacrificeable(sourceId, id) {
  const c = state.cards[id]
  if (!c || c.avatar) return false
  if (!inPlay(id)) return false
  return !oppositeSides(sourceId, id)
}

// The cards a discard ('hand') or banish-from-cemetery ('grave') cost draws on,
// in the order they are paid: the source's side, first cards first (there is no
// choice UI for costs yet), never the source itself. With cemeteries swapped,
// "your cemetery" is the opponent's, so a banish cost draws on theirs.
function costCards(sourceId, zonePrefix) {
  const own = sideOf(sourceId)
  const side =
    zonePrefix === 'grave' && cemeteriesSwapped() ? (own === 'player' ? 'opponent' : 'player') : own
  return (state.zones[`${zonePrefix}:${side}`] || []).filter((id) => id !== sourceId)
}

// Pay an activated ability's card costs (after it is logged, so their events
// and "move" triggers key off its seq). Pays what it can: the free-form editor
// doesn't gate on affordability.
export function payCardCosts(cardId, ability, targetId, entry) {
  const cost = ability.cost || {}
  const side = sideOf(cardId)
  for (const id of costCards(cardId, 'hand').slice(0, Number(cost.discard) || 0))
    effectMove(id, `grave:${side}`, entry, 'Discarded', `${cardName(id)} is discarded as a cost.`)
  // A banish cost takes the cards the player picked from the cemetery first
  // ("banish three spells to cast one"), then the first others.
  const grave = costCards(cardId, 'grave')
  const picked = (entry?.targetIds || (targetId ? [targetId] : [])).filter((id) => grave.includes(id))
  const banishOrder = [...picked, ...grave.filter((id) => !picked.includes(id))]
  for (const id of banishOrder.slice(0, Number(cost.banish) || 0))
    effectMove(id, `banished:${sideOf(id)}`, entry, 'Banished', `${cardName(id)} is banished from the cemetery as a cost.`)
  const victim = cost.sacrifice === 'self' ? cardId : cost.sacrifice === 'target' ? targetId : null
  if (victim && sacrificeable(cardId, victim)) {
    const text = `${cardName(victim)} is sacrificed.`
    // A sacrificed unit dies (Deathrite fires); anything else just goes.
    if (isUnit(victim)) sendToCemetery(victim, entry, 'Sacrificed', text)
    else effectMove(victim, `grave:${sideOf(victim)}`, entry, 'Sacrificed', text)
  }
}

// Cost gating bites only while rules are enforced (play and recording), like
// the other activation gates; the free-form editor never activates anyway.
export const abilityCostBlocked = (cardId, ability) =>
  enforcing() && !canAffordAbility(cardId, ability)

// An activated ability's mana cost now: its printed cost, plus any cemetery
// tax when it picks cemetery cards.
export function abilityManaCost(cardId, ability) {
  // A passive 'abilities' cost modifier on the card changes its printed cost
  // (never below 0).
  let mana = Math.max(0, (Number(ability?.cost?.mana) || 0) + (traits(cardId)?.abilityCostMod || 0))
  const t = ability?.target
  if (t?.mode === 'card' && t.required && t.from === 'cemetery') {
    mana += cemeteryTaxFor(sideOf(cardId))
  }
  return mana
}

// ---------- oversized minions (animated auras) ----------

// An animated aura on an intersection is an oversized minion: it occupies the
// surface of all four squares around that crossing and moves crossing to
// crossing. Taken off an intersection it is an ordinary one-square minion.
export function oversizedAt(cardId) {
  const c = state.cards[cardId]
  if (!c?.aura || !animationOf(cardId)) return null
  const m = /^aura:(\d+)$/.exec(zoneOf(cardId) || '')
  return m ? Number(m[1]) : null
}
export const isOversized = (cardId) => oversizedAt(cardId) != null

// The four squares around intersection `i`, top-left first.
export function intersectionSquares(i) {
  const r = Math.floor(i / INTERSECTION_COLS)
  const c = i % INTERSECTION_COLS
  const tl = r * GRID_COLS + c
  return [tl, tl + 1, tl + GRID_COLS, tl + GRID_COLS + 1]
}

// Every square a unit occupies (four for an oversized one), or [] off-board.
export function squaresOf(cardId) {
  const i = oversizedAt(cardId)
  if (i != null) return intersectionSquares(i)
  const n = nodeOf(cardId)
  return n ? [n.sq] : []
}

// Intersections an oversized unit can reach within its movement: a step goes
// to an orthogonally neighbouring crossing (diagonal too while Airborne), and it
// may only stand where none of its four squares is void, unless it Voidwalks.
export function reachableIntersections(unitId) {
  const start = oversizedAt(unitId)
  const set = new Set()
  if (start == null || isDisabled(unitId)) return set
  const kw = effectiveKeywords(unitId)
  const standable = (i) =>
    kw.has('voidwalk') ||
    intersectionSquares(i).every((sq) => regionOf(sq, 'top') !== 'void')
  set.add(start)
  let frontier = [start]
  for (let d = 0; d < effectiveMovement(unitId); d++) {
    const next = []
    for (const f of frontier) {
      const fr = Math.floor(f / INTERSECTION_COLS)
      const fc = f % INTERSECTION_COLS
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue
          if (dr && dc && !kw.has('airborne')) continue
          const r = fr + dr
          const c = fc + dc
          if (r < 0 || c < 0 || r >= INTERSECTION_ROWS || c >= INTERSECTION_COLS) continue
          const g = r * INTERSECTION_COLS + c
          if (set.has(g) || !standable(g)) continue
          set.add(g)
          next.push(g)
        }
      }
    }
    frontier = next
  }
  return set
}

// Oversized units standing on a square (they are in an aura zone, not a cell).
export function oversizedOnSquare(idx) {
  const out = []
  for (let i = 0; i < INTERSECTIONS; i++) {
    for (const id of state.zones[`aura:${i}`] || []) {
      if (isOversized(id) && intersectionSquares(i).includes(idx)) out.push(id)
    }
  }
  return out
}

// The units a passive on `sourceId` reaches. Area scopes are region-aware (same
// region as the source); as in the rulebook, adjacent/nearby include the source's
// own square. The source itself is left out unless `includeSelf`. Side suffixes
// filter by controller. A site projects from its square's surface.
function unitsInScope(sourceId, scope, includeSelf = false) {
  if (scope === 'self') return [sourceId]
  const siteSq = squareOfSite(sourceId)
  const src = unitCell(sourceId) || (siteSq == null ? null : { square: siteSq, region: 'surface' })
  const srcCard = state.cards[sourceId]
  if (!src || !srcCard) return []
  const near = scope.startsWith('nearby')
  const wantFriendly = scope.endsWith('friendly')
  const wantEnemy = scope.endsWith('enemy')
  const out = []
  for (const u of boardUnits()) {
    if (u.id === sourceId && !includeSelf) continue
    if (u.region !== src.region) continue
    // Oversized units cover four squares: in range if any pair of squares is.
    const inRange = (src.squares || [src.square]).some((a) =>
      (u.squares || [u.square]).some(
        (b) => a === b || (near ? areNearby(a, b) : areAdjacent(a, b))
      )
    )
    if (!inRange) continue
    const sameSide = !!u.card.enemy === !!srcCard.enemy
    if (wantFriendly && !sameSide) continue
    if (wantEnemy && sameSide) continue
    out.push(u.id)
  }
  return out
}

// The squares a source "is" on: an aura's four around its intersection, an
// (oversized) unit's own square(s), a site's square, or a carried card's
// carrier's square. [] off the board.
export function areaSquares(sourceId) {
  const m = /^aura:(\d+)$/.exec(zoneOf(sourceId) || '')
  if (m) return intersectionSquares(Number(m[1]))
  const sq = squaresOf(sourceId)
  if (sq.length) return sq
  const site = squareOfSite(sourceId)
  return site == null ? [] : [site]
}

// The board square a non-unit card sits on (carried cards: their carrier's).
function cardSquare(id) {
  const m = /^(?:cell|site):(\d+)/.exec(zoneOf(id) || '')
  return m ? Number(m[1]) : null
}

// Every card a passive on `sourceId` reaches, by its scope and `affects` kinds.
// Units use the region-aware unit scopes; sites and artifacts are matched by
// square (the aura's area, or the source's square and those around it). Side
// suffixes filter by controller. The source itself only with `includeSelf`.
function passiveTargets(sourceId, a) {
  const scope = a.scope
  if (scope === 'self') return [sourceId]
  const srcCard = state.cards[sourceId]
  if (!srcCard) return []
  const affects = a.passive?.affects || ['units']
  const includeSelf = !!a.passive?.includeSelf
  const other = (id) => includeSelf || id !== sourceId
  const wantFriendly = scope.endsWith('friendly')
  const wantEnemy = scope.endsWith('enemy')
  const sideOk = (id) => {
    const same = !!state.cards[id]?.enemy === !!srcCard.enemy
    return !(wantFriendly && !same) && !(wantEnemy && same)
  }
  // Whoever carries the source (a carried artifact's wielder).
  if (scope === 'bearer') {
    const c = inPlay(sourceId) ? carrierOf(sourceId) : null
    return c ? [c] : []
  }
  // Board-wide scopes: everything of the affected kinds, or a side's Avatar.
  if (scope.startsWith('all') || scope.startsWith('avatar')) {
    if (!inPlay(sourceId)) return []
    const out = new Set()
    if (scope.startsWith('avatar')) {
      for (const u of boardUnits()) if (u.card.avatar && u.id !== sourceId && sideOk(u.id)) out.add(u.id)
      return [...out]
    }
    if (affects.includes('units'))
      for (const u of boardUnits()) if (other(u.id) && sideOk(u.id)) out.add(u.id)
    if (affects.includes('sites'))
      for (let sq = 0; sq < GRID_SIZE; sq++) {
        const id = state.zones[`site:${sq}`]?.[0]
        if (id && other(id) && sideOk(id)) out.add(id)
      }
    if (affects.includes('artifacts'))
      for (const c of Object.values(state.cards)) {
        if (!c.artifact || !other(c.id) || isUnit(c) || !sideOk(c.id)) continue
        if (cardSquare(c.id) != null) out.add(c.id)
      }
    return [...out]
  }
  const area = scope.startsWith('aura-area')
  const srcSquares = areaSquares(sourceId)
  if (!srcSquares.length) return []
  // The squares sites/artifacts are looked for on.
  let squares
  if (area) squares = srcSquares
  else {
    const near = scope.startsWith('nearby')
    squares = []
    for (let s = 0; s < GRID_SIZE; s++) {
      if (srcSquares.some((q) => q === s || (near ? areNearby(q, s) : areAdjacent(q, s)))) squares.push(s)
    }
  }
  const out = new Set()
  if (affects.includes('units')) {
    if (area) {
      // Units on those squares, in the chosen layer(s) (oversized ones -- always
      // on the surface -- if any of their squares overlap).
      const layers = a.passive?.unitLayers || 'surface'
      for (const u of boardUnits()) {
        if (!other(u.id) || !sideOk(u.id)) continue
        const below = /:bot$/.test(zoneOf(u.id) || '')
        if (layers === 'surface' && below) continue
        if (layers === 'below' && !below) continue
        if ((u.squares || [u.square]).some((s) => squares.includes(s))) out.add(u.id)
      }
    } else {
      for (const id of unitsInScope(sourceId, scope, includeSelf)) out.add(id)
    }
  }
  if (affects.includes('sites')) {
    for (const s of squares) {
      const id = state.zones[`site:${s}`]?.[0]
      if (id && other(id) && sideOk(id)) out.add(id)
    }
  }
  if (affects.includes('artifacts')) {
    for (const c of Object.values(state.cards)) {
      if (!c.artifact || !other(c.id) || isUnit(c) || !sideOk(c.id)) continue
      const sq = cardSquare(c.id)
      if (sq != null && squares.includes(sq)) out.add(c.id)
    }
  }
  return [...out]
}

function accumPassive(p, acc) {
  if (!p) return
  for (const k of p.keywords || []) acc.keywords.add(k)
  acc.movement += Number(p.movement) || 0
  acc.strength += Number(p.strength) || 0
  acc.ranged += Number(p.ranged) || 0
  if (p.summonOnEnemySites) acc.summonOnEnemySites = true
  if (p.costOn === 'own') acc.costMod += Number(p.costMod) || 0
  if (p.costOn === 'abilities') acc.abilityCostMod += Number(p.costMod) || 0
  if (p.cantAttack) acc.cantAttack = true
  if (p.cantBeTargeted) acc.cantBeTargeted = true
  if (p.cantMove) acc.cantMove = true
  if (p.cantDefend) acc.cantDefend = true
}

// spellCost is a list of { amount, filter }: each passive discount/tax and the
// kind of spell it applies to (see PASSIVE_COST_FILTERS).
const emptySideMods = () => ({ spellCost: [], affinity: { air: 0, earth: 0, fire: 0, water: 0 } })

// The side(s) a passive's side-wide modifiers (spell cost, affinity) land on.
// Keyed off the scope and the source's own side -- never off which cards the
// scope happens to reach -- so "your spells cost 1 less" doesn't blink on and
// off as units move in and out of range. self -> the source's side; bearer ->
// the carrier's side; -friendly / -enemy -> that side; unsuffixed area and
// board-wide scopes -> both sides.
function scopeSides(sourceId, scope) {
  const own = sideOf(sourceId)
  if (scope === 'self') return [own]
  if (scope === 'bearer') {
    const c = carrierOf(sourceId)
    return c ? [sideOf(c)] : []
  }
  if (scope.endsWith('friendly')) return [own]
  if (scope.endsWith('enemy')) return [otherSide(own)]
  return ['player', 'opponent']
}

// Every unit's continuous traits, derived from passive abilities (self and
// region-aware auras) plus gameplay grants. A single computed so it recomputes
// once when the board changes and is shared by every reader. Silence removes a
// unit's ability-sourced traits (keywords, movement, strength auras, and even
// granted keywords -- all "non-basic"); a raw strengthMod counter is a stat
// change, not an ability, so it survives. Disable is silence that also strips
// the basics, so the unit can't act at all. Auras from a silenced/disabled
// source stop applying (resolved in one pass; mutual silence isn't chased).
const passiveState = computed(() => {
  resolvingPassives = true
  try {
    return resolvePassives()
  } finally {
    resolvingPassives = false
  }
})

function resolvePassives() {
  const cards = state.cards
  const silenced = new Set()
  const disabled = new Set()
  for (const src of Object.values(cards)) {
    for (const a of passivesOf(src)) {
      if (!a.passive.silence && !a.passive.disable) continue
      if (a.scope === 'self') continue
      for (const tid of passiveTargets(src.id, a)) {
        if (a.passive.silence) silenced.add(tid)
        if (a.passive.disable) disabled.add(tid)
      }
    }
  }

  // Area passives from sources that still work, resolved once: id -> [passive].
  // Side-wide modifiers (spell cost, affinity) land once per side the scope
  // names (scopeSides), and only from a source in play -- a card in hand doesn't
  // lend its side affinity or discounts.
  const lent = {}
  const sides = { player: emptySideMods(), opponent: emptySideMods() }
  for (const src of Object.values(cards)) {
    if (silenced.has(src.id) || disabled.has(src.id)) continue
    for (const a of passivesOf(src)) {
      if (a.scope !== 'self')
        for (const tid of passiveTargets(src.id, a)) (lent[tid] || (lent[tid] = [])).push(a)
      const p = a.passive
      const spells = p.costOn === 'spells' ? Number(p.costMod) || 0 : 0
      const hasAff = ELEMENTS.some((el) => Number(p.affinity?.[el]))
      if ((!spells && !hasAff) || !inPlay(src.id)) continue
      for (const side of scopeSides(src.id, a.scope)) {
        if (spells) sides[side].spellCost.push({ amount: spells, filter: p.costFilter || 'any' })
        for (const el of ELEMENTS) sides[side].affinity[el] += Number(p.affinity?.[el]) || 0
      }
    }
  }

  const map = {}
  for (const id of Object.keys(cards)) {
    const disabledHere = disabled.has(id)
    const silencedHere = silenced.has(id) || disabledHere
    const acc = {
      keywords: new Set(),
      movement: 0,
      strength: 0,
      ranged: 0,
      summonOnEnemySites: false,
      costMod: 0,
      abilityCostMod: 0,
      cantAttack: false,
      cantBeTargeted: false,
      cantMove: false,
      cantDefend: false,
    }
    if (!silencedHere) {
      for (const a of passivesOf(cards[id])) {
        if (a.scope === 'self') accumPassive(a.passive, acc)
      }
      for (const a of lent[id] || []) accumPassive(a.passive, acc)
      for (const k of state.grantedKeywords[id] || []) acc.keywords.add(k)
    }
    map[id] = {
      keywords: acc.keywords,
      movement: acc.movement,
      ranged: acc.ranged,
      // The counter persists through silence; passive/aura strength does not.
      strengthMod: acc.strength + (state.strengthMod[id] || 0),
      silenced: silencedHere,
      disabled: disabledHere,
      summonOnEnemySites: acc.summonOnEnemySites,
      costMod: acc.costMod,
      abilityCostMod: acc.abilityCostMod,
      cantAttack: acc.cantAttack,
      cantBeTargeted: acc.cantBeTargeted,
      cantMove: acc.cantMove,
      cantDefend: acc.cantDefend,
    }
  }
  return { map, sides }
}

export const effective = computed(() => passiveState.value.map)

// Side-wide passive modifiers for 'player' / 'opponent': the mana deltas on the
// spells that side casts (each with its spell-kind filter), and extra affinity
// per element.
export const sidePassiveMods = (side) => passiveState.value.sides[side] || emptySideMods()

export const traits = (id) => effective.value[id] || null

export const effectiveKeywords = (id) => traits(id)?.keywords || new Set()
export const hasKeyword = (id, kw) => !!traits(id)?.keywords?.has(kw)

// Stealth is active only until the unit acts (then the token is lost).
export const isStealthed = (id) => hasKeyword(id, 'stealth') && !state.stealthLost[id]

export const oppositeSides = (a, b) => !!state.cards[a]?.enemy !== !!state.cards[b]?.enemy

// A Ward is intact until it absorbs something. It breaks when an opponent's
// spell/ability would target/damage/destroy the warded object.
export const hasWard = (id) => hasKeyword(id, 'ward') && !state.wardBroken[id]
export const wardBlocks = (sourceId, targetId) =>
  hasWard(targetId) && oppositeSides(sourceId, targetId)

// Stealth can't be targeted by opponents -- a targeting rule that holds whether
// or not reach is being enforced.
export const blockedByStealth = (sourceId, targetId) =>
  isStealthed(targetId) && oppositeSides(sourceId, targetId)
export const effectiveStrengthMod = (id) => traits(id)?.strengthMod || 0
export const effectiveRanged = (id) => traits(id)?.ranged || 0
export const isSilenced = (id) => !!traits(id)?.silenced
// May be summoned onto an opponent-controlled site (a passive-granted trait).
export const canSummonOnEnemySites = (id) => !!traits(id)?.summonOnEnemySites

// The side a card belongs to.
export const sideOf = (id) => (state.cards[id]?.enemy ? 'opponent' : 'player')

// In play mode the solver controls only their own side: an opponent's cards --
// spells in their hand, the actions on their units' bar -- are look-only, since
// the puzzle drives the opponent automatically. Editing and recording keep full
// control of both sides so an author can set up and demonstrate a solution.
export function playerControls(cardId) {
  if (state.mode !== 'play') return true
  return !state.cards[cardId]?.enemy
}

// Combat stats: base Power/Life from the card (authored, shown on the art),
// modified in play. An avatar's Life is its side's life total.
export const effectivePower = (id) => basePower(id) + effectiveStrengthMod(id)

// An animated object fights with its animation's power; a real unit (or
// anything else) with the power printed on it.
function basePower(id) {
  const c = state.cards[id]
  if (!c) return 0
  const anim = !c.unit && !c.avatar ? animationOf(id) : null
  return anim ? animatedPower(id, anim) : c.power || 0
}

// A minion has no separate Life -- its toughness IS its power (damage >= power
// kills it). An optional `defense` overrides toughness for the few cards whose
// attack and defense powers differ; strength boosts raise both. Avatars are the
// exception: their toughness is the side's life total.
export function effectiveLife(id) {
  const c = state.cards[id]
  if (!c) return 0
  if (c.avatar) return state.stats[sideOf(id)]?.life || 0
  const d = c.defense
  const base = d === '' || d == null || (!c.unit && animationOf(id)) ? basePower(id) : Number(d) || 0
  return base + effectiveStrengthMod(id)
}
export const isDisabled = (id) => !!traits(id)?.disabled
// Passive restrictions (lifted by silence/disable like any other passive trait).
export const cantAttack = (id) => !!traits(id)?.cantAttack
export const cantBeTargeted = (id) => !!traits(id)?.cantBeTargeted
export const cantMove = (id) => !!traits(id)?.cantMove
export const cantDefend = (id) => !!traits(id)?.cantDefend

// Keywords added during play (not the base ones on the card art), for badging.
export const grantedKeywordsOf = (id) => state.grantedKeywords[id] || []

// Steps a unit may take: base 1, plus passive/granted movement, zeroed by
// Immobile, Disable or a passive "can't move". Non-units never move. (With no
// steps a unit still reaches its own square, so it may attack there.)
export function effectiveMovement(id) {
  const e = traits(id)
  if (!e || !isUnit(id)) return 0
  if (e.disabled || e.cantMove || e.keywords.has('immobile')) return 0
  return 1 + e.movement
}

// ---------- movement / attack reachability (enforcement) ----------

// A position is a (square, layer) node; layer 'top' is the surface/void, 'bot'
// the subsurface. Reachability is a BFS over legal single steps.
export const nodeKey = (sq, layer) => `${sq}:${layer}`

export function nodeOf(cardId) {
  const z = zoneOf(cardId)
  // An oversized unit anchors on its top-left square (squaresOf has all four).
  const big = oversizedAt(cardId)
  if (big != null) return { sq: intersectionSquares(big)[0], layer: 'top' }
  let m = /^cell:(\d+):(top|bot)$/.exec(z || '')
  if (m) return { sq: Number(m[1]), layer: m[2] }
  m = /^site:(\d+)$/.exec(z || '')
  if (m) return { sq: Number(m[1]), layer: 'top' }
  return null
}

// Whether a unit with keyword set `kw` may take one step from node F to node G.
// Encodes the movement table: cardinal surface steps for anyone, diagonals for
// Airborne, vertical steps for Burrowing/Submerge, and void entry/exit (cardinal
// only) for Voidwalk.
function canStep(kw, F, G) {
  // Vertical: same square, surface <-> subsurface, gated by the sub-region.
  if (F.sq === G.sq) {
    if (F.layer === G.layer) return false
    const sub = regionOf(F.sq, 'bot')
    if (sub === 'underground') return kw.has('burrowing')
    if (sub === 'underwater') return kw.has('submerge')
    return false
  }
  const cardinal = areAdjacent(F.sq, G.sq)
  const diagonal = areNearby(F.sq, G.sq) && !cardinal
  if (!cardinal && !diagonal) return false
  const regF = regionOf(F.sq, F.layer)
  const regG = regionOf(G.sq, G.layer)
  // Voidwalk directly from the void into an adjacent site's subsurface.
  if (G.layer === 'bot') {
    if (regF !== 'void' || !cardinal || !kw.has('voidwalk')) return false
    if (regG === 'underground') return kw.has('burrowing')
    if (regG === 'underwater') return kw.has('submerge')
    return false
  }
  // Cross-square surface/void steps only leave from a surface/void node.
  if (F.layer !== 'top') return false
  if (regF === 'void' || regG === 'void') return cardinal && kw.has('voidwalk')
  // surface <-> surface: cardinal for anyone, diagonal only while Airborne.
  return cardinal || kw.has('airborne')
}

// Candidate neighbour nodes to test from F: the vertical partner plus both
// layers of every king-adjacent square.
function neighborNodes(F) {
  const out = [{ sq: F.sq, layer: F.layer === 'top' ? 'bot' : 'top' }]
  for (let s = 0; s < GRID_SIZE; s++) {
    if (s !== F.sq && areNearby(F.sq, s)) {
      out.push({ sq: s, layer: 'top' }, { sq: s, layer: 'bot' })
    }
  }
  return out
}

// The set of node keys a unit can reach within its movement, including where it
// stands (so a unit can attack an enemy sharing its square). Empty for a
// disabled unit or one not on the board.
export function reachableNodes(unitId) {
  const set = new Set()
  if (!isUnit(unitId) || isDisabled(unitId)) return set
  // An oversized unit reaches every surface square under a crossing it can reach.
  if (isOversized(unitId)) {
    for (const i of reachableIntersections(unitId)) {
      for (const sq of intersectionSquares(i)) set.add(nodeKey(sq, 'top'))
    }
    return set
  }
  const start = nodeOf(unitId)
  if (!start) return set
  const kw = effectiveKeywords(unitId)
  const steps = effectiveMovement(unitId)
  set.add(nodeKey(start.sq, start.layer))
  let frontier = [start]
  for (let d = 0; d < steps; d++) {
    const next = []
    for (const F of frontier) {
      for (const G of neighborNodes(F)) {
        const key = nodeKey(G.sq, G.layer)
        if (!set.has(key) && canStep(kw, F, G)) {
          set.add(key)
          next.push(G)
        }
      }
    }
    frontier = next
  }
  return set
}

// Enforcement is per-puzzle and only bites while playing or recording; the
// editor stays free-form for building positions.
export const enforcing = () =>
  state.enforce && (state.mode === 'play' || state.recording)

// A minion that entered the realm this turn has summoning sickness: it cannot
// tap, or be tapped, to pay for the costs of abilities (so no Move & Attack,
// shoot, intercept, or tap-cost activated ability) until end of turn -- unless
// it has Charge, which explicitly lets a just-summoned unit tap. Avatars are
// never "summoned", so they are never sick. hasKeyword() reads the effective
// traits, so Charge printed on the card, lent by a passive/aura, or granted
// mid-turn by a spell or ability all lift the sickness at once.
// (Rulebook p. 19, glossary "Charge".)
export function hasSummoningSickness(cardId) {
  return !!state.summoned[cardId] && !hasKeyword(cardId, 'charge')
}

// Player-initiated tap costs are refused for a summon-sick actor, but only while
// rules are enforced (play/record) -- the free-form editor and forced effects
// (the effect `move`/`tap` ops never route through these helpers) are
// unaffected, mirroring how `enforcing()`/`combat` already scope the checks.
export const tapBlockedBySickness = (cardId) => enforcing() && hasSummoningSickness(cardId)

// Passive "can't move" / "can't attack", for the action bar: like the other
// rule gates they only bite while enforcing (canMoveUnit/canAttack refuse them).
export const moveBlockedByPassive = (cardId) => enforcing() && cantMove(cardId)
export const attackBlockedByPassive = (cardId) => enforcing() && cantAttack(cardId)

// May this unit legally move to a board zone? Non-cell destinations aren't
// movement-gated (summoning from hand, etc.). A summon-sick unit can't move at
// all: the Move action taps it (Move & Attack), so it is barred while enforcing.
export function canMoveUnit(unitId, toZone) {
  // An oversized unit moves crossing to crossing, never onto a single square.
  if (isOversized(unitId)) {
    if (/^cell:/.test(toZone || '')) return false
    const a = /^aura:(\d+)$/.exec(toZone || '')
    if (!a) return true
    if (tapBlockedBySickness(unitId)) return false
    return reachableIntersections(unitId).has(Number(a[1]))
  }
  const m = /^cell:(\d+):(top|bot)$/.exec(toZone || '')
  if (!m) return true
  if (tapBlockedBySickness(unitId)) return false
  return reachableNodes(unitId).has(nodeKey(Number(m[1]), m[2]))
}

// May attacker legally attack target: within reach, and past the targeting
// keywords -- Airborne can only be hit by Airborne, Stealth not by opponents.
export function canAttack(attackerId, targetId) {
  if (!isUnit(attackerId) || isDisabled(attackerId) || cantAttack(attackerId)) return false
  if (tapBlockedBySickness(attackerId)) return false // Move & Attack taps
  const target = state.cards[targetId]
  // You may only attack the opposing side, and only its units or sites --
  // never friendly cards, and never a non-unit/non-site (aura, artifact, etc.).
  if (!target || (!isUnit(targetId) && !target.site)) return false
  if (!oppositeSides(attackerId, targetId)) return false
  const t = nodeOf(targetId)
  if (!t) return false
  const reach = reachableNodes(attackerId)
  const hit = isOversized(targetId)
    ? squaresOf(targetId).some((sq) => reach.has(nodeKey(sq, 'top')))
    : reach.has(nodeKey(t.sq, t.layer))
  if (!hit) return false
  if (isUnit(targetId)) {
    const atk = effectiveKeywords(attackerId)
    const tgt = effectiveKeywords(targetId)
    if (tgt.has('airborne') && !atk.has('airborne')) return false
    if (isStealthed(targetId)) return false
  }
  return true
}

// UI helpers: is a card/zone a legal target of the currently armed action? When
// not enforcing they fall back to the old free-form behaviour (any on-board
// target; every square a move destination).
export function armedAttackLegal(targetId) {
  if (!ui.attacker || ui.attacker === targetId) return false
  if (blockedByStealth(ui.attacker, targetId)) return false
  if (enforcing() && !canAttack(ui.attacker, targetId)) return false
  // An oversized attacker with its crossing chosen hits only what lies under it.
  if (ui.attackCrossing != null && isOversized(ui.attacker))
    return engageCrossings(ui.attacker, targetId).includes(ui.attackCrossing)
  return true
}

// null = no move armed, or a realm zone in a free-form puzzle (no highlight);
// else whether the armed unit may reach this zone. Off-realm zones are never
// reachable: a Move is a step through the realm.
export function armedMoveLegal(zone) {
  if (!ui.moving) return null
  if (!inRealm(routeZone(ui.moving, zone))) return false
  if (!enforcing()) return null
  return canMoveUnit(ui.moving, zone)
}

// The one cue a whole square wears while something is armed: the verb a click
// there performs ('move' / 'attack' / 'shoot' / 'summon'), 'out' for a square an
// armed Move can't reach, or null for no cue. Like the other legality hints it
// only speaks while enforcing -- a free-form puzzle leaves every square open.
export function squareCue(idx) {
  if (!enforcing()) return null
  const cards = () => [
    ...(state.zones[`site:${idx}`] || []),
    ...state.zones[`cell:${idx}:top`],
    ...state.zones[`cell:${idx}:bot`],
  ]
  if (ui.attacker) return cards().some(armedAttackLegal) ? 'attack' : null
  if (ui.shooting) {
    return cards().some((id) => id !== ui.shooting && armedShootLegal(id)) ? 'shoot' : null
  }
  if (ui.moving) {
    // Where the mover already stands is not a move; its other layer may be.
    // Its own square is never dimmed -- that is where the eye starts from.
    const from = zoneOf(ui.moving)
    const legal = (z) => z !== from && armedMoveLegal(z)
    if (legal(`cell:${idx}:top`) || legal(`cell:${idx}:bot`)) return 'move'
    return from === `cell:${idx}:top` || from === `cell:${idx}:bot` ? null : 'out'
  }
  const sel = ui.selected
  const c = sel && state.cards[sel]
  if (c && c.unit && !c.avatar && canCast(sel)) {
    const ok = (z) => legalSummonLocation(sel, z)
    return ok(`cell:${idx}:top`) || ok(`cell:${idx}:bot`) ? 'summon' : null
  }
  return null
}

// ---------- ranged (line-of-fire) ----------

export function unitsOnSquare(idx) {
  const out = oversizedOnSquare(idx)
  for (const layer of ['top', 'bot']) {
    for (const id of state.zones[`cell:${idx}:${layer}`] || []) {
      if (isUnit(id)) out.push(id)
    }
  }
  return out
}

// Units on a square that sit in a given region (surface / void / underground /
// underwater). Region is a (square, layer) property, so this picks the layer(s)
// whose region matches -- used to keep a ranged shot within one region.
function unitsInRegionOnSquare(idx, region) {
  const out = regionOf(idx, 'top') === region ? oversizedOnSquare(idx) : []
  for (const layer of ['top', 'bot']) {
    if (regionOf(idx, layer) !== region) continue
    for (const id of state.zones[`cell:${idx}:${layer}`] || []) {
      if (isUnit(id)) out.push(id)
    }
  }
  return out
}

// Units a Ranged shooter can hit: fire a projectile down each of the four
// cardinal lines up to its range. The shot stays in the shooter's own region --
// no firing across surface/subsurface/void. Any unit (friend or foe) occupying a
// square blocks the line, so the shot reaches only the first occupied square in
// each direction; every unit on that square is choosable. The exception is the
// shooter's own square: allies standing with the shooter are optional targets
// (you may shoot them, but they don't block). Stealth units are transparent --
// they can't be hit and don't block.
export function rangedTargets(shooterId) {
  const set = new Set()
  const range = effectiveRanged(shooterId)
  const start = nodeOf(shooterId)
  if (!range || isDisabled(shooterId) || !start) return set
  // Origin square: same-region units standing with the shooter are optional
  // targets and never block the outgoing shot.
  for (const id of state.zones[`cell:${start.sq}:${start.layer}`] || []) {
    if (id !== shooterId && isUnit(id) && !isStealthed(id)) set.add(id)
  }
  for (const hit of lineHits(start, range)) for (const id of hit.units) set.add(id)
  return set
}

// Walk each of the four cardinal lines out from a (square, layer) node, staying
// in the node's region, and stop at the first square holding a unit -- any
// unit, friend or foe, blocks the line beyond it; Stealth units are transparent.
// One record per direction that hits something: { dr, dc, sq, units }. A range
// of 0 or less is unlimited (the line runs to the edge of the realm).
function lineHits(start, range) {
  const out = []
  const region = regionOf(start.sq, start.layer)
  const max = range > 0 ? range : Math.max(GRID_ROWS, GRID_COLS)
  const row = Math.floor(start.sq / GRID_COLS)
  const col = start.sq % GRID_COLS
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    for (let step = 1; step <= max; step++) {
      const r = row + dr * step
      const c = col + dc * step
      if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) break
      const sq = r * GRID_COLS + c
      const units = unitsInRegionOnSquare(sq, region).filter((id) => !isStealthed(id))
      if (units.length) {
        out.push({ dr, dc, sq, units })
        break
      }
    }
  }
  return out
}

// ---------- projectiles ----------

// A projectile is fired from its source in one cardinal direction and flies in
// a straight line like a Ranged shot (same region, blocked by the first unit,
// Stealth transparent), but its distance is unlimited unless the ability gives
// it a range. It stops at -- and hits -- the first unit in its path, so the
// units it can hit are exactly the first occupied square in each direction;
// choosing one of them is choosing the direction. Unlike a Ranged shot it
// leaves its origin, so units sharing the source's location are never hit.
//
// A source that isn't on the board (a spell cast from hand) fires from its
// controller's avatar.
function projectileOrigin(sourceId) {
  const own = nodeOf(sourceId)
  if (own) return own
  const side = sideOf(sourceId)
  for (const id of Object.keys(state.cards)) {
    if (isAvatar(id) && sideOf(id) === side) {
      const n = nodeOf(id)
      if (n) return n
    }
  }
  return null
}

// The units a projectile from this source could hit, each mapped to the line
// record (direction, square) that reaches it.
export function projectileTargets(sourceId, range = 0) {
  const hits = new Map()
  const start = projectileOrigin(sourceId)
  if (!start) return hits
  for (const hit of lineHits(start, range)) {
    for (const id of hit.units) hits.set(id, hit)
  }
  return hits
}

// A square on the projectile's line relative to the unit it hit: -1 is where
// it stopped (the square just before the hit, toward the source), +1 the square
// past the hit (knockback). Same layer as the hit unit; null off the board or
// when the target isn't in a straight line from the source.
export function projectileStep(sourceId, targetId, step) {
  const o = projectileOrigin(sourceId)
  const t = nodeOf(targetId)
  if (!o || !t) return null
  const or = Math.floor(o.sq / GRID_COLS)
  const oc = o.sq % GRID_COLS
  const tr = Math.floor(t.sq / GRID_COLS)
  const tc = t.sq % GRID_COLS
  if (or !== tr && oc !== tc) return null
  const r = tr + Math.sign(tr - or) * step
  const c = tc + Math.sign(tc - oc) * step
  if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) return null
  return `cell:${r * GRID_COLS + c}:${t.layer}`
}

export const canShoot = (shooterId, targetId) =>
  !tapBlockedBySickness(shooterId) && rangedTargets(shooterId).has(targetId)

export function armedShootLegal(targetId) {
  if (!ui.shooting || ui.shooting === targetId) return false
  if (blockedByStealth(ui.shooting, targetId)) return false
  return enforcing() ? canShoot(ui.shooting, targetId) : isUnit(targetId)
}

// ---------- combat resolution ----------

export const combatActive = () =>
  state.combat && (state.mode === 'play' || state.recording)

// Power a unit actually deals: none while Disabled ("doesn't strike when fighting").
export const combatPower = (id) => (isDisabled(id) ? 0 : effectivePower(id))

// A card on the mat: in the realm (a cell or site slot, or carried there) or on
// an intersection (an aura, or an oversized minion).
export const inPlay = (id) => ['realm', 'aura'].includes(cardZoneCategory(id))

// A batch of simultaneous hits: who a Lethal source touched, every damage
// instance dealt, and where each party stood when it landed, so the batch can
// settle (deaths, then damage triggers) as one.
export const newHits = () => ({ lethal: new Set(), dealt: [], at: {}, prevented: [] })
