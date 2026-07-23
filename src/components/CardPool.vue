<script setup>
import { ref } from 'vue'
import { state, addCardFiles } from '../store.js'
import DropZone from './DropZone.vue'
import CardToken from './CardToken.vue'

const fileInput = ref(null)

async function onFiles(e) {
  await addCardFiles(e.target.files)
  e.target.value = ''
}
</script>

<template>
  <div class="card-pool">
    <div class="pool-header">
      <span class="zone-title">Card pool</span>
      <button class="btn small" @click="fileInput.click()">Upload cards</button>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        hidden
        @change="onFiles"
      />
    </div>
    <DropZone zone="pool" class="pool">
      <CardToken
        v-for="id in state.zones.pool"
        :key="id"
        :card-id="id"
        from="pool"
        removable
      />
      <p v-if="!state.zones.pool.length" class="hint">
        Upload card images, then drag them onto the board or hands. Dragging
        places a copy — the card stays here so you can use it again.
      </p>
    </DropZone>
  </div>
</template>
