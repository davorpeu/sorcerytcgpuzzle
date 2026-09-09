<script setup>
import { computed, ref, watch } from 'vue'
import { state, zoneLabel, cardName } from '../store.js'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Which recorded line the log is showing. It used to show the last one and
// nothing else, so a puzzle with three solutions had two of them unreadable:
// the sidebar listed their lengths but there was no way to see the moves.
const lineIdx = ref(0)

watch(
  () => state.solutions.length,
  (n, prev) => {
    // A line you have just finished recording is the one you want to read
    // back, so the log follows it. Deleting one can leave the index past the
    // end instead, so it comes back to the last line that still exists.
    if (n > (prev ?? 0)) lineIdx.value = n - 1
    else if (lineIdx.value > n - 1) lineIdx.value = Math.max(0, n - 1)
  }
)

const entries = computed(() => {
  if (state.mode === 'play') return state.moves
  if (state.recording) return state.draft
  return state.solutions[lineIdx.value] || []
})

const title = computed(() => {
  if (state.mode === 'play') return `Your moves (${state.moves.length})`
  if (state.recording)
    return `Recording solution ${state.solutions.length + 1} (${state.draft.length})`
  const n = state.solutions.length
  if (!n) return 'Solution (none recorded)'
  return `Solution ${lineIdx.value + 1} of ${n} (${plural(
    entries.value.length,
    'move'
  )})`
})

// The line picker is only worth the row when there is more than one line to
// pick, and it has nothing to say while a line is being recorded.
const showPicker = computed(
  () => state.mode === 'editor' && !state.recording && state.solutions.length > 1
)

function entryClass(i) {
  if (state.mode !== 'play' || !state.checked) return ''
  if (state.firstWrong === -1 || i < state.firstWrong) return 'ok'
  if (i === state.firstWrong) return 'bad'
  return 'after'
}
</script>

<template>
  <details class="move-log" :open="state.mode !== 'play'">
    <summary class="panel-summary">{{ title }}</summary>
    <div v-if="showPicker" class="line-picker">
      <button
        v-for="(line, i) in state.solutions"
        :key="i"
        class="btn small"
        :class="{ active: i === lineIdx }"
        :aria-pressed="i === lineIdx"
        :title="`Solution ${i + 1} — ${plural(line.length, 'move')}`"
        @click="lineIdx = i"
      >
        {{ i + 1 }}
      </button>
    </div>
    <ol v-if="entries.length">
      <li v-for="(m, i) in entries" :key="i" :class="entryClass(i)">
        <template v-if="m.type === 'attack'">
          <strong>{{ cardName(m.cardId) }}</strong>
          ⚔ attacks <strong>{{ cardName(m.targetId) }}</strong>
        </template>
        <template v-else-if="m.type === 'strike'">
          <strong>{{ cardName(m.cardId) }}</strong>
          💥 strikes <strong>{{ cardName(m.targetId) }}</strong>
        </template>
        <template v-else-if="m.type === 'pickup'">
          <strong>{{ cardName(m.cardId) }}</strong>
          ✋ picks up <strong>{{ cardName(m.targetId) }}</strong>
        </template>
        <template v-else-if="m.type === 'drop'">
          <strong>{{ cardName(m.carrierId) }}</strong>
          ▽ drops <strong>{{ cardName(m.cardId) }}</strong>
          {{ zoneLabel(m.to) }}
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
          ? 'Click a card, then click the zone it should go to — or drag it there.'
          : 'No solution recorded yet.'
      }}
    </p>
  </details>
</template>
