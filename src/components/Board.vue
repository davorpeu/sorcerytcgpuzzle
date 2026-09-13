<script setup>
import { computed } from 'vue'
import {
  state,
  ui,
  targetAttack,
  targetPickup,
  targetStrike,
  armedAttackLegal,
  selectCard,
  carriedBy,
  beginDrag,
  moveCard,
  zoneOf,
  zoneLabel,
  regionOf,
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
  beginDrag(e, e.currentTarget, 130)
}

// How many cards are standing in a square. Both slots are drawn in the top
// band, so they share its width and the band has to know how many ways.
const occupants = (idx) =>
  state.zones[`cell:${idx}:top`].length + state.zones[`cell:${idx}:bot`].length

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
  beginDrag(e, e.currentTarget.querySelector('img'))
}

// Sites and auras select the same way board cards do; their actions then
// appear in the bar above the storyline.
//
// The art is on top of the square's zones, because it has to be hoverable and
// draggable whatever else is going on -- clicking a site selects it, and if the
// zones covered the art from then on you could no longer Alt-preview or drag
// the very card you had just picked. So a click that was meant for the zone
// underneath arrives here instead, and is handed back down: the band actually
// under the pointer decides surface or below, which keeps the 74/26 split in
// the stylesheet rather than restating it here.
function clickSite(idx, e) {
  const card = siteCard(idx)
  // Only the formal Move action turns a click anywhere on the square -- bare
  // felt, the site art, or a unit standing here -- into a move; moveCard taps
  // the moving unit because ui.moving is set. A plain selection leaves the
  // site clickable to select (the else branch) so you can switch between
  // pieces without moving. The band under the pointer picks surface vs below.
  if (ui.moving && (!card || ui.moving !== card.id)) {
    const band = document
      .elementsFromPoint(e.clientX, e.clientY)
      .find((el) => el.classList && el.classList.contains('cell-half'))
    const to = band && band.classList.contains('bot')
      ? `cell:${idx}:bot`
      : `cell:${idx}:top`
    const from = zoneOf(ui.moving)
    if (from) moveCard(ui.moving, from, to)
    return
  }
  if (!card) return
  if (ui.attacker && ui.attacker !== card.id) targetAttack(card.id)
  else if (ui.carrier && ui.carrier !== card.id) targetPickup(card.id)
  else if (ui.striker && ui.striker !== card.id) targetStrike(card.id)
  else selectCard(card.id)
}

function clickAura(idx) {
  const card = auraCard(idx)
  if (!card) return
  if (ui.carrier && ui.carrier !== card.id) targetPickup(card.id)
  else selectCard(card.id)
}

// Sites and auras are painted straight onto the square rather than drawn as
// card tokens, so they need their own spoken label -- same shape as the one
// CardToken builds, because to a screen reader they are the same thing. The
// zone name goes in too: on the board a site is only findable by its square.
function pieceLabel(card, kind, zone) {
  if (!card) return ''
  const bits = [card.name, kind, card.enemy ? "opponent's" : 'yours']
  if (carriedBy(card.id).length)
    bits.push(`carrying ${carriedBy(card.id).length}`)
  bits.push(`at ${zoneLabel(zone)}`)
  return `${bits.join(', ')}. Select for actions`
}

// Nothing but an aura can legally land on an intersection, so the twelve
// nodes only join the Tab order when an aura is the card in hand.
const auraSelected = computed(
  () => !!ui.selected && !!state.cards[ui.selected]?.aura
)

// A square's regions are derived from its site: the surface is 'surface' with a
// site and 'void' without one; the below band is 'underground'/'underwater' on a
// land/water site and nothing at all with no site. Rendered as a tint + label so
// the realm reads at a glance without a legend.
const topRegion = (idx) => regionOf(idx, 'top')
const botRegion = (idx) => regionOf(idx, 'bot')
const REGION_ABBR = {
  surface: 'surface',
  void: 'void',
  underground: 'underground',
  underwater: 'underwater',
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
  <div class="board" :class="{ dragging: ui.dragging }">
    <!-- Sized by the height it is given, not by its own width: the grid
         and the aura overlay share one 5x4 stage that shrinks to fit. -->
    <div class="board-stage">
      <div class="board-grid">
        <div v-for="n in GRID_SIZE" :key="n" class="cell">
          <!-- Not a drop zone: a square had three stacked targets -- the site
               slot over the whole cell, plus surface and below -- and the site
               slot earned none of them. moveCard routes a site card into the
               slot whichever half it lands on, and anything else out of it, so
               all the third target ever did was split the square into three
               bands where two would do. It is just the site's art now, and the
               two halves cover the square between them.

               The site card itself is still the drag/click surface for moving
               it; opponent-controlled sites render upside down against the top
               edge, mirroring the mat. -->
          <div class="site-strip">
            <img
              v-if="siteCard(n - 1) && siteCard(n - 1).img"
              class="site-bg"
              :class="{
                flipped: siteCard(n - 1).enemy,
                selected: ui.selected === siteCard(n - 1).id,
                targetable:
                armedAttackLegal(siteCard(n - 1).id) ||
                (ui.striker && ui.striker !== siteCard(n - 1).id),
              }"
              :src="siteCard(n - 1).img"
              alt=""
              draggable="true"
              role="button"
              tabindex="0"
              :aria-pressed="ui.selected === siteCard(n - 1).id"
              :aria-label="pieceLabel(siteCard(n - 1), 'site', `site:${n - 1}`)"
              :title="siteCard(n - 1).name + ' (click for actions, hold Alt to enlarge)'"
              @dragstart="dragSite($event, n - 1)"
              @click.stop="clickSite(n - 1, $event)"
              @keydown.enter.stop.prevent="clickSite(n - 1, $event)"
              @keydown.space.stop.prevent="clickSite(n - 1, $event)"
              @mouseenter="ui.hoverCard = siteCard(n - 1).id"
              @mouseleave="ui.hoverCard = null"
              @focus="ui.hoverCard = siteCard(n - 1).id"
              @blur="ui.hoverCard = null"
            />
            <span
              v-if="siteCard(n - 1) && carriedBy(siteCard(n - 1).id).length"
              class="site-badge carry-badge"
              :title="`Carrying ${carriedBy(siteCard(n - 1).id).length} card(s)`"
            >
              ✋ {{ carriedBy(siteCard(n - 1).id).length }}
            </span>
          </div>
          <!-- Surface and underground cards render side by side in the top
               area; underground ones are darkened and badged instead of
               living in the bottom band. -->
          <DropZone
            :zone="`cell:${n - 1}:top`"
            class="cell-half top"
            :class="`region-${topRegion(n - 1)}`"
            :style="{ '--n': occupants(n - 1) || 1 }"
          >
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
            <span v-if="topRegion(n - 1) === 'void'" class="region-tag" aria-hidden="true">
              void
            </span>
          </DropZone>
          <!-- Drop-only band: cards dropped here go underground but are
               displayed in the top area with the BELOW mark. -->
          <DropZone
            :zone="`cell:${n - 1}:bot`"
            class="cell-half bot"
            :class="botRegion(n - 1) ? `region-${botRegion(n - 1)}` : 'region-none'"
            :keyboard="false"
          >
            <span v-if="botRegion(n - 1)" class="region-tag" aria-hidden="true">
              {{ REGION_ABBR[botRegion(n - 1)] }}
            </span>
          </DropZone>
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
          :keyboard="auraSelected"
        >
          <div
            v-if="auraCard(n - 1)"
            class="aura-token"
            :class="{ selected: ui.selected === auraCard(n - 1).id }"
            draggable="true"
            role="button"
            tabindex="0"
            :aria-pressed="ui.selected === auraCard(n - 1).id"
            :aria-label="pieceLabel(auraCard(n - 1), 'aura', `aura:${n - 1}`)"
            :title="auraCard(n - 1).name + ' (click for actions, hold Alt to enlarge)'"
            @dragstart="dragAura($event, n - 1)"
            @click.stop="clickAura(n - 1)"
            @keydown.enter.stop.prevent="clickAura(n - 1)"
            @keydown.space.stop.prevent="clickAura(n - 1)"
            @mouseenter="ui.hoverCard = auraCard(n - 1).id"
            @mouseleave="ui.hoverCard = null"
            @focus="ui.hoverCard = auraCard(n - 1).id"
            @blur="ui.hoverCard = null"
          >
            <img
              v-if="auraCard(n - 1).img"
              :src="auraCard(n - 1).img"
              alt=""
              :class="{ flipped: auraCard(n - 1).enemy }"
              draggable="false"
            />
            <span v-else class="aura-name">{{ auraCard(n - 1).name }}</span>
            <span
              v-if="carriedBy(auraCard(n - 1).id).length"
              class="site-badge carry-badge"
              :title="`Carrying ${carriedBy(auraCard(n - 1).id).length} card(s)`"
            >
              ✋ {{ carriedBy(auraCard(n - 1).id).length }}
            </span>
          </div>
        </DropZone>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Region tints, derived from the site on each square. Subtle insets so they
   read as terrain without fighting the card art on top. Surface is the default
   and gets no tint; only the below bands and the open void are coloured. */
.cell-half.region-underground {
  box-shadow: inset 0 0 0 100px rgba(122, 84, 45, 0.22);
}
.cell-half.region-underwater {
  box-shadow: inset 0 0 0 100px rgba(44, 96, 160, 0.24);
}
.cell-half.region-void {
  box-shadow: inset 0 0 0 100px rgba(90, 70, 150, 0.16);
}
/* A below band with no site above it is not a place at all -- you cannot go
   below the open void -- so it is dimmed and hatched to read as unavailable. */
.cell-half.region-none {
  background-image: repeating-linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.04) 0,
    rgba(255, 255, 255, 0.04) 4px,
    transparent 4px,
    transparent 9px
  );
}
.region-tag {
  position: absolute;
  right: 3px;
  bottom: 2px;
  z-index: 1;
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
  pointer-events: none;
  user-select: none;
}
</style>
