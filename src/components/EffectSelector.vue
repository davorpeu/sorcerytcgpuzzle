<script setup>
import {
  EFFECT_WHO,
  AVATAR_SIDES,
  AREA_SHAPES,
  TARGET_FILTERS,
  TARGET_SIDES,
  setSelectorWho,
} from '../store.js'

// Who an effect hits (or, for a 'count' amount, what it counts). `sel` is the
// effect itself or its `countOf` -- both carry who/avatarSide/area -- and is
// edited in place. `grid` says whether the ability has a grid target to reuse;
// `triggered` whether there is a triggering card to pick. `suffix` is appended
// to each `who` label (e.g. "'s site" for flood).
const props = defineProps({
  sel: { type: Object, required: true },
  grid: { type: Boolean, default: false },
  triggered: { type: Boolean, default: false },
  suffix: { type: String, default: '' },
})

const WHO_LABELS = {
  self: 'self',
  target: 'target',
  triggering: 'triggering card',
  avatar: 'avatar',
  carrier: 'carrier',
  area: 'area…',
}
const AREA_SIDE_LABELS = { any: "anyone's", friendly: 'your', enemy: "opponent's" }
const FILTER_LABELS = {
  any: 'cards',
  unit: 'units',
  minion: 'minions',
  avatar: 'avatars',
  site: 'sites',
  aura: 'auras',
  artifact: 'artifacts',
  monument: 'monuments',
  spell: 'spells',
}
const SHAPE_LABELS = {
  grid: 'in the grid target',
  location: 'at its location',
  adjacent: 'adjacent',
  nearby: 'nearby',
  realm: 'anywhere in play',
}
// Options that can't resolve here are hidden, but kept if already chosen so a
// saved value still shows.
const whos = () =>
  EFFECT_WHO.filter((w) => w !== 'triggering' || props.triggered || props.sel.who === 'triggering')
const shapes = () =>
  AREA_SHAPES.filter((s) => s !== 'grid' || props.grid || props.sel.area?.shape === 'grid')
const whoLabel = (w) =>
  props.suffix && (w === 'self' || w === 'target') ? `${WHO_LABELS[w]}${props.suffix}` : WHO_LABELS[w]
</script>

<template>
  <span class="selector">
    <select
      :value="sel.who"
      class="text-input"
      title="Who this effect hits"
      @change="setSelectorWho(sel, $event.target.value)"
    >
      <option v-for="w in whos()" :key="w" :value="w">{{ whoLabel(w) }}</option>
    </select>
    <select
      v-if="sel.who === 'avatar'"
      v-model="sel.avatarSide"
      class="text-input"
      title="Whose avatar, relative to this card"
    >
      <option v-for="s in AVATAR_SIDES" :key="s" :value="s">{{ s === 'self' ? 'yours' : "opponent's" }}</option>
    </select>
    <template v-if="sel.who === 'area' && sel.area">
      <select v-model="sel.area.side" class="text-input" title="Whose cards, relative to this card">
        <option v-for="s in TARGET_SIDES" :key="s" :value="s">{{ AREA_SIDE_LABELS[s] }}</option>
      </select>
      <select
        v-model="sel.area.filter"
        class="text-input"
        title="What kind of card. Units and cards include avatars; sites are only picked by 'sites'"
      >
        <option v-for="f in TARGET_FILTERS" :key="f" :value="f">{{ FILTER_LABELS[f] || f }}</option>
      </select>
      <select
        v-model="sel.area.shape"
        class="text-input"
        title="The ability's grid target, or around this card in its own region. Adjacent/nearby are the ring around its square and leave out its own location; use 'at its location' for that"
      >
        <option v-for="s in shapes()" :key="s" :value="s">{{ SHAPE_LABELS[s] || s }}</option>
      </select>
    </template>
  </span>
</template>

<style scoped>
/* Lays its controls out inline in the parent's effect row. */
.selector {
  display: contents;
}
.selector .text-input {
  flex: 1 1 6rem;
  min-width: 5rem;
}
</style>
