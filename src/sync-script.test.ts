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
