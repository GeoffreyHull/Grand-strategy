import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { TickContext } from '../../engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId } from '@contracts/mechanics/map'
import type { EconomyState, CountryEconomy } from '@contracts/mechanics/economy'
import {
  DEFAULT_ECONOMY_CONFIG,
  validateEconomyConfig,
  computeCountryIncome,
} from './types'

export type { EconomyState, CountryEconomy } from '@contracts/mechanics/economy'
export type { EconomyConfig } from './types'

export function buildEconomyState(): EconomyState {
  return { countries: {} }
}

export async function loadEconomyConfig(
  url = `${import.meta.env.BASE_URL}config/economy.json`,
): Promise<import('./types').EconomyConfig> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load economy config from ${url}: HTTP ${response.status}`)
  }
  const raw: unknown = await response.json()
  return validateEconomyConfig(raw)
}

export function initEconomyMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  config = DEFAULT_ECONOMY_CONFIG,
): { update: (ctx: TickContext) => void; destroy: () => void } {

  function recomputeIncome(): void {
    const { map, buildings } = stateStore.getState()
    const countryIds = Object.keys(map.countries) as CountryId[]
    stateStore.setState(draft => {
      const countries = { ...draft.economy.countries }
      for (const countryId of countryIds) {
        const income = computeCountryIncome(countryId, map.provinces, buildings.buildings, config)
        const existing = countries[countryId]
        countries[countryId] = {
          gold:            existing?.gold ?? config.startingGold,
          incomePerCycle:  income,
        }
      }
      return { ...draft, economy: { countries } }
    })
  }

  // Initialize immediately — map state is already populated by the time this runs
  recomputeIncome()

  const buildingSub = eventBus.on('buildings:building-constructed', () => {
    recomputeIncome()
  })

  const conquestSub = eventBus.on('map:province-conquered', () => {
    recomputeIncome()
  })

  function update(ctx: TickContext): void {
    const { frame } = ctx
    // Skip frame 0 (initialization tick) and non-cycle frames
    if (frame === 0 || frame % config.cycleFrames !== 0) return

    stateStore.setState(draft => {
      const countries = { ...draft.economy.countries }
      for (const [id, eco] of Object.entries(countries)) {
        const countryId = id as CountryId
        countries[countryId] = { ...eco, gold: eco.gold + eco.incomePerCycle }
      }
      return { ...draft, economy: { countries } }
    })

    const updated = stateStore.getState().economy
    for (const [id, eco] of Object.entries(updated.countries)) {
      if (eco.incomePerCycle > 0) {
        eventBus.emit('economy:income-collected', {
          countryId: id as CountryId,
          amount:    eco.incomePerCycle,
          frame,
        })
      }
    }
  }

  return {
    update,
    destroy: () => { buildingSub.unsubscribe(); conquestSub.unsubscribe() },
  }
}
