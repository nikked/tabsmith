import { describe, expect, it } from 'vitest'
import type { Entry, Library, Setlist } from './library.ts'
import { emptySong } from './model.ts'
import {
  activeSetlists,
  addSetlist,
  addToSetlist,
  deleteSetlist,
  moveInSetlist,
  placeInSetlist,
  placeOf,
  removeFromSetlist,
  renameSetlist,
  setlistsWith,
  songsOf,
} from './setlists.ts'
import { mergeSetlists } from './sync.ts'

const entry = (id: string): Entry => ({
  id,
  song: { ...emptySong(), title: id },
  updatedAt: 0,
})

const set = (
  id: string,
  songs: readonly string[],
  updatedAt = 1,
  name = id,
): Setlist => ({
  id,
  name,
  songs,
  active: true,
  updatedAt,
})

const shelf = (...setlists: readonly Setlist[]): Library => ({
  songs: [entry('a'), entry('b'), entry('c')],
  open: 'a',
  removed: [],
  setlists,
})

const songsIn = (library: Library, id: string) =>
  library.setlists.find((setlist) => setlist.id === id)?.songs

describe('setlists', () => {
  it('lists songs in the setlist order, leaving out ones not on the shelf', () => {
    const library = shelf(set('gig', ['c', 'gone', 'a']))
    const [gig] = library.setlists
    if (gig === undefined) throw new Error('no setlist')
    expect(songsOf(library, gig).map((each) => each.id)).toEqual(['c', 'a'])
  })

  it('names the active setlists a song is in', () => {
    const library = shelf(set('one', ['a']), set('two', ['b']), {
      ...set('gone', ['a']),
      active: false,
    })
    expect(setlistsWith(library, 'a').map((setlist) => setlist.id)).toEqual(['one'])
  })

  it('places a song in its setlist, with the songs either side of it', () => {
    const library = shelf(set('gig', ['c', 'gone', 'a', 'b']))
    expect(placeOf(library, 'gig', 'a')).toMatchObject({
      index: 1,
      count: 3,
      previous: 'c',
      next: 'b',
    })
    expect(placeOf(library, 'gig', 'c')).toMatchObject({ previous: null, next: 'a' })
    expect(placeOf(library, 'gig', 'b')).toMatchObject({ index: 2, next: null })
  })

  it('has no place for a song not in the setlist, or in a deleted one', () => {
    expect(placeOf(shelf(set('gig', ['a'])), 'gig', 'b')).toBeNull()
    expect(placeOf(shelf({ ...set('gig', ['a']), active: false }), 'gig', 'a')).toBeNull()
    expect(placeOf(shelf(), 'gig', 'a')).toBeNull()
  })

  it('adds a setlist at the end', () => {
    const library = addSetlist(shelf(set('one', [])), set('two', []))
    expect(library.setlists.map((setlist) => setlist.id)).toEqual(['one', 'two'])
  })

  it('stamps every change, so sync can tell which copy is newer', () => {
    const library = shelf(set('gig', ['a'], 1))
    expect(renameSetlist(library, 'gig', 'Friday', 5).setlists[0]).toMatchObject({
      name: 'Friday',
      updatedAt: 5,
    })
    expect(addToSetlist(library, 'gig', 'b', 6).setlists[0]?.updatedAt).toBe(6)
  })

  it('keeps a deleted setlist, only marked inactive and hidden', () => {
    const library = deleteSetlist(shelf(set('gig', ['a']), set('other', [])), 'gig', 4)
    expect(library.setlists[0]).toMatchObject({ id: 'gig', active: false, songs: ['a'] })
    expect(activeSetlists(library).map((setlist) => setlist.id)).toEqual(['other'])
  })

  it('puts one song in several setlists, but only once in each', () => {
    let library = shelf(set('one', []), set('two', []))
    library = addToSetlist(library, 'one', 'a', 2)
    library = addToSetlist(library, 'two', 'a', 2)
    expect(songsIn(library, 'one')).toEqual(['a'])
    expect(songsIn(library, 'two')).toEqual(['a'])
    expect(addToSetlist(library, 'one', 'a', 3)).toBe(library)
  })

  it('takes a song out of one setlist and leaves the shelf and other setlists alone', () => {
    const library = removeFromSetlist(
      shelf(set('one', ['a', 'b']), set('two', ['a'])),
      'one',
      'a',
      2,
    )
    expect(songsIn(library, 'one')).toEqual(['b'])
    expect(songsIn(library, 'two')).toEqual(['a'])
    expect(library.songs).toHaveLength(3)
  })

  it('moves a song so it lands at the index asked for', () => {
    const library = shelf(set('gig', ['a', 'b', 'c']))
    expect(songsIn(moveInSetlist(library, 'gig', 'a', 2, 2), 'gig')).toEqual([
      'b',
      'c',
      'a',
    ])
    expect(songsIn(moveInSetlist(library, 'gig', 'c', 0, 2), 'gig')).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('places a dragged song where it was dropped, adding it if it was not there', () => {
    const library = shelf(set('gig', ['a', 'b']))
    expect(songsIn(placeInSetlist(library, 'gig', 'c', 1, 2), 'gig')).toEqual([
      'a',
      'c',
      'b',
    ])
    expect(songsIn(placeInSetlist(library, 'gig', 'c', 9, 2), 'gig')).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(songsIn(placeInSetlist(library, 'gig', 'b', 0, 2), 'gig')).toEqual(['b', 'a'])
    expect(placeInSetlist(library, 'gig', 'a', 0, 2)).toBe(library)
  })

  it('treats an edit that changes nothing as no edit, so nothing is stamped', () => {
    const library = shelf(set('gig', ['a', 'b']))
    expect(moveInSetlist(library, 'gig', 'a', 0, 9)).toBe(library)
    expect(moveInSetlist(library, 'gig', 'a', 5, 9)).toBe(library)
    expect(moveInSetlist(library, 'gig', 'c', 0, 9)).toBe(library)
    expect(removeFromSetlist(library, 'gig', 'c', 9)).toBe(library)
  })

  it.each([
    [0, ['c', 'a', 'b']],
    [1, ['a', 'c', 'b']],
    [2, ['a', 'b', 'c']],
  ] as const)(
    'drops at visible position %i while retaining unavailable songs',
    (to, expected) => {
      for (const ids of [
        ['gone', 'a', 'missing', 'b', 'c', 'later'],
        ['gone', 'a', 'missing', 'b', 'later'],
      ]) {
        const library = shelf(set('gig', ids))
        const placed = placeInSetlist(library, 'gig', 'c', to, 2)
        const gig = placed.setlists[0]
        if (gig === undefined) throw new Error('no setlist')
        expect(songsOf(placed, gig).map((each) => each.id)).toEqual(expected)
        expect(gig.songs).toEqual(expect.arrayContaining(['gone', 'missing', 'later']))
      }
    },
  )

  it('does not stamp a drop onto the same visible position', () => {
    const library = shelf(set('gig', ['gone', 'a', 'missing', 'b', 'c']))
    expect(placeInSetlist(library, 'gig', 'a', 0, 9)).toBe(library)
    expect(placeInSetlist(library, 'gig', 'b', 1, 9)).toBe(library)
    expect(placeInSetlist(library, 'gig', 'c', 2, 9)).toBe(library)
  })
})

describe('mergeSetlists', () => {
  it('comes back untouched when nothing remote is newer', () => {
    const library = shelf(set('gig', ['a'], 5))
    expect(mergeSetlists(library, [set('gig', ['b'], 5)])).toBe(library)
    expect(mergeSetlists(library, [set('gig', ['b'], 4)])).toBe(library)
    expect(mergeSetlists(library, [])).toBe(library)
  })

  it('takes a newer copy in place and adds unseen ones at the end', () => {
    const library = shelf(set('one', ['a'], 1), set('two', [], 1))
    const merged = mergeSetlists(library, [
      set('one', ['b', 'a'], 2),
      set('new', ['c'], 1),
    ])
    expect(merged.setlists.map((setlist) => [setlist.id, setlist.songs])).toEqual([
      ['one', ['b', 'a']],
      ['two', []],
      ['new', ['c']],
    ])
  })

  it('carries a deletion made elsewhere, since it is just a newer copy', () => {
    const library = shelf(set('gig', ['a'], 1))
    const merged = mergeSetlists(library, [{ ...set('gig', ['a'], 2), active: false }])
    expect(activeSetlists(merged)).toEqual([])
  })
})
