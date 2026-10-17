/** Where a field sits in a form laid out as rows and columns. */
export type Cell = { readonly row: number; readonly col: number }

/**
 * The field an arrow key moves to: the nearest row in that direction holding
 * any field, and in it the one furthest along that does not pass the column
 * left. Column 0 counts as 1, so the name at the start of a row leads down
 * into the first slot rather than nowhere. Null past the first or last row.
 */
export const stepRow = (
  cells: readonly Cell[],
  from: Cell,
  direction: 1 | -1,
): Cell | null => {
  const rows = [...new Set(cells.map((cell) => cell.row))]
    .filter((row) => (direction === 1 ? row > from.row : row < from.row))
    .sort((a, b) => (a - b) * direction)
  const row = rows[0]
  if (row === undefined) return null
  const inRow = cells.filter((cell) => cell.row === row).sort((a, b) => a.col - b.col)
  const reach = Math.max(from.col, 1)
  return inRow.filter((cell) => cell.col <= reach).at(-1) ?? inRow[0] ?? null
}
