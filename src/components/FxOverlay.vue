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
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, top: r.top }
}

// A triggered ability's name floats up off its card and fades, so the player
// sees where it fired without a dialog. `stack` offsets simultaneous triggers
// so their labels don't sit on top of each other.
function triggerLabel(fx) {
  const at = centerOf(fx.cardId)
  if (!at || !layer.value || !fx.label) return
  const el = document.createElement('div')
  el.className = 'fx-trigger-label'
  el.textContent = `✧ ${fx.label}`
  el.style.left = `${at.x}px`
  el.style.top = `${Math.max(4, at.top - 6 - (fx.stack || 0) * 22)}px`
  layer.value.appendChild(el)
  animate(
    el,
    { y: [6, -14], opacity: [0, 1, 1, 0] },
    { duration: 1.8, ease: 'easeOut', delay: (fx.stack || 0) * 0.12 }
  )
    .finished.catch(() => {})
    .finally(() => el.remove())
}

// A radial burst at a card's current position. Used for cast (the sorcery
// resolving) and death (the unit's last stand) -- both cards are on their way
// to the cemetery, so we draw where they still are at launch, not where they
// re-render a tick later.
function burst(cardId, kind) {
  burstAt(centerOf(cardId), kind)
}

// The same bloom at a fixed point (a projectile's landing spot, captured at
// launch -- the victim may already have re-rendered into its cemetery).
function burstAt(at, kind) {
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
    { duration: kind === 'death' || kind === 'fire' ? 0.65 : 0.75, ease: 'easeOut' }
  )
    .finished.catch(() => {})
    .finally(() => el.remove())
}

// Per-style flight: how long it takes, how it accelerates, and how high it
// arcs (as a fraction of the distance). An arrow lofts slightly and noses over;
// a fireball flies flat with an ember trail; a bolt snaps straight in.
const easeIn = (t) => t * t
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const STYLES = {
  arrow: { duration: 380, ease: (t) => t, arc: 0.14, sizeK: 0.55, aspect: 0.16 },
  fireball: { duration: 520, ease: easeInOut, arc: 0, sizeK: 0.3, aspect: 1 },
  bolt: { duration: 420, ease: easeIn, arc: 0, sizeK: 0.32, aspect: 0.42 },
}

// A single ember shed behind a fireball: drifts a little, shrinks, fades.
function ember(x, y, size) {
  const el = document.createElement('div')
  el.className = 'fx-ember'
  const s = size * (0.45 + Math.random() * 0.35)
  el.style.width = `${s}px`
  el.style.height = `${s}px`
  el.style.left = `${x - s / 2}px`
  el.style.top = `${y - s / 2}px`
  layer.value.appendChild(el)
  const dx = (Math.random() - 0.5) * size
  const dy = (Math.random() - 0.5) * size - size * 0.4 // embers rise
  animate(
    el,
    { x: [0, dx], y: [0, dy], scale: [1, 0.1], opacity: [0.9, 0] },
    { duration: 0.35 + Math.random() * 0.15, ease: 'easeOut' }
  )
    .finished.catch(() => {})
    .finally(() => el.remove())
}

function fire(fx) {
  const from = centerOf(fx.sourceId)
  const to = centerOf(fx.targetId)
  if (!from || !to || !layer.value) return
  const style = STYLES[fx.style] ? fx.style : 'bolt'
  const cfg = STYLES[style]
  // Scale the missile to the cards so it reads the same on any board size.
  const size = Math.max(10, Math.min(style === 'arrow' ? 40 : 24, from.w * cfg.sizeK))

  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy) || 1
  // Arc bulges along the perpendicular that points up the screen.
  let nx = -dy / dist
  let ny = dx / dist
  if (ny > 0) {
    nx = -nx
    ny = -ny
  }
  const lift = cfg.arc * dist
  const pointAt = (t) => {
    const e = cfg.ease(t)
    const h = lift * 4 * e * (1 - e)
    return { x: from.x + dx * e + nx * h, y: from.y + dy * e + ny * h }
  }

  const el = document.createElement('div')
  el.className = `fx-missile fx-${style}`
  el.style.width = `${size}px`
  el.style.height = `${size * cfg.aspect}px`
  layer.value.appendChild(el)

  // Driven by rAF rather than Motion so the heading can follow the arc's
  // tangent each frame (a keyframed transform can't track a curve).
  let prev = pointAt(0)
  let lastEmber = 0
  const t0 = performance.now()
  const place = (p, angle, opacity) => {
    el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${angle}deg)`
    el.style.opacity = opacity
  }
  place(prev, (Math.atan2(dy, dx) * 180) / Math.PI, 0.2)

  const land = () => {
    el.remove()
    if (style === 'fireball') burstAt(to, 'fire')
    else if (style === 'arrow') burstAt({ ...to, w: to.w * 0.45 }, 'spark')
    // Land an impact flash on the victim (reuses the CardToken flash path).
    emitFx('impact', { cardId: fx.targetId })
  }

  const step = (now) => {
    if (!el.isConnected) return
    const t = Math.min(1, (now - t0) / cfg.duration)
    const p = pointAt(t)
    const angle = (Math.atan2(p.y - prev.y, p.x - prev.x) * 180) / Math.PI
    if (p.x !== prev.x || p.y !== prev.y) place(p, angle, Math.min(1, 0.2 + t * 4))
    if (style === 'fireball' && now - lastEmber > 18) {
      lastEmber = now
      ember(p.x, p.y, size)
    }
    prev = p
    if (t < 1) requestAnimationFrame(step)
    else land()
  }
  requestAnimationFrame(step)
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
      } else if (fx.kind === 'trigger') {
        launched.add(fx.id)
        triggerLabel(fx)
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
  z-index: 1050; /* above the board */
  pointer-events: none;
  overflow: hidden;
}
.fx-missile {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform, opacity;
}
/* Generic targeted spell: an arcane streak. */
.fx-bolt {
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 220, 120, 0), #ffec9e 55%, #fff);
  box-shadow: 0 0 10px 3px rgba(255, 200, 90, 0.9),
    0 0 20px 6px rgba(255, 140, 60, 0.5);
}
/* Ranged Shoot: a thin shaft with fletching behind and a steel head in front. */
.fx-arrow {
  min-height: 3px;
  border-radius: 2px;
  background: linear-gradient(
    90deg,
    #e9e2d0 0%,
    #e9e2d0 14%,
    #8a5a2b 16%,
    #a7743e 88%,
    transparent 88%
  );
  filter: drop-shadow(0 0 3px rgba(255, 255, 255, 0.55));
}
.fx-arrow::after {
  content: '';
  position: absolute;
  right: -2px;
  top: 50%;
  width: 0;
  height: 0;
  transform: translateY(-50%);
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 9px solid #dfe6ee;
}
/* Projectile ability/spell: a burning orb (the trail is .fx-ember). */
.fx-fireball {
  border-radius: 50%;
  background: radial-gradient(circle at 60% 50%, #fff 0%, #ffe38a 25%, #ff9a2e 55%, #d8360e 85%);
  box-shadow: 0 0 12px 4px rgba(255, 150, 40, 0.9),
    0 0 26px 10px rgba(255, 80, 20, 0.45);
}
.fx-ember {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(circle, #ffd27a 0%, rgba(255, 110, 30, 0.8) 55%, rgba(255, 60, 20, 0) 100%);
  will-change: transform, opacity;
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
/* Fireball landing: an orange flare. */
.fx-burst-fire {
  background: radial-gradient(
    circle,
    rgba(255, 240, 180, 0.95) 0%,
    rgba(255, 140, 40, 0.7) 40%,
    rgba(220, 60, 20, 0) 72%
  );
}
/* Arrow landing: a small white glint. */
.fx-burst-spark {
  background: radial-gradient(
    circle,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(220, 230, 240, 0.5) 40%,
    rgba(220, 230, 240, 0) 70%
  );
}
/* Ability name floating off a card as it triggers. Centred and lifted above
   the card with the standalone `translate` property, because Motion owns
   `transform` for the float-up. */
.fx-trigger-label {
  position: absolute;
  translate: -50% -100%;
  max-width: 220px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(40, 20, 60, 0.9);
  border: 1px solid rgba(200, 120, 255, 0.7);
  color: #f0e2ff;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  will-change: transform, opacity;
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
