import { z } from 'zod'
import { MAX_FRET } from './core/edit.ts'
import { emptySection, type Song } from './core/model.ts'

const KEY = 'tabsmith'
const CURRENT_VERSION = 4

const link = z.enum(['h', 'p', '/', '\\'])

/**
 * A fret out of range, or a fraction of a column, would decode happily and then
 * make nonsense downstream — a bar of zero columns puts the cursor outside the
 * bar it is meant to be clamped to. Bounds belong here for the same reason the
 * per-string cell count does.
 */
const fret = z.int().min(0).max(MAX_FRET)

const decoration = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('b'), to: fret.optional() }),
  z.object({ kind: z.literal('~') }),
])

const cell = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fret'),
    fret,
    link: link.optional(),
    decoration: decoration.optional(),
  }),
  z.object({ kind: z.literal('mute') }),
])

const column = z.object({
  cells: z.array(cell.nullable()).nonempty(),
  chord: z.string().optional(),
})

const bar = z.object({ columns: z.array(column).nonempty() })
const row = z.object({
  title: z.string().optional(),
  note: z.string().optional(),
  bars: z.array(bar).nonempty(),
})

const tuning = z.object({
  name: z.string(),
  strings: z.array(z.string()).nonempty(),
})

/**
 * A column carries one cell per string, and the tuning is the only thing that
 * says how many that is. Checked here rather than left to render, where a short
 * column would quietly draw as a half-empty staff instead of being refused.
 */
const score = z
  .object({
    tuning,
    rows: z.array(row).nonempty(),
    defaultBarColumns: z.int().positive(),
  })
  .refine(
    (value) =>
      value.rows.every((r) =>
        r.bars.every((b) =>
          b.columns.every((c) => c.cells.length === value.tuning.strings.length),
        ),
      ),
    { message: 'every column needs one cell per string' },
  )

const section = z.object({
  name: z.string(),
  repeat: z.int().positive().optional(),
  body: z.string(),
})

/**
 * Every field a later version adds needs a `.default()`, so a file written
 * before it existed still parses. Unknown fields are dropped rather than
 * refused, so a file from a build one field ahead of this one still opens; a
 * higher version integer is refused outright.
 */
const song = z.object({
  title: z.string().default(''),
  tempo: z.string().default(''),
  chart: z.array(section).nonempty(),
  tab: score,
  tabFirst: z.boolean().default(false),
})

/**
 * One step per version, applied blindly: a migration only reshapes, and the
 * schema above is the single thing that decides whether the result is a song.
 * That keeps an old version's rules from having to be re-stated here.
 */
type Doc = Record<string, unknown>

const MIGRATIONS: readonly ((doc: Doc) => Doc)[] = [
  (v1) => v1, // chord names arrived optional, so v1 is already a v2
  (v2) => ({ tuning: v2.tuning, defaultBarColumns: v2.defaultBarColumns, rows: [{ bars: v2.bars }] }),
  (v3) => ({
    title: '',
    tempo: '',
    chart: [emptySection('Verse 1')],
    tab: v3,
    tabFirst: false,
  }),
]

const isDoc = (value: unknown): value is Doc =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const migrate = (doc: Doc, from: number): Doc =>
  MIGRATIONS.slice(from - 1).reduce((current, step) => step(current), doc)

export type Loaded =
  | { readonly ok: true; readonly song: Song }
  | { readonly ok: false; readonly error: string }

export const encode = (song: Song): string =>
  JSON.stringify({ version: CURRENT_VERSION, song }, null, 2)

export const decode = (raw: string): Loaded => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'That file is not JSON.' }
  }
  if (!isDoc(parsed) || typeof parsed.version !== 'number') {
    return { ok: false, error: 'That file is not a tabsmith song.' }
  }
  if (parsed.version > CURRENT_VERSION) {
    return { ok: false, error: 'That file was saved by a newer version of tabsmith.' }
  }
  // Below 1 there is no version to migrate from, and slicing the chain from a
  // negative index would silently run only its tail.
  if (!Number.isInteger(parsed.version) || parsed.version < 1) {
    return { ok: false, error: 'That file is not a tabsmith song.' }
  }
  // Up to v3 the document was a bare score, stored under a different key.
  const stored = parsed.version < 4 ? parsed.score : parsed.song
  if (!isDoc(stored)) {
    return { ok: false, error: 'That file is not a tabsmith song.' }
  }
  const result = song.safeParse(migrate(stored, parsed.version))
  return result.success
    ? { ok: true, song: result.data }
    : { ok: false, error: 'That file is not a tabsmith song.' }
}

/**
 * Always prefixed, so a folder of these says which app wrote them, and
 * non-alphanumerics collapse to dashes so it stays browsable.
 */
export const filenameFor = (song: Song): string => {
  const slug = song.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug === '' ? 'tabsmith.json' : `tabsmith-${slug}.json`
}

export const save = (song: Song): void => {
  localStorage.setItem(KEY, encode(song))
}

export const load = (): Song | null => {
  const raw = localStorage.getItem(KEY)
  if (raw === null) return null
  const result = decode(raw)
  return result.ok ? result.song : null
}
