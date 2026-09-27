<script setup>
import { computed, ref, watch } from 'vue'
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
  manualMoveAllowed,
  attackCrossingPickable,
  pickAttackCrossing,
} from '../store.js'

const props = defineProps({
  zone: { type: String, required: true },
  // Whether this zone is a keyboard stop while it is armed. Squares stack
  // three zones on top of each other (site slot, surface, below) and every
  // one of them would be a Tab stop, so the board offers only the surface
  // zone to the keyboard: moveCard routes a site card dropped there into the
  // site slot anyway, and a mouse can drop onto a square's lower band to go below.
  keyboard: { type: Boolean, default: true },
})
const over = ref(false)

// Whether this zone turns the card away outright: while solving, a manual move
// must end in the realm, so hands, cemeteries and the other off-board zones
// refuse every card, and a realm card is refused everywhere unless its Move
// action is armed (moveCard enforces it; this just keeps the zone from
// advertising a move that would do nothing). A castable spell is cast, not
// moved, so the realm never refuses it -- but a pile or hand can't take a
// cast (castByDrop would silently do nothing), so off-board zones refuse it,
// all but the storyline for a magic.
function refuses(cardId) {
  if (!cardId) return false
  if (spellCastable(cardId)) return castOffBoard(cardId)
  return !manualMoveAllowed(cardId, props.zone)
}
function castOffBoard(cardId) {
  if (!offBoard.value) return false
  return !(props.zone === 'storyline' && state.cards[cardId]?.magic)
}

// A zone is "armed" while a card is selected: clicking it moves that card
// here. This is the touch-friendly counterpart to dragging, and the only way
// to play on a tablet, where HTML5 drag-and-drop does not fire at all.
const armed = computed(
  () => !!ui.selected && !ui.attacker && !ui.striker && !refuses(ui.selected)
)

// Not cancelling dragover is what tells the browser the drop is not allowed
// (no-drop cursor, and no drop event). A refused off-board zone still notes the
// hover, so it can say why instead of silently ignoring the drop.
const refusedOver = ref(false)
function onDragOver(e) {
  if (refuses(ui.dragCard)) {
    refusedOver.value = true
    return
  }
  e.preventDefault()
  over.value = true
}
function onDragLeave() {
  over.value = false
  refusedOver.value = false
}
// A drag can end without a dragleave here (dropped elsewhere, Esc), so clear
// the hover when it ends rather than leave a stale cue behind.
watch(
  () => ui.dragCard,
  (id) => {
    if (!id) onDragLeave()
  }
)

// Off-board zones (hands, cemeteries, collections, the storyline, ...) answer a
// drag themselves: gold while they will take the card, red with a reason while
// they refuse it. Squares and crossings are cued by Board instead. The zone the
// card is leaving stays quiet -- dropping it back does nothing.
const offBoard = computed(() => !/^(cell|site|aura):/.test(props.zone))
const dragCue = computed(() => {
  const id = ui.dragCard
  if (!id || !offBoard.value || zoneOf(id) === props.zone) return null
  return refuses(id) ? 'refuse' : 'accept'
})
// The reason mirrors manualMoveAllowed: an armed Move only steps through the
// realm, and while solving every manual move must end there. Unlike the
// outline, the reason shows on squares too -- but only on the hovered zone
// (refusedOver), never on the zone the card is leaving.
const refuseReason = computed(() => {
  const id = ui.dragCard
  if (!id || zoneOf(id) === props.zone || !refuses(id)) return ''
  if (spellCastable(id)) return 'Cast it onto the realm'
  if (!offBoard.value && ui.moving !== id && state.mode === 'play')
    return 'Arm Move to move this card'
  if (ui.moving === ui.dragCard) return 'A move stays in the realm'
  if (state.mode === 'play') return 'Only realm moves count while solving'
  return 'Can’t go here'
})

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

// While an oversized unit's attack is armed, a crossing it can step to is a
// pick for where it attacks from; `chosen` marks the one picked.
const crossing = computed(() => {
  const m = /^aura:(\d+)$/.exec(props.zone)
  return m ? Number(m[1]) : null
})
const crossingPick = computed(
  () => crossing.value != null && attackCrossingPickable(crossing.value)
)
const crossingChosen = computed(
  () => crossing.value != null && ui.attackCrossing === crossing.value
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
// for free. (castOffBoard above keeps piles from advertising such a drop.)
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
  // An oversized attacker's crossing: picked here, before or after the target.
  if (crossing.value != null && ui.attacker) {
    if (crossingPick.value) pickAttackCrossing(crossing.value)
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
    :class="{ over, armed, reachable: moveLegal === true, unreachable: moveLegal === false, 'grid-pick': gridPickable, 'crossing-pick': crossingPick, 'crossing-chosen': crossingChosen, 'drag-accept': dragCue === 'accept', 'drag-refuse': dragCue === 'refuse', 'refused-over': refusedOver && !!refuseReason }"
    :role="tabbable ? 'button' : null"
    :tabindex="tabbable ? 0 : null"
    :aria-label="tabbable ? `Move here: ${zoneLabel(zone)}` : null"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
    @click="onClick"
    @keydown.enter.prevent="onClick"
    @keydown.space.prevent="onClick"
  >
    <slot />
    <span v-if="refusedOver && refuseReason" class="refuse-reason" role="status">{{ refuseReason }}</span>
    <span v-else-if="over && dragCue === 'accept'" class="accept-label" aria-hidden="true">Drop in {{ zoneLabel(zone) }}</span>
  </div>
</template>

<style scoped>
/* Reachability hints while a Move is armed under enforcement. A board square
   is cued as a whole by Board (squareCue), so only the other zones -- the
   crossings an oversized unit steps between -- mark themselves here. */
.dropzone.reachable:not(.cell-half) {
  box-shadow: inset 0 0 0 2px rgba(80, 200, 120, 0.8);
}
.dropzone.unreachable:not(.cell-half) {
  opacity: 0.55;
}
/* Drag cues on off-board zones (hands, piles, storyline). Line style carries
   the state as well as colour: dashed gold takes the drop, dashed red refuses
   it, and a refusal says why on the hovered zone only (decision 4). */
.dropzone.drag-accept {
  position: relative;
  outline: 2px dashed var(--c-gold);
  outline-offset: -2px;
  background-color: var(--c-gold-bg);
}
.dropzone.drag-accept.over {
  outline-style: solid;
  box-shadow: 0 0 0 3px var(--c-gold), var(--shadow-pop);
  transform: translateY(-4px);
}
@media (prefers-reduced-motion: no-preference) {
  .dropzone.drag-accept {
    transition: transform 0.12s ease, box-shadow 0.12s ease;
  }
}
@media (prefers-reduced-motion: reduce) {
  .dropzone.drag-accept.over {
    transform: none;
  }
}
.dropzone.drag-refuse {
  position: relative;
  outline: 2px dashed var(--c-danger);
  outline-offset: -2px;
  background-color: var(--c-danger-bg);
}
/* Square halves are cued as a whole by Board; here only the hovered half
   answers: solid gold while it takes the card, red dashed with the reason
   while it refuses it. The frame is a pseudo-element because the site art
   (z-index 2) covers the band itself; .cell-half opens no stacking context,
   so z-index 3 lifts the frame over the art and under the cards (4). */
.dropzone.cell-half.over::before,
.dropzone.cell-half.refused-over::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 3;
  border-radius: var(--r-sm);
  pointer-events: none;
}
.dropzone.cell-half.over {
  outline: none;
}
.dropzone.cell-half.over::before {
  border: 2px solid var(--c-gold);
  background: var(--c-gold-bg);
}
.dropzone.cell-half .refuse-reason {
  inset: 2px; /* leave the dashed frame showing */
}
.dropzone.cell-half.refused-over::before {
  border: 2px dashed var(--c-danger);
  background: var(--c-danger-bg);
}
.refuse-reason,
.accept-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-1);
  border-radius: inherit;
  font-family: var(--font-ui);
  font-size: var(--fs-xs);
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
  pointer-events: none;
  z-index: 5;
}
.refuse-reason {
  background: color-mix(in srgb, var(--c-felt-deep) 85%, transparent);
  color: var(--c-danger-soft);
}
.accept-label {
  background: color-mix(in srgb, var(--c-felt-deep) 70%, transparent);
  color: var(--c-gold);
}
.dropzone.grid-pick {
  box-shadow: inset 0 0 0 2px rgba(200, 120, 255, 0.85);
  cursor: pointer;
}
.dropzone.crossing-pick {
  box-shadow: 0 0 0 3px rgba(255, 170, 60, 0.9);
  cursor: pointer;
}
.dropzone.crossing-chosen {
  box-shadow: 0 0 0 4px rgba(255, 90, 60, 1), 0 0 12px 3px rgba(255, 90, 60, 0.6);
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
