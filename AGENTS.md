# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, ...) working in this repository.
Role-specific instructions live in `.claude/agents/<role>.md`; area notes in nested AGENTS.md files
(e.g. `wordpress/AGENTS.md`).

## Commands

```bash
npm install       # npm bug: installing a new dev dependency may need --legacy-peer-deps
npm run dev       # Vite dev server (standalone mode: localStorage, editor enabled)
npm run build     # production IIFE bundle -> dist/sorcery-puzzle.js
npm run build:wp  # build + copy bundle into the plugin + produce sorcery-puzzle.zip at repo root
npm run preview   # serve the production build
npm test          # Vitest: solve logic + puzzle file format (tests/store.test.js)
npm run lint      # ESLint: bugs only (recommended + vue/essential), no style rules
npm version patch # release: lint + tests, bump package.json, sync the plugin header, commit "Version X.Y.Z", tag vX.Y.Z
git push --follow-tags  # pushing the release is a separate step
```

The version lives only in `package.json`; `scripts/sync-version.mjs` (the npm `version` hook) copies it into the WordPress plugin header. Don't edit the header's version by hand. Use `minor` for new features, `major` when old puzzle files stop loading (a `FORMAT_VERSION` bump), `patch` for fixes. `npm version` needs a clean working tree.

Tests live in `tests/` and reach store internals through the `__test` export at the end of `src/store.js` (tests only). `tests/fixtures/` holds real puzzle files, including an old version-1 file — keep them loading. `it.fails` marks a known bug; turn it into `it` when the bug is fixed. There is no formatter (the code mixes two styles; don't reformat files you aren't changing) and no type checker. CI runs lint, tests and the build; all three must pass.

## Big picture

A Vue 3 (SFC, `<script setup>`) single-page app for building and solving puzzles for the *Sorcery: Contested Realm* TCG. It runs two ways from **one bundle**:

- **Standalone** (`npm run dev`, or any page without `data-api`): persistence is `localStorage`, editor enabled.
- **Embedded in WordPress**: the plugin's shortcode mounts the same bundle, passing `data-api`/`data-nonce`/`data-editor` attributes that flip persistence to a REST API and gate the editor by user role.

The same code path serves both; the only switch is `config.apiUrl` being set (see `remote()` in `src/store/state.js`).

### The store (`src/store.js` + `src/store/`) is the whole application state and logic

Nearly everything lives here — a single `reactive()` `state` object plus exported mutator functions. Components are thin views over it. `src/store.js` is the only entry point: components and tests import from it, never from `src/store/*` directly. It re-exports the public API of the modules:

| Module | Holds |
|---|---|
| `state.js` | constants, `config`/`ui`/`state`, shared helpers; imports no other store module, so it always loads first |
| `board.js` | zone labels/categories, regions, passive traits, oversized minions, reach, line of fire, combat |
| `counters.js` | counters, damage prevention, ability modes, presets |
| `moves.js` | moving cards, attacks, strikes, carrying |
| `abilities.js` | triggers, the storyline stack, activated abilities, destination picks |
| `effects.js` | effect ops, tokens, card-flow effects, casting |
| `mana.js` | affinity and mana, draw decks, mode choice |
| `session.js` | editor session, recording, undo, solve / mistake detection |
| `clicks.js` | what a click or drop does given what is armed (`clickCard`, `clickZone`, `castOrMove`...); components only pass in DOM facts |
| `persistence.js` | uploads, `serialize`/`loadPuzzle`, save/load, share links, URL loading |

The modules import each other in a cycle, which is fine for functions. `src/store.js` re-exports an explicit list per module, so a new public store function must also be added to that list (the build fails otherwise). Two rules keep the cycle working: code that runs when a module loads (top-level `watch()`, constants built from other values) may only use `state.js` or its own module; and a module can't assign another module's `let` variable, so export a setter instead (e.g. `clearStoryStack()`). Before touching game behavior, read the relevant module; the components mostly render `state` and call its functions. Three reactive objects:

- **`config`** — host-page wiring, NOT puzzle data: `canEdit`, `apiUrl`, `nonce`. Set once at mount from the mount element's `data-*` attributes.
- **`ui`** — transient interaction state, NOT puzzle data: which card is `selected`, `dragging`, and the mutually-exclusive "armed action" slots `attacker`/`striker`/`carrier`/`moving`. Only one action is ever armed at a time (arming one clears the others).
- **`state`** — the puzzle and play session: `mode` (`'editor'|'play'`), `cards`, `zones`, `carry`, `stats`, `solutions`, plus play-attempt tracking (`moves`, `checked`, `firstWrong`).

### Core model concepts

- **Zones** (`zones[zoneId] = [cardId, ...]`): a 5×4 grid where each square `N` (0–19, row-major) has `site:N` (max 1 card), `cell:N:top` (surface), `cell:N:bot` (below). Grid-line intersections hold auras: `aura:M`. Off-board zones: `hand:{player,opponent}`, `grave:*`, `collection:*`, `storyline` (shared), `pool` (editor staging). `emptyZones()` builds the full set; `normalizeZones()` upgrades legacy `cell:N` -> `cell:N:top`.
- **The pool is a palette in the editor**: dragging a card out of `pool` (when not recording) places a *copy*, so one upload is reusable. `moveCard()` has a special branch for this.
- **Carrying** (`state.carry[itemId] = carrierId`): a carried card is removed from all zones and exists only in `carry` — it has no position, so per-zone rules stop applying to it. `zoneOf()` resolves a carried card to wherever its carrier sits. Loop prevention in `wouldCycle()`.
- **Routing**: `routeZone()` reroutes drops so site cards always land in the site slot and non-sites never do. `dropTarget()` handles put-down placement (auras vs. squares).

### Solutions, checking & persistence

A puzzle has several solution lines, recorded from one start snapshot. **The solve is detected automatically — there is no submit button**: `solveStatus` (`session.js`) re-classifies the board after every move, and `evaluatePlay()` snaps back a move that leaves no line reachable and counts it as a mistake (non-editors fail for the day at 5). Only card moves count; `stats` and tap state are informational. Persistence (`persistence.js`) branches on `remote()`: REST API when embedded, `localStorage` when standalone. The line classification, the mistake/lock rules, the save/load functions and URL loading are detailed in `src/store/AGENTS.md`.

### Mounting & embedding (`src/main.js`)

Exposes `SorceryPuzzle.mount(el, opts)` and auto-mounts on `#app` or `#sorcery-puzzle-root`. `fitHost()` contains hard-won DOM code that widens theme wrapper elements and sizes `--app-chrome-h` so the board gets real screen area inside arbitrary WordPress themes. The extensive comments there explain *why* each step exists — read them before modifying; a naive change reintroduces the theme-clipping bugs they solve.

The build is deliberately a single IIFE with fixed filenames (`vite.config.js`) so a host page needs only one `<script>` tag; styles inject at runtime.

### WordPress plugin

See `wordpress/AGENTS.md` (plugin PHP, REST endpoints, and the `scripts/build-wp.mjs` zip gotcha).

## Architecture rules

- The store (`src/store.js` + `src/store/`) owns all state and game logic. Components render `state`/`ui` and call store
  functions; they don't reimplement rules. Derived UI values belong in a component `computed`,
  game rules belong in the store.
- `config` (host wiring), `ui` (transient interaction) and `state` (puzzle + session) stay separate.
  Never persist `ui` or `config` in the puzzle JSON.
- Editor forms may edit the puzzle objects they are given in place (`v-model` on
  `state` fields, and the ability sub-editors on the ability they receive): one form, one
  object. Anything that changes what a solution line means (card setup, abilities, the
  rules switches) must be locked while `state.recording` is true.
- Persistence branches on `remote()` inside the store only; components never know whether they
  talk to localStorage or WordPress.
- The puzzle JSON stays backward compatible: `loadPuzzle()` back-fills defaults; bump
  `FORMAT_VERSION` only for breaking changes.
- The build stays a single IIFE with fixed filenames and inlined styles/fonts (no extra requests).
- Don't change `fitHost()` in `src/main.js` without reading its comments and testing inside a
  theme-like page.

## Working rules

- Read the code you are changing, and the relevant store module, before editing.
- Match the surrounding code: `<script setup>`, naming, comment density. Comments explain *why*.
- Keep changes scoped to the task; no drive-by refactors or reformatting of files you weren't asked
  to touch.
- Reuse existing store functions and components before adding new ones.
- Verify with `npm run lint`, `npm test`, `npx vite build`, and by using the change in a browser (`npm run dev`).
  A change to game rules or the file format needs a test. Say what you verified and what you didn't.
- Don't commit, push or rewrite git history unless asked.

## Design rules (UI)

- **Never show information printed on the card** (name, cost, threshold, type, rules text, base
  power). Card art is the card; the UI shows only game state and changes (damage, tapped,
  buried, counters...). Names may appear in `aria-label` only. Exceptions the user approved:
  card names in the storyline/ability prompts ("Choose a target for …"), in the play-mode move
  log, the editor's Power/Defense inputs (there is no card database), and the name chip on a
  card that has no art (otherwise it would be blank).
- Use the design tokens (CSS custom properties in `:root` of `src/style.css`); no hard-coded
  colours for anything that carries meaning or repeats. Two exceptions: black shadows
  (`rgba(0, 0, 0, a)` in a box-shadow), and illustration colours that are art rather than
  palette -- the spell effects in `FxOverlay.vue` and the water tint in `Board.vue`. Keep those
  in their component. Component styles are `scoped`; global CSS only in `src/style.css`.
- In a scoped style, `:global(...)` must hold the whole selector: Vue drops anything after it
  (`:global(.a) .b` compiles to `.a`), which once hid the entire app.
- Sentence case everywhere, no all-caps labels.
- Text is at least 11px (`--fs-xs` is 12px). The only exceptions are badges drawn on the
  board's smallest pieces (aura seals, site carry badges); keep those to a number or glyph.
- State is never shown by colour alone: pair it with a word, glyph or line style.
- Visible keyboard focus on everything interactive; everything reachable by keyboard.
- Respect `prefers-reduced-motion` for every animation.
- Layout must work at 1440×900 without page scroll, and on phone/tablet widths without
  horizontal scroll.
