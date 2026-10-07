import { scoreHasContent } from './edit.ts'
import type {
  Bar,
  Cell,
  Column,
  Decoration,
  Row,
  Score,
  Section,
  Song,
  Spacing,
} from './model.ts'

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
 * Every column but the last carries a pad beyond its widest cell: one character
 * dense, two sparse.
 * That keeps digits in neighbouring columns apart (`2` then `2` reads `2-2`,
 * never `22`) while leaving an empty column a width of its own, so `2 _ 2` stays
 * distinguishable from `2 2` — the gap is what carries timing (§2). The last
 * column needs no pad because the bar line already separates it.
 */
const sizeColumns = (bar: Bar, spacing: Spacing): readonly SizedColumn[] => {
  const last = bar.columns.length - 1
  const pad = spacing === 'sparse' ? 2 : 1
  return bar.columns.map((column, index) => ({
    column,
    width:
      Math.max(1, ...column.cells.map((cell) => cellText(cell).length)) +
      (index === last ? 0 : pad),
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
 * An aside belongs to the bars rather than naming them, so it hangs off the
 * closing bar line instead of sitting above the staff where a title goes:
 * `x2 for Intro` is an instruction for these bars, not what they are called.
 * One of its lines per string, top down, and anything past the last string
 * carries on in the same column so nothing typed is dropped.
 */
const withAside = (
  staff: readonly string[],
  aside: string | undefined,
): readonly string[] => {
  if (aside === undefined || aside === '') return staff
  const lines = aside.split('\n')
  const margin = ' '.repeat(staff[0]?.length ?? 0)
  return [
    ...staff.map((line, slot) => {
      const text = lines[slot]
      return text === undefined || text === '' ? line : `${line} ${text}`
    }),
    ...lines
      .slice(staff.length)
      .filter((text) => text !== '')
      .map((text) => `${margin} ${text}`),
  ]
}

/** A bar's width in characters, its closing bar line included. */
const barWidth = ({ sized }: MeasuredBar): number =>
  sized.reduce((sum, { width }) => sum + width, 0) + 1

/**
 * Bars in order, broken into lines of at most `width` characters with the
 * string labels counted in. A break only ever falls at a bar line, and a bar
 * wider than the line gets a line to itself rather than being cut.
 */
const wrapBars = (
  bars: readonly MeasuredBar[],
  labelWidth: number,
  width: number,
): readonly (readonly MeasuredBar[])[] => {
  const start = labelWidth + 1
  const lines: MeasuredBar[][] = []
  let used = start
  for (const bar of bars) {
    const current = lines.at(-1)
    if (current === undefined || used + barWidth(bar) > width) {
      lines.push([bar])
      used = start + barWidth(bar)
    } else {
      current.push(bar)
      used += barWidth(bar)
    }
  }
  return lines
}

/**
 * A row's staff, its aside and the chord names under it: everything but its
 * heading. Given a width, the staff is broken at bar lines into as many lines
 * as fit, each with its own string labels and the chord names of its own bars,
 * so a narrow screen shows the next bars under the first rather than cutting
 * them off. The aside belongs to the closing bar line, so it goes with the last.
 */
export const staffText = (
  score: Score,
  row: Row,
  spacing: Spacing = 'dense',
  width = Infinity,
): string => {
  const { strings } = score.tuning
  const labelWidth = Math.max(0, ...strings.map((label) => label.length))
  const bars: readonly MeasuredBar[] = row.bars.map((bar) => ({
    sized: sizeColumns(bar, spacing),
  }))
  const lines = wrapBars(bars, labelWidth, width)
  return lines
    .map((system, index) => {
      const staff = strings.map(
        (label, slot) =>
          `${label.padEnd(labelWidth)}|${system.map(({ sized }) => barRow(sized, slot)).join('')}`,
      )
      const chords = chordRow(system)
      return [
        ...(index === lines.length - 1 ? withAside(staff, row.aside) : staff),
        ...(chords === null ? [] : [`${' '.repeat(labelWidth + 1)}${chords}`]),
      ].join('\n')
    })
    .join('\n\n')
}

/**
 * One string per system. A system is the unit that must not be broken across a
 * page, so the caller needs them apart before it can say so.
 */
/**
 * Plain text is dense unless asked otherwise: it is the form Paste reads back
 * (§3b), and how sparse a song is shown is Practice's choice, not the song's.
 */
export const renderSystems = (
  score: Score,
  spacing: Spacing = 'dense',
): readonly string[] =>
  score.rows.map((row) => [...rowHeading(row), staffText(score, row, spacing)].join('\n'))

export const renderScore = (score: Score, spacing: Spacing = 'dense'): string =>
  renderSystems(score, spacing).join('\n\n')

/**
 * An unnamed section is just a heading-less block of chords, and playing
 * something once is not a repeat.
 */
export const sectionHeading = (section: Section): string => {
  if (section.name === '') return ''
  const repeat =
    section.repeat === undefined || section.repeat < 2 ? '' : ` (x${section.repeat})`
  return `${section.name}${repeat}`
}

/**
 * What each block is, for a view that sets a title or a heading apart from the
 * text under it rather than showing everything as one face. A tab system's
 * title and note come apart from its staff for the same reason. Everything but the
 * tab is passed on as typed: the chart carries chords over lyrics by the spaces
 * the writer put there, so reflowing or trimming it would destroy the only thing
 * holding a chord above its word.
 */
export type Part =
  | { readonly kind: 'tempo'; readonly text: string }
  | { readonly kind: 'section'; readonly section: Section }
  | {
      readonly kind: 'system'
      readonly title: string
      readonly note: string
      readonly row: Row
    }

const isBlank = (part: Part): boolean => {
  switch (part.kind) {
    case 'section':
      return part.section.name === '' && part.section.body === ''
    case 'system':
      return false
    default:
      return part.text === ''
  }
}

/**
 * The song in reading order: the tempo, each section, and each system of the
 * tab, with the tab first when the song asks for it. The title is not a part:
 * Practice keeps it in its bar, always in sight, rather than above the song.
 */
export const songParts = (song: Song): readonly Part[] => {
  const header: readonly Part[] = [{ kind: 'tempo', text: song.tempo }]
  const chart = song.chart.map((section): Part => ({ kind: 'section', section }))
  // A tab nothing has been written into is a staff of dashes, which is nothing
  // to read; every new song has one.
  const tab = scoreHasContent(song.tab)
    ? song.tab.rows.map((row): Part => ({
        kind: 'system',
        title: row.title ?? '',
        note: row.note ?? '',
        row,
      }))
    : []
  const parts = song.tabFirst
    ? [...header, ...tab, ...chart]
    : [...header, ...chart, ...tab]
  // A section with neither a name nor a body would otherwise show as a gap.
  return parts.filter((part) => !isBlank(part))
}
