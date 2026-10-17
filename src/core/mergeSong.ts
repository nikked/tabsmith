import type { Score, Song } from './model.ts'
import { same } from './same.ts'

/** A merged value, and whether it came together without the two sides colliding. */
type Merged<T> = { readonly value: T; readonly clean: boolean }

/**
 * One part from three versions: what both sides last agreed on, and each
 * side's since. A change on one side is taken, the same change on both is one
 * change, and two different changes collide; the sheet's then stands in.
 */
const three = <T>(base: T, mine: T, theirs: T): Merged<T> => {
  if (same(mine, theirs) || same(theirs, base)) return { value: mine, clean: true }
  if (same(mine, base)) return { value: theirs, clean: true }
  return { value: theirs, clean: false }
}

/** What one side did to an item of the base list. */
type Fate<T> =
  | { readonly kind: 'kept' }
  | { readonly kind: 'edited'; readonly item: T }
  | { readonly kind: 'deleted' }

/**
 * One side's changes to a list, against the base: each base item's fate, and
 * what was added in front of each base item, the last place being the end.
 */
type Changes<T> = {
  readonly fates: readonly Fate<T>[]
  readonly added: readonly (readonly T[])[]
}

/**
 * Index pairs of the items `a` and `b` both still hold unchanged, in order: a
 * longest common subsequence. Lists here are a song's sections, rows, synths
 * or todos, so the table stays small.
 */
const common = <T>(
  a: readonly T[],
  b: readonly T[],
): readonly (readonly [number, number])[] => {
  // longest[i][j]: the longest run a from i on and b from j on have in common.
  const longest = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  )
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = longest[i] ?? []
      row[j] = same(a[i], b[j])
        ? (longest[i + 1]?.[j + 1] ?? 0) + 1
        : Math.max(longest[i + 1]?.[j] ?? 0, row[j + 1] ?? 0)
    }
  }
  const pairs: (readonly [number, number])[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (same(a[i], b[j])) pairs.push([i++, j++])
    else if ((longest[i + 1]?.[j] ?? 0) >= (longest[i]?.[j + 1] ?? 0)) i++
    else j++
  }
  return pairs
}

/**
 * Between two items a side kept, the base items it no longer has are paired
 * with what it has there instead, in order: the same number of each is an
 * edit apiece, more in the base are deleted, more on the side are added.
 */
const changesOf = <T>(base: readonly T[], side: readonly T[]): Changes<T> => {
  const fates: Fate<T>[] = []
  const added: (readonly T[])[] = base.map(() => [])
  let fromBase = 0
  let fromSide = 0
  for (const [b, s] of [...common(base, side), [base.length, side.length] as const]) {
    const paired = Math.min(b - fromBase, s - fromSide)
    side
      .slice(fromSide, fromSide + paired)
      .forEach((item) => fates.push({ kind: 'edited', item }))
    for (let gone = paired; gone < b - fromBase; gone++) fates.push({ kind: 'deleted' })
    added[b] = side.slice(fromSide + paired, s)
    if (b < base.length) fates.push({ kind: 'kept' })
    fromBase = b + 1
    fromSide = s + 1
  }
  return { fates, added }
}

const KEPT = { kind: 'kept' } as const

/**
 * One base item's two fates put together. Two different changes collide, and
 * the sheet's side stands in.
 */
const settleItem = <T>(item: T, mine: Fate<T>, theirs: Fate<T>): Merged<readonly T[]> => {
  const outcome = (fate: Fate<T>): readonly T[] =>
    fate.kind === 'kept' ? [item] : fate.kind === 'edited' ? [fate.item] : []
  if (mine.kind === 'kept') return { value: outcome(theirs), clean: true }
  if (theirs.kind === 'kept' || same(mine, theirs))
    return { value: outcome(mine), clean: true }
  if (mine.kind === 'edited' && theirs.kind === 'edited') {
    const merged = three(item, mine.item, theirs.item)
    return { value: [merged.value], clean: merged.clean }
  }
  return { value: outcome(theirs), clean: false }
}

/**
 * A list item by item, lined up the way diff3 lines up lines of text: an item
 * one side deleted and another the other side edited both happen, as do edits
 * to different items, and what both sides added in the same place is kept,
 * each once. Only an item changed on both sides in different ways collides.
 * Items have no identity of their own, so moving one counts as deleting it in
 * one place and adding it in another.
 */
const list = <T>(
  base: readonly T[],
  mine: readonly T[],
  theirs: readonly T[],
): Merged<readonly T[]> => {
  const whole = three(base, mine, theirs)
  if (whole.clean) return whole
  const ours = changesOf(base, mine)
  const others = changesOf(base, theirs)
  // What both sides added in one place is kept, each side's once.
  const addedAt = (at: number): readonly T[] => {
    const here = ours.added[at] ?? []
    const there = others.added[at] ?? []
    return same(here, there) ? here : [...here, ...there]
  }
  const items = base.map((item, at) =>
    settleItem(item, ours.fates[at] ?? KEPT, others.fates[at] ?? KEPT),
  )
  return {
    value: [
      ...base.flatMap((_, at) => [...addedAt(at), ...(items[at]?.value ?? [])]),
      ...addedAt(base.length),
    ],
    clean: items.every((item) => item.clean),
  }
}

/**
 * The tab row by row, unless the tuning or the bar length changed on either
 * side: those reshape every row, so the tab is then one part.
 */
const tab = (base: Score, mine: Score, theirs: Score): Merged<Score> => {
  const reshaped = [mine, theirs].some(
    (side) =>
      !same(side.tuning, base.tuning) ||
      side.defaultBarColumns !== base.defaultBarColumns,
  )
  if (reshaped) return three(base, mine, theirs)
  const rows = list(base.rows, mine.rows, theirs.rows)
  return { value: { ...mine, rows: rows.value }, clean: rows.clean }
}

/**
 * A song edited on two devices since they last agreed, put back together part
 * by part: the title and the other facts each, every section, every row of the
 * tab, every synth and todo, and the ideas. Clean when no part was changed on
 * both sides in different ways; otherwise the sheet's side stands in for the
 * parts that collided, and the caller keeps the other version some other way.
 */
export const mergeSong = (base: Song, mine: Song, theirs: Song): Merged<Song> => {
  const title = three(base.title, mine.title, theirs.title)
  const bpm = three(base.bpm, mine.bpm, theirs.bpm)
  const key = three(base.key, mine.key, theirs.key)
  const note = three(base.note, mine.note, theirs.note)
  const tabFirst = three(base.tabFirst, mine.tabFirst, theirs.tabFirst)
  const ideas = three(base.ideas, mine.ideas, theirs.ideas)
  const chart = list(base.chart, mine.chart, theirs.chart)
  const score = tab(base.tab, mine.tab, theirs.tab)
  const synths = list(base.synths, mine.synths, theirs.synths)
  const todos = list(base.todos, mine.todos, theirs.todos)
  const parts = [title, bpm, key, note, tabFirst, ideas, chart, score, synths, todos]
  return {
    value: {
      title: title.value,
      bpm: bpm.value,
      key: key.value,
      note: note.value,
      tabFirst: tabFirst.value,
      ideas: ideas.value,
      chart: chart.value,
      tab: score.value,
      synths: synths.value,
      todos: todos.value,
    },
    clean: parts.every((part) => part.clean),
  }
}
