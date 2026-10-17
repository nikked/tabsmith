import { describe, expect, it } from 'vitest'
import { matching } from './suggest.ts'

const sounds = ['Analog shapeshifter', 'Purity', 'Synth 1', 'Wide Plucks', 'Smör theme']

describe('matching', () => {
  it('offers everything while nothing is typed', () => {
    expect(matching(sounds, '  ')).toEqual(sounds)
  })

  it('finds what is typed anywhere, whatever its case, starts first', () => {
    expect(matching(sounds, 'th')).toEqual(['Synth 1', 'Smör theme'])
    expect(matching(sounds, 'S')).toEqual([
      'Synth 1',
      'Smör theme',
      'Analog shapeshifter',
      'Wide Plucks',
    ])
  })

  it('does not offer back what is already typed in full', () => {
    expect(matching(sounds, 'purity')).toEqual([])
  })
})
