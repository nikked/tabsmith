import { frequencyOf, sineTone } from '../core/tone.ts'

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

// Set once, before the first sound or the microphone, and never changed: on an
// iPhone, switching it while the metronome played left the sound level with no
// microphone. Play-and-record both records and, like playback, plays through
// the silent switch, without which an iPhone on silent plays nothing, which
// reads as broken.
let settled = false
const settleSession = (): void => {
  if (settled || navigator.audioSession === undefined) return
  navigator.audioSession.type = 'play-and-record'
  settled = true
}

const audio = (): AudioContext => {
  if (context === null) {
    settleSession()
    context = new AudioContext()
  }
  return context
}

/** Readies the audio session for the microphone, before the sound level opens it. */
export const readyMicrophone = (): void => settleSession()

const bufferOf = (ctx: AudioContext, midi: number): AudioBuffer => {
  const cached = notes.get(midi)
  if (cached !== undefined) return cached
  const samples = sineTone(frequencyOf(midi), ctx.sampleRate, NOTE_SECONDS)
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate)
  buffer.copyToChannel(samples, 0)
  notes.set(midi, buffer)
  return buffer
}

/** Plays MIDI notes as one strum, lowest first; one note just sounds. */
export const play = (midi: readonly number[]): void => {
  if (midi.length === 0) return
  const ctx = audio()
  void ctx.resume()
  const out = ctx.createGain()
  // Quieter per string as more sound, so a full chord is no louder than a note.
  out.gain.value = 0.5 / Math.sqrt(midi.length)
  out.connect(ctx.destination)
  const start = ctx.currentTime + 0.01
  ;[...midi]
    .sort((a, b) => a - b)
    .forEach((note, i) => {
      const source = ctx.createBufferSource()
      source.buffer = bufferOf(ctx, note)
      source.connect(out)
      source.start(start + i * STRUM_SECONDS)
    })
}

/** The same audio context, for a metronome to schedule its clicks against. */
export const audioContext = (): AudioContext => audio()
