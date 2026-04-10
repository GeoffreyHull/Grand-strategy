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

// Maximum repetitions of each action type within a single decision batch.
// Limits how many times the same category of action can fire per turn.
const ACTION_MAX_REPS: Readonly<Record<AIActionType, number>> = {
  EXPAND:   2,  // can declare war on up to 2 nations
  FORTIFY:  3,  // can raise up to 3 armies
  ALLY:     2,  // can form up to 2 alliances
  ISOLATE:  2,  // can fortify up to 2 provinces
  RESEARCH: 1,  // queue at most 1 tech per decision
}

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

  if (aiState.countries[countryId]?.lastDecisions.some(d => d.action === 'ALLY')) score -= 0.1

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
   * Each nation may take multiple actions depending on personality and utility scores.
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

      const decisions = this.evaluateDecisions(countryState, context, frame)

      updated.push({
        ...countryState,
        lastDecisions: decisions,
        lastDecisionFrame: frame,
      })

      for (const decision of decisions) {
        this.eventBus.emit('ai:decision-made', { decision })
      }
    }

    return updated
  }

  /**
   * Utility-based decision for a single country — returns the single best action.
   * Used for testing and as a building block.
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

  /**
   * Multi-action decision for a single country.
   *
   * Scores all five action types then selects 1–N actions to execute based on:
   * - A personality-weighted minimum score threshold (cautious AIs act less freely)
   * - A personality-driven action budget (aggressive/economic AIs can do more per turn)
   * - Per-action-type repetition caps (e.g. FORTIFY can fire up to 3 times, RESEARCH only once)
   *
   * Targets for EXPAND and ALLY are tracked across repetitions so the same nation
   * is never declared war on or allied with twice in the same batch.
   *
   * Always returns at least one action.
   */
  evaluateDecisions(
    countryState: AICountryState,
    context: AIContext,
    frame: number,
  ): readonly AIDecision[] {
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

    // Cautious AIs require higher-scoring actions before acting; aggressive AIs have a lower bar.
    const actionThreshold = 0.25 + personality.caution * 0.15 - personality.aggression * 0.05

    // Aggressive/economically active AIs can take more actions per decision (range 1–4).
    const maxActions = Math.min(4, Math.max(1,
      1 + Math.round(personality.aggression * 2 + personality.economy * 0.5),
    ))

    // Sort by score descending; keep only those that clear the threshold.
    const eligible = candidates
      .filter(c => c.score >= actionThreshold)
      .sort((a, b) => b.score - a.score)

    const decisions: AIDecision[] = []
    // Track which targets have already been chosen this batch to avoid duplicates.
    const usedWarTargets = new Set<CountryId>()
    const usedAllyTargets = new Set<CountryId>()

    for (const candidate of eligible) {
      if (decisions.length >= maxActions) break

      const maxReps = ACTION_MAX_REPS[candidate.action]
      // High-scoring actions (> 0.65) may fire more than once if the budget allows.
      const reps = candidate.score > 0.65
        ? Math.min(maxReps, maxActions - decisions.length)
        : 1

      for (let r = 0; r < reps; r++) {
        if (decisions.length >= maxActions) break

        let targetCountryId: CountryId | null = null
        if (candidate.action === 'ALLY') {
          targetCountryId = this.findAllyTarget(countryId, aiState, diplomacyState, usedAllyTargets)
          // No more unique ally targets available — stop repeating this action.
          if (targetCountryId === null && r > 0) break
          if (targetCountryId !== null) usedAllyTargets.add(targetCountryId)
        } else if (candidate.action === 'EXPAND') {
          targetCountryId = this.findWarTarget(countryId, mapState, diplomacyState, usedWarTargets)
          // No more unique war targets available — stop repeating this action.
          if (targetCountryId === null && r > 0) break
          if (targetCountryId !== null) usedWarTargets.add(targetCountryId)
        }

        decisions.push({
          countryId,
          action: candidate.action as AIActionType,
          targetCountryId,
          priority: Math.min(1, Math.max(0, candidate.score)),
          frame,
        })
      }
    }

    // Guarantee at least one action even when nothing clears the threshold.
    if (decisions.length === 0) {
      const best = candidates.reduce((a, b) => b.score > a.score ? b : a)
      let targetCountryId: CountryId | null = null
      if (best.action === 'ALLY') {
        targetCountryId = this.findAllyTarget(countryId, aiState, diplomacyState)
      } else if (best.action === 'EXPAND') {
        targetCountryId = this.findWarTarget(countryId, mapState, diplomacyState)
      }
      decisions.push({
        countryId,
        action: best.action as AIActionType,
        targetCountryId,
        priority: Math.min(1, Math.max(0, best.score)),
        frame,
      })
    }

    return decisions
  }

  /** Find the most diplomatically compatible ally candidate, excluding already-chosen targets. */
  private findAllyTarget(
    countryId: CountryId,
    aiState: AIState,
    diplomacyState: DiplomacyState,
    excluded: ReadonlySet<CountryId> = new Set(),
  ): CountryId | null {
    const friendlyArchetypes = new Set(['diplomat', 'merchant'])
    let best: CountryId | null = null
    let bestScore = -1

    for (const [id, state] of Object.entries(aiState.countries)) {
      if (id === countryId) continue
      if (state.isPlayerControlled) continue
      if (excluded.has(state.countryId)) continue
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
   * Find the best war target for an EXPAND decision, excluding already-chosen targets.
   * Prefers weaker countries (fewer provinces) that can be legally attacked:
   * not allied, not already at war, not in an active truce.
   * Returns null when no valid target exists.
   */
  private findWarTarget(
    countryId: CountryId,
    mapState: MapState,
    diplomacyState: DiplomacyState,
    excluded: ReadonlySet<CountryId> = new Set(),
  ): CountryId | null {
    let best: CountryId | null = null
    let bestProvinceCount = Infinity

    for (const [id, country] of Object.entries(mapState.countries)) {
      if (id === countryId) continue
      if (country.provinceIds.length === 0) continue
      if (excluded.has(id as CountryId)) continue

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
