import type { Bar, Cell, Column, Decoration, Score } from './model.ts'

const PAD = '-'
const DEFAULT_MAX_WIDTH = 80

const decorationText = (decoration: Decoration): string => {
  if (decoration.kind === '~') return '~'
  return decoration.to === undefined ? 'b' : `b${decoration.to}`
}

export const cellText = (cell: Cell | null | undefined): string => {
  if (cell === null || cell === undefined) return ''
  if (cell.kind === 'mute') return 'x'
  const decoration =
    cell.decoration === undefined ? '' : decorationText(cell.decoration)
  return `${cell.link ?? ''}${cell.fret}${decoration}`
}

type SizedColumn = { readonly column: Column; readonly width: number }

/**
 * Every column but the last carries one pad character beyond its widest cell.
 * That keeps digits in neighbouring columns apart (`2` then `2` reads `2-2`,
 * never `22`) while leaving an empty column a width of its own, so `2 _ 2` stays
 * distinguishable from `2 2` — the gap is what carries timing (§2). The last
 * column needs no pad because the bar line already separates it.
 */
const sizeColumns = (bar: Bar): readonly SizedColumn[] => {
  const last = bar.columns.length - 1
  return bar.columns.map((column, index) => ({
    column,
    width:
      Math.max(1, ...column.cells.map((cell) => cellText(cell).length)) +
      (index === last ? 0 : 1),
  }))
}

const barRow = (sized: readonly SizedColumn[], slot: number): string =>
  `${sized
    .map(({ column, width }) => cellText(column.cells[slot]).padEnd(width, PAD))
    .join('')}|`

const barWidth = (sized: readonly SizedColumn[]): number =>
  sized.reduce((total, { width }) => total + width, 0) + 1

type MeasuredBar = { readonly sized: readonly SizedColumn[] }

/**
 * Chord names sit under the staff and never widen a column: the widths carry
 * timing (§2), so a name longer than its column runs on into the space after
 * it instead. A following name is pushed right just far enough to keep one
 * space between the two, which is the only way two names can lose their column.
 */
const chordRow = (system: readonly MeasuredBar[]): string | null => {
  let line = ''
  let offset = 0
  let earliest = 0
  for (const { sized } of system) {
    for (const { column, width } of sized) {
      if (column.chord !== undefined && column.chord !== '') {
        line = line.padEnd(Math.max(offset, earliest)) + column.chord
        earliest = line.length + 1
      }
      offset += width
    }
    offset += 1
  }
  return line === '' ? null : line
}

const packSystems = (
  bars: readonly MeasuredBar[],
  available: number,
): readonly (readonly MeasuredBar[])[] => {
  const systems: MeasuredBar[][] = []
  let current: MeasuredBar[] = []
  let used = 0
  for (const bar of bars) {
    const width = barWidth(bar.sized)
    if (current.length > 0 && used + width > available) {
      systems.push(current)
      current = []
      used = 0
    }
    current.push(bar)
    used += width
  }
  if (current.length > 0) systems.push(current)
  return systems
}

export const renderScore = (
  score: Score,
  opts?: { maxWidth?: number },
): string => {
  const { strings } = score.tuning
  const labelWidth = Math.max(0, ...strings.map((label) => label.length))
  const available = (opts?.maxWidth ?? DEFAULT_MAX_WIDTH) - (labelWidth + 1)
  const bars = score.bars.map((bar) => ({ sized: sizeColumns(bar) }))
  return packSystems(bars, available)
    .map((system) => {
      const staff = strings.map(
        (label, slot) =>
          `${label.padEnd(labelWidth)}|${system
            .map(({ sized }) => barRow(sized, slot))
            .join('')}`,
      )
      const chords = chordRow(system)
      return (
        chords === null
          ? staff
          : [...staff, `${' '.repeat(labelWidth + 1)}${chords}`]
      ).join('\n')
    })
    .join('\n\n')
}
