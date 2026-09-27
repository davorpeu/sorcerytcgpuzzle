<script setup>
import { computed, ref } from 'vue'
import {
  state,
  config,
  undo,
  enterPlay,
  enterEditor,
  resetPlay,
  solveStatus,
  playLocked,
  MAX_MISTAKES,
  shortestLine,
} from '../store.js'
import EditorToast from './EditorToast.vue'
import LegendDialog from './LegendDialog.vue'
import PlayPuzzlesDialog from './PlayPuzzlesDialog.vue'
import EditorPuzzleTitle from './EditorPuzzleTitle.vue'
import EditorHeaderActions from './EditorHeaderActions.vue'
import { plural } from '../format.js'

// The flash message lives in App (the editor sidebar raises them too); the
// header is just where it is shown.
defineProps({
  notice: { type: String, default: '' },
})

// Shortest recorded solution line; what the play header advertises.
const targetMoves = shortestLine

const helpOpen = ref(false)
const puzzlesOpen = ref(false)


// "Move N of M" while the attempt is still within the shortest line; past it
// (or before the first move, or with no recorded line) a plain count reads
// better than "Move 0 of 4" or "Move 6 of 4".
const progressText = computed(() => {
  const n = state.moves.length
  if (targetMoves.value && n >= 1 && n <= targetMoves.value)
    return `Move ${n} of ${targetMoves.value}`
  return `${plural(n, 'move')} made`
})

// The day's mistake allowance as pips: filled for each one spent, hollow for
// each left. The count is also spelled out in words beside them, since a row
// of shapes (or their colour) is not enough on its own.
const mistakePips = computed(() =>
  Array.from({ length: MAX_MISTAKES }, (_, i) => i < state.mistakes)
)

const mistakesLeftText = computed(() => {
  const left = MAX_MISTAKES - state.mistakes
  return left <= 0
    ? 'No mistakes left today'
    : `${plural(left, 'mistake')} left today`
})

// The solve is detected automatically as the player moves -- there is no submit
// button. A wrong move is snapped back and counted; after MAX_MISTAKES a limited
// player fails for the day. `state.solved`/`failed` are the persisted daily lock
// (non-editors); `solveStatus` is the live read that also drives an editor's
// preview, where nothing is sealed.
const solvedMsg = () =>
  (state.solveQuality || solveStatus.value) === 'optimal' && state.mistakes === 0
    ? '✔ Solved! This is the optimal solution.'
    : '✔ Solved — but not the optimal path.'

const result = computed(() => {
  if (state.mode !== 'play') return null
  if (state.failed)
    return {
      ok: false,
      msg: `✘ Out of moves — ${MAX_MISTAKES} mistakes. Come back tomorrow.`,
    }
  if (state.solved) return { ok: true, msg: solvedMsg() }
  // Editor preview (and the instant before the daily lock is written): read the
  // live verdict directly.
  if (solveStatus.value) return { ok: true, msg: solvedMsg() }
  return null
})
</script>

<template>
  <header class="topbar">
    <!-- What the puzzle asks, top left, where the eye starts. -->
    <EditorPuzzleTitle v-if="state.mode === 'editor'" class="topbar-title" />
    <div v-else class="topbar-title">
      <h1>
        {{
          state.mode === 'play' && state.puzzleName
            ? state.puzzleName
            : 'Sorcery TCG Puzzle'
        }}
      </h1>
      <p
        v-if="state.mode === 'play' && state.puzzleDesc"
        class="topbar-brief"
        :title="state.puzzleDesc"
      >
        {{ state.puzzleDesc }}
      </p>
      <p
        v-else-if="state.mode === 'play' && state.puzzleName && !state.solutions.length"
        class="topbar-brief warn"
        title="This puzzle has no recorded solution, so a solve cannot be detected."
      >
        <span aria-hidden="true">⚠ </span>This puzzle has no recorded solution, so a
        solve cannot be detected.
      </p>
      <p v-if="config.canEdit" class="topbar-brief playtest">
        Play test: wrong moves snap back and are counted, but there is no limit and
        no lock.
      </p>
    </div>

    <!-- Both of these appear without the user moving focus, so they have to
         be announced rather than merely drawn. The wrappers stay in the DOM
         when empty: a live region inserted at the same moment as its text is
         not reliably read. -->
    <div class="topbar-status">
      <div aria-live="polite">
        <div v-if="result" class="result-banner" :class="result.ok ? 'ok' : 'bad'">
          {{ result.msg }}
        </div>
      </div>
      <output class="notice" aria-live="polite">{{ notice }}</output>
      <EditorToast v-if="state.mode === 'editor'" />
    </div>

    <!-- Where the attempt stands: moves made so far against the shortest
         recorded line. Without a recorded solution there is no target, so
         only the count shows. -->
    <div v-if="state.puzzleName && state.mode === 'play'" class="progress">
      <span class="progress-count">{{ progressText }}</span>
      <span v-if="state.solutions.length" class="target">
        Shortest solve is {{ plural(targetMoves, 'move') }}<template
          v-if="state.solutions.length > 1"
        >
          · {{ state.solutions.length }} possible solutions</template>
      </span>
    </div>

    <div
      v-if="state.mode === 'play' && !config.canEdit && state.solutions.length"
      class="mistakes"
      :class="{ danger: state.mistakes >= MAX_MISTAKES }"
    >
      <span class="pips" aria-hidden="true">
        <span
          v-for="(used, i) in mistakePips"
          :key="i"
          class="pip"
          :class="{ used }"
        />
      </span>
      <span class="sr-only">
        {{ state.mistakes }} of {{ MAX_MISTAKES }} mistakes used.
      </span>
      <span class="pips-left">{{ mistakesLeftText }}</span>
    </div>

    <!-- Undo and Reset are what you reach for on every move, so they sit next
         to Play rather than in a sidebar panel. The solve is detected
         automatically, so there is no Submit button; a wrong move is snapped
         back and counted instead. -->
    <div v-if="state.mode === 'play'" class="topbar-actions">
      <button
        type="button"
        class="btn tb-btn"
        :disabled="!state.moves.length || playLocked"
        @click="undo"
      >
        Undo
      </button>
      <button type="button" class="btn tb-btn ghost" @click="resetPlay">
        Reset
      </button>
      <!-- The legend: reference, so it waits behind a button. -->
      <button type="button" class="btn tb-btn ghost" aria-haspopup="dialog" @click="helpOpen = true">
        Help
      </button>
      <LegendDialog :open="helpOpen" @close="helpOpen = false" />
      <!-- Today's puzzle and the archive: navigation, so it waits behind a
           button instead of taking the left column from the selected card. -->
      <button type="button" class="btn tb-btn ghost" aria-haspopup="dialog" @click="puzzlesOpen = true">
        Puzzles
      </button>
      <PlayPuzzlesDialog :open="puzzlesOpen" @close="puzzlesOpen = false" />
    </div>

    <template v-if="state.mode === 'editor'">
      <EditorHeaderActions />
      <span class="vr" aria-hidden="true"></span>
    </template>

    <div v-if="config.canEdit" class="mode-switch" role="group" aria-label="Mode">
      <button
        type="button"
        class="btn tb-btn"
        :class="{ active: state.mode === 'editor' }"
        :aria-pressed="state.mode === 'editor'"
        @click="enterEditor"
      >
        Edit
      </button>
      <button
        type="button"
        class="btn tb-btn"
        :class="{ active: state.mode === 'play' }"
        :aria-pressed="state.mode === 'play'"
        :disabled="state.mode === 'play' || state.recording"
        :title="state.recording ? 'Stop recording before play-testing' : undefined"
        @click="enterPlay"
      >
        Play test
      </button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: var(--sp-6);
  min-height: 52px;
  font-family: var(--font-ui);
  color: var(--c-text);
}

/* The table's height budget (--layout-chrome-h in style.css) counts the
   header as exactly 52px; the editor's title/brief inputs came to 52.7 and
   gave the page a 1px scrollbar. Desktop only: narrower layouts wrap. */
@media (min-width: 1025px) {
  .topbar {
    height: 52px;
  }
}

/* Title and brief take what the right-hand cluster leaves; the brief is one
   line and ellipsizes (full text in its title attribute). */
.topbar-title {
  flex: 0 1 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

h1 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--fs-xl);
  line-height: 1.1;
  color: var(--c-cream-hi);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar-brief {
  margin: 0;
  font-size: var(--fs-md);
  color: var(--c-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* A quiet warning: smaller, lighter gold, with a glyph so it is not colour
   alone. */
.topbar-brief.warn {
  font-size: var(--fs-sm);
  color: var(--c-warn);
}

/* Flash and verdict sit in the middle of the header, as in the mockup. */
.topbar-status {
  flex: 1 1 auto;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--sp-3);
  min-width: 0;
}

.result-banner,
.notice:not(:empty) {
  display: block;
  padding: 8px 14px;
  border-radius: var(--r-md);
  font-size: var(--fs-md);
  color: var(--c-cream-hi);
  background: var(--c-raised-2);
  border: 1px solid var(--c-gold);
}

/* Solved: gold. Failed / locked for the day: red, dashed, and the ✔ / ✘ plus
   the words carry the meaning too. */
.result-banner {
  font-weight: 700;
}

.result-banner.ok {
  background: var(--c-gold-bg);
  border-color: var(--c-gold);
  color: var(--c-gold);
}

.result-banner.bad {
  background: var(--c-danger-bg);
  border: 1px dashed var(--c-danger);
  color: var(--c-danger-soft);
}

@media (prefers-reduced-motion: no-preference) {
  .result-banner,
  .notice:not(:empty) {
    animation: tb-in 180ms ease-out;
  }
}

@keyframes tb-in {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
}

.progress,
.mistakes {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  white-space: nowrap;
  font-variant-numeric: lining-nums tabular-nums;
}

.progress {
  gap: 2px;
}

.progress-count {
  font-size: 16px;
  font-weight: 700;
  color: var(--c-text);
}

.target,
.pips-left {
  font-size: var(--fs-sm);
  color: var(--c-muted);
}

.mistakes {
  gap: 5px;
}

/* Diamonds: spent ones solid red, remaining ones gold outlines. Filled vs.
   hollow is the shape cue; the text below says the count. */
.pips {
  display: flex;
  gap: 7px;
  padding: 2px 2px 0;
}

.pip {
  box-sizing: border-box;
  width: 8px;
  height: 8px;
  margin: 1px;
  transform: rotate(45deg);
  border: 1.5px solid var(--c-gold);
}

.pip.used {
  width: 10px;
  height: 10px;
  margin: 0;
  border: none;
  background: var(--c-danger);
}

/* Out of mistakes: the words change and go red. */
.mistakes.danger .pips-left {
  color: var(--c-danger-soft);
  font-weight: 700;
}

.topbar-actions,
.mode-switch {
  display: flex;
  flex: none;
  gap: var(--sp-2);
}

/* Outlined cream buttons, as in the mockup: Undo on the raised felt, Reset
   transparent. */
.tb-btn {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-md);
  background: var(--c-raised);
  color: var(--c-text);
  font-size: var(--fs-md);
  white-space: nowrap;
}

.tb-btn.ghost {
  background: transparent;
}

.tb-btn:hover:not(:disabled) {
  border-color: var(--c-cream-lo);
}

.tb-btn.active {
  background: var(--c-gold);
  border-color: var(--c-gold);
  color: var(--c-ink);
}

.tb-btn.active:disabled {
  opacity: 1;
}

.topbar-brief.playtest {
  font-size: var(--fs-sm);
}

.vr {
  width: 1px;
  height: 32px;
  background: var(--c-line);
}

.tb-btn:focus-visible {
  outline: 3px solid var(--c-focus);
  outline-offset: 2px;
}

/* Phone (.mockup/phone.html): the title takes its own line; progress, Undo,
   Reset and the mode switch share the next one. */
@media (max-width: 700px) {
  .topbar {
    flex-wrap: wrap;
    gap: var(--sp-2) var(--sp-3);
  }

  .topbar-title {
    flex: 1 1 100%;
  }

  h1 {
    font-size: var(--fs-lg);
  }

  .progress {
    margin-right: auto;
  }

  .tb-btn {
    min-height: 40px;
    padding: 0 12px;
  }
}
</style>
