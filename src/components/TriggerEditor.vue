<script setup>
import { computed } from 'vue'
import {
  state,
  cardName,
  ZONE_CATEGORIES,
  TRIGGER_ACTIONS,
  TRIGGER_SUBJECTS,
  LOSE_CONDITIONS,
  TARGET_FILTERS,
  TARGET_MODES,
  GRID_ORIGINS,
  GRID_SHAPES,
  TARGET_WITHIN,
  TARGET_SIDES,
  LOCATION_REFS,
  MOVE_KINDS,
  MOVE_REACH,
  TOKEN_KINDS,
  tokenLocationsFor,
  setMoveKind,
  setTokenKind,
  AMOUNT_REFS,
  EFFECT_OPS,
  KEYWORDS,
  PASSIVE_SCOPES,
  PASSIVE_AFFECTS,
  UNIT_LAYERS,
  PASSIVE_CONDITIONS,
  ANIMATE_POWER_REFS,
  ANIMATE_DURATIONS,
  CEMETERY_TAX_ON,
  addAbility,
  removeAbility,
  toggleAbilityZone,
  togglePassiveKeyword,
  addEffect,
  removeEffect,
  retypeEffect,
} from '../store.js'

// Options for the effect params. `self`/`enemy` resolve relative to the
// activating card's side; `player`/`opponent` are absolute.
const STAT_SIDES = ['self', 'enemy', 'player', 'opponent']
const STAT_KEYS = ['mana', 'life', 'air', 'earth', 'fire', 'water']
const WHO = ['self', 'target']
const ELEMENTS = ['air', 'earth', 'fire', 'water']

// Friendlier labels for the terse effect-param option values.
const amountRefLabel = (r) =>
  r === 'power'
    ? "the source's power"
    : r === 'carriedCount'
    ? 'carried count'
    : r === 'waterBodySize'
    ? 'water-body size'
    : 'a number'
const locationLabel = (l) =>
  l === 'targetLocation'
    ? "the target's location"
    : l === 'picked'
    ? 'a picked location'
    : l === 'projectileStop'
    ? 'where the projectile stopped'
    : l === 'projectileBeyond'
    ? 'the square past the target'
    : "the source's location"
const PROJECTILE_HINT =
  'Fired in a cardinal direction: it flies in a straight line (same region, ' +
  'Stealth units are skipped) and hits the first unit in its path. The player ' +
  'picks the direction by clicking the unit it would hit. For on-hit movement, ' +
  'move self to "where the projectile stopped" (pull the shooter in) or move ' +
  'the target to "the square past the target" (knockback).'
const reachLabel = (r) =>
  r === 'any' ? 'anywhere' : r === 'adjacent' ? 'adjacent (same region)' : 'nearby (same region)'
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
const CONDITION_LABELS = {
  always: 'always',
  onWater: 'it stands on a water site',
  onLand: 'it stands on a land site',
  unitsNearby: 'at least N units are here or nearby',
  lifeAtMost: 'your life is N or less',
  lifeAtLeast: 'your life is N or more',
  manaAtLeast: 'you have N or more mana',
  thresholdAtLeast: 'you have N or more of an element',
  untapped: 'it is untapped',
  tapped: 'it is tapped',
  damaged: 'it is damaged',
}
const CONDITIONS_WITH_AMOUNT = [
  'unitsNearby',
  'lifeAtMost',
  'lifeAtLeast',
  'manaAtLeast',
  'thresholdAtLeast',
]
const TOKEN_LABELS = {
  soldier: 'Foot Soldier',
  skeleton: 'Skeleton',
  frog: 'Frog',
  lance: 'Lance',
  ward: 'Ward',
}
const TOKEN_AT_LABELS = {
  self: 'on this unit',
  target: 'on the target',
  selfSurface: "this card's square (surface)",
  selfBelow: "this card's square (below)",
  targetLocation: "the target's location",
  adjacent: 'an adjacent square (picked)',
  nearby: 'a nearby square (picked)',
  anySite: 'any site (picked)',
}

// A modal over the whole app rather than an inline panel: the action bar lives
// pinned under the mat where a tall form would shove the board off-screen, and
// authoring abilities is a deliberate side-trip, not something done mid-move.
const props = defineProps({ cardId: { type: String, required: true } })
const emit = defineEmits(['close'])

const card = computed(() => state.cards[props.cardId] || null)
const abilities = computed(() => card.value?.abilities || [])

// `from`/`to` may be any category or a wildcard; the plain `zones` picker has
// no wildcard because "usable nowhere" is just an empty list.
const fromToOptions = ['any', ...ZONE_CATEGORIES]

function toggleAffects(ability, kind) {
  const list = ability.passive.affects || (ability.passive.affects = ['units'])
  const i = list.indexOf(kind)
  if (i === -1) list.push(kind)
  else list.splice(i, 1)
}

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
        No abilities yet. Add a triggered ability (fires automatically on a
        matching action) or an activated one (a button while the card is in an
        allowed zone).
      </p>

      <div v-for="ability in abilities" :key="ability.id" class="ability-block">
        <div class="ability-row">
          <span class="ability-kind" :class="ability.kind">{{ ability.kind }}</span>
          <input
            v-model="ability.name"
            class="text-input"
            placeholder="Ability name (e.g. Assume Form)"
          />
          <button
            class="btn small danger"
            :title="`Delete ${ability.name || 'ability'}`"
            @click="onRemove(ability)"
          >
            🗑
          </button>
        </div>

        <textarea
          v-model="ability.text"
          class="text-input text-area"
          rows="2"
          placeholder="Rules text shown to the player when this fires / is activated."
        ></textarea>

        <template v-if="ability.kind !== 'passive'">
          <div class="field-label">Usable in</div>
          <div class="chk-row">
            <label v-for="cat in ZONE_CATEGORIES" :key="cat" class="chk">
              <input
                type="checkbox"
                :checked="ability.zones.includes(cat)"
                @change="toggleAbilityZone(ability, cat)"
              />
              {{ cat }}
            </label>
          </div>
        </template>

        <!-- Triggered: what action, moving between which zones, done by whom. -->
        <template v-if="ability.kind === 'triggered'">
          <div class="grid2">
            <label class="field-label">
              When
              <select v-model="ability.trigger.action" class="text-input">
                <option v-for="a in TRIGGER_ACTIONS" :key="a" :value="a">{{ a }}</option>
              </select>
            </label>
            <label class="field-label">
              By
              <select v-model="ability.trigger.subject" class="text-input">
                <option v-for="s in TRIGGER_SUBJECTS" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
            <label class="field-label">
              From
              <select v-model="ability.trigger.from" class="text-input">
                <option v-for="z in fromToOptions" :key="z" :value="z">{{ z }}</option>
              </select>
            </label>
            <label class="field-label">
              To
              <select v-model="ability.trigger.to" class="text-input">
                <option v-for="z in fromToOptions" :key="z" :value="z">{{ z }}</option>
              </select>
            </label>
          </div>

          <!-- By default a trigger's effects auto-hit the triggering card / its
               grid area. Optionally let the player pick a target when it fires. -->
          <label class="chk">
            <input v-model="ability.target.required" type="checkbox" />
            Player picks a target when this fires
          </label>
          <label v-if="ability.target.required" class="chk">
            <input v-model="ability.target.optional" type="checkbox" />
            Optional (&ldquo;may&rdquo;) — the player can pick no target
          </label>
          <p v-if="ability.target.required && ability.target.optional" class="hint">
            If declined, effects with <em>who: target</em> are skipped; the
            ability's other effects (e.g. draw a card) still resolve.
          </p>
          <div v-if="ability.target.required" class="grid2">
            <label class="field-label">
              Target zone
              <select v-model="ability.target.from" class="text-input">
                <option v-for="z in ZONE_CATEGORIES" :key="z" :value="z">{{ z }}</option>
              </select>
            </label>
            <label class="field-label">
              Target kind
              <select v-model="ability.target.filter" class="text-input">
                <option v-for="f in TARGET_FILTERS" :key="f" :value="f">{{ f }}</option>
              </select>
            </label>
            <label class="field-label">
              Within
              <select v-model="ability.target.within" class="text-input">
                <option v-for="w in TARGET_WITHIN" :key="w" :value="w">{{ w }}</option>
              </select>
            </label>
            <label class="field-label">
              Side
              <select v-model="ability.target.side" class="text-input">
                <option v-for="s in TARGET_SIDES" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
            <template v-if="ability.target.within === 'projectile'">
              <label class="field-label">
                Projectile range
                <input v-model.number="ability.target.range" type="number" min="0" class="text-input" title="Squares it flies; 0 = unlimited" />
              </label>
              <p class="hint span2">{{ PROJECTILE_HINT }}</p>
            </template>
            <p class="hint span2">
              Effects with <em>who: target</em> then act on the picked card
              (measured from this card's location).
            </p>
          </div>
        </template>

        <!-- Passive: a continuous, board-derived modifier applied to a scope. -->
        <template v-else-if="ability.kind === 'passive'">
          <label class="field-label">
            Affects
            <select v-model="ability.scope" class="text-input">
              <option v-for="s in PASSIVE_SCOPES" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <template v-if="ability.scope !== 'self'">
            <div class="field-label">Reaches</div>
            <div class="chk-row">
              <label v-for="k in PASSIVE_AFFECTS" :key="k" class="chk">
                <input
                  type="checkbox"
                  :checked="(ability.passive.affects || ['units']).includes(k)"
                  @change="toggleAffects(ability, k)"
                />
                {{ k }}
              </label>
            </div>
            <label
              v-if="ability.scope.startsWith('aura-area') && (ability.passive.affects || ['units']).includes('units')"
              class="field-label"
            >
              Units in
              <select v-model="ability.passive.unitLayers" class="text-input">
                <option v-for="l in UNIT_LAYERS" :key="l" :value="l">
                  {{ l === 'surface' ? 'surface only' : l === 'below' ? 'below only (underground / underwater)' : 'surface and below' }}
                </option>
              </select>
            </label>
            <p v-if="ability.scope.startsWith('aura-area')" class="hint">
              <em>aura-area</em> is where this card is: for an aura, the four
              squares around its intersection. E.g. tick <em>sites</em> and
              <em>artifacts</em> with <em>Silence</em> to silence them there.
            </p>
          </template>
          <!-- "Only while": the whole passive switches on and off with this. -->
          <div class="grid2">
            <label class="field-label" :class="{ span2: !CONDITIONS_WITH_AMOUNT.includes(ability.condition.type) }">
              Only while
              <select v-model="ability.condition.type" class="text-input">
                <option v-for="c in PASSIVE_CONDITIONS" :key="c" :value="c">{{ CONDITION_LABELS[c] }}</option>
              </select>
            </label>
            <label v-if="CONDITIONS_WITH_AMOUNT.includes(ability.condition.type)" class="field-label">
              N
              <input v-model.number="ability.condition.amount" type="number" min="0" class="text-input" />
            </label>
            <label v-if="ability.condition.type === 'thresholdAtLeast'" class="field-label">
              Element
              <select v-model="ability.condition.element" class="text-input">
                <option v-for="el in ELEMENTS" :key="el" :value="el">{{ el }}</option>
              </select>
            </label>
            <label v-if="ability.condition.type === 'unitsNearby'" class="field-label">
              Whose units
              <select v-model="ability.condition.side" class="text-input">
                <option v-for="s in TARGET_SIDES" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
          </div>
          <template v-if="ability.scope === 'self'">
            <label class="chk">
              <input v-model="ability.passive.animate" type="checkbox" />
              Animate — this non-minion becomes a minion
            </label>
            <div v-if="ability.passive.animate" class="grid2">
              <label class="field-label">
                Power equals
                <select v-model="ability.passive.animatePowerRef" class="text-input">
                  <option v-for="r in ANIMATE_POWER_REFS" :key="r" :value="r">{{ POWER_REF_LABELS[r] }}</option>
                </select>
              </label>
              <label v-if="ability.passive.animatePowerRef === 'literal'" class="field-label">
                Power
                <input v-model.number="ability.passive.animatePower" type="number" min="0" class="text-input" />
              </label>
              <label v-else class="field-label">
                Plus
                <input v-model.number="ability.passive.animatePowerBonus" type="number" class="text-input" />
              </label>
            </div>
            <p v-if="ability.passive.animate" class="hint">
              Applies while this card stands on a realm square (not carried) —
              or, for an aura, its intersection, where it becomes an oversized
              minion on all four squares — and the condition holds; it stops
              being a minion when it doesn't. Sites animate only through an
              <em>animate</em> effect, since they leave Rubble behind.
            </p>
          </template>
          <div class="field-label">Grants keywords</div>
          <div class="chk-row">
            <label v-for="kw in KEYWORDS" :key="kw" class="chk">
              <input
                type="checkbox"
                :checked="ability.passive.keywords.includes(kw)"
                @change="togglePassiveKeyword(ability, kw)"
              />
              {{ kw }}
            </label>
          </div>
          <div class="grid2">
            <label class="field-label">
              Movement +
              <input
                v-model.number="ability.passive.movement"
                type="number"
                class="text-input"
              />
            </label>
            <label class="field-label">
              Strength +
              <input
                v-model.number="ability.passive.strength"
                type="number"
                class="text-input"
              />
            </label>
            <label class="field-label">
              Ranged
              <input
                v-model.number="ability.passive.ranged"
                type="number"
                min="0"
                class="text-input"
              />
            </label>
          </div>
          <label class="chk">
            <input v-model="ability.passive.summonOnEnemySites" type="checkbox" />
            Can be summoned to enemy sites
          </label>
          <p v-if="ability.passive.summonOnEnemySites && ability.scope !== 'self'" class="hint">
            Summoning happens from hand, where only a card's own (<em>self</em>)
            passives apply — area scopes reach units already on the board.
          </p>
          <label class="chk">
            <input v-model="ability.passive.swapCemeteries" type="checkbox" />
            Cemeteries are swapped (each player treats the opponent's as their own, not their own)
          </label>
          <div class="grid2">
            <label class="field-label">
              Cemetery tax (+ mana)
              <input v-model.number="ability.passive.cemeteryTax" type="number" min="0" class="text-input" title="Extra mana to cast from a cemetery or use an ability that targets a cemetery card" />
            </label>
            <label v-if="ability.passive.cemeteryTax" class="field-label">
              Taxes
              <select v-model="ability.passive.cemeteryTaxOn" class="text-input">
                <option v-for="o in CEMETERY_TAX_ON" :key="o" :value="o">{{ o }}</option>
              </select>
            </label>
          </div>
          <label class="chk">
            <input v-model="ability.passive.silence" type="checkbox" />
            Silence (scope loses non-basic abilities)
          </label>
          <label class="chk">
            <input v-model="ability.passive.disable" type="checkbox" />
            Disable (scope loses all abilities and can't act)
          </label>
        </template>

        <!-- Activated: cost, optional target, and how a granted state is lost. -->
        <template v-else-if="ability.kind === 'activated'">
          <div class="grid2">
            <label class="field-label">
              Mana cost
              <input
                v-model.number="ability.cost.mana"
                type="number"
                min="0"
                class="text-input"
              />
            </label>
            <label class="chk">
              <input v-model="ability.cost.tap" type="checkbox" />
              Taps this card
            </label>
            <label class="field-label">
              Uses per turn
              <input
                v-model.number="ability.cost.perTurn"
                type="number"
                min="0"
                class="text-input"
                title="0 = unlimited. A puzzle is a single turn, so this is per attempt."
              />
            </label>
            <p class="hint" style="align-self: end">
              {{ ability.cost.perTurn ? `At most ${ability.cost.perTurn}× per turn` : 'Unlimited' }}
            </p>
          </div>

          <label class="field-label">
            Target mode
            <select v-model="ability.target.mode" class="text-input">
              <option v-for="m in TARGET_MODES" :key="m" :value="m">{{ m }}</option>
            </select>
          </label>

          <!-- Card mode: pick a card in a zone. -->
          <template v-if="ability.target.mode === 'card'">
            <label class="chk">
              <input v-model="ability.target.required" type="checkbox" />
              Requires a target
            </label>
            <label v-if="ability.target.required" class="chk">
              <input v-model="ability.target.optional" type="checkbox" />
              Optional (&ldquo;may&rdquo;) — the player can resolve with no target
            </label>
            <div v-if="ability.target.required" class="grid2">
              <label class="field-label">
                Target zone
                <select v-model="ability.target.from" class="text-input">
                  <option v-for="z in ZONE_CATEGORIES" :key="z" :value="z">{{ z }}</option>
                </select>
              </label>
              <label class="field-label">
                Target kind
                <select v-model="ability.target.filter" class="text-input">
                  <option v-for="f in TARGET_FILTERS" :key="f" :value="f">{{ f }}</option>
                </select>
              </label>
              <label class="field-label">
                Within
                <select v-model="ability.target.within" class="text-input">
                  <option v-for="w in TARGET_WITHIN" :key="w" :value="w">{{ w }}</option>
                </select>
              </label>
              <label class="field-label">
                Side
                <select v-model="ability.target.side" class="text-input">
                  <option v-for="s in TARGET_SIDES" :key="s" :value="s">{{ s }}</option>
                </select>
              </label>
              <template v-if="ability.target.within === 'projectile'">
                <label class="field-label">
                  Projectile range
                  <input v-model.number="ability.target.range" type="number" min="0" class="text-input" title="Squares it flies; 0 = unlimited" />
                </label>
                <p class="hint span2">{{ PROJECTILE_HINT }}</p>
              </template>
              <label class="field-label">
                How many
                <input v-model.number="ability.target.count" type="number" min="1" class="text-input" title="Different cards the player picks" />
              </label>
              <label class="field-label span2">
                Prompt
                <input v-model="ability.target.prompt" class="text-input" placeholder="Choose an Avatar to become" />
              </label>
            </div>
          </template>

          <!-- Grid mode: a location/area on the realm. -->
          <template v-else>
            <div class="grid2">
              <label class="field-label">
                Origin
                <select v-model="ability.target.origin" class="text-input">
                  <option v-for="o in GRID_ORIGINS" :key="o" :value="o">{{ o }}</option>
                </select>
              </label>
              <label v-if="ability.target.origin === 'pick'" class="field-label">
                Range (steps)
                <input v-model.number="ability.target.range" type="number" min="0" class="text-input" />
              </label>
              <label class="field-label">
                Area
                <select v-model="ability.target.shape" class="text-input">
                  <option v-for="s in GRID_SHAPES" :key="s" :value="s">{{ s }}</option>
                </select>
              </label>
              <label class="field-label">
                Affects
                <select v-model="ability.target.filter" class="text-input">
                  <option v-for="f in TARGET_FILTERS" :key="f" :value="f">{{ f }}</option>
                </select>
              </label>
            </div>
            <label class="chk">
              <input v-model="ability.target.throughLayers" type="checkbox" />
              Square-based (through both layers / under-site)
            </label>
            <p class="hint">
              Grid effects (e.g. <em>gridDamage</em>) hit the resolved area. Add
              one below.
            </p>
          </template>

          <label class="field-label">
            Gained abilities lost when
            <select v-model="ability.loseWhen" class="text-input">
              <option v-for="l in LOSE_CONDITIONS" :key="l" :value="l">{{ l }}</option>
            </select>
          </label>
        </template>

        <!-- Structured effects run automatically and reverse on undo. Anything
             they can't express stays in the rules text above. Passives have no
             activation, so no effects list. -->
        <template v-if="ability.kind !== 'passive'">
        <div class="field-label">Effects</div>
        <div v-for="(eff, i) in ability.effects" :key="i" class="effect-row">
          <select
            :value="eff.op"
            class="text-input"
            @change="retypeEffect(ability, i, $event.target.value)"
          >
            <option v-for="op in EFFECT_OPS" :key="op" :value="op">{{ op }}</option>
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
          <template v-else-if="eff.op === 'tap'">
            <select v-model="eff.who" class="text-input">
              <option v-for="w in WHO" :key="w" :value="w">{{ w }}</option>
            </select>
          </template>
          <template v-else-if="eff.op === 'dealDamage'">
            <span class="hint effect-note">to</span>
            <select v-model="eff.who" class="text-input">
              <option v-for="w in WHO" :key="w" :value="w">{{ w }}</option>
            </select>
            <span class="hint effect-note">amount</span>
            <select v-model="eff.amountRef" class="text-input">
              <option v-for="r in AMOUNT_REFS" :key="r" :value="r">{{ amountRefLabel(r) }}</option>
            </select>
            <input v-if="!eff.amountRef || eff.amountRef === 'literal'" v-model.number="eff.amount" type="number" class="text-input num" />
          </template>
          <template v-else-if="eff.op === 'strike'">
            <span class="hint effect-note">this unit strikes</span>
            <select v-model="eff.who" class="text-input">
              <option v-for="w in WHO" :key="w" :value="w">{{ w }}</option>
            </select>
            <span class="hint effect-note">for its power (+Lance)</span>
          </template>
          <template v-else-if="eff.op === 'gridDamage'">
            <span class="hint effect-note">to grid area, amount</span>
            <select v-model="eff.amountRef" class="text-input">
              <option v-for="r in AMOUNT_REFS" :key="r" :value="r">{{ amountRefLabel(r) }}</option>
            </select>
            <input v-if="!eff.amountRef || eff.amountRef === 'literal'" v-model.number="eff.amount" type="number" class="text-input num" />
          </template>
          <template v-else-if="eff.op === 'move'">
            <select
              :value="eff.kind || 'teleport'"
              class="text-input"
              title="Both are forced movement: the unit takes no step, so Immobile doesn't stop it"
              @change="setMoveKind(eff, $event.target.value)"
            >
              <option v-for="k in MOVE_KINDS" :key="k" :value="k">
                {{ k === 'teleport' ? 'teleport' : 'forced (push/pull/drag)' }}
              </option>
            </select>
            <select v-model="eff.who" class="text-input">
              <option v-for="w in WHO" :key="w" :value="w">{{ w }}</option>
            </select>
            <span class="hint effect-note">to</span>
            <select v-model="eff.to" class="text-input">
              <option v-for="l in LOCATION_REFS" :key="l" :value="l">{{ locationLabel(l) }}</option>
            </select>
            <select
              v-if="eff.to === 'picked' && ability.target.mode !== 'grid'"
              v-model="eff.reach"
              class="text-input"
              title="How far from the moving unit the destination may be"
            >
              <option v-for="r in MOVE_REACH" :key="r" :value="r">{{ reachLabel(r) }}</option>
            </select>
            <label
              class="hint effect-note"
              style="display: flex; align-items: center; gap: 0.25rem"
              title="Teleports may change region (surface, underground, underwater, void) by default; other forced movement may not"
            >
              <input v-model="eff.crossRegions" type="checkbox" />
              may change region
            </label>
          </template>
          <template v-else-if="eff.op === 'summonToken'">
            <select
              :value="eff.token"
              class="text-input"
              @change="setTokenKind(eff, $event.target.value)"
            >
              <option v-for="k in TOKEN_KINDS" :key="k" :value="k">{{ TOKEN_LABELS[k] }}</option>
            </select>
            <template v-if="eff.token !== 'ward'">
              <span class="hint effect-note">×</span>
              <input v-model.number="eff.count" type="number" min="1" class="text-input num" title="How many tokens" />
            </template>
            <span class="hint effect-note">at</span>
            <select v-model="eff.at" class="text-input">
              <option v-for="l in tokenLocationsFor(eff.token)" :key="l" :value="l">{{ TOKEN_AT_LABELS[l] }}</option>
            </select>
            <template v-if="['soldier', 'skeleton', 'frog'].includes(eff.token)">
              <span class="hint effect-note">power</span>
              <input v-model.number="eff.power" type="number" min="0" class="text-input num" />
            </template>
            <select v-if="eff.token !== 'ward'" v-model="eff.side" class="text-input" title="Who controls the token">
              <option value="self">yours</option>
              <option value="enemy">opponent's</option>
            </select>
          </template>
          <template v-else-if="['destroy','banish','bounce','heal'].includes(eff.op)">
            <select v-model="eff.who" class="text-input">
              <option v-for="w in WHO" :key="w" :value="w">{{ w }}</option>
            </select>
          </template>
          <template v-else-if="eff.op === 'banishAndCast'">
            <span class="hint effect-note">banish the picked cards; the one you choose may be cast</span>
            <label class="hint effect-note" style="display: flex; align-items: center; gap: 0.25rem">
              <input v-model="eff.free" type="checkbox" />
              for free
            </label>
          </template>
          <template v-else-if="eff.op === 'animate'">
            <select v-model="eff.who" class="text-input">
              <option v-for="w in WHO" :key="w" :value="w">{{ w }}</option>
            </select>
            <span class="hint effect-note">becomes a minion, power =</span>
            <select v-model="eff.powerRef" class="text-input">
              <option v-for="r in ANIMATE_POWER_REFS" :key="r" :value="r">{{ POWER_REF_LABELS[r] }}</option>
            </select>
            <input v-if="(eff.powerRef || 'literal') === 'literal'" v-model.number="eff.power" type="number" min="0" class="text-input num" />
            <template v-else>
              <span class="hint effect-note">+</span>
              <input v-model.number="eff.powerBonus" type="number" class="text-input num" title="Added to the cost" />
            </template>
            <select v-model="eff.duration" class="text-input" title="How long the animation lasts">
              <option v-for="d in ANIMATE_DURATIONS" :key="d" :value="d">{{ DURATION_LABELS[d] }}</option>
            </select>

          </template>
          <template v-else-if="eff.op === 'modifyStrength'">
            <select v-model="eff.who" class="text-input">
              <option v-for="w in WHO" :key="w" :value="w">{{ w }}</option>
            </select>
            <input v-model.number="eff.amount" type="number" class="text-input num" />
          </template>
          <template v-else-if="eff.op === 'grantKeyword'">
            <select v-model="eff.who" class="text-input">
              <option v-for="w in WHO" :key="w" :value="w">{{ w }}</option>
            </select>
            <select v-model="eff.keyword" class="text-input">
              <option v-for="k in KEYWORDS" :key="k" :value="k">{{ k }}</option>
            </select>
          </template>
          <template v-else-if="eff.op === 'flood' || eff.op === 'unflood'">
            <select v-if="ability.target.mode !== 'grid'" v-model="eff.who" class="text-input">
              <option v-for="w in WHO" :key="w" :value="w">{{ w }}'s site</option>
            </select>
            <span v-else class="hint effect-note">every site the target covers</span>
            <label
              v-if="eff.op === 'unflood' && ability.target.mode !== 'grid'"
              class="hint effect-note"
              style="display: flex; align-items: center; gap: 0.25rem"
              title="Drain the whole orthogonally connected body of water, not just this site"
            >
              <input
                type="checkbox"
                :checked="eff.scope === 'body'"
                @change="eff.scope = $event.target.checked ? 'body' : 'site'"
              />
              whole body of water
            </label>
            <span class="hint effect-note">
              {{ eff.op === 'flood' ? '— becomes a water site' : '— becomes land again' }}
            </span>
          </template>
          <span v-else class="hint effect-note">
            {{ eff.op === 'grantFrom' ? 'carries the target — gains its abilities' : 'releases granted cards' }}
          </span>
          <button
            class="btn small danger"
            title="Remove effect"
            @click="removeEffect(ability, i)"
          >
            🗑
          </button>
        </div>
        <button class="btn small" @click="addEffect(ability)">+ Effect</button>
        </template>
      </div>

      <p class="hint">
        Effects run automatically and reverse on undo. The mana cost is deducted
        on activation — don't also add an <em>adjustStat mana</em> effect for it.
        For "assume form", give an activated ability a target and a
        <em>grantFrom</em> effect, and set <em>lost when</em> to how it ends.
        For "banish three spells from your cemetery to cast one", give an
        activated ability a target in <em>cemetery</em>, kind <em>spell</em>,
        <em>how many</em> 3, and a <em>banishAndCast</em> effect.
        <em>animate</em> turns a non-minion in the realm into a minion until it
        leaves the realm; for animation that depends on a condition, use a
        passive with <em>Animate</em> and an <em>only while</em> condition.
        A <em>move</em> or <em>summonToken</em> to a picked location asks the
        player for a square after any target (a grid ability uses its picked
        square instead).
      </p>

      <div class="btn-row">
        <button class="btn" @click="addAbility(cardId, 'triggered')">
          + Triggered ability
        </button>
        <button class="btn" @click="addAbility(cardId, 'activated')">
          + Activated ability
        </button>
        <button class="btn" @click="addAbility(cardId, 'passive')">
          + Passive ability
        </button>
      </div>
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
  width: min(560px, 100%);
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
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin: 0.4rem 0;
}
.grid2 .span2 {
  grid-column: 1 / -1;
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
.effect-row .num {
  flex: 0 0 4.5rem;
  min-width: 0;
}
.effect-note {
  flex: 1 1 auto;
}
</style>
