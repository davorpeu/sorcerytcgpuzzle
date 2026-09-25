<script setup>
import EffectSelector from './EffectSelector.vue'
import {
  PASSIVE_CONDITIONS,
  CONDITION_SUBJECTS,
  SUBJECT_CONDITIONS,
  STAT_CONDITIONS,
  TARGET_SIDES,
  REGIONS,
  KEYWORDS,
  ELEMENTS,
  setConditionType,
  addSubCondition,
  removeSubCondition,
} from '../store.js'

// A condition (see conditionHolds in the store), edited in place. Recursive for
// all/any. `passive` tests only the card itself (a passive has no target or
// triggering card); `triggered` offers the triggering card as a subject.
const props = defineProps({
  cond: { type: Object, required: true },
  passive: { type: Boolean, default: false },
  triggered: { type: Boolean, default: false },
  depth: { type: Number, default: 0 },
})

const TYPE_LABELS = {
  always: 'always',
  onWater: 'stands on a water site',
  onLand: 'stands on a land site',
  onFlooded: 'stands on a flooded site',
  unitsNearby: 'at least N units are here or nearby',
  lifeAtMost: 'life is N or less',
  lifeAtLeast: 'life is N or more',
  manaAtLeast: 'mana is N or more',
  thresholdAtLeast: 'base threshold in an element is N or more',
  affinityAtLeast: 'affinity (board + passives) in an element is N or more',
  untapped: 'is untapped',
  tapped: 'is tapped',
  damaged: 'is damaged',
  hasKeyword: 'has a keyword',
  region: 'is in a region',
  controlsCard: 'at least N cards…',
  all: 'all of…',
  any: 'any of…',
}
const AMOUNT_TYPES = [
  'unitsNearby',
  'lifeAtMost',
  'lifeAtLeast',
  'manaAtLeast',
  'thresholdAtLeast',
  'affinityAtLeast',
  'controlsCard',
]
const SUBJECT_LABELS = { self: 'this card', target: 'the target', triggering: 'the triggering card' }
// Nesting past a couple of levels is never needed and gets unreadable.
// Set an optional field, dropping it at its default so saved files stay small.
function setOpt(obj, key, value, dflt) {
  if (value === dflt) delete obj[key]
  else obj[key] = value
}
const types = () =>
  PASSIVE_CONDITIONS.filter((t) => props.depth < 2 || (t !== 'all' && t !== 'any'))
const subjects = () =>
  CONDITION_SUBJECTS.filter(
    (s) =>
      s === 'self' ||
      props.cond.subject === s ||
      (!props.passive && (s === 'target' || props.triggered))
  )
</script>

<template>
  <span class="cond">
    <label v-if="cond.type !== 'always'" class="cond-not" title="Negate: true when the test fails">
      <input
        type="checkbox"
        :checked="!!cond.not"
        @change="setOpt(cond, 'not', $event.target.checked, false)"
      />
      not
    </label>
    <select
      v-if="SUBJECT_CONDITIONS.includes(cond.type) && subjects().length > 1"
      :value="cond.subject || 'self'"
      class="text-input"
      title="Which card the test looks at"
      @change="setOpt(cond, 'subject', $event.target.value, 'self')"
    >
      <option v-for="s in subjects()" :key="s" :value="s">{{ SUBJECT_LABELS[s] }}</option>
    </select>
    <select
      v-if="STAT_CONDITIONS.includes(cond.type)"
      :value="cond.whose || 'self'"
      class="text-input"
      title="Whose stats, relative to this card"
      @change="setOpt(cond, 'whose', $event.target.value, 'self')"
    >
      <option value="self">your</option>
      <option value="enemy">opponent's</option>
    </select>
    <select
      :value="cond.type"
      class="text-input"
      title="What to test"
      @change="setConditionType(cond, $event.target.value)"
    >
      <option v-for="t in types()" :key="t" :value="t">{{ TYPE_LABELS[t] || t }}</option>
    </select>
    <input
      v-if="AMOUNT_TYPES.includes(cond.type)"
      v-model.number="cond.amount"
      type="number"
      min="0"
      class="text-input num"
      title="N"
    />
    <select
      v-if="cond.type === 'thresholdAtLeast' || cond.type === 'affinityAtLeast'"
      v-model="cond.element"
      class="text-input"
    >
      <option v-for="el in ELEMENTS" :key="el" :value="el">{{ el }}</option>
    </select>
    <select v-if="cond.type === 'unitsNearby'" v-model="cond.side" class="text-input" title="Whose units">
      <option v-for="s in TARGET_SIDES" :key="s" :value="s">{{ s }}</option>
    </select>
    <select v-if="cond.type === 'hasKeyword'" v-model="cond.keyword" class="text-input">
      <option v-for="k in KEYWORDS" :key="k" :value="k">{{ k }}</option>
    </select>
    <select v-if="cond.type === 'region'" v-model="cond.region" class="text-input">
      <option v-for="r in REGIONS" :key="r" :value="r">{{ r }}</option>
    </select>
    <EffectSelector
      v-if="cond.type === 'controlsCard' && cond.selector"
      :sel="cond.selector"
      :triggered="triggered"
    />

    <span v-if="cond.type === 'all' || cond.type === 'any'" class="cond-list">
      <span v-for="(sub, i) in cond.of" :key="i" class="cond-sub">
        <ConditionEditor :cond="sub" :passive="passive" :triggered="triggered" :depth="depth + 1" />
        <button class="btn small danger" title="Remove" @click="removeSubCondition(cond, i)">🗑</button>
      </span>
      <button class="btn small" @click="addSubCondition(cond)">+ test</button>
    </span>
  </span>
</template>

<style scoped>
.cond {
  display: contents;
}
.cond .text-input {
  flex: 1 1 6rem;
  min-width: 5rem;
}
.cond .num {
  flex: 0 0 4rem;
  min-width: 0;
}
.cond-not {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.8rem;
}
.cond-list {
  flex: 1 1 100%;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding-left: 0.8rem;
  border-left: 2px solid rgba(255, 255, 255, 0.12);
}
.cond-sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
</style>
