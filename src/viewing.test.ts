import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_VOLUMES,
  NO_METER,
  loadMeter,
  loadVolumes,
  saveMeter,
  saveVolumes,
  volumeGain,
  withView,
} from './viewing.ts'

afterEach(() => vi.unstubAllGlobals())

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

describe('loadMeter', () => {
  const storing = (saved: string | null) => {
    const store = new Map<string, string>()
    if (saved !== null) store.set('tabsmith.meter', saved)
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    })
  }

  it('reads back what was saved', () => {
    storing(null)
    const meter = { on: true, offset: 130.2, mode: 'voice', target: 72 } as const
    saveMeter(meter)
    expect(loadMeter()).toEqual(meter)
  })

  it('starts off and uncalibrated, on the room, aiming a voice at 70', () => {
    storing(null)
    expect(loadMeter()).toEqual({ on: false, offset: null, mode: 'room', target: 70 })
  })

  it('keeps a calibration saved before on and off were kept', () => {
    storing('{"offset":130.2,"mode":"voice","target":72}')
    expect(loadMeter()).toEqual({ on: false, offset: 130.2, mode: 'voice', target: 72 })
  })

  it.each(['not json', '{"offset":"loud","mode":"room","target":70}', '{"mode":"hall"}'])(
    'treats %s as never set',
    (saved) => {
      storing(saved)
      expect(loadMeter()).toEqual(NO_METER)
    },
  )
})

describe('loadVolumes', () => {
  const storing = (saved: string | null) => {
    const store = new Map<string, string>()
    if (saved !== null) store.set('tabsmith.volumes', saved)
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    })
  }

  it('starts both at half, and reads back what was saved', () => {
    storing(null)
    expect(loadVolumes()).toEqual({ metronome: 50, notes: 50 })
    saveVolumes({ metronome: 80, notes: 20 })
    expect(loadVolumes()).toEqual({ metronome: 80, notes: 20 })
  })

  it.each(['not json', '{"metronome":120,"notes":50}', '{"notes":50}'])(
    'treats %s as never set',
    (saved) => {
      storing(saved)
      expect(loadVolumes()).toEqual(DEFAULT_VOLUMES)
    },
  )
})

describe('volumeGain', () => {
  it('plays a sound as made at 33%, louder above and silent at nothing', () => {
    expect(volumeGain(33)).toBe(1)
    expect(volumeGain(50)).toBeCloseTo(1.52, 2)
    expect(volumeGain(0)).toBe(0)
  })
})
