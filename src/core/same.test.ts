import { describe, expect, it } from 'vitest'
import { same } from './same.ts'

describe('same', () => {
  it('compares through objects and arrays, whatever order the fields were set in', () => {
    expect(same({ a: 1, b: [1, { c: 'x' }] }, { b: [1, { c: 'x' }], a: 1 })).toBe(true)
    expect(same({ a: 1 }, { a: 1, b: undefined })).toBe(true)
  })

  it('tells apart a changed value, a missing one, and an array from an object', () => {
    expect(same({ a: [1, 2] }, { a: [1, 3] })).toBe(false)
    expect(same({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(same([], {})).toBe(false)
    expect(same(null, {})).toBe(false)
  })
})
