import { describe, expect, it } from 'vitest'
import { emptySong, type Song, type Synth } from './model.ts'
import { suggestionsFor, synthIsBlank, synthNames, synthSummary } from './synths.ts'

const synth = (
  name: string,
  sound: string,
  dials: string[] = [],
  knobs: string[] = [],
): Synth => ({
  name,
  sound,
  dials,
  knobs,
})

const song = (...synths: Synth[]): Song => ({ ...emptySong(), synths })

const songs = [
  song(
    synth('iRig', 'Purity', [], ['Shifter']),
    synth('Nektar', 'Analog shapeshifter', ['Filter', 'Dirt'], ['Shifter']),
  ),
  song(synth('iRig', 'TALOS', [], ['Drive', 'Squash', '']), synth('Nektar', 'Synth 1')),
  song(synth('irig ', 'Purity')),
]

describe('synthNames', () => {
  it('lists each name once whatever its case, the first spelling kept, ignoring blanks', () => {
    expect(synthNames([...songs, song(synth('', 'x'))])).toEqual(['iRig', 'Nektar'])
  })
})

describe('suggestionsFor', () => {
  it('offers only what the same synth has used, whatever its case', () => {
    expect(suggestionsFor(songs, 'IRIG')).toEqual({
      sounds: ['Purity', 'TALOS'],
      dials: [],
      knobs: ['Drive', 'Shifter', 'Squash'],
    })
    expect(suggestionsFor(songs, 'Nektar').dials).toEqual(['Dirt', 'Filter'])
  })

  it('has nothing for a synth never used', () => {
    expect(suggestionsFor(songs, 'Moog')).toEqual({ sounds: [], dials: [], knobs: [] })
  })
})

describe('synthSummary', () => {
  it('reads name and sound, then the dials and knobs by their number', () => {
    expect(
      synthSummary(
        synth('Nektar', 'Analog shapeshifter', ['Filter', 'Dirt'], ['Shifter']),
      ),
    ).toEqual({
      name: 'Nektar',
      sound: 'Analog shapeshifter',
      dials: [
        { label: 'Dial 1', value: 'Filter' },
        { label: 'Dial 2', value: 'Dirt' },
      ],
      knobs: [{ label: 'Knob 1', value: 'Shifter' }],
    })
  })

  it('skips a blank slot without renumbering the ones after it', () => {
    expect(synthSummary(synth('iRig', '', [], ['Drive', ' ', 'Squash'])).knobs).toEqual([
      { label: 'Knob 1', value: 'Drive' },
      { label: 'Knob 3', value: 'Squash' },
    ])
  })

  it('trims the name and sound, a blank sound leaving none', () => {
    expect(synthSummary(synth(' iRig ', ' '))).toMatchObject({ name: 'iRig', sound: '' })
  })
})

describe('synthIsBlank', () => {
  it('is a synth with nothing typed into it', () => {
    expect(synthIsBlank(synth(' ', '', [''], ['']))).toBe(true)
    expect(synthIsBlank(synth('', '', [], ['Drive']))).toBe(false)
  })
})
