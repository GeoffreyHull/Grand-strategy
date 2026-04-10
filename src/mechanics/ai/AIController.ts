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
import type { DiplomacyState } from '@contracts/mechanics/diplomacy'
import type { TechnologyState } from '@contracts/mechanics/technology'
import type { CountryId } from '@contracts/mechanics/map'
import type { ScoredAction, AIContext } from './types'

// Total number of distinct technology types — drives RESEARCH urgency.
const TOTAL_TECH_COUNT = 8

// ── Utility scoring ───────────────────────────────────────────────────────────

/**
 * Score the EXPAND action (0–1).
 * Smaller nations and those with foreign neighbours score higher.
 */
function scoreExpand(countryId: CountryId, mapState: MapState): number {
  const allCounts = Object.values(mapState.countries).map(c => c.provinceIds.length)
  const maxCount = Math.max(...allCounts, 1)
  const ownCount = mapState.countries[countryId]?.provinceIds.length ?? 0

  let score = 1 - ownCount / maxCount

  const hasForeignNeighbours = Object.values(mapState.countries).some(
    c => c.id !== countryId && c.provinceIds.length > 0,
  )
  if (hasForeignNeighbours) score = Math.min(1, score + 0.15)

  return Math.min(1, Math.max(0, score))
}

/**
 * Score the FORTIFY action (0–1).
 * Nations with many coastal, hilly, or mountainous provinces score higher.
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
 * Returns 0 when no valid alliance candidates exist.
 * Boosts when aggressive nations are present; penalises repeating ALLY.
 */
function scoreAlly(
  countryId: CountryId,
  aiState: AIState,
  diplomacyState: DiplomacyState,
): number {
  // No point scoring ALLY if there are no legal alliance targets
  const hasValidCandidate = Object.keys(aiState.countries).some(id => {
    if (id === countryId) return false
    const key = [countryId, id].sort().join(':')
    const status = diplomacyState.relations[key]?.status ?? 'neutral'
    return status !== 'allied' && status !== 'war'
  })
  if (!hasValidCandidate) return 0

  let score = 0.3

  const threateningArchetypes = new Set(['conqueror', 'zealot'])
  for (const [id, state] of Object.entries(aiState.countries)) {
    if (id === countryId) continue
    if (threateningArchetypes.has(state.personality.archetype)) {
      score += 0.1
      break
    }
  }

  if (aiState.countries[countryId]?.lastDecision?.action === 'ALLY') score -= 0.1

  return Math.min(1, Math.max(0, score))
}

/**
 * Score the ISOLATE action (0–1).
 * Cautious nations prefer to stay out of conflicts.
 */
function scoreIsolate(personality: AIPersonality): number {
  return Math.min(1, Math.max(0, 0.2 + personality.caution * 0.3))
}

/**
 * Score the RESEARCH action (0–1).
 * Rises with the fraction of undiscovered technologies.
 * Weighted by personality.economy in the candidates list.
 */
function scoreResearch(countryId: CountryId, technologyState: TechnologyState): number {
  const known = technologyState.byCountry[countryId]?.length ?? 0
  const remaining = TOTAL_TECH_COUNT - known
  if (remaining === 0) return 0
  return remaining / TOTAL_TECH_COUNT
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
    context: AIContext,
  ): readonly AICountryState[] {
    const updated: AICountryState[] = []
    const { aiState } = context

    for (const [, countryState] of Object.entries(aiState.countries)) {
      if (countryState.isPlayerControlled) continue

      const framesSinceLast = frame - countryState.lastDecisionFrame
      if (framesSinceLast < aiState.decisionIntervalFrames) continue

      const decision = this.evaluateDecision(countryState, context, frame)

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
   * Scores all five action types, weights by personality, adds noise, picks max.
   */
  evaluateDecision(
    countryState: AICountryState,
    context: AIContext,
    frame: number,
  ): AIDecision {
    const { countryId, personality } = countryState
    const { mapState, aiState, diplomacyState, technologyState } = context

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
        score: scoreAlly(countryId, aiState, diplomacyState) * personality.diplomacy + Math.random() * 0.1,
      },
      {
        action: 'ISOLATE',
        score: scoreIsolate(personality) * personality.caution + Math.random() * 0.1,
      },
      {
        action: 'RESEARCH',
        score: scoreResearch(countryId, technologyState) * personality.economy + Math.random() * 0.1,
      },
    ]

    const best = candidates.reduce((a, b) => (b.score > a.score ? b : a))

    let targetCountryId: CountryId | null = null
    if (best.action === 'ALLY') {
      targetCountryId = this.findAllyTarget(countryId, aiState, diplomacyState)
    } else if (best.action === 'EXPAND') {
      targetCountryId = this.findWarTarget(countryId, mapState, diplomacyState)
    }

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
    diplomacyState: DiplomacyState,
  ): CountryId | null {
    const friendlyArchetypes = new Set(['diplomat', 'merchant'])
    let best: CountryId | null = null
    let bestScore = -1

    for (const [id, state] of Object.entries(aiState.countries)) {
      if (id === countryId) continue
      if (state.isPlayerControlled) continue
      // Skip already allied or at-war countries
      const key = [countryId, id].sort().join(':')
      const status = diplomacyState.relations[key]?.status ?? 'neutral'
      if (status === 'allied' || status === 'war') continue

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

  /**
   * Find the best war target for an EXPAND decision.
   * Prefers weaker countries (fewer provinces) that can be legally attacked:
   * not allied, not already at war, not in an active truce.
   * Returns null when no valid target exists.
   */
  private findWarTarget(
    countryId: CountryId,
    mapState: MapState,
    diplomacyState: DiplomacyState,
  ): CountryId | null {
    let best: CountryId | null = null
    let bestProvinceCount = Infinity

    for (const [id, country] of Object.entries(mapState.countries)) {
      if (id === countryId) continue
      if (country.provinceIds.length === 0) continue

      const key = [countryId, id].sort().join(':')
      const status = diplomacyState.relations[key]?.status ?? 'neutral'
      if (status === 'allied' || status === 'war' || status === 'truce') continue

      if (country.provinceIds.length < bestProvinceCount) {
        bestProvinceCount = country.provinceIds.length
        best = id as CountryId
      }
    }

    return best
  }
}
