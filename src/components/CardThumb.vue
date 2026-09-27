<script setup>
// A card as a tiny piece of its art, for lists and messages. The name is printed
// on the art, so it is never shown as text: it only goes in the aria-label.
// (A card with no art still shows its name, as the board does: then the name is
// the only way to tell it.)
import { computed } from 'vue'
import { state, cardName } from '../store.js'

const props = defineProps({
  id: { type: String, required: true },
  // 'md' in move lists, 'sm' for secondary lines (triggered events).
  size: { type: String, default: 'md' },
})

const card = computed(() => state.cards[props.id])
const label = computed(() => {
  if (!card.value) return 'A card no longer in the puzzle'
  return card.value.enemy ? `${cardName(props.id)}, opponent's` : cardName(props.id)
})
const artStyle = computed(() =>
  card.value?.img ? { backgroundImage: `url(${JSON.stringify(card.value.img)})` } : null
)
</script>

<template>
  <span
    class="mini"
    :class="[
      size,
      {
        opp: card?.enemy,
        'no-art': card && !card.img,
        gone: !card,
      },
    ]"
    :style="artStyle"
    role="img"
    :aria-label="label"
    ><span v-if="card && !card.img" aria-hidden="true">{{ cardName(id) }}</span></span
  >
</template>

<style scoped>
.mini {
  display: inline-block;
  vertical-align: middle;
  width: 18px;
  height: 25px;
  flex-shrink: 0;
  border-radius: 2px;
  background-color: var(--c-raised-2);
  background-size: cover;
  background-position: center;
  border: 1px solid var(--c-gold);
}
.mini.sm {
  width: 14px;
  height: 19px;
}
/* Opponent's cards: slate edge and upside down, as they sit on the table. */
.mini.opp {
  border-color: var(--c-opp);
  transform: rotate(180deg);
}
/* No art: a cream face with the name, as on the board. */
.mini.no-art {
  width: auto;
  max-width: 9em;
  height: auto;
  min-height: 25px;
  padding: 1px 4px;
  background: var(--c-cream-lo);
  color: var(--c-ink);
  font-size: var(--fs-xs);
  line-height: 1.15;
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mini.no-art.opp {
  transform: none;
  border-style: dashed;
}
.mini.gone {
  background: transparent;
  border: 1px dashed var(--c-line-strong);
  transform: none;
}
</style>
