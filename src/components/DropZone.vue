<script setup>
import { computed, ref } from 'vue'
import {
  moveCard,
  ui,
  state,
  zoneOf,
  zoneLabel,
  armedMoveLegal,
  activeGridPick,
  canPickGridSquare,
  pickGridSquare,
  activeStoryGridPick,
  canStoryPickSquare,
  pickStorySquare,
  destPickArmed,
  canPickAnyDest,
  pickAnyDest,
  spellCastable,
  canCast,
  castByDrop,
  playerControls,
  castControlled,
} from '../store.js'

const props = defineProps({
  zone: { type: String, required: true },
  // Whether this zone is a keyboard stop while it is armed. Squares stack
  // three zones on top of each other (site slot, surface, below) and every
  // one of them would be a Tab stop, so the board offers only the surface
  // zone to the keyboard: moveCard routes a site card dropped there into the
  // site slot anyway, and "send below" is a button on the action bar.
  keyboard: { type: Boolean, default: true },
})
const over = ref(false)

// A zone is "armed" while a card is selected: clicking it moves that card
// here. This is the touch-friendly counterpart to dragging, and the only way
// to play on a tablet, where HTML5 drag-and-drop does not fire at all.
const armed = computed(() => !!ui.selected && !ui.attacker && !ui.striker)

// While a Move is armed under enforcement, mark whether this zone is reachable.
// null means no highlight (not moving, or free-form puzzle).
const moveLegal = computed(() => armedMoveLegal(props.zone))

// While a grid-target ability is armed, this zone's square may be a legal pick.
const square = computed(() => {
  const m = /^cell:(\d+):/.exec(props.zone)
  return m ? Number(m[1]) : null
})
const gridPickable = computed(
  () =>
    square.value != null &&
    ((!!activeGridPick() && canPickGridSquare(square.value)) ||
      (!!activeStoryGridPick() && canStoryPickSquare(square.value)) ||
      canPickAnyDest(props.zone))
)

// Only armed zones are reachable by keyboard. Twenty squares plus the hands
// and cemeteries would otherwise sit in the Tab order permanently, ahead of
// every real control, and do nothing when activated.
const tabbable = computed(() => armed.value && props.keyboard)

// A spell dragged/clicked from a castable source into play is cast at the drop
// location (a magic targets what's there; a permanent enters the realm), not
// moved. The source is the hand, or the cemetery for a card that grants it --
// spellCastable decides. In the editor it is false, so setting up a puzzle still
// just places cards. An unaffordable spell does nothing rather than moving in
// for free.
function castOrMove(cardId, from, zone) {
  // In play mode the solver drives only their own side: an opponent's cards
  // (a spell in their hand, a unit of theirs on the board) can't be cast or
  // moved by dragging/clicking. The puzzle moves the opponent automatically.
  // A spell is gated by who casts it, which can be the solver even for an
  // opponent's card (out of a swapped cemetery, or by a cast permit).
  if (spellCastable(cardId)) {
    if (castControlled(cardId) && canCast(cardId)) castByDrop(cardId, zone)
    return
  }
  if (!playerControls(cardId)) return
  moveCard(cardId, from, zone)
}

function onDrop(e) {
  over.value = false
  try {
    const d = JSON.parse(e.dataTransfer.getData('text/plain'))
    if (d && d.cardId) castOrMove(d.cardId, d.from, props.zone)
  } catch {
    /* not a card drag */
  }
}

function onClick() {
  // A destination pick (teleport / token placement) takes the click. This zone
  // is one exact location: the surface band or the below band of a square.
  if (destPickArmed()) {
    if (canPickAnyDest(props.zone)) pickAnyDest(props.zone)
    return
  }
  // A paused trigger picking a grid square takes the click.
  if (activeStoryGridPick()) {
    if (canStoryPickSquare(square.value)) pickStorySquare(square.value)
    return
  }
  // A grid-target ability being aimed takes the click as a square pick.
  if (activeGridPick()) {
    if (gridPickable.value) pickGridSquare(square.value)
    return
  }
  if (!armed.value) return
  const from = zoneOf(ui.selected)
  if (from) castOrMove(ui.selected, from, props.zone)
}
</script>

<template>
  <div
    class="dropzone"
    :class="{ over, armed, reachable: moveLegal === true, unreachable: moveLegal === false, 'grid-pick': gridPickable }"
    :role="tabbable ? 'button' : null"
    :tabindex="tabbable ? 0 : null"
    :aria-label="tabbable ? `Move here: ${zoneLabel(zone)}` : null"
    @dragover.prevent="over = true"
    @dragleave="over = false"
    @drop.prevent="onDrop"
    @click="onClick"
    @keydown.enter.prevent="onClick"
    @keydown.space.prevent="onClick"
  >
    <slot />
  </div>
</template>

<style scoped>
/* Reachability hints while a Move is armed under enforcement. */
.dropzone.reachable {
  box-shadow: inset 0 0 0 2px rgba(80, 200, 120, 0.8);
}
.dropzone.unreachable {
  opacity: 0.55;
}
.dropzone.grid-pick {
  box-shadow: inset 0 0 0 2px rgba(200, 120, 255, 0.85);
  cursor: pointer;
}
@media (prefers-reduced-motion: no-preference) {
  .dropzone.grid-pick {
    animation: grid-pick-pulse 1.1s ease-in-out infinite;
  }
}
@keyframes grid-pick-pulse {
  0%,
  100% {
    box-shadow: inset 0 0 0 2px rgba(200, 120, 255, 0.5);
  }
  50% {
    box-shadow: inset 0 0 0 3px rgba(200, 120, 255, 1),
      0 0 10px 2px rgba(200, 120, 255, 0.6);
  }
}
</style>
