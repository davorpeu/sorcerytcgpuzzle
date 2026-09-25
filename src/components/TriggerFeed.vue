<script setup>
import { computed, ref, watch } from 'vue'
import { state, emitFx } from '../store.js'

// What the last move set off, shown as compact chips in the storyline block.
// Nothing to dismiss: the strip is keyed to the latest logged entry's seq, so
// the next move replaces it (or empties it), and undo brings the previous
// move's chips back. The move log keeps the full history.
const log = computed(() =>
  state.mode === 'play' ? state.moves : state.recording ? state.draft : []
)
const recent = computed(() => {
  const seq = log.value.at(-1)?.seq
  return seq == null ? [] : state.events.filter((e) => e.seq === seq)
})

// Which chip has its rules text open. Reset whenever the strip changes.
const open = ref(null)
watch(recent, () => (open.value = null))

// Each newly fired event also flashes its source card on the board, with the
// ability name floating off it (FxOverlay draws the label). `seen` marks how
// far into state.events we've announced; undo shrinks the list, so clamp.
const seen = ref(state.events.length)
watch(
  () => state.events.length,
  (n) => {
    if (n > seen.value) {
      state.events.slice(seen.value).forEach((ev, i) => {
        if (ev.status === 'ignored') return
        emitFx('trigger', { cardId: ev.cardId, label: ev.name, stack: i })
      })
    }
    seen.value = n
  }
)
</script>

<template>
  <ul v-if="recent.length" class="trigger-feed" aria-live="polite">
    <li
      v-for="ev in recent"
      :key="ev.id"
      class="trigger-chip"
      :class="{ ignored: ev.status === 'ignored', open: open === ev.id }"
    >
      <button
        type="button"
        class="chip-head"
        :aria-expanded="open === ev.id"
        @click="open = open === ev.id ? null : ev.id"
      >
        <span class="chip-icon" aria-hidden="true">✧</span>
        <span class="chip-name">
          <strong>{{ state.cards[ev.cardId]?.name }}</strong> — {{ ev.name }}
        </span>
      </button>
      <div v-if="open === ev.id" class="chip-body">
        <div v-if="ev.text" class="chip-text">{{ ev.text }}</div>
        <div v-if="ev.status === 'ignored'" class="chip-src">
          ignored — {{ ev.reason || 'its source left the realm' }}
        </div>
        <div v-if="ev.triggeringId && ev.triggeringId !== ev.cardId" class="chip-src">
          set off by {{ state.cards[ev.triggeringId]?.name }}
        </div>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.trigger-feed {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.trigger-chip {
  border: 1px solid rgba(200, 120, 255, 0.45);
  background: rgba(200, 120, 255, 0.1);
  border-radius: 8px;
  font-size: 0.8rem;
  animation: chip-in 0.25s ease-out;
}
@media (prefers-reduced-motion: reduce) {
  .trigger-chip {
    animation: none;
  }
}
@keyframes chip-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.chip-head {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  width: 100%;
  padding: 0.3rem 0.5rem;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.chip-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trigger-chip.open .chip-name {
  white-space: normal;
}
.chip-icon {
  color: rgb(210, 150, 255);
}
.chip-body {
  padding: 0 0.5rem 0.4rem 1.45rem;
}
.chip-text {
  line-height: 1.35;
  white-space: pre-wrap;
}
.chip-src {
  font-size: 0.75rem;
  opacity: 0.7;
  margin-top: 0.2rem;
}
.trigger-chip.ignored {
  opacity: 0.55;
}
.trigger-chip.ignored .chip-name {
  text-decoration: line-through;
}
</style>
