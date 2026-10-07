import { describe, expect, it } from 'vitest'
import {
  addEntry,
  byEdited,
  byTitle,
  hasStructure,
  hasTab,
  matching,
  retitle,
  openEntry,
  openSong,
  removeEntry,
  repair,
  titleOf,
  withOpenSong,
  type Entry,
  type Library,
} from './library.ts'
import { emptyRow, emptySong, type Song } from './model.ts'

const named = (title: string): Song => ({ ...emptySong(), title })

const entry = (id: string, title = id): Entry => ({
  id,
  song: named(title),
  updatedAt: 0,
})

const shelf = (...ids: readonly string[]): Library => {
  const [first, ...rest] = ids.map((id) => entry(id))
  if (first === undefined) throw new Error('a library needs a song')
  return { songs: [first, ...rest], open: first.id, removed: [], setlists: [] }
}

describe('library', () => {
  it('sorts by the name shown, ignoring case and accents', () => {
    const songs = [
      entry('c', 'smör'),
      entry('a', 'Whirled'),
      entry('b', ''),
      entry('d', 'Apple'),
    ]
    expect(byTitle(songs).map(titleOf)).toEqual(['Apple', 'smör', 'Untitled', 'Whirled'])
    expect(songs.map((each) => each.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('tells a song with a tab from one with only the empty staff', () => {
    const blank = entry('a')
    const written = {
      ...blank,
      song: {
        ...blank.song,
        tab: { ...blank.song.tab, rows: [{ ...emptyRow(1, 2, 6), title: 'Riff' }] },
      },
    }
    expect(hasTab(blank)).toBe(false)
    expect(hasTab(written)).toBe(true)
  })

  it('counts a song as structured once two sections have something under them', () => {
    const withChart = (...bodies: readonly string[]): Entry => ({
      ...entry('a'),
      song: {
        ...named('a'),
        chart: bodies.map((body, index) => ({ name: `Part ${index}`, body })),
      },
    })
    expect(hasStructure(withChart('Am', 'C'))).toBe(true)
    expect(hasStructure(withChart('Am', '  '))).toBe(false)
    expect(hasStructure(withChart('Am'))).toBe(false)
    expect(hasStructure(entry('a'))).toBe(false)
  })

  it('puts the most recently edited song first', () => {
    const songs = [
      { ...entry('a'), updatedAt: 1 },
      { ...entry('b'), updatedAt: 3 },
      { ...entry('c'), updatedAt: 2 },
    ]
    expect(byEdited(songs).map((each) => each.id)).toEqual(['b', 'c', 'a'])
  })

  it('finds songs by any part of the shown name, ignoring case and accents', () => {
    const songs = [entry('a', 'Smör'), entry('b', 'Whirled'), entry('c', '')]
    expect(matching(songs, 'SMOR').map((each) => each.id)).toEqual(['a'])
    expect(matching(songs, 'irl').map((each) => each.id)).toEqual(['b'])
    expect(matching(songs, 'untit').map((each) => each.id)).toEqual(['c'])
    expect(matching(songs, '  ')).toBe(songs)
  })

  it('renames one song and stamps only that one', () => {
    const renamed = retitle(shelf('a', 'b'), 'b', 'Paper planes', 9)
    expect(renamed.songs.map(titleOf)).toEqual(['a', 'Paper planes'])
    expect(renamed.songs.map((each) => each.updatedAt)).toEqual([0, 9])
  })

  it('names an untitled song rather than showing a blank row', () => {
    expect(titleOf({ id: 'a', song: emptySong(), updatedAt: 0 })).toBe('Untitled')
    expect(titleOf(entry('a', 'Slow Machine'))).toBe('Slow Machine')
  })

  it('writes the open song back without touching the others', () => {
    const before = openSong(shelf('a', 'b'), 'b')
    const after = withOpenSong(before, named('Rewritten'), 5)
    expect(after.songs.map((each) => each.song.title)).toEqual(['a', 'Rewritten'])
    expect(after.songs[0]).toBe(before.songs[0])
    expect(openEntry(after).updatedAt).toBe(5)
  })

  it('does not count the same song coming back as an edit', () => {
    const before = shelf('a')
    expect(withOpenSong(before, before.songs[0].song, 5)).toBe(before)
  })

  it('opens what it adds, because you added it to work on it', () => {
    const added = addEntry(shelf('a'), entry('b'))
    expect(added.open).toBe('b')
    expect(openEntry(added).song.title).toBe('b')
  })

  it('opens what took the place of a removed song', () => {
    const three = openSong(shelf('a', 'b', 'c'), 'b')
    expect(removeEntry(three, 'b', 1).open).toBe('c')
  })

  it('falls back to the last song when the removed one was last', () => {
    const three = openSong(shelf('a', 'b', 'c'), 'c')
    expect(removeEntry(three, 'c', 1).open).toBe('b')
  })

  it('leaves the open song alone when another is removed', () => {
    const three = openSong(shelf('a', 'b', 'c'), 'a')
    const after = removeEntry(three, 'c', 7)
    expect(after.open).toBe('a')
    expect(after.songs.map((each) => each.id)).toEqual(['a', 'b'])
    expect(after.removed).toEqual([{ id: 'c', at: 7, song: named('c') }])
  })

  it('never removes the only song, so there is always one to open', () => {
    const one = shelf('a')
    expect(removeEntry(one, 'a', 1)).toBe(one)
  })

  it('ignores a song that is not on the shelf', () => {
    const two = shelf('a', 'b')
    expect(removeEntry(two, 'gone', 1)).toBe(two)
    expect(openSong(two, 'gone')).toBe(two)
  })

  it('repairs a document whose open song is not on the shelf', () => {
    expect(repair([entry('a'), entry('b')], 'gone', [], [])?.open).toBe('a')
    expect(repair([entry('a'), entry('b')], 'b', [], [])?.open).toBe('b')
  })

  it('refuses a document with no songs at all', () => {
    expect(repair([], 'a', [], [])).toBeNull()
  })
})
