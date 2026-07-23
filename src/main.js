import { createApp } from 'vue'
import App from './App.vue'
import { config, state, initFromUrl, loadDaily } from './store.js'
import './style.css'

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
    ...options,
  }
  config.canEdit = !!opts.editor
  config.apiUrl = opts.api || ''
  config.nonce = opts.nonce || ''
  if (!config.canEdit) state.mode = 'play'
  const app = createApp(App)
  app.mount(el)
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
