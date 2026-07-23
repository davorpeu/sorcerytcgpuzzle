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
      <button class="btn small" @click="shiftMonth(-1)">‹</button>
      <span class="cal-label">{{ monthLabel }}</span>
      <button class="btn small" @click="shiftMonth(1)">›</button>
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
          @click="emit('select', c.puzzle.id)"
        >
          {{ c.day }}
        </button>
        <span v-else class="cal-cell" :class="c.classes">{{ c.day }}</span>
      </template>
    </div>
    <p class="hint">Click a marked date to play that puzzle.</p>
  </div>
</template>

<style scoped>
.cal-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.cal-label {
  font-size: 13px;
  font-weight: 600;
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.cal-weekday {
  font-size: 10px;
  text-align: center;
  color: var(--muted);
  padding: 2px 0;
}

.cal-cell {
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  border-radius: 5px;
  border: 1px solid transparent;
  background: none;
  color: var(--muted);
  padding: 0;
}

.cal-cell.today {
  border-color: var(--border);
}

.cal-cell.has-puzzle {
  cursor: pointer;
  color: var(--text);
  background: var(--panel-2);
  border-color: var(--border);
  font-weight: 600;
}

.cal-cell.has-puzzle:hover {
  border-color: var(--accent);
}

.cal-cell.current {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* Future-dated puzzles only reach the list for editors; shown dimmed so
   they can preview the schedule. */
.cal-cell.upcoming {
  opacity: 0.45;
}
</style>
