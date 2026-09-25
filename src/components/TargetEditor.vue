<script setup>
import {
  ZONE_CATEGORIES,
  TARGET_FILTERS,
  TARGET_MODES,
  GRID_ORIGINS,
  GRID_SHAPES,
  TARGET_WITHIN,
  TARGET_SIDES,
} from '../store.js'

// A compact editor for one target spec (the shape normalizeAbility gives an
// ability's `target`) -- used for each mode of a modal ability, whose modes may
// aim differently.
defineProps({ t: { type: Object, required: true } })
</script>

<template>
  <div class="tgt">
    <label class="field-label">
      Target
      <select v-model="t.mode" class="text-input">
        <option v-for="m in TARGET_MODES" :key="m" :value="m">{{ m }}</option>
      </select>
    </label>
    <template v-if="t.mode === 'card'">
      <label class="chk">
        <input v-model="t.required" type="checkbox" />
        Requires a target
      </label>
      <template v-if="t.required">
        <label class="chk">
          <input v-model="t.optional" type="checkbox" />
          Optional (&ldquo;may&rdquo;)
        </label>
        <label class="field-label">
          Zone
          <select v-model="t.from" class="text-input">
            <option v-for="z in ZONE_CATEGORIES" :key="z" :value="z">{{ z }}</option>
          </select>
        </label>
        <label class="field-label">
          Kind
          <select v-model="t.filter" class="text-input">
            <option v-for="f in TARGET_FILTERS" :key="f" :value="f">{{ f }}</option>
          </select>
        </label>
        <label class="field-label">
          Within
          <select v-model="t.within" class="text-input">
            <option v-for="w in TARGET_WITHIN" :key="w" :value="w">{{ w }}</option>
          </select>
        </label>
        <label class="field-label">
          Side
          <select v-model="t.side" class="text-input">
            <option v-for="s in TARGET_SIDES" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>
        <label v-if="t.within === 'projectile'" class="field-label">
          Projectile range
          <input v-model.number="t.range" type="number" min="0" class="text-input" title="Squares it flies; 0 = unlimited" />
        </label>
        <label class="field-label">
          How many
          <input v-model.number="t.count" type="number" min="1" class="text-input" />
        </label>
        <label v-if="t.count > 1" class="chk">
          <input v-model="t.upTo" type="checkbox" />
          Up to that many
        </label>
        <label class="field-label span2">
          Prompt
          <input v-model="t.prompt" class="text-input" placeholder="Choose a minion" />
        </label>
      </template>
    </template>
    <template v-else>
      <label class="field-label">
        Origin
        <select v-model="t.origin" class="text-input">
          <option v-for="o in GRID_ORIGINS" :key="o" :value="o">{{ o }}</option>
        </select>
      </label>
      <label v-if="t.origin === 'pick'" class="field-label">
        Range (steps)
        <input v-model.number="t.range" type="number" min="0" class="text-input" />
      </label>
      <label class="field-label">
        Area
        <select v-model="t.shape" class="text-input">
          <option v-for="s in GRID_SHAPES" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <label class="field-label">
        Affects
        <select v-model="t.filter" class="text-input">
          <option v-for="f in TARGET_FILTERS" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>
      <label class="chk">
        <input v-model="t.throughLayers" type="checkbox" />
        Through both layers
      </label>
    </template>
  </div>
</template>

<style scoped>
.tgt {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin: 0.4rem 0;
}
.tgt .span2 {
  grid-column: 1 / -1;
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
