// Archetype weighting rules used by the personality mechanic.
// Pure data. Mirrors the AI mechanic's archetype enum (renamed in the recent
// contracts update) so every nation has exactly one archetype across both
// mechanics.

import type {
  ArchetypeWeights,
  LedgerCategory,
} from '@contracts/mechanics/personality'
import type { AIPersonalityArchetype } from '@contracts/mechanics/ai'

const ONE_X: Readonly<Record<LedgerCategory, number>> = {
  aggression:     1.0,
  alliance:       1.0,
  economic:       1.0,
  religious:      1.0,
  opportunism:    1.0,
  'rising-power': 1.0,
}

function mult(overrides: Partial<Record<LedgerCategory, number>>): Readonly<Record<LedgerCategory, number>> {
  return { ...ONE_X, ...overrides }
}

export const ARCHETYPE_WEIGHTS: Readonly<Record<AIPersonalityArchetype, ArchetypeWeights>> = {
  expansionist: {
    warWillingness:       0.9,
    economicPriority:     0.4,
    religiousSensitivity: 0.2,
    defensiveInvestment:  0.3,
    threatAssessment:     0.8,
    ledgerCategoryMultipliers: mult({ opportunism: 1.8, aggression: 1.2 }),
  },
  mercantile: {
    warWillingness:       0.3,
    economicPriority:     0.9,
    religiousSensitivity: 0.2,
    defensiveInvestment:  0.4,
    threatAssessment:     0.6,
    ledgerCategoryMultipliers: mult({ economic: 2.0 }),
  },
  zealot: {
    warWillingness:       0.7,
    economicPriority:     0.3,
    religiousSensitivity: 0.9,
    defensiveInvestment:  0.3,
    threatAssessment:     0.5,
    ledgerCategoryMultipliers: mult({ religious: 2.0, opportunism: 1.3 }),
  },
  isolationist: {
    warWillingness:       0.2,
    economicPriority:     0.5,
    religiousSensitivity: 0.4,
    defensiveInvestment:  0.9,
    threatAssessment:     0.7,
    ledgerCategoryMultipliers: mult({ aggression: 1.5 }),
  },
  hegemon: {
    warWillingness:       0.6,
    economicPriority:     0.6,
    religiousSensitivity: 0.3,
    defensiveInvestment:  0.5,
    threatAssessment:     1.0,
    ledgerCategoryMultipliers: mult({ 'rising-power': 2.5, alliance: 1.3 }),
  },
}

/**
 * Effective trust that `fromCountry` (with the given archetype) holds toward
 * a single ledger entry. Applies the archetype's per-category multiplier
 * without mutating the underlying entry.
 */
export function weightedMagnitude(
  entryMagnitude: number,
  category: LedgerCategory,
  archetype: AIPersonalityArchetype,
): number {
  const weights = ARCHETYPE_WEIGHTS[archetype]
  const multiplier = weights.ledgerCategoryMultipliers[category] ?? 1
  return entryMagnitude * multiplier
}
