<script setup>
import { computed } from 'vue'
import { state, zoneLabel, cardName } from '../store.js'
import MoveEntry from './MoveEntry.vue'
import { plural } from '../format.js'


// The ability an entry used: on the card itself, else on any card -- a gained
// ability (an assumed form) lives on the granted card, which may since have
// been released. Null if it's gone (the card may have been edited).
function abilityOf(m) {
  const find = (c) => c?.abilities?.find((x) => x.id === m.abilityId)
  return find(state.cards[m.cardId]) || Object.values(state.cards).map(find).find(Boolean) || null
}

// The label an ability entry shows: the ability's own name, else a neutral
// fallback.
function abilityName(m) {
  return abilityOf(m)?.name || 'ability'
}

// A modal ability's chosen modes, by name ("Bolt + Growth"), or ''.
function modeNames(m) {
  if (!m.modes?.length) return ''
  const a = abilityOf(m)
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

// Plan decision d: play mode keeps card names. Set this to true to draw the
// play log with MoveEntry (art thumbnails, names only in aria-label) instead.
const PLAY_THUMBNAILS = false

// In the editor the Solutions panel lists the lines; this log is only kept
// working if it's mounted there: the line being recorded, else the last line.
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
  return `Solution ${n} of ${n} (${plural(entries.value.length, 'move')})`
})

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
    <ol v-if="entries.length">
      <template v-for="(m, i) in entries" :key="i">
      <MoveEntry v-if="PLAY_THUMBNAILS" :entry="m" :index="i" :numbered="false" :class="entryClass(i)" />
      <li v-else :class="entryClass(i)">
        <template v-if="m.type === 'attack'">
          <strong>{{ cardName(m.cardId) }}</strong>
          <span aria-hidden="true">⚔</span> attacks <strong>{{ cardName(m.targetId) }}</strong>
          <template v-if="m.defenderId">
            — defended by <strong>{{ cardName(m.defenderId) }}</strong>
          </template>
        </template>
        <template v-else-if="m.type === 'strike'">
          <strong>{{ cardName(m.cardId) }}</strong>
          <span aria-hidden="true">💥</span> strikes <strong>{{ cardName(m.targetId) }}</strong>
        </template>
        <template v-else-if="m.type === 'shoot'">
          <strong>{{ cardName(m.cardId) }}</strong>
          <span aria-hidden="true">➶</span> shoots <strong>{{ cardName(m.targetId) }}</strong>
        </template>
        <template v-else-if="m.type === 'intercept'">
          <strong>{{ cardName(m.cardId) }}</strong>
          <span aria-hidden="true">⚔</span> intercepts <strong>{{ cardName(m.targetId) }}</strong>
        </template>
        <template v-else-if="m.type === 'pickup'">
          <strong>{{ cardName(m.cardId) }}</strong>
          <span aria-hidden="true">✋</span> picks up <strong>{{ cardName(m.targetId) }}</strong>
        </template>
        <template v-else-if="m.type === 'drop'">
          <strong>{{ cardName(m.carrierId) }}</strong>
          <span aria-hidden="true">▽</span> drops <strong>{{ cardName(m.cardId) }}</strong>
          {{ zoneLabel(m.to) }}
        </template>
        <template v-else-if="m.type === 'ability'">
          <strong>{{ cardName(m.cardId) }}</strong>
          ✧ activates <strong>{{ abilityName(m) }}</strong>
          <template v-if="m.modes?.length">({{ modeNames(m) }})</template>
          <template v-if="m.targetId">
            <span aria-hidden="true">→</span><span class="sr-only">at</span> <strong>{{ targetNames(m) }}</strong>
          </template>
        </template>
        <template v-else-if="m.type === 'cast'">
          <span aria-hidden="true">✦</span> casts <strong>{{ cardName(m.cardId) }}</strong>
          <template v-if="m.modes?.length">({{ modeNames(m) }})</template>
          <template v-if="m.targetId">
            <span aria-hidden="true">→</span><span class="sr-only">at</span> <strong>{{ targetNames(m) }}</strong>
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
          {{ zoneLabel(m.from) }} <span aria-hidden="true">→</span><span class="sr-only">to</span> {{ zoneLabel(m.to) }}
        </template>
        <ul v-if="eventsFor(m).length" class="entry-events">
          <li v-for="ev in eventsFor(m)" :key="ev.id" :class="{ ignored: ev.status === 'ignored' }">
            ✧ <strong>{{ cardName(ev.cardId) }}</strong> — {{ ev.name }}
            <em v-if="ev.status === 'ignored'"> (ignored — {{ ev.reason || 'source left the realm' }})</em>
          </li>
        </ul>
      </li>
      </template>
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
