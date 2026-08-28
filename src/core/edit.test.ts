import { describe, expect, it } from 'vitest'
import {
  apply,
  initialState,
  removeBarDropsNotes,
  retune,
  retuneDropsNotes,
  type Action,
} from './edit.ts'
import { emptyBar, emptyScore, TUNINGS, type Cell, type EditorState } from './model.ts'

const [STANDARD, DROP_D, BASS] = TUNINGS

const run = (state: EditorState, ...actions: readonly Action[]): EditorState =>
  actions.reduce(apply, state)

const digit = (value: number): Action => ({ kind: 'digit', digit: value })

const currentCell = (state: EditorState): Cell | null | undefined =>
  state.score.bars[state.cursor.bar]?.columns[state.cursor.column]?.[
    state.cursor.slot
  ]

const cellAt = (
  state: EditorState,
  bar: number,
  column: number,
  slot: number,
): Cell | null | undefined => state.score.bars[bar]?.columns[column]?.[slot]

describe('digit entry', () => {
  it('appends a second digit when the result is in range', () => {
    const state = run(initialState(), digit(1), digit(0))
    expect(currentCell(state)).toEqual({ kind: 'fret', fret: 10 })
  })

  it('replaces instead of appending when the result would exceed 24', () => {
    const state = run(initialState(), digit(2), digit(5))
    expect(currentCell(state)).toEqual({ kind: 'fret', fret: 5 })
  })

  it('starts fresh after the cursor moves', () => {
    const state = run(
      initialState(),
      digit(1),
      { kind: 'move', move: 'nextColumn' },
      digit(0),
    )
    expect(cellAt(state, 0, 0, 0)).toEqual({ kind: 'fret', fret: 1 })
    expect(cellAt(state, 0, 1, 0)).toEqual({ kind: 'fret', fret: 0 })
  })
})

describe('bend target', () => {
  it('routes digits after b into the target, leaving the fret alone', () => {
    const state = run(initialState(), digit(7), { kind: 'bend' }, digit(9))
    expect(currentCell(state)).toEqual({
      kind: 'fret',
      fret: 7,
      decoration: { kind: 'b', to: 9 },
    })
  })

  it('appends a second target digit', () => {
    const state = run(
      initialState(),
      digit(7),
      { kind: 'bend' },
      digit(1),
      digit(2),
    )
    expect(currentCell(state)).toEqual({
      kind: 'fret',
      fret: 7,
      decoration: { kind: 'b', to: 12 },
    })
  })

  it('leaves the target unset when b stands alone', () => {
    const state = run(initialState(), digit(7), { kind: 'bend' })
    expect(currentCell(state)).toEqual({
      kind: 'fret',
      fret: 7,
      decoration: { kind: 'b' },
    })
  })

  it('resets digitTarget on any action other than a digit', () => {
    const state = run(
      initialState(),
      digit(7),
      { kind: 'bend' },
      { kind: 'move', move: 'nextColumn' },
      digit(9),
    )
    expect(state.digitTarget).toBe('fret')
    expect(cellAt(state, 0, 0, 0)).toEqual({
      kind: 'fret',
      fret: 7,
      decoration: { kind: 'b' },
    })
    expect(cellAt(state, 0, 1, 0)).toEqual({ kind: 'fret', fret: 9 })
  })
})

describe('modifiers on a cell with no fret', () => {
  it('no-ops on an empty cell', () => {
    const state = initialState()
    expect(apply(state, { kind: 'link', link: 'h' })).toBe(state)
    expect(apply(state, { kind: 'bend' })).toBe(state)
    expect(apply(state, { kind: 'vibrato' })).toBe(state)
  })

  it('no-ops on a muted cell', () => {
    const state = run(initialState(), { kind: 'mute' })
    expect(apply(state, { kind: 'link', link: 'h' })).toBe(state)
    expect(apply(state, { kind: 'bend' })).toBe(state)
    expect(apply(state, { kind: 'vibrato' })).toBe(state)
  })
})

describe('cursor clamping at score edges', () => {
  it('stays put at the first column of the first bar', () => {
    const state = initialState()
    expect(apply(state, { kind: 'move', move: 'prevColumn' }).cursor).toEqual(
      state.cursor,
    )
    expect(apply(state, { kind: 'move', move: 'stringUp' }).cursor).toEqual(
      state.cursor,
    )
    expect(apply(state, { kind: 'move', move: 'prevBar' }).cursor).toEqual(
      state.cursor,
    )
  })

  it('stays put at the last column of the last bar', () => {
    const state = run(
      initialState(),
      { kind: 'move', move: 'barEnd' },
      { kind: 'move', move: 'stringDown' },
      { kind: 'move', move: 'stringDown' },
      { kind: 'move', move: 'stringDown' },
      { kind: 'move', move: 'stringDown' },
      { kind: 'move', move: 'stringDown' },
    )
    expect(state.cursor).toEqual({ bar: 0, column: 7, slot: 5 })
    expect(apply(state, { kind: 'move', move: 'nextColumn' }).cursor).toEqual(
      state.cursor,
    )
    expect(apply(state, { kind: 'move', move: 'stringDown' }).cursor).toEqual(
      state.cursor,
    )
    expect(apply(state, { kind: 'move', move: 'nextBar' }).cursor).toEqual(
      state.cursor,
    )
  })

  it('crosses bar boundaries in both directions', () => {
    const twoBars = run(initialState(), { kind: 'addBar' })
    expect(twoBars.cursor).toEqual({ bar: 1, column: 0, slot: 0 })
    const back = apply(twoBars, { kind: 'move', move: 'prevColumn' })
    expect(back.cursor).toEqual({ bar: 0, column: 7, slot: 0 })
    expect(apply(back, { kind: 'move', move: 'nextColumn' }).cursor).toEqual({
      bar: 1,
      column: 0,
      slot: 0,
    })
  })
})

describe('removeColumn', () => {
  it('refuses when the last column is not empty', () => {
    const state = run(
      initialState(),
      { kind: 'move', move: 'barEnd' },
      digit(5),
    )
    const after = apply(state, { kind: 'removeColumn' })
    expect(after.score.bars[0]?.columns).toHaveLength(8)
  })

  it('removes an empty last column and pulls the cursor back', () => {
    const state = run(initialState(), { kind: 'move', move: 'barEnd' })
    const after = apply(state, { kind: 'removeColumn' })
    expect(after.score.bars[0]?.columns).toHaveLength(7)
    expect(after.cursor.column).toBe(6)
  })

  it('refuses to take a bar below one column', () => {
    const state: EditorState = {
      ...initialState(),
      score: { ...emptyScore(), bars: [emptyBar(1, 6)] },
    }
    const after = apply(state, { kind: 'removeColumn' })
    expect(after.score.bars[0]?.columns).toHaveLength(1)
  })
})

describe('removeBar', () => {
  const threeBars = (): EditorState =>
    run(initialState(), { kind: 'addBar' }, { kind: 'addBar' })

  it('removes the bar the cursor is in', () => {
    const state = run(threeBars(), digit(9))
    expect(state.cursor.bar).toBe(2)
    const after = apply(state, { kind: 'removeBar' })
    expect(after.score.bars).toHaveLength(2)
    expect(cellAt(after, 0, 0, 0)).toBeNull()
    expect(cellAt(after, 1, 0, 0)).toBeNull()
  })

  it('pulls the cursor back when the last bar goes', () => {
    const after = apply(threeBars(), { kind: 'removeBar' })
    expect(after.cursor.bar).toBe(1)
  })

  it('leaves earlier bars and their notes alone', () => {
    const state = run(
      initialState(),
      digit(7),
      { kind: 'addBar' },
      digit(5),
    )
    const after = apply(state, { kind: 'removeBar' })
    expect(after.score.bars).toHaveLength(1)
    expect(cellAt(after, 0, 0, 0)).toEqual({ kind: 'fret', fret: 7 })
  })

  it('refuses to remove the only bar', () => {
    const state = run(initialState(), digit(7))
    const after = apply(state, { kind: 'removeBar' })
    expect(after.score.bars).toHaveLength(1)
    expect(cellAt(after, 0, 0, 0)).toEqual({ kind: 'fret', fret: 7 })
  })
})

describe('removeBarDropsNotes', () => {
  const twoBars = (...actions: readonly Action[]): EditorState =>
    run(initialState(), { kind: 'addBar' }, ...actions)

  it('is false for an untouched bar', () => {
    expect(removeBarDropsNotes(twoBars().score, 0)).toBe(false)
  })

  it('is true once any cell in the bar is filled', () => {
    expect(removeBarDropsNotes(twoBars(digit(0)).score, 1)).toBe(true)
    expect(removeBarDropsNotes(twoBars({ kind: 'mute' }).score, 1)).toBe(true)
  })

  it('is false for the only bar, however full it is', () => {
    const single = run(initialState(), digit(9))
    expect(removeBarDropsNotes(single.score, 0)).toBe(false)
    expect(apply(single, { kind: 'removeBar' }).score.bars).toHaveLength(1)
  })

  it('is false for a bar index that does not exist', () => {
    expect(removeBarDropsNotes(twoBars().score, 7)).toBe(false)
  })
})

describe('retune', () => {
  const withNotes = (state: EditorState): EditorState =>
    run(
      state,
      digit(3),
      { kind: 'move', move: 'stringDown' },
      { kind: 'move', move: 'stringDown' },
      { kind: 'move', move: 'stringDown' },
      { kind: 'move', move: 'stringDown' },
      { kind: 'move', move: 'stringDown' },
      digit(7),
    )

  it('relabels without touching notes at equal string count', () => {
    const before = withNotes(initialState()).score
    const after = retune(before, DROP_D)
    expect(after.bars).toEqual(before.bars)
    expect(after.tuning).toBe(DROP_D)
  })

  it('drops rows bottom-up when the new tuning is narrower', () => {
    const before = withNotes(initialState()).score
    const after = retune(before, BASS)
    expect(after.bars[0]?.columns[0]).toHaveLength(4)
    expect(after.bars[0]?.columns[0]?.[3]).toEqual({ kind: 'fret', fret: 7 })
    expect(after.bars[0]?.columns[0]?.[0]).toBeNull()
  })

  it('prepends empty rows when the new tuning is wider', () => {
    const bass = retune(withNotes(initialState()).score, BASS)
    const back = retune(bass, STANDARD)
    expect(back.bars[0]?.columns[0]).toHaveLength(6)
    expect(back.bars[0]?.columns[0]?.[5]).toEqual({ kind: 'fret', fret: 7 })
    expect(back.bars[0]?.columns[0]?.[0]).toBeNull()
  })

  it('keeps the cursor on the same string across a narrowing retune', () => {
    const onG = run(
      initialState(),
      { kind: 'move', move: 'stringDown' },
      { kind: 'move', move: 'stringDown' },
      digit(9),
    )
    expect(onG.cursor.slot).toBe(2)
    const bass = apply(onG, { kind: 'retune', tuning: BASS })
    expect(bass.cursor.slot).toBe(0)
    expect(cellAt(bass, 0, 0, 0)).toEqual({ kind: 'fret', fret: 9 })
  })

  it('clamps the cursor into the new string count', () => {
    const state = run(
      withNotes(initialState()),
      { kind: 'retune', tuning: BASS },
    )
    expect(state.cursor.slot).toBe(3)
  })
})

describe('retuneDropsNotes', () => {
  it('is false when nothing is lost', () => {
    const empty = emptyScore()
    expect(retuneDropsNotes(empty, DROP_D)).toBe(false)
    expect(retuneDropsNotes(empty, BASS)).toBe(false)
    expect(retuneDropsNotes(retune(empty, BASS), STANDARD)).toBe(false)
  })

  it('agrees with what retune actually drops', () => {
    const onTopString = run(initialState(), digit(3)).score
    expect(retuneDropsNotes(onTopString, BASS)).toBe(true)

    const dropped = retune(onTopString, BASS)
    const restored = retune(dropped, STANDARD)
    expect(restored.bars[0]?.columns[0]?.[0]).toBeNull()
  })
})
