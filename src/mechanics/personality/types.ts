// Mechanic-private types and config for the personality mechanic.

import type { AIPersonalityArchetype } from '@contracts/mechanics/ai'

export interface PersonalityConfig {
  /** Bias drift per turn toward archetype baseline (absolute value shed). */
  readonly biasDecayPerTurn: number
  /** Default decay for ledger entries written by the reactor (absolute units shed per turn). */
  readonly defaultLedgerDecay: number
  /** Entries whose magnitude drops below this threshold are removed. */
  readonly ledgerCleanupThreshold: number
  /** Bias baselines per archetype (what the bias drifts toward). */
  readonly biasBaselines: Readonly<Record<AIPersonalityArchetype, {
    readonly navalInvestment: number
    readonly religiousAggression: number
    readonly defensiveUrge: number
    readonly economicUrge: number
  }>>
}

export const DEFAULT_PERSONALITY_CONFIG: PersonalityConfig = {
  biasDecayPerTurn:       0.02,
  defaultLedgerDecay:     1.0,
  ledgerCleanupThreshold: 0.5,
  biasBaselines: {
    expansionist: { navalInvestment: 0.1, religiousAggression: 0.1, defensiveUrge: 0.1, economicUrge: 0.3 },
    hegemon:      { navalInvestment: 0.2, religiousAggression: 0.1, defensiveUrge: 0.3, economicUrge: 0.4 },
    mercantile:   { navalInvestment: 0.3, religiousAggression: 0.0, defensiveUrge: 0.2, economicUrge: 0.7 },
    isolationist: { navalInvestment: 0.1, religiousAggression: 0.2, defensiveUrge: 0.7, economicUrge: 0.3 },
    zealot:       { navalInvestment: 0.1, religiousAggression: 0.5, defensiveUrge: 0.2, economicUrge: 0.2 },
  },
}
