import { describe, expect, it } from 'vitest'
import type { Entry, Library } from './library.ts'
import { emptySong, type Song } from './model.ts'
import { forgetSent, merge, records, type Synced } from './sync.ts'

const named = (title: string): Song => ({ ...emptySong(), title })

const entry = (id: string, updatedAt: number, title = id): Entry => ({
  id,
  song: named(title),
  updatedAt,
})

const shelf = (...songs: readonly Entry[]): Library => {
  const [first, ...rest] = songs
  if (first === undefined) throw new Error('a library needs a song')
  return { songs: [first, ...rest], open: first.id, removed: [], setlists: [] }
}

const titles = (library: Library) => library.songs.map((each) => each.song.title)

const live = (id: string, at: number, title = id): Synced => ({
  id,
  at,
  active: true,
  song: named(title),
})

const gone = (id: string, at: number, song: Song | null = named(id)): Synced => ({
  id,
  at,
  active: false,
  song,
})

describe('sync', () => {
  it('lists every song and every deletion, each with its time and its song', () => {
    const library = {
      ...shelf(entry('a', 1)),
      removed: [{ id: 'b', at: 2, song: named('b') }],
    }
    expect(
      records(library).map(({ id, at, active, song }) => [id, at, active, song?.title]),
    ).toEqual([
      ['a', 1, true, 'a'],
      ['b', 2, false, 'b'],
    ])
  })

  it('comes back untouched when nothing remote is newer', () => {
    const library = shelf(entry('a', 5))
    expect(merge(library, [live('a', 5, 'theirs')])).toBe(library)
    expect(merge(library, [live('a', 4, 'theirs')])).toBe(library)
    expect(merge(library, [])).toBe(library)
  })

  it('takes a newer copy of a song in the place it already has', () => {
    const merged = merge(shelf(entry('a', 1), entry('b', 1)), [live('a', 2, 'newer a')])
    expect(titles(merged)).toEqual(['newer a', 'b'])
    expect(merged.songs[0].updatedAt).toBe(2)
  })

  it('adds a song this device has never seen at the end', () => {
    const merged = merge(shelf(entry('a', 1)), [live('z', 1)])
    expect(titles(merged)).toEqual(['a', 'z'])
    expect(merged.open).toBe('a')
  })

  it('takes a song off the shelf that was deleted elsewhere, and leaves remembering it to the sheet', () => {
    const merged = merge(shelf(entry('a', 1), entry('b', 1)), [gone('b', 2)])
    expect(titles(merged)).toEqual(['a'])
    expect(merged.removed).toEqual([])
  })

  it('changes nothing for a deletion of a song this device does not have', () => {
    const library = shelf(entry('a', 1))
    expect(merge(library, [gone('z', 2), gone('y', 3, null)])).toBe(library)
  })

  it('forgets a deletion here once the sheet has a newer one', () => {
    const library = {
      ...shelf(entry('a', 1)),
      removed: [{ id: 'b', at: 2, song: named('b') }],
    }
    expect(merge(library, [gone('b', 3)]).removed).toEqual([])
  })

  it('keeps a song edited here after it was deleted elsewhere', () => {
    const library = shelf(entry('a', 1), entry('b', 3))
    expect(merge(library, [gone('b', 2)])).toBe(library)
  })

  it('does not bring back a song deleted here by an older copy', () => {
    const library = {
      ...shelf(entry('a', 1)),
      removed: [{ id: 'b', at: 2, song: named('b') }],
    }
    expect(merge(library, [live('b', 1)])).toBe(library)
  })

  it('brings back a song deleted here when it was edited later elsewhere', () => {
    const library = {
      ...shelf(entry('a', 1)),
      removed: [{ id: 'b', at: 2, song: named('b') }],
    }
    const merged = merge(library, [live('b', 3)])
    expect(titles(merged)).toEqual(['a', 'b'])
    expect(merged.removed).toEqual([])
  })

  it('opens another song when the open one was deleted elsewhere', () => {
    const library = { ...shelf(entry('a', 1), entry('b', 1)), open: 'b' }
    expect(merge(library, [gone('b', 2)]).open).toBe('a')
  })

  it('keeps the shelf rather than empty it when every song was deleted elsewhere', () => {
    const library = shelf(entry('a', 1))
    expect(merge(library, [gone('a', 2)])).toBe(library)
  })

  it('forgets the deletions a sync sent, and keeps one made while it was on its way', () => {
    const sent = {
      ...shelf(entry('a', 1)),
      removed: [{ id: 'b', at: 2, song: named('b') }],
    }
    const library = {
      ...sent,
      removed: [...sent.removed, { id: 'c', at: 3, song: named('c') }],
    }
    expect(forgetSent(library, sent).removed).toEqual([
      { id: 'c', at: 3, song: named('c') },
    ])
  })

  it('comes back untouched when a sync sent no deletions', () => {
    const library = {
      ...shelf(entry('a', 1)),
      removed: [{ id: 'b', at: 2, song: named('b') }],
    }
    expect(forgetSent(library, shelf(entry('a', 1)))).toBe(library)
  })
})
