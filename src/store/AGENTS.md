# Store notes

Detail for work inside `src/store/`. The module map and the rules for the import cycle are in the
root AGENTS.md.

## Solutions & checking

A puzzle has **multiple solution lines** (`state.solutions`, an array of move sequences). Recording snapshots the start position (`initialZones`/`initialCarry`/`initialStats`/`initialTapped`); each recorded line restarts from that same snapshot (`restoreInitial()`). Move-equality is `sameEntry()`: it compares `cardId`/`from`/`to` (or `targetId`/`to` for special types) but deliberately ignores `prevTapped`/`from`/`held`/`carrierId`, which are undo bookkeeping. Entry types: plain move, `attack`, `strike`, `pickup`, `drop`.

`solveStatus` (`session.js`) is a computed that re-runs on every move and returns `'optimal'`, `'partial'`, or `null`. Per line, `lineOutcome()` classifies the attempt: `'exact'` (same moves, same length → optimal), `'loose'` (every solution move is present in order **and** the extra moves in between touch only cards the solution never manipulates → solved but not optimal), `'progress'` (on track, solution moves still missing) or `'dead'` (a solution move is out of order, or an extra move touches a solution card). "Touches" is `entryCards()` (a move's `cardId`/`targetId`/`defenderId`/`shooterId`); the solution's cards are `solutionCards()`. Because the verdict just reflects the current board, an extra move that disturbs a solution card un-solves the board as honestly as it solved it.

Only card moves count toward the solution. Life/mana/threshold counters (`stats`) and tap state are informational and reset with the board.

There is a mistake limit. `evaluatePlay()` (watching `state.moves.length`) snaps back any move that leaves no solution line reachable (`lineOutcome() === 'dead'`) and increments `state.mistakes`. Non-editors fail for the day at `MAX_MISTAKES` (5), and a solve also locks the puzzle for the day (`playLocked`); both are persisted per puzzle per day in localStorage (`ATTEMPTS_KEY`). Editors get the snap-back but no cap or lock.

## Persistence (backend-agnostic)

`savePuzzle`/`listPuzzles`/`loadById`/`deletePuzzle`/`loadDaily` are all async and branch on `remote()`: REST API (`api()` helper, sends `X-WP-Nonce`) when embedded, `localStorage` when standalone. `serialize()`/`loadPuzzle()` define the on-disk JSON (see README "Puzzle JSON format"). `loadPuzzle` back-fills defaults so older files load unchanged — preserve that when changing the format, and bump `FORMAT_VERSION` for breaking changes.

URL loading (`initFromUrl`): `?data=` (self-contained base64), `?src=` (hosted JSON), `?puzzle=<id>`, `?daily`. Non-editors default to the daily puzzle when nothing is specified.
