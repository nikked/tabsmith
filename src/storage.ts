import type { Cell, Column, Score, Tuning } from './core/model.ts'

const KEY = 'tabsmith'
const SCHEMA_VERSION = 2

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

const isScore = (value: unknown): value is Score => {
  if (!isRecord(value)) return false
  const tuning = value.tuning
  if (!isTuning(tuning)) return false
  if (typeof value.defaultBarColumns !== 'number') return false
  const strings = tuning.strings.length
  return (
    isArray(value.bars) &&
    value.bars.length > 0 &&
    value.bars.every(
      (bar) =>
        isRecord(bar) &&
        isArray(bar.columns) &&
        bar.columns.length > 0 &&
        bar.columns.every((column) => isColumn(column, strings)),
    )
  )
}

export const encode = (score: Score): string =>
  JSON.stringify({ version: SCHEMA_VERSION, score })

/** Anything unreadable, versioned differently, or structurally wrong is discarded. */
export const decode = (raw: string | null): Score | null => {
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed) || parsed.version !== SCHEMA_VERSION) return null
  return isScore(parsed.score) ? parsed.score : null
}

export const save = (score: Score): void => {
  localStorage.setItem(KEY, encode(score))
}

export const load = (): Score | null => decode(localStorage.getItem(KEY))
