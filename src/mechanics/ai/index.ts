// Public API for the AI mechanic.
// Only this file may be imported by external code (main.ts, other mechanics).

import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { TickContext } from '../../engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { AIState, AICountryState } from '@contracts/mechanics/ai'
import type { CountryId } from '@contracts/mechanics/map'
import { DEFAULT_PERSONALITIES } from './personalities'
import { AIController } from './AIController'

// Re-export public contract types
export type {
  AIState,
  AICountryState,
  AIPersonality,
  AIDecision,
  AIActionType,
  AIPersonalityArchetype,
} from '@contracts/mechanics/ai'

// ── State builder ─────────────────────────────────────────────────────────────

/**
 * Build the initial AIState for all 20 nations.
 * By default every nation is AI-controlled; pass a CountryId to make it the
 * player's nation.
 */
export function buildAIState(playerCountryId?: CountryId): AIState {
  const countries: Record<string, AICountryState> = {}

  for (const [id, personality] of Object.entries(DEFAULT_PERSONALITIES)) {
    countries[id] = {
      countryId: id as CountryId,
      isPlayerControlled: id === playerCountryId,
      personality,
      lastDecision: null,
      lastDecisionFrame: 0,
    }
  }

  return {
    countries,
    playerCountryId: playerCountryId ?? null,
    decisionIntervalFrames: 60, // ~3 s at 20 Hz
  }
}

// ── Mechanic init ─────────────────────────────────────────────────────────────

/**
 * Initialise the AI mechanic. Called once from main.ts after the state store
 * is built.
 *
 * Returns:
 *   `update`  — register with `gameLoop.addUpdateSystem(aiMechanic.update)`
 *   `destroy` — clean up subscriptions
 */
export function initAIMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
): { update: (ctx: TickContext) => void; destroy: () => void } {
  const controller = new AIController(eventBus)

  // Allow runtime player-country reassignment
  const sub = eventBus.on('ai:player-country-set', ({ countryId }) => {
    stateStore.setState(draft => ({
      ...draft,
      ai: {
        ...draft.ai,
        playerCountryId: countryId,
        countries: Object.fromEntries(
          Object.entries(draft.ai.countries).map(([id, state]) => [
            id,
            { ...state, isPlayerControlled: id === countryId },
          ]),
        ),
      },
    }))
  })

  function update(ctx: TickContext): void {
    const { frame } = ctx
    const { map, ai } = stateStore.getState()

    const changed = controller.update(frame, map, ai)
    if (changed.length === 0) return

    stateStore.setState(draft => {
      const nextCountries = { ...draft.ai.countries }
      for (const updated of changed) {
        nextCountries[updated.countryId as string] = updated
      }
      return { ...draft, ai: { ...draft.ai, countries: nextCountries } }
    })
  }

  return {
    update,
    destroy: () => sub.unsubscribe(),
  }
}
