<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  state,
  addCardFiles,
  addCardFromMedia,
  canSearchMedia,
  searchMedia,
} from '../store.js'
import DropZone from './DropZone.vue'
import CardToken from './CardToken.vue'

const fileInput = ref(null)

async function onFiles(e) {
  await addCardFiles(e.target.files)
  e.target.value = ''
}

// ---------- Media Library search ----------

// Only inside WordPress: standalone builds have no library to search.
const searchable = computed(canSearchMedia)

const query = ref('')
const results = ref([])
const searching = ref(false)
const error = ref('')
const searched = ref(false)

// Attachment ids already in the pool, so a card that has been picked is
// marked instead of silently added a second time.
const picked = computed(
  () =>
    new Set(
      state.zones.pool.map((id) => state.cards[id]?.imgId).filter(Boolean)
    )
)

// Only the latest search may write results: earlier requests can land after
// a later one when the user keeps typing.
let seq = 0
let timer = null

watch(query, (q) => {
  clearTimeout(timer)
  const term = q.trim()
  if (!term) {
    seq++
    results.value = []
    searching.value = false
    searched.value = false
    error.value = ''
    return
  }
  searching.value = true
  timer = setTimeout(() => run(term), 250)
})

onBeforeUnmount(() => clearTimeout(timer))

async function run(term) {
  const mine = ++seq
  try {
    const res = await searchMedia(term)
    if (mine !== seq) return
    results.value = res.items || []
    error.value = ''
  } catch (e) {
    if (mine !== seq) return
    results.value = []
    error.value = e.message
  } finally {
    if (mine === seq) {
      searching.value = false
      searched.value = true
    }
  }
}
</script>

<template>
  <div class="card-pool">
    <div class="pool-header">
      <span class="zone-title">Card pool</span>
      <button class="btn small" @click="fileInput.click()">Upload cards</button>
      <label class="sr-only" for="pool-upload">Upload card images from disk</label>
      <input
        id="pool-upload"
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        hidden
        @change="onFiles"
      />
    </div>

    <div v-if="searchable" class="pool-search">
      <label class="sr-only" for="pool-search">Search uploaded card images</label>
      <input
        id="pool-search"
        v-model="query"
        class="text-input"
        type="search"
        placeholder="Search uploaded card images…"
      />
      <div v-if="searching" class="hint">Searching…</div>
      <div v-else-if="error" class="hint error">{{ error }}</div>
      <div v-else-if="searched && !results.length" class="hint">
        No card images match “{{ query.trim() }}”.
      </div>
      <div v-else-if="results.length" class="media-results">
        <button
          v-for="item in results"
          :key="item.id"
          class="media-item"
          :class="{ picked: picked.has(item.id) }"
          :title="item.name"
          @click="addCardFromMedia(item)"
        >
          <img :src="item.thumb" :alt="item.name" loading="lazy" />
          <span class="media-name">{{ item.name }}</span>
          <span v-if="picked.has(item.id)" class="media-check">✓</span>
        </button>
      </div>
    </div>

    <DropZone zone="pool" class="pool">
      <CardToken
        v-for="id in state.zones.pool"
        :key="id"
        :card-id="id"
        from="pool"
      />
      <p v-if="!state.zones.pool.length" class="hint">
        <template v-if="searchable"
          >Search the site's card images above, or upload your own.</template
        >
        <template v-else>Upload card images,</template>
        then drag them onto the board or hands — or click a card and then click
        where it should go. Either way a copy is placed and the card stays here,
        so one upload can be used many times.
      </p>
    </DropZone>
  </div>
</template>
