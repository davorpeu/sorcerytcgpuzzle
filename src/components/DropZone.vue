<script setup>
import { computed, ref } from 'vue'
import { moveCard, ui, zoneOf } from '../store.js'

const props = defineProps({ zone: { type: String, required: true } })
const over = ref(false)

// A zone is "armed" while a card is selected: clicking it moves that card
// here. This is the touch-friendly counterpart to dragging, and the only way
// to play on a tablet, where HTML5 drag-and-drop does not fire at all.
const armed = computed(() => !!ui.selected && !ui.attacker && !ui.striker)

function onDrop(e) {
  over.value = false
  try {
    const d = JSON.parse(e.dataTransfer.getData('text/plain'))
    if (d && d.cardId) moveCard(d.cardId, d.from, props.zone)
  } catch {
    /* not a card drag */
  }
}

function onClick() {
  if (!armed.value) return
  const from = zoneOf(ui.selected)
  if (from) moveCard(ui.selected, from, props.zone)
}
</script>

<template>
  <div
    class="dropzone"
    :class="{ over, armed }"
    @dragover.prevent="over = true"
    @dragleave="over = false"
    @drop.prevent="onDrop"
    @click="onClick"
  >
    <slot />
  </div>
</template>
