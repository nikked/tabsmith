export type Fret = number

export type Link = 'h' | 'p' | '/' | '\\'

export type Decoration =
  | { readonly kind: 'b'; readonly to?: Fret }
  | { readonly kind: '~' }

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

export type Score = {
  readonly tuning: Tuning
  readonly bars: readonly Bar[]
  readonly defaultBarColumns: number
}

export type Cursor = {
  readonly bar: number
  readonly column: number
  readonly slot: number
}

export type EditorState = {
  readonly score: Score
  readonly cursor: Cursor
  readonly digitPending: boolean
  readonly digitTarget: 'fret' | 'bend'
}

export const TUNINGS = [
  { name: 'Standard', strings: ['e', 'B', 'G', 'D', 'A', 'E'] },
  { name: 'Drop D', strings: ['e', 'B', 'G', 'D', 'A', 'D'] },
  { name: 'Bass', strings: ['G', 'D', 'A', 'E'] },
] as const satisfies readonly Tuning[]

export const DEFAULT_BAR_COLUMNS = 12

export const emptyCells = (strings: number): readonly (Cell | null)[] =>
  Array.from({ length: strings }, () => null)

export const emptyColumn = (strings: number): Column => ({
  cells: emptyCells(strings),
})

export const emptyBar = (columns: number, strings: number): Bar => ({
  columns: Array.from({ length: columns }, () => emptyColumn(strings)),
})

export const emptyScore = (): Score => ({
  tuning: TUNINGS[0],
  bars: Array.from({ length: 2 }, () =>
    emptyBar(DEFAULT_BAR_COLUMNS, TUNINGS[0].strings.length),
  ),
  defaultBarColumns: DEFAULT_BAR_COLUMNS,
})
