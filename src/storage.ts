import { z } from 'zod'
import { MAX_FRET } from './core/edit.ts'
import { repair, type Entry, type Library } from './core/library.ts'
import { emptySection, emptySong, type Song } from './core/model.ts'

const KEY = 'tabsmith'
const LIBRARY_KEY = 'tabsmith.library'
const CURRENT_VERSION = 4
const LIBRARY_VERSION = 1

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
  aside: z.string().optional(),
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
  (v2) => ({
    tuning: v2.tuning,
    defaultBarColumns: v2.defaultBarColumns,
    rows: [{ bars: v2.bars }],
  }),
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

/**
 * A file still holds exactly one song, so `encode` above is untouched and every
 * file ever written by this app still opens. The shelf is a separate document
 * under its own key, with its own version: what a library is has nothing to do
 * with what a song is, and giving them one version counter would mean bumping
 * the file format every time the shelf changed shape.
 */
const entry = z.object({
  id: z.string().min(1),
  song,
  // A song shelved before sync existed has never been edited as far as another
  // device can tell, so any copy that has wins over it.
  updatedAt: z.number().default(0),
})

const library = z.object({
  songs: z.array(entry),
  open: z.string(),
  removed: z
    .array(
      z.object({
        id: z.string().min(1),
        at: z.number(),
        // A deletion stored before deleted songs were kept has no song to keep.
        song: song.nullable().default(null),
      }),
    )
    .default([]),
})

export const newId = (): string => crypto.randomUUID()

/**
 * The same schema a file goes through, for a song this app built rather than
 * read — the importer assembles one out of pasted text, and a bug there should
 * be caught at the same boundary a bad file is.
 */
export const validate = (value: unknown): Loaded => {
  const result = song.safeParse(value)
  return result.success
    ? { ok: true, song: result.data }
    : { ok: false, error: 'That text did not make a song this app can hold.' }
}

export const saveLibrary = (value: Library): void => {
  localStorage.setItem(
    LIBRARY_KEY,
    JSON.stringify({ version: LIBRARY_VERSION, library: value }),
  )
}

const readLibrary = (raw: string): Library | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isDoc(parsed) || parsed.version !== LIBRARY_VERSION) return null
  const result = library.safeParse(parsed.library)
  return result.success
    ? repair(result.data.songs, result.data.open, result.data.removed)
    : null
}

/**
 * Before there was a shelf there was one song under `tabsmith`, so it becomes
 * the first song on it. The old key is left alone rather than deleted: nothing
 * reads it any more, and leaving it is the difference between a bad upgrade
 * being annoying and being unrecoverable.
 */
const inherited = (): Library | null => {
  const raw = localStorage.getItem(KEY)
  if (raw === null) return null
  const result = decode(raw)
  return result.ok
    ? repair([{ id: newId(), song: result.song, updatedAt: 0 }], '', [])
    : null
}

/**
 * A shelf this build cannot read — written by a newer one, say — is about to be
 * saved over, so it is set aside first under a key of its own.
 */
export const loadLibrary = (): Library | null => {
  const raw = localStorage.getItem(LIBRARY_KEY)
  if (raw === null) return inherited()
  const read = readLibrary(raw)
  if (read !== null) return read
  localStorage.setItem(`${LIBRARY_KEY}.unreadable.${Date.now()}`, raw)
  return inherited()
}

export const startingLibrary = (first: Song = emptySong()): Library => {
  const id = newId()
  return {
    songs: [{ id, song: first, updatedAt: Date.now() }],
    open: id,
    removed: [],
  }
}

export type { Entry }
