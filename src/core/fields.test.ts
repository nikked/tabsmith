import { describe, expect, it } from 'vitest'
import { stepRow, type Cell } from './fields.ts'

// Two synths, as the editor lays them out: name (0) and sound (1) on the head
// row, then numbered slots from column 1. The second synth has no dials.
const cells: readonly Cell[] = [
  { row: 0, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 1 },
  { row: 1, col: 2 },
  { row: 1, col: 3 },
  { row: 2, col: 1 },
  { row: 2, col: 2 },
  { row: 3, col: 0 },
  { row: 3, col: 1 },
  { row: 5, col: 1 },
]

describe('stepRow', () => {
  it('keeps the column going down a synth', () => {
    expect(stepRow(cells, { row: 1, col: 2 }, 1)).toEqual({ row: 2, col: 2 })
  })

  it('falls back to the last field short of the column', () => {
    expect(stepRow(cells, { row: 1, col: 3 }, 1)).toEqual({ row: 2, col: 2 })
    expect(stepRow(cells, { row: 2, col: 2 }, 1)).toEqual({ row: 3, col: 1 })
  })

  it('leads from the name into the first slot, and back up to the sound', () => {
    expect(stepRow(cells, { row: 0, col: 0 }, 1)).toEqual({ row: 1, col: 1 })
    expect(stepRow(cells, { row: 1, col: 1 }, -1)).toEqual({ row: 0, col: 1 })
  })

  it('skips a row with no fields in it', () => {
    expect(stepRow(cells, { row: 3, col: 1 }, 1)).toEqual({ row: 5, col: 1 })
    expect(stepRow(cells, { row: 5, col: 1 }, -1)).toEqual({ row: 3, col: 1 })
  })

  it('goes nowhere past the first or last row', () => {
    expect(stepRow(cells, { row: 0, col: 1 }, -1)).toBeNull()
    expect(stepRow(cells, { row: 5, col: 1 }, 1)).toBeNull()
  })
})
