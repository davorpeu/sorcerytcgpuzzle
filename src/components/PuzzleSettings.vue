<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { state, listPuzzles, localToday } from '../store.js'

// The Puzzle tab: what players never read directly -- when the puzzle goes
// live, which rules the engine enforces, and whether the draw decks show.
// Title and brief are edited in the header, where players read them.

// "2026-10-03" -> "3 October 2026". Built from parts so no timezone shifts it.
function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Same comparison the saved list makes: no date = draft, a date after today =
// upcoming, otherwise released (today's puzzle or in the archive).
const release = computed(() => {
  const date = state.puzzleDate
  if (!date) return { kind: 'draft', text: "Draft. Players can't see it until you set a date." }
  const today = localToday()
  if (date > today) return { kind: 'up', text: `Upcoming. Goes live on ${longDate(date)}.` }
  if (date === today) return { kind: 'live', text: "Live. This is today's puzzle." }
  return { kind: 'live', text: `Live since ${longDate(date)}, in the archive.` }
})

// Decision c: warn when another saved puzzle goes live on the same date.
const saved = ref([])
async function refreshSaved() {
  saved.value = (await listPuzzles()) || []
}
onMounted(refreshSaved)
// A save gives the puzzle its id and a load swaps it: either way the list the
// clash is checked against has changed since mount.
watch(() => state.puzzleId, refreshSaved)

const clash = computed(() => {
  const date = state.puzzleDate
  if (!date) return null
  return saved.value.find((p) => p.date === date && p.id !== state.puzzleId) || null
})

const switches = [
  {
    group: 'rules',
    key: 'enforce',
    label: 'Enforce movement and attacks',
    help: 'Move and attack obey reach, regions and keywords.',
  },
  {
    group: 'rules',
    key: 'combat',
    label: 'Resolve combat damage',
    help: 'Attack, strike and shoot deal power damage and kill by life or lethal.',
  },
  { group: 'decks', key: 'hideAtlas', label: 'Hide the Atlas' },
  { group: 'decks', key: 'hideSpellbook', label: 'Hide the Spellbook' },
]
const rules = switches.filter((s) => s.group === 'rules')
const decks = switches.filter((s) => s.group === 'decks')
</script>

<template>
  <div class="puzzle-settings">
    <section class="grp" aria-labelledby="ps-release">
      <h3 id="ps-release" class="grp-h">Release</h3>
      <label class="flabel" for="ps-date">Release date</label>
      <input id="ps-date" v-model="state.puzzleDate" type="date" class="text-input" />
      <p class="stword" :class="release.kind" role="status">{{ release.text }}</p>
      <p v-if="clash" class="warnline">
        Another saved puzzle, “{{ clash.name || 'Untitled puzzle' }}”, also goes live on this date.
      </p>
      <p class="help">
        Players see this puzzle from this date. Leave it empty to keep it unpublished.
      </p>
    </section>

    <div class="rule" aria-hidden="true"></div>

    <section class="grp" aria-labelledby="ps-rules">
      <h3 id="ps-rules" class="grp-h">Rules</h3>
      <!-- Every solution line has to be recorded under the same rules, as it
           starts from the same setup (CardSetup locks that too). -->
      <p v-if="state.recording" class="help lock-note" role="note">
        <span aria-hidden="true">🔒 </span>Locked while you record. Stop recording to change the
        rules.
      </p>
      <label v-for="s in rules" :key="s.key" class="sw" :class="{ locked: state.recording }">
        <input
          v-model="state[s.key]"
          type="checkbox"
          role="switch"
          class="sw-input"
          :disabled="state.recording"
        />
        <span class="track" aria-hidden="true"></span>
        <span class="t">
          <b>{{ s.label }} <small>{{ state[s.key] ? 'On' : 'Off' }}</small></b>
          <span>{{ s.help }}</span>
        </span>
      </label>
      <p class="help">Both are independent. Turn both off for free-form puzzles.</p>
    </section>

    <div class="rule" aria-hidden="true"></div>

    <section class="grp" aria-labelledby="ps-decks">
      <h3 id="ps-decks" class="grp-h">Decks</h3>
      <label v-for="s in decks" :key="s.key" class="sw">
        <input v-model="state[s.key]" type="checkbox" role="switch" class="sw-input" />
        <span class="track" aria-hidden="true"></span>
        <span class="t">
          <b>{{ s.label }} <small>{{ state[s.key] ? 'On' : 'Off' }}</small></b>
        </span>
      </label>
      <p class="help">
        For puzzles that don't use the draw decks. A hidden deck still shows while it has cards
        in it.
      </p>
    </section>
  </div>
</template>

<style scoped>
.puzzle-settings {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  font-family: var(--font-ui);
  color: var(--c-text);
}

.grp {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.grp-h {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--fs-lg);
  color: var(--c-cream-hi);
}

.flabel {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--c-muted-hi);
}

.rule {
  height: 1px;
  background: var(--c-line);
  flex-shrink: 0;
}

.help {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--c-muted);
}

/* Release status: a word and a glyph, never colour alone. */
.stword {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  color: var(--c-muted-hi);
}
.stword::before {
  content: '';
  flex-shrink: 0;
}
.stword.live::before {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c-ok);
}
.stword.up::before {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1.5px solid var(--c-gold);
}
.stword.draft::before {
  width: 8px;
  height: 8px;
  border: 1.5px dashed var(--c-muted);
  border-radius: 2px;
}

.warnline {
  margin: 0;
  display: flex;
  gap: 6px;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--c-warn);
}
.warnline::before {
  content: '!';
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  border: 1.5px solid var(--c-warn);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
}

/* Switch: a real checkbox (role switch) under a drawn track; the On/Off word
   says the state so the track's colour is never the only cue. */
.sw {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}
.sw-input {
  position: absolute;
  opacity: 0;
  width: 40px;
  height: 22px;
  margin: 0;
  cursor: pointer;
}
.track {
  flex-shrink: 0;
  position: relative;
  width: 40px;
  height: 22px;
  margin-top: 1px;
  border-radius: 11px;
  border: 1.5px solid var(--c-line-strong);
  background: var(--c-felt-deep);
}
.track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: var(--c-muted-2);
  transition: left 0.15s;
}
.sw-input:checked + .track {
  border-color: var(--c-gold);
  background: var(--c-gold-bg);
}
.sw-input:checked + .track::after {
  left: 19px;
  background: var(--c-gold);
}
.sw-input:focus-visible + .track {
  outline: 2px solid var(--c-focus);
  outline-offset: 2px;
}
/* Locked while recording: dimmed, and the note above says why in words. */
.sw.locked {
  opacity: 0.55;
  cursor: not-allowed;
}
.t {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.t b {
  font-weight: 700;
  font-size: var(--fs-md);
  color: var(--c-cream-hi);
}
.t b small {
  margin-left: 6px;
  font-weight: 400;
  font-size: var(--fs-sm);
  color: var(--c-muted);
}
.t span {
  font-size: var(--fs-sm);
  line-height: 1.35;
  color: var(--c-muted);
}

@media (prefers-reduced-motion: reduce) {
  .track::after {
    transition: none;
  }
}
</style>
