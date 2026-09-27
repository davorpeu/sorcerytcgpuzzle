<script setup>
import { computed } from 'vue'

// Element colours from the mockup (light enough to read on the felt).
// Classic alchemical symbols: fire △, water ▽, air △ with bar, earth ▽ with bar.
const DEFS = {
  air: { color: '#dce4eb', up: true, bar: true },
  earth: { color: '#d1b56a', up: false, bar: true },
  fire: { color: '#ee9474', up: true, bar: false },
  water: { color: '#7dbbe6', up: false, bar: false },
}

const props = defineProps({ element: { type: String, required: true } })
const d = computed(() => DEFS[props.element] || DEFS.fire)
</script>

<template>
  <svg
    class="th-icon"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    :style="{ color: d.color }"
  >
    <title>{{ element }}</title>
    <polygon
      :points="d.up ? '12,3 21.5,20.5 2.5,20.5' : '2.5,3.5 21.5,3.5 12,21'"
      fill="none"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linejoin="round"
    />
    <line
      v-if="d.bar"
      x1="6.8"
      :y1="d.up ? 14.5 : 9.5"
      x2="17.2"
      :y2="d.up ? 14.5 : 9.5"
      stroke="currentColor"
      stroke-width="2.4"
    />
  </svg>
</template>
