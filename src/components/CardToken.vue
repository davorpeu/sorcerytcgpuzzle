<script setup>
import { computed } from 'vue'
import {
  state,
  ui,
  isTapped,
  selectCard,
  targetAttack,
  targetStrike,
  targetPickup,
  carriedBy,
  beginDrag,
  moveCard,
  zoneOf,
} from '../store.js'

const props = defineProps({
  cardId: { type: String, required: true },
  from: { type: String, required: true },
})

const card = computed(() => state.cards[props.cardId])
const isUnder = computed(() => props.from.endsWith(':bot'))
const onBoard = computed(() => /^cell:\d+:(top|bot)$/.test(props.from))
const tapped = computed(() => isTapped(props.cardId))
const targetable = computed(
  () =>
    ((ui.attacker && ui.attacker !== props.cardId) ||
      (ui.striker && ui.striker !== props.cardId)) &&
    onBoard.value
)
// Anything but the armed carrier itself can be picked up, wherever it sits --
// a card in hand is as liftable as one on the board.
const liftable = computed(() => ui.carrier && ui.carrier !== props.cardId)
const carried = computed(() => carriedBy(props.cardId))
// Only the formal Move action makes a click on a unit mean "move here". A
// plain selection leaves other units clickable to select instead, so you can
// switch between cards without moving. So clicking a unit standing in a square
// sends the moving card onto that square -- the same as clicking the bare felt
// or the site there -- rather than reselecting the card under the pointer.
// Only board squares are destinations; tokens in a hand or cemetery still
// select. Tokens live in the surface band, so that is where the move lands;
// the below band is a separate strip of its own that catches its own clicks.
const moveArmed = computed(
  () => ui.moving && ui.moving !== props.cardId && onBoard.value
)

// What a screen reader hears. The badges printed on the face -- unit, site,
// tapped, below, whose card it is -- are all colour and glyph, so they have
// to be said out loud here or they do not exist. The trailing clause is what
// pressing the button will actually do, which changes with what is armed.
const label = computed(() => {
  const c = card.value
  if (!c) return ''
  const bits = [c.name]
  if (c.avatar) bits.push('avatar')
  else if (c.unit) bits.push('minion')
  if (c.site) bits.push('site')
  if (c.aura) bits.push('aura')
  bits.push(c.enemy ? "opponent's" : 'yours')
  if (isUnder.value) bits.push('below')
  if (tapped.value) bits.push('tapped')
  if (carried.value.length) bits.push(`carrying ${carried.value.length}`)
  const what = bits.join(', ')
  if (targetable.value) return `${what}. Target of the armed action`
  if (liftable.value) return `${what}. Pick up`
  if (ui.selected === props.cardId) return `${what}. Selected — activate to deselect`
  return `${what}. Select for actions`
})

function onDragStart(e) {
  e.dataTransfer.setData(
    'text/plain',
    JSON.stringify({ cardId: props.cardId, from: props.from })
  )
  e.dataTransfer.effectAllowed = 'move'
  beginDrag(e, e.currentTarget.querySelector('img'))
}

// A click either lands an armed attack/strike or selects the card, which is what
// puts its actions in the bar above the storyline. The click must not reach
// the zone underneath, or selecting would immediately move the card.
function onClick() {
  if (targetable.value) {
    if (ui.attacker) targetAttack(props.cardId)
    else if (ui.striker) targetStrike(props.cardId)
    return
  }
  // An armed pick-up lands here too, or the highlight would be a lie: this is
  // the only click surface for cards on the board and in hand, and sites and
  // auras already lift this way from Board.vue.
  if (liftable.value) {
    targetPickup(props.cardId)
    return
  }
  // A click on a unit while the Move action is armed drops the moving card
  // onto this unit's square (surface band) instead of reselecting.
  if (moveArmed.value) {
    const m = props.from.match(/^cell:(\d+):(top|bot)$/)
    const from = zoneOf(ui.moving)
    if (m && from) {
      moveCard(ui.moving, from, `cell:${m[1]}:top`)
      return
    }
  }
  selectCard(props.cardId)
}
</script>

<template>
  <div
    v-if="card"
    class="card-token"
    :class="{
      'is-site': card.site,
      'is-aura': card.aura,
      'is-unit': card.unit,
      'is-avatar': card.avatar,
      'is-tapped': tapped,
      'is-under': isUnder,
      attacker: ui.attacker === cardId,
      carrier: ui.carrier === cardId,
      striker: ui.striker === cardId,
      selected: ui.selected === cardId,
      targetable,
      liftable,
      carrying: carried.length > 0,
    }"
    :style="carried.length ? { '--carry-n': carried.length } : null"
    draggable="true"
    role="button"
    tabindex="0"
    :aria-pressed="ui.selected === cardId"
    :aria-label="label"
    :title="card.name + ' (click for actions, hold Alt to enlarge)'"
    @dragstart="onDragStart"
    @click.stop="onClick"
    @keydown.enter.stop.prevent="onClick"
    @keydown.space.stop.prevent="onClick"
    @mouseenter="ui.hoverCard = cardId"
    @mouseleave="ui.hoverCard === cardId && (ui.hoverCard = null)"
    @focus="ui.hoverCard = cardId"
    @blur="ui.hoverCard === cardId && (ui.hoverCard = null)"
  >
    <!-- The button above carries the name and every badge as its label, so
         the artwork is decorative here; a real alt would say the name twice. -->
    <img
      v-if="card.img"
      :src="card.img"
      alt=""
      :class="{ flipped: card.enemy }"
      draggable="false"
    />
    <span v-else class="card-name" :class="{ flipped: card.enemy }">
      {{ card.name }}
    </span>
    <!-- Card type reads from the coloured ring around the art (see the type
         border rules in the stylesheet), not a text badge. -->
    <span v-if="isUnder" class="site-badge under-badge">BELOW</span>

    <!-- What this card is holding. A carried card is in no zone, so this is the
         only place it is drawn: at the holder's own size, fanned down and to
         the right so every face stays readable, inside one dashed frame that
         says the pile travels as a unit. Clicking one selects it, which is how
         you reach its Drop button. `--i` is the position in the fan; the shift
         is a share of the card's own size, so the pile scales with the token
         wherever it is drawn. -->
    <div v-if="carried.length" class="carry-stack">
      <span class="carry-frame" aria-hidden="true"></span>
      <button
        v-for="(id, i) in carried"
        :key="id"
        class="carry-chip"
        :class="{ selected: ui.selected === id }"
        :style="{ '--i': i + 1 }"
        :title="`Carrying ${state.cards[id]?.name} — click to select it`"
        @click.stop="selectCard(id)"
        @mouseenter="ui.hoverCard = id"
        @mouseleave="ui.hoverCard === id && (ui.hoverCard = null)"
      >
        <img
          v-if="state.cards[id]?.img"
          :src="state.cards[id].img"
          :alt="state.cards[id].name"
          draggable="false"
        />
        <span v-else class="carry-chip-name">{{ state.cards[id]?.name }}</span>
      </button>
    </div>
  </div>
</template>
