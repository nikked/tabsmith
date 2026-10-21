import { scoreHasContent } from './edit.ts'
import { isOpen, type Song } from './model.ts'

/**
 * A song and the name the library knows it by. The id is what survives a
 * retitling, so switching songs cannot lose track of which one is open.
 */
export type Entry = {
  readonly id: string
  readonly song: Song
  /** Epoch ms of the last edit, which is all another device has to compare by. */
  readonly updatedAt: number
  /**
   * The version the sheet last held, as far as this device knows: what a sync
   * last sent up or brought down. An edit since then is one the sheet has not
   * seen, and it is what two devices' edits are told apart by. Null for a song
   * that has never been through a sync.
   */
  readonly lastSynced: { readonly at: number; readonly song: Song } | null
}

/** Edited here since the sheet last saw it, or never seen by the sheet at all. */
export const isUnsynced = (entry: Entry): boolean =>
  entry.lastSynced?.at !== entry.updatedAt

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
  /**
   * Where it goes among the setlists, lowest first. Stamped with the rest of
   * it, so an order set on one device reaches the others.
   */
  readonly position: number
  readonly updatedAt: number
  /** The stamp the sheet was last seen holding it at; null for never. */
  readonly syncedAt: number | null
}

/**
 * Something the band has to sort out that is no one song's: strings to buy, a
 * room to book. Each is stamped and synced on its own, so two people ticking
 * different ones offline both keep their ticks. Clearing or removing one only
 * marks it inactive, the way a deleted setlist is kept, so a device that has
 * not heard yet cannot bring it back.
 */
export type BandTodo = {
  readonly id: string
  readonly text: string
  readonly done: boolean
  /** Under the nearest shown item above that is not; one level deep, never the first. */
  readonly indented: boolean
  readonly active: boolean
  /**
   * Where it goes in the list, lowest first. Not a whole number when put
   * between two others, so placing one stamps it alone.
   */
  readonly position: number
  readonly updatedAt: number
  /** The stamp the sheet was last seen holding it at; null for never. */
  readonly syncedAt: number | null
}

/**
 * One of the band's own texts, stamped as a whole, so the newer of two offline
 * edits wins.
 */
export type BandField = {
  readonly text: string
  readonly updatedAt: number
  /** The stamp the sheet was last seen holding it at; null for never. */
  readonly syncedAt: number | null
}

/** What is the band's rather than any song's: its name, and ideas no song has yet. */
export type Band = { readonly name: BandField; readonly ideas: BandField }

export const BAND_FIELDS = ['name', 'ideas'] as const satisfies readonly (keyof Band)[]

/** Never edited, so any copy from another device wins over it. */
export const emptyBand: Band = {
  name: { text: '', updatedAt: 0, syncedAt: null },
  ideas: { text: '', updatedAt: 0, syncedAt: null },
}

/**
 * A setlist, band todo or band field changed here since the sheet was last
 * seen holding it. A band field never edited has nothing to send.
 */
export const isUnsent = (item: {
  readonly updatedAt: number
  readonly syncedAt: number | null
}): boolean => item.updatedAt !== 0 && item.syncedAt !== item.updatedAt

/** The whole shelf, in the order it is shown, and which of them is open. */
export type Library = {
  readonly songs: Songs
  readonly open: string
  readonly removed: readonly Removed[]
  readonly setlists: readonly Setlist[]
  readonly todos: readonly BandTodo[]
  readonly band: Band
}

/**
 * When an edit to something last stamped `previous` happens, by this device's
 * clock. Never at or before `previous`: a clock running slow, or a stamp that
 * came from a device whose clock runs fast, must not make a fresh edit look
 * older than what it changed, or a sync would throw it away.
 */
export const stampAfter = (previous: number, at: number): number =>
  Math.max(at, previous + 1)

/** `open` can only dangle if something built a library without `repair`. */
export const openEntry = (library: Library): Entry =>
  library.songs.find((entry) => entry.id === library.open) ?? library.songs[0]

/**
 * HH:MM by this device's clock, spelled out rather than left to the locale,
 * which writes 14.13 in some places.
 */
export const clockOf = (at: number): string => {
  const time = new Date(at)
  return [time.getHours(), time.getMinutes()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

export const titleOf = (entry: Entry): string =>
  entry.song.title === '' ? 'Untitled' : entry.song.title

const byName = (a: Entry, b: Entry): number =>
  titleOf(a).localeCompare(titleOf(b), undefined, { sensitivity: 'base' })

/**
 * By name, the way a person looks one up: case and accents do not reorder it,
 * and an untitled song sorts as Untitled because that is what it shows as.
 */
export const byTitle = (entries: readonly Entry[]): readonly Entry[] =>
  [...entries].sort(byName)

export type SongOrder = 'name' | 'edited' | 'bpm'
export type Direction = 'asc' | 'desc'

/**
 * Which way each order starts: names A to Z, the newest edit first for finding
 * what you were working on, the slowest song first.
 */
export const DEFAULT_DIRECTION: Readonly<Record<SongOrder, Direction>> = {
  name: 'asc',
  edited: 'desc',
  bpm: 'asc',
}

const ascending: Readonly<Record<SongOrder, (a: Entry, b: Entry) => number>> = {
  name: byName,
  edited: (a, b) => a.updatedAt - b.updatedAt,
  bpm: (a, b) => (a.song.bpm ?? 0) - (b.song.bpm ?? 0),
}

/**
 * Songs in the order asked for, ties by name. A song with no tempo has no place
 * among the tempos, so it goes last whichever way they run.
 */
export const sortSongs = (
  entries: readonly Entry[],
  order: SongOrder,
  direction: Direction,
): readonly Entry[] => {
  const sign = direction === 'asc' ? 1 : -1
  return [...entries].sort((a, b) => {
    const untimed = Number(a.song.bpm === null) - Number(b.song.bpm === null)
    if (order === 'bpm' && untimed !== 0) return untimed
    return sign * ascending[order](a, b) || byName(a, b)
  })
}

/** A tab something has been written into, rather than the empty staff every song starts with. */
export const hasTab = (entry: Entry): boolean => scoreHasContent(entry.song.tab)

/**
 * A chart worked out into parts: at least two sections with something written
 * under them. A name alone is not a part — every song starts with an Intro.
 */
export const hasStructure = (entry: Entry): boolean =>
  entry.song.chart.filter((section) => section.body.trim() !== '').length >= 2

/** Todos still to do: a blank one or a ticked one is not waiting on anyone. */
export const openTodos = (entry: Entry): number => entry.song.todos.filter(isOpen).length

export const hasTodo = (entry: Entry): boolean => openTodos(entry) > 0

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
    entry.id === id
      ? {
          ...entry,
          song: { ...entry.song, title },
          updatedAt: stampAfter(entry.updatedAt, at),
        }
      : entry
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
    entry.id === library.open
      ? { ...entry, song, updatedAt: stampAfter(entry.updatedAt, at) }
      : entry
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
  const removed = [
    ...library.removed,
    { id, at: stampAfter(gone.updatedAt, at), song: gone.song },
  ]
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
  library: Omit<Library, 'songs'> & { readonly songs: readonly Entry[] },
): Library | null => {
  const [first, ...rest] = library.songs
  if (first === undefined) return null
  const songs: Songs = [first, ...rest]
  return {
    ...library,
    songs,
    open: songs.some((entry) => entry.id === library.open) ? library.open : first.id,
  }
}
