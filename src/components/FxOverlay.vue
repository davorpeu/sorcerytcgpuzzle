<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { animate } from 'motion'
import { ui, emitFx } from '../store.js'

// A fixed, click-through layer over the whole app that flies a projectile from
// one card to another when a ranged/targeted action fires. It reads the live
// DOM position of each card (tagged with data-card-id in CardToken) at launch
// time, so it stays correct wherever the cards happen to sit. The animation
// library is confined to this file: swapping it for anime.js/WAAPI touches
// nothing else.
const layer = ref(null)

// Which fx entries we've already launched (they self-expire from ui.fx, but we
// fire the projectile once, on appearance).
const launched = new Set()

function centerOf(cardId) {
  const el = document.querySelector(`[data-card-id="${cardId}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }
}

// A radial burst at a card's current position. Used for cast (the sorcery
// resolving) and death (the unit's last stand) -- both cards are on their way
// to the cemetery, so we draw where they still are at launch, not where they
// re-render a tick later.
function burst(cardId, kind) {
  const at = centerOf(cardId)
  if (!at || !layer.value) return
  const size = Math.max(28, at.w * 0.9)
  const el = document.createElement('div')
  el.className = `fx-burst fx-burst-${kind}`
  el.style.width = `${size}px`
  el.style.height = `${size}px`
  el.style.left = `${at.x}px`
  el.style.top = `${at.y}px`
  // Centre via margins, not transform: `scale` below owns the transform.
  el.style.marginLeft = `${-size / 2}px`
  el.style.marginTop = `${-size / 2}px`
  layer.value.appendChild(el)
  animate(
    el,
    { scale: [0.3, 1.15], opacity: [0.9, 0] },
    { duration: kind === 'death' ? 0.65 : 0.75, ease: 'easeOut' }
  )
    .finished.catch(() => {})
    .finally(() => el.remove())
}

function fire(fx) {
  const from = centerOf(fx.sourceId)
  const to = centerOf(fx.targetId)
  if (!from || !to || !layer.value) return
  const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
  // Scale the bolt to the cards so it reads the same on any board size.
  const size = Math.max(10, Math.min(22, from.w * 0.32))

  const bolt = document.createElement('div')
  bolt.className = 'fx-bolt'
  bolt.style.width = `${size}px`
  bolt.style.height = `${size * 0.42}px`
  bolt.style.left = `${from.x}px`
  bolt.style.top = `${from.y}px`
  // Static transform carries the centring + heading; we animate left/top so
  // Motion never rebuilds `transform` and wipe the rotation.
  bolt.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`
  layer.value.appendChild(bolt)

  animate(
    bolt,
    {
      left: [`${from.x}px`, `${to.x}px`],
      top: [`${from.y}px`, `${to.y}px`],
      opacity: [0.2, 1, 1, 0.9],
    },
    { duration: 0.42, ease: 'easeIn' }
  )
    .finished.catch(() => {})
    .finally(() => {
      bolt.remove()
      // Land an impact flash on the victim (reuses the CardToken flash path).
      emitFx('impact', { cardId: fx.targetId })
    })
}

// New projectile fx -> launch once, reading positions now (default 'pre' flush,
// so the DOM still shows the pre-move layout). That matters for a targeted
// sorcery whose caster is about to leave for the cemetery: we still fire from
// where it stood, not from the grave it's re-rendered into a tick later.
watch(
  () => ui.fx.length,
  () => {
    for (const fx of ui.fx) {
      if (launched.has(fx.id)) continue
      if (fx.kind === 'projectile') {
        launched.add(fx.id)
        fire(fx)
      } else if (fx.kind === 'cast' || fx.kind === 'death') {
        launched.add(fx.id)
        burst(fx.cardId, fx.kind)
      }
    }
  }
)

// launched grows unbounded otherwise; prune ids no longer in the queue.
let pruneTimer = null
onMounted(() => {
  pruneTimer = setInterval(() => {
    if (!launched.size) return
    const live = new Set(ui.fx.map((f) => f.id))
    for (const id of launched) if (!live.has(id)) launched.delete(id)
  }, 4000)
})
onUnmounted(() => clearInterval(pruneTimer))
</script>

<template>
  <div ref="layer" class="fx-overlay" aria-hidden="true"></div>
</template>

<style>
/* Global (not scoped): the bolt elements are created imperatively and appended
   to the layer, so a scoped attribute would never reach them. */
.fx-overlay {
  position: fixed;
  inset: 0;
  z-index: 1050; /* above the board, below EventPopup (1100) */
  pointer-events: none;
  overflow: hidden;
}
.fx-bolt {
  position: absolute;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 220, 120, 0), #ffec9e 55%, #fff);
  box-shadow: 0 0 10px 3px rgba(255, 200, 90, 0.9),
    0 0 20px 6px rgba(255, 140, 60, 0.5);
  will-change: transform;
}
.fx-burst {
  position: absolute;
  border-radius: 50%;
  transform-origin: center;
  will-change: transform, opacity;
}
/* Arcane purple bloom as a spell resolves. */
.fx-burst-cast {
  background: radial-gradient(
    circle,
    rgba(200, 160, 255, 0.95) 0%,
    rgba(150, 110, 255, 0.55) 45%,
    rgba(150, 110, 255, 0) 72%
  );
}
/* Red burst where a unit falls. */
.fx-burst-death {
  background: radial-gradient(
    circle,
    rgba(255, 180, 150, 0.95) 0%,
    rgba(220, 60, 40, 0.6) 45%,
    rgba(220, 60, 40, 0) 72%
  );
}
</style>
