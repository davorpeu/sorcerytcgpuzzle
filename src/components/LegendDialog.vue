<script setup>
// How to read the table: the legend, opened from the header's Help button. It
// is reference, read once or twice, so it lives behind a button instead of
// taking room from the board and the selected card.
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import ThresholdIcon from './ThresholdIcon.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const dlg = ref(null)
const closeBtn = ref(null)
let opener = null

async function show() {
  opener = document.activeElement
  await nextTick()
  if (!dlg.value || dlg.value.open) return
  dlg.value.showModal()
  closeBtn.value?.focus()
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

// Esc fires the native cancel event: close through the parent, and keep the
// table's own Esc handler (which drops the selection) out of it.
function onCancel(e) {
  e.preventDefault()
  emit('close')
}
function onKey(e) {
  if (e.key === 'Escape') e.stopPropagation()
}
</script>

<template>
  <dialog ref="dlg" class="help-dlg" aria-labelledby="help-title" @cancel="onCancel" @keydown="onKey">
    <div class="dh">
      <h2 id="help-title">How to play</h2>
      <button ref="closeBtn" type="button" class="btn" @click="emit('close')">Close</button>
    </div>
    <div class="db">
      <ul class="legend-list">
            <li><kbd class="legend-kbd">Alt</kbd> hover a card to enlarge it</li>
            <li class="legend-keys">
              <kbd class="legend-kbd">Tab</kbd> to a card and
              <kbd class="legend-kbd">Enter</kbd> to select it, then
              <kbd class="legend-kbd">Tab</kbd> to a zone and
              <kbd class="legend-kbd">Enter</kbd> to move it there.
              <kbd class="legend-kbd">Esc</kbd> deselects
            </li>
            <li>
              <span class="legend-swatch unit"></span>
              Your card (cream edge) — minions can move, attack or shoot (each taps it), and use their abilities
            </li>
            <li>
              <span class="legend-swatch opp"></span>
              Opponent's card (slate edge)
            </li>
            <li>
              <span class="legend-swatch avatar"></span>
              Avatar (heavier edge) — special minion representing the player
            </li>
            <li>
              <span class="legend-swatch"></span>
              Site (parchment border) — occupies a square of the grid
            </li>
            <li>
              <span class="legend-swatch aura"></span>
              Aura (teal border) — sits on an intersection, always drawn on top
            </li>
            <li>
              <span class="legend-icon">🂠</span>
              Upside-down card — controlled by the opponent
            </li>
            <li>
              <span class="legend-badge under">Buried</span> /
              <span class="legend-badge under">Submerged</span>
              (▾ / ≈ on small cards) Card under a land / water site — darkened; drag or move it onto the lower strip
              of a square to send it below, the upper part to surface it
            </li>
            <li>
              <span class="legend-icon">☞</span>
              Click a card to select it — its actions (cast, move, attack,
              abilities, pick up) appear with it, on the left
            </li>
            <li>
              <span class="legend-icon">✋</span>
              Carried card — picked up by another card, travels with it until
              its holder drops it
            </li>
            <li>
              <span class="legend-icon">→</span>
              With a card selected, click any zone to move it there (works
              without dragging, e.g. on a tablet)
            </li>
            <li class="legend-elements">
              <span v-for="el in ['air', 'earth', 'fire', 'water']" :key="el" class="legend-el">
                <ThresholdIcon :element="el" /> {{ el }}
              </span>
            </li>
          </ul>
      <p class="story-note">
        The storyline is where spells and abilities wait, in order, while they resolve. Both
        players share it.
      </p>
    </div>
  </dialog>
</template>

<style scoped>
/* Moved from style.css (kept first, so the component's own rules below still win). */
/* Type key: a small square with the same coloured border the card art wears,
   so the legend matches the ring on the board. Site uses parchment. */
.legend-swatch {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--c-cream-lo);
  border-radius: 4px;
  flex-shrink: 0;
}

.legend-swatch.unit {
  border-color: var(--c-cream);
}

.legend-swatch.opp {
  border-color: var(--c-opp);
}

.legend-swatch.avatar {
  border-color: var(--c-cream);
  border-width: 3px;
}

.legend-swatch.aura {
  border-color: var(--aura);
}

.legend-list li {
  display: flex;
  align-items: flex-start;
  gap: 7px;
}

.help-dlg {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  padding: 0;
  color: var(--c-text);
  font-family: var(--font-ui);
  background: var(--c-panel);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
}
.help-dlg::backdrop {
  background: var(--c-scrim);
}
.help-dlg[open] {
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
  padding: var(--sp-4) 18px;
  overflow-y: auto;
}
.story-note {
  margin: var(--sp-3) 0 0;
  font-size: var(--fs-sm);
  color: var(--c-muted);
}

/* Moved from App.vue with the legend. */
/* Card type/side rings live in CardToken.vue (scoped skin): cream edge = yours,
   slate = opponent, heavier edge = avatar, parchment = site, teal = aura. */

.legend-badge.under {
  background: var(--c-raised-2);
  color: var(--c-text);
}

.legend-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  font-size: 12px;
  color: var(--muted);
}

/* The keyboard walkthrough is a sentence with <kbd> chips in it, not a
   badge + label row. As a flex line every bare text run ("to a card and",
   "to select it, then") became its own non-wrapping flex item and collapsed
   into a narrow stack of columns. Let it flow as ordinary wrapping text with
   the chips sitting inline. */

.legend-list .legend-keys {
  display: block;
  line-height: 1.7;
}

.legend-keys .legend-kbd {
  margin: 0 1px;
}

.legend-badge {
  background: var(--accent);
  color: var(--c-ink);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 3px;
  flex-shrink: 0;
}

.legend-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--text);
  font-size: 12px;
  flex-shrink: 0;
}

.legend-elements {
  flex-wrap: wrap;
  gap: 4px 10px;
}

.legend-el {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  text-transform: capitalize;
}

.legend-kbd {
  display: inline-block;
  vertical-align: baseline;
  white-space: nowrap;
  border: 1px solid var(--border);
  background: var(--panel-2);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: inherit;
  font-size: 11px;
  color: var(--text);
}
</style>
