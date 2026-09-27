<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import {
  state,
  config,
  listPuzzles,
  loadById,
  deletePuzzle,
  loadDaily,
  localToday,
} from '../store.js'
import { flash } from '../editorToast.js'
import ConfirmInline from './ConfirmInline.vue'

// The saved puzzles, grouped by what players see: upcoming (dated, not yet
// live), released (live or in the archive) and drafts (no date). Grouping is
// sorting only; every row gets the same Play / Edit / Delete.
const props = defineProps({ open: { type: Boolean, default: false } })
const emit = defineEmits(['close'])

const uid = useId()
const dlg = ref(null)
const closeBtn = ref(null)
const saved = ref([])
const loaded = ref(false)
const confirming = ref(null) // id of the row asking "delete for good?"
const delBtns = {} // row Delete buttons, so Keep can hand focus back
const setDelBtn = (id, el) => (el ? (delBtns[id] = el) : delete delBtns[id])
let opener = null
// Released = has a date that has arrived, as the store's released() check.
// Re-read on every list load so a dialog left open over midnight catches up.
const today = ref(localToday())

async function refresh() {
  saved.value = await listPuzzles()
  today.value = localToday()
  loaded.value = true
}

async function show() {
  opener = document.activeElement
  confirming.value = null
  loaded.value = false
  await nextTick()
  if (dlg.value && !dlg.value.open) dlg.value.showModal()
  refresh()
}

function hide() {
  confirming.value = null
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

// Esc inside a row's delete question backs out of the question only (the row
// handles it); stop it from also closing the dialog. Esc never reaches the
// table's handler behind the dialog.
function onKeyCapture(e) {
  if (e.key === 'Escape' && confirming.value) e.preventDefault()
}
function onKey(e) {
  if (e.key === 'Escape') e.stopPropagation()
}

// Released sorts newest first, ties to the higher id, so its first row is the
// live puzzle -- the same pick as loadDaily() and the server's /daily.
const groups = computed(() => {
  const t = today.value
  const upcoming = []
  const released = []
  const drafts = []
  for (const p of saved.value) {
    if (!p.date) drafts.push(p)
    else if (p.date > t) upcoming.push(p)
    else released.push(p)
  }
  upcoming.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  released.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.id < b.id ? 1 : -1
  )
  return [
    { key: 'upcoming', label: 'Upcoming', items: upcoming },
    { key: 'released', label: 'Released', items: released },
    { key: 'drafts', label: 'Drafts', items: drafts },
  ].filter((g) => g.items.length)
})

const liveId = computed(
  () => groups.value.find((g) => g.key === 'released')?.items[0]?.id ?? null
)

function longDate(d) {
  const [y, m, day] = d.split('-').map(Number)
  // Same wording as the Puzzle tab ("3 October 2026"); the UI copy is English.
  return new Date(y, m - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function statusWord(p, group) {
  let word
  if (group === 'drafts') word = 'No release date'
  else if (group === 'upcoming') word = `Goes live ${longDate(p.date)}`
  else if (p.id === liveId.value) word = "Today's puzzle"
  else word = `${longDate(p.date)}, in the archive`
  return p.id === state.puzzleId ? `${word}, open now` : word
}

const nameOf = (p) => p.name || 'Untitled puzzle'
const deleteMsg = (p) => `Delete "${nameOf(p)}" for good? This can't be undone.`

async function onOpen(p, play) {
  const ok = await loadById(p.id, play ? undefined : { play: false })
  if (!ok) {
    flash(`Couldn't open "${nameOf(p)}".`, 'error')
    return
  }
  emit('close')
}

async function onDelete(p) {
  confirming.value = null
  try {
    await deletePuzzle(p.id)
    flash(`Deleted "${nameOf(p)}"`, 'ok')
  } catch (e) {
    flash(`Delete failed: ${e.message}`, 'error')
  }
  await refresh()
  closeBtn.value?.focus()
}

async function onKeep(p) {
  confirming.value = null
  await nextTick()
  delBtns[p.id]?.focus()
}

async function onLoadDaily() {
  if (await loadDaily()) emit('close')
  else flash('No puzzle has been released yet.', 'warn')
}
</script>

<template>
  <dialog
    ref="dlg"
    class="dlg puzzles-dlg"
    :aria-labelledby="`${uid}-title`"
    :aria-describedby="`${uid}-where`"
    @cancel="onCancel"
    @keydown.capture="onKeyCapture"
    @keydown="onKey"
  >
    <div class="dh">
      <h2 :id="`${uid}-title`">Puzzles</h2>
      <span :id="`${uid}-where`" class="help">
        {{ config.apiUrl ? 'Saved on the site' : 'Saved in this browser' }}
      </span>
      <button ref="closeBtn" type="button" class="btn" @click="emit('close')">Close</button>
    </div>
    <div class="db">
      <p v-if="!loaded" class="help" role="status">Loading…</p>
      <div v-else-if="!groups.length" class="empty-box">
        <b>Nothing saved yet</b>
        Save the puzzle you're working on and it will be listed here.
      </div>
      <template v-else>
        <section v-for="g in groups" :key="g.key" :aria-labelledby="`${uid}-${g.key}`">
          <h3 :id="`${uid}-${g.key}`" class="glabel">{{ g.label }}</h3>
          <ul class="plist">
            <li
              v-for="p in g.items"
              :key="p.id"
              :class="{ current: p.id === state.puzzleId, asking: confirming === p.id }"
              :aria-current="p.id === state.puzzleId ? 'true' : undefined"
            >
              <ConfirmInline
                v-if="confirming === p.id"
                class="row-confirm"
                :message="deleteMsg(p)"
                confirm-label="Delete"
                @confirm="onDelete(p)"
                @cancel="onKeep(p)"
              />
              <template v-else>
                <span class="nm">
                  <b :title="p.id">{{ nameOf(p) }}</b>
                  <span class="stword" :class="g.key">{{ statusWord(p, g.key) }}</span>
                </span>
                <button
                  type="button"
                  class="btn small"
                  :aria-label="`Play ${nameOf(p)}`"
                  @click="onOpen(p, true)"
                >
                  Play
                </button>
                <button
                  type="button"
                  class="btn small"
                  :aria-label="`Edit ${nameOf(p)}`"
                  @click="onOpen(p, false)"
                >
                  Edit
                </button>
                <button
                  :ref="(el) => setDelBtn(p.id, el)"
                  type="button"
                  class="iconbtn del"
                  :aria-label="`Delete ${nameOf(p)}`"
                  :title="`Delete ${nameOf(p)}`"
                  @click="confirming = p.id"
                >
                  ✕
                </button>
              </template>
            </li>
          </ul>
        </section>
      </template>
    </div>
    <div class="df">
      <button type="button" class="btn" @click="onLoadDaily">Load today's puzzle</button>
      <span class="sp"></span>
      <span class="help">Edit opens it here; Play opens it in play test.</span>
    </div>
  </dialog>
</template>

<style scoped>
.dlg {
  width: min(560px, calc(100vw - 32px));
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
  gap: var(--sp-1);
  overflow-y: auto;
  min-height: 0;
}
.df {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3) 18px;
  border-top: 1px solid var(--c-line);
}
.sp {
  flex-grow: 1;
}
.help {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--c-muted);
  line-height: 1.4;
}
.glabel {
  margin: 10px 0 2px;
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--c-muted-hi);
}
.plist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.plist li {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) 0;
  border-top: 1px solid var(--c-line);
}
.plist li.asking {
  display: block;
  border-top-color: transparent;
  padding: var(--sp-1) 0;
}
/* The puzzle open in the editor: a gold bar as well as the words "open now". */
.plist li.current {
  box-shadow: inset 3px 0 0 var(--c-gold);
  padding-left: 10px;
}
.nm {
  flex-grow: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.nm b {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 18px;
  color: var(--c-cream-hi);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stword {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--fs-sm);
  color: var(--c-muted);
}
.stword::before {
  content: '';
  flex-shrink: 0;
}
.stword.released::before {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c-ok);
}
.stword.upcoming::before {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1.5px solid var(--c-gold);
}
.stword.drafts::before {
  width: 8px;
  height: 8px;
  border: 1.5px dashed var(--c-muted);
  border-radius: 2px;
}
.iconbtn {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid var(--c-line-strong);
  background: transparent;
  color: var(--c-muted-hi);
  font-size: 14px;
  cursor: pointer;
}
.iconbtn.del {
  color: var(--c-danger-soft);
  border-color: var(--c-danger-deep);
}
.iconbtn.del:hover {
  border-color: var(--c-danger);
}
.empty-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18px var(--sp-4);
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--r-md);
  text-align: center;
  color: var(--c-muted);
  font-size: 14px;
  line-height: 1.45;
}
.empty-box b {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 18px;
  color: var(--c-cream-hi);
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
