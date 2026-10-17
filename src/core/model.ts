export type Fret = number

export type Link = 'h' | 'p' | '/' | '\\'

export type Decoration =
  { readonly kind: 'b'; readonly to?: Fret } | { readonly kind: '~' }

export type Cell =
  | {
      readonly kind: 'fret'
      readonly fret: Fret
      readonly link?: Link
      readonly decoration?: Decoration
    }
  | { readonly kind: 'mute' }

export type Tuning = {
  readonly name: string
  readonly strings: readonly string[]
}

export type Column = {
  readonly cells: readonly (Cell | null)[]
  readonly chord?: string
}

export type Bar = { readonly columns: readonly Column[] }

export type Row = {
  readonly title?: string
  readonly note?: string
  readonly aside?: string
  readonly bars: readonly Bar[]
}

/**
 * How much air the rendered tab has between notes: dense is `2-2`, sparse is
 * `2--2`. Only the text changes; the grid and the timing it carries do not. It
 * is how a song is shown rather than what it is, so it is not part of the song:
 * Practice keeps it per song on each device (§4b).
 */
export type Spacing = 'dense' | 'sparse'

export type Score = {
  readonly tuning: Tuning
  readonly rows: readonly Row[]
  readonly defaultBarColumns: number
}

export type Section = {
  readonly name: string
  readonly repeat?: number
  readonly body: string
}

/** Majors round the circle of fifths, then their relative minors. */
export const KEYS = [
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'Db',
  'Ab',
  'Eb',
  'Bb',
  'F',
  'Am',
  'Em',
  'Bm',
  'F#m',
  'C#m',
  'G#m',
  'Ebm',
  'Bbm',
  'Fm',
  'Cm',
  'Gm',
  'Dm',
] as const

export type Key = (typeof KEYS)[number]

/**
 * One synth's patch for a song: the sound it is set to and what each of its
 * dials and knobs is assigned to. Dial 1 is the first of `dials`, so the list
 * order is the numbering, and a blank entry keeps a slot whose number matters.
 */
export type Synth = {
  readonly name: string
  readonly sound: string
  readonly dials: readonly string[]
  readonly knobs: readonly string[]
}

/** Three of each to fill in, as the synths the band plays have. */
export const emptySynth = (name: string): Synth => ({
  name,
  sound: '',
  dials: ['', '', ''],
  knobs: ['', '', ''],
})

/**
 * Something to sort out before the next practice. Kept once ticked, struck
 * through, until cleared, so what got done since last time can still be seen.
 */
export type Todo = { readonly text: string; readonly done: boolean }

/** A todo with nothing typed in it is not one waiting to be done. */
export const isOpen = (todo: Todo): boolean => !todo.done && todo.text.trim() !== ''

export type Song = {
  readonly title: string
  readonly bpm: number | null
  readonly key: Key | null
  /** Anything about the song as a whole that is not its tempo or key: 'swing feel'. */
  readonly note: string
  readonly chart: readonly Section[]
  readonly tab: Score
  readonly tabFirst: boolean
  readonly synths: readonly Synth[]
  /** What to work on before the next practice, kept out of the chart. */
  readonly todos: readonly Todo[]
  /** Lyric drafts and loose thoughts for the song, kept out of the chart too. */
  readonly ideas: string
}

export type Cursor = {
  readonly row: number
  readonly bar: number
  readonly column: number
  readonly slot: number
}

export type EditorState = {
  readonly song: Song
  readonly cursor: Cursor
  readonly digitPending: boolean
  readonly digitTarget: 'fret' | 'bend'
}

export const TUNINGS = [
  { name: 'Standard', strings: ['e', 'B', 'G', 'D', 'A', 'E'] },
  { name: 'Drop D', strings: ['e', 'B', 'G', 'D', 'A', 'D'] },
  { name: 'Bass', strings: ['G', 'D', 'A', 'E'] },
] as const satisfies readonly Tuning[]

/** Eight eighths: one bar of 4/4, each column an eighth note. */
export const DEFAULT_BAR_COLUMNS = 8

export const emptyCells = (strings: number): readonly (Cell | null)[] =>
  Array.from({ length: strings }, () => null)

export const emptyColumn = (strings: number): Column => ({
  cells: emptyCells(strings),
})

export const emptyBar = (columns: number, strings: number): Bar => ({
  columns: Array.from({ length: columns }, () => emptyColumn(strings)),
})

export const emptyRow = (bars: number, columns: number, strings: number): Row => ({
  bars: Array.from({ length: bars }, () => emptyBar(columns, strings)),
})

export const emptyScore = (): Score => ({
  tuning: TUNINGS[0],
  rows: [emptyRow(2, DEFAULT_BAR_COLUMNS, TUNINGS[0].strings.length)],
  defaultBarColumns: DEFAULT_BAR_COLUMNS,
})

export const emptySection = (name: string): Section => ({ name, body: '' })

export const SECTION_NAMES = [
  'Intro',
  'Verse',
  'Chorus',
  'Bridge',
  'Solo',
  'Outro',
] as const

/** Most songs open on an intro and then trade verses and choruses. */
export const suggestedName = (index: number): string =>
  index === 0 ? 'Intro' : index % 2 === 1 ? 'Verse' : 'Chorus'

export const emptySong = (): Song => ({
  title: '',
  bpm: null,
  key: null,
  note: '',
  chart: [emptySection(suggestedName(0))],
  tab: emptyScore(),
  tabFirst: false,
  synths: [],
  todos: [],
  ideas: '',
})
