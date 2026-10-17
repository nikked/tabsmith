import { describe, expect, it } from 'vitest'
import {
  addEntry,
  byEdited,
  emptyBand,
  byTitle,
  hasStructure,
  hasTab,
  hasTodo,
  matching,
  retitle,
  stampAfter,
  openEntry,
  openSong,
  openTodos,
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
  lastSynced: null,
})

const shelf = (...ids: readonly string[]): Library => {
  const [first, ...rest] = ids.map((id) => entry(id))
  if (first === undefined) throw new Error('a library needs a song')
  return {
    songs: [first, ...rest],
    open: first.id,
    removed: [],
    setlists: [],
    todos: [],
    band: {
      name: { text: '', updatedAt: 0, syncedAt: null },
      ideas: { text: '', updatedAt: 0, syncedAt: null },
    },
  }
}

describe('stampAfter', () => {
  it('takes the clock when it is ahead, and one past the last stamp when it is not', () => {
    expect(stampAfter(100, 250)).toBe(250)
    expect(stampAfter(300, 250)).toBe(301)
    expect(stampAfter(250, 250)).toBe(251)
  })

  it('keeps an edit newer than a copy from a device whose clock runs fast', () => {
    // Pulled from a phone an hour ahead, then edited here a minute later.
    const pulled: Library = {
      ...shelf('a'),
      songs: [{ ...entry('a'), updatedAt: 3_600_000 }],
    }
    const edited = withOpenSong(pulled, named('changed here'), 60_000)
    expect(edited.songs[0].updatedAt).toBe(3_600_001)
    expect(retitle(pulled, 'a', 'renamed', 60_000).songs[0].updatedAt).toBe(3_600_001)
    expect(removeEntry(shelf('a', 'b'), 'a', 0).removed[0]?.at).toBe(1)
  })
})

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

  it('counts only the todos still to do, not blank or ticked ones', () => {
    const withTodos: Entry = {
      ...entry('a'),
      song: {
        ...named('a'),
        todos: [
          { text: 'Bridge chords', done: false },
          { text: 'Try capo 2', done: true },
          { text: '  ', done: false },
          { text: 'Slower intro?', done: false },
        ],
      },
    }
    expect(openTodos(withTodos)).toBe(2)
    expect(hasTodo(withTodos)).toBe(true)
    expect(hasTodo(entry('b'))).toBe(false)
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
    expect(titleOf({ id: 'a', song: emptySong(), updatedAt: 0, lastSynced: null })).toBe(
      'Untitled',
    )
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
    expect(
      repair({
        songs: [entry('a'), entry('b')],
        open: 'gone',
        removed: [],
        setlists: [],
        todos: [],
        band: emptyBand,
      })?.open,
    ).toBe('a')
    expect(
      repair({
        songs: [entry('a'), entry('b')],
        open: 'b',
        removed: [],
        setlists: [],
        todos: [],
        band: emptyBand,
      })?.open,
    ).toBe('b')
  })

  it('refuses a document with no songs at all', () => {
    expect(
      repair({
        songs: [],
        open: 'a',
        removed: [],
        setlists: [],
        todos: [],
        band: emptyBand,
      }),
    ).toBeNull()
  })
})
