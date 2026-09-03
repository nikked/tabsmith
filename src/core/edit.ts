import {
  emptyBar,
  emptyCells,
  emptyColumn,
  emptyRow,
  emptyScore,
  emptySection,
  emptySong,
  type Bar,
  type Cell,
  type Column,
  type Cursor,
  type EditorState,
  type Link,
  type Row,
  type Score,
  type Section,
  type Song,
  type Tuning,
} from './model.ts'

export const MAX_FRET = 24

export type Move =
  'prevColumn' | 'nextColumn' | 'stringUp' | 'stringDown' | 'prevBar' | 'nextBar'

export type Action =
  | { readonly kind: 'digit'; readonly digit: number }
  | { readonly kind: 'mute' }
  | { readonly kind: 'link'; readonly link: Link }
  | { readonly kind: 'bend' }
  | { readonly kind: 'vibrato' }
  | { readonly kind: 'clear' }
  | { readonly kind: 'move'; readonly move: Move }
  | { readonly kind: 'setCursor'; readonly cursor: Cursor }
  | {
      readonly kind: 'setChord'
      readonly row: number
      readonly bar: number
      readonly column: number
      readonly chord: string
    }
  | { readonly kind: 'addBar' }
  | { readonly kind: 'removeBar' }
  | {
      readonly kind: 'setRowHeading'
      readonly row: number
      readonly title: string
      readonly note: string
      readonly aside: string
    }
  | { readonly kind: 'addRow' }
  | { readonly kind: 'removeRow' }
  | { readonly kind: 'moveRow'; readonly index: number; readonly to: number }
  | { readonly kind: 'addColumn' }
  | { readonly kind: 'removeColumn' }
  | { readonly kind: 'retune'; readonly tuning: Tuning }
  | { readonly kind: 'reset' }
  | { readonly kind: 'load'; readonly song: Song }
  | { readonly kind: 'setTitle'; readonly title: string }
  | { readonly kind: 'setTempo'; readonly tempo: string }
  | { readonly kind: 'addSection'; readonly after: number }
  | { readonly kind: 'removeSection'; readonly index: number }
  | {
      readonly kind: 'moveSection'
      readonly index: number
      readonly to: number
    }
  | {
      readonly kind: 'setSection'
      readonly index: number
      readonly section: Section
    }
  | { readonly kind: 'setTabFirst'; readonly tabFirst: boolean }

export const initialState = (song: Song | null = null): EditorState => ({
  song: song ?? emptySong(),
  cursor: { row: 0, bar: 0, column: 0, slot: 0 },
  digitPending: false,
  digitTarget: 'fret',
})

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const stringCount = (score: Score): number => score.tuning.strings.length

type BarRef = { readonly row: number; readonly bar: number }

const barAt = (score: Score, row: number, bar: number): Bar | undefined =>
  score.rows[row]?.bars[bar]

const allBars = (score: Score): readonly Bar[] => score.rows.flatMap((row) => row.bars)

/**
 * One definition of what counts as work, so the Clear prompt and the delete
 * prompts cannot drift apart about it. A chord name is as much typing as a
 * note, and a row's heading belongs to the row that carries it.
 */
const columnHasContent = (column: Column): boolean =>
  column.chord !== undefined || column.cells.some((cell) => cell !== null)

const barHasContent = (bar: Bar): boolean => bar.columns.some(columnHasContent)

const rowHasHeading = (row: Row): boolean =>
  row.title !== undefined || row.note !== undefined || row.aside !== undefined

const rowHasContent = (row: Row): boolean =>
  rowHasHeading(row) || row.bars.some(barHasContent)

const barCount = (score: Score, row: number): number => score.rows[row]?.bars.length ?? 0

const columnCount = (score: Score, row: number, bar: number): number =>
  barAt(score, row, bar)?.columns.length ?? 0

const cellAt = (score: Score, cursor: Cursor): Cell | null =>
  barAt(score, cursor.row, cursor.bar)?.columns[cursor.column]?.cells[cursor.slot] ?? null

const fretCellAt = (
  score: Score,
  cursor: Cursor,
): Extract<Cell, { kind: 'fret' }> | null => {
  const cell = cellAt(score, cursor)
  return cell !== null && cell.kind === 'fret' ? cell : null
}

const mapRow = (score: Score, index: number, f: (row: Row) => Row): Score => ({
  ...score,
  rows: score.rows.map((row, i) => (i === index ? f(row) : row)),
})

const mapBar = (score: Score, at: BarRef, f: (bar: Bar) => Bar): Score =>
  mapRow(score, at.row, (row) => ({
    ...row,
    bars: row.bars.map((bar, i) => (i === at.bar ? f(bar) : bar)),
  }))

const setCell = (score: Score, cursor: Cursor, cell: Cell | null): Score =>
  mapBar(score, cursor, (bar) => ({
    columns: bar.columns.map((column, c) =>
      c === cursor.column
        ? {
            ...column,
            cells: column.cells.map((existing, s) =>
              s === cursor.slot ? cell : existing,
            ),
          }
        : column,
    ),
  }))

/** An emptied field leaves nothing behind, so it never reaches the ASCII. */
const withHeading = (row: Row, title: string, note: string, aside: string): Row => ({
  ...(title === '' ? {} : { title }),
  ...(note === '' ? {} : { note }),
  ...(aside === '' ? {} : { aside }),
  bars: row.bars,
})

/** An emptied field leaves no chord behind, so it never reaches the ASCII. */
const withChord = (column: Column, chord: string): Column =>
  chord === '' ? { cells: column.cells } : { ...column, chord }

const resetDigits = (state: EditorState): EditorState => ({
  ...state,
  digitPending: false,
  digitTarget: 'fret',
})

const extend = (current: number | undefined, digit: number): number => {
  if (current === undefined) return digit
  const appended = current * 10 + digit
  return appended <= MAX_FRET ? appended : digit
}

/**
 * Bars read left to right within a row and then on into the next one, so one
 * step off either end of a row lands in its neighbour. Null at the two ends of
 * the score, where there is nowhere to go.
 */
const stepBar = (score: Score, cursor: Cursor, delta: 1 | -1): Cursor | null => {
  const bar = cursor.bar + delta
  if (bar >= 0 && bar < barCount(score, cursor.row)) return { ...cursor, bar }
  const row = cursor.row + delta
  if (row < 0 || row >= score.rows.length) return null
  return {
    ...cursor,
    row,
    bar: delta === 1 ? 0 : Math.max(0, barCount(score, row) - 1),
  }
}

const lastColumn = (score: Score, cursor: Cursor): Cursor => ({
  ...cursor,
  column: Math.max(0, columnCount(score, cursor.row, cursor.bar) - 1),
})

const moveCursor = (score: Score, cursor: Cursor, move: Move): Cursor => {
  switch (move) {
    case 'prevColumn': {
      if (cursor.column > 0) return { ...cursor, column: cursor.column - 1 }
      const previous = stepBar(score, cursor, -1)
      return previous === null ? cursor : lastColumn(score, previous)
    }
    case 'nextColumn': {
      if (cursor.column < columnCount(score, cursor.row, cursor.bar) - 1) {
        return { ...cursor, column: cursor.column + 1 }
      }
      const next = stepBar(score, cursor, 1)
      return next === null ? cursor : { ...next, column: 0 }
    }
    case 'stringUp':
      return { ...cursor, slot: Math.max(0, cursor.slot - 1) }
    case 'stringDown':
      return { ...cursor, slot: Math.min(stringCount(score) - 1, cursor.slot + 1) }
    case 'prevBar': {
      const previous = stepBar(score, cursor, -1)
      return previous === null ? cursor : { ...previous, column: 0 }
    }
    case 'nextBar': {
      const next = stepBar(score, cursor, 1)
      return next === null ? cursor : { ...next, column: 0 }
    }
  }
}

const clampCursor = (score: Score, cursor: Cursor): Cursor => {
  const row = clamp(cursor.row, 0, score.rows.length - 1)
  const bar = clamp(cursor.bar, 0, barCount(score, row) - 1)
  return {
    row,
    bar,
    column: clamp(cursor.column, 0, columnCount(score, row, bar) - 1),
    slot: clamp(cursor.slot, 0, stringCount(score) - 1),
  }
}

export const retune = (score: Score, tuning: Tuning): Score => {
  const from = stringCount(score)
  const to = tuning.strings.length
  if (from === to) return { ...score, tuning }
  const resize = (column: Column): Column => ({
    ...column,
    cells:
      to < from
        ? column.cells.slice(from - to)
        : [...emptyCells(to - from), ...column.cells],
  })
  return {
    ...score,
    tuning,
    rows: score.rows.map((row) => ({
      ...row,
      bars: row.bars.map((bar) => ({ columns: bar.columns.map(resize) })),
    })),
  }
}

/** Empty bars are not work, so clearing a score that holds none loses nothing. */
export const scoreHasContent = (score: Score): boolean => score.rows.some(rowHasContent)

/**
 * The last bar of a row takes the row with it, and the row's heading goes too —
 * so an empty bar is still worth asking about when it is the last one its row
 * has. Only the score's last bar is safe, because the reducer refuses that one.
 */
export const removeBarDropsContent = (score: Score, at: BarRef): boolean => {
  const row = score.rows[at.row]
  const bar = row?.bars[at.bar]
  if (allBars(score).length <= 1 || row === undefined || bar === undefined) return false
  return barHasContent(bar) || (row.bars.length === 1 && rowHasHeading(row))
}

export const removeRowDropsContent = (score: Score, row: number): boolean => {
  const target = score.rows[row]
  return score.rows.length > 1 && target !== undefined && rowHasContent(target)
}

/**
 * Tab steps between bars, which means the staff swallows the key. At either end
 * of the score there is no bar to step to, so the UI can let the browser have
 * it back and focus can leave the tab the way it leaves anything else.
 */
export const atFirstBar = (score: Score, cursor: Cursor): boolean =>
  stepBar(score, cursor, -1) === null

export const atLastBar = (score: Score, cursor: Cursor): boolean =>
  stepBar(score, cursor, 1) === null

export const retuneDropsNotes = (score: Score, tuning: Tuning): boolean => {
  const dropped = stringCount(score) - tuning.strings.length
  if (dropped <= 0) return false
  return allBars(score).some((bar) =>
    bar.columns.some((column) =>
      column.cells.slice(0, dropped).some((cell) => cell !== null),
    ),
  )
}

const defaultChart = (chart: readonly Section[]): boolean => {
  const blank = emptySong().chart
  return (
    chart.length === blank.length &&
    chart.every(
      (section, i) =>
        section.name === blank[i]?.name &&
        section.body === '' &&
        section.repeat === undefined,
    )
  )
}

/** Untouched headings are not work, so clearing a song that holds none loses nothing. */
export const songHasContent = (song: Song): boolean =>
  song.title !== '' ||
  song.tempo !== '' ||
  !defaultChart(song.chart) ||
  scoreHasContent(song.tab)

const withTab = (state: EditorState, tab: Score): EditorState => ({
  ...state,
  song: { ...state.song, tab },
})

const withChart = (state: EditorState, chart: readonly Section[]): EditorState => ({
  ...state,
  song: { ...state.song, chart },
})

const applyDigit = (state: EditorState, digit: number): EditorState => {
  const cell = fretCellAt(state.song.tab, state.cursor)
  const decoration = cell?.decoration

  if (state.digitTarget === 'bend' && cell !== null && decoration?.kind === 'b') {
    const to = extend(state.digitPending ? decoration.to : undefined, digit)
    return {
      ...withTab(
        state,
        setCell(state.song.tab, state.cursor, {
          ...cell,
          decoration: { kind: 'b', to },
        }),
      ),
      digitPending: true,
    }
  }

  const fret = extend(state.digitPending && cell !== null ? cell.fret : undefined, digit)
  return {
    ...withTab(
      state,
      setCell(
        state.song.tab,
        state.cursor,
        cell === null ? { kind: 'fret', fret } : { ...cell, fret },
      ),
    ),
    digitPending: true,
    digitTarget: 'fret',
  }
}

export const apply = (state: EditorState, action: Action): EditorState => {
  switch (action.kind) {
    case 'digit':
      return applyDigit(state, action.digit)

    case 'mute':
      return resetDigits(
        withTab(state, setCell(state.song.tab, state.cursor, { kind: 'mute' })),
      )

    case 'link': {
      const cell = fretCellAt(state.song.tab, state.cursor)
      if (cell === null) return state
      return resetDigits(
        withTab(
          state,
          setCell(state.song.tab, state.cursor, { ...cell, link: action.link }),
        ),
      )
    }

    case 'bend': {
      const cell = fretCellAt(state.song.tab, state.cursor)
      if (cell === null) return state
      return {
        ...withTab(
          state,
          setCell(state.song.tab, state.cursor, {
            ...cell,
            decoration: { kind: 'b' },
          }),
        ),
        digitPending: false,
        digitTarget: 'bend',
      }
    }

    case 'vibrato': {
      const cell = fretCellAt(state.song.tab, state.cursor)
      if (cell === null) return state
      return resetDigits(
        withTab(
          state,
          setCell(state.song.tab, state.cursor, {
            ...cell,
            decoration: { kind: '~' },
          }),
        ),
      )
    }

    case 'clear':
      return resetDigits(withTab(state, setCell(state.song.tab, state.cursor, null)))

    case 'move':
      return resetDigits({
        ...state,
        cursor: moveCursor(state.song.tab, state.cursor, action.move),
      })

    case 'setCursor':
      return resetDigits({ ...state, cursor: clampCursor(state.song.tab, action.cursor) })

    case 'setChord':
      return resetDigits(
        withTab(
          state,
          mapBar(state.song.tab, action, (bar) => ({
            columns: bar.columns.map((column, index) =>
              index === action.column ? withChord(column, action.chord) : column,
            ),
          })),
        ),
      )

    case 'setRowHeading':
      return resetDigits(
        withTab(
          state,
          mapRow(state.song.tab, action.row, (row) =>
            withHeading(row, action.title, action.note, action.aside),
          ),
        ),
      )

    case 'addBar': {
      const bar = state.cursor.bar + 1
      return resetDigits({
        ...withTab(
          state,
          mapRow(state.song.tab, state.cursor.row, (row) => ({
            ...row,
            bars: [
              ...row.bars.slice(0, bar),
              emptyBar(state.song.tab.defaultBarColumns, stringCount(state.song.tab)),
              ...row.bars.slice(bar),
            ],
          })),
        ),
        cursor: { ...state.cursor, bar, column: 0 },
      })
    }

    case 'removeBar': {
      if (allBars(state.song.tab).length <= 1) return resetDigits(state)
      const { row, bar } = state.cursor
      const bars = (state.song.tab.rows[row]?.bars ?? []).filter(
        (_, index) => index !== bar,
      )
      const score =
        bars.length === 0
          ? {
              ...state.song.tab,
              rows: state.song.tab.rows.filter((_, index) => index !== row),
            }
          : mapRow(state.song.tab, row, (existing) => ({ ...existing, bars }))
      return resetDigits({
        ...withTab(state, score),
        cursor: clampCursor(score, state.cursor),
      })
    }

    case 'addRow': {
      const row = state.cursor.row + 1
      const rows = [
        ...state.song.tab.rows.slice(0, row),
        emptyRow(1, state.song.tab.defaultBarColumns, stringCount(state.song.tab)),
        ...state.song.tab.rows.slice(row),
      ]
      return resetDigits({
        ...withTab(state, { ...state.song.tab, rows }),
        cursor: { ...state.cursor, row, bar: 0, column: 0 },
      })
    }

    case 'removeRow': {
      if (state.song.tab.rows.length <= 1) return resetDigits(state)
      const score = {
        ...state.song.tab,
        rows: state.song.tab.rows.filter((_, index) => index !== state.cursor.row),
      }
      return resetDigits({
        ...withTab(state, score),
        cursor: clampCursor(score, state.cursor),
      })
    }

    // Lifted out and put back at an index, like a section. The cursor stays in
    // the row it was in, wherever that row ends up, so a drag never leaves you
    // editing bars you did not touch.
    case 'moveRow': {
      const { rows } = state.song.tab
      const moved = rows[action.index]
      if (moved === undefined || action.to < 0 || action.to >= rows.length) return state
      if (action.to === action.index) return state
      const rest = rows.filter((_, index) => index !== action.index)
      const reordered = [...rest.slice(0, action.to), moved, ...rest.slice(action.to)]
      const editing = rows[state.cursor.row]
      return resetDigits({
        ...withTab(state, { ...state.song.tab, rows: reordered }),
        cursor: {
          ...state.cursor,
          row: editing === undefined ? state.cursor.row : reordered.indexOf(editing),
        },
      })
    }

    case 'addColumn': {
      const column = state.cursor.column + 1
      return resetDigits({
        ...withTab(
          state,
          mapBar(state.song.tab, state.cursor, (bar) => ({
            columns: [
              ...bar.columns.slice(0, column),
              emptyColumn(stringCount(state.song.tab)),
              ...bar.columns.slice(column),
            ],
          })),
        ),
        cursor: { ...state.cursor, column },
      })
    }

    /**
     * The column under the cursor, not the bar's last one: a column is added
     * where you are, so it has to be removable where you are too. Refused
     * rather than confirmed when it holds anything, which is what keeps `[`
     * safe to lean on.
     */
    case 'removeColumn': {
      const bar = barAt(state.song.tab, state.cursor.row, state.cursor.bar)
      const at = bar?.columns[state.cursor.column]
      if (bar === undefined || at === undefined || bar.columns.length <= 1) {
        return resetDigits(state)
      }
      if (columnHasContent(at)) return resetDigits(state)
      const columns = bar.columns.filter((_, index) => index !== state.cursor.column)
      return resetDigits({
        ...withTab(
          state,
          mapBar(state.song.tab, state.cursor, () => ({ columns })),
        ),
        cursor: {
          ...state.cursor,
          column: Math.min(state.cursor.column, columns.length - 1),
        },
      })
    }

    case 'load':
      return initialState(action.song)

    case 'reset':
      return initialState({
        ...emptySong(),
        tab: retune(emptyScore(), state.song.tab.tuning),
      })

    case 'retune': {
      const shift = stringCount(state.song.tab) - action.tuning.strings.length
      const score = retune(state.song.tab, action.tuning)
      return resetDigits({
        ...withTab(state, score),
        cursor: clampCursor(score, {
          ...state.cursor,
          slot: state.cursor.slot - shift,
        }),
      })
    }

    case 'setTitle':
      return { ...state, song: { ...state.song, title: action.title } }

    case 'setTempo':
      return { ...state, song: { ...state.song, tempo: action.tempo } }

    case 'setTabFirst':
      return { ...state, song: { ...state.song, tabFirst: action.tabFirst } }

    case 'addSection': {
      const at = action.after + 1
      return withChart(state, [
        ...state.song.chart.slice(0, at),
        emptySection(''),
        ...state.song.chart.slice(at),
      ])
    }

    case 'removeSection':
      return state.song.chart.length <= 1
        ? state
        : withChart(
            state,
            state.song.chart.filter((_, index) => index !== action.index),
          )

    /**
     * Lifted out and put back down, not swapped with its neighbour, so the
     * action says where a section ends up rather than which way it stepped.
     * Out-of-range is a no-op: the ends of the chart are where the buttons are
     * disabled, and the reducer agrees rather than wrapping around.
     */
    case 'moveSection': {
      const { chart } = state.song
      const moved = chart[action.index]
      if (moved === undefined || action.to < 0 || action.to >= chart.length) return state
      if (action.to === action.index) return state
      const rest = chart.filter((_, index) => index !== action.index)
      return withChart(state, [
        ...rest.slice(0, action.to),
        moved,
        ...rest.slice(action.to),
      ])
    }

    case 'setSection':
      return withChart(
        state,
        state.song.chart.map((section, index) =>
          index === action.index ? action.section : section,
        ),
      )
  }
}

/**
 * Undo is a list of past states, which is all the immutable model needs it to
 * be: nothing is edited in place, so keeping the state from before an action is
 * keeping the whole document. `future` is what undo has taken away, and any new
 * edit drops it — a branch you cannot get back to is not worth carrying.
 */
export type Timeline = {
  readonly present: EditorState
  readonly past: readonly EditorState[]
  readonly future: readonly EditorState[]
  readonly typing: string | null
}

export type TimelineAction =
  Action | { readonly kind: 'undo' } | { readonly kind: 'redo' }

/** Deep enough that the end is never in sight, short enough to stay bounded. */
const HISTORY = 100

/**
 * Which field a text edit is going into. A run of keystrokes in one of them
 * collapses to a single step, so undoing a chord name does not walk back
 * through it a letter at a time. Null for everything else, where each action is
 * its own step.
 */
const typingIn = (action: Action): string | null => {
  switch (action.kind) {
    case 'setTitle':
      return 'title'
    case 'setTempo':
      return 'tempo'
    case 'setChord':
      return `chord:${action.row}:${action.bar}:${action.column}`
    case 'setRowHeading':
      return `heading:${action.row}`
    case 'setSection':
      return `section:${action.index}`
    default:
      return null
  }
}

export const initialTimeline = (song: Song | null = null): Timeline => ({
  present: initialState(song),
  past: [],
  future: [],
  typing: null,
})

export const canUndo = (timeline: Timeline): boolean => timeline.past.length > 0
export const canRedo = (timeline: Timeline): boolean => timeline.future.length > 0

export const step = (timeline: Timeline, action: TimelineAction): Timeline => {
  // A load changes which song the shelf will save, so its history cannot cross over.
  if (action.kind === 'load') return initialTimeline(action.song)

  if (action.kind === 'undo') {
    const previous = timeline.past.at(-1)
    if (previous === undefined) return timeline
    return {
      present: previous,
      past: timeline.past.slice(0, -1),
      future: [timeline.present, ...timeline.future],
      typing: null,
    }
  }

  if (action.kind === 'redo') {
    const [next, ...rest] = timeline.future
    if (next === undefined) return timeline
    return {
      present: next,
      past: [...timeline.past, timeline.present],
      future: rest,
      typing: null,
    }
  }

  const present = apply(timeline.present, action)
  const typing = typingIn(action)
  // A cursor move is not an edit, and neither is an action the reducer refused,
  // so neither leaves a step to undo back to.
  if (present.song === timeline.present.song) {
    return { ...timeline, present, typing }
  }
  return {
    present,
    past:
      typing !== null && typing === timeline.typing
        ? timeline.past
        : [...timeline.past, timeline.present].slice(-HISTORY),
    future: [],
    typing,
  }
}
