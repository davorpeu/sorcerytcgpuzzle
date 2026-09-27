<script setup>
import { toast } from '../editorToast.js'
</script>

<template>
  <!-- Editor messages (save, import, share...). Shown in the header, and in the
       narrow-screen notice, which replaces the header. Tone is carried by a
       glyph and the border style as well as colour. -->
  <div
    v-if="toast.msg"
    :key="toast.seq"
    class="toast"
    :class="toast.tone"
    :role="toast.tone === 'error' ? 'alert' : 'status'"
  >
    {{ toast.msg }}
  </div>
</template>

<style scoped>
.toast {
  padding: 8px 14px;
  border-radius: var(--r-md);
  background: var(--c-raised-2);
  border: 1px solid var(--c-gold);
  font-size: var(--fs-md);
  color: var(--c-cream-hi);
}
.toast.ok::before {
  content: "✓ ";
  color: var(--c-gold);
  font-weight: 700;
}
.toast.warn {
  border-color: var(--c-warn);
}
.toast.warn::before {
  content: "! ";
  color: var(--c-warn);
  font-weight: 700;
}
.toast.error {
  border: 1px dashed var(--c-danger);
}
.toast.error::before {
  content: "✕ ";
  color: var(--c-danger-soft);
  font-weight: 700;
}
</style>
