<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  state,
  ui,
  config,
  undo,
  startRecording,
  stopRecording,
  enterPlay,
  enterEditor,
  resetPlay,
  submit,
  outOfTries,
  MAX_TRIES,
  savePuzzle,
  listPuzzles,
  loadById,
  deletePuzzle,
  newPuzzle,
  removeSolutionLine,
  loadPuzzle,
  serialize,
  shareLink,
  loadDemo,
  loadDaily,
  localToday,
} from './store.js'
import Board from './components/Board.vue'
import Hand from './components/Hand.vue'
import CardPool from './components/CardPool.vue'
import MoveLog from './components/MoveLog.vue'
import DropZone from './components/DropZone.vue'
import CardToken from './components/CardToken.vue'
import ThresholdIcon from './components/ThresholdIcon.vue'
import ArchiveCalendar from './components/ArchiveCalendar.vue'

const saved = ref([])
const importInput = ref(null)
const notice = ref('')
const showArchive = ref(false)

async function onArchiveSelect(id) {
  if (!(await loadById(id))) flash('That puzzle is not available.')
  showArchive.value = false
}

function flash(msg) {
  notice.value = msg
  setTimeout(() => {
    if (notice.value === msg) notice.value = ''
  }, 3000)
}

async function refreshSaved() {
  saved.value = await listPuzzles()
}

async function onSave() {
  try {
    await savePuzzle()
    flash(`Saved "${state.puzzleName || 'Untitled puzzle'}"`)
  } catch (e) {
    flash(`Save failed: ${e.message}`)
  }
  refreshSaved()
}

async function onDelete(id) {
  try {
    await deletePuzzle(id)
  } catch (e) {
    flash(`Delete failed: ${e.message}`)
  }
  refreshSaved()
}

async function onLoadDaily() {
  if (!(await loadDaily())) flash('No puzzle has been released yet.')
}

function onExport() {
  const data = serialize()
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${(state.puzzleName || 'puzzle').replace(/[^\w-]+/g, '_')}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

async function onImport(e) {
  const file = e.target.files[0]
  if (!file) return
  try {
    loadPuzzle(JSON.parse(await file.text()), { play: false })
    flash(`Imported "${state.puzzleName}"`)
  } catch {
    flash('Import failed: not a valid puzzle file.')
  }
  e.target.value = ''
}

async function onCopyLink() {
  const url = shareLink()
  try {
    await navigator.clipboard.writeText(url)
    flash(
      url.length > 8000
        ? 'Link copied — but it is very long. For big puzzles, export JSON and host it, then link with ?src=<url>.'
        : 'Share link copied to clipboard.'
    )
  } catch {
    window.prompt('Copy this link:', url)
  }
}

function onSubmit() {
  const ok = submit()
  if (ok === null) return // no try available; the banner already explains
  if (ok) {
    flash('Correct — puzzle solved!')
  } else if (config.canEdit) {
    flash('Not quite — see the move log.')
  } else {
    const left = MAX_TRIES - state.tries
    flash(
      left > 0
        ? `Not quite — ${left} ${left === 1 ? 'try' : 'tries'} left.`
        : 'Out of tries for today.'
    )
  }
}

// Non-editors can no longer submit once solved or out of tries.
const submitLocked = computed(
  () => !config.canEdit && (state.solved || outOfTries())
)

// Shortest recorded solution line; what the play header advertises.
const targetMoves = computed(() =>
  state.solutions.length
    ? Math.min(...state.solutions.map((l) => l.length))
    : 0
)

// Hold Alt while hovering a card to see it enlarged.
const previewCard = computed(() =>
  ui.alt && ui.hoverCard ? state.cards[ui.hoverCard] : null
)

function onKeyDown(e) {
  if (e.key === 'Alt') {
    e.preventDefault() // keep the browser from focusing its menu bar
    ui.alt = true
  }
  if (e.key === 'Escape') ui.attacker = null
}

function onKeyUp(e) {
  if (e.key === 'Alt') {
    e.preventDefault()
    ui.alt = false
  }
}

function onBlur() {
  ui.alt = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  if (config.canEdit) refreshSaved()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
})

const result = computed(() => {
  if (state.mode !== 'play') return null
  // Persistent states for limited players, shown even before any submit
  // this pageload (e.g. after a reload).
  if (!config.canEdit) {
    if (state.solved && !state.checked)
      return { ok: true, msg: '✔ Already solved — come back tomorrow for the next puzzle.' }
    if (outOfTries())
      return {
        ok: false,
        msg: `✘ Out of tries for today (${MAX_TRIES}/${MAX_TRIES}) — come back tomorrow.`,
      }
  }
  if (!state.checked) return null
  if (state.firstWrong === -1)
    return { ok: true, msg: '✔ Correct! You solved the puzzle.' }
  // For limited players every wrong verdict states what it cost.
  const left = config.canEdit
    ? ''
    : ` — ${MAX_TRIES - state.tries} ${MAX_TRIES - state.tries === 1 ? 'try' : 'tries'} left today.`
  if (state.firstWrong >= state.moves.length)
    return {
      ok: false,
      msg: `Correct so far, but this solution needs ${state.targetLen} moves — keep going.${left}`,
    }
  return { ok: false, msg: `✘ Wrong move at step ${state.firstWrong + 1}.${left}` }
})
</script>

<template>
  <div class="app">
    <header class="topbar">
      <h1>Sorcery TCG Puzzle</h1>
      <div v-if="config.canEdit" class="mode-switch">
        <button
          class="btn"
          :class="{ active: state.mode === 'editor' }"
          @click="enterEditor"
        >
          Editor
        </button>
        <button
          class="btn"
          :class="{ active: state.mode === 'play' }"
          :disabled="state.mode === 'play'"
          @click="enterPlay"
        >
          Play
        </button>
      </div>
      <div v-if="state.puzzleName && state.mode === 'play'" class="puzzle-title">
        {{ state.puzzleName }}
        <span v-if="state.solutions.length" class="target">
          · solve in {{ targetMoves }} moves<template
            v-if="state.solutions.length > 1"
          >
            · {{ state.solutions.length }} possible solutions</template
          >
        </span>
      </div>
      <span v-if="notice" class="notice">{{ notice }}</span>
    </header>

    <div v-if="result" class="result-banner" :class="result.ok ? 'ok' : 'bad'">
      {{ result.msg }}
    </div>

    <div class="layout">
      <aside class="sidebar">
        <template v-if="state.mode === 'editor'">
          <div class="panel">
            <div class="zone-title">Puzzle</div>
            <input
              v-model="state.puzzleName"
              class="text-input"
              placeholder="Puzzle name"
            />
            <label class="field-label">
              Release date
              <input v-model="state.puzzleDate" type="date" class="text-input" />
            </label>
            <p class="hint">
              Players see this puzzle from this date. Leave empty to keep it
              unpublished.
            </p>
            <div class="btn-row">
              <button v-if="!state.recording" class="btn primary" @click="startRecording">
                ● {{ state.solutions.length ? 'Record another solution' : 'Record solution' }}
              </button>
              <button v-else class="btn danger" @click="stopRecording">
                ■ Stop recording
              </button>
              <button v-if="state.recording" class="btn" @click="undo">Undo</button>
            </div>
            <p v-if="state.recording" class="hint">
              Recording solution {{ state.solutions.length + 1 }}: every card
              you move is added to this line. The board starts from the
              puzzle's start position for every line.
            </p>
            <ul v-if="state.solutions.length" class="saved-list">
              <li v-for="(line, i) in state.solutions" :key="i">
                <span class="saved-name">
                  Solution {{ i + 1 }} · {{ line.length }} moves
                </span>
                <button
                  class="btn small danger"
                  title="Delete this solution"
                  @click="removeSolutionLine(i)"
                >
                  🗑
                </button>
              </li>
            </ul>
            <div class="btn-row">
              <button class="btn" @click="onSave">Save</button>
              <button class="btn" @click="onExport">Export</button>
              <button class="btn" @click="importInput.click()">Import</button>
              <button class="btn" @click="onCopyLink">Copy link</button>
              <button class="btn" @click="newPuzzle(); flash('New blank puzzle.')">New</button>
              <button class="btn" @click="loadDemo(); flash('Demo puzzle loaded.')">Demo</button>
            </div>
            <input
              ref="importInput"
              type="file"
              accept="application/json"
              hidden
              @change="onImport"
            />
          </div>

          <CardPool />

          <div class="panel">
            <div class="zone-title">Saved puzzles</div>
            <ul v-if="saved.length" class="saved-list">
              <li v-for="p in saved" :key="p.id">
                <span class="saved-name" :title="p.id">
                  {{ p.name }}<span v-if="p.date" class="saved-date"> · {{ p.date }}</span>
                  <span v-if="!p.date" class="saved-badge">draft</span>
                  <span v-else-if="p.date > localToday()" class="saved-badge">upcoming</span>
                </span>
                <button class="btn small" title="Play" @click="loadById(p.id)">▶</button>
                <button class="btn small" title="Edit" @click="loadById(p.id, { play: false })">✎</button>
                <button class="btn small danger" title="Delete" @click="onDelete(p.id)">🗑</button>
              </li>
            </ul>
            <p v-else class="hint">Nothing saved yet.</p>
            <button class="btn small" @click="onLoadDaily">
              Load current puzzle
            </button>
          </div>
        </template>

        <template v-else>
          <div class="panel">
            <div class="zone-title">Controls</div>
            <div class="btn-row">
              <button class="btn" :disabled="!state.moves.length" @click="undo">Undo</button>
              <button class="btn" @click="resetPlay">Reset</button>
              <button
                class="btn primary"
                :disabled="submitLocked"
                @click="onSubmit"
              >
                Submit solution
              </button>
              <button class="btn" @click="showArchive = !showArchive">
                {{ showArchive ? 'Hide archive' : 'Archive' }}
              </button>
            </div>
            <p v-if="!config.canEdit" class="hint">
              {{ state.tries }}/{{ MAX_TRIES }} tries used today
            </p>
            <p v-else class="hint">
              Unlimited submits (editor preview) — players get
              {{ MAX_TRIES }} per day.
            </p>
          </div>

          <ArchiveCalendar v-if="showArchive" @select="onArchiveSelect" />
        </template>

        <MoveLog />

        <div class="panel legend">
          <div class="zone-title">Legend</div>
          <ul class="legend-list">
            <li><kbd class="legend-kbd">Alt</kbd> hover a card to enlarge it</li>
            <li>
              <span class="legend-badge">SITE</span>
              Site — occupies a square of the grid
            </li>
            <li>
              <span class="legend-badge aura">AURA</span>
              Aura — sits on an intersection, always drawn on top
            </li>
            <li>
              <span class="legend-icon">🂠</span>
              Upside-down card — controlled by the opponent
            </li>
            <li>
              <span class="legend-badge under">BELOW</span>
              Underground card — darkened, use ↧/↥ to send under or surface
            </li>
            <li>
              <span class="legend-icon">⚔</span>
              Attack — click ⚔ on a unit, then click a unit or site
            </li>
            <li class="legend-elements">
              <span v-for="el in ['air', 'earth', 'fire', 'water']" :key="el" class="legend-el">
                <ThresholdIcon :element="el" /> {{ el }}
              </span>
            </li>
            <li v-if="state.mode === 'editor'">
              <span class="legend-icon">⛰</span> site ·
              <span class="legend-icon">✦</span> aura ·
              <span class="legend-icon">⇅</span> owner ·
              <span class="legend-icon">×</span> remove
            </li>
          </ul>
        </div>
      </aside>

      <main class="table">
        <Hand side="opponent" />
        <Board />
        <div class="zone-block storyline-block">
          <div class="zone-title">Storyline (shared)</div>
          <DropZone zone="storyline" class="storyline">
            <CardToken
              v-for="id in state.zones.storyline"
              :key="id"
              :card-id="id"
              from="storyline"
            />
          </DropZone>
        </div>
        <Hand side="player" />
      </main>
    </div>

    <div v-if="previewCard" class="card-preview-overlay">
      <img
        v-if="previewCard.img"
        :src="previewCard.img"
        :alt="previewCard.name"
      />
      <div v-else class="card-preview-name">{{ previewCard.name }}</div>
      <div class="card-preview-caption">{{ previewCard.name }}</div>
    </div>
  </div>
</template>
