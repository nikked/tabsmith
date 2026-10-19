import { z } from 'zod'
import { MODES, type Mode } from './core/level.ts'

const KEY = 'tabsmith.viewing'

/**
 * How one song is shown on this device: the text size chosen for it, if one
 * was, and whether its tab is dense. A phone and an iPad want different sizes
 * for the same song, so this stays on the device rather than going to the sheet
 * with the song.
 */
export type View = {
  readonly size?: number
  readonly dense?: boolean
}

export type Views = Readonly<Record<string, View>>

const views = z.record(
  z.string(),
  z.object({ size: z.number().positive().optional(), dense: z.boolean().optional() }),
)

/** Unreadable or missing is just no choices made yet. */
export const loadViews = (): Views => {
  try {
    const result = views.safeParse(JSON.parse(localStorage.getItem(KEY) ?? '{}'))
    return result.success ? result.data : {}
  } catch {
    return {}
  }
}

export const saveViews = (value: Views): void => {
  localStorage.setItem(KEY, JSON.stringify(value))
}

/** One song's view changed, the rest left as they were. */
export const withView = (all: Views, song: string, change: View): Views => ({
  ...all,
  [song]: { ...all[song], ...change },
})

const READING_KEY = 'tabsmith.reading'

/**
 * Whether tab is read as tab or as notation. Unlike a song's size, this is
 * how the player reads music, so one choice holds for every song on the device.
 */
export type Reading = 'tab' | 'notation'

export const loadReading = (): Reading => {
  try {
    return localStorage.getItem(READING_KEY) === 'notation' ? 'notation' : 'tab'
  } catch {
    return 'tab'
  }
}

export const saveReading = (value: Reading): void => {
  localStorage.setItem(READING_KEY, value)
}

const SYNTHS_KEY = 'tabsmith.synths'

/**
 * Whether Practice shows a song's synth settings. Only the synth player needs
 * them, so it is one choice per device, and shown until someone hides it.
 */
export const loadSynthsShown = (): boolean => {
  try {
    return localStorage.getItem(SYNTHS_KEY) !== 'hidden'
  } catch {
    return true
  }
}

export const saveSynthsShown = (shown: boolean): void => {
  localStorage.setItem(SYNTHS_KEY, shown ? 'shown' : 'hidden')
}

const METER_KEY = 'tabsmith.meter'

/**
 * The sound level meter's settings on this device. The offset belongs to this
 * device's microphone, so like a song's size it never goes to the sheet. Null
 * until calibrated against a real meter.
 */
export type Meter = {
  /** Whether it is listening, so it is on again wherever Perform is next opened. */
  readonly on: boolean
  readonly offset: number | null
  readonly mode: Mode
  /** The voice level aimed for, in dB(A). */
  readonly target: number
}

export const NO_METER: Meter = { on: false, offset: null, mode: 'room', target: 70 }

const meter = z.object({
  // Saved before it was kept; read as off rather than losing the calibration.
  on: z.boolean().default(false),
  offset: z.number().nullable(),
  mode: z.enum(MODES),
  target: z.number(),
})

export const loadMeter = (): Meter => {
  try {
    const result = meter.safeParse(JSON.parse(localStorage.getItem(METER_KEY) ?? 'null'))
    return result.success ? result.data : NO_METER
  } catch {
    return NO_METER
  }
}

export const saveMeter = (value: Meter): void => {
  localStorage.setItem(METER_KEY, JSON.stringify(value))
}

const VOLUMES_KEY = 'tabsmith.volumes'

/**
 * How loud the metronome and the notes play on this device, in percent: a
 * phone and a laptop's speakers want different levels for the same song.
 */
export type Volumes = { readonly metronome: number; readonly notes: number }

export const DEFAULT_VOLUMES: Volumes = { metronome: 50, notes: 50 }

const volumes = z.object({
  metronome: z.number().min(0).max(100),
  notes: z.number().min(0).max(100),
})

export const loadVolumes = (): Volumes => {
  try {
    const result = volumes.safeParse(
      JSON.parse(localStorage.getItem(VOLUMES_KEY) ?? 'null'),
    )
    return result.success ? result.data : DEFAULT_VOLUMES
  } catch {
    return DEFAULT_VOLUMES
  }
}

export const saveVolumes = (value: Volumes): void => {
  localStorage.setItem(VOLUMES_KEY, JSON.stringify(value))
}

/** A volume in percent as a gain on the sound as it is made, which plays at 33%. */
export const volumeGain = (percent: number): number => percent / 33
