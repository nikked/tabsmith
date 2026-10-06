import { repair, type Entry, type Library, type Removed } from './library.ts'
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
 * Songs already on the shelf keep their place; new ones join at the end. If the
 * remote side has deleted every song here, the shelf is kept as it is — a
 * library cannot be empty, and the next sync pushes these back.
 */
export const merge = (library: Library, remote: readonly Synced[]): Library => {
  const known = new Map(records(library).map((record) => [record.id, record.at]))
  const newer = remote.filter(
    (record) => record.at > (known.get(record.id) ?? Number.NEGATIVE_INFINITY),
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
  // A deletion from before songs were kept arrives empty; the copy here is
  // still the song, so it is what the deletion keeps.
  const local = new Map(records(library).map((record) => [record.id, record.song]))
  const removed = [
    ...library.removed.filter((gone) => !won.has(gone.id)),
    ...newer.flatMap((record): Removed[] =>
      record.active
        ? []
        : [
            {
              id: record.id,
              at: record.at,
              song: record.song ?? local.get(record.id) ?? null,
            },
          ],
    ),
  ]
  return repair([...kept, ...arrived], library.open, removed) ?? library
}
