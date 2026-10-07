import { describe, expect, it } from 'vitest'
import { withView } from './viewing.ts'

describe('withView', () => {
  it('changes one song and leaves the others as they were', () => {
    const before = { a: { size: 1, dense: true }, b: { dense: false } }
    expect(withView(before, 'a', { size: 0.8 })).toEqual({
      a: { size: 0.8, dense: true },
      b: { dense: false },
    })
    expect(before.a.size).toBe(1)
  })

  it('starts a song it has not seen', () => {
    expect(withView({}, 'c', { dense: true })).toEqual({ c: { dense: true } })
  })
})
