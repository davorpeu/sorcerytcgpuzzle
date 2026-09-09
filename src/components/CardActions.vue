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
  toggleUnderOver,
  beginMove,
  beginAttack,
  beginStrike,
} from '../store.js'

// Everything a card can do lives here rather than on postage-stamp buttons
// pinned to the card itself, which are unusable once cards shrink to fit a
// board square (and impossible to hit on a touch screen).
const card = computed(() => (ui.selected ? state.cards[ui.selected] : null))
const zone = computed(() => (ui.selected ? zoneOf(ui.selected) : null))
const onBoard = computed(() => /^cell:\d+:(top|bot)$/.test(zone.value || ''))
const isUnder = computed(() => (zone.value || '').endsWith(':bot'))
const editing = computed(() => state.mode === 'editor' && !state.recording)
const inPool = computed(() => zone.value === 'pool')
const canAct = computed(() => !!card.value && !inPool.value)
const moving = computed(() => ui.moving && ui.moving === ui.selected)
const attacking = computed(() => ui.attacker && ui.attacker === ui.selected)
const striking = computed(() => ui.striker && ui.striker === ui.selected)
</script>

<template>
  <div v-if="card" class="card-actions">
    <img
      v-if="card.img"
      class="ca-thumb"
      :src="card.img"
      :alt="card.name"
      :class="{ flipped: card.enemy }"
    />
    <div class="ca-id">
      <div class="ca-name">{{ card.name }}</div>
      <div class="ca-zone">{{ zone ? zoneLabel(zone) : 'Nowhere' }}</div>
    </div>

    <div class="ca-buttons">
      <button
        v-if="onBoard"
        class="btn"
        @click="toggleUnderOver(ui.selected, zone)"
      >
        {{ isUnder ? '↥ Bring to surface' : '↧ Send underground' }}
      </button>
      <button
        v-if="onBoard && isUnit(ui.selected)"
        class="btn"
        :class="{ active: moving }"
        @click="beginMove(ui.selected)"
      >
        {{ moving ? '🏃 Cancel move' : '🏃 Move' }}
      </button>
      <button
        v-if="canAct"
        class="btn"
        :class="{ danger: attacking }"
        @click="beginAttack(ui.selected)"
      >
        {{ attacking ? '⚔ Cancel attack' : '⚔ Attack' }}
      </button>
      <button
        v-if="canAct"
        class="btn"
        :class="{ danger: striking }"
        @click="beginStrike(ui.selected)"
      >
        {{ striking ? '💥 Cancel strike' : '💥 Strike' }}
      </button>
      <button
        v-if="onBoard"
        class="btn"
        :class="{ active: isTapped(ui.selected) }"
        @click="toggleTap(ui.selected)"
      >
        {{ isTapped(ui.selected) ? '⟳ Untap' : '↷ Tap' }}
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
        ♟ {{ (card.unit && !card.avatar) ? 'Not a unit' : 'Mark as unit' }}
      </button>
      <button
        v-if="editing && inPool"
        class="btn"
        :class="{ active: card.avatar }"
        @click="toggleAvatar(ui.selected)"
      >
        👑 {{ card.avatar ? 'Not an avatar' : 'Mark as avatar' }}
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
      <button v-if="editing" class="btn danger" @click="removeCard(ui.selected)">
        × Remove card
      </button>
    </div>

    <p v-if="moving" class="ca-hint">Now click a destination square to move and tap this unit.</p>
    <p v-else-if="attacking" class="ca-hint">Now click the unit or site to attack (will tap).</p>
    <p v-else-if="striking" class="ca-hint">Now click the unit or site to strike (does not tap).</p>
    <p v-else class="ca-hint">Click any zone to move without tapping, or choose an action above.</p>

    <button class="ca-close" title="Deselect (Esc)" @click="clearSelection">
      ×
    </button>
  </div>
</template>
