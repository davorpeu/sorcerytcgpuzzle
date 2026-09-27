<script setup>
import { computed, ref, watch } from 'vue'
import { state } from '../store.js'
import Hand from './Hand.vue'
import StatsBar from './StatsBar.vue'

// The opponent's zones are reference rather than workspace: a row of counts
// on the strip, and a drawer that opens over the top of the mat when you
// actually need to look (or drop something there).
const open = ref(false)

const count = (zone) => state.zones[zone]?.length ?? 0

// Hidden piles lie face down; public ones (anyone may look through them) lie
// face up once there is something in them.
const piles = [
  ['hand:opponent', 'Hand', false],
  ['spellbook:opponent', 'Spellbook', false],
  ['atlas:opponent', 'Atlas', false],
  ['grave:opponent', 'Cemetery', true],
  ['collection:opponent', 'Collection', true],
  ['banished:opponent', 'Banished', true],
]

const pileLook = (zone, faceUp) => {
  const n = count(zone)
  if (!n) return 'pile-empty'
  return [faceUp ? 'pile-up' : 'pile-down', n > 1 && 'pile-stack']
}

// Whether the opponent's avatar stands on the board is game state; its name
// is printed on the card, so the strip never shows it.
const avatarInPlay = computed(() =>
  Object.entries(state.zones).some(
    ([zone, ids]) =>
      zone.startsWith('cell:') &&
      ids.some((id) => state.cards[id]?.avatar && state.cards[id]?.enemy)
  )
)

// ...unless the puzzle puts something there: then the opponent's hand,
// cemetery or collection is part of what the solver needs to read, so a play
// session opens with the drawer down. Keyed on the puzzle too, so loading
// another one while already in play re-decides.
watch(
  () => [state.mode, state.puzzleId],
  ([mode]) => {
    if (mode !== 'play') return
    open.value = ['hand:opponent', 'grave:opponent', 'collection:opponent'].some(
      (z) => count(z) > 0
    )
  },
  { immediate: true }
)
</script>

<template>
  <section class="opp-strip" aria-label="Opponent">
    <div class="opp-id">
      <span class="opp-name">Opponent</span>
      <span class="opp-sub">{{ avatarInPlay ? 'Avatar on the board' : 'No avatar on the board' }}</span>
    </div>

    <div class="opp-stats">
      <StatsBar side="opponent" variant="strip" />
    </div>

    <button
      class="opp-piles"
      :aria-expanded="open"
      aria-controls="opp-drawer"
      :title="open ? 'Hide the opponent zones' : 'Show the opponent zones'"
      @click="open = !open"
    >
      <span class="sr-only">Opponent zones:</span>
      <span v-for="[zone, label, faceUp] in piles" :key="zone" class="opp-pile">
        <span class="pile-glyph" :class="pileLook(zone, faceUp)" aria-hidden="true" />
        <span class="pile-text">
          <span class="pile-label">{{ label }}</span>
          <span class="pile-count" :class="{ 'is-empty': !count(zone) }">{{ count(zone) }}</span>
        </span>
      </span>
      <span class="opp-caret" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>

    <div
      v-show="open"
      id="opp-drawer"
      class="opp-drawer"
      role="region"
      aria-label="Opponent zones"
    >
      <Hand side="opponent" />
    </div>
  </section>
</template>

<style scoped>
/* One row, always: identity | stats (shrinks, scrolls sideways if the editor
   steppers ever outgrow it) | pile counters. */
.opp-strip {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-6);
  height: 64px;
  padding: 0 var(--sp-3) 0 var(--sp-4);
  background: var(--c-panel);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
}

.opp-id {
  display: flex;
  flex-direction: column;
  min-width: 128px;
  line-height: 1.15;
}

.opp-name {
  font-family: var(--font-display);
  font-size: 19px;
  color: var(--c-opp);
}

.opp-sub {
  font-size: var(--fs-xs);
  color: var(--c-muted);
  white-space: nowrap;
}

.opp-stats {
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

/* Layout only: StatsBar (variant="strip") draws its own internals. */
.opp-stats :deep(.stat-card) {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--sp-4);
  margin: 0;
  padding: 0;
  background: none;
  border: 0;
}

.opp-piles {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: 6px 10px;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  color: var(--c-cream);
  font: inherit;
  cursor: pointer;
}

.opp-piles:hover,
.opp-piles[aria-expanded='true'] {
  border-color: var(--c-line-strong);
}

.opp-piles:focus-visible {
  outline: 2px solid var(--c-focus);
  outline-offset: 2px;
}

.opp-pile {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

/* A tiny card: face down in slate for hidden piles, face up in cream for
   public ones, a dashed outline when there's nothing there. A second
   offset edge means more than one card. */
.pile-glyph {
  flex: none;
  width: 22px;
  height: 30px;
  box-sizing: border-box;
  border-radius: 3px;
}

.pile-down {
  background: var(--c-opp-deep);
  border: 1px solid var(--c-opp);
}

.pile-up {
  background: var(--c-cream);
  border: 1px solid var(--c-cream-lo);
}

.pile-down.pile-stack {
  box-shadow: 2px 2px 0 color-mix(in srgb, var(--c-opp-deep) 75%, black);
}

.pile-up.pile-stack {
  box-shadow: 2px 2px 0 var(--c-cream-lo);
}

.pile-empty {
  border: 1px dashed color-mix(in srgb, var(--c-cream) 30%, transparent);
}

.pile-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1;
  gap: 2px;
}

.pile-label {
  font-size: var(--fs-sm);
  color: var(--c-muted-hi);
}

.pile-count {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: lining-nums tabular-nums;
}

.pile-count.is-empty {
  font-weight: 400;
  color: var(--c-muted-lo);
}

.opp-caret {
  color: var(--c-muted);
}

/* Opens over the top of the mat rather than pushing the board down. */
.opp-drawer {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 30;
  max-height: var(--tray-body-h);
  overflow-y: auto;
  padding: var(--sp-2);
  background: var(--c-felt);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
}

.opp-drawer :deep(.hand-row) {
  flex-wrap: nowrap;
}

.opp-drawer :deep(.zone-block) {
  flex: 1 1 auto;
  min-width: auto;
  max-width: none;
  padding: 6px;
}

.opp-drawer :deep(.zone-block:not(:has(.card-token))) {
  flex-grow: 0;
}

.opp-drawer :deep(.hand),
.opp-drawer :deep(.grave) {
  padding: 6px;
}

@media (max-width: 1280px) {
  .opp-strip {
    gap: var(--sp-4);
  }

  .opp-piles {
    gap: var(--sp-3);
  }

  /* The stats need the room more than the tiny card glyphs do; each pile
     keeps its word and count (an empty one's "0" is light and muted). */
  .pile-glyph {
    display: none;
  }
}

/* Interim stacked fallback until the phone layout (Phase 2). */
@media (max-width: 1000px) {
  .opp-strip {
    grid-template-columns: auto minmax(0, 1fr);
    height: auto;
    padding-block: var(--sp-2);
  }

  .opp-piles {
    grid-column: 1 / -1;
    flex-wrap: wrap;
  }
}

/* Phone (.mockup/phone.html): identity and stats share the first row (the
   stats scroll sideways inside it); the pile counters wrap as "Hand 3"
   pairs under them, still one button opening the drawer. */
@media (max-width: 700px) {
  .opp-strip {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 4px var(--sp-3);
    padding: 6px var(--sp-2) 6px var(--sp-3);
  }

  .opp-id {
    min-width: 0;
  }

  .opp-name {
    font-size: 17px;
  }

  .opp-stats {
    height: 48px;
  }

  .opp-piles {
    justify-content: flex-start;
    gap: 4px var(--sp-3);
    padding: 4px 6px;
  }

  .pile-text {
    flex-direction: row;
    align-items: baseline;
    gap: 4px;
  }

  .pile-count {
    font-size: var(--fs-sm);
  }

  .opp-caret {
    margin-left: auto;
  }
}
</style>
