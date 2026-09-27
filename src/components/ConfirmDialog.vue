<script setup>
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

// A modal "are you sure?" for actions that can't be undone and aren't tied to
// one row (New over unsaved work). Row-level asks use ConfirmInline instead.
// Focus starts on the safe choice, Esc keeps, and focus goes back to whatever
// opened the dialog once it closes.
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Confirm' },
  keepLabel: { type: String, default: 'Keep' },
})
const emit = defineEmits(['confirm', 'cancel'])

const uid = useId()
const dlg = ref(null)
const keepBtn = ref(null)
let opener = null

async function show() {
  opener = document.activeElement
  await nextTick()
  if (!dlg.value || dlg.value.open) return
  dlg.value.showModal()
  keepBtn.value?.focus()
}

function hide() {
  if (dlg.value?.open) dlg.value.close()
  if (opener && document.contains(opener)) opener.focus()
  opener = null
}

watch(
  () => props.open,
  (v) => (v ? show() : hide()),
  { immediate: true }
)
onBeforeUnmount(hide)

// Esc fires the native cancel event; the parent decides whether it closes.
function onCancel(e) {
  e.preventDefault()
  emit('cancel')
}

// Esc belongs to the dialog; don't let the table's Esc handler also drop the
// selection behind it.
function onKey(e) {
  if (e.key === 'Escape') e.stopPropagation()
}
</script>

<template>
  <dialog
    ref="dlg"
    class="dlg confirm-dlg"
    role="alertdialog"
    :aria-labelledby="`${uid}-title`"
    :aria-describedby="`${uid}-msg`"
    @cancel="onCancel"
    @keydown="onKey"
  >
    <div class="dh">
      <h2 :id="`${uid}-title`">{{ title }}</h2>
    </div>
    <div class="db">
      <p :id="`${uid}-msg`" class="msg">{{ message }}</p>
    </div>
    <div class="df">
      <span class="sp"></span>
      <button ref="keepBtn" type="button" class="btn" @click="emit('cancel')">
        {{ keepLabel }}
      </button>
      <button type="button" class="btn confirm-btn" @click="emit('confirm')">
        {{ confirmLabel }}
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.dlg {
  width: min(420px, calc(100vw - 32px));
  padding: 0;
  margin: auto;
  color: var(--c-text);
  font-family: var(--font-ui);
  background: var(--c-panel);
  border: 1px solid var(--c-line-strong);
  border-radius: 12px;
  box-shadow: var(--shadow-pop);
}
.dlg::backdrop {
  background: rgba(0, 0, 0, 0.55);
}
.dlg[open] {
  display: flex;
  flex-direction: column;
}
.dh {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-4) 18px;
  border-bottom: 1px solid var(--c-line);
}
.dh h2 {
  margin: 0;
  flex-grow: 1;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 24px;
  color: var(--c-cream-hi);
}
.db {
  padding: var(--sp-4) 18px;
}
.msg {
  margin: 0;
  color: var(--c-muted-hi);
  line-height: 1.45;
}
.df {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3) 18px;
  border-top: 1px solid var(--c-line);
}
.sp {
  flex-grow: 1;
}
.confirm-btn {
  background: var(--c-danger-deep);
  border-color: var(--c-danger);
  color: var(--c-cream-hi);
  font-weight: 700;
}
.confirm-btn:hover:not(:disabled) {
  border-color: var(--c-danger-soft);
}
@media (prefers-reduced-motion: no-preference) {
  .dlg[open] {
    animation: dlg-in 0.14s ease-out;
  }
}
@keyframes dlg-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
</style>
