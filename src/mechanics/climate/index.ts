// Public API for the climate mechanic.
// Only this file may be imported by external code (main.ts, other mechanics).

import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { TickContext } from '../../engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type {
  ActiveClimateEvent,
  ClimateState,
} from '@contracts/mechanics/climate'
import type { ProvinceId } from '@contracts/mechanics/map'
import type { IncomeModifier } from '@contracts/mechanics/economy'
import {
  DEFAULT_CLIMATE_CONFIG,
  validateClimateConfig,
} from './types'
import { rollClimate, type Rng } from './ClimateEngine'

export type {
  ClimateTag,
  ClimateEventType,
  ClimateEffects,
  ActiveClimateEvent,
  ClimateState,
} from '@contracts/mechanics/climate'
export type { ClimateConfig, ClimateEventDefinition } from './types'
export { DEFAULT_CLIMATE_CONFIG } from './types'
export { deriveClimateTag } from './climateTags'
export { rollClimate } from './ClimateEngine'

// ── State builder ─────────────────────────────────────────────────────────────

export function buildClimateState(): ClimateState {
  return {
    active:       {},
    byProvince:   {},
    lastRollTurn: -Infinity,
    nextEventSeq: 1,
  }
}

// ── Config loader ─────────────────────────────────────────────────────────────

export async function loadClimateConfig(
  url = `${import.meta.env.BASE_URL}config/climate.json`,
): Promise<import('./types').ClimateConfig> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load climate config from ${url}: HTTP ${response.status}`)
  }
  const raw: unknown = await response.json()
  return validateClimateConfig(raw)
}

// ── Modifier translation ──────────────────────────────────────────────────────

/**
 * Translate a climate event's economy-facing effects into `IncomeModifier`s.
 * Returns an array because a single event may touch both base income and
 * port income (a coastal storm could do both).
 */
function incomeModifiersFor(event: ActiveClimateEvent): readonly IncomeModifier[] {
  const out: IncomeModifier[] = []
  const baseId = `climate:${event.id}`

  if (event.effects.incomePct !== undefined && event.effects.incomePct !== 0) {
    out.push({
      id:    `${baseId}:income`,
      op:    'multiply',
      value: 1 + event.effects.incomePct,
      label: `Climate: ${event.eventType}`,
    })
  }
  if (event.effects.portIncomePct !== undefined && event.effects.portIncomePct !== 0) {
    out.push({
      id:        `${baseId}:port`,
      op:        'multiply',
      value:     1 + event.effects.portIncomePct,
      label:     `Climate: ${event.eventType} (port)`,
      condition: { type: 'hasBuilding', buildingType: 'port' },
    })
  }
  return out
}

// ── Mechanic init ─────────────────────────────────────────────────────────────

/**
 * Initialise the climate mechanic. Called once from main.ts.
 *
 * Returns:
 *   `update`  — register with `gameLoop.addUpdateSystem(climateMechanic.update)`
 *   `destroy` — clean up subscriptions
 */
export function initClimateMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  config = DEFAULT_CLIMATE_CONFIG,
  rng: Rng = Math.random,
): { update: (ctx: TickContext) => void; destroy: () => void } {

  let lastProcessedTurn = -1

  // On conquest: re-emit any active income modifier under the new owner so
  // the economy mechanic picks up the change. Climate itself doesn't care
  // about ownership, but economy modifiers are resolved per-province.
  const conquestSub = eventBus.on('map:province-conquered', ({ provinceId }) => {
    const climate = stateStore.getState().climate
    const eventIds = climate.byProvince[provinceId] ?? []
    for (const id of eventIds) {
      const evt = climate.active[id]
      if (!evt) continue
      for (const mod of incomeModifiersFor(evt)) {
        // The economy mechanic keyed-replaces by modifier id, so removing
        // then re-adding lets it re-resolve ownership cleanly.
        eventBus.emit('economy:province-modifier-removed', { provinceId, modifierId: mod.id })
        eventBus.emit('economy:province-modifier-added',   { provinceId, modifier: mod })
      }
    }
  })

  function update(ctx: TickContext): void {
    if (ctx.turn === lastProcessedTurn) return
    lastProcessedTurn = ctx.turn

    const { map, climate } = stateStore.getState()
    const result = rollClimate(ctx.turn, map.provinces, climate, config, rng)

    if (result.started.length === 0 && result.expired.length === 0 && result.nextState === climate) {
      return
    }

    // Commit the new climate slice atomically.
    stateStore.setState(draft => ({
      ...draft,
      climate: result.nextState,
    }))

    // Emit expiry events first so downstream mechanics settle old state before new.
    for (const evt of result.expired) {
      eventBus.emit('climate:event-expired', {
        eventId:    evt.id,
        provinceId: evt.provinceId,
        eventType:  evt.eventType,
      })
      for (const mod of incomeModifiersFor(evt)) {
        eventBus.emit('economy:province-modifier-removed', {
          provinceId: evt.provinceId,
          modifierId: mod.id,
        })
      }
    }

    // Emit started events and register their income modifiers.
    for (const evt of result.started) {
      eventBus.emit('climate:event-started', { event: evt })
      for (const mod of incomeModifiersFor(evt)) {
        eventBus.emit('economy:province-modifier-added', {
          provinceId: evt.provinceId,
          modifier:   mod,
        })
      }
    }
  }

  return {
    update,
    destroy: () => conquestSub.unsubscribe(),
  }
}

// ── Read-only queries (used by other mechanics via events / subscriptions) ────

export function getActiveClimateEvents(
  state: Readonly<ClimateState>,
  provinceId: ProvinceId,
): readonly ActiveClimateEvent[] {
  const ids = state.byProvince[provinceId] ?? []
  const out: ActiveClimateEvent[] = []
  for (const id of ids) {
    const evt = state.active[id]
    if (evt) out.push(evt)
  }
  return out
}
