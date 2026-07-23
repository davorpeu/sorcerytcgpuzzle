<script setup>
import { state, adjustStat, ELEMENTS } from '../store.js'
import ThresholdIcon from './ThresholdIcon.vue'

defineProps({
  side: { type: String, required: true }, // 'player' | 'opponent'
})
</script>

<template>
  <div class="zone-block stats-block">
    <div class="zone-title">Mana &amp; thresholds</div>
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
