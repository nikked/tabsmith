import {
  repair,
  type Band,
  type BandField,
  type BandTodo,
  type Entry,
  type Library,
  type Setlist,
} from './library.ts'
import type { Song } from './model.ts'

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

/**
 * Newest wins, one song at a time, and a tie keeps what is here. The library
 * comes back untouched when nothing remote changes it, so a sync that changed
 * nothing does not look like an edit worth syncing again.
 *
 * Whatever the sheet is now known to hold becomes each song's last synced
 * version: a newer copy taken from it, a song that arrived from it, or this
 * device's own version coming back with the same stamp it went up with.
 *
 * Songs already on the shelf keep their place; new ones join at the end. A
 * deletion only takes a song off the shelf: the sheet is what remembers it, so
 * one for a song this device does not have changes nothing. If the remote side
 * has deleted every song here, the shelf is kept as it is — a library cannot be
 * empty, and the next sync pushes these back.
 */
export const merge = (library: Library, remote: readonly Synced[]): Library => {
  const known = new Map(records(library).map((record) => [record.id, record.at]))
  const newer = remote.filter(
    (record) =>
      (record.active || known.has(record.id)) &&
      record.at > (known.get(record.id) ?? Number.NEGATIVE_INFINITY),
  )
  const won = new Map(newer.map((record) => [record.id, record]))
  // This device's version, as the sheet now holds it.
  const echoed = new Map<string, number>(
    remote.filter((record) => record.active).map((record) => [record.id, record.at]),
  )
  const confirmed = (entry: Entry): boolean =>
    echoed.get(entry.id) === entry.updatedAt && entry.lastSynced?.at !== entry.updatedAt
  if (newer.length === 0 && !library.songs.some(confirmed)) return library

  const kept = library.songs.flatMap((entry): Entry[] => {
    const theirs = won.get(entry.id)
    if (theirs === undefined) {
      return [
        confirmed(entry)
          ? { ...entry, lastSynced: { at: entry.updatedAt, song: entry.song } }
          : entry,
      ]
    }
    return theirs.active
      ? [
          {
            id: entry.id,
            song: theirs.song,
            updatedAt: theirs.at,
            lastSynced: { at: theirs.at, song: theirs.song },
          },
        ]
      : []
  })
  const here = new Set(library.songs.map((entry) => entry.id))
  const arrived = newer.flatMap((record): Entry[] =>
    !record.active || here.has(record.id)
      ? []
      : [
          {
            id: record.id,
            song: record.song,
            updatedAt: record.at,
            lastSynced: { at: record.at, song: record.song },
          },
        ],
  )
  const removed = library.removed.filter((gone) => !won.has(gone.id))
  return repair({ ...library, songs: [...kept, ...arrived], removed }) ?? library
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
