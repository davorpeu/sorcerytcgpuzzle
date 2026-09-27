<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  state,
  ui,
  addCardFiles,
  addCardFromMedia,
  canSearchMedia,
  searchMedia,
} from '../store.js'
import DropZone from './DropZone.vue'
import CardToken from './CardToken.vue'

const fileInput = ref(null)

// Decision a: a solution may only use cards that are on the table, in hands or
// in piles at the start, so the pool closes while a line is recorded. UI only:
// the cards are made inert (no drag, no click-to-place); the pool stays a drop
// target.
const LOCK_POOL_WHILE_RECORDING = true
const locked = computed(() => LOCK_POOL_WHILE_RECORDING && state.recording)

// A card nobody has given a kind yet still needs setting up in the Card tab.
const KINDS = ['unit', 'avatar', 'site', 'aura', 'artifact', 'magic']
const isNew = (id) => {
  const c = state.cards[id]
  return !!c && !KINDS.some((k) => c[k])
}

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
  <div class="card-pool" :class="{ locked }">
    <div class="pool-header">
      <p class="help">
        <template v-if="locked">Closed while recording.</template>
        <template v-else-if="state.zones.pool.length">Drag onto the table to place a copy.</template>
        <template v-else>No cards yet.</template>
      </p>
      <button class="btn small" @click="fileInput.click()">Upload</button>
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
      <label class="sr-only" for="pool-search">Search the site's card images</label>
      <input
        id="pool-search"
        v-model="query"
        class="text-input"
        type="search"
        placeholder="Search the site's card images…"
      />
      <p v-if="searching" class="help" role="status">Searching…</p>
      <p v-else-if="error" class="err">{{ error }}</p>
      <p v-else-if="searched && !results.length" class="help">
        No card images match “{{ query.trim() }}”. Try part of the file name, or upload it.
      </p>
      <template v-else-if="results.length">
        <div class="pool-grid media-grid">
          <!-- Art only: the name is printed on the card, so it lives in the label. -->
          <button
            v-for="item in results"
            :key="item.id"
            class="media-pick"
            :class="{ picked: picked.has(item.id) }"
            :aria-label="`${item.name}, ${picked.has(item.id) ? 'already in the pool' : 'add to the pool'}`"
            @click="addCardFromMedia(item)"
          >
            <img :src="item.thumb" alt="" loading="lazy" />
            <span v-if="picked.has(item.id)" class="tag" aria-hidden="true">✓ Added</span>
          </button>
        </div>
        <p class="help">Click an image to add it to the pool.</p>
      </template>
    </div>

    <p v-if="locked" class="lock-note">
      The pool is closed while you record. A solution can only use cards that are on the
      table, in hands or in piles at the start.
    </p>

    <DropZone zone="pool" class="pool-grid pool-drop">
      <div
        v-for="id in state.zones.pool"
        :key="id"
        class="pool-item"
        :class="{
          new: isNew(id),
          selected: ui.selected === id,
          land: state.cards[id]?.site,
        }"
        :inert="locked || null"
      >
        <CardToken :card-id="id" from="pool" />
        <span v-if="isNew(id)" class="tag">New</span>
      </div>
      <div v-if="!state.zones.pool.length" class="empty-box">
        <b>The pool is empty</b>
        <span>
          <template v-if="searchable">Search the site's card images above, or upload your own. </template>
          <template v-else>Upload card images, </template>
          then drag them onto the table or into a hand, or click a card and then click where it
          should go. Either way a copy is placed and the card stays here, so one upload can be
          placed as many times as you need.
        </span>
        <button class="btn primary" @click.stop="fileInput.click()">Upload card images</button>
      </div>
    </DropZone>
  </div>
</template>

<style scoped>
/* Lives inside the editor's Pool tab, which already draws the panel. */
.card-pool {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: 0;
  background: none;
  border: 0;
  font-family: var(--font-ui);
}

.pool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
}

.help {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--c-muted);
}

.err {
  margin: 0;
  display: flex;
  gap: 6px;
  font-size: var(--fs-sm);
  color: var(--c-danger-soft);
}
.err::before {
  content: '✕';
  font-weight: 700;
}

.pool-search {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

/* Art only, four across. */
.pool-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--sp-2);
  align-content: start;
}

/* The drop target: the whole grid, with room to drop even when it's full. */
.pool-drop {
  min-height: 80px;
  padding: var(--sp-1);
  border-radius: var(--r-md);
}

.pool-item {
  position: relative;
  border-radius: 5px;
  border: 1.5px solid transparent;
}
.pool-item.land {
  grid-column: span 2;
}
.pool-item :deep(.card-token) {
  --card-w: 100%;
}

/* Kind not set yet: a dashed outline and the word, never colour alone. */
.pool-item.new {
  border-color: var(--c-warn);
  border-style: dashed;
}

.pool-item.selected {
  outline: 3px solid var(--c-gold);
  outline-offset: 2px;
}

.tag {
  position: absolute;
  left: 4px;
  bottom: 4px;
  z-index: 6;
  padding: 1px 6px;
  border-radius: var(--r-sm);
  background: var(--c-felt-deep);
  font-size: var(--fs-xs);
  color: var(--c-cream-hi);
  pointer-events: none;
}

.media-pick {
  position: relative;
  padding: 0;
  border: 1.5px solid transparent;
  border-radius: 5px;
  background: none;
  cursor: pointer;
}
.media-pick img {
  display: block;
  width: 100%;
  aspect-ratio: 5 / 7;
  object-fit: cover;
  border-radius: 4px;
  box-shadow: var(--shadow-card);
}
.media-pick:hover {
  border-color: var(--c-gold);
}
.media-pick.picked img {
  opacity: 0.55;
}
.media-pick:focus-visible {
  outline: 2px solid var(--c-focus);
  outline-offset: 2px;
}

/* Closed while recording: the sentence says why; the cards dim and go inert. */
.lock-note {
  margin: 0;
  padding: 10px 12px;
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--r-md);
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--c-muted-hi);
}
.locked .pool-item {
  opacity: 0.4;
}

.empty-box {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18px 16px;
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--r-md);
  text-align: center;
  font-size: var(--fs-sm);
  line-height: 1.45;
  color: var(--c-muted);
}
.empty-box b {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--fs-lg);
  color: var(--c-cream-hi);
}

/* Moved from style.css: this component's own rules. */
.pool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.pool-search {
  margin-top: 6px;
}
</style>
