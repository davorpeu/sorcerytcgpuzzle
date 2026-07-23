<script setup>
import { computed } from 'vue'
import {
  state,
  ui,
  removeCard,
  toggleSite,
  toggleAura,
  toggleControl,
  toggleUnderOver,
  beginAttack,
  targetAttack,
  setDragGhost,
} from '../store.js'

const props = defineProps({
  cardId: { type: String, required: true },
  from: { type: String, required: true },
  removable: { type: Boolean, default: false },
})

const card = computed(() => state.cards[props.cardId])
const onBoard = computed(() => /^cell:\d+:(top|bot)$/.test(props.from))
const isUnder = computed(() => props.from.endsWith(':bot'))
// Attacks only make sense while actions are being logged.
const logging = computed(() => state.mode === 'play' || state.recording)
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

function onClick() {
  if (targetable.value) targetAttack(props.cardId)
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
      targetable,
    }"
    draggable="true"
    :title="card.name + ' (hold Alt to enlarge)'"
    @dragstart="onDragStart"
    @click="onClick"
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
    <button
      v-if="removable && state.mode === 'editor' && !state.recording"
      class="card-remove"
      title="Remove card"
      @click.stop="removeCard(cardId)"
    >
      ×
    </button>
    <button
      v-if="removable && state.mode === 'editor' && !state.recording"
      class="card-site-toggle"
      :class="{ on: card.site }"
      :title="card.site ? 'Site card (click to make a regular card)' : 'Regular card (click to make a site)'"
      @click.stop="toggleSite(cardId)"
    >
      ⛰
    </button>
    <button
      v-if="removable && state.mode === 'editor' && !state.recording"
      class="card-aura-toggle"
      :class="{ on: card.aura }"
      :title="card.aura ? 'Aura card (click to make a regular card)' : 'Regular card (click to make an aura)'"
      @click.stop="toggleAura(cardId)"
    >
      ✦
    </button>
    <button
      v-if="state.mode === 'editor' && !state.recording"
      class="card-control-toggle"
      :class="{ on: card.enemy }"
      :title="card.enemy ? 'Opponent controls this card (click to give to player)' : 'Player controls this card (click to give to opponent)'"
      @click.stop="toggleControl(cardId)"
    >
      ⇅
    </button>
    <button
      v-if="onBoard"
      class="card-under-toggle"
      :title="isUnder ? 'Bring to the surface' : 'Send underground'"
      @click.stop="toggleUnderOver(cardId, from)"
    >
      {{ isUnder ? '↥' : '↧' }}
    </button>
    <button
      v-if="onBoard && logging"
      class="card-attack"
      :class="{ on: ui.attacker === cardId }"
      :title="
        ui.attacker === cardId
          ? 'Cancel attack'
          : 'Attack: click this, then click a unit or site'
      "
      @click.stop="beginAttack(cardId)"
    >
      ⚔
    </button>
    <span v-if="card.site" class="site-badge">SITE</span>
    <span v-if="card.aura" class="site-badge aura-badge">AURA</span>
    <span v-if="isUnder" class="site-badge under-badge">BELOW</span>
  </div>
</template>
