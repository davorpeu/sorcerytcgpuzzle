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
  hasSolution,
  hasUnsavedWork,
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
  endDrag,
} from './store.js'
import Board from './components/Board.vue'
import Hand from './components/Hand.vue'
import CardPool from './components/CardPool.vue'
import MoveLog from './components/MoveLog.vue'
import DropZone from './components/DropZone.vue'
import CardToken from './components/CardToken.vue'
import ThresholdIcon from './components/ThresholdIcon.vue'
import CardActions from './components/CardActions.vue'
import StatsBar from './components/StatsBar.vue'
import ArchiveCalendar from './components/ArchiveCalendar.vue'
import { enableDragScroll } from './dragScroll.js'

const saved = ref([])
const importInput = ref(null)
let stopDragScroll = null
const notice = ref('')
const showArchive = ref(false)
// Your side lives in the left column, which had 550px of nothing under the
// folded panels; as a band under the mat it cost the grid 210px of height.
// The opponent's zones are reference rather than workspace, so they stay a
// tray over the mat's top edge and start shut.
const oppOpen = ref(false)

const count = (zone) => state.zones[zone].length

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

// Deleting a stored puzzle, wiping the board and dropping a recorded line are
// all one click and none of them are undoable -- Undo only walks back moves.
// So each one asks first, naming what it is about to destroy.
async function onDelete(id, name) {
  if (!confirm(`Delete "${name || 'this puzzle'}" for good? This cannot be undone.`))
    return
  try {
    await deletePuzzle(id)
  } catch (e) {
    flash(`Delete failed: ${e.message}`)
  }
  refreshSaved()
}

function onNew() {
  if (
    hasUnsavedWork() &&
    !confirm('Start a blank puzzle? The cards, board and solutions here have not been saved.')
  )
    return
  newPuzzle()
  flash('New blank puzzle.')
}

function onLoadDemo() {
  if (
    hasUnsavedWork() &&
    !confirm('Load the demo puzzle? The unsaved work here will be replaced.')
  )
    return
  loadDemo()
  flash('Demo puzzle loaded.')
}

function onRemoveSolution(i) {
  if (!confirm(`Delete solution ${i + 1}? This cannot be undone.`)) return
  removeSolutionLine(i)
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
  if (ok === null) {
    // Either there is nothing to check against or there is no try left. The
    // banner explains the second case; the first one has no banner, because
    // nothing was checked.
    if (!hasSolution())
      flash('This puzzle has no recorded solution, so there is nothing to check.')
    return
  }
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

// Non-editors can no longer submit once solved or out of tries. Nobody can
// submit against a puzzle with no recorded line: there is no answer to be
// measured against, and pressing it used to report a win.
const submitLocked = computed(
  () => !hasSolution() || (!config.canEdit && (state.solved || outOfTries()))
)

const submitTitle = computed(() => {
  if (!hasSolution()) return 'This puzzle has no recorded solution to check against'
  return config.canEdit ? 'Unlimited submits in editor preview' : ''
})

// Shortest recorded solution line; what the play header advertises.
const targetMoves = computed(() =>
  state.solutions.length
    ? Math.min(...state.solutions.map((l) => l.length))
    : 0
)

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// The selected card also shows in the middle of the stats rail, so you can
// read what you are holding without hunting for it on the mat.
const selectedCard = computed(() =>
  ui.selected ? state.cards[ui.selected] : null
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
  if (e.key === 'Escape') {
    ui.attacker = null
    ui.carrier = null
    ui.striker = null
    ui.moving = null
    ui.selected = null
  }
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

// There is no autosave, and Undo does not survive a page load, so a reload
// with an unsaved board on screen loses the whole puzzle. Browsers only show
// their own generic wording here, but the prompt is what matters.
function onBeforeUnload(e) {
  if (!hasUnsavedWork()) return
  e.preventDefault()
  e.returnValue = ''
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  window.addEventListener('beforeunload', onBeforeUnload)
  // A drag can end anywhere, including outside the board, so the flag that
  // wakes the board's drop zones is cleared from the window rather than from
  // whatever happened to be under the pointer.
  window.addEventListener('dragend', endDrag)
  window.addEventListener('drop', endDrag)
  stopDragScroll = enableDragScroll()
  if (config.canEdit) refreshSaved()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('dragend', endDrag)
  window.removeEventListener('drop', endDrag)
  stopDragScroll?.()
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
      <!-- Undo, Reset and Submit are what you reach for on every move, so
           they sit next to Play rather than in a sidebar panel. -->
      <div v-if="state.mode === 'play'" class="topbar-actions">
        <button class="btn" :disabled="!state.moves.length" @click="undo">
          Undo
        </button>
        <button class="btn" @click="resetPlay">Reset</button>
        <button
          class="btn primary"
          :disabled="submitLocked"
          :title="submitTitle"
          @click="onSubmit"
        >
          Submit solution
        </button>
        <span v-if="!config.canEdit" class="tries">
          {{ state.tries }}/{{ MAX_TRIES }} tries
        </span>
      </div>

      <div v-if="state.puzzleName && state.mode === 'play'" class="puzzle-title">
        {{ state.puzzleName }}
        <span v-if="state.solutions.length" class="target">
          · solve in {{ plural(targetMoves, 'move') }}<template
            v-if="state.solutions.length > 1"
          >
            · {{ state.solutions.length }} possible solutions</template
          >
        </span>
      </div>
      <!-- Both of these appear without the user moving focus, so they have to
           be announced rather than merely drawn. The wrappers stay in the DOM
           when empty: a live region inserted at the same moment as its text is
           not reliably read. -->
      <span class="notice" role="status" aria-live="polite">{{ notice }}</span>
    </header>

    <div aria-live="polite">
      <div v-if="result" class="result-banner" :class="result.ok ? 'ok' : 'bad'">
        {{ result.msg }}
      </div>
    </div>

    <div class="layout">
      <aside class="sidebar">
        <!-- Everything above your own zones scrolls inside the column, so the
             editor's panels can be as tall as they like without pushing your
             hand off the bottom of the window. Your side stays pinned to the
             foot of the column, beside the board, where it is in reach
             whatever the panels above it are doing. -->
        <div class="sidebar-scroll">
        <template v-if="state.mode === 'editor'">
          <div class="panel">
            <div class="zone-title">Puzzle</div>
            <label class="sr-only" for="puzzle-title">Puzzle title</label>
            <input
              id="puzzle-title"
              v-model="state.puzzleName"
              class="text-input"
              placeholder="Puzzle title"
            />
            <label class="sr-only" for="puzzle-brief">
              Brief — what kind of puzzle is this and what should the player
              achieve?
            </label>
            <textarea
              id="puzzle-brief"
              v-model="state.puzzleDesc"
              class="text-input text-area"
              rows="3"
              placeholder="Brief — what kind of puzzle is this and what should the player achieve?"
            ></textarea>
            <p class="hint">
              Shown to players before they start. Say what the goal is, e.g.
              &ldquo;Lethal: put the opponent at Death&rsquo;s Door this
              turn&rdquo;.
            </p>
            <label class="field-label" for="puzzle-date">
              Release date
              <input
                id="puzzle-date"
                v-model="state.puzzleDate"
                type="date"
                class="text-input"
              />
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
                  Solution {{ i + 1 }} · {{ plural(line.length, 'move') }}
                </span>
                <button
                  class="btn small danger"
                  :title="`Delete solution ${i + 1}`"
                  :aria-label="`Delete solution ${i + 1}`"
                  @click="onRemoveSolution(i)"
                >
                  🗑
                </button>
              </li>
            </ul>
            <p v-if="!state.solutions.length && !state.recording" class="hint warn">
              No solution recorded yet — until you record one, players can move
              cards but <em>Submit solution</em> has nothing to check.
            </p>
            <div class="btn-row">
              <button class="btn" @click="onSave">Save</button>
              <button class="btn" @click="onExport">Export</button>
              <button class="btn" @click="importInput.click()">Import</button>
              <button class="btn" @click="onCopyLink">Copy link</button>
              <button class="btn" @click="onNew">New</button>
              <button class="btn" @click="onLoadDemo">Demo</button>
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
                <button
                  class="btn small"
                  :title="`Play ${p.name}`"
                  :aria-label="`Play ${p.name}`"
                  @click="loadById(p.id)"
                >
                  ▶
                </button>
                <button
                  class="btn small"
                  :title="`Edit ${p.name}`"
                  :aria-label="`Edit ${p.name}`"
                  @click="loadById(p.id, { play: false })"
                >
                  ✎
                </button>
                <button
                  class="btn small danger"
                  :title="`Delete ${p.name}`"
                  :aria-label="`Delete ${p.name}`"
                  @click="onDelete(p.id, p.name)"
                >
                  🗑
                </button>
              </li>
            </ul>
            <p v-else class="hint">Nothing saved yet.</p>
            <button class="btn small" @click="onLoadDaily">
              Load current puzzle
            </button>
          </div>
        </template>

        <template v-else>
          <div v-if="state.puzzleName || state.puzzleDesc" class="panel brief">
            <div class="zone-title">Puzzle</div>
            <h2 class="brief-title">
              {{ state.puzzleName || 'Untitled puzzle' }}
            </h2>
            <p v-if="state.puzzleDesc" class="brief-desc">
              {{ state.puzzleDesc }}
            </p>
            <p v-else class="hint">No brief was written for this puzzle.</p>
            <p v-if="state.solutions.length" class="brief-goal">
              Solve in {{ plural(targetMoves, 'move') }}
              <template v-if="state.solutions.length > 1">
                · {{ state.solutions.length }} possible solutions
              </template>
            </p>
            <p v-else class="hint warn">
              This puzzle has no recorded solution, so there is nothing to
              submit against.
            </p>
          </div>

          <!-- One panel, whichever state you are in. Loaded or not, the two
               things you can do are the same: play the current puzzle or open
               the archive. Two panels offering both, a row apart and under two
               names for the same button, only made you read them twice. -->
          <div class="panel">
            <div class="zone-title">
              {{ state.puzzleName ? 'Puzzles' : 'No puzzle loaded' }}
            </div>
            <p v-if="!state.puzzleName" class="hint">
              Pick a puzzle to play — the current one, or any date in the
              archive.
            </p>
            <div class="btn-row">
              <button
                class="btn"
                :class="{ primary: !state.puzzleName }"
                @click="onLoadDaily"
              >
                Play current puzzle
              </button>
              <button
                class="btn"
                :aria-expanded="showArchive"
                @click="showArchive = !showArchive"
              >
                {{ showArchive ? 'Hide archive' : 'Archive' }}
              </button>
            </div>
          </div>

          <ArchiveCalendar v-if="showArchive" @select="onArchiveSelect" />
        </template>

        <MoveLog />

        <details class="panel legend">
          <summary class="panel-summary">Legend</summary>
          <ul class="legend-list">
            <li><kbd class="legend-kbd">Alt</kbd> hover a card to enlarge it</li>
            <li>
              <kbd class="legend-kbd">Tab</kbd> to a card and
              <kbd class="legend-kbd">Enter</kbd> to select it, then
              <kbd class="legend-kbd">Tab</kbd> to a zone and
              <kbd class="legend-kbd">Enter</kbd> to move it there.
              <kbd class="legend-kbd">Esc</kbd> deselects
            </li>
            <li>
              <span class="legend-badge unit">UNIT</span>
              Unit — can move (taps), strike, attack (taps), or tap
            </li>
            <li>
              <span class="legend-badge avatar">AVATAR</span>
              Avatar — special unit representing the player
            </li>
            <li>
              <span class="legend-badge">SITE</span>
              Site — occupies a square of the grid
            </li>
            <li>
              <span class="legend-badge aura">AURA</span>
              Aura — sits on an intersection, always drawn on top
            </li>
            <li>
              <span class="legend-badge tap">TAP</span>
              Tapped card — turned 90° after moving, attacking, or playing a site
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
              <span class="legend-icon">☞</span>
              Click a card to select it — its actions (move, attack, strike, send below,
              control) appear above the storyline
            </li>
            <li>
              <span class="legend-icon">✋</span>
              Carried card — picked up by another card, travels with it until
              its holder drops it
            </li>
            <li>
              <span class="legend-icon">→</span>
              With a card selected, click any zone to move it there (works
              without dragging, e.g. on a tablet)
            </li>
            <li class="legend-elements">
              <span v-for="el in ['air', 'earth', 'fire', 'water']" :key="el" class="legend-el">
                <ThresholdIcon :element="el" /> {{ el }}
              </span>
            </li>
          </ul>
        </details>
        </div>

        <!-- Your side of the table, nearest you, exactly as it sits on a real
             one. The cemetery and collection wrap onto their own row here
             because the column is too narrow for three zones abreast. -->
        <div class="your-side">
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
        </div>
      </aside>

      <main class="table">
        <div class="mat-area">
          <!-- The opponent's zones are reference, not workspace, so they ride
               over the top edge of the mat as a count bar and open only when
               you actually need to look. -->
          <div class="zone-tray opp-tray" :class="{ open: oppOpen }">
            <button
              class="tray-toggle"
              :title="oppOpen ? 'Hide the opponent zones' : 'Show the opponent zones'"
              @click="oppOpen = !oppOpen"
            >
              <span class="tray-caret">{{ oppOpen ? '▴' : '▾' }}</span>
              Opponent
              <span class="tray-counts">
                hand {{ count('hand:opponent') }} &middot; cemetery
                {{ count('grave:opponent') }} &middot; collection
                {{ count('collection:opponent') }}
              </span>
            </button>
            <div v-show="oppOpen" class="tray-body">
              <Hand side="opponent" />
            </div>
          </div>

          <Board />

          <!-- The one thing that still wants to be near the mat. It exists
               only while a card is selected, so it costs the grid height
               only while you are actually using it. -->
          <CardActions />
        </div>

        <!-- Life, mana and thresholds sit beside the board rather than inside
             the hand rows: no vertical cost, and each side's numbers sit on
             that side's edge of the table. -->
        <div class="stat-rail">
          <StatsBar side="opponent" />

          <!-- The gap between the two sides is the one piece of rail nothing
               else wants, so the selected card sits there. -->
          <div v-if="selectedCard" class="rail-preview">
            <div class="zone-title">Selected</div>
            <div class="rail-preview-frame">
              <img
                v-if="selectedCard.img"
                :src="selectedCard.img"
                :alt="selectedCard.name"
                draggable="false"
              />
              <span v-else class="rail-preview-fallback">
                {{ selectedCard.name }}
              </span>
            </div>
            <div class="rail-preview-name">{{ selectedCard.name }}</div>
          </div>

          <StatsBar side="player" />
        </div>
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
