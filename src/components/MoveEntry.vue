<script setup>
// One move-log entry drawn as art thumbnails and a verb. The card's name is
// printed on its art, so it is never shown as text here: it only goes in the
// thumbnail's aria-label for screen readers. (A card with no art still shows
// its name, as the board does: then the name is the only way to tell it.)
import { computed } from 'vue'
import { state, zoneLabel } from '../store.js'
import CardThumb from './CardThumb.vue'

const props = defineProps({
  entry: { type: Object, required: true },
  index: { type: Number, required: true },
  // Show the step number before the entry (the lists draw their own).
  numbered: { type: Boolean, default: true },
})

// The ability an entry used: on the card itself, else on any card -- a gained
// ability (an assumed form) lives on the granted card, which may since have
// been released. Null if it's gone (the card may have been edited).
function abilityOf(m) {
  const find = (c) => c?.abilities?.find((x) => x.id === m.abilityId)
  return find(state.cards[m.cardId]) || Object.values(state.cards).map(find).find(Boolean) || null
}

// A modal ability's chosen modes, by name ("Bolt + Growth"), or ''.
function modeNames(m) {
  if (!m.modes?.length) return ''
  const a = abilityOf(m)
  return m.modes.map((i) => a?.modes?.[i]?.name || `mode ${i + 1}`).join(' + ')
}

const card = (id) => ({ kind: 'card', id })
const verb = (text) => ({ kind: 'verb', text })
const text = (t) => ({ kind: 'text', text: t })

// Every target of an entry (a multi-target ability logs several).
const targets = (m) => (m.targetIds?.length ? m.targetIds : [m.targetId]).map(card)

// A card's verb between two thumbnails: "<card> attacks <card>".
const PAIR_VERBS = {
  attack: 'attacks',
  strike: 'strikes',
  shoot: 'shoots',
  intercept: 'intercepts',
  pickup: 'picks up',
}

function partsOf(m) {
  if (PAIR_VERBS[m.type]) {
    const p = [card(m.cardId), verb(PAIR_VERBS[m.type]), card(m.targetId)]
    if (m.type === 'attack' && m.defenderId) p.push(verb('defended by'), card(m.defenderId))
    return p
  }
  switch (m.type) {
    case 'drop':
      return [card(m.carrierId), verb('drops'), card(m.cardId), text(`at ${zoneLabel(m.to)}`)]
    case 'ability': {
      const p = [card(m.cardId), verb('activates'), text(abilityOf(m)?.name || 'an ability')]
      if (m.modes?.length) p.push(text(`(${modeNames(m)})`))
      if (m.targetId || m.targetIds?.length) p.push(verb('at'), ...targets(m))
      return p
    }
    case 'cast': {
      const p = [verb('casts'), card(m.cardId)]
      if (m.modes?.length) p.push(text(`(${modeNames(m)})`))
      if (m.targetId || m.targetIds?.length) p.push(verb('at'), ...targets(m))
      return p
    }
    case 'damage':
      return [
        card(m.cardId),
        verb(m.amount >= 0 ? 'takes' : 'heals'),
        text(`${Math.abs(m.amount)} damage`),
      ]
    case 'charge':
      return [card(m.cardId), verb('taps for mana'), text('(Charge)')]
    default:
      return [card(m.cardId), text(zoneLabel(m.from)), verb('to'), text(zoneLabel(m.to))]
  }
}

const parts = computed(() => partsOf(props.entry))

// Triggered events set off by this entry, matched on the seq stamped when it
// was logged. Empty for a saved solution line (events aren't stored).
const events = computed(() =>
  props.entry.seq == null ? [] : state.events.filter((e) => e.seq === props.entry.seq)
)


</script>

<template>
  <li class="move-entry">
    <span v-if="numbered" class="num" aria-hidden="true">{{ index + 1 }}</span>
    <span class="body">
      <span class="line">
        <template v-for="(p, i) in parts" :key="i">
          <CardThumb v-if="p.kind === 'card'" :id="p.id" />
          <span v-else-if="p.kind === 'verb'" class="v">{{ p.text }}</span>
          <span v-else class="t">{{ p.text }}</span>
        </template>
      </span>
      <ul v-if="events.length" class="events">
        <li v-for="ev in events" :key="ev.id" :class="{ ignored: ev.status === 'ignored' }">
          <CardThumb :id="ev.cardId" size="sm" />
          <span class="v">triggers</span>
          <span class="t ev-name">{{ ev.name }}</span>
          <em v-if="ev.status === 'ignored'">ignored, {{ ev.reason || 'source left the realm' }}</em>
        </li>
      </ul>
    </span>
  </li>
</template>

<style scoped>
.move-entry {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: var(--fs-sm);
  color: var(--c-muted-hi);
}
.num {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  margin-top: 4px;
  border-radius: var(--r-pill);
  border: 1px solid var(--c-line-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--c-muted);
}
.body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.line,
.events li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}
.v {
  color: var(--c-cream-hi);
  font-weight: 700;
}
.events {
  list-style: none;
  margin: 0;
  padding: 0 0 0 8px;
  border-left: 1px solid var(--c-line-strong);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.events li {
  font-size: var(--fs-xs);
}
/* An ignored trigger: struck through AND says "ignored", never style alone. */
.events li.ignored .ev-name {
  text-decoration: line-through;
  color: var(--c-muted-2);
}
.events li.ignored em {
  font-style: normal;
  color: var(--c-muted-2);
}
</style>
