import { useEffect, useRef } from 'react'
import { beatSamples, sinceBeat } from '../core/metronome.ts'
import { volumeGain } from '../viewing.ts'
import { audioContext, output } from './sound.ts'

const DOUBLE_TAP_MS = 350

// The audio clock's time of what the speaker is playing now: the clicks reach
// it later than they are made, by a lot on an iPhone, and the light has to
// pulse with what is heard.
const heardAt = (ctx: AudioContext): number => {
  const { contextTime, performanceTime } = ctx.getOutputTimestamp()
  return contextTime === undefined ||
    performanceTime === undefined ||
    performanceTime === 0
    ? ctx.currentTime
    : contextTime + (performance.now() - performanceTime) / 1000
}

/**
 * The metronome's chip in the bar, there whether it is on or off, opening the
 * menu that has its controls, or on a double tap turning it on or off. While
 * on, it sounds at the bpm, every beat alike with no first beat marked, and its
 * dot pulses on the beat. While the sound level listens it is struck through,
 * since the two are never on at once.
 */
export function Metronome({
  bpm,
  on,
  menu,
  onToggle,
  volume,
  blocked,
}: {
  readonly bpm: number
  readonly on: boolean
  /** The id of the menu the chip opens. */
  readonly menu: string
  readonly onToggle: () => void
  /** In percent, changed while it plays without starting the beat over. */
  readonly volume: number
  /** Off because the sound level listens; turning it on turns that off. */
  readonly blocked: boolean
}) {
  // A tap opens the menu only once no second tap has followed it, so a double
  // tap turns the metronome on or off without the menu flashing open.
  const waiting = useRef<number | null>(null)
  // Whether the menu was open as the tap began: pressing outside it closes it
  // before the tap lands, and that tap was meant to close it, not reopen it.
  const wasOpen = useRef(false)
  const menuElement = () => document.getElementById(menu)
  useEffect(() => () => window.clearTimeout(waiting.current ?? undefined), [])
  const dot = useRef<HTMLSpanElement>(null)
  const label = on
    ? `Metronome at ${bpm} bpm`
    : blocked
      ? `Metronome off while the sound level listens, ${bpm} bpm`
      : `Metronome off, ${bpm} bpm`
  // The volume for the beat to start at, and the gain to turn while it plays.
  const gain = volumeGain(volume) * 0.8
  const gainNow = useRef(gain)
  const out = useRef<GainNode | null>(null)
  useEffect(() => {
    gainNow.current = gain
    if (out.current !== null) out.current.gain.value = gain
  }, [gain])

  useEffect(() => {
    if (!on) return
    const ctx = audioContext()
    void ctx.resume()
    const samples = beatSamples(ctx.sampleRate, bpm)
    const beat = ctx.createBuffer(1, samples.length, ctx.sampleRate)
    beat.copyToChannel(samples, 0)
    const level = ctx.createGain()
    level.gain.value = gainNow.current
    level.connect(output(ctx))
    out.current = level

    const start = ctx.currentTime + 0.05
    const source = ctx.createBufferSource()
    source.buffer = beat
    source.loop = true
    // The buffer ends on a whole sample; the loop on the beat's exact length.
    source.loopEnd = 60 / bpm
    source.connect(level)
    source.start(start)

    // The dot's pulse is set to where the heard beat is on every frame, rather
    // than left to run on the page's clock, which drifts from the audio's.
    let frame = 0
    const pulse = () => {
      const since = sinceBeat(start, bpm, heardAt(ctx)) ?? 30 / bpm
      dot.current?.getAnimations().forEach((each) => {
        each.currentTime = since * 1000
      })
      frame = window.requestAnimationFrame(pulse)
    }
    frame = window.requestAnimationFrame(pulse)

    return () => {
      window.cancelAnimationFrame(frame)
      source.stop()
      level.disconnect()
      out.current = null
    }
  }, [bpm, on])

  return (
    <button
      type="button"
      className={`metronome-chip${on ? ' on' : ''}${blocked ? ' blocked' : ''}`}
      title={label}
      aria-label={label}
      aria-haspopup="true"
      onPointerDown={() => {
        wasOpen.current = menuElement()?.matches(':popover-open') ?? false
      }}
      onClick={() => {
        const closing = wasOpen.current
        wasOpen.current = false
        if (waiting.current !== null) {
          window.clearTimeout(waiting.current)
          waiting.current = null
          onToggle()
        } else if (!closing) {
          waiting.current = window.setTimeout(() => {
            waiting.current = null
            menuElement()?.showPopover()
          }, DOUBLE_TAP_MS)
        }
      }}
    >
      <span
        ref={dot}
        className="metronome-beat"
        style={on ? { animationDuration: `${60 / bpm}s` } : undefined}
      />
      {bpm}
    </button>
  )
}
