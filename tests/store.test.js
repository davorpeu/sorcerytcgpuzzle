// Tests for the solve logic and the puzzle file format in src/store.js.
// Run with `npm test`. The fixture is a real version-1 puzzle ("Art test"):
// five sites, The Green Knight on square 12 with a buried Skeleton under it,
// an opponent Skeleton on square 7, and one recorded solution line — the
// Knight moves 12 -> 7.
import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import fixture from './fixtures/art-test-v1.json'
import {
  state,
  ui,
  loadPuzzle,
  serialize,
  enterPlay,
  resetPlay,
  beginMove,
  moveCard,
  solveStatus,
  __test,
} from '../src/store.js'

const { sameEntry, lineOutcome, routeZone, wouldCycle } = __test

// A fresh copy each time: loadPuzzle must not depend on the caller's object.
const loadFixture = () => loadPuzzle(JSON.parse(JSON.stringify(fixture)))

const mv = (cardId, from, to, extra = {}) => ({ cardId, from, to, ...extra })

describe('sameEntry (is an attempt move the same as a solution move?)', () => {
  it('matches plain moves on card, from and to, ignoring undo bookkeeping', () => {
    expect(
      sameEntry(
        mv('gk', 'cell:12:top', 'cell:7:top', { prevTapped: { gk: true }, held: ['x'] }),
        mv('gk', 'cell:12:top', 'cell:7:top')
      )
    ).toBe(true)
  })

  it('rejects a move to a different zone or by a different card', () => {
    const sol = mv('gk', 'cell:12:top', 'cell:7:top')
    expect(sameEntry(mv('gk', 'cell:12:top', 'cell:13:top'), sol)).toBe(false)
    expect(sameEntry(mv('nc', 'cell:12:top', 'cell:7:top'), sol)).toBe(false)
  })

  it('tells attacks apart by target and defender', () => {
    const atk = { type: 'attack', cardId: 'gk', targetId: 'sk', defenderId: null }
    expect(sameEntry({ ...atk }, atk)).toBe(true)
    expect(sameEntry({ ...atk, targetId: 'nc' }, atk)).toBe(false)
    expect(sameEntry({ ...atk, defenderId: 'nc' }, atk)).toBe(false)
  })

  // Known bug A2 (redesign/audit-plan.md): lines recorded before oversized
  // attackers logged a `crossing` have none, so the attempt's crossing makes
  // the correct attack fail and cost the player a mistake. `it.fails` keeps
  // the suite green while the bug exists; turn it into `it` once it's fixed.
  it.fails('an older line without a crossing still matches an attack that picked one', () => {
    const recorded = { type: 'attack', cardId: 'au', targetId: 'sk' }
    const attempt = { type: 'attack', cardId: 'au', targetId: 'sk', crossing: 5 }
    expect(sameEntry(attempt, recorded)).toBe(true)
  })
})

describe('lineOutcome (how an attempt lines up with one solution line)', () => {
  const line = [mv('gk', 'cell:12:top', 'cell:7:top'), mv('nc', 'cell:17:top', 'cell:12:top')]

  it('is exact for the same moves in the same order', () => {
    expect(lineOutcome(line, [...line])).toBe('exact')
  })

  it('is progress while solution moves are still missing', () => {
    expect(lineOutcome(line, [])).toBe('progress')
    expect(lineOutcome(line, [line[0]])).toBe('progress')
  })

  it('is loose when extra moves only touch cards the solution never uses', () => {
    const extra = mv('sk3', 'hand:player', 'cell:11:top')
    expect(lineOutcome(line, [line[0], extra, line[1]])).toBe('loose')
  })

  it('is dead when an extra move touches a solution card', () => {
    expect(lineOutcome(line, [mv('gk', 'cell:12:top', 'cell:13:top')])).toBe('dead')
  })

  it('is dead when the solution moves come out of order', () => {
    expect(lineOutcome(line, [line[1], line[0]])).toBe('dead')
  })
})

describe('zone helpers', () => {
  beforeEach(loadFixture)

  it('routeZone sends sites to the site slot and everything else to the surface', () => {
    expect(routeZone('s7', 'cell:3:top')).toBe('site:3')
    expect(routeZone('gk', 'site:3')).toBe('cell:3:top')
    expect(routeZone('gk', 'cell:3:bot')).toBe('cell:3:bot')
    expect(routeZone('gk', 'hand:player')).toBe('hand:player')
  })

  it('wouldCycle refuses a carry that would loop back to the carrier', () => {
    state.carry = { lb: 'gk' } // the Knight carries the Bolt
    expect(wouldCycle('lb', 'gk')).toBe(true) // the Bolt can't pick up its carrier
    expect(wouldCycle('nc', 'gk')).toBe(false)
  })
})

describe('puzzle files', () => {
  it('loads an old version-1 file and fills in the newer fields', () => {
    loadFixture()
    const knight = state.cards.gk
    expect(knight.abilities).toEqual([])
    expect(knight.spellCost).toEqual({ mana: 0, air: 0, earth: 0, fire: 0, water: 0 })
    expect(state.cards.s7.manaProvided).toBe(1) // sites default to 1 mana
    expect(state.initialZones['cell:12:top']).toEqual(['gk'])
    expect(state.initialZones['cell:12:bot']).toEqual(['sk2'])
    expect(state.initialZones['site:7']).toEqual(['s7'])
    expect(state.solutions).toEqual(fixture.solutions)
  })

  it('saves and loads back to the same puzzle', () => {
    loadFixture()
    const first = serialize()
    loadPuzzle(JSON.parse(JSON.stringify(first)))
    const second = serialize()
    const strip = ({ savedAt, ...rest }) => rest
    expect(strip(second)).toEqual(strip(first))
    expect(first.version).toBe(2)
  })
})

describe('playing the puzzle', () => {
  beforeEach(async () => {
    loadFixture()
    enterPlay()
    resetPlay()
    await nextTick()
  })

  it('detects the recorded solution as an optimal solve', async () => {
    beginMove('gk')
    moveCard('gk', 'cell:12:top', 'cell:7:top')
    await nextTick()
    expect(state.moves).toHaveLength(1)
    expect(solveStatus.value).toBe('optimal')
    expect(state.mistakes).toBe(0)
  })

  it('snaps a wrong move back and counts a mistake', async () => {
    beginMove('gk')
    moveCard('gk', 'cell:12:top', 'cell:13:top')
    await nextTick()
    expect(state.zones['cell:12:top']).toContain('gk')
    expect(state.moves).toHaveLength(0)
    expect(state.mistakes).toBe(1)
    expect(ui.moving).toBe(null)
  })
})
