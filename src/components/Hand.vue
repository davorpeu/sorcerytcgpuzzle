<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { state, ui } from '../store.js'
import DropZone from './DropZone.vue'
import CardToken from './CardToken.vue'

const props = defineProps({
  side: { type: String, required: true }, // 'player' | 'opponent'
  // 'rows': the hand and every pile as labelled boxes (the opponent drawer).
  // 'fan': the hand alone, held as a fan of cards (the player's tray, which
  // draws the piles itself).
  variant: { type: String, default: 'rows' },
})

const handZone = computed(() => `hand:${props.side}`)
const hand = computed(() => state.zones[handZone.value] || [])

// The fan's geometry. A card's place is its distance from the middle of the
// hand: the further out, the more it turns and the lower it sits, so the hand
// reads as an arc. The step between cards is the card width less a small
// overlap, compressed when the hand outgrows the room so every card still
// shows a sliver you can grab.
const CARD_W = 100
const MIN_STEP = 22
const fanEl = ref(null)
const room = ref(0)
let observer = null
onMounted(() => {
  if (props.variant !== 'fan' || !fanEl.value) return
  const el = fanEl.value.$el ?? fanEl.value
  observer = new ResizeObserver(([entry]) => (room.value = entry.contentRect.width))
  observer.observe(el)
})
onBeforeUnmount(() => observer?.disconnect())

const step = computed(() => {
  const n = hand.value.length
  const natural = CARD_W - 10
  if (n < 2 || !room.value) return natural
  // 40px spare: the outer cards' turn swings their corners past the slot.
  const fit = (room.value - CARD_W - 40) / (n - 1)
  return Math.max(MIN_STEP, Math.min(natural, fit))
})
// Fewer degrees per card as the hand grows, so a big hand stays a gentle arc.
const turn = computed(() => Math.min(6, 30 / Math.max(1, hand.value.length)))

function slotStyle(i) {
  const n = hand.value.length
  const off = i - (n - 1) / 2
  return {
    '--rot': `${(off * turn.value).toFixed(2)}deg`,
    '--drop': `${Math.min(12, off * off * 1.6).toFixed(1)}px`,
    marginLeft: i ? `${step.value - CARD_W}px` : '0',
    zIndex: i + 1,
  }
}
</script>

<template>
  <!-- The player's hand, fanned. Each card sits in a slot that carries the
       fan's turn and drop, so the token itself stays untouched; hovering,
       focusing or selecting a card lifts it out of the fan and straightens it. -->
  <DropZone
    v-if="variant === 'fan'"
    ref="fanEl"
    :zone="handZone"
    class="hand-fan"
    :style="{ '--fan-card-w': `${CARD_W}px` }"
  >
    <!-- No role/aria-label here: DropZone sets its own ("Move here: ...")
         while armed, and attributes passed down would override it. -->
    <div
      v-for="(id, i) in hand"
      :key="id"
      class="fan-slot"
      :class="{ lifted: ui.selected === id }"
      :style="slotStyle(i)"
    >
      <CardToken :card-id="id" :from="handZone" />
    </div>
    <span v-if="!hand.length" class="fan-empty">No cards in hand</span>
  </DropZone>

  <div v-else class="hand-row">
    <div class="zone-block hand-block">
      <div class="zone-title">
        {{ side === 'player' ? 'Your hand' : 'Opponent hand' }}
      </div>
      <DropZone :zone="`hand:${side}`" class="hand">
        <CardToken
          v-for="id in state.zones[`hand:${side}`]"
          :key="id"
          :card-id="id"
          :from="`hand:${side}`"
        />
      </DropZone>
    </div>
    <div class="zone-block grave-block">
      <div class="zone-title">Cemetery</div>
      <DropZone :zone="`grave:${side}`" class="grave">
        <CardToken
          v-for="id in state.zones[`grave:${side}`]"
          :key="id"
          :card-id="id"
          :from="`grave:${side}`"
        />
      </DropZone>
    </div>
    <div class="zone-block grave-block">
      <div class="zone-title">Collection</div>
      <DropZone :zone="`collection:${side}`" class="grave">
        <CardToken
          v-for="id in state.zones[`collection:${side}`]"
          :key="id"
          :card-id="id"
          :from="`collection:${side}`"
        />
      </DropZone>
    </div>
    <div class="zone-block grave-block">
      <div class="zone-title">Banished</div>
      <DropZone :zone="`banished:${side}`" class="grave">
        <CardToken
          v-for="id in state.zones[`banished:${side}`]"
          :key="id"
          :card-id="id"
          :from="`banished:${side}`"
        />
      </DropZone>
    </div>
    <div
      v-if="state.mode === 'editor' || !state.hideAtlas || state.zones[`atlas:${side}`].length"
      class="zone-block grave-block"
    >
      <div class="zone-title">
        Atlas
        <span
          v-if="state.mode === 'editor' && state.hideAtlas && !state.zones[`atlas:${side}`].length"
          class="hidden-tag"
        >Hidden from players</span>
      </div>
      <DropZone :zone="`atlas:${side}`" class="grave">
        <CardToken
          v-for="id in state.zones[`atlas:${side}`]"
          :key="id"
          :card-id="id"
          :from="`atlas:${side}`"
        />
      </DropZone>
    </div>
    <div
      v-if="state.mode === 'editor' || !state.hideSpellbook || state.zones[`spellbook:${side}`].length"
      class="zone-block grave-block"
    >
      <div class="zone-title">
        Spellbook
        <span
          v-if="state.mode === 'editor' && state.hideSpellbook && !state.zones[`spellbook:${side}`].length"
          class="hidden-tag"
        >Hidden from players</span>
      </div>
      <DropZone :zone="`spellbook:${side}`" class="grave">
        <CardToken
          v-for="id in state.zones[`spellbook:${side}`]"
          :key="id"
          :card-id="id"
          :from="`spellbook:${side}`"
        />
      </DropZone>
    </div>
  </div>
</template>

<style scoped>
/* Editor: an empty deck the puzzle hides from players still takes drops;
   the tag says players won't see it (dashed, not colour alone). */
.hidden-tag {
  margin-left: 6px;
  padding: 0 6px;
  border: 1px dashed var(--c-muted-2);
  border-radius: var(--r-pill);
  font-family: var(--font-ui);
  font-size: var(--fs-xs);
  color: var(--c-muted);
}

/* The fan fills the middle of the tray and holds its cards along the bottom
   edge, centred. The slots overlap through negative margins (set per card),
   so a hand of any size stays one row. */
.hand-fan {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  height: 100%;
  min-width: 0;
  padding: 0 var(--sp-2) var(--sp-1);
  border-radius: var(--r-lg);
}

.fan-slot {
  position: relative;
  flex: none;
  transform-origin: 50% 120%;
  transform: translateY(var(--drop)) rotate(var(--rot));
}

.fan-slot :deep(.card-token) {
  --card-w: var(--fan-card-w);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
}

/* Out of the fan: straight, raised, and above its neighbours. */
.fan-slot:hover,
.fan-slot:focus-within,
.fan-slot.lifted {
  z-index: 50 !important;
  transform: translateY(-22px) rotate(0deg);
}

@media (prefers-reduced-motion: no-preference) {
  .fan-slot {
    transition: transform 160ms ease;
  }
}

.fan-empty {
  align-self: center;
  color: var(--c-muted-lo);
  font-size: var(--fs-sm);
}
</style>
