<script setup>
import { computed, ref, watch } from 'vue'
import { state, zoneLabel, cardName } from '../store.js'

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// The label an ability entry shows: the ability's own name if it can still be
// found on the card, else a neutral fallback (the card may have been edited).
function abilityName(m) {
  const a = state.cards[m.cardId]?.abilities?.find((x) => x.id === m.abilityId)
  return a?.name || 'ability'
}

// A modal ability's chosen modes, by name ("Bolt + Growth"), or ''.
function modeNames(m) {
  if (!m.modes?.length) return ''
  const a = state.cards[m.cardId]?.abilities?.find((x) => x.id === m.abilityId)
  return m.modes.map((i) => a?.modes?.[i]?.name || `mode ${i + 1}`).join(' + ')
}

// Every target of an entry (a multi-target ability logs several).
const targetNames = (m) =>
  (m.targetIds?.length ? m.targetIds : [m.targetId]).map(cardName).join(', ')

// Triggered events set off by this entry, matched on the seq stamped when it
// was logged. Empty while browsing a recorded solution (events aren't stored).
function eventsFor(m) {
  return m.seq == null ? [] : state.events.filter((e) => e.seq === m.seq)
}

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
          <template v-if="m.defenderId">
            — defended by <strong>{{ cardName(m.defenderId) }}</strong>
          </template>
        </template>
        <template v-else-if="m.type === 'strike'">
          <strong>{{ cardName(m.cardId) }}</strong>
          💥 strikes <strong>{{ cardName(m.targetId) }}</strong>
        </template>
        <template v-else-if="m.type === 'shoot'">
          <strong>{{ cardName(m.cardId) }}</strong>
          ➶ shoots <strong>{{ cardName(m.targetId) }}</strong>
        </template>
        <template v-else-if="m.type === 'intercept'">
          <strong>{{ cardName(m.cardId) }}</strong>
          ⚔ intercepts <strong>{{ cardName(m.targetId) }}</strong>
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
        <template v-else-if="m.type === 'ability'">
          <strong>{{ cardName(m.cardId) }}</strong>
          ✧ activates <strong>{{ abilityName(m) }}</strong>
          <template v-if="m.modes?.length">({{ modeNames(m) }})</template>
          <template v-if="m.targetId">
            → <strong>{{ targetNames(m) }}</strong>
          </template>
        </template>
        <template v-else-if="m.type === 'cast'">
          ✦ casts <strong>{{ cardName(m.cardId) }}</strong>
          <template v-if="m.modes?.length">({{ modeNames(m) }})</template>
          <template v-if="m.targetId">
            → <strong>{{ targetNames(m) }}</strong>
          </template>
        </template>

        <template v-else-if="m.type === 'damage'">
          <strong>{{ cardName(m.cardId) }}</strong>
          {{ m.amount >= 0 ? '✷ takes' : '♥ heals' }}
          {{ Math.abs(m.amount) }} damage
        </template>
        <template v-else-if="m.type === 'charge'">
          <strong>{{ cardName(m.cardId) }}</strong>
          ⚡ taps for mana (Charge)
        </template>
        <template v-else>
          <strong>{{ cardName(m.cardId) }}</strong>
          {{ zoneLabel(m.from) }} → {{ zoneLabel(m.to) }}
        </template>
        <ul v-if="eventsFor(m).length" class="entry-events">
          <li v-for="ev in eventsFor(m)" :key="ev.id" :class="{ ignored: ev.status === 'ignored' }">
            ✧ <strong>{{ cardName(ev.cardId) }}</strong> — {{ ev.name }}
            <em v-if="ev.status === 'ignored'"> (ignored — {{ ev.reason || 'source left the realm' }})</em>
          </li>
        </ul>
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

<style scoped>
.entry-events {
  margin: 0.15rem 0 0;
  padding-left: 1.1rem;
  list-style: none;
}
.entry-events li {
  font-size: 0.82rem;
  opacity: 0.85;
}
.entry-events li.ignored {
  opacity: 0.5;
  text-decoration: line-through;
}
.entry-events li.ignored em {
  text-decoration: none;
  font-style: italic;
}
</style>
