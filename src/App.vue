<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  state,
  ui,
  playLocked,
  MAX_MISTAKES,
  hasUnsavedWork,
  loadById,
  loadDaily,
  endDrag,
  declineDefender,
  declineStoryChoice,
  destPrompt,
  shooterStage,
  storyShooterStage,
  activeAbility,
  storyPickState,
  finishStoryPicks,
  cancelArmed,
  cancelActivation,
  cancelDefenderPrompt,
} from './store.js'
import Board from './components/Board.vue'
import MoveLog from './components/MoveLog.vue'
import DropZone from './components/DropZone.vue'
import CardToken from './components/CardToken.vue'
import CardActions from './components/CardActions.vue'
import TriggerFeed from './components/TriggerFeed.vue'
import FxOverlay from './components/FxOverlay.vue'
import ChoicePopup from './components/ChoicePopup.vue'
import StatsBar from './components/StatsBar.vue'
import ArchiveCalendar from './components/ArchiveCalendar.vue'
import CardInspector from './components/CardInspector.vue'
import TopBar from './components/TopBar.vue'
import OpponentStrip from './components/OpponentStrip.vue'
import HandTray from './components/HandTray.vue'
import EditorSidebar from './components/EditorSidebar.vue'
import SolutionsPanel from './components/SolutionsPanel.vue'
import RecordingFrame from './components/RecordingFrame.vue'
import EditorNarrowNotice from './components/EditorNarrowNotice.vue'
import EditorToast from './components/EditorToast.vue'
import { enableDragScroll } from './dragScroll.js'

let stopDragScroll = null

// Under 1024 px the editor table isn't usable: the editor shows a notice with
// Play test and Share instead. Only the view changes -- the puzzle lives in
// the store, so nothing is unmounted from it or reset.
const NARROW_QUERY = '(max-width: 1023px)'
const narrowMq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(NARROW_QUERY) : null
const narrow = ref(!!narrowMq?.matches)
const onNarrow = (e) => (narrow.value = e.matches)
const editorTooNarrow = computed(() => state.mode === 'editor' && narrow.value)

// Phones and portrait tablets (the stacked layout, style.css <=1000px;
// .mockup/phone.html): your stats are one row and an empty storyline is one
// line, as in the editor, so the board and your hand fit on the screen.
const phoneMq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 1000px)') : null
const phone = ref(!!phoneMq?.matches)
const onPhone = (e) => (phone.value = e.matches)
// Empty, the storyline is one line, so the moves (play) or the solutions
// (editor) get the column's height. What it is for is in the Help dialog.
const storyCompact = computed(() => !state.zones.storyline.length)
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

async function onLoadDaily() {
  if (!(await loadDaily())) flash('No puzzle has been released yet.')
}

// Hold Alt while hovering a card to see it enlarged.
const previewCard = computed(() =>
  ui.alt && ui.hoverCard ? state.cards[ui.hoverCard] : null
)

// Site art may be a portrait scan of the upright card (see the board's
// .site-bg.portrait); the preview turns those to lie landscape so the text
// reads. Keyed by image URL: its height/width ratio, once loaded.
const previewRatio = reactive({})
const notePreviewRatio = (e, src) => {
  previewRatio[src] = e.target.naturalHeight / e.target.naturalWidth
}
const previewSideways = computed(() => {
  const c = previewCard.value
  return !!c?.site && previewRatio[c.img] > 1
})

function onKeyDown(e) {
  if (e.key === 'Alt') {
    e.preventDefault() // keep the browser from focusing its menu bar
    ui.alt = true
  }
  if (e.key === 'Escape') cancelArmed()
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
  narrowMq?.addEventListener('change', onNarrow)
  phoneMq?.addEventListener('change', onPhone)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('dragend', endDrag)
  window.removeEventListener('drop', endDrag)
  stopDragScroll?.()
  narrowMq?.removeEventListener('change', onNarrow)
  phoneMq?.removeEventListener('change', onPhone)
})

// A wrong move increments the counter; announce it as it happens. The board has
// already snapped back to the last good position by the time this fires.
watch(
  () => state.mistakes,
  (n, prev) => {
    if (n <= prev) return
    // The last mistake fails the day; the header verdict says so, and a
    // lingering "4/5" flash would contradict it.
    if (state.failed) notice.value = ''
    else flash(`✘ Wrong move — ${n}/${MAX_MISTAKES} mistakes.`)
  }
)
</script>

<template>
  <!-- One grid for both modes (see "play layout" in style.css):
         header | opp | left | board | right | tray
       Only the left column changes with the mode: the selected card in play,
       the editor's panels in the editor. -->
  <div v-if="editorTooNarrow" class="narrow-shell">
    <!-- The header (where editor messages show) isn't rendered here. -->
    <EditorToast class="narrow-toast" />
    <EditorNarrowNotice />
  </div>
  <div v-else class="app" :class="[`mode-${state.mode}`, { locked: playLocked }]">
    <TopBar class="area-header" :notice="notice" />

    <OpponentStrip class="area-opp" />

    <!-- Everything in the left column scrolls inside it, so the editor's
         panels can be as tall as they like without pushing the board or your
         hand off the window. -->
    <aside class="area-left">
      <EditorSidebar v-if="state.mode === 'editor'" />

      <template v-else>
        <!-- The selected card: it is what you are working with right now. -->
        <CardInspector :with-actions="!phone" />

        <!-- One panel, whichever state you are in. Loaded or not, the two
             things you can do are the same: play the current puzzle or open
             the archive. -->
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

      <!-- In the editor the Solutions panel (right) and the Card/Pool tabs
           replace the move log and the legend. -->

    </aside>

    <main class="area-board mat-area">
      <Board />

      <!-- Editor: "Start position" caption, or the red viewfinder while a
           solution line is being recorded. -->
      <RecordingFrame v-if="state.mode === 'editor'" />

      <!-- The one thing that still wants to be near the mat. It exists
           only while a card is selected, so it costs the grid height
           only while you are actually using it. -->
      <CardActions v-if="state.mode !== 'editor' && phone" />
    </main>

    <aside class="area-right">
      <SolutionsPanel v-if="state.mode === 'editor'" />

      <!-- The storyline is the shared resolution space. Triggered-ability and
           defender prompts resolve here too, rather than under the mat. -->
      <section
        class="zone-block storyline-block"
        :class="{ compact: storyCompact }"
        aria-label="Storyline"
      >
        <h2 class="section-title">Storyline</h2>
        <DropZone zone="storyline" class="storyline">
          <CardToken
            v-for="id in state.zones.storyline"
            :key="id"
            :card-id="id"
            from="storyline"
          />
          <!-- Empty, it says what it is for, so it isn't mistaken for a
               spare drop area. -->
          <p v-if="!state.zones.storyline.length" class="storyline-empty">
            Nothing is resolving.
          </p>
        </DropZone>

        <!-- What the last move triggered: compact chips, replaced by the
             next move. Click one for its rules text. -->
        <TriggerFeed />

        <!-- An attack paused for a defender. Highlighted units on the mat
             can take the hit; or press to let the attack through. -->
        <div
          v-if="ui.awaitingDefender"
          class="story-prompt defender-prompt"
        >
          <span>Attack: click a highlighted defender, or</span>
          <button class="btn small primary" @click="declineDefender">Attack directly</button>
          <button class="btn small" @click="cancelDefenderPrompt">Cancel</button>
        </div>

        <!-- "An ally shoots a projectile": the player picks the ally, then
             the unit its projectile hits (a spell may be drag-cast onto the
             ally, so this lives here rather than on the selected card). -->
        <div v-if="shooterStage()" class="story-prompt trigger-prompt">
          <span v-if="shooterStage() === 'shooter'">
            <strong>{{ state.cards[ui.activating.cardId]?.name }}</strong>
            — click the ally who shoots the projectile.
          </span>
          <span v-else>
            <strong>{{ state.cards[ui.activating.shooterId]?.name }}</strong>
            shoots — click the highlighted unit the projectile hits.
          </span>
          <button class="btn small" @click="cancelActivation">Cancel</button>
        </div>

        <!-- A spell (possibly drag-cast, so not selected) waits for its
             destination: where to teleport / where its token appears. -->
        <div v-if="ui.activating?.dest && ui.activating.cast" class="story-prompt trigger-prompt">
          <span>
            <strong>{{ state.cards[ui.activating.cardId]?.name }}</strong>
            — {{ destPrompt(activeAbility()) }}
          </span>
          <button class="btn small" @click="cancelActivation">Cancel</button>
        </div>

        <!-- A triggered ability is waiting for the player to pick its target.
             An optional ("may") one can also be declined. -->
        <div v-if="ui.storyChoice && !ui.storyChoice.pickModes" class="story-prompt trigger-prompt">
          <span>
            <strong>{{ state.cards[ui.storyChoice.ownerId]?.name }}</strong>
            — {{ ui.storyChoice.ability.name || 'triggered ability' }}:
            {{
              ui.storyChoice.dest
                ? destPrompt(ui.storyChoice.ability)
                : storyShooterStage() === 'shooter'
                ? 'click the ally who shoots the projectile.'
                : storyShooterStage() === 'hit'
                ? `${state.cards[ui.storyChoice.shooterId]?.name} shoots — click the unit the projectile hits.`
                : ui.storyChoice.ability.target.prompt || 'click a highlighted target.'
            }}
            <template v-if="storyPickState()">
              ({{ storyPickState().picked }}/{{ storyPickState().upTo ? 'up to ' : '' }}{{ storyPickState().needed }})
            </template>
          </span>
          <button
            v-if="storyPickState()?.upTo && storyPickState().picked"
            class="btn small primary"
            @click="finishStoryPicks"
          >
            Done
          </button>
          <button
            v-if="ui.storyChoice.ability.target.optional && !ui.storyChoice.dest"
            class="btn small"
            @click="declineStoryChoice"
          >
            No target
          </button>
        </div>
      </section>

      <!-- Play: the moves so far sit with the storyline -- both are what has
           happened -- and take the height it leaves, scrolling inside. -->
      <MoveLog v-if="state.mode === 'play'" class="moves-block" />

      <!-- Phone / tablet: one row like the opponent's strip (.mockup/phone.html
           "You Life 14 Mana 5 ..."), so the hand stays near the board. -->
      <section v-if="phone" class="you-strip" aria-label="You">
        <span class="you-name">You</span>
        <div class="you-stats">
          <StatsBar side="player" variant="strip" />
        </div>
      </section>
      <StatsBar v-else side="player" />
    </aside>

    <HandTray class="area-tray" />

    <FxOverlay />
    <ChoicePopup />

    <div v-if="previewCard" class="card-preview-overlay">
      <img
        v-if="previewCard.img"
        :src="previewCard.img"
        :alt="previewCard.name"
        :class="{ sideways: previewSideways }"
        :style="previewSideways ? { '--r': previewRatio[previewCard.img] } : null"
        @load="notePreviewRatio($event, previewCard.img)"
      />
      <div v-else class="card-preview-name">{{ previewCard.name }}</div>
    </div>
  </div>
</template>

<style scoped>
.narrow-shell {
  padding: var(--sp-5) var(--sp-3);
  color: var(--c-text);
  font-family: var(--font-ui);
}

.narrow-toast {
  margin-bottom: var(--sp-3);
}

/* Positioned for the editor RecordingFrame overlay; its caption straddles the
   top edge, so the area must not clip it. */
.area-board {
  position: relative;
  overflow: visible;
}

/* The right column: storyline on top taking the spare height, your stats
   under it (mockup: "Storyline" + "You"). */
.area-right {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  min-height: 0;
  overflow-y: auto;
}

/* Stacked layouts (style.css, <=1000px): storyline and You sit side by side
   and wrap. Restated here because the scoped column rule above outranks the
   global one, which turned their 240px basis into a height. */
@media (max-width: 1000px) {
  .area-right {
    flex-direction: row;
    flex-wrap: wrap;
    overflow: visible;
  }

  .area-right > * {
    flex: 1 1 240px;
  }
}

/* Grows into spare height but never shrinks under its content: on a short
   board row (embedded under a tall theme header) it was squeezed to a sliver
   with its heading spilling out; the column scrolls instead. */
/* Play: the moves take the height the storyline leaves and scroll inside. */
.moves-block {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.storyline-block {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: var(--sp-4);
}


/* Editor (and phones), nothing resolving: one line, so Solutions (or the
   board and hand) get the height. */
.storyline-block.compact {
  flex: 0 0 auto;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  padding: var(--sp-2) var(--sp-4);
}

.storyline-block.compact .storyline {
  flex: 1 1 120px;
  min-height: 0;
  padding: 4px 10px;
}

@media (max-width: 700px) {
  .area-right > .storyline-block,
  .area-right > .storyline-block.compact {
    flex: 1 1 100%;
  }
}

/* Trigger chips and prompts take their own line under the one-line row. */
.storyline-block.compact > :not(.section-title, .storyline) {
  flex: 1 1 100%;
  min-width: 0;
}

.storyline-block.compact .storyline-empty {
  margin: 0;
  padding: 0;
  max-width: none;
  text-align: left;
}

.section-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--fs-lg);
  color: var(--c-cream-hi);
}

.storyline-block .storyline {
  flex: 1 1 auto;
}

.storyline-empty {
  margin: auto;
  padding: 8px;
  max-width: 30ch;
  text-align: center;
  font-size: var(--fs-sm);
  line-height: 1.45;
  color: var(--c-muted-lo);
  pointer-events: none;
}

.area-right :deep(.stats-panel) {
  padding: var(--sp-4);
}

.you-strip {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: 4px var(--sp-3);
  background: var(--c-panel);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
}

.you-name {
  flex: none;
  font-family: var(--font-display);
  font-size: 19px;
  color: var(--c-gold);
}

/* The strip wraps on phones (StatsBar), so the row grows with it rather than
   clipping or scrolling sideways. */
.you-stats {
  min-width: 0;
  min-height: 48px;
  display: flex;
  align-items: center;
}

.area-right :deep(.stat-side) {
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  color: var(--c-gold);
}

/* Moved from style.css: this component's own rules. */
/* Trigger / defender prompts resolve in the storyline rather than under the
   mat, so they read where the shared space is. */
.story-prompt {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  font-size: 0.85rem;
}

/* Both are waiting on you, so both wear the gold dashed "your move" edge
   (mockup storyline entry); the words say which kind of wait it is. */
.defender-prompt,
.trigger-prompt {
  border: 1.5px dashed var(--c-gold);
  background: var(--c-gold-bg);
}

.card-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.6);
  pointer-events: none;
}

.card-preview-name {
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 120px 60px;
  font-size: 24px;
  font-family: Georgia, serif;
}
</style>
