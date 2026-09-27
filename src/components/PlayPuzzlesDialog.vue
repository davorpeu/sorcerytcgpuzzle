<script setup>
// Play mode's puzzle picker: today's puzzle, or any date in the archive. Opened
// from the header's Puzzles button, so the left column stays free for the
// selected card. (The editor has its own Puzzles dialog, for saved drafts.)
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { loadById, loadDaily } from '../store.js'
import ArchiveCalendar from './ArchiveCalendar.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const dlg = ref(null)
const firstBtn = ref(null)
const message = ref('')
let opener = null

async function show() {
  opener = document.activeElement
  message.value = ''
  await nextTick()
  if (!dlg.value || dlg.value.open) return
  dlg.value.showModal()
  firstBtn.value?.focus()
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

async function onLoadDaily() {
  if (await loadDaily()) emit('close')
  else message.value = 'No puzzle has been released yet.'
}
async function onArchiveSelect(id) {
  if (await loadById(id)) emit('close')
  else message.value = 'That puzzle is not available.'
}

// Esc: close through the parent, and keep the table's Esc handler out of it.
function onCancel(e) {
  e.preventDefault()
  emit('close')
}
function onKey(e) {
  if (e.key === 'Escape') e.stopPropagation()
}
</script>

<template>
  <dialog ref="dlg" class="pz-dlg" aria-labelledby="pz-title" @cancel="onCancel" @keydown="onKey">
    <div class="dh">
      <h2 id="pz-title">Puzzles</h2>
      <button type="button" class="btn" @click="emit('close')">Close</button>
    </div>
    <div class="db">
      <button ref="firstBtn" type="button" class="btn primary" @click="onLoadDaily">
        Play current puzzle
      </button>
      <p class="help">Or pick a date from the archive:</p>
      <ArchiveCalendar @select="onArchiveSelect" />
      <p class="msg" role="status">{{ message }}</p>
    </div>
  </dialog>
</template>

<style scoped>
.pz-dlg {
  width: min(460px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  padding: 0;
  color: var(--c-text);
  font-family: var(--font-ui);
  background: var(--c-panel);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
}
.pz-dlg::backdrop {
  background: var(--c-scrim);
}
.pz-dlg[open] {
  display: flex;
  flex-direction: column;
}
.dh {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-4) 18px;
  border-bottom: 1px solid var(--c-line);
}
.dh h2 {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--fs-lg);
  color: var(--c-cream-hi);
}
.db {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-4) 18px;
  overflow-y: auto;
}
.db > :deep(*:not(.btn)) {
  align-self: stretch;
}
.help,
.msg {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--c-muted);
}
.msg:empty {
  display: none;
}
.msg {
  color: var(--c-warn);
}
</style>
