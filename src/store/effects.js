// Store module: effects. Effect operations, tokens, card-flow effects,
// lose-when, automatic survival, performing abilities and casting. Part of the
// store split: import from src/store.js, never from this file directly.

import { nextTick } from 'vue'
import { removeFromZones } from '../store.js'
import { GRID_COLS, GRID_SIZE, clone, emitFx, state, ui, uid, zoneOf } from './state.js'
import {
  ANIMATE_DURATIONS,
  abilityManaCost,
  animatedPower,
  animationOf,
  blockedByStealth,
  boardUnits,
  cantBeTargeted,
  cardName,
  combatActive,
  combatPower,
  conditionHolds,
  enforcing,
  hasKeyword,
  hasWard,
  inPlay,
  isOversized,
  newHits,
  nodeOf,
  oppositeSides,
  oversizedOnSquare,
  payCardCosts,
  projectileStep,
  rawMatchesFilter,
  regionOf,
  setFloodedSite,
  sideOf,
  siteOn,
  squareOfSite,
  takeControl,
  wardBlocks,
  waterBodyAt,
  waterBodySizeAt,
  zoneCategory,
  zoneLabel,
  zoneRegion,
} from './board.js'
import {
  PICKED_TOKEN_LOCATIONS,
  SHIELD_COUNTER,
  TOKEN_DEFS,
  abilityView,
  absorbDamage,
  addCounters,
  adjustDamage,
  announcePrevented,
  applyHit,
  cardZoneCategory,
  counterOf,
  damageOf,
  fireDamage,
  hasModes,
  loseConditions,
  sendToCemetery,
  settleHits,
  strikeWithLance,
  tokenTemplate,
} from './counters.js'
import {
  areAdjacent,
  areNearby,
  carriedBy,
  carrierOf,
  logEntry,
  routeZone,
  shedInPlayState,
  wouldCycle,
} from './moves.js'
import {
  findAbility,
  fireTriggers,
  matchesFilter,
  matchesTargetSide,
  runAbilityEffects,
  squareOf,
} from './abilities.js'
import { beginCast, canCast, isSpell, legalSummonLocation, undo } from './mana.js'
import { adjustStat, isAvatar, isTapped, isUnit } from './session.js'

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
export const kingDistance = (a, b) =>
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
export function purgeGeneratedCards() {
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

export function runEffects(ability, cardId, targetId, entry, gridSquare, destZone, extra = {}) {

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
export function performAbility(cardId, abilityId, targetId, gridSquare, destZone, extra = null) {
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
export const casting = () => state.recording || state.mode === 'play'
