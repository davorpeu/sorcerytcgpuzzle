# Sorcery TCG Puzzle

A Vue 3 web app for building and playing puzzles for the Sorcery: Contested Realm TCG. Works as a standalone site or embedded in WordPress (or any page) via a single script + stylesheet.

## Features

- 5×4 grid of squares; each square holds one **site** card plus minions on the **surface** or **below** (underground/undersea).
- Per-player hands, cemeteries, collections, and mana + elemental threshold trackers (air 🜁, earth 🜃, fire 🜂, water 🜄), plus a shared storyline zone.
- Upload card images (they are downscaled and stored inside the puzzle). Mark a card as a site with the ⛰ toggle in the pool — sites dropped on a square fill its site slot (one per square) and render as the square's background.
- Drag-and-drop cards between all zones.
- Hold **Alt** while hovering a card to see it enlarged.
- **Editor mode**: set up the board, then *Record solution* — every move you make becomes the answer sequence. Record additional lines for puzzles with more than one valid solution; each recording restarts from the same start position.
- **Play mode**: the solver makes moves; *Submit solution* passes if the sequence matches any recorded solution line, and otherwise points at the first wrong step against the closest line.
- Wordle-style attempt limit: regular players get 3 submits per puzzle per day, tracked in the browser's localStorage (soft enforcement — clearing site data resets it). Editors are exempt so they can test freely.
- Puzzles are saved site-wide through the WordPress plugin's REST API when embedded (localStorage when running standalone), exportable/importable as JSON, and shareable as a self-contained link.
- Daily puzzle support.
- Role gating in WordPress: only Editors/Admins see the puzzle editor; everyone else gets a play-only app.

## Getting started

```bash
npm install
npm run dev      # local dev server
npm run build    # production bundle in dist/
```

## Creating a puzzle

1. In **Editor** mode, click *Upload cards* and pick card images.
2. Drag cards from the pool onto the board, hands, or cemeteries to set the starting position.
3. Click *Record solution* and perform the correct sequence of moves, then *Stop recording*. If the puzzle can be solved more than one way (e.g. a unit may approach from two directions), click *Record another solution* and play the alternative — the board snaps back to the start position for each line, and a player passes by matching any of them.
4. Name the puzzle and *Save* (site-wide in WordPress, this browser when standalone), *Export* (JSON file), or *Copy link*.
5. *Play* to test it yourself.

## Loading puzzles by URL

| URL | Behaviour |
| --- | --- |
| `?data=<base64>` | Self-contained puzzle in the link (what *Copy link* produces). |
| `?src=<url>` | Fetches a puzzle JSON file (an *Export* file you host somewhere). |
| `?puzzle=<id>` | Loads a saved puzzle (WordPress REST API when embedded, this browser's localStorage when standalone). |
| `?daily` | Loads the daily puzzle. |

Big puzzles (many images) make `?data=` links very long; prefer hosting the exported JSON and linking with `?src=`.

### Daily puzzles

`?daily` (or the shortcode's `daily="1"`) first looks for a saved puzzle whose *Daily date* matches today, otherwise it deterministically picks one from the saved list based on the date (same pick for everyone all day). In WordPress the pick happens server-side over the site-wide puzzle store, so every visitor sees the same daily.

## Embedding

The build is a single self-contained IIFE bundle with a fixed filename (`dist/sorcery-puzzle.js`); its styles are injected at runtime, so one script tag is all a host page needs:

```html
<div id="sorcery-puzzle-root" data-src="https://example.com/puzzles/today.json"></div>
<script src="sorcery-puzzle.js"></script>
```

Or mount manually: `SorceryPuzzle.mount('#my-div', { src: '...' })`.

### WordPress

1. `npm run build:wp` — builds the bundle, copies it into `wordpress/sorcery-puzzle/dist/`, and produces `sorcery-puzzle.zip` at the repo root.
2. Install the zip on the Plugins screen (*Plugins → Add New → Upload Plugin*; when updating, WordPress offers "Replace current with uploaded"), or copy `wordpress/sorcery-puzzle/` into `wp-content/plugins/` yourself.
3. Activate the plugin and use the shortcode in any page or post:

```
[sorcery_puzzle]                                  → editor for Editors/Admins, play-only for others
[sorcery_puzzle daily="1"]                        → today's daily puzzle
[sorcery_puzzle puzzle="123"]                     → a specific stored puzzle (id from the saved list)
[sorcery_puzzle src="https://.../puzzle.json"]    → loads a hosted puzzle JSON file
```

#### Who sees what

The shortcode checks the logged-in user's role and renders accordingly:

- **Editors and Administrators** (anyone with the `edit_others_posts` capability) get the full app: the Editor/Play mode buttons, the card pool, save/export/import, and the saved-puzzles list.
- **Everyone else** (Authors, Contributors, Subscribers, logged-out visitors) gets a play-only app locked to the puzzle the shortcode specifies — the mode buttons aren't rendered at all, and the editor can't be reached through share links or any other path.

To use a different capability, filter it:

```php
add_filter('sorcery_puzzle_can_edit', fn() => current_user_can('manage_options')); // admins only
```

#### Site-wide puzzle storage

When embedded via the shortcode, *Save*, the saved-puzzles list, *Delete*, and the daily pick all go through the plugin's REST API instead of the browser's localStorage, so puzzles an editor saves are visible to every visitor. Puzzles are stored as a hidden `sorcery_puzzle` custom post type — the puzzle JSON (including card images) in the post content, the name in the post title, the daily date in post meta. Nothing appears in the wp-admin menus; everything is managed from the app's editor UI, and the data is covered by your normal database backups.

Endpoints under `/wp-json/sorcery-puzzle/v1/`:

| Endpoint | Who | What |
| --- | --- | --- |
| `GET /puzzles` | anyone | list of saved puzzles (id, name, date) |
| `GET /puzzles/<id>` | anyone | full puzzle JSON |
| `GET /daily` | anyone | today's puzzle |
| `POST /puzzles` | Editors/Admins | save — updates when the body's `id` matches an existing puzzle, otherwise creates |
| `DELETE /puzzles/<id>` | Editors/Admins | delete |

Writes are protected two ways: WordPress checks the `edit_others_posts` capability, and the request must carry a REST nonce. The shortcode passes the API base to the app via `data-api`, plus a `data-nonce` for editors only — a *Save* in the editor authenticates as the logged-in WordPress session. Visitors never receive a nonce, and the server rejects their writes regardless.

The daily pick happens server-side: a puzzle whose *Daily date* matches today (site timezone) wins; otherwise a deterministic date-based pick from all stored puzzles, so every visitor gets the same puzzle all day.

When the app runs standalone (`npm run dev`, or any page without `data-api`), all of this falls back to localStorage — the local dev workflow is unchanged.

#### Publishing workflow

1. Put `[sorcery_puzzle daily="1"]` on the public puzzle page — visitors see a play-only app with no editor buttons.
2. Put `[sorcery_puzzle]` on a private page for yourself — build a puzzle, set its *Daily date*, hit **Save**. It's immediately in the site-wide store and will be that day's daily.
3. `[sorcery_puzzle puzzle="123"]` embeds one specific stored puzzle (the id shows in the saved list's tooltip and in `GET /puzzles`).

#### Gotchas

- **Migrating old browser-saved puzzles**: puzzles saved to localStorage (e.g. during local dev) don't move over automatically. *Export* each one to JSON, then *Import* + *Save* on the WordPress page — that writes it to the server.
- **Payload size**: puzzles embed card images as data URLs, so a card-heavy puzzle can be a few MB. If saving fails with a 413, raise `post_max_size`/`upload_max_filesize` (and any proxy body-size limit) in your hosting config.
- **Nonce expiry**: WordPress REST nonces last ~24 hours. If the editor page sits open longer, saves start failing with a 403 — reload the page to get a fresh nonce.

## Puzzle JSON format

```json
{
  "version": 1,
  "id": "abc123",
  "name": "Puzzle name",
  "date": "2026-07-08",
  "cards": { "cardId": { "id": "cardId", "name": "Wolf", "img": "data:image/jpeg;base64,..." } },
  "initial": { "hand:player": ["cardId"], "cell:0": [], "...": [] },
  "solutions": [
    [{ "cardId": "cardId", "from": "hand:player", "to": "cell:7" }],
    [{ "cardId": "cardId", "from": "hand:player", "to": "cell:12" }]
  ]
}
```

`solutions` is an array of solution lines; an attempt is correct when it fully matches any one line. Attack entries look like `{ "type": "attack", "cardId": "a", "targetId": "b" }` and can be interleaved with moves.

Zones per grid square `N` (0–19, row-major, 5 per row): `site:N` (the site card, max 1), `cell:N:top` (surface), `cell:N:bot` (below). Other zones: `hand:player`, `hand:opponent`, `grave:player`, `grave:opponent`, `collection:player`, `collection:opponent`, `storyline` (shared), `pool` (editor-only staging area). Legacy `cell:N` zones load as `cell:N:top`.

The puzzle's `stats` object stores each player's starting mana and thresholds: `{ "player": { "mana": 3, "air": 0, "earth": 0, "fire": 1, "water": 1 }, "opponent": { ... } }`. Counters are adjustable during play and reset with the board, but they are informational — only card moves are part of the checked solution sequence.
