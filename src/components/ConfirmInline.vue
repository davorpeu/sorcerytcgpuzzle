<script setup>
// Inline "are you sure" row for destructive actions (delete a line, a puzzle,
// an ability). Focus starts on the safe choice; Esc backs out.
import { onMounted, ref } from 'vue'

defineProps({
  message: { type: String, required: true },
  confirmLabel: { type: String, default: 'Delete' },
  keepLabel: { type: String, default: 'Keep' },
})
const emit = defineEmits(['confirm', 'cancel'])

const keepBtn = ref(null)
onMounted(() => keepBtn.value?.focus())

function onKey(e) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    emit('cancel')
  }
}
</script>

<template>
  <div class="confirm-inline" role="group" :aria-label="message" @keydown="onKey">
    <b class="msg">{{ message }}</b>
    <div class="actions">
      <button type="button" class="btn small do" @click="emit('confirm')">{{ confirmLabel }}</button>
      <button ref="keepBtn" type="button" class="btn small" @click="emit('cancel')">{{ keepLabel }}</button>
    </div>
  </div>
</template>

<style scoped>
.confirm-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2) var(--sp-3);
  padding: 10px var(--sp-3);
  background: var(--c-danger-bg);
  border: 1px dashed var(--c-danger);
  border-radius: var(--r-md);
}
.msg {
  flex: 1 1 12em;
  font-family: var(--font-ui);
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--c-cream-hi);
}
.actions {
  display: flex;
  gap: var(--sp-2);
}
.do {
  background: var(--c-danger-deep);
  border-color: var(--c-danger);
  color: var(--c-cream-hi);
}
.do:hover:not(:disabled) {
  border-color: var(--c-danger-soft);
}
</style>
