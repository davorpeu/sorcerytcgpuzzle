<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import EffectSelector from './EffectSelector.vue'
import ConditionEditor, { condRecap } from './ConditionEditor.vue'
import TargetEditor from './TargetEditor.vue'
import AreaPicker from './AreaPicker.vue'
import ConfirmInline from './ConfirmInline.vue'
import {
  state,
  cardName,
  ZONE_CATEGORIES,
  TRIGGER_ACTIONS,
  TRIGGER_SUBJECTS,
  TRIGGER_ROLES,
  TRIGGER_TARGET_REFS,
  TARGETED_TRIGGER_ACTIONS,
  TRIGGER_PRESETS,
  ABILITY_STARTERS,
  triggerPresetOf,
  applyTriggerPreset,
  setTriggerPick,
  LOSE_CONDITIONS,
  LOSE_LABELS,
  loseConditions,
  LOCATION_REFS,
  STRIKE_BY,
  MOVE_KINDS,
  MOVE_REACH,
  TOKEN_KINDS,
  tokenLocationsFor,
  setMoveKind,
  setTokenKind,
  AMOUNT_REFS,
  EFFECT_OPS,
  DECKS,
  EFFECT_SIDES,
  DISCARD_PICKS,
  REANIMATE_REACH,
  GRANT_RELEASE,
  GRANT_RELEASE_LABELS,
  SACRIFICE_COSTS,
  KEYWORDS,
  PASSIVE_AFFECTS,
  PASSIVE_COST_ON,
  PASSIVE_COST_FILTERS,
  UNIT_LAYERS,
  ANIMATE_POWER_REFS,
  ANIMATE_DURATIONS,
  CEMETERY_TAX_ON,
  TARGET_FILTERS,
  FILTER_LABELS,
  addAbility,
  removeAbility,
  toggleAbilityZone,
  togglePassiveKeyword,
  addEffect,
  removeEffect,
  retypeEffect,
  setAmountRef,
  setEffectCondition,
  addMode,
  removeMode,
} from '../store.js'

// The editor reads each ability as numbered steps, each a sentence of selects:
//   triggered: 1 When [trigger] · 2 Only if [condition] · 3 Choose [target] · 4 Do [effects]
//   activated: 1 Pay [cost] · 2 Choose [target] · 3 Do [effects]
//   passive:   1 While [condition] · 2 Applies to [who] · 3 Grants [modifiers] · 4 Stops [restrictions]
// The raw trigger fields sit behind "Advanced"; the common triggers are presets.

// Options for the effect params. `self`/`enemy` resolve relative to the
// activating card's side; `player`/`opponent` are absolute.
const STAT_SIDES = ['self', 'enemy', 'player', 'opponent']
const STAT_KEYS = ['mana', 'life', 'air', 'earth', 'fire', 'water']
const ELEMENTS = ['air', 'earth', 'fire', 'water']

const ACTION_LABELS = {
  move: 'a card moves',
  attack: 'an attack',
  strike: 'a strike',
  pickup: 'a pick-up',
  drop: 'a drop',
  ability: 'an ability is activated',
  cast: 'a spell is cast',
  damage: 'damage is dealt',
  enter: 'a card enters the realm',
  death: 'a unit dies',
}
const SUBJECT_LABELS = { self: 'this card', any: 'any card', enemy: 'an enemy card', friendly: 'a card of yours' }
const ROLE_LABELS = { actor: 'does it', target: 'has it done to it' }
const REF_LABELS = { subject: 'the triggering card', other: 'the other card involved' }

// Effect ops as the picker shows them. The three "put a card in a zone" ops are
// one "send to" entry whose destination picks the op (bounce works from the
// realm or a cemetery).
const SEND_OPS = { destroy: 'cemetery', banish: 'banished', bounce: 'hand' }
const SEND_TO_OP = { cemetery: 'destroy', banished: 'banish', hand: 'bounce' }
const SEND_LABELS = {
  cemetery: 'the cemetery (destroy / kill)',
  banished: 'banishment',
  hand: "its owner's hand",
}
const OP_LABELS = {
  adjustStat: 'change life / mana / threshold',
  tap: 'tap',
  untap: 'untap',
  dealDamage: 'deal damage',
  strike: 'strike (this unit)',
  heal: 'heal',
  preventDamage: 'prevent damage',
  modifyStrength: 'change power',
  grantKeyword: 'give a keyword',
  move: 'move / teleport',
  sendTo: 'send to a zone',
  swap: 'swap places',
  reanimate: 'reanimate from the cemetery',
  summonToken: 'create a token',
  animate: 'animate into a minion',
  gainControl: 'gain control',
  grantFrom: 'assume form (gain its abilities)',
  release: 'end an assumed form',
  flood: 'flood a site',
  unflood: 'unflood a site',
  draw: 'draw',
  discard: 'discard',
  search: 'search a deck',
  banishAndCast: 'banish picked cards, cast one',
  addCounter: 'add counters',
  removeCounter: 'remove counters',
}
const pickerOps = [...new Set(EFFECT_OPS.map((op) => (SEND_OPS[op] ? 'sendTo' : op)))]
const opValue = (eff) => (SEND_OPS[eff.op] ? 'sendTo' : eff.op)
function onOpChange(view, i, value) {
  retypeEffect(view, i, value === 'sendTo' ? 'destroy' : value)
}

const amountRefLabel = (r) =>
  ({
    power: "this card's power",
    carriedCount: 'cards it carries',
    waterBodySize: 'size of its body of water',
    count: 'the number of…',
    counter: 'counters on…',
  }[r] || 'a number')
const SIDE_LABELS = { self: 'you', enemy: 'opponent' }
const SACRIFICE_LABELS = { none: 'nothing', self: 'this card', target: 'the target (yours)' }
const reachLabel = (r) => (r === 'any' ? 'anywhere' : r)
const POWER_REF_LABELS = {
  literal: 'a number',
  manaCost: 'its mana cost',
  thresholdCost: 'its threshold cost',
  totalCost: 'mana + threshold cost',
}
const DURATION_LABELS = {
  permanent: 'until it leaves the realm',
  taps: 'until it taps',
  damaged: 'until it takes damage',
  sourceLeaves: 'while this card stays in the realm',
}
const TOKEN_LABELS = { soldier: 'Foot Soldier', skeleton: 'Skeleton', frog: 'Frog', lance: 'Lance' }

// In a trigger with no pick, "the target" of a location/token is the trigger's
// card -- name it as such.
const noPick = (ability) =>
  ability.kind === 'triggered' && ability.target.mode === 'card' && !ability.target.required
const refName = (ability) => REF_LABELS[ability.trigger?.targets] || REF_LABELS.subject
function locationLabel(ability, l) {
  if (l === 'targetLocation') return noPick(ability) ? `${refName(ability)}'s location` : "the target's location"
  return (
    {
      picked: 'a location the player picks',
      projectileStop: 'where the projectile stopped',
      projectileBeyond: 'the square past the target',
    }[l] || "this card's location"
  )
}
function tokenAtLabel(ability, l) {
  const tgt = noPick(ability) ? refName(ability) : 'the target'
  return {
    self: 'on this unit',
    target: `on ${tgt}`,
    selfSurface: "this card's square (surface)",
    selfBelow: "this card's square (below)",
    targetLocation: `${tgt}'s location`,
    adjacent: 'an adjacent square (picked)',
    nearby: 'a nearby square (picked)',
    anySite: 'any site (picked)',
  }[l]
}

// ---- passive scope <-> area picker ----
const SCOPE_SHAPES = ['self', 'bearer', 'location', 'adjacent', 'nearby', 'realm', 'avatar']
function scopeShape(scope) {
  if (scope === 'self' || scope === 'bearer') return scope
  if (scope.startsWith('aura-area')) return 'location'
  if (scope.startsWith('all')) return 'realm'
  return scope.split('-')[0]
}
const scopeSide = (scope) =>
  scope.endsWith('-friendly') ? 'friendly' : scope.endsWith('-enemy') ? 'enemy' : scope.startsWith('avatar') ? 'friendly' : 'any'
function setScope(ability, shape, side) {
  if (shape === 'self' || shape === 'bearer') return (ability.scope = shape)
  if (shape === 'avatar') return (ability.scope = `avatar-${side === 'enemy' ? 'enemy' : 'friendly'}`)
  const base = shape === 'location' ? 'aura-area' : shape === 'realm' ? 'all' : shape
  ability.scope = side === 'any' ? base : `${base}-${side}`
}
function toggleAffects(ability, kind) {
  const list = ability.passive.affects || (ability.passive.affects = ['units'])
  const i = list.indexOf(kind)
  if (i === -1) list.push(kind)
  else list.splice(i, 1)
}
const costFilterLabel = (f) =>
  f === 'any' ? 'all spells' : f === 'permanent' ? 'permanents (non-magic)' : `${f} spells`
const costOnLabel = (o) =>
  o === 'spells'
    ? 'spells the affected side casts'
    : o === 'abilities'
    ? "the affected cards' activated abilities"
    : "the affected card's own cost"

// ---- effects ----

// Every effect list of an ability, flattened in order: each mode's effects, the
// ability's own, and after each list the "otherwise" list of every conditional
// effect in it. A group's `view` stands in for `ability` in the effect-row
// template: the ability's fields, the target those effects resolve against,
// and the group's own list as `effects` -- so add / retype / remove splice the
// right array.
function effectGroups(ability) {
  const out = []
  const walk = (list, label, target, key, depth) => {
    out.push({ key, label, depth, view: { ...ability, target, effects: list } })
    list.forEach((eff, i) => {
      if (eff.condition && Array.isArray(eff.else))
        walk(eff.else, `${label} › #${i + 1} otherwise`, target, `${key}.${i}`, depth + 1)
    })
  }
  const modes = ability.modes || []
  // A mode that aims nowhere of its own uses the ability's target (abilityView).
  const aim = (t) => (pickOf({ target: t }) || !pickOf(ability) ? t : ability.target)
  modes.forEach((m, i) => walk(m.effects, `If “${m.name}” is chosen, do`, aim(m.target), `m${i}`, 0))
  walk(ability.effects, modes.length ? 'Then, whichever was chosen, do' : 'Do', modes.length ? aim(modes[0].target) : ability.target, 'base', 0)
  return out
}

const allEffects = (ability) => {
  const out = []
  const walk = (list) => (list || []).forEach((e) => (out.push(e), walk(e.else)))
  walk(ability.effects)
  for (const m of ability.modes || []) walk(m.effects)
  return out
}
const hasGrant = (ability) => allEffects(ability).some((e) => e.op === 'grantFrom')
// Any ticked condition ends the form.
function toggleLoseWhen(ability, cond) {
  const list = loseConditions(ability.loseWhen)
  ability.loseWhen = list.includes(cond) ? list.filter((c) => c !== cond) : loseConditions([...list, cond])
}
const pickOf = (view) => view.target.mode === 'card' && !!view.target.required
// An ally fires this view's projectile target, so effects can name it.
const shootsOf = (view) =>
  pickOf(view) && view.target.within === 'projectile' && view.target.shooter === 'ally'

// An effect that repeats something the cost already does.
function dupWarning(ability, eff) {
  if (ability.kind !== 'activated') return ''
  const c = ability.cost
  if (eff.op === 'tap' && eff.who === 'self' && c.tap) return 'Tapping this card is already the cost.'
  if (eff.op === 'adjustStat' && eff.key === 'mana' && eff.side === 'self' && Number(eff.delta) < 0 && c.mana)
    return 'The mana cost is already paid on activation.'
  if (eff.op === 'destroy' && eff.who === 'self' && c.sacrifice === 'self') return 'Sacrificing this card is already the cost.'
  if (eff.op === 'destroy' && eff.who === 'target' && c.sacrifice === 'target') return 'Sacrificing the target is already the cost.'
  if (eff.op === 'discard' && eff.pick === 'count' && eff.side === 'self' && c.discard) return 'Discarding is already the cost.'
  return ''
}

// ---- dialog ----

// A modal rather than an inline panel: authoring abilities is a deliberate
// side-trip. It covers the board and the right column but leaves the left
// column (the card's art in the Card tab) lit, so you see what you write for.
const props = defineProps({ cardId: { type: String, required: true } })
const emit = defineEmits(['close'])

const card = computed(() => state.cards[props.cardId] || null)
const abilities = computed(() => card.value?.abilities || [])
const fromToOptions = ['any', ...ZONE_CATEGORIES]
const KIND_LABELS = { triggered: 'Triggered', activated: 'Activated', passive: 'Passive' }

// The ability shown in the form; the rail picks it.
const currentId = ref(abilities.value[0]?.id || null)
const current = computed(() => abilities.value.find((a) => a.id === currentId.value) || abilities.value[0] || null)

// Per-ability UI toggles (not saved): the raw trigger fields.
const advanced = reactive({})
const presetOf = (ability) => triggerPresetOf(ability.trigger)
function onPreset(ability, key) {
  if (key === 'custom') advanced[ability.id] = true
  else applyTriggerPreset(ability, key)
}
function onStarter(e) {
  const s = ABILITY_STARTERS.find((x) => x.key === e.target.value)
  e.target.value = ''
  if (!s) return
  const id = addAbility(props.cardId, s.kind, s.key)
  if (id) currentId.value = id
}
const moreCosts = (c) =>
  !!(c.discard || c.banish || c.perTurn || ELEMENTS.some((el) => c.threshold[el]))

// The numbered steps of each kind. Keys are fold keys; words are labels only.
const STEPS = {
  triggered: [
    { key: 'when', word: 'When' },
    { key: 'if', word: 'Only if' },
    { key: 'choose', word: 'Choose' },
    { key: 'do', word: 'Do' },
  ],
  activated: [
    { key: 'pay', word: 'Pay' },
    { key: 'choose', word: 'Choose' },
    { key: 'do', word: 'Do' },
  ],
  passive: [
    { key: 'while', word: 'While' },
    { key: 'applies', word: 'Applies to' },
    { key: 'grants', word: 'Grants' },
    { key: 'stops', word: 'Stops' },
  ],
}

// Folded steps and effect groups, keyed `${ability.id}:${section}`. View-only,
// so it lives here rather than on the card: fold the parts you're done with.
const folded = reactive(new Set())
const isOpen = (ability, section) => !folded.has(`${ability.id}:${section}`)
function toggleFold(ability, section) {
  const k = `${ability.id}:${section}`
  if (folded.has(k)) folded.delete(k)
  else folded.add(k)
}

// ---- recaps: one line per folded step, and the footer sentence ----
const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const lower = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s)
const triggerRecap = (a) =>
  presetOf(a) === 'custom'
    ? `${ACTION_LABELS[a.trigger.action] || a.trigger.action}, ${SUBJECT_LABELS[a.trigger.subject] || a.trigger.subject}`
    : TRIGGER_PRESETS[presetOf(a)]?.label || ''
function costRecap(a) {
  const c = a.cost
  const bits = []
  if (c.tap) bits.push('tap')
  if (c.mana) bits.push(`${c.mana} mana`)
  if (c.life) bits.push(`${c.life} life`)
  if (c.sacrifice !== 'none') bits.push(`sacrifice ${c.sacrifice}`)
  return bits.join(', ') || 'free'
}
function targetRecap(a) {
  const t = a.target
  if (t.mode === 'grid') return `a square (${t.shape})`
  if (!t.required) return 'nothing'
  const shot = t.within === 'projectile' ? (t.shooter === 'ally' ? ', shot by an ally' : ', projectile') : ''
  return `${t.count > 1 ? `${t.count}× ` : ''}${FILTER_LABELS[t.filter] || t.filter} in ${t.from}${shot}`
}
const effectsRecap = (list) => (list || []).map((e) => OP_LABELS[e.op] || e.op).join(', ') || 'nothing'

// "Genesis — when this enters the realm" -> "when this enters the realm".
const whenPhrase = (a) =>
  presetOf(a) === 'custom' ? `when ${triggerRecap(a)}` : lower(triggerRecap(a).split(' — ').pop())
const chooseRecap = (a) => {
  const n = a.modes?.length || 0
  return n ? `${targetRecap(a)}; the player picks ${a.chooseCount || 1} of ${n} modes` : targetRecap(a)
}
function doRecap(a) {
  const parts = (a.modes || []).map((m) => `${m.name || 'untitled mode'}: ${effectsRecap(m.effects)}`)
  if (a.effects?.length || !parts.length) parts.push(effectsRecap(a.effects))
  return parts.join('; ')
}
const SCOPE_WORDS = {
  self: 'this card',
  bearer: 'whoever carries this',
  location: 'cards here',
  adjacent: 'adjacent cards',
  nearby: 'nearby cards',
  realm: 'every card in the realm',
  avatar: 'the Avatar',
}
function scopeRecap(a) {
  const shape = scopeShape(a.scope)
  const side = scopeSide(a.scope)
  if (shape === 'self' || shape === 'bearer') return SCOPE_WORDS[shape]
  if (shape === 'avatar') return side === 'enemy' ? "the opponent's Avatar" : 'your Avatar'
  const who = side === 'friendly' ? 'your ' : side === 'enemy' ? "the opponent's " : ''
  return `${who}${SCOPE_WORDS[shape]}`
}
function grantsRecap(a) {
  const p = a.passive
  const bits = [...p.keywords]
  if (p.ranged) bits.push(`ranged ${p.ranged}`)
  if (p.strength) bits.push(`power ${p.strength > 0 ? '+' : ''}${p.strength}`)
  if (p.movement) bits.push(`movement ${p.movement > 0 ? '+' : ''}${p.movement}`)
  if (a.scope === 'self' && p.animate) bits.push('animate')
  if (p.costMod) bits.push(`costs ${p.costMod > 0 ? '+' : ''}${p.costMod} mana`)
  const aff = ELEMENTS.filter((el) => p.affinity[el]).map((el) => `${p.affinity[el]} ${el}`)
  if (aff.length) bits.push(`affinity ${aff.join(' ')}`)
  return bits.join(', ') || 'nothing'
}
const STOP_WORDS = {
  cantAttack: "can't attack",
  cantMove: "can't move",
  cantDefend: "can't move to defend",
  cantBeTargeted: "can't be targeted by opponents",
  silence: 'silenced',
  disable: 'disabled',
  summonOnEnemySites: 'summons to enemy sites',
  swapCemeteries: 'cemeteries swapped',
}
function stopsRecap(a) {
  const bits = Object.keys(STOP_WORDS).filter((k) => a.passive[k]).map((k) => STOP_WORDS[k])
  if (a.passive.cemeteryTax) bits.push(`cemetery tax +${a.passive.cemeteryTax}`)
  return bits.join(', ') || 'nothing'
}
function stepRecap(a, key) {
  switch (key) {
    case 'when': return triggerRecap(a)
    case 'if':
    case 'while': return capital(condRecap(a.condition))
    case 'pay': return capital(costRecap(a))
    case 'choose': return capital(chooseRecap(a))
    case 'do': return capital(doRecap(a))
    case 'applies': return capital(scopeRecap(a))
    case 'grants': return capital(grantsRecap(a))
    case 'stops': return capital(stopsRecap(a))
  }
  return ''
}
// The whole ability as one plain sentence, built from the step recaps.
const doText = (a) => (doRecap(a) === 'nothing' ? 'do nothing yet' : doRecap(a))
function sentence(a) {
  const always = a.condition?.type === 'always'
  if (a.kind === 'passive') {
    const lead = always ? '' : `while ${condRecap(a.condition)}, `
    const stops = stopsRecap(a)
    const one = ['self', 'bearer', 'avatar'].includes(scopeShape(a.scope))
    return capital(`${lead}${scopeRecap(a)} ${one ? 'gets' : 'get'} ${grantsRecap(a)}${stops === 'nothing' ? '' : `; ${stops}`}.`)
  }
  const choose = targetRecap(a) === 'nothing' && !a.modes?.length ? '' : `choose ${chooseRecap(a)}, then `
  if (a.kind === 'activated') return capital(`${costRecap(a) === 'free' ? 'free' : `pay ${costRecap(a)}`}: ${choose}${doText(a)}.`)
  const cond = always ? '' : `, only if ${condRecap(a.condition)}`
  return capital(`${whenPhrase(a)}${cond}: ${choose}${doText(a)}.`)
}
function railRecap(a) {
  if (a.kind === 'triggered') return `Triggered, ${whenPhrase(a)}`
  if (a.kind === 'activated') return `Activated, ${costRecap(a)}`
  return `Passive, ${scopeRecap(a)}`
}

// ---- delete (asks first) ----
const confirmingDelete = ref(false)
const deleteBtn = ref(null)
watch(currentId, () => (confirmingDelete.value = false))
function onConfirmDelete() {
  const a = current.value
  if (!a) return
  const i = abilities.value.indexOf(a)
  removeAbility(props.cardId, a.id)
  confirmingDelete.value = false
  currentId.value = abilities.value[Math.min(i, abilities.value.length - 1)]?.id || null
  nextTick(focusFirst)
}
function onCancelDelete() {
  confirmingDelete.value = false
  nextTick(() => deleteBtn.value?.focus())
}

// ---- modal plumbing: placement beside the left column, focus trap, Esc ----
const root = ref(null)
const dialog = ref(null)
const hole = ref(null) // the left column's box, left undimmed
const opener = typeof document !== 'undefined' ? document.activeElement : null
let col = null
let ro = null

function measure() {
  const r = col?.getBoundingClientRect()
  // Only when the column really sits at the left as a column (not a folded
  // rail or a narrow drawer) -- else dim everything and centre the dialog.
  hole.value =
    r && r.width > 120 && r.height > 0 && r.right < window.innerWidth * 0.5
      ? { top: r.top, left: r.left, width: r.width, height: r.height }
      : null
}
const holeStyle = computed(() =>
  hole.value && {
    top: `${hole.value.top}px`,
    left: `${hole.value.left}px`,
    width: `${hole.value.width}px`,
    height: `${hole.value.height}px`,
  }
)
const regionStyle = computed(() =>
  hole.value
    ? { left: `${hole.value.left + hole.value.width}px`, top: `${Math.max(16, hole.value.top)}px` }
    : { left: '0px', top: '4vh' }
)

const FOCUSABLE = 'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'
const focusables = () =>
  [...(dialog.value?.querySelectorAll(FOCUSABLE) || [])].filter(
    (el) => !el.disabled && el.getClientRects().length
  )
function focusFirst() {
  // The ability's name, or "Add an ability…" while there are none.
  const el =
    dialog.value?.querySelector('.form input, .form select') ||
    dialog.value?.querySelector('.rail select') ||
    focusables()[0]
  el?.focus()
}
function onKeydown(e) {
  if (e.key === 'Escape') {
    // Only the dialog closes: App's window-level Esc would also put the card
    // down, unmounting the Abilities button focus should return to.
    e.preventDefault()
    e.stopPropagation()
    emit('close')
    return
  }
  if (e.key !== 'Tab') return
  const list = focusables()
  if (!list.length) return
  const first = list[0]
  const last = list[list.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}
// Focus that lands outside (a click on the lit column, a script) comes back.
function onFocusIn(e) {
  if (dialog.value && !dialog.value.contains(e.target)) focusFirst()
}

onMounted(() => {
  col = root.value?.closest('.area-left') || document.querySelector('.area-left')
  measure()
  window.addEventListener('resize', measure)
  if (col && typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(measure)
    ro.observe(col)
  }
  document.addEventListener('focusin', onFocusIn)
  nextTick(focusFirst)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', measure)
  document.removeEventListener('focusin', onFocusIn)
  ro?.disconnect()
  // Back to whatever opened the dialog (the Abilities button).
  if (opener?.isConnected) nextTick(() => opener.focus())
})

let uid = 0
const ids = { name: `ab-name-${++uid}`, text: `ab-text-${uid}`, add: `ab-add-${uid}`, title: `ab-title-${uid}` }
</script>

<template>
  <div ref="root" class="ability-modal">
    <div class="backdrop" :class="{ full: !hole }" @click="emit('close')"></div>
    <div v-if="hole" class="hole" :style="holeStyle" aria-hidden="true"></div>
    <div class="region" :style="regionStyle">
      <div
        ref="dialog"
        class="ability-dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="ids.title"
        @keydown="onKeydown"
      >
        <header class="dh">
          <span
            v-if="card?.img"
            class="head-art"
            role="img"
            :aria-label="cardName(cardId)"
            :style="{ backgroundImage: `url('${card.img}')` }"
          ></span>
          <span v-else class="sr-only">{{ cardName(cardId) }}</span>
          <h2 :id="ids.title">Abilities</h2>
          <span class="help">Changes apply as you type.</span>
          <button type="button" class="btn primary" @click="emit('close')">Done</button>
        </header>

        <div class="abx">
          <nav class="rail" aria-label="Abilities of this card">
            <button
              v-for="a in abilities"
              :key="a.id"
              type="button"
              class="it"
              :aria-current="current && a.id === current.id ? 'true' : undefined"
              @click="currentId = a.id"
            >
              <b>{{ a.name || 'Untitled ability' }}</b>
              <span>{{ railRecap(a) }}</span>
            </button>
            <label class="sr-only" :for="ids.add">Add an ability</label>
            <select :id="ids.add" class="text-input starter" value="" @change="onStarter">
              <option value="" disabled>Add an ability…</option>
              <optgroup label="Triggered (fires by itself)">
                <option v-for="s in ABILITY_STARTERS.filter((x) => x.kind === 'triggered')" :key="s.key" :value="s.key">{{ s.label }}</option>
              </optgroup>
              <optgroup label="Activated / passive">
                <option v-for="s in ABILITY_STARTERS.filter((x) => x.kind !== 'triggered')" :key="s.key" :value="s.key">{{ s.label }}</option>
              </optgroup>
            </select>
            <div class="rail-sp"></div>
            <details class="more tips">
              <summary>Tips</summary>
              <ul class="hint">
                <li>
                  <em>Adjacent</em> and <em>nearby</em> include the card's own square (rulebook glossary); tick
                  "other than this card" to leave the card itself out. Areas stay in the card's own region.
                </li>
                <li>
                  A spell measures areas from the square it was dropped on, else its caster; a Deathrite from the square
                  the card died on. A Ward protects each card an effect would hit.
                </li>
                <li>
                  In a trigger, <em>the triggering card</em> is the one it is about (the one that entered, died,
                  attacked…); <em>the other card involved</em> is its opponent in the action (e.g. the attacker for
                  "when this is attacked").
                </li>
                <li>
                  Effects run automatically and reverse on undo. A <em>move</em>, <em>reanimate</em> or token at a
                  picked location asks the player for a square after any target.
                </li>
                <li>
                  "Assume form": an activated ability that chooses a card, with an <em>assume form</em> effect; set when
                  it is lost. "Banish three spells to cast one": choose 3 spells in the cemetery, then
                  <em>banish picked cards, cast one</em>.
                </li>
                <li>
                  <em>Avatar</em> hits that side's Avatar card, on the board or kept off it as a life stat; with no Avatar
                  card use <em>change life</em>. <em>Gain control</em> is undone by undo, a reset and a save.
                </li>
              </ul>
            </details>
          </nav>

          <div class="form">
            <div v-if="!current" class="empty-box">
              <b>No abilities yet</b>
              Start from Genesis, Deathrite, a "Tap: …" ability or a passive with "Add an ability…". You can change
              everything afterwards.
            </div>

            <template v-else>
              <div class="name-row">
                <div class="grow">
                  <label class="flabel" :for="ids.name">Name <span class="lo">— shown to players when it fires</span></label>
                  <input :id="ids.name" v-model="current.name" class="text-input" placeholder="Ability name (e.g. Assume Form)" />
                </div>
                <span class="kindtag">{{ KIND_LABELS[current.kind] || current.kind }}</span>
              </div>
              <div>
                <label class="flabel" :for="ids.text">Rules text <span class="lo">— shown when it fires or is activated</span></label>
                <textarea
                  :id="ids.text"
                  v-model="current.text"
                  class="text-input text-area"
                  rows="2"
                  placeholder="Rules text shown to the player when this fires / is activated."
                ></textarea>
              </div>

              <ol class="steps">
                <li
                  v-for="(s, si) in STEPS[current.kind] || STEPS.passive"
                  :key="`${current.id}:${s.key}`"
                  class="step"
                  :class="{ folded: !isOpen(current, s.key) }"
                >
                  <span class="n" aria-hidden="true">{{ si + 1 }}</span>
                  <button
                    type="button"
                    class="w"
                    :aria-expanded="isOpen(current, s.key)"
                    :title="isOpen(current, s.key) ? 'Fold this step' : 'Open this step'"
                    @click="toggleFold(current, s.key)"
                  >
                    <span class="sr-only">Step {{ si + 1 }}:</span>{{ s.word }}
                    <span class="caret" aria-hidden="true">{{ isOpen(current, s.key) ? '▾' : '▸' }}</span>
                  </button>
                  <Transition name="fold" mode="out-in">
                    <div v-if="!isOpen(current, s.key)" key="folded" class="f">
                      <button type="button" class="recap" aria-expanded="false" @click="toggleFold(current, s.key)">
                        <span class="recap-text">{{ stepRecap(current, s.key) }}</span>
                        <span class="lo">Change ▾</span>
                      </button>
                    </div>
                    <div v-else key="open" class="f">
                      <!-- ============ 1 When (triggered) ============ -->
                      <template v-if="s.key === 'when'">
                        <div class="sent">
                          <select
                            :value="presetOf(current)"
                            class="text-input wide"
                            aria-label="When"
                            @change="onPreset(current, $event.target.value)"
                          >
                            <option v-for="(p, key) in TRIGGER_PRESETS" :key="key" :value="key">{{ p.label }}</option>
                            <option value="custom">Custom…</option>
                          </select>
                          <button
                            type="button"
                            class="btn small"
                            :aria-pressed="!!advanced[current.id]"
                            @click="advanced[current.id] = !advanced[current.id]"
                          >
                            {{ advanced[current.id] ? '✓ ' : '' }}Advanced
                          </button>
                        </div>
                        <div v-if="advanced[current.id] || presetOf(current) === 'custom'" class="advanced">
                          <div class="sent">
                            <span class="w2">when</span>
                            <select v-model="current.trigger.action" class="text-input" aria-label="What happens">
                              <option v-for="a in TRIGGER_ACTIONS" :key="a" :value="a">{{ ACTION_LABELS[a] || a }}</option>
                            </select>
                            <span class="w2">and</span>
                            <select v-model="current.trigger.subject" class="text-input" title="Whose action it must be">
                              <option v-for="sub in TRIGGER_SUBJECTS" :key="sub" :value="sub">{{ SUBJECT_LABELS[sub] }}</option>
                            </select>
                            <template v-if="TARGETED_TRIGGER_ACTIONS.includes(current.trigger.action)">
                              <select v-model="current.trigger.role" class="text-input" aria-label="Role">
                                <option v-for="r in TRIGGER_ROLES" :key="r" :value="r">{{ ROLE_LABELS[r] }}</option>
                              </select>
                            </template>
                          </div>
                          <div class="sent">
                            <span class="w2">that card is</span>
                            <select v-model="current.trigger.filter" class="text-input" title="What kind of card it must be">
                              <option v-for="f in TARGET_FILTERS" :key="f" :value="f">{{ f === 'any' ? 'any kind' : FILTER_LABELS[f] }}</option>
                            </select>
                            <AreaPicker v-model:shape="current.trigger.within" :shapes="['any', 'adjacent', 'nearby']" />
                            <span class="w2">of this card</span>
                          </div>
                          <div
                            v-if="current.trigger.action === 'move' || current.trigger.from !== 'any' || current.trigger.to !== 'any'"
                            class="sent"
                          >
                            <span class="w2">moving from</span>
                            <select v-model="current.trigger.from" class="text-input" aria-label="Moving from">
                              <option v-for="z in fromToOptions" :key="z" :value="z">{{ z }}</option>
                            </select>
                            <span class="w2">to</span>
                            <select v-model="current.trigger.to" class="text-input" aria-label="Moving to">
                              <option v-for="z in fromToOptions" :key="z" :value="z">{{ z }}</option>
                            </select>
                          </div>
                          <div v-if="TARGETED_TRIGGER_ACTIONS.includes(current.trigger.action)" class="sent">
                            <span class="w2">"the target's location" / tokens "on the target" mean</span>
                            <select v-model="current.trigger.targets" class="text-input" aria-label="The target means">
                              <option v-for="r in TRIGGER_TARGET_REFS" :key="r" :value="r">{{ REF_LABELS[r] }}</option>
                            </select>
                          </div>
                          <div v-if="current.trigger.subject !== 'self'" class="sent">
                            <span class="w2">also listens while this card is in</span>
                            <label v-for="cat in ZONE_CATEGORIES.filter((c) => c !== 'realm')" :key="cat" class="chk">
                              <input type="checkbox" :checked="current.zones.includes(cat)" @change="toggleAbilityZone(current, cat)" />
                              {{ cat }}
                            </label>
                          </div>
                        </div>
                      </template>

                      <!-- ============ Only if (triggered) / While (passive) ============ -->
                      <div v-else-if="s.key === 'if'" class="sent">
                        <ConditionEditor :cond="current.condition" :triggered="true" :pick="pickOf(current)" />
                      </div>
                      <div v-else-if="s.key === 'while'" class="sent">
                        <ConditionEditor :cond="current.condition" :passive="true" />
                      </div>

                      <!-- ============ 1 Pay (activated) ============ -->
                      <template v-else-if="s.key === 'pay'">
                        <div class="sent">
                          <label class="chk"><input v-model="current.cost.tap" type="checkbox" /> tap this card</label>
                          <label class="chk">
                            <input v-model.number="current.cost.mana" type="number" min="0" class="text-input num" /> mana
                          </label>
                          <label class="chk">
                            <input v-model.number="current.cost.life" type="number" min="0" class="text-input num" /> life
                          </label>
                        </div>
                        <div class="sent">
                          <label class="chk">
                            <span class="w2">sacrifice</span>
                            <select v-model="current.cost.sacrifice" class="text-input">
                              <option v-for="c in SACRIFICE_COSTS" :key="c" :value="c">{{ SACRIFICE_LABELS[c] }}</option>
                            </select>
                          </label>
                        </div>
                        <p v-if="current.cost.sacrifice === 'target'" class="warnline">
                          Sacrificing the target needs "choose a card" below; only your own non-avatar cards in play can be picked.
                        </p>
                        <details class="more" :open="moreCosts(current.cost)">
                          <summary>More costs, limits and zones</summary>
                          <div class="sent">
                            <label class="chk">discard <input v-model.number="current.cost.discard" type="number" min="0" class="text-input num" /></label>
                            <label class="chk">banish from cemetery <input v-model.number="current.cost.banish" type="number" min="0" class="text-input num" /></label>
                            <label class="chk" title="0 = unlimited. A puzzle is a single turn, so this is per attempt.">
                              uses per turn <input v-model.number="current.cost.perTurn" type="number" min="0" class="text-input num" />
                            </label>
                          </div>
                          <p v-if="current.cost.discard || current.cost.banish" class="help">
                            Discard / banish costs take the first cards in your hand / cemetery (no choice yet).
                          </p>
                          <p class="help">Uses per turn: 0 = unlimited. A puzzle is a single turn, so this is per attempt.</p>
                          <div class="sent" title="Elemental threshold needed to activate (checked, not spent)">
                            <span class="w2">needs threshold</span>
                            <label v-for="el in ELEMENTS" :key="el" class="chk">
                              {{ el }} <input v-model.number="current.cost.threshold[el]" type="number" min="0" class="text-input num" />
                            </label>
                          </div>
                          <p class="help">Threshold is checked, not spent.</p>
                          <div class="sent">
                            <span class="w2">usable while this card is in</span>
                            <label v-for="cat in ZONE_CATEGORIES" :key="cat" class="chk">
                              <input type="checkbox" :checked="current.zones.includes(cat)" @change="toggleAbilityZone(current, cat)" />
                              {{ cat }}
                            </label>
                          </div>
                        </details>
                      </template>

                      <!-- ============ Choose (triggered + activated) ============ -->
                      <template v-else-if="s.key === 'choose'">
                        <TargetEditor
                          :t="current.target"
                          :triggered="current.kind === 'triggered'"
                          label="Choose"
                          hide-label
                          @pick="current.kind === 'triggered' && setTriggerPick(current, $event)"
                        />
                        <details class="more" :open="!!current.modes?.length">
                          <summary>“Choose one…” modes{{ current.modes?.length ? ` (${current.modes.length})` : '' }}</summary>
                          <p v-if="!current.modes?.length" class="help">
                            None — the ability just does its effects. Add modes to make the player choose between them first.
                          </p>
                          <label v-else class="chk">
                            player chooses
                            <input v-model.number="current.chooseCount" type="number" min="1" :max="current.modes.length" class="text-input num" />
                            of them
                          </label>
                          <div v-for="(m, mi) in current.modes || []" :key="mi" class="mode-block">
                            <div class="sent">
                              <input v-model="m.name" class="text-input grow" placeholder="Mode name (shown to the player)" aria-label="Mode name" />
                              <button type="button" class="iconbtn del" :aria-label="`Remove mode ${m.name || mi + 1}`" title="Remove mode" @click="removeMode(current, mi)">✕</button>
                            </div>
                            <TargetEditor :t="m.target" :triggered="current.kind === 'triggered'" label="Aims at" />
                          </div>
                          <button type="button" class="btn small" @click="addMode(current)">+ Add mode</button>
                        </details>
                      </template>

                      <!-- ============ Do (triggered + activated) ============ -->
                      <template v-else-if="s.key === 'do'">
                        <template v-for="grp in effectGroups(current)" :key="grp.key">
                          <button
                            v-if="effectGroups(current).length > 1"
                            type="button"
                            class="group-head"
                            :class="{ else: grp.depth }"
                            :aria-expanded="isOpen(current, `fx:${grp.key}`)"
                            @click="toggleFold(current, `fx:${grp.key}`)"
                          >
                            <span class="caret" aria-hidden="true">{{ isOpen(current, `fx:${grp.key}`) ? '▾' : '▸' }}</span>
                            <span class="group-label">{{ grp.label }}</span>
                            <span v-if="!isOpen(current, `fx:${grp.key}`)" class="lo group-recap">{{ effectsRecap(grp.view.effects) }}</span>
                          </button>
                          <!-- eslint-disable-next-line vue/valid-v-for -- a 0/1-item list used as a local alias; keyed by its group -->
                          <template v-for="view in isOpen(current, `fx:${grp.key}`) ? [grp.view] : []" :key="grp.key">
                            <div v-for="(eff, i) in view.effects" :key="i" class="fx">
                              <select :value="opValue(eff)" class="text-input op" aria-label="Effect" @change="onOpChange(view, i, $event.target.value)">
                                <option v-for="op in pickerOps" :key="op" :value="op">{{ OP_LABELS[op] || op }}</option>
                                <option v-if="!pickerOps.includes(opValue(eff))" :value="opValue(eff)">{{ opValue(eff) }}</option>
                              </select>

                              <template v-if="eff.op === 'adjustStat'">
                                <select v-model="eff.side" class="text-input">
                                  <option v-for="s in STAT_SIDES" :key="s" :value="s">{{ s }}</option>
                                </select>
                                <select v-model="eff.key" class="text-input">
                                  <option v-for="k in STAT_KEYS" :key="k" :value="k">{{ k }}</option>
                                </select>
                                <input v-model.number="eff.delta" type="number" class="text-input num" />
                              </template>

                              <template v-else-if="SEND_OPS[eff.op]">
                                <EffectSelector :sel="eff" :grid="view.target.mode === 'grid'" :triggered="view.kind === 'triggered'" :pick="pickOf(view)" :shooter="shootsOf(view)" />
                                <span class="hint effect-note">to</span>
                                <select :value="SEND_OPS[eff.op]" class="text-input" @change="eff.op = SEND_TO_OP[$event.target.value]">
                                  <option v-for="(label, d) in SEND_LABELS" :key="d" :value="d">{{ label }}</option>
                                </select>
                              </template>

                              <template v-else-if="['dealDamage', 'modifyStrength', 'addCounter', 'removeCounter', 'preventDamage'].includes(eff.op)">
                                <EffectSelector :sel="eff" :grid="view.target.mode === 'grid'" :triggered="view.kind === 'triggered'" :pick="pickOf(view)" :shooter="shootsOf(view)" />
                                <input
                                  v-if="eff.op === 'addCounter' || eff.op === 'removeCounter'"
                                  v-model="eff.name"
                                  class="text-input"
                                  placeholder="counter name"
                                  title="Counter name. 'shield' counters prevent damage"
                                />
                                <span class="hint effect-note">{{ eff.op === 'preventDamage' ? 'prevent the next' : eff.op === 'dealDamage' ? 'amount' : 'by' }}</span>
                                <select :value="eff.amountRef || 'literal'" class="text-input" @change="setAmountRef(eff, $event.target.value)">
                                  <option v-for="r in AMOUNT_REFS" :key="r" :value="r">{{ amountRefLabel(r) }}</option>
                                </select>
                                <input v-if="!eff.amountRef || eff.amountRef === 'literal'" v-model.number="eff.amount" type="number" class="text-input num" />
                                <input v-if="eff.amountRef === 'counter'" v-model="eff.counterName" class="text-input" placeholder="counter name" title="Which named counter to total" />
                                <EffectSelector
                                  v-if="(eff.amountRef === 'count' || eff.amountRef === 'counter') && eff.countOf"
                                  :sel="eff.countOf"
                                  :grid="view.target.mode === 'grid'"
                                  :triggered="view.kind === 'triggered'"
                                  :pick="pickOf(view)" :shooter="shootsOf(view)"
                                />
                                <span v-if="eff.op === 'preventDamage'" class="hint effect-note">damage</span>
                              </template>

                              <template v-else-if="eff.op === 'strike'">
                                <select
                                  v-if="shootsOf(view) || eff.by === 'shooter'"
                                  :value="eff.by || 'self'"
                                  class="text-input"
                                  title="Who deals the blow"
                                  @change="$event.target.value === 'shooter' ? (eff.by = 'shooter') : delete eff.by"
                                >
                                  <option v-for="b in STRIKE_BY" :key="b" :value="b">{{ b === 'shooter' ? 'the ally who shot' : 'this unit' }}</option>
                                </select>
                                <span v-else class="hint effect-note">this unit</span>
                                <span class="hint effect-note">strikes</span>
                                <EffectSelector :sel="eff" :grid="view.target.mode === 'grid'" :triggered="view.kind === 'triggered'" :pick="pickOf(view)" :shooter="shootsOf(view)" />
                                <span class="hint effect-note">for its power (+Lance)</span>
                              </template>

                              <template v-else-if="eff.op === 'move'">
                                <select
                                  :value="eff.kind || 'teleport'"
                                  class="text-input"
                                  title="Both are forced movement: the unit takes no step, so Immobile doesn't stop it"
                                  @change="setMoveKind(eff, $event.target.value)"
                                >
                                  <option v-for="k in MOVE_KINDS" :key="k" :value="k">{{ k === 'teleport' ? 'teleport' : 'push / pull' }}</option>
                                </select>
                                <EffectSelector :sel="eff" :grid="view.target.mode === 'grid'" :triggered="view.kind === 'triggered'" :pick="pickOf(view)" :shooter="shootsOf(view)" />
                                <span class="hint effect-note">to</span>
                                <select v-model="eff.to" class="text-input">
                                  <option v-for="l in LOCATION_REFS" :key="l" :value="l">{{ locationLabel(view, l) }}</option>
                                </select>
                                <select
                                  v-if="eff.to === 'picked' && view.target.mode !== 'grid'"
                                  v-model="eff.reach"
                                  class="text-input"
                                  title="How far from the moving unit the destination may be"
                                >
                                  <option v-for="r in MOVE_REACH" :key="r" :value="r">{{ reachLabel(r) }}</option>
                                </select>
                                <label class="chk" title="Teleports may change region (surface, underground, underwater, void) by default; other forced movement may not">
                                  <input v-model="eff.crossRegions" type="checkbox" /> may change region
                                </label>
                              </template>

                              <template v-else-if="eff.op === 'summonToken'">
                                <select :value="eff.token" class="text-input" @change="setTokenKind(eff, $event.target.value)">
                                  <option v-for="k in TOKEN_KINDS" :key="k" :value="k">{{ TOKEN_LABELS[k] }}</option>
                                </select>
                                <span class="hint effect-note">×</span>
                                <input v-model.number="eff.count" type="number" min="1" class="text-input num" title="How many tokens" />
                                <span class="hint effect-note">at</span>
                                <select v-model="eff.at" class="text-input">
                                  <option v-for="l in tokenLocationsFor(eff.token)" :key="l" :value="l">{{ tokenAtLabel(view, l) }}</option>
                                </select>
                                <template v-if="['soldier', 'skeleton', 'frog'].includes(eff.token)">
                                  <span class="hint effect-note">power</span>
                                  <input v-model.number="eff.power" type="number" min="0" class="text-input num" />
                                </template>
                                <select v-model="eff.side" class="text-input" title="Who controls the token">
                                  <option value="self">yours</option>
                                  <option value="enemy">opponent's</option>
                                </select>
                              </template>

                              <template v-else-if="['heal', 'tap', 'untap', 'gainControl'].includes(eff.op)">
                                <EffectSelector :sel="eff" :grid="view.target.mode === 'grid'" :triggered="view.kind === 'triggered'" :pick="pickOf(view)" :shooter="shootsOf(view)" />
                                <span v-if="eff.op === 'gainControl'" class="hint effect-note">— joins your side</span>
                              </template>

                              <template v-else-if="eff.op === 'grantKeyword'">
                                <EffectSelector :sel="eff" :grid="view.target.mode === 'grid'" :triggered="view.kind === 'triggered'" :pick="pickOf(view)" :shooter="shootsOf(view)" />
                                <select v-model="eff.keyword" class="text-input">
                                  <option v-for="k in KEYWORDS" :key="k" :value="k">{{ k }}</option>
                                </select>
                              </template>

                              <template v-else-if="eff.op === 'banishAndCast'">
                                <span class="hint effect-note">banish the picked cards; the one you choose may be cast</span>
                                <label class="chk"><input v-model="eff.free" type="checkbox" /> for free</label>
                              </template>

                              <template v-else-if="eff.op === 'animate'">
                                <EffectSelector :sel="eff" :grid="view.target.mode === 'grid'" :triggered="view.kind === 'triggered'" :pick="pickOf(view)" :shooter="shootsOf(view)" />
                                <span class="hint effect-note">becomes a minion, power</span>
                                <select v-model="eff.powerRef" class="text-input">
                                  <option v-for="r in ANIMATE_POWER_REFS" :key="r" :value="r">{{ POWER_REF_LABELS[r] }}</option>
                                </select>
                                <input v-if="(eff.powerRef || 'literal') === 'literal'" v-model.number="eff.power" type="number" min="0" class="text-input num" />
                                <template v-else>
                                  <span class="hint effect-note">+</span>
                                  <input v-model.number="eff.powerBonus" type="number" class="text-input num" title="Added to the cost" />
                                </template>
                                <select v-model="eff.duration" class="text-input" title="How long the animation lasts">
                                  <option
                                    v-for="d in ANIMATE_DURATIONS.filter((d) => d !== 'sourceLeaves' || eff.who !== 'self' || eff.duration === d)"
                                    :key="d"
                                    :value="d"
                                  >
                                    {{ DURATION_LABELS[d] }}
                                  </option>
                                </select>
                              </template>

                              <template v-else-if="eff.op === 'flood' || eff.op === 'unflood'">
                                <EffectSelector :sel="eff" :grid="view.target.mode === 'grid'" :triggered="view.kind === 'triggered'" :pick="pickOf(view)" :shooter="shootsOf(view)" suffix="'s site" />
                                <span v-if="view.target.mode === 'grid' && (eff.who === 'self' || eff.who === 'target')" class="hint effect-note">
                                  — every site the target covers
                                </span>
                                <label
                                  v-if="eff.op === 'unflood' && !(view.target.mode === 'grid' && (eff.who === 'self' || eff.who === 'target'))"
                                  class="chk"
                                  title="Drain the whole orthogonally connected body of water, not just this site"
                                >
                                  <input type="checkbox" :checked="eff.scope === 'body'" @change="eff.scope = $event.target.checked ? 'body' : 'site'" />
                                  whole body of water
                                </label>
                              </template>

                              <template v-else-if="eff.op === 'draw'">
                                <select v-model="eff.side" class="text-input" title="Who draws">
                                  <option v-for="d in EFFECT_SIDES" :key="d" :value="d">{{ SIDE_LABELS[d] }}</option>
                                </select>
                                <input v-model.number="eff.count" type="number" min="1" class="text-input num" title="How many cards" />
                                <span class="hint effect-note">from</span>
                                <select v-model="eff.deck" class="text-input">
                                  <option v-for="d in DECKS" :key="d" :value="d">{{ d }}</option>
                                </select>
                              </template>

                              <template v-else-if="eff.op === 'discard'">
                                <select v-model="eff.pick" class="text-input" title="Which cards are discarded">
                                  <option v-for="d in DISCARD_PICKS" :key="d" :value="d">{{ d === 'chosen' ? 'the chosen card(s)' : 'cards from a hand' }}</option>
                                </select>
                                <EffectSelector v-if="eff.pick === 'chosen'" :sel="eff" :grid="view.target.mode === 'grid'" :triggered="view.kind === 'triggered'" :pick="pickOf(view)" :shooter="shootsOf(view)" />
                                <template v-else>
                                  <select v-model="eff.side" class="text-input" title="Whose hand">
                                    <option v-for="d in EFFECT_SIDES" :key="d" :value="d">{{ SIDE_LABELS[d] }}</option>
                                  </select>
                                  <input v-model.number="eff.count" type="number" min="1" class="text-input num" />
                                  <span class="hint effect-note">(the first in hand order)</span>
                                </template>
                              </template>

                              <template v-else-if="eff.op === 'search'">
                                <select v-model="eff.side" class="text-input" title="Whose deck">
                                  <option v-for="d in EFFECT_SIDES" :key="d" :value="d">{{ SIDE_LABELS[d] }}</option>
                                </select>
                                <select v-model="eff.deck" class="text-input">
                                  <option v-for="d in DECKS" :key="d" :value="d">{{ d }}</option>
                                </select>
                                <span class="hint effect-note">for a</span>
                                <select v-model="eff.filter" class="text-input">
                                  <option v-for="f in TARGET_FILTERS" :key="f" :value="f">{{ FILTER_LABELS[f] }}</option>
                                </select>
                                <span class="hint effect-note">— first match from the top, to hand</span>
                              </template>

                              <template v-else-if="eff.op === 'reanimate'">
                                <EffectSelector :sel="eff" :grid="view.target.mode === 'grid'" :triggered="view.kind === 'triggered'" :pick="pickOf(view)" :shooter="shootsOf(view)" />
                                <span class="hint effect-note">to</span>
                                <select v-if="view.target.mode !== 'grid'" v-model="eff.reach" class="text-input" title="Where the picked summon location may be, relative to this card">
                                  <option v-for="r in REANIMATE_REACH" :key="r" :value="r">{{ r === 'any' ? 'a picked location' : `a picked ${r} location` }}</option>
                                </select>
                                <span v-else class="hint effect-note">the picked square</span>
                              </template>

                              <template v-else-if="eff.op === 'swap'">
                                <span class="hint effect-note">this unit with</span>
                                <EffectSelector :sel="eff" :grid="view.target.mode === 'grid'" :triggered="view.kind === 'triggered'" :pick="pickOf(view)" :shooter="shootsOf(view)" />
                              </template>

                              <template v-else-if="eff.op === 'grantFrom'">
                                <span class="hint effect-note">carries the target and gains its abilities; when lost it goes</span>
                                <select v-model="eff.releaseTo" class="text-input" title="Where the carried card goes when the ability is lost">
                                  <option v-for="r in GRANT_RELEASE" :key="r" :value="r">{{ GRANT_RELEASE_LABELS[r] }}</option>
                                </select>
                              </template>

                              <span v-else-if="eff.op === 'release'" class="hint effect-note">releases assumed forms</span>

                              <span class="fx-sp"></span>
                              <button
                                v-if="!eff.condition"
                                type="button"
                                class="btn small"
                                title="Only resolve this effect if a condition holds (else run other effects)"
                                @click="setEffectCondition(eff, 'damaged')"
                              >
                                Only if…
                              </button>
                              <button type="button" class="iconbtn del" aria-label="Remove this effect" title="Remove effect" @click="removeEffect(view, i)">✕</button>
                              <p v-if="dupWarning(view, eff)" class="warnline">{{ dupWarning(view, eff) }}</p>
                              <p v-if="eff.op === 'animate' && eff.who === 'self' && eff.duration === 'sourceLeaves'" class="warnline">
                                Same as a passive "is a minion (animate)" — prefer that.
                              </p>
                              <div v-if="eff.condition" class="effect-if">
                                <span class="w2">only if</span>
                                <ConditionEditor :cond="eff.condition" :triggered="view.kind === 'triggered'" :pick="pickOf(view)" />
                                <button type="button" class="iconbtn" aria-label="Drop the condition" title="Drop the condition" @click="setEffectCondition(eff, 'always')">✕</button>
                              </div>
                            </div>
                            <div class="sent">
                              <button type="button" class="btn small" @click="addEffect(view)">+ Add effect</button>
                            </div>
                          </template>
                        </template>

                        <div v-if="current.kind === 'activated' && (hasGrant(current) || loseConditions(current.loseWhen).length)" class="sent lose">
                          <span class="w2">Assumed form lost when</span>
                          <label v-for="l in LOSE_CONDITIONS" :key="l" class="chk">
                            <input type="checkbox" :checked="loseConditions(current.loseWhen).includes(l)" @change="toggleLoseWhen(current, l)" />
                            {{ LOSE_LABELS[l] }}
                          </label>
                          <span v-if="!loseConditions(current.loseWhen).length" class="help">(none ticked: kept for good)</span>
                        </div>
                      </template>

                      <!-- ============ Applies to (passive) ============ -->
                      <template v-else-if="s.key === 'applies'">
                        <div class="sent">
                          <AreaPicker
                            :shape="scopeShape(current.scope)"
                            :side="scopeSide(current.scope)"
                            :sides="scopeShape(current.scope) === 'avatar' ? ['friendly', 'enemy'] : ['any', 'friendly', 'enemy']"
                            :shapes="SCOPE_SHAPES"
                            :include-self="current.passive.includeSelf"
                            @update:shape="setScope(current, $event, scopeSide(current.scope))"
                            @update:side="setScope(current, scopeShape(current.scope), $event)"
                            @update:include-self="current.passive.includeSelf = $event"
                          />
                        </div>
                        <div v-if="!['self', 'bearer', 'avatar'].includes(scopeShape(current.scope))" class="sent">
                          <span class="w2">reaching</span>
                          <label v-for="k in PASSIVE_AFFECTS" :key="k" class="chk">
                            <input type="checkbox" :checked="(current.passive.affects || ['units']).includes(k)" @change="toggleAffects(current, k)" />
                            {{ k }}
                          </label>
                          <select
                            v-if="scopeShape(current.scope) === 'location' && (current.passive.affects || ['units']).includes('units')"
                            v-model="current.passive.unitLayers"
                            class="text-input"
                            title="Which layer's units"
                          >
                            <option v-for="l in UNIT_LAYERS" :key="l" :value="l">
                              {{ l === 'surface' ? 'units on the surface' : l === 'below' ? 'units below (underground / underwater)' : 'units on both layers' }}
                            </option>
                          </select>
                        </div>
                      </template>

                      <!-- ============ Grants (passive) ============ -->
                      <template v-else-if="s.key === 'grants'">
                        <div class="chips" role="group" aria-label="Keywords">
                          <button
                            v-for="kw in KEYWORDS"
                            :key="kw"
                            type="button"
                            class="chip"
                            :aria-pressed="current.passive.keywords.includes(kw)"
                            @click="togglePassiveKeyword(current, kw)"
                          >
                            {{ kw }}
                          </button>
                        </div>
                        <div class="sent">
                          <label class="chk">power + <input v-model.number="current.passive.strength" type="number" class="text-input num" /></label>
                          <label class="chk">movement + <input v-model.number="current.passive.movement" type="number" class="text-input num" /></label>
                          <label class="chk" title="Ranged X: gives the Shoot action (tap: a projectile that stops after X steps, strike what it hits) and lets it intercept Airborne units. Don't also build it as an activated ability.">
                            ranged
                            <input v-model.number="current.passive.ranged" type="number" min="0" class="text-input num" />
                          </label>
                        </div>
                        <p v-if="current.passive.ranged" class="help">
                          Ranged X gives the Shoot action (tap: a projectile that stops after X steps, strike what it hits) and
                          lets it intercept Airborne units. Don't also build it as an activated ability.
                        </p>
                        <template v-if="current.scope === 'self'">
                          <div class="sent">
                            <label class="chk">
                              <input v-model="current.passive.animate" type="checkbox" />
                              is a minion (animate)<template v-if="current.passive.animate">, power</template>
                            </label>
                            <template v-if="current.passive.animate">
                              <select v-model="current.passive.animatePowerRef" class="text-input" aria-label="Minion power">
                                <option v-for="r in ANIMATE_POWER_REFS" :key="r" :value="r">{{ POWER_REF_LABELS[r] }}</option>
                              </select>
                              <input
                                v-if="current.passive.animatePowerRef === 'literal'"
                                v-model.number="current.passive.animatePower"
                                type="number"
                                min="0"
                                class="text-input num"
                                aria-label="Power"
                              />
                              <template v-else>
                                <span class="w2">+</span>
                                <input v-model.number="current.passive.animatePowerBonus" type="number" class="text-input num" aria-label="Bonus power" />
                              </template>
                            </template>
                          </div>
                        </template>

                        <div class="sub-head">Costs and threshold</div>
                        <div class="sent">
                          <label class="chk">mana +/− <input v-model.number="current.passive.costMod" type="number" class="text-input num" /></label>
                          <span class="w2">on</span>
                          <select v-model="current.passive.costOn" class="text-input" aria-label="Cost change applies to">
                            <option v-for="o in PASSIVE_COST_ON" :key="o" :value="o">{{ costOnLabel(o) }}</option>
                          </select>
                          <select v-if="current.passive.costOn === 'spells'" v-model="current.passive.costFilter" class="text-input" aria-label="Which spells">
                            <option v-for="f in PASSIVE_COST_FILTERS" :key="f" :value="f">{{ costFilterLabel(f) }}</option>
                          </select>
                        </div>
                        <p v-if="current.passive.costOn === 'own' && current.passive.costMod && current.scope !== 'self'" class="warnline">
                          A card's own cost only matters in hand, but this scope only reaches cards on the board, so this does
                          nothing. Use "this card", or "spells the affected side casts".
                        </p>
                        <div class="sent">
                          <span class="w2">grants affinity</span>
                          <label v-for="el in ELEMENTS" :key="el" class="chk">
                            {{ el }} <input v-model.number="current.passive.affinity[el]" type="number" min="0" class="text-input num" />
                          </label>
                        </div>
                        <p
                          v-if="(current.passive.costOn === 'spells' && current.passive.costMod) || ELEMENTS.some((el) => current.passive.affinity[el])"
                          class="help"
                        >
                          Spell-cost and affinity changes apply to a side, not to units: yours for "this card" or "your …", the
                          opponent's for "opponent's …", both otherwise. Silencing this card removes them.
                        </p>
                      </template>

                      <!-- ============ Stops (passive) ============ -->
                      <template v-else-if="s.key === 'stops'">
                        <div class="sent">
                          <label class="chk"><input v-model="current.passive.cantAttack" type="checkbox" /> can't attack</label>
                          <label class="chk"><input v-model="current.passive.cantMove" type="checkbox" /> can't move</label>
                          <label class="chk"><input v-model="current.passive.cantDefend" type="checkbox" /> can't move to defend</label>
                          <label class="chk"><input v-model="current.passive.cantBeTargeted" type="checkbox" /> can't be targeted by opponents</label>
                        </div>
                        <div class="sent">
                          <label class="chk" title="Loses all printed and granted abilities. Avatars can't be silenced."><input v-model="current.passive.silence" type="checkbox" /> silenced</label>
                          <label class="chk" title="Loses all abilities, basic ones too, and can't act"><input v-model="current.passive.disable" type="checkbox" /> disabled</label>
                        </div>
                        <p v-if="current.passive.silence || current.passive.disable" class="help">
                          Silenced: loses all printed and granted abilities (Avatars can't be silenced). Disabled: loses all
                          abilities, basic ones too, and can't act.
                        </p>
                        <details class="more" :open="!!(current.passive.summonOnEnemySites || current.passive.swapCemeteries || current.passive.cemeteryTax)">
                          <summary>Special rules</summary>
                          <label class="chk">
                            <input v-model="current.passive.summonOnEnemySites" type="checkbox" />
                            can be summoned to enemy sites (this card only — it applies in hand)
                          </label>
                          <label class="chk">
                            <input v-model="current.passive.swapCemeteries" type="checkbox" />
                            cemeteries are swapped (each player treats the opponent's as their own)
                          </label>
                          <div class="sent">
                            <label class="chk" title="Extra mana to cast from a cemetery or use an ability that targets a cemetery card">
                              cemetery tax + <input v-model.number="current.passive.cemeteryTax" type="number" min="0" class="text-input num" /> mana
                            </label>
                            <select v-if="current.passive.cemeteryTax" v-model="current.passive.cemeteryTaxOn" class="text-input" aria-label="Cemetery tax on">
                              <option v-for="o in CEMETERY_TAX_ON" :key="o" :value="o">{{ o }}</option>
                            </select>
                          </div>
                          <p class="help">Cemetery tax: extra mana to cast from a cemetery or use an ability that targets a cemetery card.</p>
                        </details>
                      </template>
                    </div>
                  </Transition>
                </li>
              </ol>
            </template>
          </div>
        </div>

        <footer class="df">
          <ConfirmInline
            v-if="current && confirmingDelete"
            class="grow"
            :message="`Delete “${current.name || 'Untitled ability'}”? This can't be undone.`"
            confirm-label="Delete ability"
            keep-label="Keep it"
            @confirm="onConfirmDelete"
            @cancel="onCancelDelete"
          />
          <template v-else-if="current">
            <button ref="deleteBtn" type="button" class="btn small danger" @click="confirmingDelete = true">Delete ability</button>
            <p class="recapbar" aria-live="polite"><span class="lo">Reads as</span> <b>{{ sentence(current) }}</b></p>
          </template>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ability-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  pointer-events: none;
}
/* Catches outside clicks. Transparent: the dimming is the hole's shadow, so
   the left column (the card's art) stays lit. */
.backdrop {
  position: absolute;
  inset: 0;
  pointer-events: auto;
}
.backdrop.full {
  background: var(--c-scrim-felt);
}
.hole {
  position: fixed;
  box-shadow: 0 0 0 200vmax var(--c-scrim-felt);
  pointer-events: none;
}
.region {
  position: fixed;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 0 var(--sp-5) var(--sp-4);
  pointer-events: none;
}
.ability-dialog {
  pointer-events: auto;
  width: min(1040px, 100%);
  max-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--c-panel);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
  color: var(--c-text);
  font-family: var(--font-ui);
}

/* ---- header ---- */
.dh {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-bottom: 1px solid var(--c-line);
}
.head-art {
  flex: none;
  width: 36px;
  height: 50px;
  border-radius: var(--r-sm);
  background: var(--c-raised) center / cover no-repeat;
  box-shadow: var(--shadow-card);
}
.dh h2 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--fs-xl);
  color: var(--c-cream-hi);
}
.dh .help {
  flex: 1;
  margin: 0;
}

/* ---- rail + form ---- */
.abx {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  min-height: 0;
  flex: 1 1 auto;
}
.rail {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-right: 1px solid var(--c-line);
  overflow-y: auto;
  min-height: 0;
}
.rail .it {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  width: 100%;
  padding: var(--sp-2) 10px;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  background: transparent;
  color: var(--c-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.rail .it:hover {
  border-color: var(--c-line-strong);
}
.rail .it b {
  font-size: var(--fs-md);
  font-weight: 700;
}
.rail .it span {
  font-size: var(--fs-sm);
  color: var(--c-muted);
}
/* Current: gold line and a "›" mark, not the wash alone. */
.rail .it[aria-current='true'] {
  border-color: var(--c-gold);
  background: var(--c-gold-bg);
}
.rail .it[aria-current='true'] b::before {
  content: '› ';
  color: var(--c-gold);
}
.rail-sp {
  flex-grow: 1;
}
.tips ul {
  margin: var(--sp-1) 0;
  padding-left: 1.1rem;
}
.tips li + li {
  margin-top: var(--sp-1);
}
.form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5);
  overflow-y: auto;
  min-height: 0;
}
.empty-box {
  margin: auto;
  max-width: 28rem;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  align-items: center;
  padding: 18px var(--sp-4);
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--r-md);
  text-align: center;
  color: var(--c-muted);
  font-size: 14px;
  line-height: 1.45;
}
.empty-box b {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 18px;
  color: var(--c-cream-hi);
}
.name-row {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-3);
}
.grow {
  flex: 1 1 auto;
  min-width: 0;
}
.flabel {
  display: block;
  margin: 0 0 var(--sp-1);
  font-size: var(--fs-sm);
  color: var(--c-muted-hi);
}
.lo {
  color: var(--c-muted-lo);
}
.kindtag {
  flex: none;
  display: inline-flex;
  align-items: center;
  height: 22px;
  margin-bottom: 8px;
  padding: 0 var(--sp-2);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-pill);
  font-size: var(--fs-xs);
  color: var(--c-muted-hi);
}
.app.app .form .text-input,
.form :deep(.text-input) {
  margin: 0;
}

/* ---- numbered steps ---- */
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
}
.step {
  display: grid;
  grid-template-columns: 30px 100px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: var(--sp-3) 0;
  border-top: 1px solid var(--c-line);
}
.step .n {
  width: 24px;
  height: 24px;
  margin-top: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--c-gold);
  border-radius: 50%;
  color: var(--c-gold);
  font-weight: 700;
  font-size: 13px;
}
.step .w {
  margin-top: 4px;
  padding: 0;
  background: none;
  border: 0;
  color: var(--c-cream-hi);
  font-family: var(--font-display);
  font-size: 19px;
  text-align: left;
  cursor: pointer;
}
.step .w:hover {
  text-decoration: underline;
}
.caret {
  font-family: var(--font-ui);
  font-size: var(--fs-xs);
  color: var(--c-muted);
}
.f {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  min-width: 0;
}
.recap {
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-1) 10px;
  background: transparent;
  border: 1px solid var(--c-line);
  border-radius: 6px;
  color: var(--c-muted-hi);
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.recap:hover {
  border-color: var(--c-line-strong);
}
.recap-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recap .lo {
  flex: none;
}
/* The fold swaps recap and form; only animated when motion is welcome. */
@media (prefers-reduced-motion: no-preference) {
  .fold-enter-active,
  .fold-leave-active {
    transition: opacity 0.14s ease, transform 0.14s ease;
  }
  .fold-enter-from,
  .fold-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }
}

/* One sentence of selects. */
.sent {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.form :deep(.sent .text-input),
.form :deep(.fx .text-input),
.form :deep(.tgt .text-input) {
  width: auto;
  flex: 0 1 auto;
  min-width: 6rem;
  max-width: 100%;
}
.form .sent .grow {
  flex: 1 1 12rem;
}
.form .sent .wide {
  min-width: min(300px, 100%);
}
.form :deep(.num),
.form :deep(.sent .num),
.form :deep(.fx .num),
.form :deep(.tgt .num) {
  flex: 0 0 4.2rem;
  width: 4.2rem;
  min-width: 0;
  text-align: center;
}
.w2 {
  font-size: 14px;
  color: var(--c-muted);
}
.help {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--c-muted);
  line-height: 1.4;
}
/* A warning reads by its "!" glyph as well as its colour. */
.warnline {
  display: flex;
  gap: 6px;
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--c-warn);
  line-height: 1.4;
}
.warnline::before {
  content: '!';
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--c-warn);
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
}
.chk {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}
.chk input[type='checkbox'] {
  accent-color: var(--c-gold);
}
.advanced {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding-left: var(--sp-3);
  border-left: 2px solid var(--c-line-strong);
}
.more {
  font-size: 14px;
}
.more > summary {
  cursor: pointer;
  color: var(--c-muted-hi);
}
.more[open] > summary {
  margin-bottom: var(--sp-2);
}
.more[open] {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.mode-block {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding-left: var(--sp-3);
  border-left: 2px solid var(--c-line-strong);
}
.sub-head {
  margin-top: var(--sp-1);
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--c-muted-hi);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  height: 30px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-pill);
  color: var(--c-muted-hi);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.chip[aria-pressed='true'] {
  border-color: var(--c-gold);
  background: var(--c-gold-bg);
  color: var(--c-cream-hi);
  font-weight: 700;
}
.chip[aria-pressed='true']::before {
  content: '✓';
  color: var(--c-gold);
}

/* ---- effects ---- */
.group-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 0;
  background: none;
  border: 0;
  border-bottom: 1px solid var(--c-line);
  color: var(--c-muted-hi);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.group-head.else {
  font-style: italic;
  font-weight: 400;
  margin-left: var(--sp-3);
}
.group-recap {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 400;
}
.fx {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: var(--sp-2);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  background: var(--c-felt);
}
.form .fx .op {
  font-weight: 600;
}
.fx-sp {
  flex: 1 0 0;
}
.effect-note {
  flex: 0 1 auto;
  font-size: 14px;
  color: var(--c-muted);
  margin: 0;
}
.fx .warnline,
.effect-if {
  flex: 1 1 100%;
}
.effect-if {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-left: var(--sp-3);
  border-left: 2px solid var(--c-line-strong);
}
.iconbtn {
  flex: none;
  width: 30px;
  height: 30px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--c-line-strong);
  border-radius: 6px;
  color: var(--c-muted-hi);
  font-size: 14px;
  cursor: pointer;
}
.iconbtn.del {
  color: var(--c-danger-soft);
  border-color: var(--c-danger-deep);
}
.lose {
  padding-top: var(--sp-1);
}

/* ---- footer ---- */
.df {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-top: 1px solid var(--c-line);
}
.recapbar {
  flex: 1;
  min-width: 0;
  margin: 0;
  display: flex;
  gap: var(--sp-2);
  align-items: baseline;
  justify-content: flex-end;
  font-size: 14px;
  color: var(--c-muted-hi);
}
.recapbar b {
  color: var(--c-cream-hi);
  font-weight: 700;
}
</style>
