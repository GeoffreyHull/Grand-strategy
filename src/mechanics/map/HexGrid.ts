// Pure hex geometry — no DOM, no state, no side effects.
// Uses pointy-top hexagons with odd-row offset coordinates.

/** Pixel coordinates of a hex cell's center. */
export function hexToPixel(
  col: number,
  row: number,
  hexSize: number,
): { x: number; y: number } {
  const w = Math.sqrt(3) * hexSize
  const h = 2 * hexSize
  const x = col * w + (row % 2 !== 0 ? w / 2 : 0)
  const y = row * (h * 0.75)
  return { x, y }
}

/** Nearest hex cell from a pixel coordinate. */
export function pixelToHex(
  px: number,
  py: number,
  hexSize: number,
): { col: number; row: number } {
  const w = Math.sqrt(3) * hexSize
  const h = 2 * hexSize
  const rowF = py / (h * 0.75)
  const row  = Math.round(rowF)
  const offset = row % 2 !== 0 ? w / 2 : 0
  const col  = Math.round((px - offset) / w)
  return { col, row }
}

/** Six corner vertices of a pointy-top hexagon centered at (cx, cy). */
export function hexCorners(
  cx: number,
  cy: number,
  hexSize: number,
): readonly [number, number][] {
  const corners: [number, number][] = []
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 30  // pointy-top: first corner at 30°
    const angleRad = (Math.PI / 180) * angleDeg
    corners.push([
      cx + hexSize * Math.cos(angleRad),
      cy + hexSize * Math.sin(angleRad),
    ])
  }
  return corners
}

/** The 6 neighbour cells of a hex in odd-row offset coordinates. */
export function hexNeighbors(
  col: number,
  row: number,
): readonly { col: number; row: number }[] {
  const isOdd = row % 2 !== 0
  return [
    { col: col + 1, row },
    { col: col - 1, row },
    { col: col,     row: row - 1 },
    { col: col,     row: row + 1 },
    { col: isOdd ? col + 1 : col - 1, row: row - 1 },
    { col: isOdd ? col + 1 : col - 1, row: row + 1 },
  ]
}

/** Encode a cell address as a string key suitable for Record/Map lookup. */
export function cellKey(col: number, row: number): string {
  return `${col},${row}`
}

/** Decode a cell key back to col/row. */
export function parseCellKey(key: string): { col: number; row: number } {
  const [colStr, rowStr] = key.split(',')
  return { col: parseInt(colStr, 10), row: parseInt(rowStr, 10) }
}

/** True if pixel (px, py) lies inside the hexagon centered at (cx, cy). */
export function isPointInHex(
  px: number,
  py: number,
  cx: number,
  cy: number,
  hexSize: number,
): boolean {
  const dx = Math.abs(px - cx)
  const dy = Math.abs(py - cy)
  if (dy > hexSize) return false
  if (dx > (Math.sqrt(3) / 2) * hexSize) return false
  // Combined condition for pointy-top hex
  return Math.sqrt(3) * dy + dx <= Math.sqrt(3) * hexSize
}
