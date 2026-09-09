import { createApp } from 'vue'
import App from './App.vue'
import { config, state, initFromUrl, loadDaily } from './store.js'
import './style.css'

// Every theme wraps a shortcode in a centred, max-width content column --
// Salient's `.container.main-content` is one example. That is the right call
// for an article and the wrong one here: the board takes its size from the
// space it is given, so a 1100px column costs the grid real area however wide
// the window is, and no amount of CSS inside the app can win it back.
//
// The usual full-bleed trick (`width: 100vw` with negative margins) does not
// survive contact with a real theme: any ancestor with `overflow: hidden` --
// which themes set constantly to suppress horizontal scrollbars -- clips the
// breakout straight back off. So widen the wrappers instead of overflowing
// them. Walk from the mount point up to the first ancestor that already spans
// the viewport, dropping the horizontal padding, margins and max-width each
// one contributes. Nothing ends up outside its parent, so nothing can be
// clipped. Vertical padding is untouched, so the theme's spacing above and
// below the embed survives.
// Note `width: 100%` and not `auto`. Page builders float their column
// wrappers and give them an explicit `width: 100%`; `auto` on a float means
// shrink-to-fit, so removing that width collapses the column around its
// content and takes the board down with it. 100% fills the row either way,
// and overrides a genuinely narrow fixed width just as well.
const WIDEN = {
  'max-width': 'none',
  width: '100%',
  'padding-left': '0px',
  'padding-right': '0px',
  'margin-left': '0px',
  'margin-right': '0px',
}

// `--board-max-h` is the window height less the app's own chrome, which
// assumes the app owns the window. Embedded it does not: a site header sits
// above it, and a mat sized to the full viewport runs off the bottom of the
// screen -- the exact scrolling the layout exists to avoid. Hand CSS the space
// actually above the app instead. Capped, because on a long page the embed can
// be a long way down and the reader will scroll it to the top before playing.
function fitHeight(el) {
  const above = el.getBoundingClientRect().top + window.scrollY
  const capped = Math.max(0, Math.min(above, window.innerHeight * 0.45))
  // Set on :root, not on the mount point: a custom property substitutes var()
  // where it is declared, so --board-max-h at :root only sees a value that is
  // also at :root.
  document.documentElement.style.setProperty(
    '--app-chrome-h',
    Math.round(71 + capped) + 'px'
  )
}

function fitHost(el, widen) {
  const undo = []

  const revert = () => {
    while (undo.length) undo.pop()()
  }

  const widenWrappers = () => {
    // Put the wrappers back first, or the second pass sees the widths this
    // one set and stops at the innermost element every time.
    revert()
    const before = el.getBoundingClientRect().width
    const vw = document.documentElement.clientWidth
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      // Compare the CONTENT width, not the border box: a wrapper can already
      // span the viewport and still be squeezing us with 30px of padding, and
      // stopping at it would leave that padding in place.
      const cs = getComputedStyle(n)
      const inner =
        n.clientWidth -
        (parseFloat(cs.paddingLeft) || 0) -
        (parseFloat(cs.paddingRight) || 0)
      if (inner >= vw - 0.5) break
      for (const [prop, value] of Object.entries(WIDEN)) {
        // Snapshot per property rather than the whole style attribute: themes
        // keep their own live values there (Salient writes a sticky-offset
        // custom property on .container) and those must not be clobbered.
        const prev = n.style.getPropertyValue(prop)
        const priority = n.style.getPropertyPriority(prop)
        undo.push(() =>
          prev
            ? n.style.setProperty(prop, prev, priority)
            : n.style.removeProperty(prop)
        )
        // Themes are fond of !important on container widths.
        n.style.setProperty(prop, value, 'important')
      }
    }

    // Themes lay out in ways a blunt override can punish, and a half-widened
    // chain is worse than none: if the walk left the embed narrower than it
    // found it, put every wrapper back and leave the theme alone.
    if (el.getBoundingClientRect().width < before) revert()
  }

  const applyAll = () => {
    if (widen) widenWrappers()
    fitHeight(el)
  }

  applyAll()
  // Web fonts and lazy theme scripts settle after mount and move the embed
  // down the page, so take the measurement again once the page is done.
  window.addEventListener('load', applyAll)
  window.addEventListener('resize', applyAll)
}

export function mount(el, options = {}) {
  if (typeof el === 'string') el = document.querySelector(el)
  if (!el) return null
  // Allow host pages (e.g. the WordPress shortcode) to configure the app
  // through data attributes on the mount element. data-editor gates the
  // editor UI; when the attribute is absent (standalone dev page) editing
  // stays enabled.
  const opts = {
    src: el.dataset.src,
    puzzle: el.dataset.puzzle,
    daily: el.dataset.daily === '1' || el.dataset.daily === 'true',
    editor:
      el.dataset.editor === undefined
        ? true
        : el.dataset.editor === '1' || el.dataset.editor === 'true',
    api: el.dataset.api,
    nonce: el.dataset.nonce,
    // On by default: the embed is a workspace, not a paragraph. Opt out with
    // the shortcode's fullwidth="0" when it should sit in the content column.
    fullwidth:
      el.dataset.fullwidth !== '0' && el.dataset.fullwidth !== 'false',
    ...options,
  }
  config.canEdit = !!opts.editor
  config.apiUrl = opts.api || ''
  config.nonce = opts.nonce || ''
  if (!config.canEdit) state.mode = 'play'
  const app = createApp(App)
  app.mount(el)
  fitHost(el, opts.fullwidth)
  // Players land on the current puzzle when the URL/shortcode didn't pick
  // one; editors keep the blank editor.
  initFromUrl(opts).then((loaded) => {
    if (!loaded && !config.canEdit) loadDaily()
  })
  return app
}

window.SorceryPuzzle = { mount }

const auto = document.querySelector('#app, #sorcery-puzzle-root')
if (auto) mount(auto)
