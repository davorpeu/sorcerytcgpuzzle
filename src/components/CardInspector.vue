<script setup>
import { computed } from 'vue'
import {
  state,
  ui,
  zoneOf,
  zoneRegion,
  isTapped,
  damageOf,
  effectiveStrengthMod,
  grantedKeywordsOf,
  countersOf,
  SHIELD_COUNTER,
  isSilenced,
  isDisabled,
  cantAttack,
  cantMove,
  cantDefend,
  cantBeTargeted,
  carriedBy,
  tapBlockedBySickness,
  squareCue,
  playerControls,
  GRID_SIZE,
  cellLayer,
  survivalRisks,
} from '../store.js'
import CardThumb from './CardThumb.vue'
import { survivalWarning } from '../format.js'

// The selected card, large. Everything printed on it -- name, type, cost,
// threshold, power, rules text -- is already in the art, so the list under it
// carries only what play has changed. An untouched card shows art alone.
const id = computed(() => ui.selected)
const card = computed(() => (id.value ? state.cards[id.value] : null))

// Game state only: whose card it is and where it sits -- never the printed type line.
const kicker = computed(() => {
  const cid = id.value
  if (!cid) return ''
  const mine = playerControls(cid)
  const who = mine ? 'Your' : "Opponent's"
  const zone = zoneOf(cid) || ''
  if (zone.startsWith('hand:')) return mine ? 'In your hand' : "In the opponent's hand"
  if (zone.startsWith('grave:')) return mine ? 'In your cemetery' : "In the opponent's cemetery"
  if (zone.startsWith('collection:')) return mine ? 'In your collection' : "In the opponent's collection"
  if (zone.startsWith('banished:')) return mine ? 'Banished, yours' : "Banished, the opponent's"
  if (zone.startsWith('atlas:')) return mine ? 'In your Atlas' : "In the opponent's Atlas"
  if (zone.startsWith('spellbook:')) return mine ? 'In your Spellbook' : "In the opponent's Spellbook"
  if (zone === 'storyline') return 'On the storyline'
  if (zone === 'pool') return 'In the pool'
  if (zone.startsWith('aura:')) return `${who} aura`
  if (zone.startsWith('site:')) return `${who} site`
  // The Buried/Submerged chip says how; the kicker just says where.
  if (cellLayer(zone) === 'bot') return `${who} card, below the surface`
  if (cellLayer(zone)) return `${who} card on the realm`
  return `${who} card`
})

const changes = computed(() => {
  const cid = id.value
  if (!cid) return []
  const out = []
  const zone = zoneOf(cid) || ''
  if (cellLayer(zone) === 'bot')
    out.push({ text: zoneRegion(zone) === 'underwater' ? 'Submerged' : 'Buried' })
  // Set up where it can't survive: allowed, but it won't last past the first move.
  if (state.mode === 'editor') {
    const risk = survivalRisks().find((r) => r.id === cid)
    if (risk) out.push({ text: survivalWarning(risk.region), tone: 'bad' })
  }
  if (isTapped(cid)) out.push({ text: 'Tapped' })
  if (tapBlockedBySickness(cid)) out.push({ text: "Summoned this turn — can't tap yet" })
  const dmg = damageOf(cid)
  if (dmg) out.push({ text: `${dmg} damage`, tone: 'bad' })
  const str = effectiveStrengthMod(cid)
  if (str) out.push({ text: `Strength ${str > 0 ? '+' : ''}${str}`, tone: str > 0 ? 'good' : 'bad' })
  const kw = grantedKeywordsOf(cid)
  if (kw.length) out.push({ text: `Gained ${kw.join(', ')}`, tone: 'good' })
  for (const [name, n] of countersOf(cid))
    out.push({
      text: name === SHIELD_COUNTER ? `Prevents the next ${n} damage` : `${n} ${name} counter${n === 1 ? '' : 's'}`,
    })
  if (isDisabled(cid)) out.push({ text: 'Disabled', tone: 'bad' })
  else if (isSilenced(cid)) out.push({ text: 'Silenced', tone: 'bad' })
  if (cantAttack(cid)) out.push({ text: "Can't attack", tone: 'bad' })
  if (cantMove(cid)) out.push({ text: "Can't move", tone: 'bad' })
  if (cantDefend(cid)) out.push({ text: "Can't move to defend", tone: 'bad' })
  if (cantBeTargeted(cid)) out.push({ text: "Can't be targeted by opponents" })
  // What it carries, as art (names are printed on the cards).
  const held = carriedBy(cid).filter((h) => state.cards[h])
  if (held.length) out.push({ text: 'Carrying', cards: held })
  return out
})

// One line on what to do next, read off what the board is actually showing:
// the square cues only appear under enforced rules, so the hint only names
// them when some square is wearing one.
// The editor's Card tab (#card in redesign/editor-design.html): art beside the
// state rather than filling the column, since actions and setup follow it.
const editor = computed(() => state.mode === 'editor')

const hint = computed(() => {
  if (!card.value) return ''
  if (editor.value && zoneOf(id.value) === 'pool')
    return 'Drag it onto the table to place a copy; set it up below.'
  if (!playerControls(id.value))
    return editor.value
      ? "The opponent's card: the puzzle plays it. Set it up below."
      : "The opponent's card: the puzzle plays it."
  const cues = new Set()
  for (let i = 0; i < GRID_SIZE; i++) cues.add(squareCue(i))
  if (cues.has('move')) return 'Gold squares are moves; dimmed ones are out of reach.'
  if (cues.has('attack')) return 'Red squares hold something this unit can attack.'
  if (cues.has('shoot')) return 'Red squares hold something this unit can shoot.'
  if (cues.has('summon')) return 'Dashed squares are where it can be summoned.'
  if (ui.moving || ui.attacker || ui.shooting || ui.striker || ui.carrier)
    return 'Click where the action should land.'
  if (editor.value)
    return state.recording
      ? 'Pick an action below; it is added to the solution.'
      : 'Its actions are below, then its setup.'
  return 'Pick an action under the board.'
})
</script>

<template>
  <section v-if="card" class="inspector" :class="{ compact: editor }" aria-label="Selected card">
    <p class="inspector-kicker" :class="{ opp: !playerControls(id) }">{{ kicker }}</p>
    <div class="inspector-stage">
      <img
        v-if="card.img"
        :src="card.img"
        :alt="card.name"
        class="inspector-art"        draggable="false"
      />
      <p v-else class="inspector-name">{{ card.name }}</p>
    </div>
    <ul v-if="changes.length" class="inspector-changes" aria-label="What has changed">
      <li v-for="c in changes" :key="c.text" :class="c.tone">
        {{ c.text }}
        <CardThumb v-for="h in c.cards || []" :key="h" :id="h" size="sm" />
      </li>
    </ul>
    <p class="inspector-hint">{{ hint }}</p>
    <p class="inspector-keys"><kbd>Esc</kbd> puts the card down</p>
  </section>
  <section v-else class="inspector empty" aria-label="Selected card">
    <p class="inspector-empty">Select a card to see its state</p>
  </section>
</template>

<style scoped>
/* Fills the left column: kicker, big art, state chips, hint, keys at the foot. */
.inspector {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  background: var(--c-panel);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
  font-family: var(--font-ui);
  color: var(--c-text);
}

/* A selected card owns the whole visible left column (as in the mockup);
   Puzzles/moves/legend follow below it and the column scrolls to them.
   Doubled class: outranks `.mode-play .area-left > .inspector` in style.css
   (see redesign/requests/p1-inspector.md). */
.inspector.inspector:not(.empty) {
  flex: 0 0 100%;
}

.inspector-kicker {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--c-gold);
}

.inspector-kicker.opp {
  color: var(--c-opp-hi);
}

/* Upright even for the opponent's cards: this is for reading, not for
   showing who sits where -- the board already does that. */
/* The stage takes whatever height the column has left, so the art is as big
   as fits and the hint and keys below it always stay in view. */
.inspector-stage {
  flex: 1 1 0;
  min-height: 160px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.inspector-art {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 100%;
  min-width: 0;
  min-height: 0;
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-pop);
}

/* Fallback only when there's no art. */
.inspector-name {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  color: var(--c-cream);
}

.inspector-changes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
}

/* Each change is a word; tone adds line style too, never colour alone. */
.inspector-changes li {
  padding: 2px var(--sp-2);
  border-radius: var(--r-pill);
  border: 1px solid var(--c-line-strong);
  background: var(--c-raised);
  color: var(--c-cream);
  font-size: var(--fs-xs);
  font-variant-numeric: lining-nums tabular-nums;
}

.inspector-changes li.good {
  border-color: var(--c-gold);
  background: var(--c-gold-bg);
}

.inspector-changes li.bad {
  border: 1px dashed var(--c-danger);
  background: var(--c-danger-bg);
  color: var(--c-danger-soft);
}

.inspector-hint {
  margin: 0;
  font-size: var(--fs-md);
  line-height: 1.45;
  color: var(--c-cream);
}

.inspector-keys {
  margin: auto 0 0;
  padding-top: var(--sp-2);
  border-top: 1px solid var(--c-line);
  font-size: var(--fs-xs);
  color: var(--c-muted);
}

.inspector-keys kbd {
  padding: 0 var(--sp-1);
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  background: var(--c-raised);
  font-family: var(--font-ui);
  color: var(--c-cream);
}

/* Editor Card tab: art on the left at its natural shape (104 wide upright,
   146 wide for a landscape site), kicker / state / hint / keys beside it. */
.inspector.inspector.compact {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-content: start;
  column-gap: 14px;
  row-gap: 6px;
}

.compact .inspector-stage {
  grid-column: 1;
  grid-row: 1 / span 4;
  min-height: 0;
  align-items: flex-start;
}

.compact > :not(.inspector-stage) {
  grid-column: 2;
  align-self: start;
}

.compact .inspector-changes {
  align-items: flex-start;
}

.compact .inspector-art {
  max-width: 146px;
  max-height: 146px;
  border-radius: var(--r-md);
  box-shadow: var(--shadow-card);
}

.compact .inspector-hint {
  font-size: var(--fs-sm);
}

.compact .inspector-keys {
  margin: 0;
  padding-top: 0;
  border-top: 0;
}

.inspector.empty {
  flex: none;
  justify-content: center;
  min-height: 120px;
}

.inspector-empty {
  margin: 0;
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--c-muted);
}

/* Phone: the column sits under the hand there, so the empty prompt is only
   noise; a selected card still shows its state. */
@media (max-width: 700px) {
  .inspector.empty {
    display: none;
  }
}
</style>
