import type { Bar, Cell, Column, Decoration, Row, Score, Section, Song } from './model.ts'

const PAD = '-'

const decorationText = (decoration: Decoration): string => {
  if (decoration.kind === '~') return '~'
  return decoration.to === undefined ? 'b' : `b${decoration.to}`
}

export const cellText = (cell: Cell | null | undefined): string => {
  if (cell === null || cell === undefined) return ''
  if (cell.kind === 'mute') return 'x'
  const decoration = cell.decoration === undefined ? '' : decorationText(cell.decoration)
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

/**
 * A row's name is bracketed the way a section's is; the note under it is
 * written as typed, so it can be an aside, a tempo mark or a fingering hint
 * rather than only a parenthetical. Both sit at the left margin, because they
 * title the whole row rather than any string in it.
 */
const rowHeading = (row: Row): readonly string[] =>
  [
    row.title === undefined || row.title === '' ? '' : `[${row.title}]`,
    row.note ?? '',
  ].filter((line) => line !== '')

/**
 * One string per system. A system is the unit that must not be broken across a
 * page, so the caller needs them apart before it can say so.
 */
export const renderSystems = (score: Score): readonly string[] => {
  const { strings } = score.tuning
  const labelWidth = Math.max(0, ...strings.map((label) => label.length))
  return score.rows.map((row) => {
    const system: readonly MeasuredBar[] = row.bars.map((bar) => ({
      sized: sizeColumns(bar),
    }))
    const staff = strings.map(
      (label, slot) =>
        `${label.padEnd(labelWidth)}|${system
          .map(({ sized }) => barRow(sized, slot))
          .join('')}`,
    )
    const chords = chordRow(system)
    return [
      ...rowHeading(row),
      ...staff,
      ...(chords === null ? [] : [`${' '.repeat(labelWidth + 1)}${chords}`]),
    ].join('\n')
  })
}

export const renderScore = (score: Score): string => renderSystems(score).join('\n\n')

/**
 * An unnamed section is just a block of chords, so it gets no empty brackets,
 * and playing something once is not a repeat.
 */
const sectionText = (section: Section): string => {
  const repeat =
    section.repeat === undefined || section.repeat < 2 ? '' : ` (x${section.repeat})`
  const heading = section.name === '' ? '' : `[${section.name}]${repeat}`
  return [heading, section.body].filter((line) => line !== '').join('\n')
}

/**
 * Everything but the tab is written out as typed. The chart carries chords over
 * lyrics by the spaces the writer put there, so reflowing or trimming it would
 * destroy the only thing holding a chord above its word.
 */
/**
 * The song as the blocks a blank line separates: the header lines, each section,
 * and each system of the tab. Printing needs them apart, because a staff split
 * down the middle by a page break is unreadable; everything else joins them
 * back up.
 */
export const songBlocks = (song: Song): readonly string[] => {
  const header = [song.title, song.tempo]
  const chart = song.chart.map(sectionText)
  const tab = renderSystems(song.tab)
  const parts = song.tabFirst
    ? [...header, ...tab, ...chart]
    : [...header, ...chart, ...tab]
  // A section with neither a name nor a body would otherwise print as a gap.
  return parts.filter((part) => part !== '')
}

export const renderSong = (song: Song): string => songBlocks(song).join('\n\n')
