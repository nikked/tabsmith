import { z } from 'zod'
import { records, type Synced } from './core/sync.ts'
import {
  BAND_FIELDS,
  type Band,
  type BandTodo,
  type Library,
  type Setlist,
} from './core/library.ts'
import { DEMO_TITLE } from './demo.ts'
import { pack, unpack } from './share.ts'
import { decode, encode, type Loaded } from './storage.ts'

const KEY = 'tabsmith.sync'

/**
 * Where the sheet is and the secret that lets this device write to it. Typed in
 * on each device rather than built into the site: the site is public, and a URL
 * in its bundle would let anyone who opened it read and overwrite every song.
 */
export type Settings = {
  readonly url: string
  readonly token: string
}

const settings = z.object({ url: z.url(), token: z.string().min(1) })

export const loadSettings = (): Settings | null => {
  const raw = localStorage.getItem(KEY)
  if (raw === null) return null
  try {
    const result = settings.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export const saveSettings = (value: Settings | null): void => {
  if (value === null) localStorage.removeItem(KEY)
  else localStorage.setItem(KEY, JSON.stringify(value))
}

/**
 * The song travels as the same document a file holds, packed, so the sheet
 * needs no idea what a song is and an old row still opens after the format
 * moves on. The title is only there for whoever opens the sheet itself.
 */
const row = z.object({
  id: z.string().min(1),
  at: z.number(),
  song: z.string().nullable(),
  // A sheet from before deleted songs were kept has no such column; there, a
  // row with no song was the deletion.
  active: z.boolean().optional(),
})

const setlistRow = z.object({
  id: z.string().min(1),
  at: z.number(),
  name: z.string(),
  songs: z.array(z.string()),
  active: z.boolean(),
})

const todoRow = z.object({
  id: z.string().min(1),
  at: z.number(),
  text: z.string(),
  done: z.boolean(),
  active: z.boolean(),
})

/** One of the band's own fields, by name: its name, and its ideas. */
const bandRow = z.object({ id: z.string().min(1), at: z.number(), text: z.string() })

const bandFieldOf = (id: string): keyof Band | undefined =>
  BAND_FIELDS.find((field) => field === id)

const reply = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    records: z.array(z.unknown()),
    // A script deployed before setlists existed answers without them.
    setlists: z.array(z.unknown()).default([]),
    // Nor, until it is redeployed, the band's todos or its own fields.
    todos: z.array(z.unknown()).default([]),
    band: z.array(z.unknown()).default([]),
  }),
  z.object({ ok: z.literal(false), error: z.string() }),
])

export type Pulled =
  | {
      readonly ok: true
      readonly records: readonly Synced[]
      readonly setlists: readonly Setlist[]
      readonly todos: readonly BandTodo[]
      readonly band: Partial<Band>
    }
  | { readonly ok: false; readonly error: string }

export const toWire = (library: Library) =>
  records(library)
    .filter((record) => record.song?.title !== DEMO_TITLE)
    .map((record) => ({
      id: record.id,
      at: record.at,
      title: record.song?.title ?? '',
      song: record.song === null ? null : encode(record.song),
      active: record.active,
    }))

/**
 * A sheet cell holds at most this many characters, and one longer value makes
 * the script refuse the whole write, every other song included.
 */
const CELL_LIMIT = 50_000

/**
 * Packed, because a song with much tab outgrows a cell as indented JSON. A
 * song still too long stays on this device and is named, so the rest sync. A
 * deletion of one goes up without its content: the sheet keeps what it held.
 */
export const toSheet = async (library: Library) => {
  const rows = await Promise.all(
    toWire(library).map(async (row) => ({
      ...row,
      song: row.song === null ? null : await pack(row.song),
    })),
  )
  const fits = (row: (typeof rows)[number]) =>
    row.song === null || row.song.length <= CELL_LIMIT
  return {
    records: rows.flatMap((row) =>
      fits(row) ? [row] : row.active ? [] : [{ ...row, song: null }],
    ),
    tooLong: rows.filter((row) => row.active && !fits(row)).map((row) => row.title),
  }
}

// A row written before songs were packed holds the document as it is, and
// stays that way until its song changes again.
const read = async (packed: string): Promise<Loaded> => {
  if (packed.startsWith('{')) return decode(packed)
  try {
    return decode(await unpack(packed))
  } catch {
    return { ok: false, error: 'Not a packed song.' }
  }
}

export const setlistsToWire = (library: Library) =>
  library.setlists.map((setlist) => ({
    id: setlist.id,
    at: setlist.updatedAt,
    name: setlist.name,
    songs: setlist.songs,
    active: setlist.active,
  }))

export const todosToWire = (library: Library) =>
  library.todos.map((todo) => ({
    id: todo.id,
    at: todo.updatedAt,
    text: todo.text,
    done: todo.done,
    active: todo.active,
  }))

// Never edited is nothing to send: a sheet without the row loses nothing.
export const bandToWire = (library: Library) =>
  BAND_FIELDS.flatMap((field) => {
    const { text, updatedAt } = library.band[field]
    return updatedAt === 0 ? [] : [{ id: field, at: updatedAt, text }]
  })

/**
 * Rows come from a sheet that can be edited by hand, so one that is not a song
 * any more is dropped rather than failing the whole sync.
 */
export const fromWire = async (data: unknown): Promise<Pulled> => {
  const parsed = reply.safeParse(data)
  if (!parsed.success)
    return { ok: false, error: 'The database sent back something else.' }
  if (!parsed.data.ok)
    return { ok: false, error: `The database said: ${parsed.data.error}` }
  return {
    ok: true,
    records: (
      await Promise.all(
        parsed.data.records.map(async (value): Promise<Synced[]> => {
          const each = row.safeParse(value)
          if (!each.success) return []
          const { id, at, song } = each.data
          const loaded = song === null ? null : await read(song)
          const active = each.data.active ?? song !== null
          if (active)
            return loaded?.ok === true ? [{ id, at, active, song: loaded.song }] : []
          // A deletion still deletes even when what it kept no longer decodes.
          return [{ id, at, active, song: loaded?.ok === true ? loaded.song : null }]
        }),
      )
    ).flat(),
    setlists: parsed.data.setlists.flatMap((value): Setlist[] => {
      const each = setlistRow.safeParse(value)
      if (!each.success) return []
      const { id, at, name, songs, active } = each.data
      return [{ id, name, songs, active, updatedAt: at }]
    }),
    todos: parsed.data.todos.flatMap((value): BandTodo[] => {
      const each = todoRow.safeParse(value)
      if (!each.success) return []
      const { id, at, text, done, active } = each.data
      return [{ id, text, done, active, updatedAt: at }]
    }),
    // A field this build does not know is someone else's, and left to them.
    band: parsed.data.band.reduce<Partial<Band>>((band, value) => {
      const each = bandRow.safeParse(value)
      const field = each.success ? bandFieldOf(each.data.id) : undefined
      return each.success && field !== undefined
        ? { ...band, [field]: { text: each.data.text, updatedAt: each.data.at } }
        : band
    }, {}),
  }
}

/**
 * One round trip: everything here goes up, the sheet keeps the newest of each
 * song, and everything it then holds comes back for the same merge on this
 * side. Sent as text/plain, because Apps Script cannot answer the CORS
 * preflight a JSON content type would trigger.
 */
export const syncLibrary = async (
  to: Settings,
  library: Library,
): Promise<{ readonly pulled: Pulled; readonly tooLong: readonly string[] }> => {
  const { records, tooLong } = await toSheet(library)
  try {
    const response = await fetch(to.url, {
      method: 'POST',
      body: JSON.stringify({
        token: to.token,
        records,
        setlists: setlistsToWire(library),
        todos: todosToWire(library),
        band: bandToWire(library),
      }),
    })
    if (!response.ok)
      return {
        pulled: { ok: false, error: `The database answered ${response.status}.` },
        tooLong,
      }
    return { pulled: await fromWire(await response.json()), tooLong }
  } catch {
    return { pulled: { ok: false, error: 'Could not reach the database.' }, tooLong }
  }
}
