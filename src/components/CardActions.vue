<script setup>
import { computed, ref } from 'vue'
import TriggerEditor from './TriggerEditor.vue'
import {
  state,
  ui,
  zoneOf,
  zoneLabel,
  clearSelection,
  removeCard,
  toggleSite,
  toggleWater,
  toggleAura,
  toggleUnit,
  toggleAvatar,
  toggleTap,
  isTapped,
  isUnit,
  toggleControl,
  beginMove,
  beginAttack,
  beginStrike,
  beginShoot,
  beginIntercept,
  beginPickup,
  beginActivate,
  activatedAbilities,
  effectiveRanged,
  canCharge,
  chargeForMana,
  markDamage,
  damageOf,
  dropCarried,
  carriedBy,
  carrierOf,
} from '../store.js'

// Everything a card can do lives here rather than on postage-stamp buttons
// pinned to the card itself, which are unusable once cards shrink to fit a
// board square (and impossible to hit on a touch screen).
const card = computed(() => (ui.selected ? state.cards[ui.selected] : null))
const zone = computed(() => (ui.selected ? zoneOf(ui.selected) : null))
const onBoard = computed(() => /^cell:\d+:(top|bot)$/.test(zone.value || ''))
const editing = computed(() => state.mode === 'editor' && !state.recording)
const inPool = computed(() => zone.value === 'pool')
// Attacking and striking are realm actions: only a unit in play fights, and it
// can only hit something at its own location. A card sitting in a hand,
// cemetery or the storyline has nothing to attack, so the buttons stay hidden
// until it is a unit on the board.
const canFight = computed(() => onBoard.value && isUnit(ui.selected))
const moving = computed(() => ui.moving && ui.moving === ui.selected)
const attacking = computed(() => ui.attacker && ui.attacker === ui.selected)
const striking = computed(() => ui.striker && ui.striker === ui.selected)
const shooting = computed(() => ui.shooting && ui.shooting === ui.selected)
// A unit shows Shoot only when it actually has range (from a Ranged keyword).
const canShoot = computed(() => onBoard.value && effectiveRanged(ui.selected) > 0)
const intercepting = computed(() => ui.intercepting && ui.intercepting === ui.selected)
// Charge: only offered while logging, for a unit summoned this turn.
const chargeable = computed(() => logging.value && !!ui.selected && canCharge(ui.selected))
const carrying = computed(() => ui.carrier && ui.carrier === ui.selected)
// Pick up and put down are logged moves, so they belong wherever moves are
// being written down: while recording a solution, and while playing one.
const logging = computed(() => state.recording || state.mode === 'play')
// Picking something up is a unit's realm basic ability, like move and attack:
// only a unit already on the board reaches for an artifact at its location.
// A card in a hand or cemetery is not in play, and a site or aura is not a
// unit, so none of them offer Pick up.
const canPickUp = computed(
  () => (logging.value || editing.value) && onBoard.value && isUnit(ui.selected)
)
// What this card holds, and who holds it -- the two sides of the same relation
// and the two buttons the bar has to offer.
const holding = computed(() => (ui.selected ? carriedBy(ui.selected) : []))
const heldBy = computed(() => (ui.selected ? carrierOf(ui.selected) : null))

// The abilities editor is a modal, opened from the bar. How many a card has is
// worth showing on the button so an editor can see at a glance which cards are
// already wired up.
const showAbilities = ref(false)
const abilityCount = computed(() => card.value?.abilities?.length || 0)

// Activated abilities usable right now: only while a solution is being recorded
// or played (they log a move), and only those live in the card's current zone.
const liveAbilities = computed(() =>
  logging.value && ui.selected ? activatedAbilities(ui.selected) : []
)
const isArming = (abilityId) =>
  ui.activating &&
  ui.activating.cardId === ui.selected &&
  ui.activating.abilityId === abilityId
// The ability waiting for a target, so the bar can prompt for one.
const armingAbility = computed(
  () =>
    (ui.activating &&
      liveAbilities.value.find((a) => a.id === ui.activating.abilityId)) ||
    null
)
function abilityLabel(a) {
  const bits = [a.name || 'Ability']
  if (a.cost.mana) bits.push(`${a.cost.mana}◇`)
  return bits.join(' ')
}

// Removing a card takes it out of the puzzle for good -- Undo walks back
// moves, not deletions -- and the button sits in a row of harmless toggles,
// so it asks first.
function onRemove() {
  if (!card.value) return
  if (!confirm(`Remove "${card.value.name}" from the puzzle? This cannot be undone.`))
    return
  removeCard(ui.selected)
}
</script>

<template>
  <div
    v-if="card && !ui.awaitingDefender"
    class="card-actions"
    role="toolbar"
    :aria-label="`Actions for ${card.name}`"
  >
    <!-- No card art here on purpose: this bar was the app's only image sized
         in absolute pixels, so a host theme's `img { width: 100% }` blew it up
         to the full width of the bar. The card itself is highlighted on the
         board, and its name is right here, so the thumbnail earned nothing. -->
    <div class="ca-id">
      <div class="ca-name">{{ card.name }}</div>
      <div class="ca-zone">
        {{ zone ? zoneLabel(zone) : 'Nowhere' }}
        <template v-if="heldBy">
          · carried by {{ state.cards[heldBy]?.name }}
        </template>
      </div>
    </div>

    <div class="ca-buttons">
      <button
        v-for="a in liveAbilities"
        :key="a.id"
        class="btn"
        :class="{ active: isArming(a.id) }"
        :title="a.text || a.name"
        @click="beginActivate(ui.selected, a.id)"
      >
        ✧ {{ isArming(a.id) ? `Cancel ${a.name || 'ability'}` : abilityLabel(a) }}
      </button>
      <button
        v-if="onBoard && isUnit(ui.selected)"
        class="btn"
        :class="{ active: moving }"
        @click="beginMove(ui.selected)"
      >
        {{ moving ? ' Cancel move' : ' Move' }}
      </button>
      <button
        v-if="canFight"
        class="btn"
        :class="{ danger: attacking }"
        @click="beginAttack(ui.selected)"
      >
        {{ attacking ? ' Cancel attack' : ' Attack' }}
      </button>
      <button
        v-if="canFight"
        class="btn"
        :class="{ danger: striking }"
        @click="beginStrike(ui.selected)"
      >
        {{ striking ? ' Cancel strike' : ' Strike' }}
      </button>
      <button
        v-if="canShoot"
        class="btn"
        :class="{ danger: shooting }"
        @click="beginShoot(ui.selected)"
      >
        {{ shooting ? 'Cancel shoot' : `➶ Shoot (${effectiveRanged(ui.selected)})` }}
      </button>
      <button
        v-if="canFight"
        class="btn"
        :class="{ danger: intercepting }"
        @click="beginIntercept(ui.selected)"
      >
        {{ intercepting ? 'Cancel intercept' : '⚔ Intercept' }}
      </button>
      <button
        v-if="onBoard"
        class="btn"
        :class="{ active: isTapped(ui.selected) }"
        @click="toggleTap(ui.selected)"
      >
        {{ isTapped(ui.selected) ? '⟳ Untap' : '↷ Tap' }}
      </button>
      <button
        v-if="chargeable"
        class="btn"
        title="Summoned this turn: tap to add 1 mana (Charge)"
        @click="chargeForMana(ui.selected)"
      >
        ⚡ Charge for mana
      </button>
      <button v-if="onBoard" class="btn" @click="markDamage(ui.selected, 1)">
        ✷ Damage
      </button>
      <button
        v-if="onBoard && damageOf(ui.selected)"
        class="btn"
        @click="markDamage(ui.selected, -1)"
      >
        ♥ Heal ({{ damageOf(ui.selected) }})
      </button>
      <button
        v-if="canPickUp"
        class="btn"
        :class="{ danger: carrying }"
        @click="beginPickup(ui.selected)"
      >
        {{ carrying ? ' Cancel pick up' : ' Pick up' }}
      </button>
      <button
        v-if="(logging || editing) && heldBy"
        class="btn"
        @click="dropCarried(ui.selected)"
      >
        ▽ Put down
      </button>
      <button
        v-for="id in holding"
        :key="id"
        class="btn"
        :title="`Put down ${state.cards[id]?.name}`"
        @click="dropCarried(id)"
      >
        ▽ Drop {{ state.cards[id]?.name }}
      </button>
      <button v-if="editing" class="btn" @click="toggleControl(ui.selected)">
        ⇅ {{ card.enemy ? 'Give to player' : 'Give to opponent' }}
      </button>
      <button
        v-if="editing"
        class="btn"
        :class="{ active: abilityCount }"
        @click="showAbilities = true"
      >
        ✧ Abilities{{ abilityCount ? ` (${abilityCount})` : '' }}
      </button>
      <button
        v-if="editing && inPool"
        class="btn"
        :class="{ active: card.unit && !card.avatar }"
        @click="toggleUnit(ui.selected)"
      >
        ♟ {{ (card.unit && !card.avatar) ? 'Not a minion' : 'Mark as minion' }}
      </button>
      <button
        v-if="editing && inPool"
        class="btn"
        :class="{ active: card.avatar }"
        @click="toggleAvatar(ui.selected)"
      >
       {{ card.avatar ? 'Not an avatar' : 'Mark as avatar' }}
      </button>
      <button
        v-if="editing && inPool"
        class="btn"
        :class="{ active: card.site }"
        @click="toggleSite(ui.selected)"
      >
        ⛰ {{ card.site ? 'Not a site' : 'Mark as site' }}
      </button>
      <button
        v-if="editing && card.site"
        class="btn"
        :class="{ active: card.water }"
        :title="card.water ? 'Water site: its subsurface is underwater' : 'Land site: its subsurface is underground'"
        @click="toggleWater(ui.selected)"
      >
        ≈ {{ card.water ? 'Water site' : 'Land site' }}
      </button>
      <button
        v-if="editing && inPool"
        class="btn"
        :class="{ active: card.aura }"
        @click="toggleAura(ui.selected)"
      >
        ✦ {{ card.aura ? 'Not an aura' : 'Mark as aura' }}
      </button>
      <button v-if="editing" class="btn danger" @click="onRemove">
        × Remove card
      </button>
    </div>

    <!-- Combat stats: authored for the engine, shown here only in the editor
         (the card art shows them to players). Avatars use the side's life. -->
    <div
      v-if="editing && isUnit(ui.selected)"
      style="display: flex; gap: 0.8rem; padding: 0.35rem 0.1rem; font-size: 0.85rem"
    >
      <label style="display: flex; align-items: center; gap: 0.3rem">
        Power
        <input v-model.number="card.power" type="number" class="text-input" style="width: 3.4rem" />
      </label>
      <label v-if="!card.avatar" style="display: flex; align-items: center; gap: 0.3rem">
        Life
        <input v-model.number="card.life" type="number" class="text-input" style="width: 3.4rem" />
      </label>
    </div>

    <p v-if="armingAbility" class="ca-hint">
      {{ armingAbility.target.prompt || 'Now click the target for this ability.' }}
    </p>
    <p v-else-if="moving" class="ca-hint">Now click a destination square to move and tap this minion.</p>
    <p v-else-if="attacking" class="ca-hint">Now click the minion or site to attack (will tap).</p>
    <p v-else-if="striking" class="ca-hint">Now click the minion or site to strike (does not tap).</p>
    <p v-else-if="shooting" class="ca-hint">Now click a unit in line of fire to shoot it (taps).</p>
    <p v-else-if="intercepting" class="ca-hint">Now click an enemy unit to intercept and fight it (taps).</p>
    <p v-else-if="carrying" class="ca-hint">
      Now click the card to pick up — it travels with this one until dropped.
    </p>
    <p v-else-if="heldBy" class="ca-hint">
      Carried by {{ state.cards[heldBy]?.name }} and travelling with it. Put it
      down to move it on its own.
    </p>
    <p v-else class="ca-hint">Click any zone to move without tapping, or choose an action above.</p>

    <button
      class="ca-close"
      title="Deselect (Esc)"
      aria-label="Deselect this card (Escape)"
      @click="clearSelection"
    >
      ×
    </button>

    <TriggerEditor
      v-if="showAbilities && editing"
      :card-id="ui.selected"
      @close="showAbilities = false"
    />
  </div>
</template>
