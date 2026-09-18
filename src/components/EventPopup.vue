<script setup>
import { computed, ref, watch } from 'vue'
import { state, ui } from '../store.js'

// `state.events` is the whole session's fired events (the move log reads it too),
// so the popup tracks how many it has already shown and plays only the new ones.
// Undo shrinks the list; clamp so the marker never sits past the end.
const seen = ref(0)
watch(
  () => state.events.length,
  (n) => {
    if (n < seen.value) seen.value = n
  }
)

// The popup is the player-facing "the ability plays" moment, so it only shows
// while playing. During recording the author still sees each trigger listed in
// the move log, without a modal interrupting every step. It also steps aside
// while the storyline is paused for a target choice -- that needs the board.
const pending = computed(() =>
  state.mode === 'play' && !ui.storyChoice ? state.events.slice(seen.value) : []
)

function dismiss() {
  seen.value = state.events.length
}
</script>

<template>
  <div
    v-if="pending.length"
    class="event-modal"
    role="dialog"
    aria-modal="true"
    aria-label="Ability triggered"
    @click.self="dismiss"
  >
    <div class="event-dialog">
      <div class="event-head">
        {{ pending.length > 1 ? `${pending.length} abilities triggered` : 'Ability triggered' }}
      </div>
      <div v-for="ev in pending" :key="ev.id" class="event-item" :class="{ ignored: ev.status === 'ignored' }">
        <img
          v-if="state.cards[ev.cardId]?.img"
          :src="state.cards[ev.cardId].img"
          class="event-art"
          alt=""
        />
        <div class="event-body">
          <div class="event-name">
            {{ state.cards[ev.cardId]?.name }} — {{ ev.name }}
          </div>
          <div v-if="ev.text" class="event-text">{{ ev.text }}</div>
          <div v-if="ev.status === 'ignored'" class="event-src">
            ignored — its source left the realm
          </div>
          <div
            v-if="ev.triggeringId && ev.triggeringId !== ev.cardId"
            class="event-src"
          >
            set off by {{ state.cards[ev.triggeringId]?.name }}
          </div>
        </div>
      </div>
      <button class="btn primary" @click="dismiss">Continue</button>
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
.event-item {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  margin-bottom: 0.6rem;
}
.event-item.ignored {
  opacity: 0.5;
}
.event-item.ignored .event-name {
  text-decoration: line-through;
}
.event-art {
  width: 64px;
  height: auto;
  border-radius: 6px;
  flex: none;
}
.event-name {
  font-weight: 600;
  margin-bottom: 0.2rem;
}
.event-text {
  font-size: 0.9rem;
  line-height: 1.35;
  white-space: pre-wrap;
}
.event-src {
  font-size: 0.78rem;
  opacity: 0.7;
  margin-top: 0.25rem;
}
</style>
