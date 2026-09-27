<script setup>
import { computed, reactive } from 'vue'
import {
  state,
  ui,
  armedAttackLegal,
  isStoryChoiceTarget,
  canActivateTarget,
  isOversized,
  isTapped,
  damageOf,
  effectivePower,
  carriedBy,
  beginDrag,
  zoneOf,
  zoneLabel,
  regionOf,
  isWaterSite,
  isFloodedSite,
  squareCue,
  intersectionSquares,
  GRID_SIZE,
  GRID_COLS,
  GRID_ROWS,
  INTERSECTIONS,
  INTERSECTION_COLS,
  clickSite as storeClickSite,
  clickAura as storeClickAura,
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

// How many cards stand side by side on a square's surface; the band shares its
// width that many ways. Anything below splits the square: surface cards to the
// upper left, below cards to the lower right.
const surfaceCount = (idx) => state.zones[`cell:${idx}:top`].length
const belowCount = (idx) => state.zones[`cell:${idx}:bot`].length

// Every card on crossing `idx`, bottom of the stack first. Any number of auras
// (animated or not) may share a crossing.
const auraCards = (idx) =>
  state.zones[`aura:${idx}`].map((id) => state.cards[id]).filter(Boolean)

// Cards sharing a crossing fan out along the grid line, centred on it, each
// offset by a fraction of its own size so enough of every card shows to grab.
function fanStyle(k, n) {
  if (n < 2) return null
  const t = k - (n - 1) / 2
  return { transform: `translate(${t * 45}%, ${t * 12}%)`, zIndex: k + 1 }
}

function dragAura(e, card, idx) {
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
// under the pointer decides surface or below, which keeps the 50/50 split in
// the stylesheet rather than restating it here.
// The band (surface / below) under the pointer on a square.
function bandAt(idx, e) {
  const band = document
    .elementsFromPoint(e.clientX, e.clientY)
    .find((el) => el.classList && el.classList.contains('cell-half'))
  return band && band.classList.contains('bot') ? `cell:${idx}:bot` : `cell:${idx}:top`
}

// A click on a square's site art; the band under the pointer (DOM) says
// surface or below, and the store decides what the click does.
function clickSite(idx, e) {
  storeClickSite(idx, bandAt(idx, e), siteCard(idx)?.id ?? null)
}

function clickAura(card) {
  storeClickAura(card?.id)
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
  if (isTapped(card.id)) bits.push('tapped')
  bits.push(`at ${zoneLabel(zone)}`)
  return `${bits.join(', ')}. Select for actions`
}

// Site art arrives in both orientations: some files are landscape (the card as
// it lies on the table), others are portrait scans of the same card. Remember
// which image URLs are portrait so only those get turned a quarter.
const portraitImgs = reactive({})
const notePortrait = (e, src) => {
  portraitImgs[src] = e.target.naturalHeight > e.target.naturalWidth
}

// Nothing but an aura can legally land on an intersection, so the twelve
// nodes only join the Tab order when an aura is the card in hand.
const auraSelected = computed(
  () => !!ui.selected && !!state.cards[ui.selected]?.aura
)

// The empty crossings only show while an aura is the card in hand or in
// flight -- they are no destination for anything else.
const auraInPlay = computed(
  () => auraSelected.value || !!(ui.dragCard && state.cards[ui.dragCard]?.aura)
)

// The four squares a selected aura touches, outlined so its reach is never a
// guess. Empty unless the selection is a card standing on a crossing.
const auraReach = computed(() => {
  const zone = ui.selected && zoneOf(ui.selected)
  if (!zone || !zone.startsWith('aura:')) return []
  return intersectionSquares(Number(zone.slice('aura:'.length)))
})

// A crossing holding only plain auras draws them as round seals on the point
// where the four squares meet. Any animated aura there is an oversized minion
// and keeps the whole node card-shaped, as it always was.
const sealed = (idx) => auraCards(idx).every((card) => !isOversized(card.id))

// A piece on a crossing overlaps the corner of each square it touches, so a
// band keeps that corner clear: cards start beside the seal instead of under it
// (it hid their damage badges). Returns the band's padding classes -- 'seal'
// for a round seal, 'big' for an animated aura, which is card-sized.
function cornerPiece(idx, dr, dc) {
  const r = Math.floor(idx / GRID_COLS) + dr
  const c = (idx % GRID_COLS) + dc
  if (r < 0 || c < 0 || r >= GRID_ROWS - 1 || c >= INTERSECTION_COLS) return null
  const m = r * INTERSECTION_COLS + c
  if (!auraCards(m).length) return null
  return sealed(m) ? 'seal' : 'big'
}
function cornerPads(idx, band) {
  const dr = band === 'top' ? -1 : 0
  const left = cornerPiece(idx, dr, -1)
  const right = cornerPiece(idx, dr, 0)
  return [left && `pad-l-${left}`, right && `pad-r-${right}`]
}

// A square's regions are derived from its site: the surface is 'surface' with a
// site and 'void' without one; the below band is 'underground'/'underwater' on a
// land/water site and nothing at all with no site. Rendered as a tint + label so
// the realm reads at a glance without a legend.
// While an action is armed, each square says what a click there does. The word
// rides with the colour so the state never depends on colour alone; an armed
// Move dims what it can't reach instead of labelling it.
const CUE_WORD = { move: 'Move', attack: 'Attack', shoot: 'Shoot', summon: 'Summon' }

const topRegion = (idx) => regionOf(idx, 'top')
const botRegion = (idx) => regionOf(idx, 'bot')
const REGION_ABBR = {
  surface: 'Surface',
  void: 'Void',
  underground: 'Underground',
  underwater: 'Underwater',
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
  <div class="board" :class="{ dragging: ui.dragging, 'aura-armed': auraInPlay }">
    <!-- Sized by the height it is given, not by its own width: the grid
         and the aura overlay share one 5x4 stage that shrinks to fit. -->
    <div class="board-stage">
      <div class="board-grid">
        <div
          v-for="n in GRID_SIZE"
          :key="n"
          class="cell"
          :class="[
            squareCue(n - 1) && `cue-${squareCue(n - 1)}`,
            {
              reach: auraReach.includes(n - 1),
              void: !siteCard(n - 1),
            },
          ]"
        >
          <span v-if="CUE_WORD[squareCue(n - 1)]" class="cue-tag" aria-hidden="true">
            {{ CUE_WORD[squareCue(n - 1)] }}
          </span>
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
            <!-- A native animated water treatment over any water site (threshold
                 or Flood). Purely cosmetic and non-blocking: it never eats the
                 pointer, so the site art underneath stays clickable/draggable.
                 Flood water shimmers a touch brighter than authored water so the
                 two read apart. -->
            <div
              v-if="siteCard(n - 1) && isWaterSite(n - 1)"
              class="water-overlay"
              :class="{ flooded: isFloodedSite(n - 1) }"
              aria-hidden="true"
            />
            <img
              v-if="siteCard(n - 1) && siteCard(n - 1).img"
              class="site-bg"
              :class="{
                flipped: siteCard(n - 1).enemy,
                portrait: portraitImgs[siteCard(n - 1).img],
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
              @load="notePortrait($event, siteCard(n - 1).img)"
              @dragstart="dragSite($event, n - 1)"
              @click.stop="clickSite(n - 1, $event)"
              @keydown.enter.stop.prevent="clickSite(n - 1, $event)"
              @keydown.space.stop.prevent="clickSite(n - 1, $event)"
              @mouseenter="ui.hoverCard = siteCard(n - 1).id"
              @mouseleave="ui.hoverCard = null"
              @focus="ui.hoverCard = siteCard(n - 1).id"
              @blur="ui.hoverCard = null"
            />
            <!-- The square's frame: a thin line for whose site it is (solid for
                 yours, dashed for the opponent's), gold when it is selected and
                 red dashed when an armed attack/strike can hit it. Drawn over
                 the art, under the cards, never taking the pointer. -->
            <span
              v-if="siteCard(n - 1)"
              class="site-frame"
              :class="{
                opp: siteCard(n - 1).enemy,
                selected: ui.selected === siteCard(n - 1).id,
                targetable:
                  armedAttackLegal(siteCard(n - 1).id) ||
                  (ui.striker && ui.striker !== siteCard(n - 1).id),
              }"
              aria-hidden="true"
            />
            <span
              v-if="siteCard(n - 1) && carriedBy(siteCard(n - 1).id).length"
              class="site-badge carry-badge"
              :title="`Carrying ${carriedBy(siteCard(n - 1).id).length} card(s)`"
            >
              ✋ {{ carriedBy(siteCard(n - 1).id).length }}
            </span>
          </div>
          <!-- Surface cards stand in the upper half of the square, cards
               below it (underground / underwater, darkened and badged) in the
               lower half. Sharing the square, the surface keeps to the left and
               the below to the right; a level shrinks only when more than one
               card stands on it. -->
          <DropZone
            :zone="`cell:${n - 1}:top`"
            class="cell-half top"
            :class="[
              `region-${topRegion(n - 1)}`,
              { split: belowCount(n - 1), crowded: surfaceCount(n - 1) > 1 },
              ...cornerPads(n - 1, 'top'),
            ]"
            :style="{ '--n': surfaceCount(n - 1) || 1 }"
          >
            <CardToken
              v-for="id in state.zones[`cell:${n - 1}:top`]"
              :key="id"
              :card-id="id"
              :from="`cell:${n - 1}:top`"
            />
            <span v-if="topRegion(n - 1) === 'void'" class="void-tag" aria-hidden="true">
              Void
            </span>
          </DropZone>
          <!-- The lower half: cards below the surface, laid out like the surface. -->
          <DropZone
            :zone="`cell:${n - 1}:bot`"
            class="cell-half bot"
            :class="[
              botRegion(n - 1) ? `region-${botRegion(n - 1)}` : 'region-none',
              { split: surfaceCount(n - 1), crowded: belowCount(n - 1) > 1 },
              ...cornerPads(n - 1, 'bot'),
            ]"
            :style="{ '--n': belowCount(n - 1) || 1 }"
            :keyboard="false"
          >
            <CardToken
              v-for="id in state.zones[`cell:${n - 1}:bot`]"
              :key="id"
              :card-id="id"
              :from="`cell:${n - 1}:bot`"
            />
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
          :class="{
            occupied: auraCards(n - 1).length,
            sealed: auraCards(n - 1).length && sealed(n - 1),
          }"
          :style="nodeStyle(n - 1)"
          :keyboard="auraSelected"
        >
          <div
            v-for="(card, k) in auraCards(n - 1)"
            :key="card.id"
            class="aura-token"
            :class="{
              stacked: k > 0,
              seal: sealed(n - 1),
              oversized: isOversized(card.id),
              tapped: isTapped(card.id),
              selected: ui.selected === card.id,
              targetable:
                (ui.storyChoice ? isStoryChoiceTarget(card.id) : canActivateTarget(card.id)),
            }"
            :style="fanStyle(k, auraCards(n - 1).length)"
            draggable="true"
            role="button"
            tabindex="0"
            :aria-pressed="ui.selected === card.id"
            :aria-label="pieceLabel(card, 'aura', `aura:${n - 1}`)"
            :title="card.name + ' (click for actions, hold Alt to enlarge)'"
            @dragstart="dragAura($event, card, n - 1)"
            @click.stop="clickAura(card)"
            @keydown.enter.stop.prevent="clickAura(card)"
            @keydown.space.stop.prevent="clickAura(card)"
            @mouseenter="ui.hoverCard = card.id"
            @mouseleave="ui.hoverCard = null"
            @focus="ui.hoverCard = card.id"
            @blur="ui.hoverCard = null"
          >
            <img
              v-if="card.img"
              :src="card.img"
              alt=""
              :class="{ flipped: card.enemy }"
              draggable="false"
            />
            <span v-else class="aura-name">{{ card.name }}</span>
            <!-- Animated: an oversized minion. Its power and wounds read here,
                 since it is drawn as an aura rather than a card token. -->
            <template v-if="isOversized(card.id)">
              <span class="oversized-tag" aria-hidden="true">
                Anim {{ effectivePower(card.id) }}
              </span>
              <span v-if="damageOf(card.id)" class="oversized-dmg" aria-hidden="true">
                {{ damageOf(card.id) }}
              </span>
            </template>
            <span
              v-if="carriedBy(card.id).length"
              class="site-badge carry-badge"
              :title="`Carrying ${carriedBy(card.id).length} card(s)`"
            >
              ✋ {{ carriedBy(card.id).length }}
            </span>
          </div>
        </DropZone>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Moved from style.css (kept first, so the component's own rules below still win). */
.site-bg:focus-visible {
  outline: 3px solid var(--c-focus);
  outline-offset: -3px;
}

/* The grid used to take its height from its own width (5 square cells wide),
   so a wider window made a taller board and pushed the hands off screen.
   The stage keeps the 5:4 shape but is capped by the height available, and
   its max-width follows from that -- so the board shrinks to fit instead of
   demanding more page. The aura overlay shares the stage, which is what
   keeps the nodes on the grid lines at every size. */
.board-stage {
  position: relative;
  width: 100%;
  aspect-ratio: 5 / 4;
  max-height: var(--stage-h);
  max-width: calc(var(--stage-h) * 1.25);
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-template-rows: repeat(4, 1fr);
  height: 100%;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

.cell {
  position: relative;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
}

/* The site art fills its square (sizing, flips and the portrait turn are in
   Board.vue). The image itself is the drag/click surface for moving the site. */
.site-bg {
  cursor: grab;
  user-select: none;
}

.site-bg:active {
  cursor: grabbing;
}

.cell-half {
  position: absolute;
  left: 0;
  right: 0;
  padding: 3px;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
}

/* No z-index, deliberately: a positioned box without one does not open a
   stacking context, so the cards inside these bands can sit above the site art
   (which is above the bands themselves) instead of being trapped under it.
   The order inside a square is bands -> site art -> cards.

   Half each: with the site slot no longer a drop target of its own, these
   two are the square's only zones and have to meet. They used to leave a 30%
   band between them that only the site slot caught -- and that band was also
   the sole corridor through which the site art could be clicked, because both
   halves sit above it. The corridor is gone; the rule below is what keeps the
   art reachable instead. */
.cell-half.top {
  top: 0;
  height: 50%;
  align-content: flex-start;
}

/* The lower half: cards below the surface, darkened and badged. */
.cell-half.bot {
  bottom: 0;
  height: 50%;
  align-content: flex-end;
  background: rgba(0, 0, 0, 0.18);
}

/* A zone only wants the pointer when it can do something with it: while a card
   is armed for a click-move, or while one is in flight. Idle, the bands step
   aside so a click on bare felt is not swallowed by a target that would ignore
   it anyway. */
.cell-half {
  pointer-events: none;
}

.cell-half.armed,
.board.dragging .cell-half {
  pointer-events: auto;
}

/* A square with something below it is split: surface cards keep to the upper
   left, below cards to the lower right. Both levels lay out the same way --
   side by side, wrapping, sized by --n (what that level holds). A lone card on
   its level stays full size (44% each, so the pair sits side by side without
   covering each other); only a crowded level shrinks, to about 24% of the
   width -- a card as tall as half a 4:3 square (63:88 art). */
.cell-half.top.split {
  justify-content: flex-start;
}

.cell-half.bot.split {
  justify-content: flex-end;
}

/* The site's own layer, above both bands. It has to be, or selecting a site
   would arm the square and bury the art under a zone -- and you could no longer
   hover it for the Alt preview or drag it anywhere. clickSite hands an armed
   click back down to the band underneath. The strip itself is just a frame:
   bare felt is not a target, so only the artwork takes the pointer. */
.site-strip {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.site-strip > * {
  pointer-events: auto;
}

.site-bg.targetable {
  cursor: crosshair;
}

@media (prefers-reduced-motion: no-preference) {
  .site-bg.targetable {
      animation: fx-target-pulse 1.1s ease-in-out infinite;
      border-radius: 8px;
    }
}

@media (max-width: 700px) {
  /* Squares are ~68px wide at this size, so the 3px inset and 4px gutter are
       nearly a tenth of the room a card has. */
  .cell-half {
      padding: 2px;
      gap: 2px;
    }
}

/* Moved from style.css (kept first, so the component's own rules below still win). */
/* Sites and auras are drawn straight onto the board rather than as card
   tokens, so they get a count instead of a strip. */
.carry-badge {
  /* .site-badge centres itself with left/transform; this one hugs the corner
     so it can sit alongside the SITE and AURA badges rather than under them. */
  left: auto;
  transform: none;
  bottom: 2px;
  right: 2px;
}

.site-badge {
  position: absolute;
  bottom: 3px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--c-gold);
  color: var(--c-ink);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 1px 5px;
  border-radius: 3px;
  pointer-events: none;
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .cell-half .site-badge {
      font-size: 7px;
      letter-spacing: 0;
      padding: 1px 3px;
    }
}

/* Moved from style.css (kept first, so the component's own rules below still win). */
.aura-token:focus-visible {
  outline: 3px solid var(--c-focus);
  outline-offset: -3px;
}

/* Overlay covering the stage, which is the grid, so the nodes sit exactly on
   the crossings of the grid lines however the board is scaled. */
.intersections {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.aura-node {
  position: absolute;
  width: 22px;
  height: 22px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  pointer-events: auto;
  /* Auras always paint above sites and any cards on them. */
  z-index: 4;
}

/* Sized so a portrait aura card stands roughly as tall as a site card:
   a site is ~82% of a cell (16.4% of the grid); at 4:3 cells and 88x63
   card art, a 9%-wide portrait card matches the site's height.

   The floor and ceiling are both in stage terms for a reason. This was
   `min-width: 64px`, and on a phone the floor won: 64px of aura on a 68px
   square, taller than the square itself, swallowing the site under it and the
   cards either side. 12% of the stage is 60% of one square, which is as large
   as a piece drawn on a crossing can be and still leave the squares readable. */
.aura-node.occupied {
  width: clamp(9%, 36px, 12%);
  min-width: 0;
  height: auto;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: none;
  overflow: visible;
}

.aura-node.occupied.over {
  outline: 2px solid var(--aura);
  outline-offset: 2px;
}

.oversized-tag {
  position: absolute;
  left: 2px;
  bottom: 2px;
  padding: 0 0.3em;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  color: var(--c-cream-hi);
  background: rgba(0, 0, 0, 0.7);
  pointer-events: none;
}

.oversized-dmg {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 1.1em;
  padding: 0 0.25em;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
  text-align: center;
  color: var(--c-cream-hi);
  background: var(--c-danger-deep);
  pointer-events: none;
}

.aura-token {
  position: relative;
  width: 100%;
  height: 100%;
  cursor: grab;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Host themes style [role="button"] and img with padding, margins and
     min-heights; any of them shows up as a strip of token background under
     the art, so the token hugs its image outright. */
  margin: 0;
  padding: 0;
  min-height: 0;
  border-radius: 8px;
  background: var(--panel-2);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}

/* Several auras can share a crossing. The first sets the node's height; the
   rest lie over it (fanned out by an inline transform from Board.vue). The one
   under the pointer or selected comes to the front so any of them can be read
   and grabbed. */
.aura-token.stacked {
  position: absolute;
  top: 0;
  left: 0;
}

.aura-token:hover,
.aura-token:focus-visible {
  z-index: 20 !important;
}

.aura-token.selected {
  z-index: 10 !important;
}

/* An animated aura is an oversized minion standing on all four squares around
   its crossing. It keeps the plain aura size; the unit-style ring and ANIM tag
   are what mark it. */
.aura-token.oversized {
  box-shadow: 0 0 0 2px var(--accent), 0 4px 14px rgba(0, 0, 0, 0.7);
}

.aura-token:active {
  cursor: grabbing;
}

/* Tapped (an animated aura that moved or attacked), turned a quarter like a
   tapped card token. The whole token turns so its tags go with the art. */
.aura-token.tapped {
  rotate: 90deg;
  opacity: 0.9;
}

.aura-name {
  font-size: 8px;
  font-weight: 600;
  text-align: center;
  overflow: hidden;
  padding: 4px 2px;
}

.aura-token.selected {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
  border-radius: 8px;
}

.aura-token.targetable {
  cursor: crosshair;
}

.aura-token.targetable:hover {
  outline: 2px dashed var(--bad);
  outline-offset: 2px;
  border-radius: 8px;
}

@media (prefers-reduced-motion: no-preference) {
  .aura-token.targetable {
      animation: fx-target-pulse 1.1s ease-in-out infinite;
      border-radius: 8px;
    }
}

/* ---------- the realm: felt squares on thin lines ---------- */

/* The board is the table itself, not a panel on it: no card behind the grid. */
.board {
  background: transparent;
  border-color: transparent;
}
.board-grid {
  background: var(--c-square);
  border: 1px solid var(--c-square-line);
  border-radius: 6px;
}
/* Each square is a size container so portrait site art can be measured against
   the square it lies in (see .site-bg.portrait). */
.cell {
  container-type: size;
  background: var(--c-square);
  border: 0;
  border-right: 1px solid color-mix(in srgb, var(--c-cream) 9%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--c-cream) 9%, transparent);
  transition: opacity 160ms ease;
}
.cell:nth-child(5n) {
  border-right: 0;
}
.cell:nth-last-child(-n + 5) {
  border-bottom: 0;
}

/* The open void: no site, so no place to stand below. Dotted, darker felt and
   a quiet word, rather than stripes. */
.cell.void {
  background-color: var(--c-felt-deep);
  background-image: radial-gradient(
    color-mix(in srgb, var(--c-cream) 10%, transparent) 1px,
    transparent 1.5px
  );
  background-size: 12px 12px;
}
.cell.void .cell-half.bot {
  background: none;
}
.void-tag {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  transform: translateY(50%);
  text-align: center;
  font-size: var(--fs-xs);
  font-style: italic;
  color: var(--c-muted-lo);
  opacity: 0.7;
  pointer-events: none;
  user-select: none;
}

/* ---------- site art: fills its square, cropped by the frame ---------- */

/* The art lies landscape across the whole square, cover-cropped, and is dimmed
   so the units standing on it stay legible. It brightens when hovered or
   selected so you can still see what you picked. */
.site-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  margin: 0;
  object-fit: cover;
  border-radius: 0;
  transform: none;
  opacity: 1;
  filter: brightness(0.55) saturate(0.8);
  transition: filter 160ms ease;
}
.site-bg:hover,
.site-bg.selected {
  filter: brightness(0.85) saturate(0.95);
}
.site-bg.flipped {
  top: 0;
  bottom: 0;
  transform: rotate(180deg);
}
/* Portrait scans are turned a quarter: the box is the square's size swapped
   (height x width), centred, then rotated so it covers the square exactly. */
.site-bg.portrait {
  inset: auto;
  left: 50%;
  top: 50%;
  width: 100cqh;
  height: 100cqw;
  transform: translate(-50%, -50%) rotate(90deg);
}
.site-bg.portrait.flipped {
  transform: translate(-50%, -50%) rotate(270deg);
}
/* Selection and targeting are drawn by the square's frame (.site-frame);
   the square clips, so the art's own outline would only be half visible. */
.site-bg.selected,
.site-bg.targetable {
  outline: none;
}
.site-bg:focus-visible {
  outline: 3px solid var(--c-focus);
  outline-offset: -3px;
}

.site-strip > .site-frame {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-cream) 22%, transparent);
}
.site-strip > .site-frame.opp {
  box-shadow: none;
  border: 1px dashed color-mix(in srgb, var(--c-opp) 55%, transparent);
}
.site-strip > .site-frame.targetable {
  box-shadow: none;
  border: 2px dashed var(--c-danger);
}
.site-strip > .site-frame.selected {
  box-shadow: inset 0 0 0 2px var(--c-gold);
  border: 0;
}

/* The below band's region word (Underground / Underwater) only shows on the
   band you are about to pick -- hovered while a card is armed, or under a drag
   -- so it never sits over the art otherwise. The void has none: there is no
   below there. */
.region-tag {
  position: absolute;
  right: 4px;
  bottom: 3px;
  z-index: 3;
  padding: 0 5px;
  border-radius: var(--r-pill);
  background: color-mix(in srgb, var(--c-felt-deep) 80%, transparent);
  font-size: 11px;
  font-style: italic;
  color: var(--c-muted-hi);
  pointer-events: none;
  user-select: none;
  display: none;
}
.cell-half.over .region-tag,
.cell-half.armed:hover .region-tag {
  display: block;
}

/* Region tints under the art (seen only where the art does not reach). */
.cell-half.region-underground {
  box-shadow: inset 0 0 0 100px rgba(122, 84, 45, 0.22);
}
.cell-half.region-underwater {
  box-shadow: inset 0 0 0 100px rgba(44, 96, 160, 0.24);
}

/* Animated water treatment over a water/flooded site. Confined to the lower
   band (matching `.cell-half.bot`'s 50%) so it marks the underwater region
   rather than washing over the whole square. It lies over the art (the art now
   fills the square) but never takes the pointer (the global `.site-strip > *`
   rule would otherwise make it swallow clicks, so it is overridden back here). */
.water-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 50%;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
  opacity: 0.85;
  background:
    linear-gradient(0deg, rgba(28, 74, 128, 0.34), rgba(44, 110, 176, 0.22)),
    repeating-linear-gradient(
      115deg,
      rgba(150, 205, 255, 0.16) 0,
      rgba(150, 205, 255, 0.16) 6px,
      rgba(90, 160, 220, 0.05) 6px,
      rgba(90, 160, 220, 0.05) 14px
    );
  box-shadow: inset 0 0 14px rgba(10, 40, 80, 0.45);
}
/* Flood water (a reversible in-play state) glints brighter and cooler than an
   authored water-threshold site, so the two are distinguishable at a glance. */
.water-overlay.flooded {
  background:
    linear-gradient(0deg, rgba(30, 96, 150, 0.4), rgba(70, 150, 210, 0.28)),
    repeating-linear-gradient(
      115deg,
      rgba(190, 235, 255, 0.24) 0,
      rgba(190, 235, 255, 0.24) 6px,
      rgba(110, 190, 240, 0.06) 6px,
      rgba(110, 190, 240, 0.06) 14px
    );
}
@media (prefers-reduced-motion: no-preference) {
  .water-overlay {
    background-size: 100% 100%, 200% 200%;
    animation: water-drift 6s linear infinite;
  }
  .water-overlay.flooded {
    animation-duration: 4s;
  }
}
@keyframes water-drift {
  0% {
    background-position: 0 0, 0 0;
  }
  100% {
    background-position: 0 0, 56px 28px;
  }
}

/* ---------- square cues ---------- */

/* The frame is drawn over the art and the cards (it is only an edge, and never
   takes the pointer); the word sits in the top-right corner, clear of surface
   cards, which pack from the left. Solid gold = go, solid red = a fight, dashed
   gold inset = somewhere a card from hand can land. Colours come from the root
   tokens (--cue-go / --cue-fight). */
.cell[class*='cue-']::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 5;
  box-shadow: inset 0 0 0 3px var(--cue-color);
  pointer-events: none;
}
.cell.cue-move,
.cell.cue-summon {
  --cue-color: var(--cue-go);
}
.cell.cue-attack,
.cell.cue-shoot {
  --cue-color: var(--cue-fight);
}
.cell.cue-summon::after {
  inset: 6px;
  box-shadow: none;
  border: 2px dashed var(--cue-color);
  border-radius: var(--r-sm);
}
.cell.cue-out::after {
  content: none;
}
/* Out of reach of an armed Move: dimmed, not labelled. */
.cell.cue-out {
  opacity: 0.42;
}
.cue-tag {
  position: absolute;
  top: 5px;
  right: 5px;
  z-index: 6;
  padding: 1px 7px;
  border-radius: var(--r-pill);
  background: var(--cue-color);
  color: var(--c-ink);
  font-family: var(--font-ui);
  font-size: var(--fs-xs);
  font-weight: 700;
  line-height: 1.35;
  pointer-events: none;
  user-select: none;
}

/* Keep a corner clear under a piece on the crossing (see cornerPads). Half the
   seal's width (.aura-node.sealed: max(28px, 7% of the stage) = 35cqw of a
   square) plus its ring; an animated aura is card-sized (clamp(9%, 36px, 12%)
   of the stage). cq units resolve against the square (.cell is the container). */
.cell-half.pad-l-seal {
  padding-left: calc(max(14px, 17.5cqw) + 4px);
}
.cell-half.pad-r-seal {
  padding-right: calc(max(14px, 17.5cqw) + 4px);
}
.cell-half.pad-l-big {
  padding-left: calc(clamp(22.5cqw, 18px, 30cqw) + 4px);
}
.cell-half.pad-r-big {
  padding-right: calc(clamp(22.5cqw, 18px, 30cqw) + 4px);
}

/* A tapped card turns only its art (CardToken), so its layout box stays
   portrait while the picture lies landscape, 88/63 = 1.4 times as wide -- and
   the square clipped the overhang. The tapped token keeps exactly its slot
   instead: 0.72 of the width plus 0.14 margin each side, so the turned art is
   one slot wide (0.72 x 1.4 = 1) and a shared square never wraps. --card-w is
   a percentage of the band, as are margins, so the sum is exact. */
.cell-half :deep(.card-token.is-tapped) {
  width: calc(var(--card-w) * 0.72);
  margin-inline: calc(var(--card-w) * 0.14);
}

/* ---------- auras ---------- */

/* A selected aura's reach: the four squares around its crossing, a teal wash
   and a double line, so it reads apart from the solid and dashed cues. It sits
   just inside any cue frame, so both show when a cue is armed as well. Level
   with the card tokens and the aura overlay, and before both in the document,
   so it runs under the seal rather than across it. */
.cell.reach::before {
  content: '';
  position: absolute;
  inset: 3px;
  z-index: 4;
  border: 3px double var(--c-aura);
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--c-aura) 12%, transparent);
  pointer-events: none;
}

/* Empty crossings are drop spots only for an aura: hidden on the table, they
   appear (dashed teal) while an aura is selected or in flight, or when the
   crossing itself is hovered by a drag or focused. */
.aura-node:not(.occupied) {
  opacity: 0;
  border: 1px dashed var(--c-aura);
  background: var(--c-felt-deep);
  transition: opacity 160ms ease;
}
.board.aura-armed .aura-node:not(.occupied),
.aura-node.over:not(.occupied),
.aura-node:not(.occupied):focus-visible {
  opacity: 1;
}
.aura-node.over:not(.occupied) {
  border-style: solid;
  background: color-mix(in srgb, var(--c-aura) 30%, var(--c-felt-deep));
}

/* A plain aura is a round seal on the point where four squares meet: its art
   cropped to a coin in a teal ring. Smaller than a site so the squares it
   touches stay readable; the full card is still an Alt-hover away. */
.aura-node.sealed {
  width: clamp(28px, 7%, 9%);
}
.aura-node .aura-token.seal {
  height: auto;
  aspect-ratio: 1;
  border-radius: 50%;
  background: color-mix(in srgb, var(--c-aura) 22%, var(--c-felt-deep));
  box-shadow: 0 0 0 2px var(--c-aura), var(--shadow-card);
}
.aura-node .aura-token.seal img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* The art box sits in the upper half of a card; the rules text below it is
     already on the card, so the coin shows the picture. */
  object-position: 50% 28%;
  border-radius: 50%;
}
.aura-node .aura-token.seal .aura-name {
  padding: 2px;
  line-height: 1.1;
  color: var(--c-cream-hi);
}
/* Selected: a gold ring outside the teal one. */
.aura-node .aura-token.seal.selected {
  outline: none;
  box-shadow: 0 0 0 2px var(--c-aura), 0 0 0 5px var(--c-gold), var(--shadow-card);
}
.aura-node .aura-token.seal:focus-visible {
  outline: 3px solid var(--c-focus);
  outline-offset: 3px;
  border-radius: 50%;
}
.aura-node .aura-token.seal.targetable:hover {
  border-radius: 50%;
}
.aura-node .aura-token.seal .carry-badge {
  bottom: -6px;
  right: -6px;
}

@media (prefers-reduced-motion: reduce) {
  .cell,
  .site-bg,
  .aura-node:not(.occupied) {
    transition: none;
  }
}
</style>
