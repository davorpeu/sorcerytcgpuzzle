<script setup>
import { computed, ref, watch } from 'vue'
import { state, pendingModeChoice, chooseModes, cancelModeChoice } from '../store.js'

// "Choose one / choose two": a modal ability asks for its modes before any
// targeting. Shared by activations, casts (bar or drag) and paused triggers --
// the store's pendingModeChoice() says which. One-mode choices resolve on a
// click; multi-mode ones tick checkboxes and confirm.
const choice = computed(() => pendingModeChoice())
const picked = ref([])
watch(
  () => choice.value && `${choice.value.cardId}:${choice.value.ability.id}`,
  () => (picked.value = [])
)

const single = computed(() => choice.value?.count === 1)
const ready = computed(() => picked.value.length === choice.value?.count)

function toggle(i) {
  if (single.value) {
    chooseModes([i])
    return
  }
  const at = picked.value.indexOf(i)
  if (at !== -1) picked.value.splice(at, 1)
  else if (picked.value.length < choice.value.count) picked.value.push(i)
}
</script>

<template>
  <div v-if="choice" class="event-modal" role="dialog" aria-modal="true" aria-label="Choose a mode">
    <div class="event-dialog">
      <div class="event-head">
        {{ state.cards[choice.cardId]?.name }} — {{ choice.ability.name || 'Ability' }}:
        choose {{ choice.count === 1 ? 'one' : choice.count }}
      </div>
      <p v-if="choice.ability.text" class="event-text">{{ choice.ability.text }}</p>
      <div class="mode-list">
        <button
          v-for="(m, i) in choice.ability.modes"
          :key="i"
          class="btn mode-btn"
          :class="{ primary: picked.includes(i) }"
          :aria-pressed="picked.includes(i)"
          @click="toggle(i)"
        >
          {{ m.name || `Mode ${i + 1}` }}
        </button>
      </div>
      <div class="btn-row">
        <button v-if="!single" class="btn primary" :disabled="!ready" @click="chooseModes(picked)">
          Confirm
        </button>
        <button v-if="!choice.story" class="btn" @click="cancelModeChoice">Cancel</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.event-modal {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.5);
}
.event-dialog {
  width: min(420px, 100%);
  background: var(--panel, #1b1f2a);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 10px;
  padding: 1rem;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.55);
  animation: event-pop 0.16s ease-out;
}
@keyframes event-pop {
  from {
    transform: scale(0.94);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
.event-head {
  font-weight: 600;
  margin-bottom: 0.6rem;
  letter-spacing: 0.02em;
}
.event-text {
  font-size: 0.9rem;
  line-height: 1.35;
  white-space: pre-wrap;
  margin: 0 0 0.6rem;
}
.mode-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.8rem;
}
.mode-btn {
  text-align: left;
}
.btn-row {
  display: flex;
  gap: 0.5rem;
}
</style>
