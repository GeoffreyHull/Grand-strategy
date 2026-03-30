// Internal types for the AI mechanic — not exported outside this mechanic.

import type { AIActionType } from '@contracts/mechanics/ai'

export interface ScoredAction {
  readonly action: AIActionType
  readonly score: number
}
