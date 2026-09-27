<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { state, ui } from '../store.js'
import CardInspector from './CardInspector.vue'
import CardActions from './CardActions.vue'
import CardSetup from './CardSetup.vue'
import CardPool from './CardPool.vue'
import PuzzleSettings from './PuzzleSettings.vue'

// The editor's left column: Card / Pool / Puzzle tabs. Messages go through
// editorToast (header), so this component has no emits.

const TABS = [
  { id: 'card', label: 'Card' },
  { id: 'pool', label: 'Pool' },
  { id: 'puzzle', label: 'Puzzle' },
]

const tab = ref(ui.selected ? 'card' : 'pool')
const tabEls = ref({})

// Selecting a card jumps to Card; putting it down gives the column back to
// whichever tab was open before (usually Pool), so placing several copies
// from the pool never needs a click back on Pool. A tab picked by hand while
// the card is selected wins: deselecting then leaves it alone.
let before = null
watch(
  () => ui.selected,
  (id, prev) => {
    if (id && !prev) {
      before = tab.value === 'card' ? null : tab.value
      tab.value = 'card'
    } else if (!id && prev) {
      if (before && tab.value === 'card') tab.value = before
      before = null
    }
  }
)

const poolBadge = computed(() =>
  state.recording ? 'closed' : String(state.zones.pool?.length || 0)
)

// ---------- narrow: rail + drawer (1024-1280 px) ----------

const RAIL_QUERY = '(min-width: 1024px) and (max-width: 1280px)'
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(RAIL_QUERY) : null
const isRail = ref(!!mq?.matches)
const drawerOpen = ref(false)
const drawerEl = ref(null)
// The ability editor (TriggerEditor, via CardSetup) is mounted inside the Card
// panel, so a closed drawer would hide it. While it is open the drawer stays
// open, including when the window narrows into rail width.
const abilityDialogOpen = () => !!drawerEl.value?.querySelector('.ability-dialog')
const onMq = (e) => {
  isRail.value = e.matches
  if (!e.matches) drawerOpen.value = false
  else if (abilityDialogOpen()) {
    tab.value = 'card'
    drawerOpen.value = true
  }
}
mq?.addEventListener('change', onMq)
onBeforeUnmount(() => mq?.removeEventListener('change', onMq))

const panelShown = computed(() => !isRail.value || drawerOpen.value)

function focusTab(id) {
  nextTick(() => tabEls.value[id]?.focus())
}

function openTab(id) {
  if (isRail.value && drawerOpen.value && tab.value === id) {
    closeDrawer()
    return
  }
  tab.value = id
  if (id !== 'card') before = null
  if (isRail.value) drawerOpen.value = true
}

function closeDrawer() {
  if (abilityDialogOpen()) return
  drawerOpen.value = false
  focusTab(tab.value)
}

// Roving tabindex: arrows move between tabs (and select them), Home/End jump.
function onTabKey(e) {
  const i = TABS.findIndex((t) => t.id === tab.value)
  const keys = {
    ArrowRight: i + 1,
    ArrowDown: i + 1,
    ArrowLeft: i - 1,
    ArrowUp: i - 1,
    Home: 0,
    End: TABS.length - 1,
  }
  if (!(e.key in keys)) return
  e.preventDefault()
  const next = TABS[(keys[e.key] + TABS.length) % TABS.length].id
  tab.value = next
  if (next !== 'card') before = null
  focusTab(next)
}

// Esc inside the drawer closes it (and doesn't also put the card down).
function onDrawerKey(e) {
  if (e.key !== 'Escape' || !isRail.value) return
  e.stopPropagation()
  closeDrawer()
}
</script>

<template>
  <div class="editor-sidebar" :class="{ 'is-rail': isRail, 'drawer-open': isRail && drawerOpen }">
    <div
      class="tabs"
      role="tablist"
      aria-label="Setup"
      :aria-orientation="isRail ? 'vertical' : 'horizontal'"
    >
      <button
        v-for="t in TABS"
        :id="`ed-tab-${t.id}`"
        :key="t.id"
        :ref="(el) => (tabEls[t.id] = el)"
        class="tab"
        role="tab"
        type="button"
        :aria-selected="tab === t.id"
        :aria-controls="`ed-panel-${t.id}`"
        :aria-expanded="isRail ? drawerOpen && tab === t.id : undefined"
        :tabindex="tab === t.id ? 0 : -1"
        @click="openTab(t.id)"
        @keydown="onTabKey"
      >
        <span class="tab-label">{{ t.label }}</span>
        <span v-if="t.id === 'pool'" class="n">{{ poolBadge }}</span>
      </button>
    </div>

    <div v-show="panelShown" ref="drawerEl" class="drawer" @keydown="onDrawerKey">
      <div v-if="isRail" class="drawer-head">
        <span class="drawer-title">{{ TABS.find((t) => t.id === tab).label }}</span>
        <button class="btn small" type="button" @click="closeDrawer">Close</button>
      </div>

      <div
        id="ed-panel-card"
        v-show="tab === 'card'"
        class="panel-body"
        role="tabpanel"
        aria-labelledby="ed-tab-card"
        tabindex="0"
      >
        <template v-if="ui.selected">
          <CardInspector />
          <section class="grp" aria-labelledby="ed-on-table">
            <h3 id="ed-on-table" class="grp-h">On the table</h3>
            <CardActions placement="column" />
          </section>
          <CardSetup />
        </template>
        <div v-else class="empty-box">
          <b>No card selected</b>
          <span>
            Select a card on the table, in a hand or pile, or in the pool to set it up. Drag from
            the pool to place a copy.
          </span>
          <span class="keys"><kbd>Esc</kbd> puts a selected card down.</span>
        </div>
      </div>

      <div
        id="ed-panel-pool"
        v-show="tab === 'pool'"
        class="panel-body"
        role="tabpanel"
        aria-labelledby="ed-tab-pool"
        tabindex="0"
      >
        <CardPool />
      </div>

      <div
        id="ed-panel-puzzle"
        v-show="tab === 'puzzle'"
        class="panel-body"
        role="tabpanel"
        aria-labelledby="ed-tab-puzzle"
        tabindex="0"
      >
        <PuzzleSettings />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Fills the left column; the tab row stays put and the panel scrolls inside. */
.editor-sidebar {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  background: var(--c-panel);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
  font-family: var(--font-ui);
  color: var(--c-text);
}

.tabs {
  display: flex;
  flex-shrink: 0;
  padding: 0 var(--sp-2);
  border-bottom: 1px solid var(--c-line);
}

.tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 46px;
  padding: 0 14px;
  border: 0;
  background: transparent;
  color: var(--c-muted-hi);
  font-family: var(--font-ui);
  font-size: var(--fs-md);
  cursor: pointer;
}
.tab:hover {
  color: var(--c-cream-hi);
}
.tab .n {
  font-size: var(--fs-sm);
  font-weight: 400;
  color: var(--c-muted);
}
/* Selected: bold text plus a gold bar, not colour alone. */
.tab[aria-selected='true'] {
  color: var(--c-cream-hi);
  font-weight: 700;
}
.tab[aria-selected='true']::after {
  content: '';
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: -1px;
  height: 3px;
  border-radius: 2px;
  background: var(--c-gold);
}
.tab:focus-visible {
  outline: 2px solid var(--c-focus);
  outline-offset: -2px;
  border-radius: var(--r-sm);
}

.drawer {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.panel-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: var(--sp-4) 18px;
}
.panel-body:focus-visible {
  outline: 2px solid var(--c-focus);
  outline-offset: -2px;
}

/* The inspector sits inside this panel: drop its own frame. */
.panel-body :deep(.inspector) {
  padding: 0;
  background: none;
  border: 0;
  flex: 0 0 auto;
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
  font-size: var(--fs-lg);
  color: var(--c-cream-hi);
}

.empty-box {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 18px 16px;
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--r-md);
  text-align: center;
  font-size: var(--fs-sm);
  line-height: 1.45;
  color: var(--c-muted);
}
.empty-box b {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--fs-lg);
  color: var(--c-cream-hi);
}
.keys kbd {
  padding: 0 var(--sp-1);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  background: var(--c-raised);
  font-family: var(--font-ui);
  color: var(--c-cream);
}

/* ---------- narrow: vertical rail + 340 px drawer over the board ---------- */
/* Full column height: the drawer is inset 0 against it. */
.is-rail {
  width: 56px;
  flex: 1 1 auto;
  align-self: stretch;
}
.is-rail .tabs {
  flex-direction: column;
  align-items: stretch;
  gap: var(--sp-1);
  padding: var(--sp-2) 0;
  border-bottom: 0;
}
.is-rail .tab {
  flex-direction: column;
  justify-content: center;
  height: auto;
  padding: 10px 4px;
  gap: 2px;
  font-size: var(--fs-xs);
}
.is-rail .tab[aria-selected='true']::after {
  left: 0;
  right: auto;
  top: 8px;
  bottom: 8px;
  width: 3px;
  height: auto;
}
.is-rail .tab .n {
  font-size: var(--fs-xs);
}
.is-rail .drawer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(100% + 6px);
  z-index: 30;
  width: 340px;
  background: var(--c-panel);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
}
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  height: 46px;
  padding: 0 var(--sp-3) 0 18px;
  border-bottom: 1px solid var(--c-line);
}
.drawer-title {
  font-weight: 700;
  color: var(--c-cream-hi);
}
</style>
