<script setup>
import { computed } from 'vue'
import {
  state,
  ui,
  zoneOf,
  zoneLabel,
  clearSelection,
  removeCard,
  toggleSite,
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
  beginPickup,
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
    v-if="card"
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
        v-if="onBoard"
        class="btn"
        :class="{ active: isTapped(ui.selected) }"
        @click="toggleTap(ui.selected)"
      >
        {{ isTapped(ui.selected) ? '⟳ Untap' : '↷ Tap' }}
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
      <button v-if="editing" class="btn danger" @click="onRemove">
        × Remove card
      </button>
    </div>

    <p v-if="moving" class="ca-hint">Now click a destination square to move and tap this minion.</p>
    <p v-else-if="attacking" class="ca-hint">Now click the minion or site to attack (will tap).</p>
    <p v-else-if="striking" class="ca-hint">Now click the minion or site to strike (does not tap).</p>
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
  </div>
</template>
