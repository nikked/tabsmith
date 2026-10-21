import type { Played } from '../core/playback.ts'
import { frequencyOf, noteTone } from '../core/tone.ts'
import { loadVolumes, volumeGain } from '../viewing.ts'

declare global {
  interface Navigator {
    /** Safari's audio session: 'playback' plays through the ring/silent switch. */
    readonly audioSession?: { type: string }
  }
}

// One context for every note, made on the first tap, which is the gesture a
// browser waits for before it lets a page make sound.
let context: AudioContext | null = null
const notes = new Map<number, AudioBuffer>()

const NOTE_SECONDS = 2.5
// Low to high, a little apart, the way a pick crosses the strings.
const STRUM_SECONDS = 0.028

// On an iPhone, play-and-record plays everything quietly, as on a call, so the
// session is play-and-record only while the microphone is open and playback
// otherwise; both play through the silent switch, without which an iPhone on
// silent plays nothing, which reads as broken. Sound and the microphone never
// run at once: switching while the metronome played left the sound level with
// no microphone.
const setSession = (type: 'playback' | 'play-and-record'): void => {
  if (navigator.audioSession === undefined || navigator.audioSession.type === type) return
  navigator.audioSession.type = type
}

const soundListeners = new Set<() => void>()

/** Calls `listener` as any sound is about to play; gives back what stops it. */
export const onSound = (listener: () => void): (() => void) => {
  soundListeners.add(listener)
  return () => soundListeners.delete(listener)
}

// Everything played goes out through one limiter: turned up, the notes and the
// clicks go past what a speaker takes, and it holds their peaks there rather
// than letting them clip into a buzz. The limiter adds a gain of its own after
// holding them, which took a loud chord's attack 0.8 dB past full scale, so
// the trim after it keeps the loudest of them 0.7 dB under.
let limiter: DynamicsCompressorNode | null = null
const TRIM = 10 ** (-1.5 / 20)

/** Where a sound is connected to be heard: the limiter in front of the speaker. */
export const output = (ctx: AudioContext): AudioNode => {
  if (limiter === null) {
    limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -6
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.001
    limiter.release.value = 0.1
    const trim = ctx.createGain()
    trim.gain.value = TRIM
    limiter.connect(trim).connect(ctx.destination)
  }
  return limiter
}

const audio = (): AudioContext => {
  setSession('playback')
  soundListeners.forEach((listener) => listener())
  context ??= new AudioContext()
  return context
}

/** Readies the audio session for the microphone, before the sound level opens it. */
export const readyMicrophone = (): void => setSession('play-and-record')

const bufferOf = (ctx: AudioContext, midi: number): AudioBuffer => {
  const cached = notes.get(midi)
  if (cached !== undefined) return cached
  const samples = noteTone(frequencyOf(midi), ctx.sampleRate, NOTE_SECONDS)
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate)
  buffer.copyToChannel(samples, 0)
  notes.set(midi, buffer)
  return buffer
}

// How long a note held to its length takes to fall silent, so it ends without a click.
const RELEASE_SECONDS = 0.04

// The notes as one strum from `start`, lowest first, held until `until` when
// they have a length, or left to die away when they do not.
const strum = (
  ctx: AudioContext,
  midi: readonly number[],
  start: number,
  until: number | null,
): readonly AudioBufferSourceNode[] => {
  const out = ctx.createGain()
  // Quieter per string as more sound, so a full chord is no louder than a note;
  // the volume read afresh, so a change in Perform's menu is heard in Edit too.
  // Low enough that a chord meets the limiter rather than being squashed flat by
  // it: a few dB over the metronome, not drowning it, with the slider still
  // making a difference all the way up.
  const level = (0.375 / Math.sqrt(midi.length)) * volumeGain(loadVolumes().notes)
  out.gain.value = level
  if (until !== null) {
    out.gain.setValueAtTime(level, until)
    out.gain.linearRampToValueAtTime(0, until + RELEASE_SECONDS)
  }
  out.connect(output(ctx))
  return [...midi]
    .sort((a, b) => a - b)
    .map((note, i) => {
      const source = ctx.createBufferSource()
      source.buffer = bufferOf(ctx, note)
      source.connect(out)
      source.start(start + i * STRUM_SECONDS)
      if (until !== null) source.stop(until + RELEASE_SECONDS)
      return source
    })
}

/** Plays MIDI notes as one strum, lowest first; one note just sounds. */
export const play = (midi: readonly number[]): void => {
  if (midi.length === 0) return
  const ctx = audio()
  void ctx.resume()
  strum(ctx, midi, ctx.currentTime + 0.01, null)
}

/**
 * Plays a row's notes in time, all handed to the audio at once so a page in
 * the background still plays them on time. Gives back what stops them.
 */
export const playRow = (notes: readonly Played[]): (() => void) => {
  const ctx = audio()
  void ctx.resume()
  const start = ctx.currentTime + 0.05
  const sources = notes.flatMap(({ midi, at, seconds }) =>
    strum(ctx, midi, start + at, start + at + seconds),
  )
  return () => sources.forEach((source) => source.stop())
}

/** The same audio context, for a metronome to schedule its clicks against. */
export const audioContext = (): AudioContext => audio()
