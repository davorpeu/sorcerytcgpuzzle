// Auto-scrolls overflowed containers while an HTML5 drag is in flight.
//
// A card that's being dragged can't trigger a container's own scrolling --
// the browser won't deliver wheel or scroll gestures mid-drag -- so a tall
// .pool or .media-results box becomes unreachable the moment its contents
// overflow. This watches the drag pointer and nudges the nearest scrollable
// ancestor under it whenever the pointer nears that box's top or bottom edge,
// so the whole box stays reachable while a card is in flight.

// How close to an edge (px) the pointer must get before auto-scroll starts,
// and the fastest we scroll (px/frame) once it's pinned to the very edge.
const EDGE = 60
const MAX_SPEED = 18

function isScrollable(el) {
  if (!(el instanceof Element)) return false
  const overflowY = getComputedStyle(el).overflowY
  return (overflowY === 'auto' || overflowY === 'scroll') &&
    el.scrollHeight > el.clientHeight
}

// Walk up from the element under the pointer to the first ancestor that can
// actually scroll vertically. Returns null when nothing on the way up scrolls.
function findScrollable(el) {
  while (el instanceof Element) {
    if (isScrollable(el)) return el
    el = el.parentElement
  }
  return null
}

export function enableDragScroll() {
  let target = null // container currently being scrolled
  let speed = 0     // px per frame; sign is the scroll direction
  let frame = null

  // A single rAF loop applies whatever speed the last dragover computed. Doing
  // the scrolling here rather than in the event keeps it smooth and framerate
  // independent, since dragover fires irregularly.
  function step() {
    if (target && speed) target.scrollTop += speed
    frame = requestAnimationFrame(step)
  }

  function onDragOver(e) {
    const container = findScrollable(
      document.elementFromPoint(e.clientX, e.clientY),
    )
    if (!container) {
      target = null
      speed = 0
      return
    }
    const rect = container.getBoundingClientRect()
    const fromTop = e.clientY - rect.top
    const fromBottom = rect.bottom - e.clientY
    target = container
    // Ramp the speed with proximity to the edge so it eases in rather than
    // jumping to full tilt the instant the pointer crosses the threshold.
    if (fromTop < EDGE) {
      speed = -MAX_SPEED * (1 - Math.max(fromTop, 0) / EDGE)
    } else if (fromBottom < EDGE) {
      speed = MAX_SPEED * (1 - Math.max(fromBottom, 0) / EDGE)
    } else {
      speed = 0
    }
  }

  function stopScrolling() {
    target = null
    speed = 0
  }

  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragend', stopScrolling)
  window.addEventListener('drop', stopScrolling)
  frame = requestAnimationFrame(step)

  return function stopDragScroll() {
    window.removeEventListener('dragover', onDragOver)
    window.removeEventListener('dragend', stopScrolling)
    window.removeEventListener('drop', stopScrolling)
    if (frame) cancelAnimationFrame(frame)
    frame = null
  }
}
