<script setup>
// The editor's right-column Solutions panel: every recorded line (numbered,
// "shortest" marked in words), each line's moves on demand, Record, and an
// inline confirm before a line is deleted. While recording it is the live list
// of the line being recorded.
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { state, startRecording, removeSolutionLine, shortestLine } from '../store.js'
import MoveEntry from './MoveEntry.vue'
import ConfirmInline from './ConfirmInline.vue'
import { plural } from '../format.js'


const root = ref(null)

// Which lines are open, by index.
const open = reactive(new Set())
// The line just recorded, labelled so until the lines change again.
const justRecorded = ref(-1)
// The line whose Delete is being confirmed, or -1.
const confirming = ref(-1)

// A line you have just finished recording is the one you want to read back,
// so it opens itself. Keyed on recording stopping (not on the line count), so
// loading another puzzle doesn't open anything or call a line "just recorded".
let countAtStart = 0
watch(
  () => state.recording,
  (rec) => {
    if (rec) {
      countAtStart = state.solutions.length
      justRecorded.value = -1
      confirming.value = -1
    } else if (state.solutions.length > countAtStart) {
      const i = state.solutions.length - 1
      open.add(i)
      justRecorded.value = i
    }
  }
)

// Another puzzle loaded (the array is replaced, not pushed to): the open
// lines and the "just recorded" label belong to the old one.
watch(
  () => state.solutions,
  () => {
    open.clear()
    justRecorded.value = -1
    confirming.value = -1
  }
)

const count = computed(() => state.solutions.length)

const shortestLen = shortestLine

const countWord = computed(() => {
  if (state.recording) return count.value ? `${count.value} saved, 1 recording` : 'Recording'
  return count.value ? plural(count.value, 'line') : 'None yet'
})

function toggle(i) {
  if (open.has(i)) open.delete(i)
  else open.add(i)
}

function focusIn(selector) {
  nextTick(() => root.value?.querySelector(selector)?.focus())
}

function askDelete(i) {
  confirming.value = i
}

function cancelDelete() {
  const i = confirming.value
  confirming.value = -1
  focusIn(`[data-del="${i}"]`)
}

function confirmDelete() {
  const i = confirming.value
  confirming.value = -1
  // Open lines after the deleted one move up a place.
  const kept = [...open].filter((j) => j !== i).map((j) => (j > i ? j - 1 : j))
  open.clear()
  kept.forEach((j) => open.add(j))
  if (justRecorded.value === i) justRecorded.value = -1
  else if (justRecorded.value > i) justRecorded.value--
  removeSolutionLine(i)
  focusIn('.rec')
}
</script>

<template>
  <section ref="root" class="panel solutions" aria-labelledby="solutions-h">
    <div class="sp-h">
      <h2 id="solutions-h">Solutions</h2>
      <span class="count">{{ countWord }}</span>
    </div>

    <ul v-if="count || state.recording" class="lines">
      <li v-for="(line, i) in state.solutions" :key="i" class="line" :class="{ open: open.has(i), confirming: confirming === i }">
        <ConfirmInline
          v-if="confirming === i"
          :message="`Delete solution ${i + 1}? This can't be undone.`"
          :confirm-label="`Delete solution ${i + 1}`"
          keep-label="Keep it"
          @confirm="confirmDelete"
          @cancel="cancelDelete"
        />
        <template v-else>
          <div class="hd">
            <span class="nm">
              <b>Solution {{ i + 1 }}</b>
              <span>
                {{ plural(line.length, 'move')
                }}<template v-if="line.length === shortestLen">, <span class="short">shortest</span></template
                ><template v-if="i === justRecorded">, just recorded</template>
              </span>
            </span>
            <button
              type="button"
              class="iconbtn"
              :aria-expanded="open.has(i)"
              :aria-controls="`solution-moves-${i}`"
              :aria-label="`${open.has(i) ? 'Hide' : 'Show'} the moves of solution ${i + 1}`"
              @click="toggle(i)"
            >
              <span aria-hidden="true">{{ open.has(i) ? '▴' : '▾' }}</span>
            </button>
            <button
              v-if="!state.recording"
              type="button"
              class="iconbtn del"
              :data-del="i"
              :aria-label="`Delete solution ${i + 1}`"
              @click="askDelete(i)"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <ol v-if="open.has(i)" :id="`solution-moves-${i}`" class="moves">
            <MoveEntry v-for="(m, j) in line" :key="j" :entry="m" :index="j" />
          </ol>
        </template>
      </li>

      <!-- The line being recorded: dashed red AND labelled "recording". -->
      <li v-if="state.recording" class="line open recording">
        <div class="hd">
          <span class="nm">
            <b>Solution {{ count + 1 }}, recording</b>
            <span>{{ plural(state.draft.length, 'move') }}</span>
          </span>
        </div>
        <ol class="moves" aria-live="polite">
          <MoveEntry
            v-for="(m, j) in state.draft"
            :key="j"
            :entry="m"
            :index="j"
            :class="{ now: j === state.draft.length - 1 }"
          />
          <li class="pending">
            {{
              state.draft.length
                ? 'Your next move is added here'
                : 'Move a card to add the first move. The board is back at the start position.'
            }}
          </li>
        </ol>
      </li>
    </ul>

    <template v-if="!state.recording">
      <p v-if="!count" class="warnline">
        No solution recorded yet — until you record one, players can move cards but the puzzle can
        never be detected as solved.
      </p>
      <button type="button" class="btn rec" @click="startRecording">
        <span class="dot" aria-hidden="true"></span>
        {{ count ? `Record solution ${count + 1}` : 'Record solution' }}
      </button>
      <p v-if="!count" class="help">
        Set up the start position first. Recording starts from what's on the table now.
      </p>
    </template>
  </section>
</template>

<style scoped>
.solutions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px var(--sp-4);
}
.sp-h {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2);
}
.sp-h h2 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--fs-lg);
  color: var(--c-cream-hi);
}
.count {
  font-size: var(--fs-sm);
  color: var(--c-muted);
}
.lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.line {
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  background: var(--c-felt);
}
.line.open {
  border-color: var(--c-line-strong);
}
/* Recording: red AND dashed AND the word "recording" in the line's name. */
.line.recording {
  border: 1px dashed var(--c-danger);
}
/* The confirm row draws its own dashed red box. */
.line.confirming {
  border: 0;
  background: none;
}
.hd {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 6px 6px 6px 10px;
}
.nm {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.nm b {
  font-size: var(--fs-md);
  color: var(--c-cream-hi);
}
.nm span {
  font-size: var(--fs-sm);
  color: var(--c-muted);
}
.nm .short {
  color: var(--c-gold);
  font-weight: 700;
}
.iconbtn {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 6px;
  border: 1px solid var(--c-line-strong);
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--c-muted-hi);
  font-size: 14px;
  cursor: pointer;
}
.iconbtn:hover {
  border-color: var(--c-gold);
}
.iconbtn.del {
  color: var(--c-danger-soft);
  border-color: var(--c-danger-deep);
}
.iconbtn.del:hover {
  border-color: var(--c-danger);
}
.moves {
  list-style: none;
  margin: 0;
  padding: 6px 10px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border-top: 1px solid var(--c-line);
}
.moves :deep(.now .num) {
  border-color: var(--c-danger);
  color: var(--c-danger-soft);
}
.pending {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  color: var(--c-muted-lo);
  font-style: italic;
}
.pending::before {
  content: '';
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border-radius: var(--r-pill);
  border: 1px dashed var(--c-line-strong);
}
.warnline {
  display: flex;
  gap: 6px;
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--c-warn);
}
.warnline::before {
  content: '!';
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  border: 1.5px solid var(--c-warn);
  border-radius: var(--r-pill);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
}
.btn.rec {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  width: 100%;
  background: transparent;
  border-color: var(--c-danger);
  color: var(--c-cream-hi);
  font-weight: 700;
}
.btn.rec:hover {
  background: var(--c-danger-bg);
  border-color: var(--c-danger);
}
.dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--c-danger);
}
.help {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--c-muted);
}
</style>
