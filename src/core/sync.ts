import { repair, type Entry, type Library, type Setlist } from './library.ts'
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
 * comes back untouched when nothing remote is newer, so a sync that changed
 * nothing does not look like an edit worth syncing again.
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
  if (newer.length === 0) return library

  const won = new Map(newer.map((record) => [record.id, record]))
  const kept = library.songs.flatMap((entry): Entry[] => {
    const theirs = won.get(entry.id)
    if (theirs === undefined) return [entry]
    return theirs.active
      ? [{ id: entry.id, song: theirs.song, updatedAt: theirs.at }]
      : []
  })
  const here = new Set(library.songs.map((entry) => entry.id))
  const arrived = newer.flatMap((record): Entry[] =>
    !record.active || here.has(record.id)
      ? []
      : [{ id: record.id, song: record.song, updatedAt: record.at }],
  )
  const removed = library.removed.filter((gone) => !won.has(gone.id))
  return repair([...kept, ...arrived], library.open, removed, library.setlists) ?? library
}

/**
 * Once a sync has carried a deletion to the sheet, the sheet remembers it and
 * this device can forget it: a deleted song, or a setlist marked inactive.
 * Only what was sent is forgotten: one deleted while the sync was on its way
 * still has to go up with the next one.
 */
export const forgetSent = (library: Library, sent: Library): Library => {
  const removed = library.removed.filter(
    (gone) => !sent.removed.some((each) => each.id === gone.id && each.at === gone.at),
  )
  const setlists = library.setlists.filter(
    (setlist) =>
      setlist.active ||
      !sent.setlists.some(
        (each) => each.id === setlist.id && each.updatedAt === setlist.updatedAt,
      ),
  )
  return removed.length === library.removed.length &&
    setlists.length === library.setlists.length
    ? library
    : { ...library, removed, setlists }
}

/**
 * Setlists merge the same way songs do: newest wins, one at a time, a tie keeps
 * what is here, and new ones join at the end. A setlist deleted elsewhere is
 * taken off this device; the sheet is what keeps it, marked inactive, so one
 * this device does not have changes nothing.
 */
export const mergeSetlists = (library: Library, remote: readonly Setlist[]): Library => {
  const known = new Map(
    library.setlists.map((setlist) => [setlist.id, setlist.updatedAt]),
  )
  const newer = remote.filter(
    (setlist) =>
      (setlist.active || known.has(setlist.id)) &&
      setlist.updatedAt > (known.get(setlist.id) ?? Number.NEGATIVE_INFINITY),
  )
  if (newer.length === 0) return library
  const won = new Map(newer.map((setlist) => [setlist.id, setlist]))
  return {
    ...library,
    setlists: [
      ...library.setlists.flatMap((setlist): Setlist[] => {
        const theirs = won.get(setlist.id)
        if (theirs === undefined) return [setlist]
        return theirs.active ? [theirs] : []
      }),
      ...newer.filter((setlist) => !known.has(setlist.id)),
    ],
  }
}
