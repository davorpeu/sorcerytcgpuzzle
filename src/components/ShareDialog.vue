<script setup>
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { state, config, remote, shareLink, serializePortable, loadPuzzle, wouldLoseWork } from '../store.js'
import { flash } from '../editorToast.js'
import ConfirmDialog from './ConfirmDialog.vue'

// Copy link / export / import for the puzzle on the table. The link result is
// said inside the dialog (it can need the link itself shown); export and
// import report through the header toast.
const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

const uid = useId()
const dlg = ref(null)
const importInput = ref(null)
const linkField = ref(null)
let opener = null

// null | 'copied' | 'long-server' | 'long-local' | 'blocked'
const linkState = ref(null)
const linkUrl = ref('')

async function show() {
  opener = document.activeElement
  linkState.value = null
  linkUrl.value = ''
  await nextTick()
  if (dlg.value && !dlg.value.open) dlg.value.showModal()
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

function onCancel(e) {
  e.preventDefault()
  emit('close')
}

// Esc belongs to the dialog; don't let the table's Esc handler also drop the
// selection behind it.
function onKey(e) {
  if (e.key === 'Escape') e.stopPropagation()
}

async function onCopyLink() {
  const link = shareLink()
  linkUrl.value = link.url
  try {
    await navigator.clipboard.writeText(link.url)
    if (!link.oversized) linkState.value = 'copied'
    // On the server the puzzle gets a short ?puzzle= link once it's saved.
    else if (remote() && config.canEdit) linkState.value = 'long-server'
    else linkState.value = 'long-local'
  } catch {
    linkState.value = 'blocked'
    await nextTick()
    linkField.value?.focus()
    linkField.value?.select()
  }
}

async function onExport() {
  // Re-inline any Media-Library/remote images so the file is self-contained and
  // portable; this fetches each image, so let the user know it may take a beat.
  flash('Preparing the export…')
  try {
    const data = await serializePortable()
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(state.puzzleName || 'puzzle').replace(/[^\w-]+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    flash('Export ready.', 'ok')
  } catch (e) {
    flash(`Export failed: ${e.message}`, 'error')
  }
}

// loadPuzzle() back-fills every missing field, so any JSON object would
// "load" as an empty puzzle and wipe the board. Ask for the one thing every
// puzzle file has before handing it over.
const looksLikePuzzle = (d) =>
  !!d && typeof d === 'object' && !Array.isArray(d) && !!d.cards && typeof d.cards === 'object'

// Importing replaces the open puzzle: ask first if that loses work.
const confirmImport = ref(false)
function startImport() {
  if (wouldLoseWork()) confirmImport.value = true
  else importInput.value.click()
}
function importAnyway() {
  confirmImport.value = false
  importInput.value.click()
}

async function onImport(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    if (!looksLikePuzzle(data)) throw new Error('not a puzzle')
    loadPuzzle(data, { play: false })
    flash(`Imported "${state.puzzleName || 'Untitled puzzle'}"`, 'ok')
    emit('close')
  } catch (err) {
    flash(
      err?.code === 'too-new'
        ? `Import failed: ${err.message}`
        : "Import failed: that file isn't a puzzle.",
      'error'
    )
  }
}
</script>

<template>
  <dialog
    ref="dlg"
    class="dlg share-dlg"
    :aria-labelledby="`${uid}-title`"
    @cancel="onCancel"
    @keydown="onKey"
  >
    <div class="dh">
      <h2 :id="`${uid}-title`">Share</h2>
      <button type="button" class="btn" @click="emit('close')">Close</button>
    </div>
    <div class="db">
      <section class="grp" :aria-labelledby="`${uid}-link`">
        <h3 :id="`${uid}-link`" class="grp-h">Link</h3>
        <p class="help">Anyone with the link can play this puzzle as it is now.</p>
        <div class="linkbox">
          <button type="button" class="btn primary" @click="onCopyLink">Copy link</button>
        </div>
        <div role="status" class="status">
          <p v-if="linkState === 'copied'" class="line ok">Link copied.</p>
          <p v-else-if="linkState === 'long-server'" class="line warn">
            This puzzle is too big for a short link. Save it first, then copy
            its link again for a short ?puzzle= link.
          </p>
          <p v-else-if="linkState === 'long-local'" class="line warn">
            Link copied, but it's very long. For big puzzles, export the file,
            host it, and link to it with ?src=&lt;url&gt;.
          </p>
          <p v-else-if="linkState === 'blocked'" class="line err">
            Your browser blocked the clipboard. Copy the link yourself:
          </p>
        </div>
        <input
          v-if="linkState === 'blocked'"
          ref="linkField"
          class="in"
          :value="linkUrl"
          aria-label="Share link"
          readonly
          @focus="$event.target.select()"
          @click="$event.target.select()"
        />
      </section>
      <div class="rule"></div>
      <section class="grp" :aria-labelledby="`${uid}-file`">
        <h3 :id="`${uid}-file`" class="grp-h">File</h3>
        <p class="help">
          A puzzle file keeps every card image inside it, so it works anywhere.
        </p>
        <div class="row">
          <button type="button" class="btn" @click="onExport">Export file</button>
          <button type="button" class="btn" @click="startImport">Import file…</button>
        </div>
        <input
          ref="importInput"
          type="file"
          accept="application/json,.json"
          aria-label="Import a puzzle file"
          hidden
          @change="onImport"
        />
      </section>
    </div>
    <ConfirmDialog
      :open="confirmImport"
      title="Import a puzzle file?"
      :message="
        state.recording
          ? 'The imported puzzle replaces this one. The solution you\x27re recording and any unsaved changes will be lost.'
          : 'The imported puzzle replaces this one, and its changes have not been saved.'
      "
      confirm-label="Choose a file"
      keep-label="Keep editing"
      @confirm="importAnyway"
      @cancel="confirmImport = false"
    />
  </dialog>
</template>

<style scoped>
.dlg {
  width: min(480px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
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
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}
.grp {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.grp-h {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 18px;
  color: var(--c-cream-hi);
}
.help {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--c-muted);
  line-height: 1.4;
}
.linkbox,
.row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}
.rule {
  height: 1px;
  background: var(--c-line);
}
.status:empty {
  display: none;
}
/* Each state carries a glyph as well as its colour. */
.line {
  display: flex;
  gap: 6px;
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
}
.line::before {
  flex-shrink: 0;
  font-weight: 700;
}
.line.ok {
  color: var(--c-ok);
}
.line.ok::before {
  content: '✓';
}
.line.warn {
  color: var(--c-warn);
}
.line.warn::before {
  content: '!';
  width: 16px;
  height: 16px;
  margin-top: 1px;
  border: 1.5px solid var(--c-warn);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}
.line.err {
  color: var(--c-danger-soft);
}
.line.err::before {
  content: '✕';
}
.in {
  width: 100%;
  box-sizing: border-box;
  height: 36px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid var(--c-line-strong);
  background: var(--c-felt-deep);
  color: var(--c-text);
  font-family: var(--font-ui);
  font-size: var(--fs-md);
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
