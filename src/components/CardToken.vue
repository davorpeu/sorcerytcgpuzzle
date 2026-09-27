<script setup>
import { computed } from 'vue'
import {
  state,
  ui,
  isTapped,
  zoneRegion,
  selectCard,
  canActivateTarget,
  isPickedTarget,
  carriedBy,
  damageOf,
  isSilenced,
  isDisabled,
  cantAttack,
  cantMove,
  cantDefend,
  cantBeTargeted,
  effectiveStrengthMod,
  grantedKeywordsOf,
  countersOf,
  SHIELD_COUNTER,
  isAnimated,
  wardTokenArt,
  beginDrag,
  canCast,
  castShortfall,
  cellSquare,
  cardTargetable,
  cardLiftable,
  clickCard,
} from '../store.js'

const props = defineProps({
  cardId: { type: String, required: true },
  from: { type: String, required: true },
})

const card = computed(() => state.cards[props.cardId])
const isUnder = computed(() => props.from.endsWith(':bot'))
// Under a water site a card is submerged; under a land site, buried.
const underWord = computed(() =>
  zoneRegion(props.from) === 'underwater' ? 'submerged' : 'buried'
)
// Buried or submerged, said in words on a strip across the foot of the card.
// The name is left off: the art right above it already shows which card it is.
const underText = computed(() => (underWord.value === 'submerged' ? 'Submerged' : 'Buried'))
const onBoard = computed(() => cellSquare(props.from) != null)
const tapped = computed(() => isTapped(props.cardId))
// A spell you may cast from outside your hand -- out of a swapped cemetery, or
// from banishment by a cast permit -- glows so it isn't missed.
const castableHere = computed(
  () => !props.from.startsWith('hand:') && !onBoard.value && canCast(props.cardId)
)
// A spell in hand you could cast from there but can't yet: what is missing, in
// words ("Needs 2 mana", "Needs water 1"). Printed cost and threshold stay on the
// art; only the gap between them and what you have now is game state.
const SHORT_WORD = { mana: 'mana', air: 'air', earth: 'earth', fire: 'fire', water: 'water' }
const shortText = computed(() => {
  if (!props.from.startsWith('hand:')) return ''
  const parts = castShortfall(props.cardId).map((s) =>
    s.kind === 'caster'
      ? 'a caster'
      : s.kind === 'mana'
        ? `${s.short} mana`
        : `${SHORT_WORD[s.kind]} ${s.short}`
  )
  return parts.length ? `Needs ${parts.join(', ')}` : ''
})
// Strike is unenforced (any on-board target); attack highlights only legal
// targets when the puzzle enforces (armedAttackLegal falls back to true otherwise).
const targetable = computed(() => cardTargetable(props.cardId, props.from))
// Anything but the armed carrier itself can be picked up, wherever it sits --
// a card in hand is as liftable as one on the board.
const liftable = computed(() => cardLiftable(props.cardId))
// Waiting for this card as an activated ability's target. Unlike attack/strike
// the target can be anywhere the ability allows (a collection avatar, say), so
// this is not gated to the board.
const activatingTarget = computed(() => canActivateTarget(props.cardId))
const carried = computed(() => carriedBy(props.cardId))
const dmg = computed(() => damageOf(props.cardId))
// Silence / Disable are gameplay states (from a passive aura), worth showing.
const silenced = computed(() => isSilenced(props.cardId))
const disabled = computed(() => isDisabled(props.cardId))
// Passive restrictions, badged like silence: no attack / no move / untargetable.
const restrictions = computed(() => {
  const out = []
  if (cantAttack(props.cardId)) out.push({ tag: 'No attack', title: "Can't attack" })
  if (cantMove(props.cardId)) out.push({ tag: 'No move', title: "Can't move" })
  if (cantDefend(props.cardId)) out.push({ tag: 'No defend', title: "Can't move to defend" })
  if (cantBeTargeted(props.cardId)) out.push({ tag: 'Untargetable', title: "Can't be targeted by opponents" })
  return out
})
// Only gameplay changes are shown: a net strength modifier and any keywords
// granted in play (base strength/keywords are already on the card art).
const strengthMod = computed(() => effectiveStrengthMod(props.cardId))
const grantedKw = computed(() => grantedKeywordsOf(props.cardId))
// Named counters placed in play (a 'shield' counter is damage prevention).
const counters = computed(() => countersOf(props.cardId))
const counterTag = ([name, n]) =>
  name === SHIELD_COUNTER ? `🛡${n}` : `${name.slice(0, 4)}×${n}`
const signedStr = computed(() =>
  strengthMod.value > 0 ? `+${strengthMod.value}` : `${strengthMod.value}`
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
  if (isUnder.value) bits.push(underWord.value)
  if (shortText.value) bits.push(`can't cast yet: ${shortText.value.toLowerCase()}`)
  if (tapped.value) bits.push('tapped')
  if (disabled.value) bits.push('disabled')
  else if (silenced.value) bits.push('silenced')
  for (const r of restrictions.value) bits.push(r.title.toLowerCase())
  if (strengthMod.value) bits.push(`strength ${signedStr.value}`)
  if (grantedKw.value.length) bits.push(`gained ${grantedKw.value.join(', ')}`)
  for (const [name, n] of counters.value)
    bits.push(name === SHIELD_COUNTER ? `prevents next ${n} damage` : `${n} ${name} counters`)
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
// What the click does depends on what is armed; the store decides.
function onClick() {
  clickCard(props.cardId, props.from)
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
      'is-yours': !card.enemy,
      'is-opp': card.enemy,
      'no-art': !card.img,
      'is-tapped': tapped,
      'is-under': isUnder,
      attacker: ui.attacker === cardId,
      carrier: ui.carrier === cardId,
      striker: ui.striker === cardId,
      selected: ui.selected === cardId,
      targetable: targetable || activatingTarget,
      'picked-target': isPickedTarget(cardId),
      castable: castableHere,
      'is-short': !!shortText,

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
      class="face"
      :class="{ flipped: card.enemy }"
      draggable="false"
    />
    <!-- No art: the name on a cream face is the only way to tell the card. -->
    <span v-else class="card-name face" :class="{ flipped: card.enemy }">
      {{ card.name }}
    </span>
    <!-- Card type reads from the coloured ring around the art (see the type
         border rules in the stylesheet), not a text badge. -->
    <span v-if="isUnder" class="under-strip" aria-hidden="true"
      ><span class="under-word">{{ underText }}</span
      ><span class="under-glyph">{{ underWord === 'submerged' ? '≈' : '▾' }}</span></span
    >
    <!-- Can't be cast yet: the art greys out and this names the gap. -->
    <span v-if="shortText" class="short-strip" aria-hidden="true">{{ shortText }}</span>
    <!-- Damage counters on the card, a small red pip so a wounded unit reads at
         a glance. The count is also in the token's aria-label above. -->
    <span v-if="dmg" class="dmg-badge" :title="`${dmg} damage`" aria-hidden="true"
      >{{ dmg }} dmg</span
    >
    <!-- Silence / Disable from a passive aura. Both are gameplay states, so
         (unlike base keywords) they get a badge. -->
    <span
      v-if="disabled || silenced"
      class="state-badge"
      :class="disabled ? 'disabled-badge' : 'silenced-badge'"
      :title="disabled ? 'Disabled' : 'Silenced'"
      aria-hidden="true"
    >
      {{ disabled ? 'Disabled' : 'Silenced' }}
    </span>
    <span
      v-else-if="restrictions.length"
      class="state-badge restrict-badge"
      :title="restrictions.map((r) => r.title).join(', ')"
      aria-hidden="true"
    >
      {{ restrictions.map((r) => r.tag).join(' · ') }}
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

    <!-- Named counters from effects, stacked down the left edge. -->
    <div v-if="counters.length" class="ctr-tags" aria-hidden="true">
      <span
        v-for="c in counters"
        :key="c[0]"
        class="ctr-tag"
        :class="{ shield: c[0] === SHIELD_COUNTER }"
        :title="c[0] === SHIELD_COUNTER ? `Prevents the next ${c[1]} damage` : `${c[1]} ${c[0]} counter(s)`"
      >{{ counterTag(c) }}</span>
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
/* ---------- the token skin ----------
   Art is the card. The token adds only game state: whose card it is (the
   edge), what it is doing (rings, strips) and what changed in play (badges).
   Scoped rules outrank the older .card-token rules in style.css. */
.card-token {
  /* Whose card: cream edge for yours, slate for the opponent's (whose cards
     are also drawn upside down, so side is never colour alone). */
  --edge: var(--c-cream-lo);
  --edge-w: 2px;
  font-family: var(--font-ui);
  font-variant-numeric: lining-nums tabular-nums;
}
.card-token.is-opp {
  --edge: var(--c-opp);
}
/* An avatar wears a heavier edge than a minion (replaces the old blue minion /
   orange avatar rings). Sites stay parchment and auras teal. */
.card-token.is-avatar {
  --edge-w: 3px;
}
.card-token.is-site {
  --edge: var(--c-cream-lo);
}
.card-token.is-aura {
  --edge: var(--c-aura);
}
.card-token .face,
.card-token.is-unit .face,
.card-token.is-site .face,
.card-token.is-aura .face,
.card-token.is-avatar .face {
  box-shadow: 0 0 0 var(--edge-w) var(--edge), var(--shadow-card);
}

/* No art: a cream face with the name, the only way to tell the card. */
.card-token .card-name.face,
.carry-chip-name {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 63 / 88;
  padding: var(--sp-1) 3px;
  border: 0;
  border-radius: var(--r-md);
  background: var(--c-cream);
  color: var(--c-ink);
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 400;
  line-height: 1.1;
  text-align: center;
  overflow: hidden;
  overflow-wrap: anywhere;
}

/* Selected: a doubled gold ring on the face. Two lines are the non-colour
   cue; drawn on the face it stays round the card when tapped. Squares clip
   what is drawn outside a card, so only the outer line sits outside (as wide
   as the normal edge); the dark gap is the border and the inner gold line is
   the padding, both inside the card. */
.card-token.selected {
  outline: none;
}
.card-token.selected .face {
  padding: 2px;
  border: 2px solid var(--c-felt-deep);
  background: var(--c-gold);
  background-clip: padding-box;
  box-shadow: 0 0 0 2px var(--c-gold), var(--shadow-card);
}
.card-token.selected .card-name.face {
  background: var(--c-cream);
  outline: 2px solid var(--c-gold);
  outline-offset: -2px;
}
/* Selecting drops the outline above, so the keyboard ring comes back here. */
.card-token:focus-visible {
  outline: 3px solid var(--c-focus);
  outline-offset: -3px;
}

/* Armed to fight: attacker solid red, striker dashed red (was orange). */
.card-token.striker {
  outline: 2px dashed var(--c-danger);
}
@media (prefers-reduced-motion: no-preference) {
  .card-token.attacker,
  .card-token.striker {
    animation: armed-fight 1.2s ease-in-out infinite;
  }
  .card-token.carrier {
    animation: armed-go 1.2s ease-in-out infinite;
  }
}
@keyframes armed-fight {
  0%,
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
  50% {
    box-shadow: 0 0 10px 3px color-mix(in srgb, var(--c-danger) 70%, transparent);
  }
}
@keyframes armed-go {
  0%,
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
  50% {
    box-shadow: 0 0 10px 3px color-mix(in srgb, var(--c-gold) 70%, transparent);
  }
}

/* Foot-of-card strips: a state said in a short sentence-case phrase. */
.under-strip,
.short-strip {
  position: absolute;
  left: 3px;
  right: 3px;
  bottom: 3px;
  z-index: 3;
  padding: 1px var(--sp-1);
  border-radius: var(--r-sm);
  font-size: 0.66em;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
  color: var(--c-cream-hi);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.under-strip {
  background: color-mix(in srgb, var(--c-felt-deep) 88%, transparent);
  border: 1px solid var(--c-line-strong);
  /* Too narrow for the word (small cards on a phone): a glyph instead, rather
     than a clipped "B…". The legend explains it; the card is darkened too. */
  container-type: inline-size;
}
.under-glyph {
  display: none;
}
@container (max-width: 40px) {
  .under-word {
    display: none;
  }
  .under-glyph {
    display: inline;
  }
}
.short-strip {
  background: var(--c-danger-deep);
  white-space: normal;
}
.card-token.is-under .str-badge,
.card-token.is-under .kw-tags {
  bottom: 1.8em;
}
.card-token.is-short > .face {
  filter: grayscale(0.85) brightness(0.62);
}
.ward-token-art {
  position: absolute;
  left: 2px;
  top: 2px;
  z-index: 3;
  width: 34% !important;
  height: auto;
  border-radius: var(--r-sm);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
  pointer-events: none;
}

/* Badges: sentence case, never colour alone (also in the aria-label). */
.dmg-badge,
.state-badge,
.str-badge,
.ctr-tag,
.kw-tag {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  white-space: nowrap;
}
.dmg-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  z-index: 3;
  padding: 0 0.35em;
  border: 1px solid var(--c-danger);
  border-radius: var(--r-pill);
  background: var(--c-danger-deep);
  color: var(--c-cream-hi);
  font-size: 0.68em;
  font-weight: 700;
  line-height: 1.4;
}
.state-badge {
  position: absolute;
  top: 2px;
  left: 2px;
  z-index: 3;
  max-width: calc(100% - 4px);
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 0.3em;
  border-radius: var(--r-sm);
  font-size: 0.6em;
  font-weight: 700;
  line-height: 1.4;
}
.dmg-badge ~ .state-badge {
  max-width: calc(100% - 3.2em);
}
.silenced-badge {
  background: var(--c-raised-2);
  color: var(--c-cream-hi);
  border: 1px dashed var(--c-muted);
}
.disabled-badge {
  background: var(--c-raised);
  color: var(--c-muted-hi);
  border: 1px solid var(--c-line-strong);
}
.restrict-badge {
  background: var(--c-danger-deep);
  color: var(--c-cream-hi);
  border: 1px solid var(--c-danger);
}
.str-badge {
  position: absolute;
  bottom: 2px;
  left: 2px;
  z-index: 3;
  min-width: 1.1em;
  padding: 0 0.3em;
  border-radius: var(--r-sm);
  font-size: 0.64em;
  font-weight: 700;
  line-height: 1.4;
  text-align: center;
}
.str-badge.up {
  background: var(--c-life);
  color: var(--c-life-ink);
  border: 1px solid var(--c-ok);
}
.str-badge.down {
  background: var(--c-danger-deep);
  color: var(--c-cream-hi);
  border: 1px solid var(--c-danger);
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
.ctr-tags {
  position: absolute;
  top: 1.5em;
  left: 2px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  pointer-events: none;
}
.kw-tag,
.ctr-tag {
  padding: 0 0.3em;
  border: 1px solid var(--c-cream-lo);
  border-radius: var(--r-sm);
  background: var(--c-cream);
  color: var(--c-ink);
  font-size: 0.54em;
  font-weight: 700;
  line-height: 1.4;
}
/* Keyword names arrive lower case; say them in sentence case. */
.kw-tag::first-letter,
.ctr-tag::first-letter {
  text-transform: uppercase;
}
.ctr-tag.shield {
  border-color: var(--c-gold);
  background: var(--c-gold);
}

/* Transient event flashes, once per ui.fx entry; off for reduced motion. */
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
@keyframes fx-trigger {
  0%,
  50%,
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
  20%,
  70% {
    box-shadow: 0 0 14px 5px color-mix(in srgb, var(--c-gold) 85%, transparent);
  }
}
@keyframes fx-genesis {
  0% {
    transform: scale(0.7);
    box-shadow: 0 0 24px 10px color-mix(in srgb, var(--c-ok) 95%, transparent);
    filter: brightness(1.8);
  }
  60% {
    transform: scale(1.06);
    box-shadow: 0 0 12px 4px color-mix(in srgb, var(--c-ok) 50%, transparent);
    filter: brightness(1.15);
  }
  100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 transparent;
    filter: none;
  }
}
@keyframes fx-impact {
  0% {
    box-shadow: 0 0 0 0 transparent;
  }
  25% {
    box-shadow: 0 0 16px 6px color-mix(in srgb, var(--c-danger) 90%, transparent);
    transform: translateX(2px);
  }
  50% {
    transform: translateX(-2px);
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
    transform: translateX(0);
  }
}
</style>
