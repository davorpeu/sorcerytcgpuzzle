<script setup>
import { computed, ref } from 'vue'
import { moveCard, ui, zoneOf, zoneLabel } from '../store.js'

const props = defineProps({
  zone: { type: String, required: true },
  // Whether this zone is a keyboard stop while it is armed. Squares stack
  // three zones on top of each other (site slot, surface, below) and every
  // one of them would be a Tab stop, so the board offers only the surface
  // zone to the keyboard: moveCard routes a site card dropped there into the
  // site slot anyway, and "send below" is a button on the action bar.
  keyboard: { type: Boolean, default: true },
})
const over = ref(false)

// A zone is "armed" while a card is selected: clicking it moves that card
// here. This is the touch-friendly counterpart to dragging, and the only way
// to play on a tablet, where HTML5 drag-and-drop does not fire at all.
const armed = computed(() => !!ui.selected && !ui.attacker && !ui.striker)

// Only armed zones are reachable by keyboard. Twenty squares plus the hands
// and cemeteries would otherwise sit in the Tab order permanently, ahead of
// every real control, and do nothing when activated.
const tabbable = computed(() => armed.value && props.keyboard)

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
    :role="tabbable ? 'button' : null"
    :tabindex="tabbable ? 0 : null"
    :aria-label="tabbable ? `Move here: ${zoneLabel(zone)}` : null"
    @dragover.prevent="over = true"
    @dragleave="over = false"
    @drop.prevent="onDrop"
    @click="onClick"
    @keydown.enter.prevent="onClick"
    @keydown.space.prevent="onClick"
  >
    <slot />
  </div>
</template>
