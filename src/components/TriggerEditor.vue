<script setup>
import { computed, reactive } from 'vue'
import EffectSelector from './EffectSelector.vue'
import ConditionEditor from './ConditionEditor.vue'
import TargetEditor from './TargetEditor.vue'
import AreaPicker from './AreaPicker.vue'
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

// The editor reads each ability as a sentence:
//   triggered: When [trigger] · only if [condition] · choose [target] · do [effects]
//   activated: Pay [cost] · choose [target] · do [effects]
//   passive:   While [condition] · [who] get [modifiers]
// The raw trigger fields sit behind "advanced"; the common triggers are presets.

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

// A modal over the whole app rather than an inline panel: the action bar lives
// pinned under the mat where a tall form would shove the board off-screen, and
// authoring abilities is a deliberate side-trip, not something done mid-move.
const props = defineProps({ cardId: { type: String, required: true } })
const emit = defineEmits(['close'])

const card = computed(() => state.cards[props.cardId] || null)
const abilities = computed(() => card.value?.abilities || [])
const fromToOptions = ['any', ...ZONE_CATEGORIES]

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
  if (s) addAbility(props.cardId, s.kind, s.key)
}
const moreCosts = (c) =>
  !!(c.discard || c.banish || c.perTurn || ELEMENTS.some((el) => c.threshold[el]))

// Folded sections, keyed `${ability.id}:${section}` ('all' folds the whole
// ability). View-only, so it lives here rather than on the card: a long list of
// abilities stays scannable by folding away the parts you're done with.
const folded = reactive(new Set())
const isOpen = (ability, section) => !folded.has(`${ability.id}:${section}`)
function toggleFold(ability, section) {
  const k = `${ability.id}:${section}`
  if (folded.has(k)) folded.delete(k)
  else folded.add(k)
}
// One-line recaps shown beside a folded section's heading.
const triggerRecap = (a) =>
  presetOf(a) === 'custom' ? `${a.trigger.action}, ${a.trigger.subject}` : TRIGGER_PRESETS[presetOf(a)]?.label || ''
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

function onRemove(ability) {
  if (!confirm(`Delete ability "${ability.name || 'Untitled'}"?`)) return
  removeAbility(props.cardId, ability.id)
}
</script>

<template>
  <div class="ability-modal" role="dialog" aria-modal="true" @click.self="emit('close')">
    <div class="ability-dialog">
      <header class="ability-head">
        <div class="zone-title">Abilities — {{ cardName(cardId) }}</div>
        <button class="ca-close" aria-label="Close" @click="emit('close')">×</button>
      </header>

      <p v-if="!abilities.length" class="hint">
        No abilities yet. Pick a starting point below — Genesis, Deathrite, a
        "Tap: …" ability, or a passive.
      </p>

      <div v-for="ability in abilities" :key="ability.id" class="ability-block">
        <div class="ability-row">
          <button
            type="button"
            class="fold caret-only"
            :aria-expanded="isOpen(ability, 'all')"
            :title="isOpen(ability, 'all') ? 'Collapse this ability' : 'Expand this ability'"
            @click="toggleFold(ability, 'all')"
          >
            <span class="caret">{{ isOpen(ability, 'all') ? '▾' : '▸' }}</span>
          </button>
          <span class="ability-kind" :class="ability.kind">{{ ability.kind }}</span>
          <input v-model="ability.name" class="text-input" placeholder="Ability name (e.g. Assume Form)" />
          <button class="btn small danger" :title="`Delete ${ability.name || 'ability'}`" @click="onRemove(ability)">🗑</button>
        </div>
        <template v-if="isOpen(ability, 'all')">
        <textarea
          v-model="ability.text"
          class="text-input text-area"
          rows="2"
          placeholder="Rules text shown to the player when this fires / is activated."
        ></textarea>

        <!-- ================= TRIGGERED: When ... ================= -->
        <template v-if="ability.kind === 'triggered'">
          <button type="button" class="fold" :aria-expanded="isOpen(ability, 'when')" @click="toggleFold(ability, 'when')">
            <span class="caret">{{ isOpen(ability, 'when') ? '▾' : '▸' }}</span>
            <span class="fold-label">Trigger</span>
            <span v-if="!isOpen(ability, 'when')" class="fold-recap">{{ triggerRecap(ability) }}</span>
          </button>
          <template v-if="isOpen(ability, 'when')">
          <div class="step">
            <span class="step-word">When</span>
            <select :value="presetOf(ability)" class="text-input" @change="onPreset(ability, $event.target.value)">
              <option v-for="(p, key) in TRIGGER_PRESETS" :key="key" :value="key">{{ p.label }}</option>
              <option value="custom">Custom…</option>
            </select>
            <button class="btn small" :class="{ on: advanced[ability.id] }" @click="advanced[ability.id] = !advanced[ability.id]">
              advanced
            </button>
          </div>
          <div v-if="advanced[ability.id] || presetOf(ability) === 'custom'" class="advanced">
            <div class="sentence">
              <span class="hint">when</span>
              <select v-model="ability.trigger.action" class="text-input">
                <option v-for="a in TRIGGER_ACTIONS" :key="a" :value="a">{{ ACTION_LABELS[a] || a }}</option>
              </select>
              <span class="hint">and</span>
              <select v-model="ability.trigger.subject" class="text-input" title="Whose action it must be">
                <option v-for="s in TRIGGER_SUBJECTS" :key="s" :value="s">{{ SUBJECT_LABELS[s] }}</option>
              </select>
              <template v-if="TARGETED_TRIGGER_ACTIONS.includes(ability.trigger.action)">
                <select v-model="ability.trigger.role" class="text-input">
                  <option v-for="r in TRIGGER_ROLES" :key="r" :value="r">{{ ROLE_LABELS[r] }}</option>
                </select>
              </template>
            </div>
            <div class="sentence">
              <span class="hint">that card is</span>
              <select v-model="ability.trigger.filter" class="text-input" title="What kind of card it must be">
                <option v-for="f in TARGET_FILTERS" :key="f" :value="f">{{ f === 'any' ? 'any kind' : FILTER_LABELS[f] }}</option>
              </select>
              <AreaPicker v-model:shape="ability.trigger.within" :shapes="['any', 'adjacent', 'nearby']" />
              <span class="hint">of this card</span>
            </div>
            <div v-if="ability.trigger.action === 'move' || ability.trigger.from !== 'any' || ability.trigger.to !== 'any'" class="sentence">
              <span class="hint">moving from</span>
              <select v-model="ability.trigger.from" class="text-input">
                <option v-for="z in fromToOptions" :key="z" :value="z">{{ z }}</option>
              </select>
              <span class="hint">to</span>
              <select v-model="ability.trigger.to" class="text-input">
                <option v-for="z in fromToOptions" :key="z" :value="z">{{ z }}</option>
              </select>
            </div>
            <div v-if="TARGETED_TRIGGER_ACTIONS.includes(ability.trigger.action)" class="sentence">
              <span class="hint">"the target's location" / tokens "on the target" mean</span>
              <select v-model="ability.trigger.targets" class="text-input">
                <option v-for="r in TRIGGER_TARGET_REFS" :key="r" :value="r">{{ REF_LABELS[r] }}</option>
              </select>
            </div>
            <div v-if="ability.trigger.subject !== 'self'" class="sentence">
              <span class="hint">also listens while this card is in</span>
              <label v-for="cat in ZONE_CATEGORIES.filter((c) => c !== 'realm')" :key="cat" class="chk">
                <input type="checkbox" :checked="ability.zones.includes(cat)" @change="toggleAbilityZone(ability, cat)" />
                {{ cat }}
              </label>
            </div>
          </div>

          <div class="step">
            <span class="step-word">Only if</span>
            <span class="effect-row grow">
              <ConditionEditor :cond="ability.condition" :triggered="true" :pick="pickOf(ability)" />
            </span>
          </div>
          </template>
        </template>

        <!-- ================= ACTIVATED: Pay ... ================= -->
        <template v-else-if="ability.kind === 'activated'">
          <button type="button" class="fold" :aria-expanded="isOpen(ability, 'pay')" @click="toggleFold(ability, 'pay')">
            <span class="caret">{{ isOpen(ability, 'pay') ? '▾' : '▸' }}</span>
            <span class="fold-label">Cost</span>
            <span v-if="!isOpen(ability, 'pay')" class="fold-recap">{{ costRecap(ability) }}</span>
          </button>
          <template v-if="isOpen(ability, 'pay')">
          <div class="step">
            <span class="step-word">Pay</span>
            <label class="chk"><input v-model="ability.cost.tap" type="checkbox" /> tap this card</label>
            <label class="inline">
              <input v-model.number="ability.cost.mana" type="number" min="0" class="text-input num" /> mana
            </label>
            <label class="inline">
              <input v-model.number="ability.cost.life" type="number" min="0" class="text-input num" /> life
            </label>
            <label class="inline">
              sacrifice
              <select v-model="ability.cost.sacrifice" class="text-input">
                <option v-for="c in SACRIFICE_COSTS" :key="c" :value="c">{{ SACRIFICE_LABELS[c] }}</option>
              </select>
            </label>
          </div>
          <details class="more" :open="moreCosts(ability.cost)">
            <summary>more costs, limits and zones</summary>
            <div class="sentence">
              <label class="inline">discard <input v-model.number="ability.cost.discard" type="number" min="0" class="text-input num" /></label>
              <label class="inline">banish from cemetery <input v-model.number="ability.cost.banish" type="number" min="0" class="text-input num" /></label>
              <label class="inline" title="0 = unlimited. A puzzle is a single turn, so this is per attempt.">
                uses per turn <input v-model.number="ability.cost.perTurn" type="number" min="0" class="text-input num" />
              </label>
            </div>
            <div class="sentence" title="Elemental threshold needed to activate (checked, not spent)">
              <span class="hint">needs threshold</span>
              <label v-for="el in ELEMENTS" :key="el" class="inline">
                {{ el }} <input v-model.number="ability.cost.threshold[el]" type="number" min="0" class="text-input num" />
              </label>
            </div>
            <div class="sentence">
              <span class="hint">usable while this card is in</span>
              <label v-for="cat in ZONE_CATEGORIES" :key="cat" class="chk">
                <input type="checkbox" :checked="ability.zones.includes(cat)" @change="toggleAbilityZone(ability, cat)" />
                {{ cat }}
              </label>
            </div>
            <p v-if="ability.cost.discard || ability.cost.banish" class="hint">
              Discard / banish costs take the first cards in your hand / cemetery (no choice yet).
            </p>
          </details>
          <p v-if="ability.cost.sacrifice === 'target'" class="hint">
            Sacrificing the target needs "choose a card" below; only your own non-avatar cards in play can be picked.
          </p>
          </template>
        </template>

        <!-- ================= PASSIVE ================= -->
        <template v-else>
          <button type="button" class="fold" :aria-expanded="isOpen(ability, 'passive')" @click="toggleFold(ability, 'passive')">
            <span class="caret">{{ isOpen(ability, 'passive') ? '▾' : '▸' }}</span>
            <span class="fold-label">Passive</span>
            <span v-if="!isOpen(ability, 'passive')" class="fold-recap">{{ ability.scope }}</span>
          </button>
          <template v-if="isOpen(ability, 'passive')">
          <div class="step">
            <span class="step-word">While</span>
            <span class="effect-row grow">
              <ConditionEditor :cond="ability.condition" :passive="true" />
            </span>
          </div>
          <div class="step">
            <span class="step-word">Affects</span>
            <AreaPicker
              :shape="scopeShape(ability.scope)"
              :side="scopeSide(ability.scope)"
              :sides="scopeShape(ability.scope) === 'avatar' ? ['friendly', 'enemy'] : ['any', 'friendly', 'enemy']"
              :shapes="SCOPE_SHAPES"
              :include-self="ability.passive.includeSelf"
              @update:shape="setScope(ability, $event, scopeSide(ability.scope))"
              @update:side="setScope(ability, scopeShape(ability.scope), $event)"
              @update:include-self="ability.passive.includeSelf = $event"
            />
          </div>
          <div v-if="!['self', 'bearer', 'avatar'].includes(scopeShape(ability.scope))" class="sentence">
            <span class="hint">reaching</span>
            <label v-for="k in PASSIVE_AFFECTS" :key="k" class="chk">
              <input type="checkbox" :checked="(ability.passive.affects || ['units']).includes(k)" @change="toggleAffects(ability, k)" />
              {{ k }}
            </label>
            <select
              v-if="scopeShape(ability.scope) === 'location' && (ability.passive.affects || ['units']).includes('units')"
              v-model="ability.passive.unitLayers"
              class="text-input"
              title="Which layer's units"
            >
              <option v-for="l in UNIT_LAYERS" :key="l" :value="l">
                {{ l === 'surface' ? 'units on the surface' : l === 'below' ? 'units below (underground / underwater)' : 'units on both layers' }}
              </option>
            </select>
          </div>

          <div class="step-word section-head">They get</div>
          <div class="field-label">Keywords</div>
          <div class="chk-row">
            <label v-for="kw in KEYWORDS" :key="kw" class="chk">
              <input type="checkbox" :checked="ability.passive.keywords.includes(kw)" @change="togglePassiveKeyword(ability, kw)" />
              {{ kw }}
            </label>
            <label class="chk" title="Ranged X: gives the Shoot action (tap: a projectile that stops after X steps, strike what it hits) and lets it intercept Airborne units. Don't also build it as an activated ability.">
              ranged
              <input v-model.number="ability.passive.ranged" type="number" min="0" class="text-input num" />
            </label>
          </div>
          <div class="sentence">
            <label class="inline">power + <input v-model.number="ability.passive.strength" type="number" class="text-input num" /></label>
            <label class="inline">movement + <input v-model.number="ability.passive.movement" type="number" class="text-input num" /></label>
          </div>
          <div class="chk-row">
            <label class="chk"><input v-model="ability.passive.cantAttack" type="checkbox" /> can't attack</label>
            <label class="chk"><input v-model="ability.passive.cantMove" type="checkbox" /> can't move</label>
            <label class="chk"><input v-model="ability.passive.cantDefend" type="checkbox" /> can't move to defend</label>
            <label class="chk"><input v-model="ability.passive.cantBeTargeted" type="checkbox" /> can't be targeted by opponents</label>
            <label class="chk" title="Loses all printed and granted abilities. Avatars can't be silenced.">
              <input v-model="ability.passive.silence" type="checkbox" /> silenced
            </label>
            <label class="chk" title="Loses all abilities, basic ones too, and can't act">
              <input v-model="ability.passive.disable" type="checkbox" /> disabled
            </label>
          </div>

          <template v-if="ability.scope === 'self'">
            <label class="chk">
              <input v-model="ability.passive.animate" type="checkbox" />
              is a minion (animate), power
            </label>
            <span v-if="ability.passive.animate" class="sentence">
              <select v-model="ability.passive.animatePowerRef" class="text-input">
                <option v-for="r in ANIMATE_POWER_REFS" :key="r" :value="r">{{ POWER_REF_LABELS[r] }}</option>
              </select>
              <input v-if="ability.passive.animatePowerRef === 'literal'" v-model.number="ability.passive.animatePower" type="number" min="0" class="text-input num" />
              <template v-else>
                + <input v-model.number="ability.passive.animatePowerBonus" type="number" class="text-input num" />
              </template>
            </span>
          </template>

          <div class="field-label section-head">Costs and threshold</div>
          <div class="sentence">
            <label class="inline">mana +/− <input v-model.number="ability.passive.costMod" type="number" class="text-input num" /></label>
            <span class="hint">on</span>
            <select v-model="ability.passive.costOn" class="text-input">
              <option v-for="o in PASSIVE_COST_ON" :key="o" :value="o">{{ costOnLabel(o) }}</option>
            </select>
            <select v-if="ability.passive.costOn === 'spells'" v-model="ability.passive.costFilter" class="text-input">
              <option v-for="f in PASSIVE_COST_FILTERS" :key="f" :value="f">{{ costFilterLabel(f) }}</option>
            </select>
          </div>
          <p v-if="ability.passive.costOn === 'own' && ability.passive.costMod && ability.scope !== 'self'" class="hint">
            A card's own cost only matters in hand, but this scope only reaches cards on the board, so this does
            nothing. Use "this card", or "spells the affected side casts".
          </p>
          <div class="sentence">
            <span class="hint">grants affinity</span>
            <label v-for="el in ELEMENTS" :key="el" class="inline">
              {{ el }} <input v-model.number="ability.passive.affinity[el]" type="number" min="0" class="text-input num" />
            </label>
          </div>
          <p
            v-if="(ability.passive.costOn === 'spells' && ability.passive.costMod) || ELEMENTS.some((el) => ability.passive.affinity[el])"
            class="hint"
          >
            Spell-cost and affinity changes apply to a side, not to units: yours for "this card" or "your …", the
            opponent's for "opponent's …", both otherwise. Silencing this card removes them.
          </p>

          <details class="more" :open="!!(ability.passive.summonOnEnemySites || ability.passive.swapCemeteries || ability.passive.cemeteryTax)">
            <summary>special rules</summary>
            <label class="chk">
              <input v-model="ability.passive.summonOnEnemySites" type="checkbox" />
              can be summoned to enemy sites (this card only — it applies in hand)
            </label>
            <label class="chk">
              <input v-model="ability.passive.swapCemeteries" type="checkbox" />
              cemeteries are swapped (each player treats the opponent's as their own)
            </label>
            <div class="sentence">
              <label class="inline" title="Extra mana to cast from a cemetery or use an ability that targets a cemetery card">
                cemetery tax + <input v-model.number="ability.passive.cemeteryTax" type="number" min="0" class="text-input num" /> mana
              </label>
              <select v-if="ability.passive.cemeteryTax" v-model="ability.passive.cemeteryTaxOn" class="text-input">
                <option v-for="o in CEMETERY_TAX_ON" :key="o" :value="o">{{ o }}</option>
              </select>
            </div>
          </details>
          </template>
        </template>

        <!-- ================= Choose ... Do ... (triggered + activated) ================= -->
        <template v-if="ability.kind !== 'passive'">
          <button type="button" class="fold" :aria-expanded="isOpen(ability, 'choose')" @click="toggleFold(ability, 'choose')">
            <span class="caret">{{ isOpen(ability, 'choose') ? '▾' : '▸' }}</span>
            <span class="fold-label">Target</span>
            <span v-if="!isOpen(ability, 'choose')" class="fold-recap">{{ targetRecap(ability) }}</span>
          </button>
          <div v-if="isOpen(ability, 'choose')" class="step block">
            <TargetEditor
              :t="ability.target"
              :triggered="ability.kind === 'triggered'"
              @pick="ability.kind === 'triggered' && setTriggerPick(ability, $event)"
            />
          </div>

          <details class="more" :open="!!ability.modes?.length">
            <summary>“Choose one…” modes{{ ability.modes?.length ? ` (${ability.modes.length})` : '' }}</summary>
            <p v-if="!ability.modes?.length" class="hint">
              None — the ability just does its effects. Add modes to make the player choose between them first.
            </p>
            <label v-else class="inline">
              player chooses
              <input v-model.number="ability.chooseCount" type="number" min="1" :max="ability.modes.length" class="text-input num" />
              of them
            </label>
            <div v-for="(m, mi) in ability.modes || []" :key="mi" class="mode-block">
              <div class="ability-row">
                <input v-model="m.name" class="text-input" placeholder="Mode name (shown to the player)" />
                <button class="btn small danger" title="Remove mode" @click="removeMode(ability, mi)">🗑</button>
              </div>
              <TargetEditor :t="m.target" :triggered="ability.kind === 'triggered'" />
            </div>
            <button class="btn small" @click="addMode(ability)">+ Mode</button>
          </details>

          <template v-for="grp in effectGroups(ability)" :key="grp.key">
            <button
              type="button"
              class="fold step-word"
              :class="grp.depth ? 'else-head' : 'section-head'"
              :aria-expanded="isOpen(ability, `fx:${grp.key}`)"
              @click="toggleFold(ability, `fx:${grp.key}`)"
            >
              <span class="caret">{{ isOpen(ability, `fx:${grp.key}`) ? '▾' : '▸' }}</span>
              <span class="fold-label">{{ grp.label }}</span>
              <span v-if="!isOpen(ability, `fx:${grp.key}`)" class="fold-recap">{{ effectsRecap(grp.view.effects) }}</span>
            </button>
            <template v-for="view in isOpen(ability, `fx:${grp.key}`) ? [grp.view] : []" :key="grp.key">
              <div v-for="(eff, i) in view.effects" :key="i" class="effect-row">
                <select :value="opValue(eff)" class="text-input op" @change="onOpChange(view, i, $event.target.value)">
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

                <button
                  v-if="!eff.condition"
                  class="btn small"
                  title="Only resolve this effect if a condition holds (else run other effects)"
                  @click="setEffectCondition(eff, 'damaged')"
                >
                  if…
                </button>
                <button class="btn small danger" title="Remove effect" @click="removeEffect(view, i)">🗑</button>
                <p v-if="dupWarning(view, eff)" class="warn">⚠ {{ dupWarning(view, eff) }}</p>
                <p v-if="eff.op === 'animate' && eff.who === 'self' && eff.duration === 'sourceLeaves'" class="warn">
                  ⚠ Same as a passive "is a minion (animate)" — prefer that.
                </p>
                <div v-if="eff.condition" class="effect-if">
                  <span class="hint">only if</span>
                  <ConditionEditor :cond="eff.condition" :triggered="view.kind === 'triggered'" :pick="pickOf(view)" />
                  <button class="btn small" title="Drop the condition" @click="setEffectCondition(eff, 'always')">✕</button>
                </div>
              </div>
              <button class="btn small" @click="addEffect(view)">+ Effect</button>
            </template>
          </template>

          <label v-if="ability.kind === 'activated' && (hasGrant(ability) || ability.loseWhen !== 'never')" class="step">
            <span class="step-word">Assumed form lost when</span>
            <select v-model="ability.loseWhen" class="text-input">
              <option v-for="l in LOSE_CONDITIONS" :key="l" :value="l">{{ l }}</option>
            </select>
          </label>
        </template>
        </template>
      </div>

      <div class="btn-row">
        <select class="text-input starter" value="" @change="onStarter">
          <option value="" disabled>+ Add an ability…</option>
          <optgroup label="Triggered (fires by itself)">
            <option v-for="s in ABILITY_STARTERS.filter((x) => x.kind === 'triggered')" :key="s.key" :value="s.key">{{ s.label }}</option>
          </optgroup>
          <optgroup label="Activated / passive">
            <option v-for="s in ABILITY_STARTERS.filter((x) => x.kind !== 'triggered')" :key="s.key" :value="s.key">{{ s.label }}</option>
          </optgroup>
        </select>
      </div>

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
    </div>
  </div>
</template>

<style scoped>
.ability-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 4vh 1rem;
  background: rgba(0, 0, 0, 0.55);
  overflow: auto;
}
.ability-dialog {
  width: min(620px, 100%);
  background: var(--panel, #1b1f2a);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  padding: 1rem;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}
.ability-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}
.ability-block {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 0.6rem;
  margin-bottom: 0.6rem;
}
.ability-row {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.4rem;
}
.ability-row .text-input {
  flex: 1;
}
.ability-kind {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
}
.ability-kind.triggered {
  background: rgba(80, 160, 255, 0.25);
}
.ability-kind.activated {
  background: rgba(255, 180, 80, 0.25);
}
.ability-kind.passive {
  background: rgba(120, 220, 150, 0.25);
}
/* One step of the sentence: a bold lead word, then its controls inline. */
.step {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin: 0.5rem 0 0.2rem;
}
.step.block {
  display: block;
}
.step .text-input {
  flex: 1 1 8rem;
  min-width: 6rem;
}
.step-word {
  font-weight: 700;
  font-size: 0.9rem;
  white-space: nowrap;
}
.sentence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin: 0.25rem 0;
}
.sentence .text-input {
  flex: 1 1 6rem;
  min-width: 5rem;
}
.advanced {
  border-left: 2px solid rgba(80, 160, 255, 0.4);
  padding-left: 0.6rem;
  margin: 0.2rem 0 0.4rem;
}
.btn.on {
  background: rgba(80, 160, 255, 0.35);
}
.grow {
  flex: 1 1 auto;
  margin: 0;
}
.inline {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.85rem;
}
.more {
  margin: 0.3rem 0;
  font-size: 0.85rem;
}
.more summary {
  cursor: pointer;
  opacity: 0.8;
}
.tips ul {
  margin: 0.3rem 0;
  padding-left: 1.1rem;
}
.chk-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 0.25rem 0 0.5rem;
}
.chk {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
}
.section-head {
  display: block;
  margin-top: 0.6rem;
  font-weight: 600;
}
.field-label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.85rem;
}
.effect-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin: 0.3rem 0;
}
.effect-row .text-input {
  flex: 1 1 6rem;
  min-width: 5rem;
}
.effect-row .op {
  flex: 1 1 100%;
  font-weight: 600;
}
.num,
.effect-row .num,
.sentence .num,
.step .num {
  flex: 0 0 4.2rem;
  width: 4.2rem;
  min-width: 0;
}
.effect-note {
  flex: 0 1 auto;
}
.effect-if {
  flex: 1 1 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  padding-left: 0.8rem;
}
.warn {
  flex: 1 1 100%;
  margin: 0;
  font-size: 0.8rem;
  color: #f0b060;
}
.else-head {
  display: block;
  margin-top: 0.4rem;
  font-style: italic;
  opacity: 0.85;
}
.mode-block {
  border-left: 2px solid rgba(255, 180, 80, 0.4);
  padding-left: 0.6rem;
  margin: 0.4rem 0;
}
.starter {
  width: 100%;
}
/* Fold / unfold heading for an ability or one of its sections. */
.fold {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  width: 100%;
  margin: 0.45rem 0 0.2rem;
  padding: 0.15rem 0;
  background: none;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
}
.fold.caret-only {
  width: auto;
  margin: 0;
  border: 0;
}
.fold .caret {
  flex: none;
  width: 0.8rem;
  opacity: 0.7;
}
.fold-label {
  flex: none;
}
.fold-recap {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  opacity: 0.55;
  font-size: 0.78rem;
  font-weight: normal;
  text-transform: none;
  letter-spacing: normal;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
