<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { state, ui, zoneOf, isStoryChoiceTarget, canActivateTarget } from '../store.js'
import Hand from './Hand.vue'
import DropZone from './DropZone.vue'
import CardToken from './CardToken.vue'
import { plural } from '../format.js'

defineProps({
  // The desktop play table's 140px tray (board-size/report.md): smaller pile
  // faces and fan cards, so the board row gets the height.
  compact: { type: Boolean, default: false },
})

// Your side of the table, as it sits on a real one: decks on the left, the
// hand fanned in the middle, the public piles on the right.
const DECKS = [
  { zone: 'atlas:player', label: 'Atlas', hidden: () => state.hideAtlas },
  { zone: 'spellbook:player', label: 'Spellbook', hidden: () => state.hideSpellbook },
]
const PILES = [
  { zone: 'grave:player', label: 'Cemetery' },
  { zone: 'collection:player', label: 'Collection' },
  { zone: 'banished:player', label: 'Banished' },
]
const ALL = [...DECKS, ...PILES]

const cards = (zone) => state.zones[zone] || []
const count = (zone) => cards(zone).length
const top = (zone) => state.cards[cards(zone).at(-1)]

// A hidden deck still shows when the puzzle puts cards in it, exactly as the
// old tray did. The editor always shows both (every zone stays a drop target)
// and says in words which one players won't see.
const editor = computed(() => state.mode === 'editor')
const decks = computed(() => DECKS.filter((d) => editor.value || !d.hidden() || count(d.zone)))
const hiddenEmpty = (d) => editor.value && d.hidden() && !count(d.zone)

// Depth under the top card: one edge per extra card, capped at three.
const depth = (zone) => Math.min(3, Math.max(0, count(zone) - 1))

// A pile opens a drawer above the tray listing its cards, which is how a card
// in a pile is still selected, dragged out, or dropped onto. One at a time.
const open = ref(null)
const openPile = computed(() => ALL.find((p) => p.zone === open.value) || null)
const pileBtns = ref({})

// Clicking a pile with a card selected elsewhere doesn't close anything: the
// click also reaches the DropZone underneath, which moves the card there when
// it may go, and the open drawer then shows it arriving.
function onPile(zone) {
  if (ui.selected && zoneOf(ui.selected) !== zone) open.value = zone
  else open.value = open.value === zone ? null : zone
}

function close() {
  const zone = open.value
  open.value = null
  nextTick(() => pileBtns.value[zone]?.focus())
}

// A trigger or ability waiting on a card that lies in one of the piles opens
// that pile, or the pick would be unreachable.
const pileWithTarget = computed(() => {
  if (!ui.storyChoice && !ui.activating) return null
  return (
    ALL.find((p) =>
      cards(p.zone).some((id) => isStoryChoiceTarget(id) || canActivateTarget(id))
    )?.zone ?? null
  )
})
watch(pileWithTarget, (zone) => {
  if (zone) open.value = zone
})

</script>

<template>
  <section class="hand-tray" :class="{ compact }" aria-label="Your hand and piles">
    <div class="tray-group decks">
      <div v-for="d in decks" :key="d.zone" class="pile">
        <DropZone :zone="d.zone" class="pile-face deck" :class="[count(d.zone) ? `depth-${depth(d.zone) + 1}` : 'is-empty', { 'is-open': open === d.zone, 'is-hidden': hiddenEmpty(d) }]">
          <button
            :ref="(el) => (pileBtns[d.zone] = el)"
            type="button"
            class="pile-btn"
            :aria-label="`Your ${d.label.toLowerCase()}, ${plural(count(d.zone), 'card')} face down${hiddenEmpty(d) ? ', hidden from players' : ''}`"
            :aria-expanded="open === d.zone"
            aria-controls="tray-drawer"
            @click="onPile(d.zone)"
            @keydown.enter.stop
            @keydown.space.stop
          >
            <span v-if="hiddenEmpty(d)" class="empty-word hidden-word">Empty and hidden from players</span>
            <span v-else-if="!count(d.zone)" class="empty-word">Empty</span>
            <span v-else class="deck-back" aria-hidden="true" />
            <span v-if="count(d.zone)" class="count-badge light" aria-hidden="true">{{ count(d.zone) }}</span>
          </button>
        </DropZone>
        <span class="pile-label">{{ d.label }}</span>
      </div>
    </div>

    <div class="tray-hand" aria-label="Your hand" role="group">
      <Hand side="player" variant="fan" :card-w="compact ? 84 : 100" />
    </div>

    <div class="tray-group piles">
      <div v-for="p in PILES" :key="p.zone" class="pile">
        <DropZone :zone="p.zone" class="pile-face" :class="[count(p.zone) ? `face-up depth-${depth(p.zone)}` : 'is-empty', { 'is-open': open === p.zone }]">
          <button
            :ref="(el) => (pileBtns[p.zone] = el)"
            type="button"
            class="pile-btn"
            :aria-label="`Your ${p.label.toLowerCase()}, ${plural(count(p.zone), 'card')}`"
            :aria-expanded="open === p.zone"
            aria-controls="tray-drawer"
            @click="onPile(p.zone)"
            @keydown.enter.stop
            @keydown.space.stop
          >
            <span v-if="!count(p.zone)" class="empty-word">Empty</span>
            <img
              v-else-if="top(p.zone)?.img"
              :src="top(p.zone).img"
              alt=""
              class="top-art"
              :class="{ flipped: top(p.zone).enemy }"
              draggable="false"
            />
            <span v-if="count(p.zone)" class="count-badge" aria-hidden="true">{{ count(p.zone) }}</span>
          </button>
        </DropZone>
        <span class="pile-label">{{ p.label }}</span>
      </div>
    </div>

    <!-- The open pile's cards, above the tray and over the foot of the mat. -->
    <div
      v-if="openPile"
      id="tray-drawer"
      class="tray-drawer"
      role="region"
      :aria-label="`Your ${openPile.label.toLowerCase()}`"
      @keydown.esc.stop="close"
    >
      <div class="drawer-head">
        <span class="drawer-title">{{ openPile.label }}</span>
        <span class="drawer-count">{{ plural(count(openPile.zone), 'card') }}</span>
        <button type="button" class="btn drawer-close" @click="close">Close</button>
      </div>
      <DropZone :zone="openPile.zone" class="drawer-cards">
        <CardToken
          v-for="id in cards(openPile.zone)"
          :key="id"
          :card-id="id"
          :from="openPile.zone"
        />
        <span v-if="!count(openPile.zone)" class="empty-word">Empty. Drop a card here.</span>
      </DropZone>
    </div>
  </section>
</template>

<style scoped>
/* Decks | hand | piles, all standing on the bottom edge like cards on a table.
   Overflow stays visible: a lifted hand card and the pile drawer both reach
   up past the tray. */
.hand-tray {
  position: relative;
  z-index: 20;
  display: flex;
  align-items: flex-end;
  gap: 28px;
  height: 100%;
  min-height: 0;
  padding: 0 22px 14px;
  background: var(--c-panel);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
}

.tray-group {
  display: flex;
  gap: 14px;
  flex: none;
}

.tray-hand {
  flex: 1 1 auto;
  min-width: 0;
  align-self: stretch;
}

/* ---- piles and decks ---- */

.pile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
}

.pile-label {
  font-size: 14px;
  color: var(--c-muted-hi);
}

/* The face is the drop target (DropZone's own cues draw on it); the button
   inside fills it and opens the drawer. */
.pile-face {
  position: relative;
  width: 76px;
  height: 104px;
  border-radius: 6px;
}

.pile-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.pile-btn:focus-visible {
  outline: 2px solid var(--c-focus);
  outline-offset: 3px;
}

/* Face down: the felt back with a thin gold frame. */
.deck {
  background: var(--c-raised-2);
}

.deck-back {
  position: absolute;
  inset: 5px;
  border: 1px solid color-mix(in srgb, var(--c-gold) 50%, transparent);
  border-radius: 3px;
}

/* Face up: the top card's art on a parchment edge. */
.face-up {
  background: var(--c-cream);
  border: 1.5px solid var(--c-cream-lo);
}

.top-art {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 5px;
}

.top-art.flipped {
  transform: rotate(180deg);
}

/* Depth: an offset edge per extra card (capped), so size reads at a glance. */
.face-up.depth-1 {
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--c-cream-lo) 85%, black);
}
.face-up.depth-2 {
  box-shadow:
    3px 3px 0 color-mix(in srgb, var(--c-cream-lo) 85%, black),
    6px 6px 0 color-mix(in srgb, var(--c-cream-lo) 68%, black);
}
.face-up.depth-3 {
  box-shadow:
    3px 3px 0 color-mix(in srgb, var(--c-cream-lo) 85%, black),
    6px 6px 0 color-mix(in srgb, var(--c-cream-lo) 68%, black),
    9px 9px 0 color-mix(in srgb, var(--c-cream-lo) 52%, black);
}
.deck.depth-2 {
  box-shadow: 3px 3px 0 color-mix(in srgb, var(--c-raised-2) 82%, black);
}
.deck.depth-3,
.deck.depth-4 {
  box-shadow:
    3px 3px 0 color-mix(in srgb, var(--c-raised-2) 82%, black),
    6px 6px 0 color-mix(in srgb, var(--c-raised-2) 62%, black);
}

/* Empty: a dashed outline that is still a drop target, and says so in words. */
.pile-face.is-empty {
  background: none;
  border: 1.5px dashed color-mix(in srgb, var(--c-cream) 28%, transparent);
}

.empty-word {
  font-size: var(--fs-sm);
  color: var(--c-muted-lo);
}

/* Editor: an empty deck the puzzle hides from players (#desktop tray). */
.pile-face.is-empty.is-hidden {
  border-color: var(--c-muted-2);
}

.hidden-word {
  padding: 6px;
  text-align: center;
  line-height: 1.25;
  font-size: var(--fs-xs);
}

.count-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  z-index: 2;
  min-width: 24px;
  height: 24px;
  padding: 0 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--c-ink);
  color: var(--c-cream-hi);
  border: 1.5px solid var(--c-cream-lo);
  font-size: var(--fs-sm);
  font-weight: 700;
  font-variant-numeric: lining-nums tabular-nums;
}

.count-badge.light {
  background: var(--c-cream);
  color: var(--c-ink);
  border: 0;
}

/* The open pile is ringed in gold; its drawer is the other half of the cue. */
.pile-face.is-open {
  outline: 2px solid var(--c-gold);
  outline-offset: 3px;
}

/* ---- drawer ---- */

.tray-drawer {
  position: absolute;
  right: var(--sp-3);
  bottom: calc(100% + 8px);
  z-index: 30;
  width: min(640px, calc(100% - 2 * var(--sp-3)));
  max-height: 240px;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3) var(--sp-3);
  background: var(--c-felt);
  border: 1px solid var(--c-gold);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
}

.drawer-head {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
}

.drawer-title {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--c-cream-hi);
}

.drawer-count {
  font-size: var(--fs-sm);
  color: var(--c-muted);
  font-variant-numeric: lining-nums tabular-nums;
}

.drawer-close {
  margin-left: auto;
}

.drawer-cards {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--sp-2);
  min-height: 110px;
  padding: var(--sp-2);
  overflow-y: auto;
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--r-md);
}

.drawer-cards :deep(.card-token) {
  --card-w: 72px;
}

.drawer-cards .empty-word {
  align-self: center;
  margin: auto;
}

/* Desktop play table: a 140px tray. */
.hand-tray.compact {
  gap: 24px;
  padding: 0 18px 10px;
}

.compact .tray-group {
  gap: 12px;
}

.compact .pile {
  gap: 4px;
}

.compact .pile-face {
  width: 60px;
  height: 84px;
}

.compact .pile-label {
  font-size: var(--fs-sm);
}

/* Phone and small tablet (.mockup/phone.html): the fan takes the full width
   on its own row, decks and piles share the row under it, smaller, so all of
   them stay reachable without the page scrolling sideways. */
@media (max-width: 700px) {
  .hand-tray {
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10px 8px;
    padding: 0 10px 10px;
  }

  .tray-hand {
    order: -1;
    flex: 1 1 100%;
    height: 150px;
  }

  .tray-group {
    gap: 8px;
  }

  .pile-face {
    width: 52px;
    height: 72px;
  }

  .pile-label {
    font-size: var(--fs-xs);
  }

  .empty-word {
    font-size: var(--fs-xs);
  }

  .hidden-word {
    padding: 2px;
    font-size: 10px;
  }

  .count-badge {
    top: -6px;
    right: -6px;
    min-width: 20px;
    height: 20px;
    font-size: var(--fs-xs);
  }

  .tray-drawer {
    left: var(--sp-2);
    right: var(--sp-2);
    width: auto;
  }
}
</style>
