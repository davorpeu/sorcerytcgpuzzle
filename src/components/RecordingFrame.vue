<script setup>
// Board overlay that makes recording visible where the moves happen:
// viewfinder corners plus a caption, so the state reads by shape and words,
// not colour alone. Idle in the editor it shows a quiet "Start position".
// Sits inside main.area-board (position: relative), never takes clicks.
import { computed } from 'vue'
import { state } from '../store.js'

const lineNo = computed(() => state.solutions.length + 1)
</script>

<template>
  <div v-if="state.recording" class="rec-frame">
    <span class="vf tl" aria-hidden="true"></span>
    <span class="vf tr" aria-hidden="true"></span>
    <span class="vf bl" aria-hidden="true"></span>
    <span class="vf br" aria-hidden="true"></span>
    <span class="cap rec"
      ><span class="dot" aria-hidden="true"></span>Recording solution {{ lineNo }} — every move is
      added</span
    >
  </div>
  <div v-else-if="state.mode === 'editor'" class="rec-frame">
    <span class="cap idle">Start position</span>
  </div>
</template>

<style scoped>
.rec-frame {
  position: absolute;
  inset: 0;
  z-index: 8;
  pointer-events: none;
}
.vf {
  position: absolute;
  width: 30px;
  height: 30px;
  border: 0 solid var(--c-danger);
}
.vf.tl {
  left: 0;
  top: 0;
  border-left-width: 3px;
  border-top-width: 3px;
  border-top-left-radius: 6px;
}
.vf.tr {
  right: 0;
  top: 0;
  border-right-width: 3px;
  border-top-width: 3px;
  border-top-right-radius: 6px;
}
.vf.bl {
  left: 0;
  bottom: 0;
  border-left-width: 3px;
  border-bottom-width: 3px;
  border-bottom-left-radius: 6px;
}
.vf.br {
  right: 0;
  bottom: 0;
  border-right-width: 3px;
  border-bottom-width: 3px;
  border-bottom-right-radius: 6px;
}
.cap {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 3px var(--sp-3);
  border-radius: var(--r-pill);
  background: var(--c-felt);
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  white-space: nowrap;
}
.cap.rec {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1.5px solid var(--c-danger);
  font-weight: 700;
  color: var(--c-cream-hi);
}
.cap.idle {
  border: 1px solid var(--c-line-strong);
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

/* The ability dialog opens with its top edge just under this caption, which
   then peeked out above it; the idle caption steps aside while it is open. */
:global(.app:has(.ability-dialog)) .cap.idle {
  visibility: hidden;
}
</style>
