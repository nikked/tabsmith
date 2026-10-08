import { scoreHasContent } from './edit.ts'
import type { Song } from './model.ts'

/**
 * A song and the name the library knows it by. The id is what survives a
 * retitling, so switching songs cannot lose track of which one is open.
 */
export type Entry = {
  readonly id: string
  readonly song: Song
  /** Epoch ms of the last edit, which is all another device has to compare by. */
  readonly updatedAt: number
}

/**
 * A deleted song, remembered only until a sync has told the sheet, which then
 * keeps it marked inactive so no other device's older copy can bring it back.
 * The song goes with it, because deleting only takes a song off the shelf.
 * Null only for a deletion made before songs were kept.
 */
export type Removed = {
  readonly id: string
  readonly at: number
  readonly song: Song | null
}

/**
 * At least one, the same way a score holds at least one row: an empty library
 * has nothing to open, so it is a state the type will not let you build.
 */
export type Songs = readonly [Entry, ...Entry[]]

/**
 * Songs in the order they are played. A setlist holds ids rather than songs, so
 * one song can be in any number of them and an edit shows up in all. Deleting
 * one only marks it inactive, the same way a deleted song is kept in the sheet.
 */
export type Setlist = {
  readonly id: string
  readonly name: string
  readonly songs: readonly string[]
  readonly active: boolean
  readonly updatedAt: number
}

/** The whole shelf, in the order it is shown, and which of them is open. */
export type Library = {
  readonly songs: Songs
  readonly open: string
  readonly removed: readonly Removed[]
  readonly setlists: readonly Setlist[]
}

/** `open` can only dangle if something built a library without `repair`. */
export const openEntry = (library: Library): Entry =>
  library.songs.find((entry) => entry.id === library.open) ?? library.songs[0]

export const titleOf = (entry: Entry): string =>
  entry.song.title === '' ? 'Untitled' : entry.song.title

/**
 * By name, the way a person looks one up: case and accents do not reorder it,
 * and an untitled song sorts as Untitled because that is what it shows as.
 */
export const byTitle = (entries: readonly Entry[]): readonly Entry[] =>
  [...entries].sort((a, b) =>
    titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: 'base' }),
  )

/** Newest edit first, for finding what you were working on. */
export const byEdited = (entries: readonly Entry[]): readonly Entry[] =>
  [...entries].sort((a, b) => b.updatedAt - a.updatedAt)

/** Case and accents folded away, so `smor` finds Smör. */
const folded = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Songs whose shown name contains the query; a blank query is every song. */
export const matching = (entries: readonly Entry[], query: string): readonly Entry[] => {
  const wanted = folded(query.trim())
  return wanted === ''
    ? entries
    : entries.filter((entry) => folded(titleOf(entry)).includes(wanted))
}

/** A tab something has been written into, rather than the empty staff every song starts with. */
export const hasTab = (entry: Entry): boolean => scoreHasContent(entry.song.tab)

/**
 * A chart worked out into parts: at least two sections with something written
 * under them. A name alone is not a part — every song starts with a Verse 1.
 */
export const hasStructure = (entry: Entry): boolean =>
  entry.song.chart.filter((section) => section.body.trim() !== '').length >= 2

/**
 * Renaming a song that is not open. The open one is renamed through the editor
 * instead, which is what holds it while it is open.
 */
export const retitle = (
  library: Library,
  id: string,
  title: string,
  at: number,
): Library => {
  const [first, ...rest] = library.songs
  const update = (entry: Entry): Entry =>
    entry.id === id ? { ...entry, song: { ...entry.song, title }, updatedAt: at } : entry
  return { ...library, songs: [update(first), ...rest.map(update)] }
}

/**
 * The editor holds the open song; this is how it gets back to the shelf. The
 * same song coming back is not an edit, so it changes nothing — not even the
 * timestamp a sync would read as newer.
 */
export const withOpenSong = (library: Library, song: Song, at: number): Library => {
  if (openEntry(library).song === song) return library
  const [first, ...rest] = library.songs
  const update = (entry: Entry): Entry =>
    entry.id === library.open ? { ...entry, song, updatedAt: at } : entry
  return { ...library, songs: [update(first), ...rest.map(update)] }
}

/** A song is added at the end and opened, because you added it to work on it. */
export const addEntry = (library: Library, entry: Entry): Library => ({
  ...library,
  songs: [...library.songs, entry],
  open: entry.id,
})

/**
 * Removing the open song opens the one that took its place, or the last one
 * when it was the last. The final song is never removed, and the button that
 * calls this is disabled there.
 */
export const removeEntry = (library: Library, id: string, at: number): Library => {
  const index = library.songs.findIndex((entry) => entry.id === id)
  const gone = library.songs[index]
  if (gone === undefined) return library
  const [first, ...rest] = library.songs.filter((entry) => entry.id !== id)
  if (first === undefined) return library
  const songs: Songs = [first, ...rest]
  const removed = [...library.removed, { id, at, song: gone.song }]
  if (library.open !== id) return { ...library, songs, removed }
  return {
    ...library,
    songs,
    open: (songs[Math.min(index, songs.length - 1)] ?? first).id,
    removed,
  }
}

export const openSong = (library: Library, id: string): Library =>
  library.songs.some((entry) => entry.id === id) ? { ...library, open: id } : library

/**
 * The one way in from a decoded document. A library that says nothing is open
 * is repaired rather than refused — the songs in it are still perfectly good —
 * but one with no songs at all cannot be anything.
 */
export const repair = (
  songs: readonly Entry[],
  open: string,
  removed: readonly Removed[],
  setlists: readonly Setlist[],
): Library | null => {
  const [first, ...rest] = songs
  if (first === undefined) return null
  const all: Songs = [first, ...rest]
  return {
    songs: all,
    open: all.some((entry) => entry.id === open) ? open : first.id,
    removed,
    setlists,
  }
}
