import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  HOLD,
  aWeighting,
  advance,
  doseText,
  leqDb,
  levelText,
  maxDb,
  roomTone,
  silence,
  uncalibratedOffset,
  voiceTone,
  type Level,
} from '../core/level.ts'
import type { Meter } from '../viewing.ts'
import { readyMicrophone } from './sound.ts'

/** Why the meter could not listen, for the menu to say. */
export type MicTrouble = 'blocked' | 'missing'

/** About 85 ms at 48 kHz: read ten times a second, little of the sound goes unheard. */
const BLOCK = 4096
const READ_EVERY_MS = 100

type Props = {
  readonly meter: Meter
  /** Each new reading, for calibrating against the one heard last. */
  readonly onHear: (level: Level) => void
  readonly onStop: (trouble: MicTrouble) => void
}

// iPadOS says it is a Mac, so a touch screen is what tells it apart.
const handheld = /iPhone|iPad/.test(navigator.userAgent) || navigator.maxTouchPoints > 1

/** A microphone struck through: nothing is coming in yet, and the mic is why. */
const MicOffIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="14"
    height="14"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="5.75" y="1.75" width="4.5" height="8" rx="2.25" />
    <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.25M5.75 14.25h4.5M2 2l12 12" />
  </svg>
)

/**
 * The microphone, open for as long as this is on screen, and its reading on a
 * chip in the bar. Its own component so the reading changing ten times a second
 * redraws the chip and not the song.
 */
export function SoundLevel({ meter, onHear, onStop }: Props) {
  const heard = useRef<Level>(silence)
  const [level, setLevel] = useState<Level>(silence)
  const hear = useEffectEvent((next: Level) => {
    heard.current = next
    setLevel(next)
    onHear(next)
  })
  const stop = useEffectEvent(onStop)
  // A browser starts no audio until the page is touched. The meter is kept on
  // across reloads, so after one it waits in resume() until the chip is tapped,
  // and the tap is what lets it start.
  const audio = useRef<AudioContext | null>(null)

  useEffect(() => {
    let closed = false
    let stream: MediaStream | null = null
    let timer: number | undefined
    readyMicrophone()
    const context = new AudioContext()
    audio.current = context

    const listen = async () => {
      try {
        // Without echo cancellation Safari also leaves its gain alone, which
        // would otherwise flatten a loud band and a quiet room toward each other.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
        await context.resume()
      } catch (error) {
        if (!closed) {
          stop(
            error instanceof DOMException && error.name === 'NotAllowedError'
              ? 'blocked'
              : 'missing',
          )
        }
        return
      }
      if (closed) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const weighted = context.createAnalyser()
      weighted.fftSize = BLOCK
      aWeighting(context.sampleRate)
        .map((s) => context.createIIRFilter([...s.feedforward], [...s.feedback]))
        .reduce<AudioNode>(
          (from, to) => from.connect(to),
          context.createMediaStreamSource(stream),
        )
        .connect(weighted)

      const samples = new Float32Array(BLOCK)
      let last = context.currentTime
      timer = window.setInterval(() => {
        weighted.getFloatTimeDomainData(samples)
        const now = context.currentTime
        hear(advance(heard.current, samples, now, now - last))
        last = now
      }, READ_EVERY_MS)
    }

    void listen()
    return () => {
      closed = true
      window.clearInterval(timer)
      stream?.getTracks().forEach((track) => track.stop())
      void context.close()
    }
  }, [])

  const calibrated = meter.offset !== null
  const offset = meter.offset ?? uncalibratedOffset(handheld)
  const room = meter.mode === 'room'
  const db = (room ? leqDb(level) : maxDb(level)) + offset
  const tone = room ? roomTone(db) : voiceTone(db, meter.target)
  const listening = Number.isFinite(db)
  const reading = `${calibrated ? '' : '~'}${levelText(db)} ${room ? `· ${doseText(db, level.seconds)}` : `▴${meter.target}`}`

  return (
    <button
      type="button"
      className={`level-chip tone-${tone}`}
      aria-label={listening ? undefined : 'Microphone not listening'}
      title={
        listening
          ? (room
              ? 'Average dB(A) since turned on, and time to a full day’s dose'
              : `Loudest dB(A) of the last ${HOLD} seconds, and the target`) +
            (calibrated ? '' : ' (not calibrated)') +
            '. Tap to start again.'
          : 'Waiting for the microphone: allow it if the browser asks, or tap to start it.'
      }
      onClick={() => {
        void audio.current?.resume()
        heard.current = silence
        setLevel(silence)
        onHear(silence)
      }}
    >
      {listening ? reading : <MicOffIcon />}
    </button>
  )
}
