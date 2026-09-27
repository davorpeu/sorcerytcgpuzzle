<script setup>
// Title and brief as inline header fields in the editor. The dashed
// underline is the "you can type here" cue; the brief's help shows while it
// has focus (the header has no room for a standing hint line).
import { state } from '../store.js'
</script>

<template>
  <div class="puzzle-title">
    <label class="sr-only" for="editor-puzzle-title">Puzzle title</label>
    <input
      id="editor-puzzle-title"
      v-model="state.puzzleName"
      class="title-in"
      type="text"
      placeholder="Untitled puzzle"
      autocomplete="off"
    />
    <div class="brief-wrap">
      <label class="sr-only" for="editor-puzzle-brief">Brief, shown to players before they start</label>
      <input
        id="editor-puzzle-brief"
        v-model="state.puzzleDesc"
        class="brief-in"
        type="text"
        placeholder="Add the goal players see, e.g. put the opponent at Death's Door this turn"
        autocomplete="off"
        aria-describedby="editor-puzzle-brief-hint"
      />
      <p id="editor-puzzle-brief-hint" class="hint">
        Shown to players before they start. Say what the goal is, e.g.
        &ldquo;Lethal: put the opponent at Death&rsquo;s Door this turn&rdquo;.
      </p>
    </div>
  </div>
</template>

<style scoped>
.puzzle-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 560px;
  max-width: 100%;
  min-width: 0;
}
.title-in,
.brief-in {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
}
.title-in {
  padding-bottom: 1px;
  font-family: var(--font-display);
  font-size: var(--fs-xl);
  line-height: 1.1;
  color: var(--c-cream-hi);
  border-bottom: 1px dashed var(--c-line-strong);
}
.title-in:hover {
  border-bottom-color: var(--c-muted-2);
}
.brief-in {
  font-family: var(--font-ui);
  font-size: var(--fs-md);
  color: var(--c-muted);
  border-bottom: 1px dashed transparent;
}
.brief-in:hover,
.brief-in:focus {
  border-bottom-color: var(--c-line-strong);
}
.title-in::placeholder,
.brief-in::placeholder {
  color: var(--c-muted-lo);
  opacity: 1;
}
.brief-wrap {
  position: relative;
}
/* Help for the brief: only while it's being edited, as a popover under it. */
.hint {
  display: none;
  position: absolute;
  top: calc(100% + var(--sp-2));
  left: 0;
  z-index: 30;
  max-width: 420px;
  margin: 0;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-md);
  background: var(--c-panel);
  box-shadow: var(--shadow-pop);
  font-size: var(--fs-sm);
  line-height: 1.35;
  color: var(--c-muted-hi);
}
.brief-in:focus + .hint {
  display: block;
}
</style>
