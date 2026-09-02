import { describe, expect, it } from 'vitest'
import {
  apply,
  atFirstBar,
  atLastBar,
  initialState,
  removeBarDropsContent,
  removeRowDropsContent,
  retune,
  retuneDropsNotes,
  scoreHasContent,
  songHasContent,
  type Action,
} from './edit.ts'
import {
  DEFAULT_BAR_COLUMNS,
  emptyBar,
  emptyCells,
  emptyRow,
  emptyScore,
  emptySong,
  TUNINGS,
  type Bar,
  type Cell,
  type EditorState,
  type Row,
  type Score,
} from './model.ts'

const [STANDARD, DROP_D, BASS] = TUNINGS

const run = (state: EditorState, ...actions: readonly Action[]): EditorState =>
  actions.reduce(apply, state)

const digit = (value: number): Action => ({ kind: 'digit', digit: value })

/** The cursor clamps, so an out-of-range column lands on the bar's last one. */
const toLastColumn = (bar = 0): Action => ({
  kind: 'setCursor',
  cursor: { row: 0, bar, column: Number.MAX_SAFE_INTEGER, slot: 0 },
})

/** The default score has two bars; the last-bar guards need a score with one. */
const oneBar = (): EditorState => ({
  ...initialState(),
  song: {
    ...emptySong(),
    tab: { ...emptyScore(), rows: [emptyRow(1, DEFAULT_BAR_COLUMNS, 6)] },
  },
})

const barsIn = (state: EditorState, row = 0): number =>
  state.song.tab.rows[row]?.bars.length ?? 0

const columnsIn = (state: EditorState, row = 0, bar = 0): number =>
  state.song.tab.rows[row]?.bars[bar]?.columns.length ?? 0

const currentCell = (state: EditorState): Cell | null | undefined =>
  state.song.tab.rows[state.cursor.row]?.bars[state.cursor.bar]?.columns[
    state.cursor.column
  ]?.cells[state.cursor.slot]

const cellAt = (
  state: EditorState,
  bar: number,
  column: number,
  slot: number,
  row = 0,
): Cell | null | undefined =>
  state.song.tab.rows[row]?.bars[bar]?.columns[column]?.cells[slot]

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
    const state = run(initialState(), digit(7), { kind: 'bend' }, digit(1), digit(2))
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
    expect(apply(state, { kind: 'move', move: 'stringUp' }).cursor).toEqual(state.cursor)
    expect(apply(state, { kind: 'move', move: 'prevBar' }).cursor).toEqual(state.cursor)
  })

  it('stays put at the last column of the last bar', () => {
    const state = run(
      initialState(),
      toLastColumn(1),
      { kind: 'move', move: 'stringDown' },
      { kind: 'move', move: 'stringDown' },
      { kind: 'move', move: 'stringDown' },
      { kind: 'move', move: 'stringDown' },
      { kind: 'move', move: 'stringDown' },
    )
    expect(state.cursor).toEqual({ row: 0, bar: 1, column: 11, slot: 5 })
    expect(apply(state, { kind: 'move', move: 'nextColumn' }).cursor).toEqual(
      state.cursor,
    )
    expect(apply(state, { kind: 'move', move: 'stringDown' }).cursor).toEqual(
      state.cursor,
    )
    expect(apply(state, { kind: 'move', move: 'nextBar' }).cursor).toEqual(state.cursor)
  })

  it('crosses row boundaries, bar by bar', () => {
    const two = apply(initialState(), { kind: 'addRow' })
    expect(two.cursor).toEqual({ row: 1, bar: 0, column: 0, slot: 0 })
    const back = apply(two, { kind: 'move', move: 'prevBar' })
    expect(back.cursor).toEqual({ row: 0, bar: 1, column: 0, slot: 0 })
    expect(apply(back, { kind: 'move', move: 'nextBar' }).cursor.row).toBe(1)
  })

  it('steps left out of a row into the last column of the row above', () => {
    const two = apply(initialState(), { kind: 'addRow' })
    const back = apply(two, { kind: 'move', move: 'prevColumn' })
    expect(back.cursor).toEqual({ row: 0, bar: 1, column: 11, slot: 0 })
  })

  it('crosses bar boundaries in both directions', () => {
    const twoBars = run(initialState(), { kind: 'addBar' })
    expect(twoBars.cursor).toEqual({ row: 0, bar: 1, column: 0, slot: 0 })
    const back = apply(twoBars, { kind: 'move', move: 'prevColumn' })
    expect(back.cursor).toEqual({ row: 0, bar: 0, column: 11, slot: 0 })
    expect(apply(back, { kind: 'move', move: 'nextColumn' }).cursor).toEqual({
      row: 0,
      bar: 1,
      column: 0,
      slot: 0,
    })
  })
})

describe('addColumn', () => {
  it('puts the new column after the cursor, not at the end', () => {
    const state = run(
      initialState(),
      { kind: 'setCursor', cursor: { row: 0, bar: 0, column: 0, slot: 0 } },
      digit(7),
      { kind: 'move', move: 'nextColumn' },
      digit(9),
      { kind: 'setCursor', cursor: { row: 0, bar: 0, column: 0, slot: 0 } },
      { kind: 'addColumn' },
    )
    expect(columnsIn(state)).toBe(DEFAULT_BAR_COLUMNS + 1)
    // 7, then the new empty column, then 9.
    expect(cellAt(state, 0, 0, 0)).toEqual({ kind: 'fret', fret: 7 })
    expect(cellAt(state, 0, 1, 0)).toBeNull()
    expect(cellAt(state, 0, 2, 0)).toEqual({ kind: 'fret', fret: 9 })
  })

  it('moves the cursor into the column it just made', () => {
    const state = run(
      initialState(),
      { kind: 'setCursor', cursor: { row: 0, bar: 0, column: 3, slot: 0 } },
      { kind: 'addColumn' },
    )
    expect(state.cursor.column).toBe(4)
  })
})

describe('removeColumn', () => {
  it('removes the column under the cursor, not the last one', () => {
    const state = run(
      initialState(),
      { kind: 'setCursor', cursor: { row: 0, bar: 0, column: 5, slot: 0 } },
      digit(7),
      { kind: 'setCursor', cursor: { row: 0, bar: 0, column: 2, slot: 0 } },
      { kind: 'removeColumn' },
    )
    expect(columnsIn(state)).toBe(DEFAULT_BAR_COLUMNS - 1)
    // The 7 shifts left by one, so an empty column really went from before it.
    expect(cellAt(state, 0, 4, 0)).toEqual({ kind: 'fret', fret: 7 })
  })

  it('refuses when the column under the cursor holds a note', () => {
    const state = run(initialState(), digit(7))
    expect(columnsIn(apply(state, { kind: 'removeColumn' }))).toBe(DEFAULT_BAR_COLUMNS)
  })

  it('refuses when it holds only a chord name', () => {
    const state = run(initialState(), {
      kind: 'setChord',
      row: 0,
      bar: 0,
      column: 0,
      chord: 'Am',
    })
    expect(columnsIn(apply(state, { kind: 'removeColumn' }))).toBe(DEFAULT_BAR_COLUMNS)
  })

  it('refuses when the last column is not empty', () => {
    const state = run(initialState(), toLastColumn(), digit(5))
    const after = apply(state, { kind: 'removeColumn' })
    expect(columnsIn(after)).toBe(12)
  })

  it('removes an empty last column and pulls the cursor back', () => {
    const state = run(initialState(), toLastColumn())
    const after = apply(state, { kind: 'removeColumn' })
    expect(columnsIn(after)).toBe(11)
    expect(after.cursor.column).toBe(10)
  })

  it('refuses to take a bar below one column', () => {
    const state: EditorState = {
      ...initialState(),
      song: { ...emptySong(), tab: { ...emptyScore(), rows: [emptyRow(1, 1, 6)] } },
    }
    const after = apply(state, { kind: 'removeColumn' })
    expect(columnsIn(after)).toBe(1)
  })
})

describe('addRow', () => {
  it('adds a row below with one bar in it and moves into it', () => {
    const after = apply(initialState(), { kind: 'addRow' })
    expect(after.song.tab.rows).toHaveLength(2)
    expect(barsIn(after, 0)).toBe(2)
    expect(barsIn(after, 1)).toBe(1)
    expect(after.cursor).toEqual({ row: 1, bar: 0, column: 0, slot: 0 })
  })

  it('inserts after the row the cursor is in, not at the end', () => {
    const three = run(
      initialState(),
      { kind: 'addRow' },
      { kind: 'addRow' },
      { kind: 'setCursor', cursor: { row: 0, bar: 0, column: 0, slot: 0 } },
      digit(7),
      { kind: 'addRow' },
    )
    expect(three.song.tab.rows).toHaveLength(4)
    expect(three.cursor.row).toBe(1)
    expect(cellAt(three, 0, 0, 0, 0)).toEqual({ kind: 'fret', fret: 7 })
    expect(barsIn(three, 1)).toBe(1)
  })

  it('gives the new bar the score default width', () => {
    const after = apply(initialState(), { kind: 'addRow' })
    expect(columnsIn(after, 1, 0)).toBe(DEFAULT_BAR_COLUMNS)
  })
})

describe('removeRow', () => {
  const twoRows = (): EditorState => apply(initialState(), { kind: 'addRow' })

  it('removes the row the cursor is in', () => {
    const after = apply(run(twoRows(), digit(9)), { kind: 'removeRow' })
    expect(after.song.tab.rows).toHaveLength(1)
    expect(barsIn(after, 0)).toBe(2)
    expect(after.cursor.row).toBe(0)
  })

  it('refuses to remove the only row', () => {
    const after = apply(run(initialState(), digit(7)), { kind: 'removeRow' })
    expect(after.song.tab.rows).toHaveLength(1)
    expect(cellAt(after, 0, 0, 0)).toEqual({ kind: 'fret', fret: 7 })
  })
})

describe('removeRowDropsContent', () => {
  it('is false for an untouched row and for the only row', () => {
    const two = apply(initialState(), { kind: 'addRow' })
    expect(removeRowDropsContent(two.song.tab, 1)).toBe(false)
    expect(removeRowDropsContent(run(initialState(), digit(9)).song.tab, 0)).toBe(false)
  })

  it('is true once the row holds a note', () => {
    const two = run(initialState(), { kind: 'addRow' }, digit(9))
    expect(removeRowDropsContent(two.song.tab, 1)).toBe(true)
    expect(removeRowDropsContent(two.song.tab, 0)).toBe(false)
  })

  it('is false for a row index that does not exist', () => {
    const two = run(initialState(), { kind: 'addRow' }, digit(9))
    expect(removeRowDropsContent(two.song.tab, 9)).toBe(false)
  })
})

describe('removeBar', () => {
  const threeBars = (): EditorState => run(initialState(), { kind: 'addBar' })

  it('removes the bar the cursor is in', () => {
    const state = run(threeBars(), digit(9))
    expect(state.cursor.bar).toBe(1)
    const after = apply(state, { kind: 'removeBar' })
    expect(barsIn(after)).toBe(2)
    expect(cellAt(after, 0, 0, 0)).toBeNull()
    expect(cellAt(after, 1, 0, 0)).toBeNull()
  })

  it('pulls the cursor back when the last bar goes', () => {
    const onLastBar = run(threeBars(), { kind: 'move', move: 'nextBar' })
    expect(onLastBar.cursor.bar).toBe(2)
    expect(apply(onLastBar, { kind: 'removeBar' }).cursor.bar).toBe(1)
  })

  it('leaves earlier bars and their notes alone', () => {
    const state = run(initialState(), digit(7), { kind: 'addBar' }, digit(5))
    const after = apply(state, { kind: 'removeBar' })
    expect(barsIn(after)).toBe(2)
    expect(cellAt(after, 0, 0, 0)).toEqual({ kind: 'fret', fret: 7 })
  })

  it('takes the row with it when it was the last bar in that row', () => {
    const onNewRow = apply(initialState(), { kind: 'addRow' })
    expect(barsIn(onNewRow, 1)).toBe(1)
    const after = apply(onNewRow, { kind: 'removeBar' })
    expect(after.song.tab.rows).toHaveLength(1)
    expect(after.cursor.row).toBe(0)
  })

  it('refuses to remove the only bar', () => {
    const state = run(oneBar(), digit(7))
    const after = apply(state, { kind: 'removeBar' })
    expect(barsIn(after)).toBe(1)
    expect(cellAt(after, 0, 0, 0)).toEqual({ kind: 'fret', fret: 7 })
  })
})

describe('removeBarDropsContent', () => {
  const edited = (...actions: readonly Action[]): EditorState =>
    run(initialState(), ...actions)

  it('is false for an untouched bar', () => {
    expect(removeBarDropsContent(edited().song.tab, { row: 0, bar: 0 })).toBe(false)
  })

  it('is true once any cell in the bar is filled', () => {
    expect(removeBarDropsContent(edited(digit(0)).song.tab, { row: 0, bar: 0 })).toBe(
      true,
    )
    expect(
      removeBarDropsContent(edited({ kind: 'mute' }).song.tab, { row: 0, bar: 0 }),
    ).toBe(true)
  })

  it('is false for the only bar, however full it is', () => {
    const single = run(oneBar(), digit(9))
    expect(removeBarDropsContent(single.song.tab, { row: 0, bar: 0 })).toBe(false)
    expect(barsIn(apply(single, { kind: 'removeBar' }))).toBe(1)
  })

  it('is false for a bar index that does not exist', () => {
    expect(removeBarDropsContent(edited().song.tab, { row: 0, bar: 7 })).toBe(false)
    expect(removeBarDropsContent(edited().song.tab, { row: 9, bar: 0 })).toBe(false)
  })
})

describe('setChord', () => {
  const chordAt = (state: EditorState, column: number): string | undefined =>
    state.song.tab.rows[0]?.bars[0]?.columns[column]?.chord

  it('names the column it is given, not the one under the cursor', () => {
    const state = apply(initialState(), {
      kind: 'setChord',
      row: 0,
      bar: 0,
      column: 3,
      chord: 'Am',
    })
    expect(chordAt(state, 3)).toBe('Am')
    expect(chordAt(state, 0)).toBeUndefined()
    expect(state.cursor).toEqual({ row: 0, bar: 0, column: 0, slot: 0 })
  })

  it('drops the chord when the field is emptied', () => {
    const named = apply(initialState(), {
      kind: 'setChord',
      row: 0,
      bar: 0,
      column: 0,
      chord: 'Am',
    })
    const cleared = apply(named, {
      kind: 'setChord',
      row: 0,
      bar: 0,
      column: 0,
      chord: '',
    })
    expect(cleared.song.tab.rows[0]?.bars[0]?.columns[0]).toEqual(
      initialState().song.tab.rows[0]?.bars[0]?.columns[0],
    )
  })

  it('leaves the notes in the column alone', () => {
    const state = run(initialState(), digit(7), {
      kind: 'setChord',
      row: 0,
      bar: 0,
      column: 0,
      chord: 'Am',
    })
    expect(cellAt(state, 0, 0, 0)).toEqual({ kind: 'fret', fret: 7 })
    expect(chordAt(state, 0)).toBe('Am')
  })
})

describe('reset', () => {
  const chordAt = (state: EditorState, column: number): string | undefined =>
    state.song.tab.rows[0]?.bars[0]?.columns[column]?.chord

  it('drops notes, chord names, added bars and rows, and rewinds the cursor', () => {
    const state = run(
      initialState(),
      digit(9),
      { kind: 'setChord', row: 0, bar: 0, column: 0, chord: 'Am' },
      { kind: 'addBar' },
      digit(7),
      { kind: 'addRow' },
      digit(3),
    )
    const after = apply(state, { kind: 'reset' })
    expect(after.song.tab).toEqual(emptyScore())
    expect(cellAt(after, 0, 0, 0)).toBeNull()
    expect(chordAt(after, 0)).toBeUndefined()
    expect(after.cursor).toEqual({ row: 0, bar: 0, column: 0, slot: 0 })
  })

  it('keeps the tuning, so clearing a bass tab leaves four strings', () => {
    const bass = apply(initialState(), { kind: 'retune', tuning: BASS })
    const after = apply(run(bass, digit(5)), { kind: 'reset' })
    expect(after.song.tab.tuning).toBe(BASS)
    expect(after.song.tab.rows[0]?.bars[0]?.columns[0]?.cells).toHaveLength(4)
  })
})

describe('scoreHasContent', () => {
  it('is false for a fresh score, whatever its shape', () => {
    expect(scoreHasContent(emptyScore())).toBe(false)
    expect(scoreHasContent(oneBar().song.tab)).toBe(false)
    expect(scoreHasContent(run(initialState(), { kind: 'addBar' }).song.tab)).toBe(false)
    expect(scoreHasContent(run(initialState(), { kind: 'addRow' }).song.tab)).toBe(false)
  })

  it('is true for a note, a mute or a chord name', () => {
    expect(scoreHasContent(run(initialState(), digit(0)).song.tab)).toBe(true)
    expect(scoreHasContent(run(initialState(), { kind: 'mute' }).song.tab)).toBe(true)
    expect(
      scoreHasContent(
        apply(initialState(), {
          kind: 'setChord',
          row: 0,
          bar: 1,
          column: 3,
          chord: 'Am',
        }).song.tab,
      ),
    ).toBe(true)
  })

  it('is false again once the name is cleared', () => {
    const named = apply(initialState(), {
      kind: 'setChord',
      row: 0,
      bar: 0,
      column: 0,
      chord: 'Am',
    })
    const cleared = apply(named, {
      kind: 'setChord',
      row: 0,
      bar: 0,
      column: 0,
      chord: '',
    })
    expect(scoreHasContent(cleared.song.tab)).toBe(false)
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

  it('carries chord names through a narrowing retune', () => {
    const named = apply(initialState(), {
      kind: 'setChord',
      row: 0,
      bar: 0,
      column: 0,
      chord: 'Am',
    })
    const bass = retune(named.song.tab, BASS)
    expect(bass.rows[0]?.bars[0]?.columns[0]?.chord).toBe('Am')
    expect(bass.rows[0]?.bars[0]?.columns[0]?.cells).toHaveLength(4)
  })

  it('relabels without touching notes at equal string count', () => {
    const before = withNotes(initialState()).song.tab
    const after = retune(before, DROP_D)
    expect(after.rows).toEqual(before.rows)
    expect(after.tuning).toBe(DROP_D)
  })

  it('drops rows bottom-up when the new tuning is narrower', () => {
    const before = withNotes(initialState()).song.tab
    const after = retune(before, BASS)
    expect(after.rows[0]?.bars[0]?.columns[0]?.cells).toHaveLength(4)
    expect(after.rows[0]?.bars[0]?.columns[0]?.cells[3]).toEqual({
      kind: 'fret',
      fret: 7,
    })
    expect(after.rows[0]?.bars[0]?.columns[0]?.cells[0]).toBeNull()
  })

  it('prepends empty rows when the new tuning is wider', () => {
    const bass = retune(withNotes(initialState()).song.tab, BASS)
    const back = retune(bass, STANDARD)
    expect(back.rows[0]?.bars[0]?.columns[0]?.cells).toHaveLength(6)
    expect(back.rows[0]?.bars[0]?.columns[0]?.cells[5]).toEqual({ kind: 'fret', fret: 7 })
    expect(back.rows[0]?.bars[0]?.columns[0]?.cells[0]).toBeNull()
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
    const state = run(withNotes(initialState()), { kind: 'retune', tuning: BASS })
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
    const onTopString = run(initialState(), digit(3)).song.tab
    expect(retuneDropsNotes(onTopString, BASS)).toBe(true)

    const dropped = retune(onTopString, BASS)
    const restored = retune(dropped, STANDARD)
    expect(restored.rows[0]?.bars[0]?.columns[0]?.cells[0]).toBeNull()
  })
})

describe('the ends of the score', () => {
  const two = () => run(initialState(), { kind: 'addRow' })

  it('knows when there is no bar to step back to', () => {
    const state = two()
    expect(atFirstBar(state.song.tab, { row: 0, bar: 0, column: 0, slot: 0 })).toBe(true)
    expect(atFirstBar(state.song.tab, { row: 0, bar: 1, column: 0, slot: 0 })).toBe(false)
    expect(atFirstBar(state.song.tab, { row: 1, bar: 0, column: 0, slot: 0 })).toBe(false)
  })

  it('knows when there is no bar to step on to', () => {
    const state = two()
    expect(atLastBar(state.song.tab, { row: 1, bar: 0, column: 0, slot: 0 })).toBe(true)
    expect(atLastBar(state.song.tab, { row: 0, bar: 1, column: 0, slot: 0 })).toBe(false)
    expect(atLastBar(state.song.tab, { row: 0, bar: 0, column: 0, slot: 0 })).toBe(false)
  })

  it('agrees with the cursor actually refusing to move', () => {
    const state = two()
    const first = { row: 0, bar: 0, column: 0, slot: 0 }
    const stuck = run(
      state,
      { kind: 'setCursor', cursor: first },
      { kind: 'move', move: 'prevBar' },
    )
    expect(stuck.cursor).toEqual(first)
  })
})

describe('row headings', () => {
  const rowAt = (state: EditorState, index = 0) => state.song.tab.rows[index]

  const set = (state: EditorState, title: string, note: string, row = 0) =>
    apply(state, { kind: 'setRowHeading', row, title, note })

  it('keeps a title and a note on the row they were typed on', () => {
    const state = set(run(initialState(), { kind: 'addRow' }), 'Main Riff', 'let ring', 1)
    expect(rowAt(state, 1)?.title).toBe('Main Riff')
    expect(rowAt(state, 1)?.note).toBe('let ring')
    expect(rowAt(state, 0)?.title).toBeUndefined()
  })

  it('leaves no key behind when a field is emptied', () => {
    const named = set(initialState(), 'Main Riff', 'let ring')
    expect(rowAt(set(named, '', 'let ring'))).toEqual({
      note: 'let ring',
      bars: rowAt(named)?.bars,
    })
    expect(rowAt(set(named, '', ''))).toEqual({ bars: rowAt(named)?.bars })
  })

  it('survives every edit made to the bars under it', () => {
    const state = run(
      set(initialState(), 'Main Riff', 'let ring'),
      digit(7),
      { kind: 'addBar' },
      { kind: 'addColumn' },
      { kind: 'setChord', row: 0, bar: 0, column: 0, chord: 'Am' },
      { kind: 'retune', tuning: BASS },
    )
    expect(rowAt(state)?.title).toBe('Main Riff')
    expect(rowAt(state)?.note).toBe('let ring')
  })

  it('goes with the row when a bar removal takes the row with it', () => {
    const two = set(run(initialState(), { kind: 'addRow' }), 'Main Riff', '', 1)
    const state = run(
      two,
      { kind: 'setCursor', cursor: { row: 1, bar: 0, column: 0, slot: 0 } },
      {
        kind: 'removeBar',
      },
    )
    expect(state.song.tab.rows).toHaveLength(1)
    expect(rowAt(state)?.title).toBeUndefined()
  })

  it('counts as content, so clearing it asks first', () => {
    expect(songHasContent(set(initialState(), 'Main Riff', '').song)).toBe(true)
    expect(songHasContent(set(initialState(), '', 'let ring').song)).toBe(true)
    expect(songHasContent(set(initialState(), '', '').song)).toBe(false)
  })
})

describe('the chart', () => {
  const chartOf = (state: EditorState) => state.song.chart

  it('starts as one empty section', () => {
    expect(chartOf(initialState())).toEqual([{ name: 'Verse 1', body: '' }])
  })

  it('takes a title and a tempo', () => {
    const state = run(
      initialState(),
      { kind: 'setTitle', title: 'Endless Skies' },
      { kind: 'setTempo', tempo: '70 bpm' },
    )
    expect(state.song.title).toBe('Endless Skies')
    expect(state.song.tempo).toBe('70 bpm')
  })

  it('inserts a new section directly below the one asked for', () => {
    const state = run(
      initialState(),
      { kind: 'addSection', after: 0 },
      { kind: 'setSection', index: 1, section: { name: 'Chorus 1', body: 'Cmaj7' } },
      { kind: 'addSection', after: 0 },
    )
    expect(chartOf(state).map((section) => section.name)).toEqual([
      'Verse 1',
      '',
      'Chorus 1',
    ])
  })

  it('removes a section, but never the last one', () => {
    const two = run(initialState(), { kind: 'addSection', after: 0 })
    expect(chartOf(apply(two, { kind: 'removeSection', index: 0 }))).toHaveLength(1)
    const one = apply(two, { kind: 'removeSection', index: 0 })
    expect(chartOf(apply(one, { kind: 'removeSection', index: 0 }))).toHaveLength(1)
  })

  it('keeps the body exactly as typed', () => {
    const body = 'Em      D\nWe sail through  '
    const state = apply(initialState(), {
      kind: 'setSection',
      index: 0,
      section: { name: 'Verse 1', body },
    })
    expect(chartOf(state)[0]?.body).toBe(body)
  })

  it('moves the tab ahead of the chart and back', () => {
    const first = apply(initialState(), { kind: 'setTabFirst', tabFirst: true })
    expect(first.song.tabFirst).toBe(true)
    expect(apply(first, { kind: 'setTabFirst', tabFirst: false }).song.tabFirst).toBe(
      false,
    )
  })

  it('survives edits to the tab, and leaves the tab alone', () => {
    const state = run(
      initialState(),
      { kind: 'setTitle', title: 'Endless Skies' },
      digit(7),
    )
    expect(state.song.title).toBe('Endless Skies')
    expect(currentCell(state)).toEqual({ kind: 'fret', fret: 7 })
  })
})

describe('songHasContent', () => {
  it('is false for an untouched song', () => {
    expect(songHasContent(initialState().song)).toBe(false)
    expect(songHasContent(run(initialState(), { kind: 'addBar' }).song)).toBe(false)
  })

  it('is true once anything is typed', () => {
    const typed = (...actions: readonly Action[]): boolean =>
      songHasContent(run(initialState(), ...actions).song)
    expect(typed({ kind: 'setTitle', title: 'x' })).toBe(true)
    expect(typed({ kind: 'setTempo', tempo: '70 bpm' })).toBe(true)
    expect(typed({ kind: 'addSection', after: 0 })).toBe(true)
    expect(
      typed({ kind: 'setSection', index: 0, section: { name: 'Verse 1', body: 'Am' } }),
    ).toBe(true)
    expect(typed(digit(3))).toBe(true)
  })

  it('takes a loaded song whole, cursor and all', () => {
    const loaded = {
      ...initialState().song,
      title: 'Endless Skies',
      chart: [{ name: 'Intro', body: 'Am' }] as const,
    }
    const state = run(
      initialState(),
      digit(9),
      { kind: 'move', move: 'nextColumn' },
      { kind: 'load', song: loaded },
    )
    expect(state.song).toEqual(loaded)
    expect(state.cursor).toEqual({ row: 0, bar: 0, column: 0, slot: 0 })
  })

  it('resets the whole song but keeps the tuning', () => {
    const state = run(
      initialState(),
      { kind: 'retune', tuning: BASS },
      { kind: 'setTitle', title: 'Endless Skies' },
      digit(3),
      { kind: 'reset' },
    )
    expect(songHasContent(state.song)).toBe(false)
    expect(state.song.tab.tuning).toEqual(BASS)
  })
})

describe('what counts as content', () => {
  const oneRow = (row: Row): Score => ({
    ...emptyScore(),
    rows: [row, emptyRow(1, 4, 6)],
  })
  const chorded = (chord: string): Bar => ({
    columns: [{ cells: emptyCells(6), chord }],
  })

  it('warns before a bar of chord names goes', () => {
    const score = oneRow({ bars: [chorded('Cmaj7')] })
    expect(removeBarDropsContent(score, { row: 0, bar: 0 })).toBe(true)
  })

  it('warns before an empty last bar takes its row heading with it', () => {
    const titled = oneRow({ title: 'Main Riff', bars: [emptyBar(4, 6)] })
    expect(removeBarDropsContent(titled, { row: 0, bar: 0 })).toBe(true)
    const noted = oneRow({ note: 'let ring', bars: [emptyBar(4, 6)] })
    expect(removeBarDropsContent(noted, { row: 0, bar: 0 })).toBe(true)
  })

  it('stays quiet when the row has another bar to fall back on', () => {
    const spare = oneRow({ title: 'Main Riff', bars: [emptyBar(4, 6), emptyBar(4, 6)] })
    expect(removeBarDropsContent(spare, { row: 0, bar: 0 })).toBe(false)
  })

  it('warns before a titled row goes, even with nothing played in it', () => {
    expect(
      removeRowDropsContent(oneRow({ title: 'Main Riff', bars: [emptyBar(4, 6)] }), 0),
    ).toBe(true)
    expect(
      removeRowDropsContent(oneRow({ note: 'let ring', bars: [emptyBar(4, 6)] }), 0),
    ).toBe(true)
  })

  it('stays quiet for a bar and a row that hold nothing', () => {
    const empty = oneRow({ bars: [emptyBar(4, 6)] })
    expect(removeBarDropsContent(empty, { row: 0, bar: 0 })).toBe(false)
    expect(removeRowDropsContent(empty, 0)).toBe(false)
  })

  it('agrees with the Clear prompt about every one of those', () => {
    const cases: readonly Row[] = [
      { bars: [chorded('Cmaj7')] },
      { title: 'Main Riff', bars: [emptyBar(4, 6)] },
      { note: 'let ring', bars: [emptyBar(4, 6)] },
    ]
    for (const row of cases) {
      const score: Score = { ...emptyScore(), rows: [row] }
      expect(scoreHasContent(score)).toBe(true)
      expect(removeRowDropsContent(oneRow(row), 0)).toBe(true)
    }
  })
})
