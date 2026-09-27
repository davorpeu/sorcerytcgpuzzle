<script setup>
import { ref, computed, onMounted } from 'vue'
import { listArchive, localToday } from '../store.js'

const emit = defineEmits(['select'])

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const today = localToday()
const view = ref({
  year: Number(today.slice(0, 4)),
  month: Number(today.slice(5, 7)), // 1-12
})

// One puzzle per date is the convention; if two share a date the later
// save wins here, matching loadDaily's tie-break only approximately.
const byDate = ref({})
const currentDate = ref(null)

onMounted(async () => {
  const list = await listArchive()
  const map = {}
  for (const p of list) map[p.date] = p
  byDate.value = map
  const releasedDates = list.map((p) => p.date).filter((d) => d <= today)
  currentDate.value = releasedDates.length
    ? releasedDates[releasedDates.length - 1]
    : null
})

const monthLabel = computed(() =>
  new Date(view.value.year, view.value.month - 1, 1).toLocaleDateString(
    undefined,
    { month: 'long', year: 'numeric' }
  )
)

const cells = computed(() => {
  const { year, month } = view.value
  const first = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  // Monday-first offset: JS getDay() is 0=Sunday.
  const lead = (first.getDay() + 6) % 7
  const out = []
  for (let i = 0; i < lead; i++) out.push({ key: `b${i}`, blank: true })
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(
      day
    ).padStart(2, '0')}`
    const puzzle = byDate.value[dateStr] || null
    out.push({
      key: dateStr,
      blank: false,
      day,
      puzzle,
      classes: {
        today: dateStr === today,
        released: puzzle && dateStr <= today,
        upcoming: puzzle && dateStr > today,
        current: dateStr === currentDate.value,
      },
    })
  }
  return out
})

// Each marked date says what it is in words too, not only by its look.
function cellLabel(c) {
  const bits = [`${c.day} ${monthLabel.value}`]
  if (c.classes.today) bits.push('today')
  if (c.classes.current) bits.push("today's puzzle")
  else if (c.classes.upcoming) bits.push('upcoming')
  return `${bits.join(', ')} — ${c.puzzle.name}`
}

// Nothing has been released yet, so the grid of bare numbers needs saying
// out loud -- an empty calendar otherwise reads as a broken one.
const empty = computed(() => !Object.keys(byDate.value).length)

function shiftMonth(delta) {
  let { year, month } = view.value
  month += delta
  if (month < 1) {
    month = 12
    year--
  } else if (month > 12) {
    month = 1
    year++
  }
  view.value = { year, month }
}
</script>

<template>
  <div class="panel archive-cal">
    <div class="zone-title">Puzzle archive</div>
    <div class="cal-nav">
      <button class="cal-step" aria-label="Previous month" @click="shiftMonth(-1)">
        ‹
      </button>
      <span class="cal-label" aria-live="polite">{{ monthLabel }}</span>
      <button class="cal-step" aria-label="Next month" @click="shiftMonth(1)">
        ›
      </button>
    </div>
    <div class="cal-grid">
      <span v-for="d in WEEKDAYS" :key="d" class="cal-weekday">{{ d }}</span>
      <template v-for="c in cells" :key="c.key">
        <span v-if="c.blank" class="cal-cell blank" />
        <button
          v-else-if="c.puzzle"
          class="cal-cell has-puzzle"
          :class="c.classes"
          :title="c.puzzle.name"
          :aria-label="cellLabel(c)"
          @click="emit('select', c.puzzle.id)"
        >
          {{ c.day }}
        </button>
        <span v-else class="cal-cell" :class="c.classes">{{ c.day }}</span>
      </template>
    </div>
    <ul v-if="!empty" class="cal-key" aria-hidden="true">
      <li><span class="swatch released"></span>A puzzle</li>
      <li><span class="swatch current"></span>Today's puzzle</li>
      <li v-if="Object.keys(byDate).some((d) => d > today)">
        <span class="swatch upcoming"></span>Upcoming
      </li>
    </ul>
    <p v-if="empty" class="hint">
      No puzzles have been released yet — there is nothing in the archive to
      play.
    </p>
    <p v-else class="hint">Click a marked date to play that puzzle.</p>
  </div>
</template>

<style scoped>
.cal-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sp-2);
}

.cal-label {
  font-family: var(--font-display);
  font-size: 17px;
  color: var(--c-cream-hi);
}

.cal-step {
  width: 30px;
  height: 30px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: 1px solid var(--c-line-strong);
  background: var(--c-raised);
  color: var(--c-text);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.cal-step:hover {
  border-color: var(--c-gold);
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
}

.cal-weekday {
  font-size: var(--fs-xs);
  text-align: center;
  color: var(--c-muted-2);
  padding: 2px 0;
}

.cal-cell {
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-ui);
  font-size: var(--fs-sm);
  border-radius: var(--r-sm);
  border: 1px solid transparent;
  background: none;
  color: var(--c-muted-lo);
  padding: 0;
}

/* Today: underlined as well as outlined, so it isn't a colour-only mark. */
.cal-cell.today {
  border-color: var(--c-line-strong);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.cal-cell.has-puzzle {
  cursor: pointer;
  color: var(--c-cream-hi);
  background: var(--c-raised);
  border-color: var(--c-line-strong);
  font-weight: 700;
}

.cal-cell.has-puzzle:hover {
  border-color: var(--c-gold);
}

.cal-cell.current {
  background: var(--c-gold);
  border-color: var(--c-gold);
  color: var(--c-ink);
}

/* Future-dated puzzles only reach the list for editors; a dashed gold ring
   (plus "upcoming" in the label) so they can preview the schedule. */
.cal-cell.upcoming {
  background: transparent;
  border-style: dashed;
  border-color: var(--c-gold);
  color: var(--c-muted);
}

.cal-key {
  list-style: none;
  margin: var(--sp-2) 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1) var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--c-muted);
}

.cal-key li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid var(--c-line-strong);
}

.swatch.released {
  background: var(--c-raised);
}

.swatch.current {
  background: var(--c-gold);
  border-color: var(--c-gold);
}

.swatch.upcoming {
  border: 1px dashed var(--c-gold);
}
</style>
