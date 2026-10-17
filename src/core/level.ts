// How loud the room is, from the microphone's samples. Everything here is in
// dB relative to the microphone's full scale until an offset, measured once per
// device against a real meter, turns it into dB(A).

/** IEC 61672-1's A-weighting poles, in Hz. */
const A_POLES = [20.598997, 107.65265, 737.86223, 12194.217] as const

/** One second-order section, in the shape `createIIRFilter` takes. */
export type Section = {
  readonly feedforward: readonly number[]
  readonly feedback: readonly number[]
}

type Analog = { readonly b: readonly number[]; readonly a: readonly number[] }

/** A second-order section in s (s², s, 1) to one in z⁻¹, by the bilinear transform. */
const bilinear = ({ b, a }: Analog, sampleRate: number): Section => {
  const c = 2 * sampleRate
  const inZ = ([s2 = 0, s1 = 0, s0 = 0]: readonly number[]): readonly number[] => [
    s2 * c * c + s1 * c + s0,
    -2 * s2 * c * c + 2 * s0,
    s2 * c * c - s1 * c + s0,
  ]
  const feedforward = inZ(b)
  const feedback = inZ(a)
  const scale = feedback[0] ?? 1
  return {
    feedforward: feedforward.map((k) => k / scale),
    feedback: feedback.map((k) => k / scale),
  }
}

/** Gain of the sections in a row at one frequency, as a plain ratio. */
const gainAt = (sections: readonly Section[], hz: number, sampleRate: number): number => {
  const w = (2 * Math.PI * hz) / sampleRate
  const size = (poly: readonly number[]) =>
    Math.hypot(
      poly.reduce((sum, k, n) => sum + k * Math.cos(w * n), 0),
      poly.reduce((sum, k, n) => sum - k * Math.sin(w * n), 0),
    )
  return sections.reduce((gain, s) => (gain * size(s.feedforward)) / size(s.feedback), 1)
}

/** What the sections do to one frequency, in dB. */
export const responseDb = (
  sections: readonly Section[],
  hz: number,
  sampleRate: number,
): number => 20 * Math.log10(gainAt(sections, hz, sampleRate))

/**
 * A-weighting as three sections, since a biquad cannot hold the middle one's
 * two separate poles. Scaled so 1 kHz passes at 0 dB. The bilinear transform
 * drifts a dB or two above 8 kHz, which a phone's microphone cannot tell apart.
 */
export const aWeighting = (sampleRate: number): readonly Section[] => {
  const [w1, w2, w3, w4] = [
    2 * Math.PI * A_POLES[0],
    2 * Math.PI * A_POLES[1],
    2 * Math.PI * A_POLES[2],
    2 * Math.PI * A_POLES[3],
  ]
  const sections = [
    { b: [1, 0, 0], a: [1, 2 * w1, w1 * w1] },
    { b: [1, 0, 0], a: [1, w2 + w3, w2 * w3] },
    { b: [0, 0, 1], a: [1, 2 * w4, w4 * w4] },
  ].map((section) => bilinear(section, sampleRate))
  const scale = 1 / gainAt(sections, 1000, sampleRate)
  return sections.map((s, i) =>
    i === 0 ? { ...s, feedforward: s.feedforward.map((k) => k * scale) } : s,
  )
}

/** IEC 61672's time weightings, in seconds. */
const FAST = 0.125
const SLOW = 1

/** How long the loudest moment stays on show, so a glance finds it. */
export const HOLD = 3

/**
 * What the meter has heard since it was turned on or reset. Levels are mean
 * squares of the A-weighted signal, kept that way so they average as energy.
 */
export type Level = {
  readonly fast: number
  readonly slow: number
  /** Mean square times seconds, summed: the room's sound energy so far. */
  readonly energy: number
  readonly seconds: number
  /** Fast levels of the last `HOLD` seconds, oldest first, with when each was. */
  readonly recent: readonly (readonly [time: number, fast: number])[]
}

export const silence: Level = { fast: 0, slow: 0, energy: 0, seconds: 0, recent: [] }

const meanSquare = (samples: ArrayLike<number>): number => {
  let sum = 0
  for (let i = 0; i < samples.length; i++) sum += (samples[i] ?? 0) ** 2
  return samples.length === 0 ? 0 : sum / samples.length
}

const approach = (from: number, to: number, seconds: number, constant: number) =>
  from + (to - from) * (1 - Math.exp(-seconds / constant))

/**
 * The meter after one more block of A-weighted samples, taken `seconds` after
 * the last at time `now`. Blocks are read every so often rather than every
 * sample, which is plenty for a 1 s average and one over minutes.
 */
export const advance = (
  level: Level,
  samples: ArrayLike<number>,
  now: number,
  seconds: number,
): Level => {
  const power = meanSquare(samples)
  const fast = approach(level.fast, power, seconds, FAST)
  return {
    fast,
    slow: approach(level.slow, power, seconds, SLOW),
    energy: level.energy + power * seconds,
    seconds: level.seconds + seconds,
    recent: [...level.recent.filter(([time]) => now - time < HOLD), [now, fast]],
  }
}

const decibels = (power: number): number =>
  power > 0 ? 10 * Math.log10(power) : Number.NEGATIVE_INFINITY

/** The 1 s level, which calibration is read against since it holds still. */
export const slowDb = (level: Level): number => decibels(level.slow)

/** The average since the meter was turned on: what the ears have taken. */
export const leqDb = (level: Level): number =>
  level.seconds > 0 ? decibels(level.energy / level.seconds) : Number.NEGATIVE_INFINITY

/** The loudest fast level of the last `HOLD` seconds: a sung phrase's peak. */
export const maxDb = (level: Level): number =>
  decibels(Math.max(0, ...level.recent.map(([, fast]) => fast)))

/**
 * Where a raw reading starts on a device never calibrated, from the devices
 * tested against a reference meter: the iPhones and the iPad came out at
 * 127–130, a MacBook at about 100. Anything else is a guess either way.
 */
export const uncalibratedOffset = (handheld: boolean): number => (handheld ? 128 : 100)

/** The offset that makes this device read what a trusted meter reads now. */
export const offsetFor = (reference: number, raw: number): number => reference - raw

/**
 * A reference meter's reading as typed, a comma for a decimal point as well,
 * if it is one a meter could show.
 */
export const referenceOf = (text: string): number | null => {
  const value = Number(text.trim().replace(',', '.'))
  return text.trim() !== '' && value >= 30 && value <= 140 ? value : null
}

/**
 * The loudest level tested against a reference meter. Above it a reading may
 * still be right, but nothing showed that it is, so it is not claimed.
 */
export const CEILING = 106

export const levelText = (db: number): string =>
  !Number.isFinite(db) ? '–' : db >= CEILING ? `${CEILING}+` : String(Math.round(db))

/**
 * NIOSH: 85 dB(A) for 8 hours, each 3 dB more halving the time. Exposure is
 * energy over time, so this is read off the average, not the level right now.
 */
export const minutesToDose = (db: number): number => 480 / 2 ** ((db - 85) / 3)

/**
 * How long until a full day's dose, rounded down so it never promises more
 * time than there is. Above the ceiling only an upper bound is known.
 */
export const doseText = (db: number): string => {
  const capped = db >= CEILING
  const minutes = minutesToDose(capped ? CEILING : db)
  const time =
    minutes >= 480
      ? '8h+'
      : minutes >= 60
        ? `${Math.floor(minutes / 60)}h`
        : `${Math.floor(minutes)}m`
  return capped ? `≤${time}` : time
}

export const MODES = ['room', 'voice'] as const
export type Mode = (typeof MODES)[number]

/**
 * How a reading looks. The app has no green, and nothing in it is loud, so a
 * fine level is quiet or plain and only too much takes colour.
 */
export type Tone = 'quiet' | 'plain' | 'warn' | 'alert'

/** EU 2003/10/EC: protection on offer from 80 dB(A), to be worn from 85. */
export const roomTone = (leq: number): Tone =>
  leq >= 85 ? 'alert' : leq >= 80 ? 'warn' : 'quiet'

/** A voice target the meter can tell apart from a quiet room, up to the loudest it has been tested at. */
export const LOWEST_TARGET = 40
export const HIGHEST_TARGET = CEILING

/** Against the singer's own target, which only means something at a set distance. */
export const voiceTone = (max: number, target: number): Tone =>
  max > target + 6
    ? 'alert'
    : max > target + 3
      ? 'warn'
      : max >= target - 6
        ? 'plain'
        : 'quiet'
