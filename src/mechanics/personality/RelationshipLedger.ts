// Pure ledger operations: write entries, decay them, query summaries.
// No EventBus, no StateStore — the mechanic layer wires it in.

import type { CountryId } from '@contracts/mechanics/map'
import type {
  LedgerEntry,
  RelationshipLedger,
  NationPersonality,
} from '@contracts/mechanics/personality'
import { weightedMagnitude } from './archetypes'

/**
 * Append an entry to a ledger toward `targetId`. Returns a new ledger (input
 * is not mutated).
 */
export function addEntry(
  ledger: RelationshipLedger,
  targetId: CountryId,
  entry: LedgerEntry,
): RelationshipLedger {
  const key = targetId as string
  const existing = ledger.entries[key] ?? []
  return {
    entries: {
      ...ledger.entries,
      [key]: [...existing, entry],
    },
  }
}

/**
 * Apply linear decay to every entry in the ledger by `turnsElapsed` × entry
 * decay rate. Entries whose absolute magnitude falls below `cleanupThreshold`
 * are dropped.
 *
 * Returns:
 *   - the new ledger
 *   - a map of (targetKey → [entryId, newMagnitude]) for any entries that
 *     changed but remain; consumers use this to emit decay events.
 *   - a map of (targetKey → entryIds) for dropped entries (not currently
 *     surfaced as events, just logged in return value).
 */
export function decayLedger(
  ledger: RelationshipLedger,
  turnsElapsed: number,
  cleanupThreshold: number,
): {
  readonly ledger: RelationshipLedger
  readonly changed: ReadonlyMap<string, readonly { readonly entryId: string; readonly newMagnitude: number }[]>
  readonly dropped: ReadonlyMap<string, readonly string[]>
} {
  if (turnsElapsed <= 0) {
    return { ledger, changed: new Map(), dropped: new Map() }
  }

  const nextEntries: Record<string, readonly LedgerEntry[]> = {}
  const changed = new Map<string, { entryId: string; newMagnitude: number }[]>()
  const dropped = new Map<string, string[]>()

  for (const [key, entries] of Object.entries(ledger.entries)) {
    const changedForKey: { entryId: string; newMagnitude: number }[] = []
    const droppedForKey: string[] = []
    const survivors: LedgerEntry[] = []

    for (const entry of entries) {
      const sign = entry.magnitude >= 0 ? 1 : -1
      const absMag = Math.abs(entry.magnitude)
      const decayAmount = entry.decayPerTurn * turnsElapsed
      const nextAbs = Math.max(0, absMag - decayAmount)

      if (nextAbs < cleanupThreshold) {
        droppedForKey.push(entry.id)
        continue
      }

      const nextMagnitude = sign * nextAbs
      if (nextMagnitude !== entry.magnitude) {
        changedForKey.push({ entryId: entry.id, newMagnitude: nextMagnitude })
      }
      survivors.push({ ...entry, magnitude: nextMagnitude })
    }

    if (survivors.length > 0) {
      nextEntries[key] = survivors
    }
    if (changedForKey.length > 0) {
      changed.set(key, changedForKey)
    }
    if (droppedForKey.length > 0) {
      dropped.set(key, droppedForKey)
    }
  }

  return {
    ledger: { entries: nextEntries },
    changed,
    dropped,
  }
}

/**
 * Sum raw trust toward `targetId` — simply adds all entry magnitudes.
 * Useful for UI; the AI should prefer `weightedTrust` which applies archetype
 * multipliers per entry.
 */
export function rawTrust(ledger: RelationshipLedger, targetId: CountryId): number {
  const entries = ledger.entries[targetId as string] ?? []
  return entries.reduce((acc, e) => acc + e.magnitude, 0)
}

/**
 * Archetype-weighted trust toward `targetId`. Multiplies each entry's
 * magnitude by the owning archetype's per-category multiplier before summing.
 * This is the number AI scoring should consult.
 */
export function weightedTrust(
  nation: NationPersonality,
  targetId: CountryId,
): number {
  const entries = nation.ledger.entries[targetId as string] ?? []
  let total = 0
  for (const entry of entries) {
    total += weightedMagnitude(entry.magnitude, entry.category, nation.archetype)
  }
  return total
}
