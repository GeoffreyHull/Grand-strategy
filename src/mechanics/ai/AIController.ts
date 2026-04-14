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
import type {
  LedgerEntry,
  NationPersonality,
  PersonalityState,
} from '@contracts/mechanics/personality'
import type { ScoredAction, AIContext } from './types'

// Total number of distinct technology types — drives RESEARCH urgency.
const TOTAL_TECH_COUNT = 8

// Maximum repetitions of each action type within a single decision batch.
// Limits how many times the same category of action can fire per turn.
const ACTION_MAX_REPS: Readonly<Record<AIActionType, number>> = {
  EXPAND:     2,  // can declare war on up to 2 nations
  FORTIFY:    3,  // can raise up to 3 armies
  ALLY:       2,  // can form up to 2 alliances
  ISOLATE:    2,  // can fortify up to 2 provinces
  RESEARCH:   1,  // queue at most 1 tech per decision
  SEEK_PEACE: 1,  // request truce with at most 1 enemy per decision
}

// ── Personality helpers ───────────────────────────────────────────────────────
// These read `NationPersonality` directly from state; no import from the
// personality mechanic is needed (isolation rule 2).

/** Look up the personality record for a country. Returns null if absent. */
function getPersonality(
  personalityState: PersonalityState | undefined,
  countryId: CountryId,
): NationPersonality | null {
  if (!personalityState) return null
  return personalityState.nations[countryId as string] ?? null
}

/** Sum of ledger-entry magnitudes toward target, each scaled by the owning archetype's category multiplier. */
function weightedTrustFor(
  nation: NationPersonality,
  targetId: CountryId,
): number {
  const entries: readonly LedgerEntry[] = nation.ledger.entries[targetId as string] ?? []
  if (entries.length === 0) return 0
  const mults = nation.weights.ledgerCategoryMultipliers
  let total = 0
  for (const e of entries) {
    total += e.magnitude * (mults[e.category] ?? 1)
  }
  return total
}

// ── Utility scoring ───────────────────────────────────────────────────────────

/**
 * Score the EXPAND action (0–1).
 * Smaller nations and those with foreign neighbours score higher.
 * When a personality record is available, accumulated hostility toward *any*
 * existing nation raises the score — this is how climate-driven opportunism
 * and rising-power signals bubble up into war willingness.
 */
function scoreExpand(
  countryId: CountryId,
  mapState: MapState,
  personalityState?: PersonalityState,
): number {
  const allCounts = Object.values(mapState.countries).map(c => c.provinceIds.length)
  const maxCount = Math.max(...allCounts, 1)
  const ownCount = mapState.countries[countryId]?.provinceIds.length ?? 0

  let score = 1 - ownCount / maxCount

  const hasForeignNeighbours = Object.values(mapState.countries).some(
    c => c.id !== countryId && c.provinceIds.length > 0,
  )
  if (hasForeignNeighbours) score = Math.min(1, score + 0.15)

  const nation = getPersonality(personalityState, countryId)
  if (nation) {
    // Find the most hostile weighted-trust value toward any other nation.
    let peakHostility = 0
    for (const otherId of Object.keys(mapState.countries)) {
      if (otherId === countryId) continue
      const trust = weightedTrustFor(nation, otherId as CountryId)
      if (trust < peakHostility) peakHostility = trust
    }
    // peakHostility is a small negative number (e.g. -30). Scale it into 0..0.25
    // and modulate by the archetype's warWillingness so Expansionists react
    // harder than Hegemons to the same opportunity signal.
    const opportunityBoost = Math.min(0.25, Math.abs(peakHostility) / 120) * nation.weights.warWillingness
    score = Math.min(1, score + opportunityBoost)

    // Investment bias: religious aggression tacks onto expansion score;
    // defensive urge suppresses it.
    score += nation.bias.religiousAggression * 0.1
    score -= nation.bias.defensiveUrge * 0.15
  }

  return Math.min(1, Math.max(0, score))
}

/**
 * Score the FORTIFY action (0–1).
 * Nations with many coastal, hilly, or mountainous provinces score higher.
 * Defensive-urge bias boosts the score when the personality mechanic is wired.
 */
function scoreFortify(
  countryId: CountryId,
  mapState: MapState,
  personalityState?: PersonalityState,
): number {
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
  let score = ratio

  const nation = getPersonality(personalityState, countryId)
  if (nation) score += nation.bias.defensiveUrge * 0.2

  return Math.min(1, Math.max(0, score))
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

  const threateningArchetypes = new Set(['expansionist', 'zealot'])
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
 * Naval-investment and economic-urge biases boost the base score — a
 * Mercantile nation repeatedly storm-blocked accumulates navalInvestment and
 * tilts toward RESEARCH (over time, into naval tech specifically when the
 * tech-selection layer supports it).
 */
function scoreResearch(
  countryId: CountryId,
  technologyState: TechnologyState,
  personalityState?: PersonalityState,
): number {
  const known = technologyState.byCountry[countryId]?.length ?? 0
  const remaining = TOTAL_TECH_COUNT - known
  if (remaining === 0) return 0
  let score = remaining / TOTAL_TECH_COUNT

  const nation = getPersonality(personalityState, countryId)
  if (nation) {
    score += nation.bias.navalInvestment * 0.15
    score += nation.bias.economicUrge * 0.1
  }
  return Math.min(1, score)
}

/**
 * Score the SEEK_PEACE action (0–1).
 * Returns 0 when the country has no active wars.
 * Otherwise, cost rises when facing more total enemy provinces (power deficit),
 * fighting on multiple fronts, or when the personality is cautious/diplomatic.
 * Conquerors and zealots suppress this score via their low caution/high aggression.
 */
function scoreSeekPeace(
  countryId: CountryId,
  mapState: MapState,
  diplomacyState: DiplomacyState,
  personality: AIPersonality,
): number {
  const enemies = Object.values(diplomacyState.relations).filter(
    r => r.status === 'war' && (r.countryA === countryId || r.countryB === countryId),
  )
  if (enemies.length === 0) return 0

  const ownProvinces = mapState.countries[countryId]?.provinceIds.length ?? 0
  if (ownProvinces === 0) return 0

  // Combined province count across all belligerents
  const totalEnemyProvinces = enemies.reduce((sum, r) => {
    const enemyId = r.countryA === countryId ? r.countryB : r.countryA
    return sum + (mapState.countries[enemyId]?.provinceIds.length ?? 0)
  }, 0)

  // Power deficit: 0 when even, rises toward 1 as enemy grows stronger
  const powerRatio = ownProvinces / Math.max(1, totalEnemyProvinces)
  const powerDeficit = Math.max(0, 1 - powerRatio)

  // Multi-front penalty: each additional war adds pressure
  const multiFrontPenalty = Math.min(0.3, (enemies.length - 1) * 0.15)

  // Personality: cautious/diplomatic characters feel war cost more acutely
  const personalityUrge = personality.caution * 0.4 + (1 - personality.aggression) * 0.3

  return Math.min(1, powerDeficit * 0.5 + personalityUrge * 0.4 + multiFrontPenalty)
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
    const { mapState, aiState, diplomacyState, technologyState, personalityState } = context

    const candidates: ScoredAction[] = [
      {
        action: 'EXPAND',
        score: scoreExpand(countryId, mapState, personalityState) * personality.aggression + Math.random() * 0.1,
      },
      {
        action: 'FORTIFY',
        score: scoreFortify(countryId, mapState, personalityState) * personality.caution + Math.random() * 0.1,
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
        score: scoreResearch(countryId, technologyState, personalityState) * personality.economy + Math.random() * 0.1,
      },
      {
        action: 'SEEK_PEACE',
        score: scoreSeekPeace(countryId, mapState, diplomacyState, personality) + Math.random() * 0.1,
      },
    ]

    const best = candidates.reduce((a, b) => (b.score > a.score ? b : a))

    let targetCountryId: CountryId | null = null
    if (best.action === 'ALLY') {
      targetCountryId = this.findAllyTarget(countryId, aiState, diplomacyState)
    } else if (best.action === 'EXPAND') {
      targetCountryId = this.findWarTarget(countryId, mapState, diplomacyState, new Set(), personalityState)
    } else if (best.action === 'SEEK_PEACE') {
      targetCountryId = this.findWarEnemy(countryId, mapState, diplomacyState)
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
    const { mapState, aiState, diplomacyState, technologyState, personalityState } = context

    const candidates: ScoredAction[] = [
      {
        action: 'EXPAND',
        score: scoreExpand(countryId, mapState, personalityState) * personality.aggression + Math.random() * 0.1,
      },
      {
        action: 'FORTIFY',
        score: scoreFortify(countryId, mapState, personalityState) * personality.caution + Math.random() * 0.1,
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
        score: scoreResearch(countryId, technologyState, personalityState) * personality.economy + Math.random() * 0.1,
      },
      {
        action: 'SEEK_PEACE',
        score: scoreSeekPeace(countryId, mapState, diplomacyState, personality) + Math.random() * 0.1,
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
    const usedPeaceTargets = new Set<CountryId>()

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
          targetCountryId = this.findWarTarget(countryId, mapState, diplomacyState, usedWarTargets, personalityState)
          // No more unique war targets available — stop repeating this action.
          if (targetCountryId === null && r > 0) break
          if (targetCountryId !== null) usedWarTargets.add(targetCountryId)
        } else if (candidate.action === 'SEEK_PEACE') {
          targetCountryId = this.findWarEnemy(countryId, mapState, diplomacyState, usedPeaceTargets)
          if (targetCountryId === null && r > 0) break
          if (targetCountryId !== null) usedPeaceTargets.add(targetCountryId)
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
        targetCountryId = this.findWarTarget(countryId, mapState, diplomacyState, new Set(), personalityState)
      } else if (best.action === 'SEEK_PEACE') {
        targetCountryId = this.findWarEnemy(countryId, mapState, diplomacyState)
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

  /**
   * Find the best enemy to seek peace with for a SEEK_PEACE decision.
   * Prefers the enemy with the most provinces (the biggest threat) so the AI
   * tries to end its most dangerous war first.
   * Returns null when the country has no active wars.
   */
  private findWarEnemy(
    countryId: CountryId,
    mapState: MapState,
    diplomacyState: DiplomacyState,
    excluded: ReadonlySet<CountryId> = new Set(),
  ): CountryId | null {
    let best: CountryId | null = null
    let bestProvinceCount = -1

    for (const relation of Object.values(diplomacyState.relations)) {
      if (relation.status !== 'war') continue
      const enemyId = relation.countryA === countryId
        ? relation.countryB
        : relation.countryB === countryId
          ? relation.countryA
          : null
      if (enemyId === null || excluded.has(enemyId)) continue

      const count = mapState.countries[enemyId]?.provinceIds.length ?? 0
      if (count > bestProvinceCount) {
        bestProvinceCount = count
        best = enemyId
      }
    }

    return best
  }

  /** Find the most diplomatically compatible ally candidate, excluding already-chosen targets. */
  private findAllyTarget(
    countryId: CountryId,
    aiState: AIState,
    diplomacyState: DiplomacyState,
    excluded: ReadonlySet<CountryId> = new Set(),
  ): CountryId | null {
    const friendlyArchetypes = new Set(['hegemon', 'mercantile'])
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
   *
   * When a personality record is supplied, the score is additionally tilted by
   * the attacker's archetype-weighted trust toward each candidate: a low-trust
   * (hostile) neighbour becomes more attractive than a marginally weaker but
   * neutral one. With an empty ledger, behaviour reduces to weakest-first.
   *
   * Returns null when no valid target exists.
   */
  private findWarTarget(
    countryId: CountryId,
    mapState: MapState,
    diplomacyState: DiplomacyState,
    excluded: ReadonlySet<CountryId> = new Set(),
    personalityState?: PersonalityState,
  ): CountryId | null {
    const nation = getPersonality(personalityState, countryId)

    let best: CountryId | null = null
    let bestCost = Infinity

    for (const [id, country] of Object.entries(mapState.countries)) {
      if (id === countryId) continue
      if (country.provinceIds.length === 0) continue
      if (excluded.has(id as CountryId)) continue

      const key = [countryId, id].sort().join(':')
      const status = diplomacyState.relations[key]?.status ?? 'neutral'
      if (status === 'allied' || status === 'war' || status === 'truce') continue

      // Base cost: fewer provinces = cheaper target.
      let cost = country.provinceIds.length

      // Hostility discount: each point of negative trust shaves cost, so
      // low-trust neighbours are preferred over equally-sized neutrals.
      if (nation) {
        const trust = weightedTrustFor(nation, id as CountryId)
        if (trust < 0) cost += trust * 0.05  // trust is negative → cost drops
      }

      if (cost < bestCost) {
        bestCost = cost
        best = id as CountryId
      }
    }

    return best
  }

  /**
   * Evaluate whether the AI-controlled targetId should accept a truce request
   * from requesterId.
   *
   * Accept probability rises when:
   * - The responder is cautious or diplomatic (caution, diplomacy personality weights)
   * - The responder is not winning decisively (province ratio close to or below 1)
   *
   * Reject probability rises when:
   * - The responder's aggression is high (conquerors, zealots)
   * - The responder has significantly more provinces (clearly winning the war)
   *
   * Returns true = accept, false = reject.
   */
  evaluateTruceResponse(
    requesterId: CountryId,
    targetId: CountryId,
    context: AIContext,
  ): boolean {
    const responder = context.aiState.countries[targetId]
    if (responder === undefined) return false

    const { personality } = responder
    const ownProvinces = context.mapState.countries[targetId]?.provinceIds.length ?? 0
    const enemyProvinces = context.mapState.countries[requesterId]?.provinceIds.length ?? 0

    // How much larger the responder is relative to the requester:
    // > 1.5 → winning decisively → lean toward rejecting
    // < 1.0 → struggling → lean toward accepting
    const powerRatio = ownProvinces / Math.max(1, enemyProvinces)
    const winningBonus = Math.max(0, powerRatio - 1.0) * 0.4

    // Personality-driven acceptance base
    const acceptanceBase = personality.diplomacy * 0.5 + personality.caution * 0.3
    const aggressionPenalty = personality.aggression * 0.4

    const acceptScore = acceptanceBase - aggressionPenalty - winningBonus + Math.random() * 0.1
    return acceptScore > 0.25
  }
}
