<script setup>
import { computed, ref } from 'vue'
import TriggerEditor from './TriggerEditor.vue'
import ThresholdIcon from './ThresholdIcon.vue'
import {
  state,
  ui,
  zoneOf,
  zoneLabel,
  clearSelection,
  removeCard,
  toggleSite,
  toggleCastFromCemetery,
  toggleAura,
  toggleArtifact,
  toggleMonument,
  toggleLanceToken,
  setTokenTemplate,
  TOKEN_TEMPLATE_KINDS,
  TOKEN_NAMES,
  toggleMagic,
  canAffordCast,
  canCastFrom,
  castSourceOk,
  castControlled,
  castManaCost,
  abilityManaCost,
  abilityCostBlocked,
  abilityUsesLeft,
  activatePickState,
  beginCast,
  isSpell,
  cardTypeLabel,
  toggleUnit,
  toggleAvatar,
  isUnit,
  isAvatar,
  drawFromDeck,
  deckSize,
  toggleControl,
  beginMove,
  beginAttack,
  beginShoot,
  beginPickup,
  beginActivate,
  canDeclineActivate,
  declineActivate,
  destPrompt,
  activatedAbilities,
  effectiveRanged,
  canCharge,
  chargeForMana,
  markDamage,
  damageOf,
  dropCarried,
  carriedBy,
  carrierOf,
  isTapped,
  tapBlockedBySickness,
} from '../store.js'

// Everything a card can do lives here rather than on postage-stamp buttons
// pinned to the card itself, which are unusable once cards shrink to fit a
// board square (and impossible to hit on a touch screen).
const card = computed(() => (ui.selected ? state.cards[ui.selected] : null))
const zone = computed(() => (ui.selected ? zoneOf(ui.selected) : null))
const onBoard = computed(() => /^cell:\d+:(top|bot)$/.test(zone.value || ''))
const editing = computed(() => state.mode === 'editor' && !state.recording)
const inPool = computed(() => zone.value === 'pool')
const inHand = computed(() => zone.value?.startsWith('hand:'))
const inGrave = computed(() => zone.value?.startsWith('grave:'))
// Where a spell can be cast from: the hand, or the cemetery if the card grants
// it. Drives the Cast button / drag hint so a graveyard-castable spell is playable.
// A cast permit (banishAndCast) makes a spell castable from where it lies too.
const castSource = computed(() => !!ui.selected && castSourceOk(ui.selected))
// In play the solver casts only what they are the caster of -- which includes an
// opponent's card out of a swapped cemetery or granted by a permit.
const castLocked = computed(
  () => state.mode === 'play' && !!ui.selected && !castControlled(ui.selected)
)
// The picker's progress for multi-card targets ("banish three spells").
const pickState = computed(() => activatePickState())
// What a card provides (mana / elemental affinity), for the header line.
const providesText = computed(() => {
  const c = card.value
  if (!c) return ''
  const bits = []
  if (c.manaProvided) bits.push(`${c.manaProvided}◇`)
  for (const el of ['air', 'earth', 'fire', 'water']) {
    if (c.affinity?.[el]) bits.push(`${c.affinity[el]} ${el}`)
  }
  return bits.join(', ')
})
// A magic being aimed (its cast is armed, waiting for a target/square).
const casting = computed(
  () => ui.activating?.cast && ui.activating.cardId === ui.selected
)
// Attacking is a realm action: only a unit in play fights, and it can only hit
// something within reach. A card sitting in a hand, cemetery or the storyline
// has nothing to attack, so the button stays hidden until it is a unit on the
// board.
// A tapped unit has spent its action for the turn: it can no longer move,
// attack, shoot, or use activated abilities. This applies to minions and
// avatars alike (both report as units).
const tapped = computed(() => !!ui.selected && isTapped(ui.selected))
// In play mode the solver only drives their own side: an opponent card's action
// bar (cast, move, attack, abilities, pick up…) is look-only. The editor and
// recording keep full control of both sides. Mirrors playerControls() in the
// store, which enforces the same rule for drag actions.
const enemyLocked = computed(() => state.mode === 'play' && !!card.value?.enemy)
// Summoning sickness: a minion that entered the realm this turn can't tap to pay
// costs (no Move & Attack, Shoot, or tap-cost abilities) unless it has Charge.
// Only while rules are enforced -- mirrors the store's own gates.
const sick = computed(() => !!ui.selected && tapBlockedBySickness(ui.selected))
const canFight = computed(() => onBoard.value && isUnit(ui.selected) && !tapped.value && !sick.value && !enemyLocked.value)
const canMove = computed(() => onBoard.value && isUnit(ui.selected) && !tapped.value && !sick.value && !enemyLocked.value)
const moving = computed(() => ui.moving && ui.moving === ui.selected)
const attacking = computed(() => ui.attacker && ui.attacker === ui.selected)
const shooting = computed(() => ui.shooting && ui.shooting === ui.selected)
// A unit shows Shoot only when it actually has range (from a Ranged keyword).
const canShoot = computed(() => onBoard.value && effectiveRanged(ui.selected) > 0 && !tapped.value && !sick.value && !enemyLocked.value)
// An avatar on the board can draw from its owner's decks (its basic action, in
// place of tapping). The buttons appear only when the matching deck has cards.
const isAvatarInPlay = computed(() => onBoard.value && isAvatar(ui.selected) && !enemyLocked.value)
const atlasCount = computed(() =>
  isAvatarInPlay.value ? deckSize(ui.selected, 'atlas') : 0
)
const spellbookCount = computed(() =>
  isAvatarInPlay.value ? deckSize(ui.selected, 'spellbook') : 0
)
// Charge: only offered while logging, for a unit summoned this turn.
const chargeable = computed(() => logging.value && !!ui.selected && canCharge(ui.selected) && !enemyLocked.value)
const carrying = computed(() => ui.carrier && ui.carrier === ui.selected)
// Pick up and put down are logged moves, so they belong wherever moves are
// being written down: while recording a solution, and while playing one.
const logging = computed(() => state.recording || state.mode === 'play')
// Picking something up is a unit's realm basic ability, like move and attack:
// only a unit already on the board reaches for an artifact at its location.
// A card in a hand or cemetery is not in play, and a site or aura is not a
// unit, so none of them offer Pick up.
const canPickUp = computed(
  () => (logging.value || editing.value) && onBoard.value && isUnit(ui.selected) && !enemyLocked.value
)
// What this card holds, and who holds it -- the two sides of the same relation
// and the two buttons the bar has to offer.
const holding = computed(() =>
  ui.selected && !enemyLocked.value ? carriedBy(ui.selected) : []
)
const heldBy = computed(() => (ui.selected ? carrierOf(ui.selected) : null))

// The abilities editor is a modal, opened from the bar. How many a card has is
// worth showing on the button so an editor can see at a glance which cards are
// already wired up.
const showAbilities = ref(false)
const abilityCount = computed(() => card.value?.abilities?.length || 0)

// Activated abilities usable right now: only while a solution is being recorded
// or played (they log a move), and only those live in the card's current zone.
const liveAbilities = computed(() => {
  if (!logging.value || !ui.selected || enemyLocked.value) return []
  const abilities = activatedAbilities(ui.selected)
  // A tapped card can't pay a tap cost, so abilities that require tapping drop
  // out; abilities with no tap cost stay usable even while tapped. The same
  // goes for a summon-sick card, which can't tap to pay costs.
  if (tapped.value || sick.value) return abilities.filter((a) => !a.cost?.tap)
  return abilities
})
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
  const mana = ui.selected ? abilityManaCost(ui.selected, a) : a.cost.mana
  if (mana) bits.push(`${mana}◇`)
  // A limited ability shows its uses left this turn while solving/recording.
  const limit = Number(a.cost.perTurn) || 0
  if (limit && ui.selected && (state.mode === 'play' || state.recording)) {
    bits.push(`(${abilityUsesLeft(ui.selected, a)}/${limit})`)
  }
  return bits.join(' ')
}

const usedUp = (a) =>
  (state.mode === 'play' || state.recording) &&
  !!ui.selected &&
  abilityUsesLeft(ui.selected, a) <= 0

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
    v-if="card && !ui.awaitingDefender && !ui.storyChoice"
    class="card-actions"
    role="toolbar"
    :aria-label="`Actions for ${card.name}`"
  >
    <!-- No card art here on purpose: this bar was the app's only image sized
         in absolute pixels, so a host theme's `img { width: 100% }` blew it up
         to the full width of the bar. The card itself is highlighted on the
         board, and its name is right here, so the thumbnail earned nothing. -->
    <div class="ca-id">
      <div class="ca-name">
        {{ card.name }}
        <span
          style="font-size: 0.72em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; margin-left: 0.4em; padding: 0.05em 0.4em; border: 1px solid currentColor; border-radius: 4px"
        >{{ cardTypeLabel(ui.selected) }}</span>
      </div>
      <div class="ca-zone">
        {{ zone ? zoneLabel(zone) : 'Nowhere' }}
        <template v-if="heldBy">
          · carried by {{ state.cards[heldBy]?.name }}
        </template>
        <template v-if="providesText"> · provides {{ providesText }}</template>
      </div>
    </div>

    <div class="ca-buttons">
      <button
        v-if="castSource && card.magic && (state.mode === 'play' || state.recording) && !castLocked"
        class="btn primary"
        :class="{ active: casting }"
        :disabled="(!canAffordCast(ui.selected) || !canCastFrom(ui.selected)) && !casting"
        :title="
          !canAffordCast(ui.selected)
            ? 'Not enough mana or threshold to cast'
            : !canCastFrom(ui.selected)
              ? 'Needs a caster (Avatar or Spellcaster unit) in play'
              : 'Cast this magic spell'
        "
        @click="beginCast(ui.selected)"
      >
        {{ casting ? 'Cancel cast' : `✦ Cast${castManaCost(ui.selected) ? ` ${castManaCost(ui.selected)}◇` : ''}` }}
      </button>
      <p
        v-if="castSource && !card.magic && isSpell(ui.selected) && (state.mode === 'play' || state.recording) && !castLocked"
        class="ca-hint"
      >
        Drag onto the board (or click a square) to cast.
      </p>
      <button
        v-for="a in liveAbilities"
        :key="a.id"
        class="btn"
        :class="{ active: isArming(a.id) }"
        :title="
          usedUp(a)
            ? 'Already used as many times as allowed this turn'
            : abilityCostBlocked(ui.selected, a)
              ? 'Not enough mana or threshold to activate'
              : a.text || a.name
        "
        :disabled="(usedUp(a) || abilityCostBlocked(ui.selected, a)) && !isArming(a.id)"
        @click="beginActivate(ui.selected, a.id)"
      >
        ✧ {{ isArming(a.id) ? `Cancel ${a.name || 'ability'}` : abilityLabel(a) }}
      </button>
      <button
        v-if="canMove"
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
        {{ attacking ? 'Cancel attack' : '⚔ Attack & Move' }}
      </button>
      <button
        v-if="canShoot"
        class="btn"
        :class="{ danger: shooting }"
        @click="beginShoot(ui.selected)"
      >
        {{ shooting ? 'Cancel shoot' : `➶ Shoot (${effectiveRanged(ui.selected)})` }}
      </button>
      <!-- Draw is an avatar's basic action (in place of the tap it replaces):
           pull the top site or spell into its owner's hand. -->
      <button
        v-if="isAvatarInPlay && atlasCount"
        class="btn"
        title="Draw the top site from your Atlas into your hand"
        @click="drawFromDeck(ui.selected, 'atlas')"
      >
        ⛰ Draw site ({{ atlasCount }})
      </button>
      <button
        v-if="isAvatarInPlay && spellbookCount"
        class="btn"
        title="Draw the top spell from your Spellbook into your hand"
        @click="drawFromDeck(ui.selected, 'spellbook')"
      >
        ✦ Draw spell ({{ spellbookCount }})
      </button>
      <button
        v-if="chargeable"
        class="btn"
        title="Summoned this turn: tap to add 1 mana (Charge)"
        @click="chargeForMana(ui.selected)"
      >
        ⚡ Charge for mana
      </button>
      <button
        v-if="onBoard && damageOf(ui.selected) && !enemyLocked"
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
        v-if="(logging || editing) && heldBy && !enemyLocked"
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
        v-if="editing && inPool"
        class="btn"
        :class="{ active: card.aura }"
        @click="toggleAura(ui.selected)"
      >
        ✦ {{ card.aura ? 'Not an aura' : 'Mark as aura' }}
      </button>
      <button
        v-if="editing && inPool"
        class="btn"
        :class="{ active: card.artifact }"
        @click="toggleArtifact(ui.selected)"
      >
        ⚱ {{ card.artifact ? 'Not an artifact' : 'Mark as artifact' }}
      </button>
      <button
        v-if="editing && inPool"
        class="btn"
        :class="{ active: card.magic }"
        title="A magic spell: cast from hand, resolves, then goes to the cemetery"
        @click="toggleMagic(ui.selected)"
      >
        ✦ {{ card.magic ? 'Not a magic' : 'Mark as magic' }}
      </button>
      <button
        v-if="editing && isSpell(ui.selected)"
        class="btn"
        :class="{ active: card.castFromCemetery }"
        :title="card.castFromCemetery
          ? 'May be cast from the cemetery as well as the hand'
          : 'Can only be cast from the hand (default)'"
        @click="toggleCastFromCemetery(ui.selected)"
      >
        ⚰ {{ card.castFromCemetery ? 'Casts from cemetery' : 'Hand-cast only' }}
      </button>
      <button
        v-if="editing && card.artifact"
        class="btn"
        :class="{ active: card.monument }"
        :title="card.monument ? 'A monument can be targeted but not carried' : 'Make this artifact a Monument (cannot be carried)'"
        @click="toggleMonument(ui.selected)"
      >
        ▤ {{ card.monument ? 'Not a monument' : 'Monument' }}
      </button>
      <button
        v-if="editing && card.artifact"
        class="btn"
        :class="{ active: card.lanceToken }"
        title="Lance token: +1 strike damage and first strike; breaks when its carrier strikes"
        @click="toggleLanceToken(ui.selected)"
      >
        ⌇ {{ card.lanceToken ? 'Not a lance' : 'Lance token' }}
      </button>
      <!-- Designate this card as a token kind's template: generated tokens of
           that kind then use its art, name and abilities. -->
      <label
        v-if="editing"
        class="btn"
        :class="{ active: card.tokenKind }"
        title="Use this card as the art (and abilities) for generated tokens of this kind"
        style="display: inline-flex; align-items: center; gap: 0.3em"
      >
        ◈ Token
        <select
          :value="card.tokenKind || ''"
          style="font: inherit"
          @change="setTokenTemplate(ui.selected, $event.target.value)"
        >
          <option value="">none</option>
          <option v-for="k in TOKEN_TEMPLATE_KINDS" :key="k" :value="k">{{ TOKEN_NAMES[k] }}</option>
        </select>
      </label>
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
      <label
        v-if="!card.avatar"
        style="display: flex; align-items: center; gap: 0.3rem"
        title="Defense power (toughness). Leave blank to use Power."
      >
        Defense
        <input
          v-model.number="card.defense"
          type="number"
          placeholder="=Power"
          class="text-input"
          style="width: 3.4rem"
        />
      </label>
    </div>

    <!-- Cast cost, authored on the spell card: mana (spent) + elemental
         thresholds (required). Shown in the editor for spell cards. -->
    <div
      v-if="editing && isSpell(ui.selected) && card.spellCost"
      style="display: flex; flex-wrap: wrap; gap: 0.6rem; padding: 0.35rem 0.1rem; font-size: 0.85rem"
    >
      <label style="display: flex; align-items: center; gap: 0.3rem">
        Cost ◇
        <input v-model.number="card.spellCost.mana" type="number" min="0" title="mana cost" class="text-input" style="width: 3rem" />
      </label>
      <label v-for="el in ['air','earth','fire','water']" :key="el" style="display: flex; align-items: center; gap: 0.25rem">
        <ThresholdIcon :element="el" />
        <input v-model.number="card.spellCost[el]" type="number" min="0" :title="`${el} threshold required`" class="text-input" style="width: 2.6rem" />
      </label>
    </div>

    <!-- What this card provides in play: mana + elemental affinity. Only sites
         provide these, so the row is shown only once a card is marked a site.
         Affinity is the threshold spells are checked against. -->
    <div
      v-if="editing && card.site && card.affinity"
      style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; padding: 0.35rem 0.1rem; font-size: 0.85rem"
    >
      <span style="opacity: 0.7">Provides</span>
      <label style="display: flex; align-items: center; gap: 0.3rem">
        ◇
        <input v-model.number="card.manaProvided" type="number" min="0" title="mana provided" class="text-input" style="width: 3rem" />
      </label>
      <label v-for="el in ['air','earth','fire','water']" :key="el" style="display: flex; align-items: center; gap: 0.25rem">
        <ThresholdIcon :element="el" />
        <input v-model.number="card.affinity[el]" type="number" min="0" :title="`${el} affinity provided`" class="text-input" style="width: 2.6rem" />
      </label>
    </div>

    <p v-if="armingAbility" class="ca-hint">
      {{
        ui.activating.dest
          ? destPrompt(armingAbility)
          : pickState?.choosing
            ? 'Now click the picked card you want to be able to cast.'
            : pickState
              ? `${armingAbility.target.prompt || 'Pick the cards for this ability'} (${pickState.picked}/${pickState.needed}).`
              : armingAbility.target.prompt || 'Now click the target for this ability.'
      }}
    </p>
    <!-- An optional ("may") target can be resolved with nothing chosen: the
         target effects are skipped, the rest of the ability still runs. -->
    <button
      v-if="canDeclineActivate()"
      class="btn small"
      title="Resolve this ability without choosing a target"
      @click="declineActivate"
    >
      Resolve without target
    </button>
    <p v-else-if="moving" class="ca-hint">Now click a destination square to move and tap this minion.</p>
    <p v-else-if="attacking" class="ca-hint">Now click the target — this unit moves to it, attacks, and taps.</p>
    <p v-else-if="shooting" class="ca-hint">Now click a unit in line of fire to shoot it (taps).</p>
    <p v-else-if="carrying" class="ca-hint">
      Now click the card to pick up — it travels with this one until dropped.
    </p>
    <p v-else-if="heldBy" class="ca-hint">
      Carried by {{ state.cards[heldBy]?.name }} and travelling with it. Put it
      down to move it on its own.
    </p>
    <p v-else-if="sick && onBoard && !enemyLocked" class="ca-hint">
      Summoned this turn: summoning sickness stops it tapping to move, attack,
      shoot, or pay for abilities until end of turn.
    </p>
    <p v-else-if="enemyLocked" class="ca-hint">
      This is your opponent's card — you can't act with it. The puzzle plays the
      opponent's side automatically.
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
