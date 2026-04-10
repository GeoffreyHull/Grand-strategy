// Public types for the AI mechanic — shared across mechanics via contracts.

import type { CountryId } from './map'

export type AIPersonalityArchetype =
  | 'conqueror'     // aggressive expansion, military-focused
  | 'diplomat'      // alliance-seeking, conflict-averse
  | 'merchant'      // economy-focused, trade-oriented
  | 'isolationist'  // defensive, self-sufficient, inward-facing
  | 'zealot'        // ideology-driven, unpredictable aggression

export interface AIPersonality {
  readonly archetype: AIPersonalityArchetype
  /** Weight toward EXPAND actions (0–1) */
  readonly aggression: number
  /** Weight toward ALLY actions (0–1) */
  readonly diplomacy: number
  /** Weight toward economic/development priorities (0–1) */
  readonly economy: number
  /** Weight toward FORTIFY / ISOLATE actions (0–1) */
  readonly caution: number
}

export type AIActionType = 'EXPAND' | 'FORTIFY' | 'ALLY' | 'ISOLATE' | 'RESEARCH' | 'SEEK_PEACE'

export interface AIDecision {
  readonly countryId: CountryId
  readonly action: AIActionType
  /** Target country for EXPAND (war) and ALLY actions; null otherwise */
  readonly targetCountryId: CountryId | null
  /** Utility score that selected this action (0–1) */
  readonly priority: number
  /** Game loop frame on which this decision was made */
  readonly frame: number
}

export interface AICountryState {
  readonly countryId: CountryId
  readonly isPlayerControlled: boolean
  readonly personality: AIPersonality
  readonly lastDecisions: readonly AIDecision[]
  readonly lastDecisionFrame: number
}

export interface AIState {
  /** Keyed by CountryId string */
  readonly countries: Readonly<Record<string, AICountryState>>
  readonly playerCountryId: CountryId | null
  /** Number of game loop frames between AI decisions (default 60 ≈ 3 s at 20 Hz) */
  readonly decisionIntervalFrames: number
}
