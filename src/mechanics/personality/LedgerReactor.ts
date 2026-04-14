// Pure helpers for translating external events into ledger mutations and
// bias drifts. These are called by index.ts which owns the subscriptions
// and state commits; keeping the logic pure makes it unit-testable.

import type { CountryId } from '@contracts/mechanics/map'
import type {
  NationPersonality,
  LedgerEntry,
  InvestmentBias,
  PersonalityState,
} from '@contracts/mechanics/personality'
import type {
  ActiveClimateEvent,
  ClimateEventType,
} from '@contracts/mechanics/climate'
import { addEntry } from './RelationshipLedger'

// ── Ledger writes ─────────────────────────────────────────────────────────────

export interface LedgerWrite {
  readonly ownerId: CountryId
  readonly targetId: CountryId
  readonly entry: LedgerEntry
}

function makeEntry(
  id: string,
  category: LedgerEntry['category'],
  magnitude: number,
  decayPerTurn: number,
  createdOnTurn: number,
  source: string,
): LedgerEntry {
  return { id, category, magnitude, decayPerTurn, createdOnTurn, source }
}

/** War-declaration writes hostility from target toward declarer. */
export function onWarDeclared(
  declarerId: CountryId,
  targetId: CountryId,
  turn: number,
  defaultDecay: number,
): LedgerWrite {
  return {
    ownerId:  targetId,
    targetId: declarerId,
    entry:    makeEntry(`war-decl:${turn}`, 'aggression', -40, defaultDecay, turn, 'unprovoked attack'),
  }
}

/** Alliance formation writes positive trust on both sides. */
export function onAllianceFormed(
  a: CountryId,
  b: CountryId,
  turn: number,
  defaultDecay: number,
): readonly LedgerWrite[] {
  return [
    {
      ownerId:  a,
      targetId: b,
      entry:    makeEntry(`ally:${turn}`, 'alliance', 30, defaultDecay * 0.5, turn, 'alliance formed'),
    },
    {
      ownerId:  b,
      targetId: a,
      entry:    makeEntry(`ally:${turn}`, 'alliance', 30, defaultDecay * 0.5, turn, 'alliance formed'),
    },
  ]
}

/** Ally honoured a call-to-arms → caller's trust in them rises. */
export function onAllyCalledToWar(
  calledById: CountryId,
  allyId: CountryId,
  turn: number,
  defaultDecay: number,
): LedgerWrite {
  return {
    ownerId:  calledById,
    targetId: allyId,
    entry:    makeEntry(`ally-honored:${turn}`, 'alliance', 20, defaultDecay * 0.5, turn, 'ally joined war'),
  }
}

/** Ally was forced into peace by a third party → betrayed feeling. */
export function onAllyForcedPeace(
  allyId: CountryId,
  peaceCountryId: CountryId,
  turn: number,
  defaultDecay: number,
): LedgerWrite {
  return {
    ownerId:  allyId,
    targetId: peaceCountryId,
    entry:    makeEntry(`ally-abandoned:${turn}`, 'alliance', -25, defaultDecay, turn, 'ally forced peace'),
  }
}

/** Province converted to a different culture → the losing owner harbours religious grievance. */
export function onProvinceConverted(
  losingOwnerId: CountryId,
  beneficiaryId: CountryId,
  turn: number,
  defaultDecay: number,
): LedgerWrite {
  return {
    ownerId:  losingOwnerId,
    targetId: beneficiaryId,
    entry:    makeEntry(`convert:${turn}`, 'religious', -25, defaultDecay, turn, 'province converted'),
  }
}

/** Conqueror took a province → the old owner registers aggression. */
export function onProvinceConquered(
  oldOwnerId: CountryId,
  newOwnerId: CountryId,
  turn: number,
  defaultDecay: number,
): LedgerWrite {
  return {
    ownerId:  oldOwnerId,
    targetId: newOwnerId,
    entry:    makeEntry(`conquest:${turn}`, 'aggression', -30, defaultDecay, turn, 'province conquered'),
  }
}

/**
 * Climate event in a province owned by `victimId`: every OTHER nation writes
 * an opportunism / rising-power entry toward the victim.
 *
 * Returns an array of LedgerWrites — one per observer nation.
 *
 * The magnitude is computed from effect severity so bigger events create
 * stronger signals. The per-archetype interpretation happens later at query
 * time via `ARCHETYPE_WEIGHTS.ledgerCategoryMultipliers`.
 */
export function onClimateEventStarted(
  event: ActiveClimateEvent,
  victimId: CountryId,
  observers: readonly CountryId[],
  turn: number,
  defaultDecay: number,
): readonly LedgerWrite[] {
  const category = categoryForClimateEvent(event.eventType)
  if (category === null) return []

  const magnitude = magnitudeForClimateEvent(event, category)
  if (magnitude === 0) return []

  return observers
    .filter(obs => obs !== victimId)
    .map<LedgerWrite>(obs => ({
      ownerId:  obs,
      targetId: victimId,
      entry:    makeEntry(
        `climate:${event.id}`,
        category,
        magnitude,
        defaultDecay * 0.75,
        turn,
        `observed ${event.eventType} in neighbour`,
      ),
    }))
}

function categoryForClimateEvent(type: ClimateEventType): LedgerEntry['category'] | null {
  switch (type) {
    case 'drought':
    case 'harsh-winter':
    case 'storm-season':
    case 'epidemic':
      return 'opportunism'
    case 'bumper-harvest':
      return 'rising-power'
    case 'mild-season':
      return null
  }
}

function magnitudeForClimateEvent(
  event: ActiveClimateEvent,
  _category: LedgerEntry['category'],
): number {
  // Both opportunism (target weakened, observer sees prey) and rising-power
  // (target strengthened, observer sees threat) are hostility-coded — they
  // lower trust toward the afflicted/strengthened nation. Archetype
  // multipliers decide whose hostility is louder (Zealot on opportunism,
  // Hegemon on rising-power).
  const eff = event.effects
  let severity = 0

  if (eff.incomePct !== undefined)            severity += Math.abs(eff.incomePct) * 40
  if (eff.portIncomePct !== undefined)        severity += Math.abs(eff.portIncomePct) * 20
  if (eff.attritionPct !== undefined)         severity += Math.abs(eff.attritionPct) * 30
  if (eff.pausesPopulationGrowth)             severity += 15
  if (eff.unrestAdd !== undefined)            severity += eff.unrestAdd * 0.5
  if (eff.blocksFleetMovement)                severity += 5

  if (severity === 0) return 0
  return -Math.min(40, severity)
}

// ── Bias drifts ───────────────────────────────────────────────────────────────

/** A change to apply to one nation's InvestmentBias. */
export interface BiasDelta {
  readonly countryId: CountryId
  readonly field: keyof InvestmentBias
  readonly delta: number
}

/**
 * When a Mercantile's own province suffers a storm, naval investment urge
 * rises. When a Zealot's own coastal province is storm-struck, religious
 * aggression is redirected inland.
 *
 * Returns the set of bias changes to apply; empty array if no self-bias
 * logic applies to this event/archetype combo.
 */
export function biasesForOwnClimateEvent(
  event: ActiveClimateEvent,
  ownerPersonality: NationPersonality,
): readonly BiasDelta[] {
  const out: BiasDelta[] = []
  const { archetype, countryId } = ownerPersonality

  if (event.eventType === 'storm-season') {
    if (archetype === 'mercantile') {
      out.push({ countryId, field: 'navalInvestment', delta: 0.15 })
    }
    if (archetype === 'zealot') {
      out.push({ countryId, field: 'religiousAggression', delta: 0.12 })
    }
    if (archetype === 'hegemon') {
      out.push({ countryId, field: 'navalInvestment', delta: 0.08 })
    }
  }

  if (event.eventType === 'harsh-winter' || event.eventType === 'drought') {
    if (archetype === 'isolationist') {
      out.push({ countryId, field: 'defensiveUrge', delta: 0.1 })
    }
  }

  if (event.eventType === 'bumper-harvest') {
    if (archetype === 'mercantile') {
      out.push({ countryId, field: 'economicUrge', delta: 0.1 })
    }
  }

  return out
}

// ── Batch application ────────────────────────────────────────────────────────

/**
 * Apply a batch of ledger writes to a PersonalityState. Skips writes whose
 * owner isn't tracked (e.g. the player country was never registered).
 * Returns both the next state and the writes that were actually applied so
 * the mechanic layer knows what events to emit.
 */
export function applyLedgerWrites(
  state: PersonalityState,
  writes: readonly LedgerWrite[],
): { readonly state: PersonalityState; readonly applied: readonly LedgerWrite[] } {
  if (writes.length === 0) return { state, applied: [] }

  const nextNations: Record<string, NationPersonality> = { ...state.nations }
  const applied: LedgerWrite[] = []

  for (const write of writes) {
    const key = write.ownerId as string
    const nation = nextNations[key]
    if (!nation) continue

    nextNations[key] = {
      ...nation,
      ledger: addEntry(nation.ledger, write.targetId, write.entry),
    }
    applied.push(write)
  }

  return { state: { nations: nextNations }, applied }
}

/** Clamp a bias value into [0, 1]. */
export function clampBias(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}
