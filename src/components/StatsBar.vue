<script setup>
import { computed } from 'vue'
import { state, adjustStat, lifeLabel, ELEMENTS } from '../store.js'
import ThresholdIcon from './ThresholdIcon.vue'

const props = defineProps({
  side: { type: String, required: true }, // 'player' | 'opponent'
})

const life = computed(() => state.stats[props.side].life)
// 0 life is not "dead" in Sorcery but Death's Door, a state of its own, so
// the readout names it instead of showing a bare zero.
const atDoor = computed(() => life.value <= 0)
const lifeTitle = computed(() =>
  atDoor.value ? "At Death's Door" : `${life.value} life`
)
</script>

<template>
  <div class="zone-block stats-block">
    <div class="zone-title">
      {{ side === 'player' ? 'You' : 'Opponent' }} — life &amp; mana
    </div>
    <div class="stat-row life-row" :class="{ 'at-door': atDoor }">
      <span class="stat-label">Life</span>
      <button class="stat-btn" @click="adjustStat(side, 'life', -1)">−</button>
      <span class="stat-value life-value" :title="lifeTitle">
        <span v-if="atDoor" class="door-icon">☠</span>
        {{ lifeLabel(life) }}
      </span>
      <button class="stat-btn" @click="adjustStat(side, 'life', 1)">+</button>
    </div>
    <div class="stat-row mana-row">
      <span class="stat-label">Mana</span>
      <button class="stat-btn" @click="adjustStat(side, 'mana', -1)">−</button>
      <span class="stat-value">{{ state.stats[side].mana }}</span>
      <button class="stat-btn" @click="adjustStat(side, 'mana', 1)">+</button>
    </div>
    <div class="threshold-grid">
      <div v-for="el in ELEMENTS" :key="el" class="stat-row" :title="el">
        <ThresholdIcon :element="el" />
        <button class="stat-btn" @click="adjustStat(side, el, -1)">−</button>
        <span class="stat-value">{{ state.stats[side][el] }}</span>
        <button class="stat-btn" @click="adjustStat(side, el, 1)">+</button>
      </div>
    </div>
  </div>
</template>
