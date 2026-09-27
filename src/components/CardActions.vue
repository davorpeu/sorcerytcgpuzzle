<script setup>
import { computed } from "vue";
import {
  state,
  ui,
  zoneOf,
  clearSelection,
  canAffordCast,
  canCastFrom,
  castSourceOk,
  castControlled,
  castManaCost,
  abilityManaCost,
  abilityCostBlocked,
  abilityUsesLeft,
  activatePickState,
  activeAbility,
  shooterStage,
  canFinishPicks,
  finishPicks,
  beginCast,
  isSpell,
  isUnit,
  isOversized,
  isAvatar,
  drawFromDeck,
  deckSize,
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
  moveBlockedByPassive,
  attackBlockedByPassive,
  isAssumedForm,
} from "../store.js";

// 'mat': the floating bar under the board (play). 'column': the same actions
// stacked in the editor's Card tab under "On the table" -- no floating chrome
// and no ×, since Esc and the tab itself deselect. The editor-only setup rows
// (side, kind, stats, costs, abilities, remove) live in CardSetup.
const props = defineProps({
  placement: {
    type: String,
    default: "mat",
    validator: (v) => v === "mat" || v === "column",
  },
});
const inColumn = computed(() => props.placement === "column");

// Everything a card can do lives here rather than on postage-stamp buttons
// pinned to the card itself, which are unusable once cards shrink to fit a
// board square (and impossible to hit on a touch screen).
const card = computed(() => (ui.selected ? state.cards[ui.selected] : null));
const zone = computed(() => (ui.selected ? zoneOf(ui.selected) : null));
// An animated aura is an oversized minion standing on its intersection: it is
// on the board too, and gets the same unit actions (move, attack, ...).
const onBoard = computed(
  () =>
    /^cell:\d+:(top|bot)$/.test(zone.value || "") ||
    (!!ui.selected && isOversized(ui.selected))
);
const oversizedSelected = computed(() => !!ui.selected && isOversized(ui.selected));
const editing = computed(() => state.mode === "editor" && !state.recording);
const inPool = computed(() => zone.value === "pool");
const inHand = computed(() => zone.value?.startsWith("hand:"));
const inGrave = computed(() => zone.value?.startsWith("grave:"));
// Where a spell can be cast from: the hand, or the cemetery if the card grants
// it. Drives the Cast button / drag hint so a graveyard-castable spell is playable.
// A cast permit (banishAndCast) makes a spell castable from where it lies too.
const castSource = computed(() => !!ui.selected && castSourceOk(ui.selected));
// In play the solver casts only what they are the caster of -- which includes an
// opponent's card out of a swapped cemetery or granted by a permit.
const castLocked = computed(
  () => state.mode === "play" && !!ui.selected && !castControlled(ui.selected)
);
// The picker's progress for multi-card targets ("banish three spells").
const pickState = computed(() => activatePickState());
// A magic being aimed (its cast is armed, waiting for a target/square).
const casting = computed(
  () => ui.activating?.cast && ui.activating.cardId === ui.selected
);
// Attacking is a realm action: only a unit in play fights, and it can only hit
// something within reach. A card sitting in a hand, cemetery or the storyline
// has nothing to attack, so the button stays hidden until it is a unit on the
// board.
// A tapped unit has spent its action for the turn: it can no longer move,
// attack, shoot, or use activated abilities. This applies to minions and
// avatars alike (both report as units).
const tapped = computed(() => !!ui.selected && isTapped(ui.selected));
// In play mode the solver only drives their own side: an opponent card's action
// bar (cast, move, attack, abilities, pick up…) is look-only. The editor and
// recording keep full control of both sides. Mirrors playerControls() in the
// store, which enforces the same rule for drag actions.
const enemyLocked = computed(
  () => state.mode === "play" && !!card.value?.enemy
);
// Summoning sickness: a minion that entered the realm this turn can't tap to pay
// costs (no Move & Attack, Shoot, or tap-cost abilities) unless it has Charge.
// Only while rules are enforced -- mirrors the store's own gates.
const sick = computed(() => !!ui.selected && tapBlockedBySickness(ui.selected));
// A passive "can't attack" / "can't move" hides the matching action while
// enforcing (the store would refuse it anyway). A unit that can't move may still
// attack on its own square, so Attack stays.
// The buttons themselves show for any of your units on the board; when one
// can't be used right now it stays visible but disabled, with the reason as
// its tooltip, so the bar always reads like a unit's.
const unitInPlay = computed(
  () => onBoard.value && isUnit(ui.selected) && !enemyLocked.value
);
const tapReason = computed(() =>
  tapped.value
    ? "Tapped: it has already acted this turn"
    : sick.value
    ? "Summoning sickness: it entered the realm this turn"
    : ""
);
const fightBlocked = computed(
  () =>
    tapReason.value ||
    (attackBlockedByPassive(ui.selected) ? "Can't attack" : "")
);
const moveBlocked = computed(
  () =>
    tapReason.value || (moveBlockedByPassive(ui.selected) ? "Can't move" : "")
);
const canFight = computed(() => unitInPlay.value && !fightBlocked.value);
const canMove = computed(() => unitInPlay.value && !moveBlocked.value);

const moving = computed(() => ui.moving && ui.moving === ui.selected);
const attacking = computed(() => ui.attacker && ui.attacker === ui.selected);
const shooting = computed(() => ui.shooting && ui.shooting === ui.selected);
// A unit shows Shoot only when it actually has range (from a Ranged keyword).
const hasRange = computed(
  () => onBoard.value && effectiveRanged(ui.selected) > 0 && !enemyLocked.value
);
const canShoot = computed(() => hasRange.value && !tapReason.value);
// An avatar on the board can draw from its owner's decks (its basic action, in
// place of tapping). The buttons appear only when the matching deck has cards.
const isAvatarInPlay = computed(
  () => onBoard.value && isAvatar(ui.selected) && !enemyLocked.value
);
const atlasCount = computed(() =>
  isAvatarInPlay.value ? deckSize(ui.selected, "atlas") : 0
);
const spellbookCount = computed(() =>
  isAvatarInPlay.value ? deckSize(ui.selected, "spellbook") : 0
);
// Charge: only offered while logging, for a unit summoned this turn.
const chargeable = computed(
  () =>
    logging.value &&
    !!ui.selected &&
    canCharge(ui.selected) &&
    !enemyLocked.value
);
const carrying = computed(() => ui.carrier && ui.carrier === ui.selected);
// Pick up and put down are logged moves, so they belong wherever moves are
// being written down: while recording a solution, and while playing one.
const logging = computed(() => state.recording || state.mode === "play");
// Picking something up is a unit's realm basic ability, like move and attack:
// only a unit already on the board reaches for an artifact at its location.
// A card in a hand or cemetery is not in play, and a site or aura is not a
// unit, so none of them offer Pick up.
const canPickUp = computed(
  () =>
    (logging.value || editing.value) &&
    onBoard.value &&
    isUnit(ui.selected) &&
    !enemyLocked.value
);
// What this card holds, and who holds it -- the two sides of the same relation
// and the two buttons the bar has to offer.
// What the card can put down -- not a form it has assumed, which only its lose
// conditions or a release effect end.
const holding = computed(() =>
  ui.selected && !enemyLocked.value
    ? carriedBy(ui.selected).filter((id) => !isAssumedForm(id))
    : []
);
const heldBy = computed(() => (ui.selected ? carrierOf(ui.selected) : null));
// A form another card has assumed: its abilities are its carrier's now, and it
// can't move, attack, draw or be put down on its own -- so the bar is empty.
const assumed = computed(() => !!ui.selected && isAssumedForm(ui.selected));

// Activated abilities usable right now: only while a solution is being recorded
// or played (they log a move), and only those live in the card's current zone.
const liveAbilities = computed(() => {
  if (!logging.value || !ui.selected || enemyLocked.value) return [];
  const abilities = activatedAbilities(ui.selected);
  // A tapped card can't pay a tap cost, so abilities that require tapping drop
  // out; abilities with no tap cost stay usable even while tapped. The same
  // goes for a summon-sick card, which can't tap to pay costs.
  if (tapped.value || sick.value) return abilities.filter((a) => !a.cost?.tap);
  return abilities;
});
const isArming = (abilityId) =>
  ui.activating &&
  ui.activating.cardId === ui.selected &&
  ui.activating.abilityId === abilityId;
// The ability waiting for a target, so the bar can prompt for one.
const armingAbility = computed(
  () =>
    (ui.activating &&
      // The ally-shoot picks are prompted above the storyline instead.
      !shooterStage() &&
      liveAbilities.value.some((a) => a.id === ui.activating.abilityId) &&
      // As it resolves for any chosen modes; null while they are being chosen.
      activeAbility()) ||
    null
);
function abilityLabel(a) {
  const bits = [a.name || "Ability"];
  const mana = ui.selected ? abilityManaCost(ui.selected, a) : a.cost.mana;
  if (mana) bits.push(`${mana}◇`);
  if (a.cost.life) bits.push(`${a.cost.life}♥`);
  if (a.cost.discard) bits.push(`discard ${a.cost.discard}`);
  if (a.cost.banish) bits.push(`banish ${a.cost.banish}`);
  if (a.cost.sacrifice && a.cost.sacrifice !== "none") bits.push("sacrifice");
  // A limited ability shows its uses left this turn while solving/recording.
  const limit = Number(a.cost.perTurn) || 0;
  if (limit && ui.selected && (state.mode === "play" || state.recording)) {
    bits.push(`(${abilityUsesLeft(ui.selected, a)}/${limit})`);
  }
  return bits.join(" ");
}

const usedUp = (a) =>
  (state.mode === "play" || state.recording) &&
  !!ui.selected &&
  abilityUsesLeft(ui.selected, a) <= 0;

// The template's conditions, named so the column can tell whether it has
// anything to show at all (a pool card, say, has no table actions).
const playing = computed(() => state.mode === "play" || state.recording);
const showCast = computed(
  () => castSource.value && !!card.value?.magic && playing.value && !castLocked.value
);
const showCastHint = computed(
  () =>
    castSource.value &&
    !card.value?.magic &&
    isSpell(ui.selected) &&
    playing.value &&
    !castLocked.value
);
const showHeal = computed(
  () => onBoard.value && !!damageOf(ui.selected) && !enemyLocked.value
);
const showPutDown = computed(
  () => (logging.value || editing.value) && !!heldBy.value && !enemyLocked.value
);
const hasButtons = computed(
  () =>
    !assumed.value &&
    (showCast.value ||
      showCastHint.value ||
      liveAbilities.value.length > 0 ||
      unitInPlay.value ||
      hasRange.value ||
      (isAvatarInPlay.value && (atlasCount.value || spellbookCount.value)) ||
      chargeable.value ||
      showHeal.value ||
      canPickUp.value ||
      showPutDown.value ||
      holding.value.length > 0)
);
const hasHint = computed(
  () =>
    !!armingAbility.value ||
    canFinishPicks() ||
    canDeclineActivate() ||
    moving.value ||
    attacking.value ||
    shooting.value ||
    carrying.value ||
    assumed.value ||
    !!heldBy.value ||
    (sick.value && onBoard.value && !enemyLocked.value) ||
    enemyLocked.value
);

// Art thumbnails stand in for a card's name (names are printed on the card);
// a span with a background, not an <img>, so a host theme's img rules can't
// blow it up.
const artStyle = (id) => {
  const img = state.cards[id]?.img;
  return img ? { backgroundImage: `url("${img}")` } : null;
};
const cardLabel = (id) => state.cards[id]?.name || "a card";
</script>

<template>
  <!-- In the column there is always a line under "On the table", even when
       the card has no table actions, so the heading never sits over nothing. -->
  <p
    v-if="
      inColumn &&
      card &&
      !ui.awaitingDefender &&
      !ui.storyChoice &&
      !hasButtons &&
      !hasHint
    "
    class="ca-hint ca-none"
  >
    {{
      inPool
        ? "Drag it onto the table to place a copy."
        : "Nothing to do with this card right now."
    }}
  </p>
  <div
    v-else-if="card && !ui.awaitingDefender && !ui.storyChoice"
    :class="inColumn ? 'ca-column' : 'card-actions'"
    role="toolbar"
    :aria-orientation="inColumn ? 'vertical' : null"
    :aria-label="`Actions for ${card.name}`"
  >
    <!-- No name or "provides" line: both are printed on the card, which is
         highlighted on the board and shown in the inspector. The name stays
         only in the toolbar's aria-label. No art thumbnail either: a host
         theme's `img { width: 100% }` once blew it up to the bar's width. -->
    <p v-if="!hasButtons && !hasHint" class="ca-hint">
      Nothing to do with this card right now.
    </p>
    <div v-if="!assumed" class="ca-buttons">
      <button
        v-if="showCast"
        class="btn primary"
        :class="{ active: casting }"
        :disabled="
          (!canAffordCast(ui.selected) || !canCastFrom(ui.selected)) && !casting
        "
        :title="
          !canAffordCast(ui.selected)
            ? 'Not enough mana or threshold to cast'
            : !canCastFrom(ui.selected)
            ? 'Needs a caster (Avatar or Spellcaster unit) in play'
            : 'Cast this magic spell'
        "
        @click="beginCast(ui.selected)"
      >
        {{
          casting
            ? "Cancel cast"
            : `✦ Cast${
                castManaCost(ui.selected)
                  ? ` ${castManaCost(ui.selected)}◇`
                  : ""
              }`
        }}
      </button>
      <p v-if="showCastHint" class="ca-hint">
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
            ? 'Cannot pay its cost (mana, threshold, life or cards)'
            : a.text || a.name
        "
        :disabled="
          (usedUp(a) || abilityCostBlocked(ui.selected, a)) && !isArming(a.id)
        "
        @click="beginActivate(ui.selected, a.id)"
      >
        ✧
        {{ isArming(a.id) ? `Cancel ${a.name || "ability"}` : abilityLabel(a) }}
      </button>
      <button
        v-if="unitInPlay"
        class="btn"
        :class="{ active: moving }"
        :title="moveBlocked || null"
        :disabled="!canMove && !moving"
        @click="beginMove(ui.selected)"
      >
        {{ moving ? "Cancel move" : "Move" }}
      </button>
      <button
        v-if="unitInPlay"
        class="btn"
        :class="{ danger: attacking }"
        :title="fightBlocked || null"
        :disabled="!canFight && !attacking"
        @click="beginAttack(ui.selected)"
      >
        {{ attacking ? "Cancel attack" : "Attack & Move" }}
      </button>
      <button
        v-if="hasRange"
        class="btn"
        :class="{ danger: shooting }"
        :title="tapReason || null"
        :disabled="!canShoot && !shooting"
        @click="beginShoot(ui.selected)"
      >
        {{
          shooting
            ? "Cancel shoot"
            : `➶ Shoot (${effectiveRanged(ui.selected)})`
        }}
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
        v-if="showHeal"
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
        {{ carrying ? "Cancel pick up" : "Pick up" }}
      </button>
      <button
        v-if="showPutDown"
        class="btn"
        @click="dropCarried(ui.selected)"
      >
        ▽ Put down
      </button>
      <!-- One per carried card: its art, not its name (printed on the card);
           the name is only for screen readers. -->
      <button
        v-for="id in holding"
        :key="id"
        class="btn ca-drop"
        :aria-label="`Put down ${cardLabel(id)}`"
        @click="dropCarried(id)"
      >
        <span
          class="ca-thumb"
          :class="{ 'no-art': !artStyle(id) }"
          :style="artStyle(id)"
          aria-hidden="true"
        ></span>
        ▽ Put down{{ holding.length > 1 ? " this one" : " the carried card" }}
      </button>
    </div>
    <p v-if="armingAbility" class="ca-hint">
      {{
        ui.activating.dest
          ? destPrompt(armingAbility)
          : pickState?.choosing
          ? "Now click the picked card you want to be able to cast."
          : pickState
          ? `${
              armingAbility.target.prompt || "Pick the cards for this ability"
            } (${pickState.picked}/${pickState.upTo ? "up to " : ""}${
              pickState.needed
            }).`
          : armingAbility.target.prompt ||
            "Now click the target for this ability."
      }}
    </p>
    <!-- "Up to N": stop picking and resolve with the cards picked so far. -->
    <button
      v-if="canFinishPicks()"
      class="btn small primary"
      title="Resolve with the cards picked so far"
      @click="finishPicks"
    >
      Done picking
    </button>
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
    <p v-else-if="moving" class="ca-hint">
      Now click a destination square to move and tap this minion.
    </p>
    <p v-else-if="attacking && ui.attackTarget" class="ca-hint">
      Several crossings reach that target — click the one to move to and attack from.
    </p>
    <p v-else-if="attacking && oversizedSelected" class="ca-hint">
      Click a crossing to move to, then a unit or site under it — or click the
      target first. This unit moves, attacks, and taps.
    </p>
    <p v-else-if="attacking" class="ca-hint">
      Now click the target — this unit moves to it, attacks, and taps.
    </p>
    <p v-else-if="shooting" class="ca-hint">
      Now click a unit in line of fire to shoot it (taps).
    </p>
    <p v-else-if="carrying" class="ca-hint">
      Now click the card to pick up — it travels with this one until dropped.
    </p>
    <p v-else-if="assumed" class="ca-hint">
      Assumed as a form by
      <span
        class="ca-thumb inline"
        :class="{ 'no-art': !artStyle(heldBy) }"
        :style="artStyle(heldBy)"
        role="img"
        :aria-label="cardLabel(heldBy)"
      ></span>
      — its abilities are used from there.
    </p>
    <p v-else-if="heldBy" class="ca-hint">
      Carried by
      <span
        class="ca-thumb inline"
        :class="{ 'no-art': !artStyle(heldBy) }"
        :style="artStyle(heldBy)"
        role="img"
        :aria-label="cardLabel(heldBy)"
      ></span>
      and travelling with it. Put it down to move it on its own.
    </p>
    <p v-else-if="sick && onBoard && !enemyLocked" class="ca-hint">
      Summoned this turn: summoning sickness stops it tapping to move, attack,
      shoot, or pay for abilities until end of turn.
    </p>
    <p v-else-if="enemyLocked" class="ca-hint">
      This is your opponent's card — you can't act with it. The puzzle plays the
      opponent's side automatically.
    </p>

    <button
      v-if="!inColumn"
      class="ca-close"
      title="Deselect (Esc)"
      aria-label="Deselect this card (Escape)"
      @click="clearSelection"
    >
      ×
    </button>
  </div>
</template>

<style scoped>
/* A carried card's art in place of its name. */
.ca-thumb {
  display: inline-block;
  flex: 0 0 auto;
  width: 18px;
  height: 25px;
  border-radius: 2px;
  border: 1px solid var(--c-cream-lo);
  background: var(--c-raised-2) center / cover no-repeat;
  vertical-align: middle;
}
.ca-thumb.inline {
  width: 14px;
  height: 20px;
  margin: 0 2px;
}
/* No art uploaded: a dashed outline says "a card" without naming it. */
.ca-thumb.no-art {
  border-style: dashed;
  border-color: var(--c-muted-2);
}
.ca-drop {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}

/* Column: the same actions stacked full width in the editor's Card tab. No
   floating chrome -- the tab panel is the frame. */
.ca-column {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--sp-2);
}
.ca-column .ca-buttons {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--sp-2);
}
.ca-column .btn {
  width: 100%;
  text-align: left;
}
.ca-column .ca-drop {
  display: flex;
}
.ca-column .ca-hint,
.ca-none {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--c-muted);
}
.ca-column .btn:focus-visible,
.card-actions .btn:focus-visible {
  outline: 2px solid var(--c-focus);
  outline-offset: 2px;
}
</style>
