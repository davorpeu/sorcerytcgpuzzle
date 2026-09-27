import {
  FORMAT_VERSION,
  GRID_SIZE,
  MAX_DATA_URL,
  STORAGE_KEY,
  api,
  clone,
  config,
  defaultStats,
  emptyZones,
  isServerId,
  remote,
  state,
  ui,
  uid,
} from './store/state.js'
import { TOKEN_TEMPLATE_KINDS, normalizeAbility } from './store/counters.js'
import { carriedBy, ownByZone, routeZone, wouldCycle } from './store/moves.js'
import { clearStoryStack, dropCarried } from './store/abilities.js'
import { withEditorSiteMana } from './store/mana.js'
import {
  editingStart,
  entryCards,
  lineOutcome,
  localToday,
  resetPlayTracking,
  restoreAttempt,
  restoreZones,
  sameEntry,
  sameLine,
  solutionCards,
} from './store/session.js'
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
export {
  beginActivate,
  beginCast,
  canAffordCast,
  canCast,
  canCastFrom,
  canCharge,
  canDeclineActivate,
  canFinishPicks,
  cancelModeChoice,
  cardTypeLabel,
  castByDrop,
  castControlled,
  castCostOf,
  castManaCost,
  castShortfall,
  castSourceOk,
  castsFromCemetery,
  chargeForMana,
  chooseModes,
  deckSize,
  declineActivate,
  drawFromDeck,
  effectiveThreshold,
  finishPicks,
  gainManaFromSites,
  hasCaster,
  isSpell,
  markDamage,
  pendingModeChoice,
  providedAffinity,
  providedMana,
  spellCastable,
  targetActivate,
  undo,
} from './store/mana.js'
export {
  MAX_MISTAKES,
  adjustStat,
  check,
  enterEditor,
  enterPlay,
  hasSolution,
  isAvatar,
  isTapped,
  isUnit,
  localToday,
  playLocked,
  removeSolutionLine,
  resetPlay,
  resetPlayTracking,
  solveStatus,
  startRecording,
  stopRecording,
  tapCard,
  toggleArtifact,
  toggleAura,
  toggleAvatar,
  toggleCastFromCemetery,
  toggleControl,
  toggleLanceToken,
  toggleMagic,
  toggleMonument,
  toggleSite,
  toggleTap,
  toggleUnit,
  untapCard,
} from './store/session.js'

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
