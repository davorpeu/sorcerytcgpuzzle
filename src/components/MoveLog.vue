<script setup>
import { computed } from 'vue'
import { state, zoneLabel, cardName } from '../store.js'

const entries = computed(() => {
  if (state.mode === 'play') return state.moves
  if (state.recording) return state.draft
  return state.solutions[state.solutions.length - 1] || []
})

const title = computed(() => {
  if (state.mode === 'play') return `Your moves (${state.moves.length})`
  if (state.recording)
    return `Recording solution ${state.solutions.length + 1} (${state.draft.length})`
  const n = state.solutions.length
  if (!n) return 'Solution (none recorded)'
  return `Solution ${n} of ${n} (${entries.value.length} moves)`
})

function entryClass(i) {
  if (state.mode !== 'play' || !state.checked) return ''
  if (state.firstWrong === -1 || i < state.firstWrong) return 'ok'
  if (i === state.firstWrong) return 'bad'
  return 'after'
}
</script>

<template>
  <div class="move-log">
    <div class="zone-title">{{ title }}</div>
    <ol v-if="entries.length">
      <li v-for="(m, i) in entries" :key="i" :class="entryClass(i)">
        <template v-if="m.type === 'attack'">
          <strong>{{ cardName(m.cardId) }}</strong>
          ⚔ attacks <strong>{{ cardName(m.targetId) }}</strong>
        </template>
        <template v-else>
          <strong>{{ cardName(m.cardId) }}</strong>
          {{ zoneLabel(m.from) }} → {{ zoneLabel(m.to) }}
        </template>
      </li>
    </ol>
    <p v-else class="hint">
      {{
        state.mode === 'play'
          ? 'Drag cards to make your moves.'
          : 'No solution recorded yet.'
      }}
    </p>
  </div>
</template>
