/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const script = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8')

type Value = string | number | boolean

const sheetWith = (values: Value[][]) => ({
  getLastRow: () => values.length,
  getRange: (row: number, _column: number, count: number, width: number) => ({
    setValues: (next: Value[][]) => {
      if (
        next.some((cells) =>
          cells.some((cell) => typeof cell === 'string' && cell.length > 50000),
        )
      ) {
        throw new Error('Cell exceeds 50,000 characters')
      }
      values.splice(row - 1, count, ...next)
    },
    clearContent: () => {
      values.splice(
        row - 1,
        count,
        ...Array.from({ length: count }, () => Array.from({ length: width }, () => '')),
      )
    },
  }),
})

describe.each([
  {
    name: 'songs',
    write: 'writeRecords',
    record: { id: 'new', at: 2, title: 'New song', song: 'document', active: true },
    oversized: {
      id: 'new',
      at: 2,
      title: 'Long song',
      song: 'x'.repeat(50001),
      active: true,
    },
    row: ['new', 2, 'New song', 'document', true],
  },
  {
    name: 'setlists',
    write: 'writeSetlists',
    record: { id: 'new', at: 2, name: 'Gig', songs: ['song'], active: true },
    oversized: {
      id: 'new',
      at: 2,
      name: 'Gig',
      songs: ['x'.repeat(50001)],
      active: true,
    },
    row: ['new', 2, 'Gig', '["song"]', true],
  },
])('$name sheet writes', ({ write, record, oversized, row }) => {
  const stored: Value[][] = [
    ['id', 'at', 'name', 'document', 'active'],
    ['kept', 1, 'Kept', 'stored document', true],
    ['stale', 1, 'Stale', 'stale document', false],
  ]

  it('preserves existing rows when the replacement write fails', () => {
    const values = structuredClone(stored)
    const sheet = sheetWith(values)
    expect(() =>
      runInNewContext(`${script}\n${write}(sheet, records)`, {
        sheet,
        records: [record, oversized],
      }),
    ).toThrow('Cell exceeds 50,000 characters')
    expect(values).toEqual(stored)
  })

  it('writes replacements and then clears only the stale tail', () => {
    const values = structuredClone(stored)
    runInNewContext(`${script}\n${write}(sheet, records)`, {
      sheet: sheetWith(values),
      records: [record],
    })
    expect(values).toEqual([stored[0], row, ['', '', '', '', '']])
  })

  it('clears stale rows when there are no records to write', () => {
    const values = structuredClone(stored)
    runInNewContext(`${script}\n${write}(sheet, records)`, {
      sheet: sheetWith(values),
      records: [],
    })
    expect(values).toEqual([stored[0], ['', '', '', '', ''], ['', '', '', '', '']])
  })
})

describe('song merge', () => {
  type Row = {
    id: string
    at: number
    title: string
    song: string | null
    active: boolean
  }
  const merged = (stored: Row[], incoming: Row[]): Row[] =>
    runInNewContext(`${script}\nmergeSongs(stored, incoming)`, { stored, incoming })
  const row = (id: string, at: number, title: string, active = true): Row => ({
    id,
    at,
    title,
    song: `${id} document`,
    active,
  })

  it('gives a song no row until it has a title, kept or deleted', () => {
    expect(
      merged(
        [],
        [row('new', 1, ''), row('gone', 2, '', false), row('named', 3, 'Slow Machine')],
      ).map(({ id }) => id),
    ).toEqual(['named'])
  })

  it('keeps syncing a song with a row after its title is cleared, deleted or not', () => {
    const stored = [row('a', 1, 'Riff'), row('b', 1, 'Verse')]
    expect(
      merged(stored, [row('a', 2, ''), row('b', 2, '', false)]).map(
        ({ id, at, active }) => [id, at, active],
      ),
    ).toEqual([
      ['a', 2, true],
      ['b', 2, false],
    ])
  })
})
