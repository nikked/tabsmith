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

  useEffect(() => {
    let closed = false
    let stream: MediaStream | null = null
    let timer: number | undefined
    const context = new AudioContext()

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
  const reading = Number.isFinite(db)
    ? `${calibrated ? '' : '~'}${levelText(db)} ${room ? `· ${doseText(db, level.seconds)}` : `▴${meter.target}`}`
    : '…'

  return (
    <button
      type="button"
      className={`level-chip tone-${tone}`}
      title={
        (room
          ? 'Average dB(A) since turned on, and time to a full day’s dose'
          : `Loudest dB(A) of the last ${HOLD} seconds, and the target`) +
        (calibrated ? '' : ' (not calibrated)') +
        '. Tap to start again.'
      }
      onClick={() => {
        heard.current = silence
        setLevel(silence)
        onHear(silence)
      }}
    >
      {reading}
    </button>
  )
}
