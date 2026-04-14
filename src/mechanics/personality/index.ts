// Public API for the personality mechanic.
// Only this file may be imported by external code (main.ts, other mechanics).

import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { TickContext } from '../../engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId } from '@contracts/mechanics/map'
import type { AIPersonalityArchetype } from '@contracts/mechanics/ai'
import type {
  InvestmentBias,
  LedgerEntry,
  NationPersonality,
  PersonalityState,
  RelationshipLedger,
} from '@contracts/mechanics/personality'
import {
  DEFAULT_PERSONALITY_CONFIG,
  type PersonalityConfig,
} from './types'
import {
  addEntry,
  decayLedger,
  rawTrust,
  weightedTrust,
} from './RelationshipLedger'
import {
  applyLedgerWrites,
  biasesForOwnClimateEvent,
  clampBias,
  onAllianceFormed,
  onAllyCalledToWar,
  onAllyForcedPeace,
  onClimateEventStarted,
  onProvinceConquered,
  onProvinceConverted,
  onWarDeclared,
  type LedgerWrite,
} from './LedgerReactor'
import { ARCHETYPE_WEIGHTS, weightedMagnitude } from './archetypes'

export type {
  LedgerCategory,
  LedgerEntry,
  RelationshipLedger,
  InvestmentBias,
  ArchetypeWeights,
  NationPersonality,
  PersonalityState,
} from '@contracts/mechanics/personality'

export type { PersonalityConfig } from './types'
export { DEFAULT_PERSONALITY_CONFIG } from './types'
export { ARCHETYPE_WEIGHTS, weightedMagnitude } from './archetypes'
export { rawTrust, weightedTrust } from './RelationshipLedger'

// ── State builder ─────────────────────────────────────────────────────────────

function emptyLedger(): RelationshipLedger {
  return { entries: {} }
}

function baselineBias(
  archetype: AIPersonalityArchetype,
  config: PersonalityConfig,
): InvestmentBias {
  return { ...config.biasBaselines[archetype] }
}

/**
 * Initialize personality state from the existing AI personality assignments.
 * Each nation inherits its AI archetype so the two systems stay in sync.
 */
export function buildPersonalityState(
  archetypeByCountry: Readonly<Record<string, AIPersonalityArchetype>> = {},
  config = DEFAULT_PERSONALITY_CONFIG,
): PersonalityState {
  const nations: Record<string, NationPersonality> = {}
  for (const [id, archetype] of Object.entries(archetypeByCountry)) {
    nations[id] = {
      countryId: id as CountryId,
      archetype,
      ledger:    emptyLedger(),
      bias:      baselineBias(archetype, config),
      weights:   ARCHETYPE_WEIGHTS[archetype],
    }
  }
  return { nations }
}

// ── Read-only queries ─────────────────────────────────────────────────────────

export function getNationPersonality(
  state: Readonly<PersonalityState>,
  countryId: CountryId,
): NationPersonality | undefined {
  return state.nations[countryId as string]
}

/**
 * The primary query for AI scoring — returns the archetype-weighted trust
 * `fromCountry` holds toward `towardCountry` (negative = hostile).
 */
export function trustScore(
  state: Readonly<PersonalityState>,
  fromCountry: CountryId,
  towardCountry: CountryId,
): number {
  const nation = state.nations[fromCountry as string]
  if (!nation) return 0
  return weightedTrust(nation, towardCountry)
}

/** Retrieve a nation's investment biases (always returns, defaulting to zeros). */
export function getBias(
  state: Readonly<PersonalityState>,
  countryId: CountryId,
): InvestmentBias {
  const n = state.nations[countryId as string]
  if (!n) return { navalInvestment: 0, religiousAggression: 0, defensiveUrge: 0, economicUrge: 0 }
  return n.bias
}

// ── Mechanic init ─────────────────────────────────────────────────────────────

export function initPersonalityMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  config = DEFAULT_PERSONALITY_CONFIG,
): { update: (ctx: TickContext) => void; destroy: () => void } {

  // ── Helpers to mutate state + emit events ───────────────────────────────────

  function commitWrites(writes: readonly LedgerWrite[]): void {
    if (writes.length === 0) return
    const personality = stateStore.getState().personality
    const result = applyLedgerWrites(personality, writes)
    if (result.applied.length === 0) return

    stateStore.setState(draft => ({ ...draft, personality: result.state }))

    for (const w of result.applied) {
      eventBus.emit('personality:ledger-entry-added', {
        countryId: w.ownerId,
        targetId:  w.targetId,
        entry:     w.entry,
      })
    }
  }

  function commitBiasDeltas(
    deltas: readonly { countryId: CountryId; field: keyof InvestmentBias; delta: number }[],
  ): void {
    if (deltas.length === 0) return

    const personality = stateStore.getState().personality
    const updatedNations: Record<string, NationPersonality> = { ...personality.nations }
    const changes: { countryId: CountryId; field: keyof InvestmentBias; newValue: number }[] = []

    for (const delta of deltas) {
      const key = delta.countryId as string
      const n = updatedNations[key]
      if (!n) continue
      const oldVal = n.bias[delta.field]
      const newVal = clampBias(oldVal + delta.delta)
      if (newVal === oldVal) continue
      updatedNations[key] = {
        ...n,
        bias: { ...n.bias, [delta.field]: newVal },
      }
      changes.push({ countryId: delta.countryId, field: delta.field, newValue: newVal })
    }

    if (changes.length === 0) return

    stateStore.setState(draft => ({
      ...draft,
      personality: { nations: updatedNations },
    }))

    for (const ch of changes) {
      eventBus.emit('personality:bias-changed', ch)
    }
  }

  // ── Event subscriptions (LedgerReactor) ─────────────────────────────────────

  const turn = (): number => stateStore.getState().diplomacy.currentTurn

  const warSub = eventBus.on('diplomacy:war-declared', ({ declarerId, targetId }) => {
    commitWrites([onWarDeclared(declarerId, targetId, turn(), config.defaultLedgerDecay)])
  })

  const allianceSub = eventBus.on('diplomacy:alliance-formed', ({ countryA, countryB }) => {
    commitWrites(onAllianceFormed(countryA, countryB, turn(), config.defaultLedgerDecay))
  })

  const allyCalledSub = eventBus.on('diplomacy:ally-called-to-war', ({ allyId, calledById }) => {
    commitWrites([onAllyCalledToWar(calledById, allyId, turn(), config.defaultLedgerDecay)])
  })

  const allyForcedSub = eventBus.on('diplomacy:ally-forced-peace', ({ allyId, peaceCountryId }) => {
    commitWrites([onAllyForcedPeace(allyId, peaceCountryId, turn(), config.defaultLedgerDecay)])
  })

  // Culture assimilation: the event payload identifies the new owner's
  // countryId but not the losing nation (culture isn't owned by a nation in
  // the current contract). When a specific losing nation can be identified
  // — e.g. after a conquest triggers conversion — the conquest branch below
  // captures it. `onProvinceConverted` remains available for future use when
  // culture owners become part of the event payload.
  // TODO: add to contracts — include the displaced owner in culture:province-converted.
  void onProvinceConverted

  const conquestSub = eventBus.on('map:province-conquered', ({ newOwnerId, oldOwnerId }) => {
    commitWrites([onProvinceConquered(oldOwnerId, newOwnerId, turn(), config.defaultLedgerDecay)])
  })

  const climateSub = eventBus.on('climate:event-started', ({ event }) => {
    const state = stateStore.getState()
    const province = state.map.provinces[event.provinceId]
    if (!province) return

    const victimId = province.countryId
    const observers = Object.keys(state.personality.nations) as CountryId[]
    const t = turn()

    commitWrites(onClimateEventStarted(event, victimId, observers, t, config.defaultLedgerDecay))

    // Self-bias updates for the afflicted nation.
    const owner = state.personality.nations[victimId as string]
    if (owner) {
      commitBiasDeltas(biasesForOwnClimateEvent(event, owner))
    }
  })

  // ── Per-turn decay tick ─────────────────────────────────────────────────────

  let lastProcessedTurn = -1

  function update(ctx: TickContext): void {
    if (ctx.turn === lastProcessedTurn) return
    const turnsElapsed = lastProcessedTurn < 0 ? 1 : ctx.turn - lastProcessedTurn
    lastProcessedTurn = ctx.turn
    if (turnsElapsed <= 0) return

    const personality = stateStore.getState().personality
    const nextNations: Record<string, NationPersonality> = {}
    const decayEvents: { countryId: CountryId; targetId: CountryId; entryId: string; newMagnitude: number }[] = []
    const biasEvents:  { countryId: CountryId; field: keyof InvestmentBias; newValue: number }[] = []
    let anyChange = false

    for (const [id, nation] of Object.entries(personality.nations)) {
      // Ledger decay.
      const { ledger: nextLedger, changed } = decayLedger(
        nation.ledger,
        turnsElapsed,
        config.ledgerCleanupThreshold,
      )

      for (const [targetKey, changes] of changed) {
        for (const c of changes) {
          decayEvents.push({
            countryId: nation.countryId,
            targetId:  targetKey as CountryId,
            entryId:   c.entryId,
            newMagnitude: c.newMagnitude,
          })
        }
      }

      // Bias drift back toward archetype baseline.
      const baseline = config.biasBaselines[nation.archetype]
      const drift = config.biasDecayPerTurn * turnsElapsed
      const nextBiasMut: { -readonly [K in keyof InvestmentBias]: number } = { ...nation.bias }
      for (const field of ['navalInvestment', 'religiousAggression', 'defensiveUrge', 'economicUrge'] as const) {
        const current = nation.bias[field]
        const target  = baseline[field]
        if (current === target) continue
        const direction = current > target ? -1 : 1
        const stepped   = current + direction * drift
        const reached   = direction > 0 ? Math.min(stepped, target) : Math.max(stepped, target)
        const next      = clampBias(reached)
        if (next !== current) {
          nextBiasMut[field] = next
          biasEvents.push({ countryId: nation.countryId, field, newValue: next })
        }
      }
      const nextBias: InvestmentBias = nextBiasMut

      nextNations[id] = {
        ...nation,
        ledger: nextLedger,
        bias:   nextBias,
      }

      if (nextLedger !== nation.ledger) anyChange = true
      for (const field of ['navalInvestment', 'religiousAggression', 'defensiveUrge', 'economicUrge'] as const) {
        if (nextBias[field] !== nation.bias[field]) { anyChange = true; break }
      }
    }

    if (!anyChange) return

    stateStore.setState(draft => ({
      ...draft,
      personality: { nations: nextNations },
    }))

    for (const ev of decayEvents) {
      eventBus.emit('personality:ledger-entry-decayed', ev)
    }
    for (const ev of biasEvents) {
      eventBus.emit('personality:bias-changed', ev)
    }
  }

  return {
    update,
    destroy: () => {
      warSub.unsubscribe()
      allianceSub.unsubscribe()
      allyCalledSub.unsubscribe()
      allyForcedSub.unsubscribe()
      conquestSub.unsubscribe()
      climateSub.unsubscribe()
    },
  }
}

// ── Low-level helpers re-exported for tests/advanced consumers ───────────────
export { addEntry, decayLedger } from './RelationshipLedger'
