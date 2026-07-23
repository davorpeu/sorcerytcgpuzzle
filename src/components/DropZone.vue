<script setup>
import { ref } from 'vue'
import { moveCard } from '../store.js'

const props = defineProps({ zone: { type: String, required: true } })
const over = ref(false)

function onDrop(e) {
  over.value = false
  try {
    const d = JSON.parse(e.dataTransfer.getData('text/plain'))
    if (d && d.cardId) moveCard(d.cardId, d.from, props.zone)
  } catch {
    /* not a card drag */
  }
}
</script>

<template>
  <div
    class="dropzone"
    :class="{ over }"
    @dragover.prevent="over = true"
    @dragleave="over = false"
    @drop.prevent="onDrop"
  >
    <slot />
  </div>
</template>
