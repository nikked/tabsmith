import type { Row } from './model.ts'
import { columnPitches } from './notation.ts'

/**
 * A tab row played the way the notation reads it: each column an eighth note
 * at the bpm, and a note lasting until the next one or the bar line.
 */
export type Played = {
  readonly midi: readonly number[]
  /** Seconds from the start of the row. */
  readonly at: number
  readonly seconds: number
}

export const rowPlayback = (
  row: Row,
  open: readonly number[],
  bpm: number,
): readonly Played[] => {
  const eighth = 30 / bpm
  const starts = row.bars.reduce<readonly number[]>(
    (at, bar) => [...at, (at.at(-1) ?? 0) + bar.columns.length],
    [0],
  )
  return row.bars.flatMap((bar, b) => {
    const start = starts[b] ?? 0
    const notes = bar.columns.flatMap((column, at) => {
      const midi = columnPitches(column, open)
      return midi.length === 0 ? [] : [{ midi, at }]
    })
    return notes.map(({ midi, at }, i) => ({
      midi,
      at: (start + at) * eighth,
      seconds: ((notes[i + 1]?.at ?? bar.columns.length) - at) * eighth,
    }))
  })
}

/** How long a row takes to play: every column of it, silent ones too. */
export const rowSeconds = (row: Row, bpm: number): number =>
  (row.bars.reduce((sum, bar) => sum + bar.columns.length, 0) * 30) / bpm
