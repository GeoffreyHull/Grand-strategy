// Internal types and constants for the diplomacy mechanic.
// All public-facing types live in src/contracts/mechanics/diplomacy.ts.

/** Number of turns a truce lasts after peace is made. */
export const TRUCE_DURATION_TURNS = 5

/**
 * Returns a canonical, order-independent key for a pair of countries.
 * Always places the lexicographically smaller id first so the same pair
 * always maps to the same key regardless of argument order.
 */
export function makeRelationKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

/**
 * Returns [countryA, countryB] in canonical order (lexicographically smaller first).
 */
export function sortedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}
