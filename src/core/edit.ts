import {
  emptyBar,
  emptyColumn,
  emptyScore,
  type Bar,
  type Cell,
  type Column,
  type Cursor,
  type EditorState,
  type Link,
  type Score,
  type Tuning,
} from './model.ts'

const MAX_FRET = 24

export type Move =
  | 'prevColumn'
  | 'nextColumn'
  | 'stringUp'
  | 'stringDown'
  | 'barStart'
  | 'barEnd'
  | 'prevBar'
  | 'nextBar'

export type Action =
  | { readonly kind: 'digit'; readonly digit: number }
  | { readonly kind: 'mute' }
  | { readonly kind: 'link'; readonly link: Link }
  | { readonly kind: 'bend' }
  | { readonly kind: 'vibrato' }
  | { readonly kind: 'clear' }
  | { readonly kind: 'move'; readonly move: Move }
  | { readonly kind: 'setCursor'; readonly cursor: Cursor }
  | { readonly kind: 'addBar' }
  | { readonly kind: 'addColumn' }
  | { readonly kind: 'removeColumn' }
  | { readonly kind: 'retune'; readonly tuning: Tuning }

export const initialState = (): EditorState => ({
  score: emptyScore(),
  cursor: { bar: 0, column: 0, slot: 0 },
  digitPending: false,
  digitTarget: 'fret',
})

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

const stringCount = (score: Score): number => score.tuning.strings.length

const columnCount = (score: Score, bar: number): number =>
  score.bars[bar]?.columns.length ?? 0

const cellAt = (score: Score, cursor: Cursor): Cell | null =>
  score.bars[cursor.bar]?.columns[cursor.column]?.[cursor.slot] ?? null

const fretCellAt = (
  score: Score,
  cursor: Cursor,
): Extract<Cell, { kind: 'fret' }> | null => {
  const cell = cellAt(score, cursor)
  return cell !== null && cell.kind === 'fret' ? cell : null
}

const mapBar = (score: Score, index: number, f: (bar: Bar) => Bar): Score => ({
  ...score,
  bars: score.bars.map((bar, i) => (i === index ? f(bar) : bar)),
})

const setCell = (score: Score, cursor: Cursor, cell: Cell | null): Score =>
  mapBar(score, cursor.bar, (bar) => ({
    columns: bar.columns.map((column, c) =>
      c === cursor.column
        ? column.map((existing, s) => (s === cursor.slot ? cell : existing))
        : column,
    ),
  }))

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

const moveCursor = (score: Score, cursor: Cursor, move: Move): Cursor => {
  switch (move) {
    case 'prevColumn':
      if (cursor.column > 0) return { ...cursor, column: cursor.column - 1 }
      if (cursor.bar > 0) {
        const bar = cursor.bar - 1
        return { ...cursor, bar, column: Math.max(0, columnCount(score, bar) - 1) }
      }
      return cursor
    case 'nextColumn':
      if (cursor.column < columnCount(score, cursor.bar) - 1) {
        return { ...cursor, column: cursor.column + 1 }
      }
      if (cursor.bar < score.bars.length - 1) {
        return { ...cursor, bar: cursor.bar + 1, column: 0 }
      }
      return cursor
    case 'stringUp':
      return { ...cursor, slot: Math.max(0, cursor.slot - 1) }
    case 'stringDown':
      return { ...cursor, slot: Math.min(stringCount(score) - 1, cursor.slot + 1) }
    case 'barStart':
      return { ...cursor, column: 0 }
    case 'barEnd':
      return { ...cursor, column: Math.max(0, columnCount(score, cursor.bar) - 1) }
    case 'prevBar':
      return cursor.bar > 0 ? { ...cursor, bar: cursor.bar - 1, column: 0 } : cursor
    case 'nextBar':
      return cursor.bar < score.bars.length - 1
        ? { ...cursor, bar: cursor.bar + 1, column: 0 }
        : cursor
  }
}

const clampCursor = (score: Score, cursor: Cursor): Cursor => {
  const bar = clamp(cursor.bar, 0, score.bars.length - 1)
  return {
    bar,
    column: clamp(cursor.column, 0, columnCount(score, bar) - 1),
    slot: clamp(cursor.slot, 0, stringCount(score) - 1),
  }
}

export const retune = (score: Score, tuning: Tuning): Score => {
  const from = stringCount(score)
  const to = tuning.strings.length
  if (from === to) return { ...score, tuning }
  const resize = (column: Column): Column =>
    to < from ? column.slice(from - to) : [...emptyColumn(to - from), ...column]
  return {
    ...score,
    tuning,
    bars: score.bars.map((bar) => ({ columns: bar.columns.map(resize) })),
  }
}

export const retuneDropsNotes = (score: Score, tuning: Tuning): boolean => {
  const dropped = stringCount(score) - tuning.strings.length
  if (dropped <= 0) return false
  return score.bars.some((bar) =>
    bar.columns.some((column) =>
      column.slice(0, dropped).some((cell) => cell !== null),
    ),
  )
}

const applyDigit = (state: EditorState, digit: number): EditorState => {
  const cell = fretCellAt(state.score, state.cursor)
  const decoration = cell?.decoration

  if (state.digitTarget === 'bend' && cell !== null && decoration?.kind === 'b') {
    const to = extend(state.digitPending ? decoration.to : undefined, digit)
    return {
      ...state,
      score: setCell(state.score, state.cursor, {
        ...cell,
        decoration: { kind: 'b', to },
      }),
      digitPending: true,
    }
  }

  const fret = extend(state.digitPending && cell !== null ? cell.fret : undefined, digit)
  return {
    ...state,
    score: setCell(
      state.score,
      state.cursor,
      cell === null ? { kind: 'fret', fret } : { ...cell, fret },
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
      return resetDigits({
        ...state,
        score: setCell(state.score, state.cursor, { kind: 'mute' }),
      })

    case 'link': {
      const cell = fretCellAt(state.score, state.cursor)
      if (cell === null) return state
      return resetDigits({
        ...state,
        score: setCell(state.score, state.cursor, { ...cell, link: action.link }),
      })
    }

    case 'bend': {
      const cell = fretCellAt(state.score, state.cursor)
      if (cell === null) return state
      return {
        ...state,
        score: setCell(state.score, state.cursor, {
          ...cell,
          decoration: { kind: 'b' },
        }),
        digitPending: false,
        digitTarget: 'bend',
      }
    }

    case 'vibrato': {
      const cell = fretCellAt(state.score, state.cursor)
      if (cell === null) return state
      return resetDigits({
        ...state,
        score: setCell(state.score, state.cursor, {
          ...cell,
          decoration: { kind: '~' },
        }),
      })
    }

    case 'clear':
      return resetDigits({ ...state, score: setCell(state.score, state.cursor, null) })

    case 'move':
      return resetDigits({
        ...state,
        cursor: moveCursor(state.score, state.cursor, action.move),
      })

    case 'setCursor':
      return resetDigits({ ...state, cursor: clampCursor(state.score, action.cursor) })

    case 'addBar': {
      const bar = state.cursor.bar + 1
      const bars = [
        ...state.score.bars.slice(0, bar),
        emptyBar(state.score.defaultBarColumns, stringCount(state.score)),
        ...state.score.bars.slice(bar),
      ]
      return resetDigits({
        ...state,
        score: { ...state.score, bars },
        cursor: { ...state.cursor, bar, column: 0 },
      })
    }

    case 'addColumn':
      return resetDigits({
        ...state,
        score: mapBar(state.score, state.cursor.bar, (bar) => ({
          columns: [...bar.columns, emptyColumn(stringCount(state.score))],
        })),
      })

    case 'removeColumn': {
      const bar = state.score.bars[state.cursor.bar]
      const last = bar?.columns.at(-1)
      if (bar === undefined || last === undefined || bar.columns.length <= 1) {
        return resetDigits(state)
      }
      if (last.some((cell) => cell !== null)) return resetDigits(state)
      const columns = bar.columns.slice(0, -1)
      return resetDigits({
        ...state,
        score: mapBar(state.score, state.cursor.bar, () => ({ columns })),
        cursor: {
          ...state.cursor,
          column: Math.min(state.cursor.column, columns.length - 1),
        },
      })
    }

    case 'retune': {
      const shift = stringCount(state.score) - action.tuning.strings.length
      const score = retune(state.score, action.tuning)
      return resetDigits({
        ...state,
        score,
        cursor: clampCursor(score, {
          ...state.cursor,
          slot: state.cursor.slot - shift,
        }),
      })
    }
  }
}
