<script setup>
import { state } from '../store.js'
import DropZone from './DropZone.vue'
import CardToken from './CardToken.vue'

defineProps({
  side: { type: String, required: true }, // 'player' | 'opponent'
})
</script>

<template>
  <div class="hand-row">
    <div class="zone-block hand-block">
      <div class="zone-title">
        {{ side === 'player' ? 'Your hand' : 'Opponent hand' }}
      </div>
      <DropZone :zone="`hand:${side}`" class="hand">
        <CardToken
          v-for="id in state.zones[`hand:${side}`]"
          :key="id"
          :card-id="id"
          :from="`hand:${side}`"
        />
      </DropZone>
    </div>
    <div class="zone-block grave-block">
      <div class="zone-title">Cemetery</div>
      <DropZone :zone="`grave:${side}`" class="grave">
        <CardToken
          v-for="id in state.zones[`grave:${side}`]"
          :key="id"
          :card-id="id"
          :from="`grave:${side}`"
        />
      </DropZone>
    </div>
    <div class="zone-block grave-block">
      <div class="zone-title">Collection</div>
      <DropZone :zone="`collection:${side}`" class="grave">
        <CardToken
          v-for="id in state.zones[`collection:${side}`]"
          :key="id"
          :card-id="id"
          :from="`collection:${side}`"
        />
      </DropZone>
    </div>
    <div class="zone-block grave-block">
      <div class="zone-title">Banished</div>
      <DropZone :zone="`banished:${side}`" class="grave">
        <CardToken
          v-for="id in state.zones[`banished:${side}`]"
          :key="id"
          :card-id="id"
          :from="`banished:${side}`"
        />
      </DropZone>
    </div>
    <div class="zone-block grave-block">
      <div class="zone-title">Atlas</div>
      <DropZone :zone="`atlas:${side}`" class="grave">
        <CardToken
          v-for="id in state.zones[`atlas:${side}`]"
          :key="id"
          :card-id="id"
          :from="`atlas:${side}`"
        />
      </DropZone>
    </div>
    <div class="zone-block grave-block">
      <div class="zone-title">Spellbook</div>
      <DropZone :zone="`spellbook:${side}`" class="grave">
        <CardToken
          v-for="id in state.zones[`spellbook:${side}`]"
          :key="id"
          :card-id="id"
          :from="`spellbook:${side}`"
        />
      </DropZone>
    </div>
  </div>
</template>
