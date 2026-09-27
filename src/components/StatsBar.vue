<script setup>
import { computed } from 'vue'
import {
  state,
  ui,
  adjustStat,
  ELEMENTS,
  effectiveThreshold,
  providedMana,
  gainManaFromSites,
  isSpell,
  castSide,
  castSourceOk,
  castCostOf,
  castManaCost,
} from '../store.js'
import ThresholdIcon from './ThresholdIcon.vue'

const props = defineProps({
  side: { type: String, required: true }, // 'player' | 'opponent'
  // 'panel' is the "You" card in the right column; 'strip' lies the same
  // stats down in one row for the opponent strip.
  variant: { type: String, default: 'panel' }, // 'panel' | 'strip'
})

const strip = computed(() => props.variant === 'strip')
const title = computed(() => (props.side === 'player' ? 'You' : 'Opponent'))
const regionLabel = computed(() =>
  props.side === 'player'
    ? 'Your life, mana and thresholds'
    : 'Opponent life, mana and thresholds',
)

// Mana the side's sites would yield; the button collects it into the pool.
const siteMana = computed(() => providedMana(props.side))

const life = computed(() => state.stats[props.side].life)
// 0 life is not "dead" in Sorcery but Death's Door, a state of its own; the
// next hit there ends the avatar. A few points above it is already the zone a
// puzzle is usually about, so the badge counts the distance down from 5.
const LOW_LIFE = 5
const atDoor = computed(() => life.value <= 0)
const lifeState = computed(() =>
  atDoor.value ? 'door' : life.value <= LOW_LIFE ? 'low' : 'healthy',
)
const lifeNote = computed(() => {
  if (atDoor.value) return 'At Death’s Door'
  if (lifeState.value === 'low') return `${life.value} from Death’s Door`
  return 'Healthy'
})

// Life, mana and thresholds are set up in the editor. In play the engine
// moves them (casting pays mana, damage costs life), so the stats are read-only.
const editing = computed(() => state.mode === 'editor')

// The selected card's cast, previewed on the side that would pay for it: only
// a spell lying somewhere it can be cast from, and only on its caster's stats.
const preview = computed(() => {
  const id = ui.selected
  if (!id || !isSpell(id) || !castSourceOk(id)) return null
  if (castSide(id) !== props.side) return null
  return { mana: castManaCost(id), threshold: castCostOf(id) }
})

// Mana as pips: filled for what is in the pool, hollow for what the preview
// would spend. Past a dozen the pips stop being countable at a glance, so the
// row falls back to the number alone.
const MAX_PIPS = 12
const mana = computed(() => state.stats[props.side].mana || 0)
const spend = computed(() => preview.value?.mana || 0)
const manaShort = computed(() => Math.max(0, spend.value - mana.value))
const pips = computed(() => {
  const total = Math.max(mana.value, spend.value)
  if (total > MAX_PIPS) return null
  const kept = Math.max(0, mana.value - spend.value)
  return Array.from({ length: total }, (_, i) =>
    i < kept ? 'full' : i < mana.value ? 'spend' : 'missing',
  )
})

// A threshold is compared, never spent: against the selected card it is
// either met or short by some amount. Elements the card doesn't ask for stay
// plain. Listed fire, water, earth, air, as the mockup does.
const ORDER = ['fire', 'water', 'earth', 'air'].filter((el) => ELEMENTS.includes(el))
const thresholds = computed(() =>
  ORDER.map((el) => {
    const have = effectiveThreshold(props.side, el)
    const base = state.stats[props.side][el] || 0
    const need = preview.value?.threshold[el] || 0
    const gap = need - have
    const check = !need ? null : gap > 0 ? { met: false, gap } : { met: true, gap: 0 }
    return {
      el,
      name: el[0].toUpperCase() + el.slice(1),
      have,
      check,
      verdict: check && (check.met ? 'met' : `short ${check.gap}`),
      title: `${have} ${el} threshold (base ${base} + board and passives ${have - base})`,
    }
  }),
)
const thresholdShort = computed(() => thresholds.value.some((t) => t.check && !t.check.met))

const manaNote = computed(() => {
  if (!preview.value) return mana.value ? `All ${mana.value} available` : 'Empty'
  if (manaShort.value) return `Short by ${manaShort.value} mana`
  if (thresholdShort.value) return 'Missing threshold, can’t cast'
  if (!spend.value) return 'Costs nothing'
  return `Casting spends ${spend.value} of ${mana.value}`
})
const manaNoteWarn = computed(() => manaShort.value > 0 || thresholdShort.value)

// Two dozen steppers on screen, every one of them labelled "+" or "-".
// Spoken in order that is two dozen identical buttons, so each one says which
// number it moves and for whom.
const who = computed(() => (props.side === 'player' ? 'your' : "opponent's"))
const step = (what, delta) =>
  `${delta > 0 ? 'Increase' : 'Decrease'} ${who.value} ${what}`
</script>

<template>
  <section
    class="stats stat-card"
    :class="[`stats-${strip ? 'strip' : 'panel'}`, `side-${side}`, { editing }]"
    :aria-label="regionLabel"
  >
    <div v-if="!strip" class="stats-head">
      <span class="stats-title">{{ title }}</span>
      <span class="life-note" :class="`life-${lifeState}`">{{ lifeNote }}</span>
    </div>

    <div class="stats-main">
      <!-- Life: the badge's line carries the state as well as its colour
           (plain, red, doubled red with a skull), and the words beside it
           always name the state. -->
      <div class="stat stat-life" :class="`life-${lifeState}`">
        <div class="life-badge-col">
          <span class="life-badge" :title="`${life} life. ${lifeNote}`">
            <span v-if="atDoor" class="door-icon" aria-hidden="true">☠</span>{{ life }}
          </span>
          <span v-if="!strip" class="life-caption">Life</span>
          <span v-if="editing" class="adj">
            <button
              type="button"
              class="adj-btn"
              :aria-label="step('life', -1)"
              @click="adjustStat(side, 'life', -1)"
            >
              −
            </button>
            <span class="adj-val" aria-hidden="true">{{ life }}</span>
            <button
              type="button"
              class="adj-btn"
              :aria-label="step('life', 1)"
              @click="adjustStat(side, 'life', 1)"
            >
              +
            </button>
          </span>
        </div>
        <div v-if="strip" class="life-words">
          <span class="stat-name">Life</span>
          <span class="life-note">{{ lifeNote }}</span>
        </div>
      </div>

      <!-- Mana: filled pips are the pool, hollow ones what the selected card
           would spend, dashed red ones what it needs but the pool lacks. -->
      <div class="stat stat-mana">
        <span class="stat-name">Mana <span class="num">{{ mana }}</span></span>
        <span v-if="!strip && pips && pips.length" class="mana-pips" aria-hidden="true">
          <span v-for="(p, i) in pips" :key="i" class="pip" :class="`pip-${p}`" />
        </span>
        <span class="mana-note" :class="{ warn: manaNoteWarn }" aria-live="polite">
          {{ manaNote }}
        </span>
        <span v-if="editing" class="adj">
          <button
            type="button"
            class="adj-btn"
            :aria-label="step('mana', -1)"
            @click="adjustStat(side, 'mana', -1)"
          >
            −
          </button>
          <span class="adj-val" aria-hidden="true">{{ mana }}</span>
          <button
            type="button"
            class="adj-btn"
            :aria-label="step('mana', 1)"
            @click="adjustStat(side, 'mana', 1)"
          >
            +
          </button>
          <button
            v-if="siteMana"
            type="button"
            class="adj-btn adj-wide"
            :title="`Gain ${siteMana} mana from ${who} sites`"
            :aria-label="`Gain ${siteMana} mana from ${who} sites`"
            @click="gainManaFromSites(side)"
          >
            +{{ siteMana }} from sites
          </button>
        </span>
      </div>
    </div>

    <!-- Thresholds only gain a line when the selected card asks for that
         element: solid and "met", or dashed and "short N". -->
    <ul class="thresholds" :aria-label="`${side === 'player' ? 'Your' : 'Opponent'} thresholds`">
      <li
        v-for="t in thresholds"
        :key="t.el"
        class="stat th-chip"
        :class="t.check && (t.check.met ? 'th-met' : 'th-short')"
        :title="t.title"
      >
        <span class="th-count">
          <ThresholdIcon :element="t.el" aria-hidden="true" />
          <span class="num">{{ t.have }}</span>
        </span>
        <span class="th-name" :class="{ 'sr-only': strip }">{{ t.name }}</span>
        <span v-if="t.verdict" class="th-verdict">{{ t.verdict }}</span>
        <span v-if="editing" class="adj">
          <button
            type="button"
            class="adj-btn"
            :aria-label="step(`${t.el} threshold`, -1)"
            @click="adjustStat(side, t.el, -1)"
          >
            −
          </button>
          <span class="adj-val" aria-hidden="true">{{ t.have }}</span>
          <button
            type="button"
            class="adj-btn"
            :aria-label="step(`${t.el} threshold`, 1)"
            @click="adjustStat(side, t.el, 1)"
          >
            +
          </button>
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/* Player stats are gold on cream, the opponent's slate. Everything below
   reads these three, so the side is decided in one place. */
.stats {
  --side-accent: var(--c-gold);
  --side-ink: var(--c-cream-hi);
  --side-surface: var(--c-raised-2);
  font-family: var(--font-ui);
  font-variant-numeric: lining-nums tabular-nums;
  color: var(--c-text);
}

.side-opponent {
  --side-accent: var(--c-opp);
  --side-ink: var(--c-opp-hi);
  --side-surface: var(--c-opp-deep);
}

.num {
  font-variant-numeric: lining-nums tabular-nums;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* ---------- panel ("You") ---------- */

.stats-panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  background: var(--c-panel);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
}

.stats-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.stats-head .life-note {
  font-size: 14px;
  text-align: right;
}

.stats-title {
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  color: var(--side-accent);
}

.stats-main {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
}

.stat {
  position: relative;
}

.stat-life {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.stats-panel .stat-life {
  flex-shrink: 0;
}

.life-badge-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.life-badge {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 10px 10px 28px 28px;
  background: var(--side-surface);
  border: 1.5px solid var(--side-accent);
  /* The mockup sets this in IM Fell, but its figures are old-style only and
     "20" read as "2o"; the UI face has true lining figures. */
  font-family: var(--font-ui);
  font-weight: 700;
  font-size: 28px;
  line-height: 1;
  color: var(--side-ink);
  font-variant-numeric: lining-nums tabular-nums;
}

.life-caption {
  font-size: var(--fs-sm);
  color: var(--c-muted);
}

.life-words {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.life-note {
  font-size: var(--fs-sm);
  color: var(--c-muted);
  line-height: 1.2;
}

/* Low: a red line. Death's Door: a doubled red line, a red wash and a skull.
   The words say the same thing for anyone who can't tell the reds apart. */
.life-low .life-badge {
  border-color: var(--c-danger);
  background: var(--c-danger-bg);
  color: var(--c-cream-hi);
}

.life-door .life-badge {
  border: 3px double var(--c-danger);
  background: var(--c-danger-bg);
  color: var(--c-danger-soft);
}

.door-icon {
  font-size: 0.55em;
  margin-right: 2px;
}

.life-low .life-note,
.life-door .life-note,
.life-note.life-low,
.life-note.life-door {
  color: var(--c-danger-soft);
}

.life-door .life-note,
.life-note.life-door {
  font-weight: 700;
}

.stat-mana {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.stat-name {
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--c-text);
}

.mana-pips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pip {
  width: 14px;
  height: 14px;
  box-sizing: border-box;
  border-radius: 50%;
  border: 2px solid var(--side-accent);
  background: var(--side-accent);
  transition: background-color 0.15s ease;
}

.pip-spend {
  background: transparent;
}

.pip-missing {
  background: transparent;
  border: 2px dashed var(--c-danger);
}

.mana-note {
  font-size: var(--fs-sm);
  color: var(--c-muted);
  line-height: 1.2;
}

.mana-note.warn {
  color: var(--c-danger-soft);
}

.thresholds {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.th-chip {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 5px 0;
  border: 1px solid var(--c-line);
  border-radius: 6px;
}

.th-count {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 17px;
  font-weight: 700;
  color: var(--c-text);
}

.th-count .th-icon {
  width: 14px;
  height: 14px;
}

.th-name {
  font-size: var(--fs-xs);
  color: var(--c-muted);
}

/* Met is a solid gold line, short a dashed red one, each with its word. */
.th-met {
  border-color: var(--c-gold);
  background: var(--c-gold-bg);
}

.th-short {
  border: 1px dashed var(--c-danger);
  background: var(--c-danger-bg);
}

.th-verdict {
  font-size: var(--fs-xs);
  font-weight: 700;
  white-space: nowrap;
}

.th-met .th-verdict {
  color: var(--c-gold);
}

.th-short .th-verdict {
  color: var(--c-danger-soft);
}

/* ---------- editor adjusters ---------- */

.adj {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* 24px is the smallest target WCAG 2.5.8 accepts; touch gets 28px below. */
.adj-btn {
  box-sizing: border-box;
  min-width: 24px;
  height: 24px;
  padding: 0 4px;
  border-radius: var(--r-sm);
  border: 1px solid var(--c-line-strong);
  background: var(--c-raised);
  color: var(--c-text);
  font: inherit;
  font-size: var(--fs-sm);
  line-height: 1;
  cursor: pointer;
}

.adj-btn:hover {
  border-color: var(--side-accent);
}

.adj-btn:focus-visible {
  outline: 2px solid var(--c-focus);
  outline-offset: 1px;
}

.adj-wide {
  font-size: var(--fs-xs);
}

.stats-panel .th-chip .adj {
  margin-top: 4px;
  justify-content: center;
}

/* Editor panel (#stats): steppers sit beside the value players see, so the
   panel stays short enough for the right column under Solutions. The badge
   and chip already show the number, so the stepper's own copy is hidden. */
.stats-panel.editing .adj-val {
  display: none;
}

.stats-panel.editing .life-badge-col {
  display: grid;
  grid-template-columns: auto auto auto;
  grid-template-areas:
    'minus badge plus'
    '.     cap   .';
  align-items: center;
  column-gap: 4px;
}

.stats-panel.editing .life-badge-col .adj {
  display: contents;
}

.stats-panel.editing .life-badge-col .adj-btn:first-child {
  grid-area: minus;
}

.stats-panel.editing .life-badge-col .adj-btn:last-child {
  grid-area: plus;
}

.stats-panel.editing .life-badge {
  grid-area: badge;
}

.stats-panel.editing .life-caption {
  grid-area: cap;
  text-align: center;
}

.stats-panel.editing .stat-mana {
  gap: 4px;
}

.stats-panel.editing .th-chip {
  padding: 4px 0;
}

.stats-panel.editing .th-chip .adj {
  margin-top: 2px;
  flex-wrap: nowrap;
}

/* ---------- strip (opponent) ---------- */

/* The strip is already the panel: no card of its own. */
.stats-strip {
  display: flex;
  align-items: center;
  gap: var(--sp-5);
  flex-wrap: nowrap;
  white-space: nowrap;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 0;
}

.stats-strip .stats-main {
  gap: var(--sp-5);
}

.stats-strip .stat-life {
  gap: 10px;
}

.stats-strip .life-badge {
  width: 44px;
  height: 44px;
  border-radius: 8px 8px 20px 20px;
  font-size: 22px;
}

.stats-strip .life-words .stat-name {
  font-size: 14px;
}

.stats-strip .stat-mana {
  gap: 1px;
}

.stats-strip .stat-mana .stat-name {
  font-size: 14px;
}

.stats-strip .thresholds {
  display: flex;
  gap: var(--sp-3);
}

.stats-strip .th-chip {
  flex-direction: row;
  gap: 4px;
  padding: 2px 4px;
  border-color: transparent;
}

.stats-strip .th-met {
  border-color: var(--c-gold);
}

.stats-strip .th-short {
  border-color: var(--c-danger);
}

.stats-strip .th-count {
  font-size: var(--fs-md);
}

/* The strip has one row and no room for steppers in it, and its container
   clips anything taller than the strip. So each stat's stepper ("− N +")
   lies over the stat itself while it is hovered, or while one of its
   buttons has keyboard focus. Opacity rather than display/visibility, so
   Tab still reaches them. */
.adj-val {
  display: none;
}

.stats-strip .adj-val {
  display: inline-block;
  min-width: 2ch;
  text-align: center;
  font-weight: 700;
  color: var(--side-ink);
  font-variant-numeric: lining-nums tabular-nums;
}

.stats-strip .adj {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 30;
  flex-wrap: nowrap;
  align-items: center;
  padding: 3px;
  background: var(--c-panel);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-pop);
  transform: translate(-50%, -50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.stats-strip .stat:hover .adj,
.stats-strip .stat:focus-within .adj {
  opacity: 1;
  pointer-events: auto;
}

/* A dotted underline marks the stats that can be changed. */
.stats-strip.editing .stat-life .life-badge,
.stats-strip.editing .stat-mana .stat-name,
.stats-strip.editing .th-count {
  text-decoration: underline dotted var(--c-muted-2);
  text-underline-offset: 3px;
}

.stats-strip.editing .stat:hover,
.stats-strip.editing .stat:focus-within {
  z-index: 30;
}

@media (pointer: coarse) {
  .adj-btn {
    min-width: 28px;
    height: 28px;
    font-size: var(--fs-md);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pip,
  .stats-strip .adj {
    transition: none;
  }
}
</style>
