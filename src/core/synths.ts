import type { Song, Synth } from './model.ts'

/** What earlier songs have used, offered while typing a synth into another. */
export type SynthSuggestions = {
  readonly sounds: readonly string[]
  readonly dials: readonly string[]
  readonly knobs: readonly string[]
}

const sameName = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

// Once each, the first spelling kept: 'irig' after 'iRig' is the same synth.
const distinct = (values: readonly string[]): readonly string[] =>
  [
    ...new Map(
      values
        .map((value) => value.trim())
        .filter((value) => value !== '')
        .reverse()
        .map((value) => [value.toLowerCase(), value]),
    ).values(),
  ].sort((a, b) => a.localeCompare(b))

const allSynths = (songs: readonly Song[]): readonly Synth[] =>
  songs.flatMap((song) => song.synths)

/** Every synth name used so far, for the name field and the Add synth button. */
export const synthNames = (songs: readonly Song[]): readonly string[] =>
  distinct(allSynths(songs).map((synth) => synth.name))

/**
 * Sounds and control names from the same synth only: an iRig patch is no use
 * to the Nektar. Names match without regard to case or stray spaces.
 */
export const suggestionsFor = (
  songs: readonly Song[],
  name: string,
): SynthSuggestions => {
  const used = allSynths(songs).filter((synth) => sameName(synth.name, name))
  return {
    sounds: distinct(used.map((synth) => synth.sound)),
    dials: distinct(used.flatMap((synth) => synth.dials)),
    knobs: distinct(used.flatMap((synth) => synth.knobs)),
  }
}

/** One dial or knob that is set: its number on the instrument and what it does. */
export type Control = { readonly number: number; readonly value: string }

/**
 * A synth as Practice reads it: name and sound, kept apart so they can be set
 * apart, then the dials and the knobs that are assigned, kept apart too so the
 * page can show where one ends and the other starts. Each is under the number
 * it has on the instrument: a blank slot is skipped but still counts, so Knob 3
 * stays Knob 3 after an empty Knob 2.
 */
export const synthSummary = (
  synth: Synth,
): {
  readonly name: string
  readonly sound: string
  readonly dials: readonly Control[]
  readonly knobs: readonly Control[]
} => {
  const numbered = (values: readonly string[]): readonly Control[] =>
    values.flatMap((value, index) =>
      value.trim() === '' ? [] : [{ number: index + 1, value: value.trim() }],
    )
  return {
    name: synth.name.trim(),
    sound: synth.sound.trim(),
    dials: numbered(synth.dials),
    knobs: numbered(synth.knobs),
  }
}

/** A synth with nothing written in it says nothing on the stand. */
export const synthIsBlank = (synth: Synth): boolean => {
  const { name, sound, dials, knobs } = synthSummary(synth)
  return name === '' && sound === '' && dials.length === 0 && knobs.length === 0
}
