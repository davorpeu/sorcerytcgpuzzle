# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # or yarn — packageManager is yarn@1.22.22
npm run dev       # Vite dev server (standalone mode: localStorage, editor enabled)
npm run build     # production IIFE bundle -> dist/sorcery-puzzle.js
npm run build:wp  # build + copy bundle into the plugin + produce sorcery-puzzle.zip at repo root
npm run preview   # serve the production build
```

There is no test runner, linter, or type checker configured — `package.json` scripts are only the four Vite commands above. Don't invent a `npm test`/`npm run lint`.

## Big picture

A Vue 3 (SFC, `<script setup>`) single-page app for building and solving puzzles for the *Sorcery: Contested Realm* TCG. It runs two ways from **one bundle**:

- **Standalone** (`npm run dev`, or any page without `data-api`): persistence is `localStorage`, editor enabled.
- **Embedded in WordPress**: the plugin's shortcode mounts the same bundle, passing `data-api`/`data-nonce`/`data-editor` attributes that flip persistence to a REST API and gate the editor by user role.

The same code path serves both; the only switch is `config.apiUrl` being set (see `remote()` in `store.js`).

### `src/store.js` is the whole application state and logic

Nearly everything lives here — a single `reactive()` `state` object plus exported mutator functions. Components are thin views over it. Before touching game behavior, read `store.js`; the components mostly render `state` and call its functions. Three reactive objects:

- **`config`** — host-page wiring, NOT puzzle data: `canEdit`, `apiUrl`, `nonce`. Set once at mount from the mount element's `data-*` attributes.
- **`ui`** — transient interaction state, NOT puzzle data: which card is `selected`, `dragging`, and the mutually-exclusive "armed action" slots `attacker`/`striker`/`carrier`/`moving`. Only one action is ever armed at a time (arming one clears the others).
- **`state`** — the puzzle and play session: `mode` (`'editor'|'play'`), `cards`, `zones`, `carry`, `stats`, `solutions`, plus play-attempt tracking (`moves`, `checked`, `firstWrong`, `tries`, `solved`).

### Core model concepts

- **Zones** (`zones[zoneId] = [cardId, ...]`): a 5×4 grid where each square `N` (0–19, row-major) has `site:N` (max 1 card), `cell:N:top` (surface), `cell:N:bot` (below). Grid-line intersections hold auras: `aura:M`. Off-board zones: `hand:{player,opponent}`, `grave:*`, `collection:*`, `storyline` (shared), `pool` (editor staging). `emptyZones()` builds the full set; `normalizeZones()` upgrades legacy `cell:N` -> `cell:N:top`.
- **The pool is a palette in the editor**: dragging a card out of `pool` (when not recording) places a *copy*, so one upload is reusable. `moveCard()` has a special branch for this.
- **Carrying** (`state.carry[itemId] = carrierId`): a carried card is removed from all zones and exists only in `carry` — it has no position, so per-zone rules stop applying to it. `zoneOf()` resolves a carried card to wherever its carrier sits. Loop prevention in `wouldCycle()`.
- **Routing**: `routeZone()` reroutes drops so site cards always land in the site slot and non-sites never do. `dropTarget()` handles put-down placement (auras vs. squares).

### Solutions & checking

A puzzle has **multiple solution lines** (`state.solutions`, an array of move sequences). Recording snapshots the start position (`initialZones`/`initialCarry`/`initialStats`/`initialTapped`); each recorded line restarts from that same snapshot (`restoreInitial()`). An attempt passes if it fully matches **any** line; otherwise `check()` reports the divergence point against the closest line. Move-equality is `sameEntry()`: it compares `cardId`/`from`/`to` (or `targetId`/`to` for special types) but deliberately ignores `prevTapped`/`from`/`held`/`carrierId`, which are undo bookkeeping. Entry types: plain move, `attack`, `strike`, `pickup`, `drop`.

Only card moves count toward the solution. Life/mana/threshold counters (`stats`) and tap state are informational and reset with the board.

### Persistence (backend-agnostic)

`savePuzzle`/`listPuzzles`/`loadById`/`deletePuzzle`/`loadDaily` are all async and branch on `remote()`: REST API (`api()` helper, sends `X-WP-Nonce`) when embedded, `localStorage` when standalone. `serialize()`/`loadPuzzle()` define the on-disk JSON (see README "Puzzle JSON format"). `loadPuzzle` back-fills defaults so older files load unchanged — preserve that when changing the format, and bump `FORMAT_VERSION` for breaking changes.

URL loading (`initFromUrl`): `?data=` (self-contained base64), `?src=` (hosted JSON), `?puzzle=<id>`, `?daily`. Non-editors default to the daily puzzle when nothing is specified.

Wordle-style limit: non-editors get `MAX_TRIES` (3) submits per puzzle per day, tracked in `localStorage` under `ATTEMPTS_KEY` (soft — clearing storage resets it). Editors are exempt (`triesLimited()`).

### Mounting & embedding (`src/main.js`)

Exposes `SorceryPuzzle.mount(el, opts)` and auto-mounts on `#app` or `#sorcery-puzzle-root`. `fitHost()` contains hard-won DOM code that widens theme wrapper elements and sizes `--app-chrome-h` so the board gets real screen area inside arbitrary WordPress themes. The extensive comments there explain *why* each step exists — read them before modifying; a naive change reintroduces the theme-clipping bugs they solve.

The build is deliberately a single IIFE with fixed filenames (`vite.config.js`) so a host page needs only one `<script>` tag; styles inject at runtime.

### WordPress plugin

`wordpress/sorcery-puzzle/sorcery-puzzle.php` provides the `[sorcery_puzzle]` shortcode, the `/wp-json/sorcery-puzzle/v1/` REST endpoints, role gating (`edit_others_posts`, filterable via `sorcery_puzzle_can_edit`), a hidden `sorcery_puzzle` custom post type for site-wide storage, and Media Library externalization of card images (dedup by content hash, stored as `imgId` references). `scripts/build-wp.mjs` copies the bundle in and zips the plugin (uses Windows `System32\tar.exe`/bsdtar to avoid backslash zip entries that break on Linux hosts). See the README for the full endpoint table and publishing workflow.
