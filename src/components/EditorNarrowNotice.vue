<script setup>
import { nextTick, ref } from 'vue'
import { state, enterPlay } from '../store.js'
import ShareDialog from './ShareDialog.vue'

// Under 1024 px the editor isn't usable (dragging between pool, board and
// hand, long forms), so the coordinator mounts this instead of the editor
// table. The puzzle stays loaded: Play test and Share still work.
const shareOpen = ref(false)
const shareBtn = ref(null)

function closeShare() {
  shareOpen.value = false
  nextTick(() => shareBtn.value?.focus())
}
</script>

<template>
  <section class="narrow-notice" aria-labelledby="narrow-title">
    <h1 id="narrow-title" class="title">{{ state.puzzleName || 'Untitled puzzle' }}</h1>
    <div class="empty-box">
      <b>The editor needs a wider screen</b>
      <span>
        Building a puzzle means dragging cards between the pool, the board and the hand. Open
        this page on a screen at least 1024 pixels wide — a tablet held sideways works.
      </span>
    </div>
    <p class="help">
      Nothing is lost: the puzzle stays loaded. You can still check how it plays here, and Share
      still exports and copies links.
    </p>
    <button type="button" class="btn primary lg" @click="enterPlay">Play test this puzzle</button>
    <button ref="shareBtn" type="button" class="btn lg" @click="shareOpen = true">Share</button>
    <ShareDialog :open="shareOpen" @close="closeShare" />
  </section>
</template>

<style scoped>
.narrow-notice {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-width: 480px;
  margin: 0 auto;
  padding: var(--sp-6);
  font-family: var(--font-ui);
  color: var(--c-text);
}

.title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--fs-xl);
  color: var(--c-cream-hi);
  overflow-wrap: anywhere;
}

.empty-box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 16px;
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--r-md);
  font-size: var(--fs-md);
  line-height: 1.45;
  color: var(--c-muted);
}
.empty-box b {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--fs-lg);
  color: var(--c-cream-hi);
}

.help {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--c-muted);
}

.btn.lg {
  width: 100%;
  min-height: 44px;
  font-size: var(--fs-md);
}
</style>
