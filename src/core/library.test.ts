import { describe, expect, it } from 'vitest'
import {
  addEntry,
  openEntry,
  openSong,
  removeEntry,
  repair,
  titleOf,
  withOpenSong,
  type Entry,
  type Library,
} from './library.ts'
import { emptySong, type Song } from './model.ts'

const named = (title: string): Song => ({ ...emptySong(), title })

const entry = (id: string, title = id): Entry => ({
  id,
  song: named(title),
  updatedAt: 0,
})

const shelf = (...ids: readonly string[]): Library => {
  const [first, ...rest] = ids.map((id) => entry(id))
  if (first === undefined) throw new Error('a library needs a song')
  return { songs: [first, ...rest], open: first.id, removed: [] }
}

describe('library', () => {
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
    expect(repair([entry('a'), entry('b')], 'gone', [])?.open).toBe('a')
    expect(repair([entry('a'), entry('b')], 'b', [])?.open).toBe('b')
  })

  it('refuses a document with no songs at all', () => {
    expect(repair([], 'a', [])).toBeNull()
  })
})
