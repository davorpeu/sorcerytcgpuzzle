<script setup>
import AreaPicker from './AreaPicker.vue'
import { ZONE_CATEGORIES, TARGET_FILTERS, FILTER_LABELS, FILTER_PLURALS, GRID_SHAPES, TARGET_WITHIN } from '../store.js'

// The "choose" step of an ability: nothing, a card, or a square/area on the
// realm. Edits one target spec (the shape normalizeAbility gives an ability's
// `target`) in place -- used for the ability itself and for each mode of a
// modal ability. `triggered` hides grid targets (a trigger aims at a card) and
// names what happens with no pick. Emits `pick` (true/false) when the player
// starts/stops picking a card, so a trigger can re-point its effects.
const props = defineProps({
  t: { type: Object, required: true },
  triggered: { type: Boolean, default: false },
})
const emit = defineEmits(['pick'])

const PROJECTILE_HINT =
  'Fired in a cardinal direction: it flies in a straight line (same region, ' +
  'Stealth units are skipped) and hits the first unit in its path. The player ' +
  'picks the direction by clicking the unit it would hit.'

const choice = () => (props.t.mode === 'grid' ? 'grid' : props.t.required ? 'card' : 'none')
function setChoice(c) {
  const wasPick = props.t.mode === 'card' && props.t.required
  props.t.mode = c === 'grid' ? 'grid' : 'card'
  props.t.required = c === 'card'
  const isPick = c === 'card'
  if (wasPick !== isPick) emit('pick', isPick)
}
const choices = () => [
  ['none', props.triggered ? 'nothing — use the trigger’s cards' : 'nothing'],
  ['card', 'a card'],
  ...(props.triggered && props.t.mode !== 'grid' ? [] : [['grid', 'a square / area on the realm']]),
]
</script>

<template>
  <div class="tgt">
    <label class="choose span2">
      <span class="step-word">Choose</span>
      <select :value="choice()" class="text-input" @change="setChoice($event.target.value)">
        <option v-for="[v, l] in choices()" :key="v" :value="v">{{ l }}</option>
      </select>
    </label>

    <template v-if="choice() === 'card'">
      <div class="row span2">
        <input v-model.number="t.count" type="number" min="1" class="text-input num" title="How many different cards the player picks" />
        <select v-model="t.filter" class="text-input" title="What kind of card">
          <option v-for="f in TARGET_FILTERS" :key="f" :value="f">{{ FILTER_LABELS[f] }}</option>
        </select>
        <span class="hint">in</span>
        <select v-model="t.from" class="text-input" title="Which zone it is picked from">
          <option v-for="z in ZONE_CATEGORIES" :key="z" :value="z">{{ z }}</option>
        </select>
      </div>
      <div v-if="t.from === 'realm'" class="row span2">
        <span class="hint">whose / where</span>
        <AreaPicker v-model:shape="t.within" v-model:side="t.side" :shapes="TARGET_WITHIN" />
        <input
          v-if="t.within === 'projectile'"
          v-model.number="t.range"
          type="number"
          min="0"
          class="text-input num"
          title="Squares it flies; 0 = unlimited"
        />
      </div>
      <div v-else class="row span2">
        <span class="hint">whose</span>
        <select v-model="t.side" class="text-input">
          <option value="any">anyone's</option>
          <option value="friendly">yours</option>
          <option value="enemy">the opponent's</option>
        </select>
      </div>
      <p v-if="t.from === 'realm' && t.within === 'projectile'" class="hint span2">{{ PROJECTILE_HINT }}</p>
      <label class="chk">
        <input v-model="t.optional" type="checkbox" />
        optional (&ldquo;you may&rdquo;)
      </label>
      <label v-if="t.count > 1" class="chk">
        <input v-model="t.upTo" type="checkbox" />
        up to that many
      </label>
      <label class="field-label span2">
        Prompt
        <input v-model="t.prompt" class="text-input" placeholder="e.g. Choose a minion" />
      </label>
    </template>

    <template v-else-if="choice() === 'grid'">
      <div class="row span2">
        <select v-model="t.origin" class="text-input" title="Where the area is centred">
          <option value="self">around this card</option>
          <option value="pick">around a square the player picks</option>
        </select>
        <input
          v-if="t.origin === 'pick'"
          v-model.number="t.range"
          type="number"
          min="0"
          class="text-input num"
          title="How many steps away the player may pick (0 = anywhere)"
        />
      </div>
      <div class="row span2">
        <span class="hint">covering</span>
        <AreaPicker v-model:shape="t.shape" :shapes="GRID_SHAPES" />
        <span class="hint">hits</span>
        <select v-model="t.filter" class="text-input" title="What kind of card in the area">
          <option v-for="f in TARGET_FILTERS" :key="f" :value="f">{{ FILTER_PLURALS[f] }}</option>
        </select>
      </div>
      <label class="chk span2">
        <input v-model="t.throughLayers" type="checkbox" />
        both layers (surface and below)
      </label>
    </template>
  </div>
</template>

<style scoped>
.tgt {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
  margin: 0.3rem 0;
}
.tgt .span2 {
  grid-column: 1 / -1;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.row .text-input {
  flex: 1 1 6rem;
  min-width: 5rem;
}
.row .num {
  flex: 0 0 4rem;
  min-width: 0;
}
.choose {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.choose .text-input {
  flex: 1 1 auto;
}
.step-word {
  font-weight: 700;
  font-size: 0.9rem;
}
.field-label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.85rem;
}
.chk {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.85rem;
}
</style>
