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
  AMOUNT_REFS,
  EFFECT_OPS,
  KEYWORDS,
  PASSIVE_SCOPES,
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
const amountRefLabel = (r) => (r === 'carriedCount' ? 'carried count' : 'a number')
const locationLabel = (l) =>
  l === 'targetLocation' ? "the target's square" : "the source's square"

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
            <input v-if="eff.amountRef !== 'carriedCount'" v-model.number="eff.amount" type="number" class="text-input num" />
          </template>
          <template v-else-if="eff.op === 'gridDamage'">
            <span class="hint effect-note">to grid area, amount</span>
            <select v-model="eff.amountRef" class="text-input">
              <option v-for="r in AMOUNT_REFS" :key="r" :value="r">{{ amountRefLabel(r) }}</option>
            </select>
            <input v-if="eff.amountRef !== 'carriedCount'" v-model.number="eff.amount" type="number" class="text-input num" />
          </template>
          <template v-else-if="eff.op === 'move'">
            <select v-model="eff.who" class="text-input">
              <option v-for="w in WHO" :key="w" :value="w">{{ w }}</option>
            </select>
            <span class="hint effect-note">to</span>
            <select v-model="eff.to" class="text-input">
              <option v-for="l in LOCATION_REFS" :key="l" :value="l">{{ locationLabel(l) }}</option>
            </select>
          </template>
          <template v-else-if="['destroy','banish','bounce','heal'].includes(eff.op)">
            <select v-model="eff.who" class="text-input">
              <option v-for="w in WHO" :key="w" :value="w">{{ w }}</option>
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
