import { describe, expect, it } from 'vitest'
import { emptyBand, type Library, type Songs } from './core/library.ts'
import { emptySong } from './core/model.ts'
import { DEMO_TITLE } from './demo.ts'
import {
  bandToWire,
  pendingCount,
  fromWire,
  setlistsToWire,
  todosToWire,
  toSheet,
  toWire,
} from './sync.ts'

const library: Library = {
  songs: [
    {
      id: 'a',
      song: { ...emptySong(), title: 'Slow Machine' },
      updatedAt: 1,
      lastSynced: null,
    },
  ],
  open: 'a',
  removed: [{ id: 'b', at: 2, song: { ...emptySong(), title: 'Old Riff' } }],
  setlists: [
    {
      id: 'gig',
      name: 'Friday',
      songs: ['a', 'b'],
      active: true,
      position: 0,
      updatedAt: 3,
      syncedAt: null,
    },
    {
      id: 'old',
      name: 'Spring tour',
      songs: [],
      active: false,
      position: 1,
      updatedAt: 4,
      syncedAt: null,
    },
  ],
  todos: [
    {
      id: 't1',
      text: 'Buy strings',
      done: true,
      indented: false,
      active: true,
      position: 0,
      updatedAt: 5,
      syncedAt: null,
    },
    {
      id: 't2',
      text: 'Book the room',
      done: false,
      indented: true,
      active: false,
      position: 1,
      updatedAt: 6,
      syncedAt: null,
    },
  ],
  band: {
    name: { text: 'Fättig', updatedAt: 8, syncedAt: null },
    ideas: { text: 'Learn a cover for the encore', updatedAt: 7, syncedAt: null },
  },
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
      todos: todosToWire(library),
      band: bandToWire(library),
    })
    expect(pulled).toEqual({
      ok: true,
      records: [
        { id: 'a', at: 1, active: true, song: library.songs[0].song },
        { id: 'b', at: 2, active: false, song: library.removed[0]?.song },
      ],
      // What came back from the sheet is what the sheet holds.
      setlists: library.setlists.map((each) => ({ ...each, syncedAt: each.updatedAt })),
      todos: library.todos.map((each) => ({ ...each, syncedAt: each.updatedAt })),
      band: {
        name: { ...library.band.name, syncedAt: library.band.name.updatedAt },
        ideas: { ...library.band.ideas, syncedAt: library.band.ideas.updatedAt },
      },
    })
  })

  it('sends only songs edited since their last sync, and every deletion', async () => {
    const synced = { ...emptySong(), title: 'Synced' }
    const { records: sent } = await toSheet({
      ...library,
      songs: [
        { id: 'same', song: synced, updatedAt: 3, lastSynced: { at: 3, song: synced } },
        {
          id: 'edited',
          song: { ...synced, title: 'Edited' },
          updatedAt: 4,
          lastSynced: { at: 3, song: synced },
        },
        { id: 'new', song: { ...synced, title: 'New' }, updatedAt: 5, lastSynced: null },
      ],
    })
    expect(sent.map(({ id, active }) => [id, active])).toEqual([
      ['edited', true],
      ['new', true],
      ['b', false],
    ])
  })

  it('counts what the sheet has not seen: edited songs and deletions, not the demo', () => {
    const synced = { ...emptySong(), title: 'Synced' }
    const songs: Songs = [
      { id: 'same', song: synced, updatedAt: 3, lastSynced: { at: 3, song: synced } },
      { id: 'edited', song: synced, updatedAt: 4, lastSynced: { at: 3, song: synced } },
      { id: 'new', song: emptySong(), updatedAt: 5, lastSynced: null },
      {
        id: 'demo',
        song: { ...emptySong(), title: DEMO_TITLE },
        updatedAt: 6,
        lastSynced: null,
      },
    ]
    expect(
      pendingCount({ ...library, songs, setlists: [], todos: [], band: emptyBand }),
    ).toBe(2)
  })

  it('counts setlists, band todos and band fields the sheet does not hold as they are', () => {
    const only = { ...library, removed: [] }
    // Nothing here was ever held by the sheet: one song, two setlists, two todos, two fields.
    expect(pendingCount(only)).toBe(7)
    const held = {
      ...only,
      setlists: only.setlists.map((each) => ({ ...each, syncedAt: each.updatedAt })),
      todos: only.todos.map((each) => ({ ...each, syncedAt: each.updatedAt })),
      band: {
        name: { ...only.band.name, syncedAt: only.band.name.updatedAt },
        ideas: emptyBand.ideas,
      },
    }
    expect(pendingCount(held)).toBe(1)
  })

  it('keeps the demo off the sheet, edited or deleted, until it is renamed', () => {
    const demo = { ...emptySong(), title: DEMO_TITLE }
    const sent = toWire({
      ...library,
      songs: [
        { id: 'demo', song: demo, updatedAt: 5, lastSynced: null },
        {
          id: 'mine',
          song: { ...demo, title: 'Slow Machine' },
          updatedAt: 6,
          lastSynced: null,
        },
      ],
      open: 'demo',
      removed: [{ id: 'gone', at: 7, song: demo }],
    })
    expect(sent.map(({ id }) => id)).toEqual(['mine'])
  })

  it('reads a sheet from before songs were packed, deleted songs kept, setlists, todos or band fields existed', async () => {
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
      todos: [],
      band: {},
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
      todos: [
        { id: 'loose', at: 1, text: 'Strings', done: 'yes', active: true },
        { id: 'room', at: 2, text: 'Book the room', done: false, active: true },
      ],
      band: [
        { id: 'colour', at: 3, text: 'Not a field the app knows' },
        { id: 'ideas', at: 'later', text: 'Broken' },
      ],
    })
    expect(pulled).toEqual({
      ok: true,
      records: [
        { id: 'd', at: 3, active: false, song: null },
        { id: 'f', at: 5, active: false, song: null },
      ],
      setlists: [
        {
          id: 'ok',
          name: 'Rehearsal',
          songs: ['a'],
          active: true,
          // Second on the sheet; a script from before positions sends none.
          position: 1,
          updatedAt: 1,
          syncedAt: 1,
        },
      ],
      todos: [
        {
          id: 'room',
          text: 'Book the room',
          done: false,
          // A script from before indenting sends none.
          indented: false,
          active: true,
          // Second on the sheet; a script from before positions sends none.
          position: 1,
          updatedAt: 2,
          syncedAt: 2,
        },
      ],
      band: {},
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
      songs: [
        ...library.songs,
        { id: 'epic', song: long, updatedAt: 5, lastSynced: null },
      ],
      removed: [{ id: 'gone', at: 6, song: { ...long, title: 'Gone' } }],
    })
    expect(tooLong).toEqual(['Epic'])
    expect(sent.map(({ id, song }) => [id, song === null])).toEqual([
      ['a', false],
      ['gone', true],
    ])
  })
})
