// Pure core logic for rolling and expiring climate events.
// No EventBus, no StateStore, no browser globals — used by index.ts which wires
// it into the engine. Kept pure so tests can drive it with deterministic RNG.

import type { Province } from '@contracts/mechanics/map'
import type {
  ActiveClimateEvent,
  ClimateState,
  ClimateTag,
} from '@contracts/mechanics/climate'
import type { ClimateConfig, ClimateEventDefinition } from './types'
import { deriveClimateTag } from './climateTags'

/** Injectable RNG — defaults to Math.random; tests pass a seeded fn. */
export type Rng = () => number

/** Result of a single roll pass — new events started and events expired this turn. */
export interface RollResult {
  readonly started: readonly ActiveClimateEvent[]
  readonly expired: readonly ActiveClimateEvent[]
  readonly nextState: ClimateState
}

/**
 * Pick a climate event definition for a given tag using weighted random selection.
 * Returns null if no definition is eligible (shouldn't happen in practice — the
 * default catalog always has events available for every tag).
 */
function pickEventForTag(
  tag: ClimateTag,
  config: ClimateConfig,
  rng: Rng,
): ClimateEventDefinition | null {
  const eligible = config.events.filter(e => e.allowedTags.includes(tag))
  if (eligible.length === 0) return null

  const totalWeight = eligible.reduce((acc, e) => acc + e.weight, 0)
  if (totalWeight <= 0) return null

  let roll = rng() * totalWeight
  for (const event of eligible) {
    roll -= event.weight
    if (roll <= 0) return event
  }
  return eligible[eligible.length - 1] ?? null
}

/**
 * Roll climate events for every non-ocean province whose active-event count is
 * below the allowed limit (we keep it to at most one active event per province
 * for simplicity and tooltip legibility).
 *
 * This function is pure: it does not mutate inputs. Callers apply the result
 * via StateStore.setState and emit the returned started/expired events.
 */
export function rollClimate(
  currentTurn: number,
  provinces: Readonly<Record<string, Province>>,
  previous: ClimateState,
  config: ClimateConfig,
  rng: Rng = Math.random,
): RollResult {
  // 1. Expire events whose duration has elapsed.
  const expired: ActiveClimateEvent[] = []
  const stillActive: Record<string, ActiveClimateEvent> = {}
  for (const evt of Object.values(previous.active)) {
    if (evt.expiresOnTurn <= currentTurn) {
      expired.push(evt)
    } else {
      stillActive[evt.id] = evt
    }
  }

  // 2. Determine which provinces currently have an active event (after expiries).
  const occupied = new Set<string>()
  for (const evt of Object.values(stillActive)) {
    occupied.add(evt.provinceId as string)
  }

  // 3. Only roll on scheduled turns.
  const shouldRoll =
    currentTurn >= previous.lastRollTurn + config.rollIntervalTurns

  const started: ActiveClimateEvent[] = []
  let nextSeq = previous.nextEventSeq

  if (shouldRoll) {
    for (const province of Object.values(provinces)) {
      const tag = deriveClimateTag(province)
      if (tag === null) continue
      if (occupied.has(province.id as string)) continue

      if (rng() > config.eventChancePerProvince) continue

      const def = pickEventForTag(tag, config, rng)
      if (def === null) continue

      const event: ActiveClimateEvent = {
        id:            `climate-${nextSeq}`,
        provinceId:    province.id,
        eventType:     def.eventType,
        climateTag:    tag,
        startedOnTurn: currentTurn,
        expiresOnTurn: currentTurn + def.durationTurns,
        effects:       def.effects,
      }
      nextSeq++
      stillActive[event.id] = event
      started.push(event)
      occupied.add(province.id as string)
    }
  }

  // 4. Rebuild byProvince index from the fresh active set.
  const byProvince: Record<string, string[]> = {}
  for (const evt of Object.values(stillActive)) {
    const key = evt.provinceId as string
    const arr = byProvince[key] ?? []
    arr.push(evt.id)
    byProvince[key] = arr
  }

  const nextState: ClimateState = {
    active:       stillActive,
    byProvince:   byProvince as ClimateState['byProvince'],
    lastRollTurn: shouldRoll ? currentTurn : previous.lastRollTurn,
    nextEventSeq: nextSeq,
  }

  return { started, expired, nextState }
}
