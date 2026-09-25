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
  targetActivate,
  canActivateTarget,
  armedAttackLegal,
  armedShootLegal,
  targetShoot,
  armedInterceptLegal,
  targetIntercept,
  armedDefendLegal,
  chooseDefender,
  activeGridPick,
  canPickGridSquare,
  pickGridSquare,
  isStoryChoiceTarget,
  resolveStoryChoice,
  destPickArmed,
  canPickAnyDest,
  pickAnyDest,
  carriedBy,
  damageOf,
  isSilenced,
  isDisabled,
  effectiveStrengthMod,
  grantedKeywordsOf,
  cardTypeLabel,
  isAnimated,
  wardTokenArt,
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
// Strike is unenforced (any on-board target); attack highlights only legal
// targets when the puzzle enforces (armedAttackLegal falls back to true otherwise).
const targetable = computed(() => {
  if (ui.storyChoice) return isStoryChoiceTarget(props.cardId)
  if (ui.awaitingDefender) return armedDefendLegal(props.cardId)
  if (ui.shooting && ui.shooting !== props.cardId) return armedShootLegal(props.cardId)
  if (ui.intercepting && ui.intercepting !== props.cardId)
    return onBoard.value && armedInterceptLegal(props.cardId)
  if (!onBoard.value) return false
  if (ui.striker && ui.striker !== props.cardId) return true
  return armedAttackLegal(props.cardId)
})
// Anything but the armed carrier itself can be picked up, wherever it sits --
// a card in hand is as liftable as one on the board.
const liftable = computed(() => ui.carrier && ui.carrier !== props.cardId)
// Waiting for this card as an activated ability's target. Unlike attack/strike
// the target can be anywhere the ability allows (a collection avatar, say), so
// this is not gated to the board.
const activatingTarget = computed(() => canActivateTarget(props.cardId))
const carried = computed(() => carriedBy(props.cardId))
const dmg = computed(() => damageOf(props.cardId))
// Silence / Disable are gameplay states (from a passive aura), worth showing.
const silenced = computed(() => isSilenced(props.cardId))
const disabled = computed(() => isDisabled(props.cardId))
// Only gameplay changes are shown: a net strength modifier and any keywords
// granted in play (base strength/keywords are already on the card art).
const strengthMod = computed(() => effectiveStrengthMod(props.cardId))
const grantedKw = computed(() => grantedKeywordsOf(props.cardId))
const signedStr = computed(() =>
  strengthMod.value > 0 ? `+${strengthMod.value}` : `${strengthMod.value}`
)
// Short type tag (MIN/SITE/…) so a card's assigned type reads on the board.
const typeTag = computed(() => {
  const t = cardTypeLabel(props.cardId)
  return t === 'Minion' ? 'MIN' : t === 'Avatar' ? 'AVA' : t.slice(0, 4).toUpperCase()
})
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

// Transient cosmetic flash for this card. Only kinds whose card stays put are
// drawn on the token; cast/death cards leave for the cemetery, so those play as
// a positional burst in FxOverlay instead. Driven off the self-expiring ui.fx.
const FLASH_KINDS = ['genesis', 'impact', 'trigger']
const fxKind = computed(() => {
  const hit = ui.fx.find(
    (f) => f.cardId === props.cardId && FLASH_KINDS.includes(f.kind)
  )
  return hit ? hit.kind : null
})

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
  else if (isAnimated(props.cardId)) bits.push('animated minion')
  if (c.site) bits.push('site')
  if (c.aura) bits.push('aura')
  bits.push(c.enemy ? "opponent's" : 'yours')
  if (isUnder.value) bits.push('below')
  if (tapped.value) bits.push('tapped')
  if (disabled.value) bits.push('disabled')
  else if (silenced.value) bits.push('silenced')
  if (strengthMod.value) bits.push(`strength ${signedStr.value}`)
  if (grantedKw.value.length) bits.push(`gained ${grantedKw.value.join(', ')}`)
  if (dmg.value) bits.push(`${dmg.value} damage`)
  if (carried.value.length) bits.push(`carrying ${carried.value.length}`)
  const what = bits.join(', ')
  if (targetable.value) return `${what}. Target of the armed action`
  if (activatingTarget.value) return `${what}. Target of the ability`
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
  // Picking a destination (teleport / token placement): a click on a card picks
  // its location -- its own layer if legal there, else that square's surface.
  if (destPickArmed()) {
    const m = /^cell:(\d+):/.exec(props.from)
    if (m) {
      const zone = canPickAnyDest(props.from) ? props.from : `cell:${m[1]}:top`
      if (canPickAnyDest(zone)) pickAnyDest(zone)
    }
    return
  }
  // The storyline is paused for a trigger to pick a target.
  if (ui.storyChoice) {
    if (isStoryChoiceTarget(props.cardId)) resolveStoryChoice(props.cardId)
    return
  }
  // Aiming a grid ability: clicking a unit picks its square.
  if (activeGridPick()) {
    const m = /^cell:(\d+):/.exec(props.from)
    if (m && canPickGridSquare(Number(m[1]))) pickGridSquare(Number(m[1]))
    return
  }
  // A pending attack is waiting for a defender: a highlighted unit takes the job.
  if (ui.awaitingDefender) {
    if (armedDefendLegal(props.cardId)) chooseDefender(props.cardId)
    return
  }
  if (targetable.value) {
    if (ui.shooting) targetShoot(props.cardId)
    else if (ui.intercepting) targetIntercept(props.cardId)
    else if (ui.attacker) targetAttack(props.cardId)
    else if (ui.striker) targetStrike(props.cardId)
    return
  }
  // An armed activated ability lands its target here.
  if (activatingTarget.value) {
    targetActivate(props.cardId)
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
    :data-card-id="cardId"
    :class="{
      [`fx-${fxKind}`]: fxKind,
      'is-site': card.site && !isAnimated(cardId),
      'is-aura': card.aura,
      'is-unit': card.unit || isAnimated(cardId),
      'is-avatar': card.avatar,
      'is-tapped': tapped,
      'is-under': isUnder,
      attacker: ui.attacker === cardId,
      carrier: ui.carrier === cardId,
      striker: ui.striker === cardId,
      selected: ui.selected === cardId,
      targetable: targetable || activatingTarget,
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
    <span class="type-tag" aria-hidden="true">{{ typeTag }}</span>
    <!-- Damage counters on the card, a small red pip so a wounded unit reads at
         a glance. The count is also in the token's aria-label above. -->
    <span v-if="dmg" class="dmg-badge" aria-hidden="true">{{ dmg }}</span>
    <!-- Silence / Disable from a passive aura. Both are gameplay states, so
         (unlike base keywords) they get a badge. -->
    <span
      v-if="disabled || silenced"
      class="state-badge"
      :class="disabled ? 'disabled-badge' : 'silenced-badge'"
      :title="disabled ? 'Disabled' : 'Silenced'"
      aria-hidden="true"
    >
      {{ disabled ? 'DIS' : 'SIL' }}
    </span>
    <!-- Gameplay strength change (base strength stays on the art). -->
    <span
      v-if="strengthMod"
      class="str-badge"
      :class="strengthMod > 0 ? 'up' : 'down'"
      :title="`Strength ${signedStr}`"
      aria-hidden="true"
    >
      {{ signedStr }}
    </span>
    <!-- An intact Ward, drawn with the designated Ward token's art. -->
    <img
      v-if="wardTokenArt(cardId)"
      :src="wardTokenArt(cardId)"
      class="ward-token-art"
      alt=""
      aria-hidden="true"
      draggable="false"
    />
    <!-- Keywords gained in play, badged (base keywords are on the art). -->
    <div v-if="grantedKw.length" class="kw-tags" aria-hidden="true">
      <span v-for="kw in grantedKw" :key="kw" class="kw-tag">{{ kw }}</span>
    </div>

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

<style scoped>
.ward-token-art {
  position: absolute;
  left: 2px;
  top: 2px;
  z-index: 3;
  width: 34% !important;
  height: auto;
  border-radius: 4px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}
.dmg-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 3;
  min-width: 1.1em;
  padding: 0 0.25em;
  border-radius: 999px;
  background: #c0392b;
  color: #fff;
  font-size: 0.72em;
  font-weight: 700;
  line-height: 1.5;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
.state-badge {
  position: absolute;
  top: 2px;
  left: 2px;
  z-index: 3;
  padding: 0 0.25em;
  border-radius: 3px;
  font-size: 0.6em;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
.type-tag {
  position: absolute;
  bottom: 1px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  padding: 0 0.25em;
  border-radius: 3px 3px 0 0;
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.85);
  font-size: 0.5em;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.4;
  pointer-events: none;
}
.silenced-badge {
  background: #7a5cc0;
}
.disabled-badge {
  background: #555b66;
}
.str-badge {
  position: absolute;
  bottom: 2px;
  left: 2px;
  z-index: 3;
  min-width: 1.1em;
  padding: 0 0.25em;
  border-radius: 3px;
  font-size: 0.62em;
  font-weight: 700;
  color: #fff;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  pointer-events: none;
}
.str-badge.up {
  background: #2e8b57;
}
.str-badge.down {
  background: #b5652b;
}
.kw-tags {
  position: absolute;
  bottom: 2px;
  right: 2px;
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 1px;
  max-width: 80%;
  pointer-events: none;
}
.kw-tag {
  padding: 0 0.2em;
  border-radius: 2px;
  background: rgba(60, 120, 200, 0.9);
  color: #fff;
  font-size: 0.5em;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.5;
}

/* Transient event flashes. Each kind runs once when its ui.fx entry appears;
   the entry self-expires, dropping the class. Suppressed for reduced motion.
   (cast/death play in FxOverlay, since those cards move to the cemetery.) */
@media (prefers-reduced-motion: no-preference) {
  .card-token.fx-genesis {
    animation: fx-genesis 0.8s ease-out;
  }
  .card-token.fx-impact {
    animation: fx-impact 0.5s ease-out;
  }
  .card-token.fx-trigger {
    animation: fx-trigger 1.2s ease-out;
  }
}
/* Two soft violet pulses as one of the card's abilities triggers. */
@keyframes fx-trigger {
  0%,
  50%,
  100% {
    box-shadow: 0 0 0 0 rgba(200, 120, 255, 0);
  }
  20%,
  70% {
    box-shadow: 0 0 14px 5px rgba(200, 120, 255, 0.85);
  }
}
/* Bright flash-in as a card enters the realm. */
@keyframes fx-genesis {
  0% {
    transform: scale(0.7);
    box-shadow: 0 0 24px 10px rgba(120, 220, 150, 0.95);
    filter: brightness(1.8);
  }
  60% {
    transform: scale(1.06);
    box-shadow: 0 0 12px 4px rgba(120, 220, 150, 0.5);
    filter: brightness(1.15);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(120, 220, 150, 0);
    filter: none;
  }
}
/* Quick jolt when a projectile lands. */
@keyframes fx-impact {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 90, 60, 0);
  }
  25% {
    box-shadow: 0 0 16px 6px rgba(255, 90, 60, 0.9);
    transform: translateX(2px);
  }
  50% {
    transform: translateX(-2px);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 90, 60, 0);
    transform: translateX(0);
  }
}
</style>

