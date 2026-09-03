import type { Song } from './model.ts'

/**
 * A song and the name the library knows it by. The id is what survives a
 * retitling, so switching songs cannot lose track of which one is open.
 */
export type Entry = {
  readonly id: string
  readonly song: Song
}

/**
 * At least one, the same way a score holds at least one row: an empty library
 * has nothing to open, so it is a state the type will not let you build.
 */
export type Songs = readonly [Entry, ...Entry[]]

/** The whole shelf, in the order it is shown, and which of them is open. */
export type Library = {
  readonly songs: Songs
  readonly open: string
}

/** `open` can only dangle if something built a library without `repair`. */
export const openEntry = (library: Library): Entry =>
  library.songs.find((entry) => entry.id === library.open) ?? library.songs[0]

export const titleOf = (entry: Entry): string =>
  entry.song.title === '' ? 'Untitled' : entry.song.title

/** The editor holds the open song; this is how it gets back to the shelf. */
export const withOpenSong = (library: Library, song: Song): Library => {
  const [first, ...rest] = library.songs
  const update = (entry: Entry): Entry =>
    entry.id === library.open ? { ...entry, song } : entry
  return { ...library, songs: [update(first), ...rest.map(update)] }
}

/** A song is added at the end and opened, because you added it to work on it. */
export const addEntry = (library: Library, entry: Entry): Library => ({
  songs: [...library.songs, entry],
  open: entry.id,
})

/**
 * Removing the open song opens the one that took its place, or the last one
 * when it was the last. The final song is never removed — Clear is what empties
 * a song, and the button that calls this is disabled there.
 */
export const removeEntry = (library: Library, id: string): Library => {
  const index = library.songs.findIndex((entry) => entry.id === id)
  if (index < 0) return library
  const [first, ...rest] = library.songs.filter((entry) => entry.id !== id)
  if (first === undefined) return library
  const songs: Songs = [first, ...rest]
  if (library.open !== id) return { ...library, songs }
  return { songs, open: (songs[Math.min(index, songs.length - 1)] ?? first).id }
}

export const openSong = (library: Library, id: string): Library =>
  library.songs.some((entry) => entry.id === id) ? { ...library, open: id } : library

/**
 * The one way in from a decoded document. A library that says nothing is open
 * is repaired rather than refused — the songs in it are still perfectly good —
 * but one with no songs at all cannot be anything.
 */
export const repair = (songs: readonly Entry[], open: string): Library | null => {
  const [first, ...rest] = songs
  if (first === undefined) return null
  const all: Songs = [first, ...rest]
  return { songs: all, open: all.some((entry) => entry.id === open) ? open : first.id }
}
