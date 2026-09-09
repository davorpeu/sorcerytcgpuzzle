<script setup>
import { computed } from 'vue'
import {
  state,
  ui,
  isTapped,
  selectCard,
  targetAttack,
  targetStrike,
  setDragGhost,
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

function onDragStart(e) {
  e.dataTransfer.setData(
    'text/plain',
    JSON.stringify({ cardId: props.cardId, from: props.from })
  )
  e.dataTransfer.effectAllowed = 'move'
  setDragGhost(e, e.currentTarget.querySelector('img'))
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
      striker: ui.striker === cardId,
      selected: ui.selected === cardId,
      targetable,
    }"
    draggable="true"
    :title="card.name + ' (click for actions, hold Alt to enlarge)'"
    @dragstart="onDragStart"
    @click.stop="onClick"
    @mouseenter="ui.hoverCard = cardId"
    @mouseleave="ui.hoverCard === cardId && (ui.hoverCard = null)"
  >
    <img
      v-if="card.img"
      :src="card.img"
      :alt="card.name"
      :class="{ flipped: card.enemy }"
      draggable="false"
    />
    <span v-else class="card-name" :class="{ flipped: card.enemy }">
      {{ card.name }}
    </span>
    <span v-if="card.avatar" class="site-badge avatar-badge">AVATAR</span>
    <span v-else-if="card.unit" class="site-badge unit-badge">UNIT</span>
    <span v-if="card.site" class="site-badge">SITE</span>
    <span v-if="card.aura" class="site-badge aura-badge">AURA</span>
    <span v-if="isUnder" class="site-badge under-badge">BELOW</span>
    <span v-if="tapped" class="site-badge tap-badge">TAP</span>
  </div>
</template>
