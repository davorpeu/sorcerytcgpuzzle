// Tests for the solve logic and the puzzle file format in src/store.js.
// Run with `npm test`. The fixture is a real version-1 puzzle ("Art test"):
// five sites, The Green Knight on square 12 with a buried Skeleton under it,
// an opponent Skeleton on square 7, and one recorded solution line — the
// Knight moves 12 -> 7.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
  undo,
  enterEditor,
  config,
  playLocked,
  MAX_MISTAKES,
  ARMED_ACTIONS,
  cancelArmed,
  removeCard,
  startRecording,
  stopRecording,
  wouldLoseWork,
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

  // Lines recorded before oversized attackers logged a `crossing` have none.
  it('an older line without a crossing still matches an attack that picked one', () => {
    const recorded = { type: 'attack', cardId: 'au', targetId: 'sk' }
    const attempt = { type: 'attack', cardId: 'au', targetId: 'sk', crossing: 5 }
    expect(sameEntry(attempt, recorded)).toBe(true)
  })

  it('tells two recorded crossings apart', () => {
    const atk = { type: 'attack', cardId: 'au', targetId: 'sk' }
    expect(sameEntry({ ...atk, crossing: 5 }, { ...atk, crossing: 5 })).toBe(true)
    expect(sameEntry({ ...atk, crossing: 5 }, { ...atk, crossing: 6 })).toBe(false)
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

  it('refuses a file from a newer version and keeps the current puzzle', () => {
    loadFixture()
    const before = serialize()
    const newer = { ...JSON.parse(JSON.stringify(fixture)), version: 99, name: 'From the future' }
    expect(() => loadPuzzle(newer)).toThrow(/newer version/)
    expect(state.puzzleName).toBe(before.name)
    expect(state.initialZones).toEqual(before.initial)
  })

  it('counts a solution being recorded as work that loading would lose', () => {
    loadFixture()
    state.mode = 'editor'
    startRecording()
    expect(wouldLoseWork()).toBe(true)
    stopRecording()
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

  it('counts a harmless extra move as solved, but not optimal', async () => {
    beginMove('gk')
    moveCard('gk', 'cell:12:top', 'cell:7:top')
    await nextTick()
    // The Necromancer is not part of the solution, so stepping it into the
    // square the Knight left doesn't disturb the puzzle.
    beginMove('nc')
    moveCard('nc', 'cell:17:top', 'cell:12:top')
    await nextTick()
    expect(state.moves).toHaveLength(2)
    expect(solveStatus.value).toBe('partial')
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

describe('undo and the mistake limit', () => {
  beforeEach(async () => {
    loadFixture()
    enterPlay()
    resetPlay()
    await nextTick()
  })
  afterEach(() => {
    config.canEdit = true
  })

  it('undo puts the board back and clears the verdict', async () => {
    beginMove('gk')
    moveCard('gk', 'cell:12:top', 'cell:7:top')
    await nextTick()
    expect(solveStatus.value).toBe('optimal')
    undo()
    await nextTick()
    expect(state.zones['cell:12:top']).toContain('gk')
    expect(state.moves).toHaveLength(0)
    expect(solveStatus.value).toBe(null)
  })

  it('a player fails for the day after the last allowed mistake', async () => {
    config.canEdit = false
    for (let i = 0; i < MAX_MISTAKES; i++) {
      beginMove('gk')
      moveCard('gk', 'cell:12:top', 'cell:13:top')
      await nextTick()
    }
    expect(state.mistakes).toBe(MAX_MISTAKES)
    expect(state.failed).toBe(true)
    expect(playLocked.value).toBe(true)
  })

  it('an editor gets the snap-back but no limit', async () => {
    for (let i = 0; i < MAX_MISTAKES + 1; i++) {
      beginMove('gk')
      moveCard('gk', 'cell:12:top', 'cell:13:top')
      await nextTick()
    }
    expect(state.mistakes).toBe(MAX_MISTAKES + 1)
    expect(state.failed).toBe(false)
    expect(playLocked.value).toBe(false)
  })
})

describe('recording solution lines in the editor', () => {
  beforeEach(() => {
    loadFixture()
    enterEditor()
  })

  it('adds a new line and puts the board back to the start', () => {
    startRecording()
    beginMove('gk')
    moveCard('gk', 'cell:12:top', 'cell:11:top')
    expect(state.draft).toHaveLength(1)
    stopRecording()
    expect(state.solutions).toHaveLength(2)
    expect(state.solutions[1][0]).toMatchObject({ cardId: 'gk', from: 'cell:12:top', to: 'cell:11:top' })
    expect(state.zones['cell:12:top']).toContain('gk')
    expect(state.draft).toHaveLength(0)
  })

  it('does not add a line that is already recorded', () => {
    startRecording()
    beginMove('gk')
    moveCard('gk', 'cell:12:top', 'cell:7:top')
    stopRecording()
    expect(state.solutions).toHaveLength(1)
  })
})

describe('armed actions', () => {
  beforeEach(() => {
    loadFixture()
    enterEditor()
  })

  it("Esc (cancelArmed) clears every armed action but not a trigger's choice", () => {
    for (const k of ARMED_ACTIONS) ui[k] = 'gk'
    ui.activating = { cardId: 'gk' }
    ui.awaitingDefender = { attackerId: 'gk' }
    ui.selected = 'gk'
    ui.storyChoice = { ownerId: 'nc' }
    cancelArmed()
    for (const k of ARMED_ACTIONS) expect(ui[k]).toBe(null)
    expect(ui.activating).toBe(null)
    expect(ui.awaitingDefender).toBe(null)
    expect(ui.selected).toBe(null)
    expect(ui.storyChoice).toEqual({ ownerId: 'nc' })
    ui.storyChoice = null
  })

  it('removing a card clears every action it was armed for', () => {
    ui.shooting = 'gk'
    ui.intercepting = 'gk'
    ui.activating = { cardId: 'gk' }
    ui.moving = 'nc'
    removeCard('gk')
    expect(ui.shooting).toBe(null)
    expect(ui.intercepting).toBe(null)
    expect(ui.activating).toBe(null)
    expect(ui.moving).toBe('nc') // another card's action stays
    ui.moving = null
  })
})
