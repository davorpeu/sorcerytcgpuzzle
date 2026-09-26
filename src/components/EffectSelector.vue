<script setup>
import AreaPicker from './AreaPicker.vue'
import { EFFECT_WHO, AVATAR_SIDES, AREA_SHAPES, TARGET_FILTERS, FILTER_PLURALS, setSelectorWho } from '../store.js'

// Who an effect hits (or, for a 'count' amount, what it counts). `sel` is the
// effect itself or its `countOf` -- both carry who/avatarSide/area -- and is
// edited in place. `grid` says whether the ability has a grid target to reuse;
// `triggered` whether there are trigger cards to name; `pick` whether the player
// picks a target. `suffix` is appended to each `who` label (e.g. "'s site").
const props = defineProps({
  sel: { type: Object, required: true },
  grid: { type: Boolean, default: false },
  triggered: { type: Boolean, default: false },
  pick: { type: Boolean, default: false },
  // Whether an ally fires the ability's projectile target (so 'shooter' names it).
  shooter: { type: Boolean, default: false },
  suffix: { type: String, default: '' },
})

const WHO_LABELS = {
  self: 'this card',
  target: 'the picked target',
  shooter: 'the ally who shot',
  triggering: 'the triggering card',
  other: 'the other card involved',
  avatar: 'an Avatar',
  carrier: 'whoever carries this',
  area: 'cards in an area…',
}
const WHO_TITLES = {
  triggering: 'The card the trigger is about: the one that entered, died, attacked, was attacked…',
  other: 'The other party of the action: the attacker for "when this is attacked", the defender for "when this attacks", the damage source for "when this takes damage"',
  target: 'The card the player picks when this resolves',
  shooter: 'The ally that fired the projectile at the target',
}
// Each card gets exactly one name: in a trigger with no pick there is no
// separate "target" -- it is the triggering or the other card. Options that
// can't resolve here are hidden, but kept if already chosen.
const whos = () =>
  EFFECT_WHO.filter((w) => {
    if (w === props.sel.who) return true
    if (w === 'target') return !props.triggered || props.pick || props.grid
    if (w === 'triggering' || w === 'other') return props.triggered
    if (w === 'shooter') return props.shooter
    return true
  })
const shapes = () => AREA_SHAPES.filter((s) => s !== 'grid' || props.grid || props.sel.area?.shape === 'grid')
const whoLabel = (w) =>
  props.suffix && ['self', 'target', 'shooter', 'triggering', 'other'].includes(w) ? `${WHO_LABELS[w]}${props.suffix}` : WHO_LABELS[w]
// includeSelf is only saved while set.
function setIncludeSelf(on) {
  if (on) props.sel.area.includeSelf = true
  else delete props.sel.area.includeSelf
}
</script>

<template>
  <span class="selector">
    <select
      :value="sel.who"
      class="text-input"
      :title="WHO_TITLES[sel.who] || 'Who this effect hits'"
      @change="setSelectorWho(sel, $event.target.value)"
    >
      <option v-for="w in whos()" :key="w" :value="w" :title="WHO_TITLES[w]">{{ whoLabel(w) }}</option>
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
      <AreaPicker
        v-model:shape="sel.area.shape"
        v-model:side="sel.area.side"
        :include-self="!!sel.area.includeSelf"
        :shapes="shapes()"
        @update:include-self="setIncludeSelf($event)"
      >
        <select
          v-model="sel.area.filter"
          class="text-input"
          title="What kind of card. Units and cards include avatars; sites are only picked by 'sites'"
        >
          <option v-for="f in TARGET_FILTERS" :key="f" :value="f">{{ FILTER_PLURALS[f] }}</option>
        </select>
      </AreaPicker>
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
