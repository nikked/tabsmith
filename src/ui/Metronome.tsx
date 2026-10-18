import { useEffect, useRef } from 'react'
import { beatSamples, sinceBeat } from '../core/metronome.ts'
import { audioContext } from './sound.ts'

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
 * A metronome at the song's bpm, sounding for as long as this is on screen,
 * and its chip in the bar: a dot that pulses on the beat and stops it when
 * tapped. Every beat alike, with no first beat marked.
 */
export function Metronome({
  bpm,
  onStop,
}: {
  readonly bpm: number
  readonly onStop: () => void
}) {
  const dot = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const ctx = audioContext()
    void ctx.resume()
    const samples = beatSamples(ctx.sampleRate, bpm)
    const beat = ctx.createBuffer(1, samples.length, ctx.sampleRate)
    beat.copyToChannel(samples, 0)
    const out = ctx.createGain()
    out.gain.value = 0.4
    out.connect(ctx.destination)

    const start = ctx.currentTime + 0.05
    const source = ctx.createBufferSource()
    source.buffer = beat
    source.loop = true
    // The buffer ends on a whole sample; the loop on the beat's exact length.
    source.loopEnd = 60 / bpm
    source.connect(out)
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
      out.disconnect()
    }
  }, [bpm])

  return (
    <button
      type="button"
      className="metronome-chip"
      title={`Metronome at ${bpm} bpm. Tap to stop.`}
      aria-label={`Stop the metronome, ${bpm} bpm`}
      onClick={onStop}
    >
      <span
        ref={dot}
        className="metronome-beat"
        style={{ animationDuration: `${60 / bpm}s` }}
      />
      {bpm}
    </button>
  )
}
