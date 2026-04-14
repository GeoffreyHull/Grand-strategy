// Public types for the personality mechanic — shared across mechanics via contracts.

import type { CountryId } from './map'
import type { AIPersonalityArchetype } from './ai'

/**
 * Category of a ledger entry. Archetype multipliers are keyed by this category,
 * so the same numeric magnitude produces different effective trust depending on
 * the owning nation's archetype.
 */
export type LedgerCategory =
  | 'aggression'     // unprovoked attacks, conquests
  | 'alliance'       // alliance honored / betrayed
  | 'economic'       // blockades, trade disruption (future)
  | 'religious'      // forced conversion, culture overwrite
  | 'opportunism'    // neighbour weakened (climate/epidemic) — exploit signal
  | 'rising-power'   // neighbour grown stronger (bumper harvest) — coalition trigger

/** A signed trust entry in a nation's ledger toward another nation. */
export interface LedgerEntry {
  /** Unique id — usually `<source-tag>:turn-<n>`. */
  readonly id: string
  readonly category: LedgerCategory
  /** Signed magnitude. Positive = trust, negative = hostility. */
  readonly magnitude: number
  /** Absolute magnitude shed per turn (linear decay toward 0). */
  readonly decayPerTurn: number
  readonly createdOnTurn: number
  /** Short human-readable source label (for debugging/UI tooltips). */
  readonly source: string
}

export interface RelationshipLedger {
  /** key = other CountryId (as string) → entries toward that nation. */
  readonly entries: Readonly<Record<string, readonly LedgerEntry[]>>
}

/**
 * Non-relational accumulated biases that drift based on lived experience.
 * E.g. a Mercantile nation repeatedly storm-blocked on its coast builds up
 * naval-investment urgency; a Zealot whose fleet is storm-wrecked redirects
 * aggression inland via religiousAggression.
 *
 * Values are in 0..1. They drift slowly back toward 0 each turn.
 */
export interface InvestmentBias {
  readonly navalInvestment: number
  readonly religiousAggression: number
  readonly defensiveUrge: number
  readonly economicUrge: number
}

/**
 * Archetype-level weighting rules. Applied at query time by consumers
 * (the AI mechanic) so the ledger stays a pure record of events.
 */
export interface ArchetypeWeights {
  /** Scales how strongly low trust converts to war willingness toward the target. */
  readonly warWillingness: number
  /** Scales how strongly this nation weighs economic urges in decision-making. */
  readonly economicPriority: number
  /** Scales sensitivity to religious ledger entries. */
  readonly religiousSensitivity: number
  /** Scales defensive bias (fortify/isolate preference). */
  readonly defensiveInvestment: number
  /** Scales reaction to neighbours gaining/losing power. */
  readonly threatAssessment: number
  /** Per-category multiplier applied to each ledger entry's magnitude at query time. */
  readonly ledgerCategoryMultipliers: Readonly<Record<LedgerCategory, number>>
}

export interface NationPersonality {
  readonly countryId: CountryId
  readonly archetype: AIPersonalityArchetype
  readonly ledger: RelationshipLedger
  readonly bias: InvestmentBias
  /**
   * Resolved archetype weights, snapshot at init time. Consumers (the AI
   * mechanic) read these directly rather than importing from the
   * personality mechanic, keeping mechanic boundaries intact.
   */
  readonly weights: ArchetypeWeights
}

export interface PersonalityState {
  /** key = CountryId (as string) → that nation's personality record. */
  readonly nations: Readonly<Record<string, NationPersonality>>
}
