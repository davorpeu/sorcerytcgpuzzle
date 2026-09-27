<script setup>
// Header right side in the editor: save state + Save / Share / Puzzles / New.
// While recording, the save group becomes the recording block (line number,
// move count, Undo move, Stop recording) and Save/New step aside. The mode
// switch stays in TopBar.
import { computed, ref } from 'vue'
import {
  state,
  remote,
  hasUnsavedWork,
  savePuzzle,
  newPuzzle,
  undo,
  stopRecording,
} from '../store.js'
import { flash } from '../editorToast.js'
import ShareDialog from './ShareDialog.vue'
import PuzzlesDialog from './PuzzlesDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { plural } from '../format.js'


const saving = ref(false)
const lastSaved = ref('') // "HH:MM" of this session's last successful save
// store.js keeps the saved fingerprint in a plain variable, so a re-save that
// changes no reactive state wouldn't re-run the computed below. Bumping this
// after each save makes it re-read hasUnsavedWork().
const savedTick = ref(0)

const empty = computed(() => !Object.keys(state.cards).length)
const dirty = computed(() => (savedTick.value, hasUnsavedWork()))

const saveState = computed(() => {
  if (saving.value)
    return { glyph: '', word: 'Saving…', sub: remote() ? 'To the site' : 'In this browser' }
  if (empty.value) return { glyph: 'full', word: 'All changes saved', sub: 'Nothing to save yet' }
  if (dirty.value)
    return {
      glyph: 'ring',
      word: 'Unsaved changes',
      sub: lastSaved.value ? `Last saved ${lastSaved.value}` : 'Not saved yet',
    }
  return {
    glyph: 'full',
    word: 'All changes saved',
    sub: lastSaved.value ? `Last saved ${lastSaved.value}` : '',
  }
})

const hhmm = (d) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

async function onSave() {
  if (saving.value) return
  saving.value = true
  try {
    await savePuzzle()
    lastSaved.value = hhmm(new Date())
    flash(`Saved "${state.puzzleName || 'Untitled puzzle'}"`, 'ok')
  } catch (e) {
    flash(`Save failed: ${e.message}`, 'error')
  } finally {
    saving.value = false
    savedTick.value++
  }
}

const shareOpen = ref(false)
const puzzlesOpen = ref(false)
const confirmNew = ref(false)

function onNew() {
  if (hasUnsavedWork()) {
    confirmNew.value = true
    return
  }
  startBlank()
}

function startBlank() {
  confirmNew.value = false
  newPuzzle()
  lastSaved.value = ''
  savedTick.value++
  flash('New blank puzzle.', 'ok')
}

// Recording block
const lineNo = computed(() => state.solutions.length + 1)

function onStop() {
  const none = !state.draft.length
  stopRecording()
  if (none) flash('Recording stopped. No moves were made, so no line was added.', 'warn')
}
</script>

<template>
  <div class="header-actions">
    <div v-if="state.recording" class="recpill" role="status">
      <span class="dot" aria-hidden="true"></span>
      <span class="t">
        <b>Recording solution {{ lineNo }}</b>
        <span>{{ plural(state.draft.length, 'move') }} so far</span>
      </span>
      <button type="button" class="btn" :disabled="!state.draft.length" @click="undo">
        Undo move
      </button>
      <button type="button" class="btn primary" @click="onStop">
        <span class="sq-stop" aria-hidden="true"></span>Stop recording
      </button>
    </div>

    <template v-else>
      <div class="savest" role="status">
        <b
          ><span v-if="saveState.glyph" :class="saveState.glyph" aria-hidden="true"></span
          >{{ saveState.word }}</b
        >
        <span v-if="saveState.sub" class="sub">{{ saveState.sub }}</span>
      </div>
      <button
        type="button"
        class="btn lg primary"
        :disabled="saving || empty"
        :aria-busy="saving ? 'true' : 'false'"
        @click="onSave"
      >
        Save
      </button>
    </template>

    <button type="button" class="btn lg" aria-haspopup="dialog" @click="shareOpen = true">
      Share
    </button>
    <button type="button" class="btn lg" aria-haspopup="dialog" @click="puzzlesOpen = true">
      Puzzles
    </button>
    <button v-if="!state.recording" type="button" class="btn lg ghost" @click="onNew">New</button>

    <ShareDialog :open="shareOpen" @close="shareOpen = false" />
    <PuzzlesDialog :open="puzzlesOpen" @close="puzzlesOpen = false" />
    <ConfirmDialog
      :open="confirmNew"
      title="Start a blank puzzle?"
      message="The cards, board and solutions here have not been saved."
      confirm-label="Start blank"
      keep-label="Keep editing"
      @confirm="startBlank"
      @cancel="confirmNew = false"
    />
  </div>
</template>

<style scoped>
.header-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--sp-2);
}
/* Two-line buttons ("Undo / move") made the recording block taller than the
   52px header; the title field gives up the width instead. */
.header-actions .btn {
  white-space: nowrap;
}
.btn.lg {
  height: 44px;
  padding: 0 var(--sp-4);
  font-size: var(--fs-md);
}
.btn.ghost {
  background: transparent;
}
.btn.primary:disabled {
  background: var(--c-raised);
  border-color: var(--c-line-strong);
  color: var(--c-muted);
}

/* save state: words plus a glyph (hollow ring = unsaved, filled dot = saved) */
.savest {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin-right: 6px;
  font-size: var(--fs-sm);
  line-height: 1.25;
  white-space: nowrap;
}
.savest b {
  font-size: 14px;
  color: var(--c-cream-hi);
}
.savest .sub {
  color: var(--c-muted);
}
.ring,
.full {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 5px;
  border-radius: 50%;
}
.ring {
  border: 1.5px solid var(--c-warn);
}
.full {
  background: var(--c-ok);
}

/* recording block */
.recpill {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-right: var(--sp-2);
  padding: 6px var(--sp-2) 6px 14px;
  border: 1.5px solid var(--c-danger);
  border-radius: var(--r-md);
  background: var(--c-danger-bg);
}
.recpill .t {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  white-space: nowrap;
}
.recpill .t b {
  font-size: var(--fs-md);
  color: var(--c-cream-hi);
}
.recpill .t span {
  font-size: var(--fs-sm);
  color: var(--c-muted-hi);
}
.dot {
  width: 10px;
  height: 10px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--c-danger);
  animation: rec-pulse 1.6s ease-in-out infinite;
}
@keyframes rec-pulse {
  50% {
    opacity: 0.35;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dot {
    animation: none;
  }
}
.sq-stop {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  border-radius: 1px;
  background: var(--c-ink);
}
</style>
