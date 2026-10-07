import { describe, expect, it } from 'vitest'
import type { Library } from './core/library.ts'
import { emptySong } from './core/model.ts'
import { DEMO_TITLE } from './demo.ts'
import { fromWire, setlistsToWire, toSheet, toWire } from './sync.ts'

const library: Library = {
  songs: [{ id: 'a', song: { ...emptySong(), title: 'Slow Machine' }, updatedAt: 1 }],
  open: 'a',
  removed: [{ id: 'b', at: 2, song: { ...emptySong(), title: 'Old Riff' } }],
  setlists: [
    { id: 'gig', name: 'Friday', songs: ['a', 'b'], active: true, updatedAt: 3 },
    { id: 'old', name: 'Spring tour', songs: [], active: false, updatedAt: 4 },
  ],
}

describe('sync wire format', () => {
  it('round-trips the shelf through what the sheet stores', async () => {
    const { records: sent, tooLong } = await toSheet(library)
    expect(tooLong).toEqual([])
    expect(sent.map(({ id, at, title, active }) => [id, at, title, active])).toEqual([
      ['a', 1, 'Slow Machine', true],
      ['b', 2, 'Old Riff', false],
    ])
    const pulled = await fromWire({
      ok: true,
      records: sent,
      setlists: setlistsToWire(library),
    })
    expect(pulled).toEqual({
      ok: true,
      records: [
        { id: 'a', at: 1, active: true, song: library.songs[0].song },
        { id: 'b', at: 2, active: false, song: library.removed[0]?.song },
      ],
      setlists: library.setlists,
    })
  })

  it('keeps the demo off the sheet, edited or deleted, until it is renamed', () => {
    const demo = { ...emptySong(), title: DEMO_TITLE }
    const sent = toWire({
      ...library,
      songs: [
        { id: 'demo', song: demo, updatedAt: 5 },
        { id: 'mine', song: { ...demo, title: 'Slow Machine' }, updatedAt: 6 },
      ],
      open: 'demo',
      removed: [{ id: 'gone', at: 7, song: demo }],
    })
    expect(sent.map(({ id }) => id)).toEqual(['mine'])
  })

  it('reads a sheet from before songs were packed, deleted songs kept or setlists existed', async () => {
    const [kept] = toWire(library)
    const pulled = await fromWire({
      ok: true,
      records: [
        { id: 'a', at: 1, song: kept?.song },
        { id: 'b', at: 2, song: null },
      ],
    })
    expect(pulled).toEqual({
      ok: true,
      records: [
        { id: 'a', at: 1, active: true, song: library.songs[0].song },
        { id: 'b', at: 2, active: false, song: null },
      ],
      setlists: [],
    })
  })

  it('drops a row that is no longer a song rather than failing the sync', async () => {
    const pulled = await fromWire({
      ok: true,
      records: [
        { id: 'a', at: 1, song: 'not json' },
        { id: '', at: 1, song: null },
        { id: 'c', at: 'yesterday', song: null },
        { id: 'd', at: 3, song: null },
        { id: 'e', at: 4, song: null, active: true },
        { id: 'f', at: 5, song: 'not json', active: false },
      ],
      setlists: [
        { id: 'gig', at: 1, name: 'Friday', songs: 'a,b', active: true },
        { id: 'ok', at: 1, name: 'Rehearsal', songs: ['a'], active: true },
      ],
    })
    expect(pulled).toEqual({
      ok: true,
      records: [
        { id: 'd', at: 3, active: false, song: null },
        { id: 'f', at: 5, active: false, song: null },
      ],
      setlists: [
        { id: 'ok', name: 'Rehearsal', songs: ['a'], active: true, updatedAt: 1 },
      ],
    })
  })

  it('passes on what the sheet refused, and refuses what is not a reply', async () => {
    expect(await fromWire({ ok: false, error: 'wrong token' })).toEqual({
      ok: false,
      error: 'The database said: wrong token',
    })
    expect((await fromWire('<html>')).ok).toBe(false)
  })

  it('keeps a song too long for a cell here and names it, and still syncs its deletion', async () => {
    let seed = 1
    const noise = Array.from({ length: 120_000 }, () => {
      seed = (seed * 48271) % 2147483647
      return String.fromCharCode(33 + (seed % 90))
    }).join('')
    const long = {
      ...emptySong(),
      title: 'Epic',
      chart: [{ name: 'Verse', body: noise }],
    }
    const { records: sent, tooLong } = await toSheet({
      ...library,
      songs: [...library.songs, { id: 'epic', song: long, updatedAt: 5 }],
      removed: [{ id: 'gone', at: 6, song: { ...long, title: 'Gone' } }],
    })
    expect(tooLong).toEqual(['Epic'])
    expect(sent.map(({ id, song }) => [id, song === null])).toEqual([
      ['a', false],
      ['gone', true],
    ])
  })
})
