<script setup>
import { computed } from 'vue'
import { state, adjustStat, ELEMENTS } from '../store.js'
import ThresholdIcon from './ThresholdIcon.vue'

const props = defineProps({
  side: { type: String, required: true }, // 'player' | 'opponent'
})

const life = computed(() => state.stats[props.side].life)
// 0 life is not "dead" in Sorcery but Death's Door, a state of its own. The
// rail is too narrow for that phrase inline, so the row keeps the number and
// names the state on a caption line beneath it.
const atDoor = computed(() => life.value <= 0)

// Twenty-four steppers on screen, every one of them labelled "+" or "-".
// Spoken in order that is two dozen identical buttons, so each one says which
// number it moves and for whom.
const who = computed(() => (props.side === 'player' ? 'your' : "opponent's"))
const step = (what, delta) =>
  `${delta > 0 ? 'Increase' : 'Decrease'} ${who.value} ${what}`
</script>

<template>
  <div class="stat-card">
    <div class="stat-side">
      {{ side === 'player' ? 'You' : 'Opponent' }}
    </div>
    <div class="stat-row life-row" :class="{ 'at-door': atDoor }">
      <span class="stat-label">Life</span>
      <button
        class="stat-btn"
        :aria-label="step('life', -1)"
        @click="adjustStat(side, 'life', -1)"
      >
        −
      </button>
      <span class="stat-value life-value" :title="`${life} life`">
        <span v-if="atDoor" class="door-icon">☠</span>{{ life }}
      </span>
      <button
        class="stat-btn"
        :aria-label="step('life', 1)"
        @click="adjustStat(side, 'life', 1)"
      >
        +
      </button>
    </div>
    <div v-if="atDoor" class="door-note">At Death&rsquo;s Door</div>
    <div class="stat-row mana-row">
      <span class="stat-label">Mana</span>
      <button
        class="stat-btn"
        :aria-label="step('mana', -1)"
        @click="adjustStat(side, 'mana', -1)"
      >
        −
      </button>
      <span class="stat-value">{{ state.stats[side].mana }}</span>
      <button
        class="stat-btn"
        :aria-label="step('mana', 1)"
        @click="adjustStat(side, 'mana', 1)"
      >
        +
      </button>
    </div>
    <div class="threshold-grid">
      <div v-for="el in ELEMENTS" :key="el" class="stat-row" :title="el">
        <span class="stat-label th-cell"><ThresholdIcon :element="el" /></span>
        <button
          class="stat-btn"
          :aria-label="step(`${el} threshold`, -1)"
          @click="adjustStat(side, el, -1)"
        >
          −
        </button>
        <span class="stat-value">{{ state.stats[side][el] }}</span>
        <button
          class="stat-btn"
          :aria-label="step(`${el} threshold`, 1)"
          @click="adjustStat(side, el, 1)"
        >
          +
        </button>
      </div>
    </div>
  </div>
</template>
