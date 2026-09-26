<script setup>
// The one "where / whose" picker every part of the ability editor uses -- effect
// areas, passive scopes, target and trigger ranges, grid targets -- so the same
// words always mean the same thing. As in the rulebook, adjacent and nearby
// include the card's own square; whether the card itself counts is the separate
// "other than this card" box.
//
// v-model:shape is required; v-model:side and v-model:includeSelf are shown only
// when bound (pass undefined to hide).
const props = defineProps({
  shapes: { type: Array, required: true },
  shape: { type: String, required: true },
  side: { type: String, default: undefined },
  sides: { type: Array, default: () => ['any', 'friendly', 'enemy'] },
  includeSelf: { type: Boolean, default: undefined },
})
const emit = defineEmits(['update:shape', 'update:side', 'update:includeSelf'])

const SHAPE_LABELS = {
  self: 'this card',
  bearer: 'whoever carries this',
  location: 'here (its location)',
  adjacent: 'adjacent',
  nearby: 'nearby',
  realm: 'anywhere in the realm',
  any: 'anywhere',
  grid: 'the targeted area',
  avatar: 'an Avatar',
  projectile: 'first hit by a projectile',
}
const SHAPE_TITLES = {
  location: "The card's own location -- for an aura, the 2×2 squares it covers",
  adjacent: 'Its own square and the 4 that share a border with it (same region)',
  nearby: 'Its own square and the 8 around it, diagonals too (same region)',
  realm: 'Every card in play, any region',
  grid: "The ability's grid target",
}
const SIDE_LABELS = { any: "anyone's", friendly: 'your', enemy: "opponent's" }

// Shapes where "this card" could be among the cards picked.
const selfable = (s) => ['location', 'adjacent', 'nearby', 'realm'].includes(s)
const hasSide = () => props.side !== undefined && !['self', 'bearer'].includes(props.shape)
</script>

<template>
  <span class="area-picker">
    <select
      v-if="hasSide()"
      :value="side"
      class="text-input"
      title="Whose cards, relative to this card"
      @change="emit('update:side', $event.target.value)"
    >
      <option v-for="s in sides" :key="s" :value="s">{{ SIDE_LABELS[s] || s }}</option>
    </select>
    <!-- The caller's "what kind" control, so it reads "opponent's minions nearby". -->
    <slot />
    <select
      :value="shape"
      class="text-input"
      :title="SHAPE_TITLES[shape] || 'Where'"
      @change="emit('update:shape', $event.target.value)"
    >
      <option v-for="s in shapes" :key="s" :value="s" :title="SHAPE_TITLES[s]">{{ SHAPE_LABELS[s] || s }}</option>
    </select>
    <label
      v-if="includeSelf !== undefined && selfable(shape)"
      class="chk"
      title="Leave this card itself out"
    >
      <input
        type="checkbox"
        :checked="!includeSelf"
        @change="emit('update:includeSelf', !$event.target.checked)"
      />
      other than this card
    </label>
  </span>
</template>

<style scoped>
.area-picker {
  display: contents;
}
.area-picker .text-input {
  flex: 1 1 6rem;
  min-width: 5rem;
}
.chk {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8rem;
}
</style>
