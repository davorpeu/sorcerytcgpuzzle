<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { state, pendingModeChoice, chooseModes, cancelModeChoice } from '../store.js'

// "Choose one / choose two": a modal ability asks for its modes before any
// targeting. Shared by activations, casts (bar or drag) and paused triggers --
// the store's pendingModeChoice() says which. One-mode choices resolve on a
// click; multi-mode ones tick checkboxes and confirm.
const choice = computed(() => pendingModeChoice())
const picked = ref([])
const firstMode = ref(null)
// A native modal <dialog>, like the other dialogs: it keeps focus inside and
// turns Esc into a cancel event.
const dlgEl = ref(null)
watch(
  () => choice.value && `${choice.value.cardId}:${choice.value.ability.id}`,
  async (key) => {
    picked.value = []
    await nextTick()
    if (!key) {
      if (dlgEl.value?.open) dlgEl.value.close()
      return
    }
    if (!dlgEl.value.open) dlgEl.value.showModal()
    // Put the keyboard on the first mode so the choice can be made at once.
    firstMode.value?.focus()
  }
)

// Esc cancels an activation's choice. A triggered ability can't be called off
// (it has to resolve), so there Esc does nothing.
function onCancel(e) {
  e.preventDefault()
  if (!choice.value?.story) cancelModeChoice()
}
// Esc belongs to the dialog; don't let the table's Esc handler also act.
function onKey(e) {
  if (e.key === 'Escape') e.stopPropagation()
}

const single = computed(() => choice.value?.count === 1)
const ready = computed(() => picked.value.length === choice.value?.count)

// The card is shown by its art; its name (printed on the card) is only for
// screen readers.
const card = computed(() => choice.value && state.cards[choice.value.cardId])
const countWord = computed(() => {
  const n = choice.value?.count
  return ['', 'one', 'two', 'three', 'four'][n] || n
})
const label = computed(() => {
  const c = choice.value
  if (!c) return ''
  const who = card.value?.name || 'This card'
  const what = c.ability.name ? `, ${c.ability.name}` : ''
  return `${who}${what}: choose ${countWord.value}`
})

function toggle(i) {
  if (single.value) {
    chooseModes([i])
    return
  }
  const at = picked.value.indexOf(i)
  if (at !== -1) picked.value.splice(at, 1)
  else if (picked.value.length < choice.value.count) picked.value.push(i)
}

function setFirst(i, el) {
  if (i === 0) firstMode.value = el
}
</script>

<template>
  <dialog ref="dlgEl" class="choice-modal" :aria-label="label" @cancel="onCancel" @keydown="onKey">
    <div v-if="choice" class="dlg">
      <div class="dh">
        <img
          v-if="card?.img"
          class="art"
          :class="{ landscape: card.site }"
          :src="card.img"
          alt=""
          draggable="false"
        />
        <span v-else class="art blank" aria-hidden="true"></span>
        <h2>
          Choose {{ countWord }}
          <span v-if="!single" class="count">{{ picked.length }} of {{ choice.count }} picked</span>
        </h2>
      </div>
      <div class="db">
        <div class="mode-list">
          <button
            v-for="(m, i) in choice.ability.modes"
            :key="i"
            :ref="(el) => setFirst(i, el)"
            type="button"
            class="btn mode-btn"
            :class="{ picked: picked.includes(i) }"
            :aria-pressed="single ? undefined : picked.includes(i)"
            @click="toggle(i)"
          >
            <span v-if="!single" class="tick" aria-hidden="true">{{ picked.includes(i) ? '✓' : '' }}</span>
            {{ m.name || `Mode ${i + 1}` }}
          </button>
        </div>
      </div>
      <div v-if="!single || !choice.story" class="df">
        <span class="sp"></span>
        <button v-if="!choice.story" type="button" class="btn ghost" @click="cancelModeChoice">
          Cancel
        </button>
        <button
          v-if="!single"
          type="button"
          class="btn primary"
          :disabled="!ready"
          @click="chooseModes(picked)"
        >
          Confirm
        </button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.choice-modal {
  padding: var(--sp-4);
  border: none;
  background: transparent;
  max-width: 100%;
  max-height: 100%;
  overflow: visible;
}
.choice-modal::backdrop {
  background: rgba(0, 0, 0, 0.55);
}
.dlg {
  width: min(420px, 100%);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  color: var(--c-text);
  font-family: var(--font-ui);
  background: var(--c-panel);
  border: 1px solid var(--c-line-strong);
  border-radius: 12px;
  box-shadow: var(--shadow-pop);
}
@media (prefers-reduced-motion: no-preference) {
  .dlg {
    animation: choice-in 0.14s ease-out;
  }
}
@keyframes choice-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
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
  display: flex;
  flex-direction: column;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 24px;
  line-height: 1.15;
  color: var(--c-cream-hi);
}
.count {
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  color: var(--c-muted);
}
.art {
  width: 40px;
  height: 56px;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: var(--r-sm);
  box-shadow: var(--shadow-card);
}
.art.landscape {
  width: 56px;
  height: 40px;
}
.art.blank {
  border: 1.5px solid var(--c-line-strong);
  box-shadow: none;
}
.db {
  padding: var(--sp-4) 18px;
  overflow-y: auto;
}
.mode-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}
.mode-btn {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 36px;
  text-align: left;
}
/* Picked shows a tick and a gold outline, not just a fill. */
.mode-btn.picked {
  border-color: var(--c-gold);
  background: var(--c-gold-bg);
  font-weight: 700;
}
.tick {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  color: var(--c-gold);
  font-size: 13px;
}
.mode-btn.picked .tick {
  border-color: var(--c-gold);
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
.btn.ghost {
  background: transparent;
}
</style>
