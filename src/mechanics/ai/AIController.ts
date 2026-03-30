// Decision-making engine for AI-controlled nations.
// Pure logic — no browser globals, no DOM/Canvas.

import type { EventBus } from '../../engine/EventBus'
import type { EventMap } from '@contracts/events'
import type { MapState } from '@contracts/state'
import type {
  AIState,
  AICountryState,
  AIDecision,
  AIActionType,
  AIPersonality,
} from '@contracts/mechanics/ai'
import type { CountryId } from '@contracts/mechanics/map'
import type { ScoredAction } from './types'

// ── Utility scoring ───────────────────────────────────────────────────────────

/**
 * Score the EXPAND action (0–1).
 * Smaller nations and those with foreign neighbours score higher.
 */
function scoreExpand(countryId: CountryId, mapState: MapState): number {
  const allCounts = Object.values(mapState.countries).map(c => c.provinceIds.length)
  const maxCount = Math.max(...allCounts, 1)
  const ownCount = mapState.countries[countryId]?.provinceIds.length ?? 0

  // Smaller relative size → stronger desire to expand
  let score = 1 - ownCount / maxCount

  // Bonus when foreign provinces exist (there are always expansion targets)
  const hasForeignNeighbours = Object.values(mapState.countries).some(
    c => c.id !== countryId && c.provinceIds.length > 0,
  )
  if (hasForeignNeighbours) score = Math.min(1, score + 0.15)

  return Math.min(1, Math.max(0, score))
}

/**
 * Score the FORTIFY action (0–1).
 * Nations with many coastal, hilly, or mountainous provinces score higher —
 * these borders need defending.
 */
function scoreFortify(countryId: CountryId, mapState: MapState): number {
  const country = mapState.countries[countryId]
  if (!country || country.provinceIds.length === 0) return 0.3

  let borderCount = 0
  for (const provinceId of country.provinceIds) {
    const province = mapState.provinces[provinceId]
    if (!province) continue
    if (
      province.isCoastal ||
      province.terrainType === 'hills' ||
      province.terrainType === 'mountains'
    ) {
      borderCount++
    }
  }

  const ratio = borderCount / country.provinceIds.length
  return Math.min(1, Math.max(0, ratio))
}

/**
 * Score the ALLY action (0–1).
 * Diplomatically inclined nations or those near aggressive powers score higher.
 */
function scoreAlly(
  countryId: CountryId,
  aiState: AIState,
): number {
  let score = 0.3

  // Bonus when a conqueror or zealot nation exists in the world (threat perception)
  const threateningArchetypes = new Set(['conqueror', 'zealot'])
  for (const [id, state] of Object.entries(aiState.countries)) {
    if (id === countryId) continue
    if (threateningArchetypes.has(state.personality.archetype)) {
      score += 0.1
      break
    }
  }

  // Penalty for repeating an ALLY decision immediately
  if (aiState.countries[countryId]?.lastDecision?.action === 'ALLY') {
    score -= 0.1
  }

  return Math.min(1, Math.max(0, score))
}

/**
 * Score the ISOLATE action (0–1).
 * Cautious nations prefer to stay out of conflicts.
 */
function scoreIsolate(personality: AIPersonality): number {
  return Math.min(1, Math.max(0, 0.2 + personality.caution * 0.3))
}

// ── AIController ──────────────────────────────────────────────────────────────

export class AIController {
  constructor(private readonly eventBus: EventBus<EventMap>) {}

  /**
   * Called each game-loop update tick.
   * Evaluates decisions for all AI nations whose interval has elapsed.
   * Returns updated AICountryState entries (only those that decided this tick).
   */
  update(
    frame: number,
    mapState: MapState,
    aiState: AIState,
  ): readonly AICountryState[] {
    const updated: AICountryState[] = []

    for (const [, countryState] of Object.entries(aiState.countries)) {
      if (countryState.isPlayerControlled) continue

      const framesSinceLast = frame - countryState.lastDecisionFrame
      if (framesSinceLast < aiState.decisionIntervalFrames) continue

      const decision = this.evaluateDecision(countryState, mapState, aiState, frame)

      updated.push({
        ...countryState,
        lastDecision: decision,
        lastDecisionFrame: frame,
      })

      this.eventBus.emit('ai:decision-made', { decision })
    }

    return updated
  }

  /**
   * Utility-based decision for a single country.
   * Scores all four action types, weights by personality, adds noise, picks max.
   */
  evaluateDecision(
    countryState: AICountryState,
    mapState: MapState,
    aiState: AIState,
    frame: number,
  ): AIDecision {
    const { countryId, personality } = countryState

    const candidates: ScoredAction[] = [
      {
        action: 'EXPAND',
        score: scoreExpand(countryId, mapState) * personality.aggression + Math.random() * 0.1,
      },
      {
        action: 'FORTIFY',
        score: scoreFortify(countryId, mapState) * personality.caution + Math.random() * 0.1,
      },
      {
        action: 'ALLY',
        score: scoreAlly(countryId, aiState) * personality.diplomacy + Math.random() * 0.1,
      },
      {
        action: 'ISOLATE',
        score: scoreIsolate(personality) * personality.caution + Math.random() * 0.1,
      },
    ]

    const best = candidates.reduce((a, b) => (b.score > a.score ? b : a))

    const targetCountryId: CountryId | null =
      best.action === 'ALLY' ? this.findAllyTarget(countryId, aiState) : null

    return {
      countryId,
      action: best.action as AIActionType,
      targetCountryId,
      priority: Math.min(1, Math.max(0, best.score)),
      frame,
    }
  }

  /** Find the most diplomatically compatible ally candidate. */
  private findAllyTarget(
    countryId: CountryId,
    aiState: AIState,
  ): CountryId | null {
    const friendlyArchetypes = new Set(['diplomat', 'merchant'])
    let best: CountryId | null = null
    let bestScore = -1

    for (const [id, state] of Object.entries(aiState.countries)) {
      if (id === countryId) continue
      if (state.isPlayerControlled) continue
      const score = friendlyArchetypes.has(state.personality.archetype)
        ? state.personality.diplomacy
        : state.personality.diplomacy * 0.5
      if (score > bestScore) {
        bestScore = score
        best = state.countryId
      }
    }

    return best
  }
}
