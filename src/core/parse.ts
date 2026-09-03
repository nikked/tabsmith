import { MAX_FRET } from './edit.ts'
import {
  DEFAULT_BAR_COLUMNS,
  TUNINGS,
  type Bar,
  type Cell,
  type Column,
  type Row,
  type Decoration,
  type Link,
  type Score,
  type Section,
  type Song,
  type Tuning,
} from './model.ts'

/**
 * A section heading, `[Verse 1]`, with the repeat some writers put beside it.
 * The whole line has to be the heading — a bracket in the middle of a lyric is
 * a lyric.
 */
const HEADING = /^\s*\[([^\]]+)\]\s*(?:\(?\s*[xX]\s*(\d+)\s*\)?)?\s*$/

/**
 * A staff line is an optional string name, a bar line, and then nothing but the
 * characters a tab is made of — no spaces anywhere, which is what tells it from
 * a line like `| x2 |`. At least one dash, so a bare `||` is not a staff. Text
 * after a space is the row's aside, hanging off the closing bar line.
 */
const STAFF =
  /^(\s*(?:[A-Ga-g][#b]?)?\s*\|[-0-9xXhpb/\\~|]*-[-0-9xXhpb/\\~|]*)(?:\s+(\S.*?))?\s*$/

/**
 * One cell, read where it starts. The link is a prefix and the decoration a
 * suffix (§2), so this is the same grammar `cellText` writes, read backwards.
 * A two-digit fret above 24 is one digit and something else — the editor makes
 * the same call while you type.
 */
const TOKEN = /^(?:([hp/\\])?(\d{1,2})(b\d{0,2})?(~)?|([xX]))/

type Token = { readonly cell: Cell; readonly width: number }

const LINKS: Readonly<Record<string, Link>> = { h: 'h', p: 'p', '/': '/', '\\': '\\' }

const decorationFrom = (
  bend: string | undefined,
  vibrato: string | undefined,
): Decoration | undefined => {
  if (bend !== undefined) {
    const to = Number(bend.slice(1))
    return bend.length > 1 && to <= MAX_FRET ? { kind: 'b', to } : { kind: 'b' }
  }
  return vibrato === undefined ? undefined : { kind: '~' }
}

const tokenAt = (line: string, at: number): Token | null => {
  const match = TOKEN.exec(line.slice(at))
  if (match === null) return null
  const [text, link, digits, bend, vibrato, mute] = match
  if (mute !== undefined) return { cell: { kind: 'mute' }, width: 1 }
  if (digits === undefined || text === '') return null

  // Two digits above 24 are one fret and something that is not part of it, so
  // only the first is read and the rest is left for the next column.
  const split = digits.length === 2 && Number(digits) > MAX_FRET
  const decoration = split ? undefined : decorationFrom(bend, vibrato)
  const prefix = link === undefined ? undefined : LINKS[link]

  return {
    cell: {
      kind: 'fret',
      fret: split ? Number(digits[0]) : Number(digits),
      ...(prefix === undefined ? {} : { link: prefix }),
      ...(decoration === undefined ? {} : { decoration }),
    },
    width: split ? (link === undefined ? 1 : 2) : text.length,
  }
}

/**
 * Where each note on one string sits. Read per string rather than across all of
 * them at once, because the digit inside `12` is a perfectly good note to a
 * scanner that does not already know it is halfway through one.
 */
const scanLine = (line: string): ReadonlyMap<number, Token> => {
  const found = new Map<number, Token>()
  let at = 0
  while (at < line.length) {
    const token = tokenAt(line, at)
    if (token === null) {
      at += 1
      continue
    }
    found.set(at, token)
    at += token.width
  }
  return found
}

/**
 * The inverse of `sizeColumns`: a column is as wide as its widest cell, and one
 * dash of padding follows every column but the last. Reading it back that way
 * is what makes rendering a pasted bar give back what arrived.
 *
 * A tab written by hand is not on that grid, though, so a column never runs
 * past a note another string starts inside it — `12b14` on the top string must
 * not swallow the `p0` underneath it. Where the two disagree the note is kept
 * and the spacing gives way, because a lost note is not recoverable and a
 * shifted one is visible.
 */
const readBar = (
  lines: readonly string[],
): { readonly bar: Bar; readonly starts: readonly number[] } => {
  const width = Math.max(0, ...lines.map((line) => line.length))
  const padded = lines.map((line) => line.padEnd(width, '-'))
  const scans = padded.map(scanLine)

  const startsAt = (at: number): boolean => scans.some((scan) => scan.has(at))
  const nextStart = (after: number): number =>
    Math.min(
      ...scans.map((scan) =>
        Math.min(
          ...[...scan.keys()].filter((at) => at > after),
          Number.POSITIVE_INFINITY,
        ),
      ),
      Number.POSITIVE_INFINITY,
    )

  const columns: Column[] = []
  const starts: number[] = []
  let at = 0
  while (at < width) {
    const here = scans.map((scan) => scan.get(at))
    starts.push(at)
    columns.push({ cells: here.map((token) => token?.cell ?? null) })
    const span = Math.max(1, ...here.map((token) => token?.width ?? 0))
    at += Math.min(span, Math.max(1, nextStart(at) - at))
    // The single dash the renderer puts after every column but the last.
    if (at < width && !startsAt(at) && padded.every((line) => line[at] === '-')) at += 1
  }

  return columns.length === 0
    ? { bar: { columns: [{ cells: lines.map(() => null) }] }, starts: [0] }
    : { bar: { columns }, starts }
}

/** Everything up to the first bar line is the string's name, not its notes. */
const contentOf = (line: string): string => {
  const at = line.indexOf('|')
  return at < 0 ? line : line.slice(at + 1)
}

const labelOf = (line: string): string => {
  const at = line.indexOf('|')
  return at < 0 ? '' : line.slice(0, at).trim()
}

/**
 * Each name to the column it starts under. One pushed right off its column by a
 * long name before it (`chordRow`) starts under no column, so it goes to the
 * first column after the previous name's, the earliest it could have been on.
 */
const placeChords = (
  chords: string,
  from: number,
  starts: readonly number[],
): ReadonlyMap<number, string> => {
  const placed = new Map<number, string>()
  let after = -1
  for (const match of chords.matchAll(/\S+/g)) {
    const at = match.index - from
    const exact = starts.findIndex((start, index) => index > after && start === at)
    const column = exact >= 0 ? exact : after + 1
    if (column >= starts.length) break
    placed.set(column, match[0])
    after = column
  }
  return placed
}

const readRow = (
  staff: Staff,
  title: string | undefined,
  note: string | undefined,
): Row => {
  const { lines } = staff
  const split = lines.map((line) => {
    const parts = contentOf(line).split('|')
    // A trailing bar line leaves an empty piece behind; it is not a bar.
    return parts.at(-1)?.trim() === '' ? parts.slice(0, -1) : parts
  })
  const count = Math.max(...split.map((parts) => parts.length))
  // Lines that disagree about where the bars are cannot be split on faith, so
  // the whole system becomes one bar rather than a guess about which is right.
  const agreed = split.every((parts) => parts.length === count) && count > 0
  const pieces: readonly (readonly string[])[] = agreed
    ? Array.from({ length: count }, (_, bar) => split.map((parts) => parts[bar] ?? ''))
    : [lines.map(contentOf)]
  const read = pieces.map(readBar)

  // Where each column starts along the whole system, bar lines counted in.
  let offset = 0
  const starts = read.flatMap(({ starts: inBar }, bar) => {
    const here = inBar.map((start) => offset + start)
    offset += Math.max(...(pieces[bar] ?? []).map((piece) => piece.length)) + 1
    return here
  })
  const chords =
    staff.chords === null
      ? new Map<number, string>()
      : placeChords(staff.chords, (lines[0] ?? '').indexOf('|') + 1, starts)

  let column = 0
  const bars = read.map(({ bar }) => ({
    columns: bar.columns.map((each) => {
      const chord = chords.get(column)
      column += 1
      return chord === undefined ? each : { ...each, chord }
    }),
  }))

  const asides = [...staff.asides, ...staff.overflow]
  while (asides.at(-1) === '') asides.pop()
  const aside = asides.join('\n')

  return {
    ...(title === undefined || title === '' ? {} : { title }),
    ...(note === undefined ? {} : { note }),
    ...(aside === '' ? {} : { aside }),
    bars,
  }
}

/**
 * The line labels say what the tab is for, and the count settles it: six lines
 * ending on D are Drop D, six are standard, four are a bass. Anything else is
 * refused rather than guessed at — a seven-string tab silently read as a
 * six-string one is worse than being told it will not open.
 */
const tuningFor = (lines: readonly string[]): Tuning | null => {
  const [standard, dropD, bass] = TUNINGS
  if (lines.length === 4) return bass
  if (lines.length !== 6) return null
  return labelOf(lines[5] ?? '').toUpperCase() === 'D' ? dropD : standard
}

/**
 * A system as the renderer writes it: the staff lines, the aside on each, the
 * aside's lines past the last string, and the chord names under it.
 */
type Staff = {
  readonly lines: string[]
  readonly asides: string[]
  readonly overflow: string[]
  chords: string | null
}

type Block =
  | { readonly kind: 'heading'; readonly name: string; readonly repeat?: number }
  | { readonly kind: 'staff'; readonly staff: Staff }
  | { readonly kind: 'text'; readonly line: string }

/**
 * A line straight under a staff belongs to it by where it starts: past the
 * closing bar line it carries on the aside, under the bars it names chords.
 * Only before the chord names, which are always the system's last line.
 */
const under = (staff: Staff, line: string): 'overflow' | 'chords' | null => {
  const indent = line.search(/\S/)
  const first = staff.lines[0] ?? ''
  if (indent < 0 || staff.chords !== null) return null
  if (indent > first.length) return 'overflow'
  return indent > first.indexOf('|') ? 'chords' : null
}

const classify = (lines: readonly string[]): readonly Block[] => {
  const blocks: Block[] = []
  let staff: Staff | null = null

  const flush = () => {
    if (staff !== null) blocks.push({ kind: 'staff', staff })
    staff = null
  }

  for (const line of lines) {
    const match = STAFF.exec(line)
    if (match !== null && match[1] !== undefined) {
      if (staff !== null && (staff.overflow.length > 0 || staff.chords !== null)) flush()
      staff ??= { lines: [], asides: [], overflow: [], chords: null }
      staff.lines.push(match[1])
      staff.asides.push(match[2] ?? '')
      continue
    }
    const belongs = staff === null ? null : under(staff, line)
    if (staff !== null && belongs === 'overflow') {
      staff.overflow.push(line.trim())
      continue
    }
    if (staff !== null && belongs === 'chords') {
      staff.chords = line
      continue
    }
    // Anything else ends the system, a blank line included: systems are
    // separated by blanks, and merging two would leave a block of twelve lines
    // that matches no tuning at all.
    flush()

    const heading = HEADING.exec(line)
    if (heading !== null && heading[1] !== undefined) {
      blocks.push({
        kind: 'heading',
        name: heading[1].trim(),
        ...(heading[2] === undefined ? {} : { repeat: Number(heading[2]) }),
      })
    } else {
      blocks.push({ kind: 'text', line })
    }
  }
  flush()
  return blocks
}

export type Parsed =
  | { readonly ok: true; readonly song: Song }
  | { readonly ok: false; readonly error: string }

/**
 * Ultimate Guitar's markup, when the text came from the raw page rather than
 * the rendered one. Stripped because a literal `[ch]` in a chart is worse than
 * the alignment it may cost, which you can see and fix.
 */
const clean = (text: string): readonly string[] =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/\[\/?(?:ch|tab)\]/gi, '')
    .split('\n')

const trimBlank = (lines: readonly string[]): readonly string[] => {
  let from = 0
  let to = lines.length
  while (from < to && lines[from]?.trim() === '') from += 1
  while (to > from && lines[to - 1]?.trim() === '') to -= 1
  return lines.slice(from, to)
}

/**
 * A pasted page is a chart with staves in it. The chart keeps every line
 * verbatim — the spaces are what hold a chord over its word (§2) — and each
 * staff becomes a row of the tab, which is an appendix rather than something
 * that sits inside a section.
 *
 * A staff that follows a heading with nothing else under it takes that heading
 * as its row title, and the empty section goes: `[Intro]` above a riff is the
 * riff's name, not a verse with no words. A single line right above a staff,
 * after a heading or a blank, is the row's note, because that is how a row is
 * written out (`renderSystems`); two or more are a section's words.
 */
export const parseSong = (text: string, title = ''): Parsed => {
  const blocks = classify(clean(text))
  const sections: Section[] = []
  const rows: Row[] = []
  let body: string[] = []
  let heading: { name: string; repeat?: number } | null = null
  let tuning: Tuning | null = null
  let mixed = false

  const closeSection = () => {
    const lines = trimBlank(body)
    body = []
    if (heading === null && lines.length === 0) return
    sections.push({
      name: heading?.name ?? '',
      ...(heading?.repeat === undefined ? {} : { repeat: heading.repeat }),
      body: lines.join('\n'),
    })
    heading = null
  }

  for (const block of blocks) {
    if (block.kind === 'heading') {
      closeSection()
      heading = {
        name: block.name,
        ...(block.repeat === undefined ? {} : { repeat: block.repeat }),
      }
      continue
    }
    if (block.kind === 'text') {
      body.push(block.line)
      continue
    }

    const found = tuningFor(block.staff.lines)
    if (found === null) continue
    if (tuning !== null && tuning !== found) mixed = true
    tuning ??= found

    // Only a heading with at most a note under it belongs to the staff; the
    // body itself is never dropped, because those are lines somebody typed.
    const blank = body.findLastIndex((line) => line.trim() === '')
    const run = body.slice(blank + 1)
    const note = run.length === 1 ? run[0] : undefined
    if (note !== undefined) body = body.slice(0, blank + 1)
    const owned = heading !== null && trimBlank(body).length === 0
    const name = owned ? heading?.name : undefined
    if (owned) heading = null
    rows.push(readRow(block.staff, name, note))
  }
  closeSection()

  if (mixed) {
    return {
      ok: false,
      error: 'That tab mixes guitar and bass staves, which one song cannot hold.',
    }
  }
  if (sections.length === 0 && rows.length === 0) {
    return { ok: false, error: 'There is no chart or tab in that text.' }
  }

  const tab: Score = {
    tuning: tuning ?? TUNINGS[0],
    rows: rows.length > 0 ? rows : [emptyish(tuning ?? TUNINGS[0])],
    defaultBarColumns: DEFAULT_BAR_COLUMNS,
  }

  return {
    ok: true,
    song: {
      title,
      tempo: '',
      chart: sections.length > 0 ? sections : [{ name: '', body: '' }],
      tab,
      tabFirst: false,
    },
  }
}

const emptyish = (tuning: Tuning): Row => ({
  bars: [
    {
      columns: Array.from({ length: DEFAULT_BAR_COLUMNS }, () => ({
        cells: tuning.strings.map(() => null),
      })),
    },
  ],
})
