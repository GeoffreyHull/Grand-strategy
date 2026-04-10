// Internal types for the AI mechanic — not exported outside this mechanic.

import type { AIActionType, AIState } from '@contracts/mechanics/ai'
import type { MapState } from '@contracts/state'
import type { DiplomacyState } from '@contracts/mechanics/diplomacy'
import type { TechnologyState } from '@contracts/mechanics/technology'

export interface ScoredAction {
  readonly action: AIActionType
  readonly score: number
}

/** All state slices the AI controller needs to make decisions. */
export interface AIContext {
  readonly mapState: MapState
  readonly aiState: AIState
  readonly diplomacyState: DiplomacyState
  readonly technologyState: TechnologyState
}
