import type { Cell, Column, Score, Section, Song, Tuning } from './core/model.ts'

const KEY = 'tabsmith'
const SCHEMA_VERSION = 4

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isArray = (value: unknown): value is readonly unknown[] =>
  Array.isArray(value)

const isCell = (value: unknown): value is Cell | null => {
  if (value === null) return true
  if (!isRecord(value)) return false
  if (value.kind === 'mute') return true
  return value.kind === 'fret' && typeof value.fret === 'number'
}

const isTuning = (value: unknown): value is Tuning =>
  isRecord(value) &&
  typeof value.name === 'string' &&
  isArray(value.strings) &&
  value.strings.length > 0 &&
  value.strings.every((label) => typeof label === 'string')

const isColumn = (value: unknown, strings: number): value is Column =>
  isRecord(value) &&
  isArray(value.cells) &&
  value.cells.length === strings &&
  value.cells.every(isCell) &&
  (value.chord === undefined || typeof value.chord === 'string')

const isBar = (value: unknown, strings: number): boolean =>
  isRecord(value) &&
  isArray(value.columns) &&
  value.columns.length > 0 &&
  value.columns.every((column) => isColumn(column, strings))

const isRow = (value: unknown, strings: number): boolean =>
  isRecord(value) &&
  (value.title === undefined || typeof value.title === 'string') &&
  (value.note === undefined || typeof value.note === 'string') &&
  isArray(value.bars) &&
  value.bars.length > 0 &&
  value.bars.every((bar) => isBar(bar, strings))

const isScore = (value: unknown): value is Score => {
  if (!isRecord(value)) return false
  const tuning = value.tuning
  if (!isTuning(tuning)) return false
  if (typeof value.defaultBarColumns !== 'number') return false
  const strings = tuning.strings.length
  return (
    isArray(value.rows) &&
    value.rows.length > 0 &&
    value.rows.every((row) => isRow(row, strings))
  )
}

const isSection = (value: unknown): value is Section =>
  isRecord(value) &&
  typeof value.name === 'string' &&
  typeof value.body === 'string' &&
  (value.repeat === undefined || typeof value.repeat === 'number')

const isSong = (value: unknown): value is Song =>
  isRecord(value) &&
  typeof value.title === 'string' &&
  typeof value.tempo === 'string' &&
  typeof value.tabFirst === 'boolean' &&
  isArray(value.chart) &&
  value.chart.length > 0 &&
  value.chart.every(isSection) &&
  isScore(value.tab)

export const encode = (song: Song): string =>
  JSON.stringify({ version: SCHEMA_VERSION, song })

/** Anything unreadable, versioned differently, or structurally wrong is discarded. */
export const decode = (raw: string | null): Song | null => {
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed) || parsed.version !== SCHEMA_VERSION) return null
  return isSong(parsed.song) ? parsed.song : null
}

export const save = (song: Song): void => {
  localStorage.setItem(KEY, encode(song))
}

export const load = (): Song | null => decode(localStorage.getItem(KEY))
