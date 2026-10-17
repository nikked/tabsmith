/**
 * The suggestions worth showing under a field: every one while it is empty,
 * then those holding what is typed anywhere in them, the ones that start with
 * it first. What is typed already in full is not offered back.
 */
export const matching = (
  suggestions: readonly string[],
  typed: string,
): readonly string[] => {
  const needle = typed.trim().toLowerCase()
  if (needle === '') return suggestions
  const hits = suggestions.filter((suggestion) => {
    const hay = suggestion.toLowerCase()
    return hay !== needle && hay.includes(needle)
  })
  return [
    ...hits.filter((hit) => hit.toLowerCase().startsWith(needle)),
    ...hits.filter((hit) => !hit.toLowerCase().startsWith(needle)),
  ]
}
