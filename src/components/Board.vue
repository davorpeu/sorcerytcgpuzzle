<script setup>
import {
  state,
  ui,
  targetAttack,
  toggleControl,
  setDragGhost,
  GRID_SIZE,
  GRID_COLS,
  GRID_ROWS,
  INTERSECTIONS,
  INTERSECTION_COLS,
} from '../store.js'
import DropZone from './DropZone.vue'
import CardToken from './CardToken.vue'

function siteCard(idx) {
  const id = state.zones[`site:${idx}`][0]
  return id ? state.cards[id] : null
}

function dragSite(e, idx) {
  const card = siteCard(idx)
  if (!card) return
  e.dataTransfer.setData(
    'text/plain',
    JSON.stringify({ cardId: card.id, from: `site:${idx}` })
  )
  e.dataTransfer.effectAllowed = 'move'
  setDragGhost(e, e.currentTarget, 130)
}

function auraCard(idx) {
  const id = state.zones[`aura:${idx}`][0]
  return id ? state.cards[id] : null
}

function dragAura(e, idx) {
  const card = auraCard(idx)
  if (!card) return
  e.dataTransfer.setData(
    'text/plain',
    JSON.stringify({ cardId: card.id, from: `aura:${idx}` })
  )
  e.dataTransfer.effectAllowed = 'move'
  setDragGhost(e, e.currentTarget.querySelector('img'))
}

function clickSite(idx) {
  const card = siteCard(idx)
  if (card && ui.attacker) targetAttack(card.id)
}

// Position each intersection node on the grid line crossing it marks.
function nodeStyle(idx) {
  const row = Math.floor(idx / INTERSECTION_COLS)
  const col = idx % INTERSECTION_COLS
  return {
    left: `${((col + 1) / GRID_COLS) * 100}%`,
    top: `${((row + 1) / GRID_ROWS) * 100}%`,
  }
}
</script>

<template>
  <div class="board">
    <div class="board-grid">
      <div v-for="n in GRID_SIZE" :key="n" class="cell">
        <!-- The site card itself is the drag/click surface for moving it;
             the ⇅ toggle flips control, and opponent-controlled sites
             render upside down against the top edge, mirroring the mat. -->
        <DropZone :zone="`site:${n - 1}`" class="site-strip">
          <img
            v-if="siteCard(n - 1) && siteCard(n - 1).img"
            class="site-bg"
            :class="{
              flipped: siteCard(n - 1).enemy,
              targetable: ui.attacker && ui.attacker !== siteCard(n - 1).id,
            }"
            :src="siteCard(n - 1).img"
            :alt="siteCard(n - 1).name"
            draggable="true"
            :title="siteCard(n - 1).name + ' (drag to move site, hold Alt to enlarge)'"
            @dragstart="dragSite($event, n - 1)"
            @click="clickSite(n - 1)"
            @mouseenter="ui.hoverCard = siteCard(n - 1).id"
            @mouseleave="ui.hoverCard = null"
          />
        </DropZone>
        <!-- Surface and underground cards render side by side in the top
             area; underground ones are darkened and badged instead of
             living in the bottom band. -->
        <DropZone :zone="`cell:${n - 1}:top`" class="cell-half top">
          <CardToken
            v-for="id in state.zones[`cell:${n - 1}:top`]"
            :key="id"
            :card-id="id"
            :from="`cell:${n - 1}:top`"
          />
          <CardToken
            v-for="id in state.zones[`cell:${n - 1}:bot`]"
            :key="id"
            :card-id="id"
            :from="`cell:${n - 1}:bot`"
          />
        </DropZone>
        <!-- Drop-only band: cards dropped here go underground but are
             displayed in the top area with the BELOW mark. -->
        <DropZone :zone="`cell:${n - 1}:bot`" class="cell-half bot" />
        <button
          v-if="siteCard(n - 1) && state.mode === 'editor' && !state.recording"
          class="site-control-toggle"
          :class="{ on: siteCard(n - 1).enemy }"
          :title="siteCard(n - 1).enemy ? 'Opponent controls this site (click to give to player)' : 'Player controls this site (click to give to opponent)'"
          @click.stop="toggleControl(siteCard(n - 1).id)"
        >
          ⇅
        </button>
      </div>
    </div>
    <div class="intersections">
      <DropZone
        v-for="n in INTERSECTIONS"
        :key="n"
        :zone="`aura:${n - 1}`"
        class="aura-node"
        :class="{ occupied: auraCard(n - 1) }"
        :style="nodeStyle(n - 1)"
      >
        <div
          v-if="auraCard(n - 1)"
          class="aura-token"
          draggable="true"
          :title="auraCard(n - 1).name + ' (drag to move aura, hold Alt to enlarge)'"
          @dragstart="dragAura($event, n - 1)"
          @mouseenter="ui.hoverCard = auraCard(n - 1).id"
          @mouseleave="ui.hoverCard = null"
        >
          <img
            v-if="auraCard(n - 1).img"
            :src="auraCard(n - 1).img"
            :alt="auraCard(n - 1).name"
            :class="{ flipped: auraCard(n - 1).enemy }"
            draggable="false"
          />
          <span v-else class="aura-name">{{ auraCard(n - 1).name }}</span>
        </div>
      </DropZone>
    </div>
  </div>
</template>
