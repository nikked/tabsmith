import {
  clockOf,
  isUnsynced,
  repair,
  stampAfter,
  type Band,
  type BandField,
  type BandTodo,
  type Entry,
  type Library,
  type Setlist,
} from './library.ts'
import type { Song } from './model.ts'
import { same } from './same.ts'

/**
 * One song as every device can see it: its latest version, and whether it is
 * still on the shelf. A deletion carries a time like an edit does, so the two
 * can be compared — an edit made after a delete on another device brings a song
 * back. A deleted song keeps its content, so nothing deleted is ever lost; only
 * a deletion made before that was true can arrive without it.
 */
export type Synced =
  | {
      readonly id: string
      readonly at: number
      readonly active: true
      readonly song: Song
    }
  | {
      readonly id: string
      readonly at: number
      readonly active: false
      readonly song: Song | null
    }

export const records = (library: Library): readonly Synced[] => [
  ...library.songs.map((entry): Synced => ({
    id: entry.id,
    at: entry.updatedAt,
    active: true,
    song: entry.song,
  })),
  ...library.removed.map((gone): Synced => ({
    id: gone.id,
    at: gone.at,
    active: false,
    song: gone.song,
  })),
]

/** When a sync is merged, and how a song kept as a copy gets an id of its own. */
export type Now = { readonly at: number; readonly newId: () => string }

/**
 * This device's version of a song the sheet has also changed, kept beside it
 * under its own id and name so neither side's work is lost. It has never been
 * synced, so it goes up with the next sync like any new song.
 */
const conflictCopy = (entry: Entry, now: Now): Entry => ({
  id: now.newId(),
  song: {
    ...entry.song,
    title: `${entry.song.title || 'Untitled'} (conflict ${clockOf(now.at)})`,
  },
  updatedAt: now.at,
  lastSynced: null,
})

const taken = (record: Extract<Synced, { active: true }>): Entry => ({
  id: record.id,
  song: record.song,
  updatedAt: record.at,
  lastSynced: { at: record.at, song: record.song },
})

/**
 * What the sheet brought, set against what is here, one song at a time.
 *
 * A song the sheet holds this device's version of is now synced. One the sheet
 * has a newer copy of is taken, unless it was also edited here since the two
 * last agreed: then the sheet's copy takes its place and this version is kept
 * beside it as a conflict copy, named for when, so the two can be put together
 * by hand. A deletion from elsewhere takes a song off the shelf, unless it was
 * edited here since, in which case it comes back. A song this device has no
 * record of agreeing on yet — kept before syncs remembered — goes by newest
 * stamp, as every song once did, since there is nothing to tell an edit by.
 *
 * Songs already on the shelf keep their place; new ones and copies join at the
 * end. The library comes back untouched when nothing remote changes it, so a
 * sync that changed nothing does not look like an edit worth syncing again. If
 * the remote side has deleted every song here, the shelf is kept as it is — a
 * library cannot be empty, and the next sync pushes these back.
 */
export const merge = (
  library: Library,
  remote: readonly Synced[],
  now: Now,
): { readonly library: Library; readonly conflicts: readonly string[] } => {
  const theirs = new Map(remote.map((record) => [record.id, record]))
  const copies: Entry[] = []
  const conflicts: string[] = []
  let changed = false

  const settle = (entry: Entry): Entry | null => {
    const record = theirs.get(entry.id)
    if (record === undefined) return entry
    if (record.active && record.at === entry.updatedAt) {
      if (entry.lastSynced?.at === entry.updatedAt) return entry
      changed = true
      return { ...entry, lastSynced: { at: entry.updatedAt, song: entry.song } }
    }
    const base = entry.lastSynced
    if (base === null) {
      // No record of agreeing: newest stamp wins, as before syncs remembered.
      if (record.at <= entry.updatedAt) return entry
      changed = true
      return record.active ? taken(record) : null
    }
    if (record.at <= base.at) return entry
    changed = true
    const editedHere = isUnsynced(entry)
    if (!record.active) {
      return editedHere ? { ...entry, updatedAt: stampAfter(record.at, now.at) } : null
    }
    if (!editedHere || same(entry.song, record.song)) return taken(record)
    copies.push(conflictCopy(entry, now))
    conflicts.push(entry.song.title || 'Untitled')
    return taken(record)
  }

  const kept = library.songs.flatMap((entry): Entry[] => {
    const settled = settle(entry)
    return settled === null ? [] : [settled]
  })
  const here = new Set(library.songs.map((entry) => entry.id))
  const gone = new Map(library.removed.map((each) => [each.id, each.at]))
  const arrived = remote.flatMap((record): Entry[] =>
    record.active &&
    !here.has(record.id) &&
    record.at > (gone.get(record.id) ?? Number.NEGATIVE_INFINITY)
      ? [taken(record)]
      : [],
  )
  const removed = library.removed.filter((each) => {
    const record = theirs.get(each.id)
    return record === undefined || record.at <= each.at
  })
  if (!changed && arrived.length === 0 && removed.length === library.removed.length) {
    return { library, conflicts }
  }
  const merged =
    repair({ ...library, songs: [...kept, ...arrived, ...copies], removed }) ?? library
  return { library: merged, conflicts }
}

const withoutSentDeletions = <T extends Listed>(
  here: readonly T[],
  sent: readonly T[],
): readonly T[] =>
  here.filter(
    (item) =>
      item.active ||
      !sent.some((each) => each.id === item.id && each.updatedAt === item.updatedAt),
  )

/**
 * Once a sync has carried a deletion to the sheet, the sheet remembers it and
 * this device can forget it: a deleted song, or a setlist or band todo marked
 * inactive.
 * Only what was sent is forgotten: one deleted while the sync was on its way
 * still has to go up with the next one.
 */
export const forgetSent = (library: Library, sent: Library): Library => {
  const removed = library.removed.filter(
    (gone) => !sent.removed.some((each) => each.id === gone.id && each.at === gone.at),
  )
  const setlists = withoutSentDeletions(library.setlists, sent.setlists)
  const todos = withoutSentDeletions(library.todos, sent.todos)
  return removed.length === library.removed.length &&
    setlists.length === library.setlists.length &&
    todos.length === library.todos.length
    ? library
    : { ...library, removed, setlists, todos }
}

type Listed = {
  readonly id: string
  readonly active: boolean
  readonly updatedAt: number
}

/**
 * Newest wins, one at a time, a tie keeps what is here, and new ones join at
 * the end. One deleted elsewhere is taken off this device; the sheet is what
 * keeps it, marked inactive, so one this device does not have changes nothing.
 * The same list comes back when nothing remote is newer.
 */
const newestOf = <T extends Listed>(
  here: readonly T[],
  remote: readonly T[],
): readonly T[] => {
  const known = new Map(here.map((item) => [item.id, item.updatedAt]))
  const newer = remote.filter(
    (item) =>
      (item.active || known.has(item.id)) &&
      item.updatedAt > (known.get(item.id) ?? Number.NEGATIVE_INFINITY),
  )
  if (newer.length === 0) return here
  const won = new Map(newer.map((item) => [item.id, item]))
  return [
    ...here.flatMap((item): T[] => {
      const theirs = won.get(item.id)
      if (theirs === undefined) return [item]
      return theirs.active ? [theirs] : []
    }),
    ...newer.filter((item) => !known.has(item.id)),
  ]
}

/** Setlists merge one at a time, the newest of each winning. */
export const mergeSetlists = (library: Library, remote: readonly Setlist[]): Library => {
  const setlists = newestOf(library.setlists, remote)
  return setlists === library.setlists ? library : { ...library, setlists }
}

/**
 * Band todos merge the way setlists do, so two people ticking different ones
 * both keep their ticks.
 */
export const mergeTodos = (library: Library, remote: readonly BandTodo[]): Library => {
  const todos = newestOf(library.todos, remote)
  return todos === library.todos ? library : { ...library, todos }
}

/**
 * Each of the band's texts on its own: the newer one, whole, and a tie or
 * nothing sent keeps what is here.
 */
export const mergeBand = (library: Library, remote: Partial<Band>): Library => {
  const newer = (field: keyof Band): BandField => {
    const theirs = remote[field]
    return theirs !== undefined && theirs.updatedAt > library.band[field].updatedAt
      ? theirs
      : library.band[field]
  }
  const band: Band = { name: newer('name'), ideas: newer('ideas') }
  return band.name === library.band.name && band.ideas === library.band.ideas
    ? library
    : { ...library, band }
}
