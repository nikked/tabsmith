/**
 * Whether two values hold the same data: plain objects and arrays compared
 * through, everything else by identity. A song is built by spreading, so two
 * equal ones can list their fields in a different order, which is why this is
 * not a comparison of their JSON.
 */
export const same = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => same(item, b[index]))
    )
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every((key) => same(field(a, key), field(b, key)))
}

const field = (value: object, key: string): unknown =>
  Object.getOwnPropertyDescriptor(value, key)?.value
