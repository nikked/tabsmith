import { describe, expect, it } from 'vitest'
import type { Entry, Library } from './library.ts'
import { emptySong, type Song } from './model.ts'
import { acknowledge, forgetSent, merge, records, type Synced } from './sync.ts'
import { isUnsynced } from './library.ts'

const named = (title: string): Song => ({ ...emptySong(), title })

const NOW = { at: 1_000, newId: () => 'copy' }

const mergedOf = (library: Library, remote: readonly Synced[]): Library =>
  merge(library, remote, NOW).library

const entry = (id: string, updatedAt: number, title = id): Entry => ({
  id,
  song: named(title),
  updatedAt,
  lastSynced: null,
})

const shelf = (...songs: readonly Entry[]): Library => {
  const [first, ...rest] = songs
  if (first === undefined) throw new Error('a library needs a song')
  return {
    songs: [first, ...rest],
    open: first.id,
    removed: [],
    setlists: [],
    todos: [],
    band: { name: { text: '', updatedAt: 0 }, ideas: { text: '', updatedAt: 0 } },
  }
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
    expect(mergedOf(library, [live('a', 4, 'theirs')])).toBe(library)
    expect(mergedOf(library, [])).toBe(library)
  })

  it('remembers a song as synced once the sheet holds this version of it', () => {
    const library = shelf(entry('a', 5))
    const confirmed = mergedOf(library, [live('a', 5, 'a')])
    expect(confirmed.songs[0].lastSynced).toEqual({ at: 5, song: named('a') })
    expect(isUnsynced(confirmed.songs[0])).toBe(false)
    // Already known to be synced, the same answer again changes nothing.
    expect(mergedOf(confirmed, [live('a', 5, 'a')])).toBe(confirmed)
  })

  it('remembers what it took from the sheet, and what arrived from it', () => {
    const merged = mergedOf(shelf(entry('a', 1)), [
      live('a', 2, 'newer a'),
      live('b', 3, 'b'),
    ])
    expect(merged.songs.map((each) => [each.id, each.lastSynced?.at])).toEqual([
      ['a', 2],
      ['b', 3],
    ])
    expect(merged.songs.some(isUnsynced)).toBe(false)
  })

  it('takes a newer copy of a song in the place it already has', () => {
    const merged = mergedOf(shelf(entry('a', 1), entry('b', 1)), [
      live('a', 2, 'newer a'),
    ])
    expect(titles(merged)).toEqual(['newer a', 'b'])
    expect(merged.songs[0].updatedAt).toBe(2)
  })

  it('adds a song this device has never seen at the end', () => {
    const merged = mergedOf(shelf(entry('a', 1)), [live('z', 1)])
    expect(titles(merged)).toEqual(['a', 'z'])
    expect(merged.open).toBe('a')
  })

  it('takes a song off the shelf that was deleted elsewhere, and leaves remembering it to the sheet', () => {
    const merged = mergedOf(shelf(entry('a', 1), entry('b', 1)), [gone('b', 2)])
    expect(titles(merged)).toEqual(['a'])
    expect(merged.removed).toEqual([])
  })

  it('changes nothing for a deletion of a song this device does not have', () => {
    const library = shelf(entry('a', 1))
    expect(mergedOf(library, [gone('z', 2), gone('y', 3, null)])).toBe(library)
  })

  it('forgets a deletion here once the sheet has a newer one', () => {
    const library = {
      ...shelf(entry('a', 1)),
      removed: [{ id: 'b', at: 2, song: named('b') }],
    }
    expect(mergedOf(library, [gone('b', 3)]).removed).toEqual([])
  })

  // A song both sides last agreed on at 10, as this device and the sheet saw it.
  const agreed = (id: string, here: string, at: number): Entry => ({
    id,
    song: named(here),
    updatedAt: at,
    lastSynced: { at: 10, song: named('agreed') },
  })

  it('takes a newer copy straight over a song not edited here since they agreed', () => {
    const library = shelf(agreed('a', 'agreed', 10))
    const result = merge(library, [live('a', 12, 'theirs')], NOW)
    expect(result.library.songs.map((each) => each.song.title)).toEqual(['theirs'])
    expect(result.conflicts).toEqual([])
  })

  it('keeps this version as a copy when both sides changed the song since they agreed', () => {
    const library = shelf(agreed('a', 'mine', 11))
    const result = merge(library, [live('a', 12, 'theirs')], NOW)
    const [original, copy] = result.library.songs
    expect(original).toMatchObject({ id: 'a', song: named('theirs'), updatedAt: 12 })
    expect(original?.lastSynced?.at).toBe(12)
    expect(copy?.id).toBe('copy')
    expect(copy?.song.title).toMatch(/^mine \(conflict \d\d:\d\d\)$/)
    expect(copy?.lastSynced).toBeNull()
    expect(result.conflicts).toEqual(['mine'])
  })

  it('puts together edits to different parts, and sends the result back up', () => {
    const chorus = { name: 'Chorus', body: 'C' }
    const agreedSong: Song = {
      ...named('agreed'),
      chart: [{ name: 'Verse', body: 'Em' }, chorus],
    }
    const library = shelf({
      id: 'a',
      song: { ...agreedSong, chart: [{ name: 'Verse', body: 'Em D' }, chorus] },
      updatedAt: 11,
      lastSynced: { at: 10, song: agreedSong },
    })
    const theirs: Synced = {
      id: 'a',
      at: 12,
      active: true,
      song: { ...agreedSong, bpm: 90 },
    }
    const result = merge(library, [theirs], NOW)
    const [song] = result.library.songs
    expect(result.conflicts).toEqual([])
    expect(song?.song.bpm).toBe(90)
    expect(song?.song.chart[0]?.body).toBe('Em D')
    expect(song?.lastSynced?.at).toBe(12)
    expect(song !== undefined && isUnsynced(song)).toBe(true)
    expect(song?.updatedAt).toBe(1_000)
  })

  it('keeps the parts that came together when another part collided', () => {
    const agreedSong: Song = { ...named('agreed'), bpm: 100 }
    const library = shelf({
      id: 'a',
      song: { ...agreedSong, bpm: 120, note: 'mine' },
      updatedAt: 11,
      lastSynced: { at: 10, song: agreedSong },
    })
    const theirs: Synced = {
      id: 'a',
      at: 12,
      active: true,
      song: { ...agreedSong, bpm: 90 },
    }
    const result = merge(library, [theirs], NOW)
    const [song, copy] = result.library.songs
    expect(result.conflicts).toEqual(['agreed'])
    expect(song?.song).toMatchObject({ bpm: 90, note: 'mine' })
    expect(song !== undefined && isUnsynced(song)).toBe(true)
    expect(copy?.song).toMatchObject({ bpm: 120, note: 'mine' })
  })

  it('keeps no copy when both sides made the same change', () => {
    const library = shelf(agreed('a', 'same', 11))
    const result = merge(library, [live('a', 12, 'same')], NOW)
    expect(result.library.songs).toHaveLength(1)
    expect(result.conflicts).toEqual([])
  })

  it('makes a copy even when this device stamped its edit later', () => {
    // The sheet changed at 12; this edit, made without seeing it, is stamped 20.
    const result = merge(shelf(agreed('a', 'mine', 20)), [live('a', 12, 'theirs')], NOW)
    expect(result.library.songs.map((each) => each.song.title)).toEqual([
      'theirs',
      expect.stringMatching(/^mine \(conflict/),
    ])
  })

  it('brings back a song edited here that was deleted elsewhere since they agreed', () => {
    const result = merge(shelf(agreed('a', 'mine', 11)), [gone('a', 12)], NOW)
    const [kept] = result.library.songs
    expect(kept?.song.title).toBe('mine')
    expect(kept?.updatedAt).toBe(1_000)
    // One not edited here goes the way it went elsewhere.
    const plain = shelf(agreed('b', 'agreed', 10), entry('c', 1))
    expect(
      merge(plain, [gone('b', 12)], NOW).library.songs.map((each) => each.id),
    ).toEqual(['c'])
  })

  it('goes by newest stamp for a song with no record of agreeing, as before', () => {
    const library = shelf(entry('a', 5, 'mine'))
    expect(mergedOf(library, [live('a', 6, 'theirs')]).songs[0].song.title).toBe('theirs')
    expect(mergedOf(library, [live('a', 4, 'theirs')])).toBe(library)
  })

  it('keeps a song edited here after it was deleted elsewhere', () => {
    const library = shelf(entry('a', 1), entry('b', 3))
    expect(mergedOf(library, [gone('b', 2)])).toBe(library)
  })

  it('does not bring back a song deleted here by an older copy', () => {
    const library = {
      ...shelf(entry('a', 1)),
      removed: [{ id: 'b', at: 2, song: named('b') }],
    }
    expect(mergedOf(library, [live('b', 1)])).toBe(library)
  })

  it('brings back a song deleted here when it was edited later elsewhere', () => {
    const library = {
      ...shelf(entry('a', 1)),
      removed: [{ id: 'b', at: 2, song: named('b') }],
    }
    const merged = mergedOf(library, [live('b', 3)])
    expect(titles(merged)).toEqual(['a', 'b'])
    expect(merged.removed).toEqual([])
  })

  it('opens another song when the open one was deleted elsewhere', () => {
    const library = { ...shelf(entry('a', 1), entry('b', 1)), open: 'b' }
    expect(mergedOf(library, [gone('b', 2)]).open).toBe('a')
  })

  it('keeps the shelf rather than empty it when every song was deleted elsewhere', () => {
    const library = shelf(entry('a', 1))
    expect(mergedOf(library, [gone('a', 2)])).toBe(library)
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

describe('equal timestamp edits', () => {
  it('merges distinct fields instead of acknowledging different content', () => {
    const base = named('Song')
    const local = shelf({
      id: 'a',
      song: { ...base, bpm: 120 },
      updatedAt: 101,
      lastSynced: { at: 100, song: base },
    })
    const result = merge(
      local,
      [{ id: 'a', at: 101, active: true, song: { ...base, note: 'Remote note' } }],
      NOW,
    )
    expect(result.conflicts).toEqual([])
    expect(result.library.songs[0].song).toMatchObject({ bpm: 120, note: 'Remote note' })
    expect(isUnsynced(result.library.songs[0])).toBe(true)
    expect(result.library.songs[0].updatedAt).toBeGreaterThan(101)
  })

  it('keeps a conflict copy when matching timestamps hide conflicting edits', () => {
    const base = named('Song')
    const local = shelf({
      id: 'a',
      song: { ...base, bpm: 120 },
      updatedAt: 101,
      lastSynced: { at: 100, song: base },
    })
    const result = merge(
      local,
      [{ id: 'a', at: 101, active: true, song: { ...base, bpm: 90 } }],
      NOW,
    )
    expect(result.conflicts).toEqual(['Song'])
    expect(result.library.songs.map((entry) => entry.song.bpm)).toEqual([90, 120])
    expect(result.library.songs[1]?.lastSynced).toBe(null)
  })
})

describe('a sync answered while the song was edited again', () => {
  const agreedSong = named('Song')
  const sentSong: Song = { ...agreedSong, chart: [{ name: 'Verse', body: 'Em' }] }
  const typedSince: Song = { ...agreedSong, chart: [{ name: 'Verse', body: 'Em D' }] }
  const sent = shelf({
    id: 'a',
    song: sentSong,
    updatedAt: 11,
    lastSynced: { at: 10, song: agreedSong },
  })
  const here = shelf({
    id: 'a',
    song: typedSince,
    updatedAt: 12,
    lastSynced: { at: 10, song: agreedSong },
  })
  const echo: Synced = { id: 'a', at: 11, active: true, song: sentSong }

  it('agrees on what was sent and keeps the edit made since as unsynced', () => {
    const agreed = acknowledge(here, sent, [echo])
    expect(agreed.songs[0].lastSynced).toEqual({ at: 11, song: sentSong })
    expect(agreed.songs[0].song).toBe(typedSince)
    expect(isUnsynced(agreed.songs[0])).toBe(true)
    const result = merge(agreed, [echo], NOW)
    expect(result.conflicts).toEqual([])
    expect(result.library.songs.map((each) => each.song)).toEqual([typedSince])
  })

  it('does not agree on a version the sheet holds differently', () => {
    const other: Synced = { ...echo, song: named('theirs') }
    expect(acknowledge(here, sent, [other])).toBe(here)
  })

  it('comes back untouched when nothing sent came back', () => {
    expect(acknowledge(here, sent, [])).toBe(here)
  })
})
