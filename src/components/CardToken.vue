<script setup>
import { computed } from 'vue'
import { state, ui, selectCard, targetAttack, setDragGhost } from '../store.js'

const props = defineProps({
  cardId: { type: String, required: true },
  from: { type: String, required: true },
})

const card = computed(() => state.cards[props.cardId])
const isUnder = computed(() => props.from.endsWith(':bot'))
const onBoard = computed(() => /^cell:\d+:(top|bot)$/.test(props.from))
const targetable = computed(
  () => ui.attacker && ui.attacker !== props.cardId && onBoard.value
)

function onDragStart(e) {
  e.dataTransfer.setData(
    'text/plain',
    JSON.stringify({ cardId: props.cardId, from: props.from })
  )
  e.dataTransfer.effectAllowed = 'move'
  setDragGhost(e, e.currentTarget.querySelector('img'))
}

// A click either lands an armed attack or selects the card, which is what
// puts its actions in the bar above the storyline. The click must not reach
// the zone underneath, or selecting would immediately move the card.
function onClick() {
  if (targetable.value) targetAttack(props.cardId)
  else selectCard(props.cardId)
}
</script>

<template>
  <div
    v-if="card"
    class="card-token"
    :class="{
      'is-site': card.site,
      'is-under': isUnder,
      attacker: ui.attacker === cardId,
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
    <span v-if="card.site" class="site-badge">SITE</span>
    <span v-if="card.aura" class="site-badge aura-badge">AURA</span>
    <span v-if="isUnder" class="site-badge under-badge">BELOW</span>
  </div>
</template>
