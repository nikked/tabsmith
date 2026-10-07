import type { Entry, Library, Setlist } from './library.ts'

/** A deleted setlist is kept for the sheet, so everything shown filters it out. */
export const activeSetlists = (library: Library): readonly Setlist[] =>
  library.setlists.filter((setlist) => setlist.active)

/**
 * The songs a setlist names, in its order. One that has since been deleted, or
 * has not arrived on this device yet, is left out rather than shown as a gap.
 */
export const songsOf = (library: Library, setlist: Setlist): readonly Entry[] =>
  setlist.songs.flatMap((id) => library.songs.filter((entry) => entry.id === id))

/** The setlists a song is in, for showing next to it. */
export const setlistsWith = (library: Library, song: string): readonly Setlist[] =>
  activeSetlists(library).filter((setlist) => setlist.songs.includes(song))

/** Where a song sits in a setlist, and the songs either side of it. */
export type Place = {
  readonly setlist: Setlist
  readonly index: number
  readonly count: number
  readonly previous: string | null
  readonly next: string | null
}

/**
 * A song's place in the setlist it was opened from, counting only songs that
 * are on the shelf — the same list the setlist shows. Null when there is no
 * such setlist any more, or the song is not in it.
 */
export const placeOf = (
  library: Library,
  setlist: string,
  song: string,
): Place | null => {
  const found = activeSetlists(library).find((each) => each.id === setlist)
  if (found === undefined) return null
  const songs = songsOf(library, found).map((entry) => entry.id)
  const index = songs.indexOf(song)
  if (index < 0) return null
  return {
    setlist: found,
    index,
    count: songs.length,
    previous: songs[index - 1] ?? null,
    next: songs[index + 1] ?? null,
  }
}

export const addSetlist = (library: Library, setlist: Setlist): Library => ({
  ...library,
  setlists: [...library.setlists, setlist],
})

/** Every change to a setlist is a change to the whole of it, stamped for sync. */
const change = (
  library: Library,
  id: string,
  at: number,
  edit: (setlist: Setlist) => Partial<Pick<Setlist, 'name' | 'songs' | 'active'>>,
): Library => ({
  ...library,
  setlists: library.setlists.map((setlist) =>
    setlist.id === id ? { ...setlist, ...edit(setlist), updatedAt: at } : setlist,
  ),
})

export const renameSetlist = (library: Library, id: string, name: string, at: number) =>
  change(library, id, at, () => ({ name }))

export const deleteSetlist = (library: Library, id: string, at: number) =>
  change(library, id, at, () => ({ active: false }))

const holding = (library: Library, id: string, song: string): Setlist | undefined =>
  library.setlists.find((setlist) => setlist.id === id && setlist.songs.includes(song))

/** A song is in a setlist once; adding it again leaves the setlist as it was. */
export const addToSetlist = (library: Library, id: string, song: string, at: number) =>
  holding(library, id, song) !== undefined
    ? library
    : change(library, id, at, (setlist) => ({ songs: [...setlist.songs, song] }))

export const removeFromSetlist = (
  library: Library,
  id: string,
  song: string,
  at: number,
) =>
  holding(library, id, song) === undefined
    ? library
    : change(library, id, at, (setlist) => ({
        songs: setlist.songs.filter((each) => each !== song),
      }))

/**
 * Lifts a song out and puts it back so it lands at `to` in the finished list,
 * the same contract as moving a tab row. A move that changes nothing is not an
 * edit, so it leaves the library as it was rather than stamping it for sync.
 */
export const moveInSetlist = (
  library: Library,
  id: string,
  song: string,
  to: number,
  at: number,
): Library => {
  const setlist = holding(library, id, song)
  if (setlist === undefined || to < 0 || to >= setlist.songs.length) return library
  if (setlist.songs.indexOf(song) === to) return library
  const rest = setlist.songs.filter((each) => each !== song)
  return change(library, id, at, () => ({
    songs: [...rest.slice(0, to), song, ...rest.slice(to)],
  }))
}

/**
 * Where a dragged song lands: moved within a setlist it is already in, or added
 * at that place in one it is not. `to` counts only visible songs; unavailable
 * ids stay in the list so a later sync can bring their songs back.
 */
export const placeInSetlist = (
  library: Library,
  id: string,
  song: string,
  to: number,
  at: number,
): Library => {
  const setlist = library.setlists.find((each) => each.id === id)
  if (setlist === undefined) return library
  const visible = songsOf(library, setlist).map((entry) => entry.id)
  const from = visible.indexOf(song)
  if (from >= 0 && (from === to || to < 0 || to >= visible.length)) return library

  const rest = setlist.songs.filter((each) => each !== song)
  const before = visible.filter((each) => each !== song)[Math.max(0, to)]
  const index = before === undefined ? rest.length : rest.indexOf(before)
  if (from >= 0) {
    return moveInSetlist(library, id, song, index, at)
  }
  return change(library, id, at, () => ({
    songs: [...rest.slice(0, index), song, ...rest.slice(index)],
  }))
}
