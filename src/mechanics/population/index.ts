import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { TickContext } from '../../engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { ProvinceId, CountryId } from '@contracts/mechanics/map'
import type { ProvincePopulation, PopulationState } from '@contracts/mechanics/population'
import {
  DEFAULT_POPULATION_CONFIG,
  validatePopulationConfig,
} from './types'

export type { ProvincePopulation, PopulationState } from '@contracts/mechanics/population'
export type { PopulationConfig } from './types'
export { DEFAULT_POPULATION_CONFIG } from './types'

export function buildPopulationState(): PopulationState {
  return { provinces: {} }
}

export async function loadPopulationConfig(
  url = `${import.meta.env.BASE_URL}config/population.json`,
): Promise<import('./types').PopulationConfig> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load population config from ${url}: HTTP ${response.status}`)
  }
  const raw: unknown = await response.json()
  return validatePopulationConfig(raw)
}

export function initPopulationMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  config = DEFAULT_POPULATION_CONFIG,
): { update: (ctx: TickContext) => void; destroy: () => void } {

  // ── Initialise from current map state ────────────────────────────────────────
  // Map is fully populated before this runs (initMapMechanic runs first).

  const { map } = stateStore.getState()
  const initialProvinces: Record<ProvinceId, ProvincePopulation> = {}

  for (const province of Object.values(map.provinces)) {
    if (province.terrainType === 'ocean') continue
    const count    = config.initialPopulationByTerrain[province.terrainType] ?? 0
    const capacity = config.capacityByTerrain[province.terrainType] ?? 0
    const tier     = Math.floor(count / 1000)
    initialProvinces[province.id] = {
      provinceId:         province.id,
      countryId:          province.countryId,
      count,
      capacity,
      growthAccumulator:  0,
      incomeTier:         tier,
    }
  }

  stateStore.setState(draft => ({
    ...draft,
    population: { provinces: initialProvinces },
  }))

  // Emit initial income modifiers for provinces with non-zero tier
  for (const pop of Object.values(initialProvinces)) {
    if (pop.incomeTier > 0) {
      eventBus.emit('economy:province-modifier-added', {
        provinceId: pop.provinceId,
        modifier: {
          id:    `population:${pop.provinceId}`,
          op:    'add',
          value: pop.incomeTier * config.incomePerThousand,
          label: `Population (${pop.count.toLocaleString()})`,
        },
      })
    }
  }

  // ── Event subscriptions ──────────────────────────────────────────────────────

  // Farm construction increases province capacity
  const buildingConstructedSub = eventBus.on('buildings:building-constructed', (payload) => {
    if (payload.buildingType !== 'farm') return
    const pop = stateStore.getState().population.provinces[payload.provinceId]
    if (!pop) return

    stateStore.setState(draft => ({
      ...draft,
      population: {
        provinces: {
          ...draft.population.provinces,
          [payload.provinceId]: { ...pop, capacity: pop.capacity + config.farmCapacityBonus },
        },
      },
    }))
  })

  // On conquest, transfer population to the new owner
  const conquestSub = eventBus.on('map:province-conquered', (payload) => {
    const pop = stateStore.getState().population.provinces[payload.provinceId]
    if (!pop) return

    stateStore.setState(draft => ({
      ...draft,
      population: {
        provinces: {
          ...draft.population.provinces,
          [payload.provinceId]: { ...pop, countryId: payload.newOwnerId },
        },
      },
    }))

    eventBus.emit('population:province-transferred', {
      provinceId:   payload.provinceId,
      newCountryId: payload.newOwnerId,
      oldCountryId: payload.oldOwnerId,
    })
  })

  // ── Update tick (once per turn) ───────────────────────────────────────────────

  let lastProcessedTurn = -1

  function update(ctx: TickContext): void {
    if (ctx.turn === lastProcessedTurn) return
    lastProcessedTurn = ctx.turn

    const { population, diplomacy } = stateStore.getState()

    // Build set of countries currently at war for O(1) lookup
    const countriesAtWar = new Set<CountryId>()
    for (const relation of Object.values(diplomacy.relations)) {
      if (relation.status === 'war') {
        countriesAtWar.add(relation.countryA)
        countriesAtWar.add(relation.countryB)
      }
    }

    // Compute growth for all provinces, collecting pending changes
    type Change = {
      provinceId:  ProvinceId
      newPop:      ProvincePopulation
      actualGrowth: number
      tierChanged:  boolean
      oldTier:      number
      newTier:      number
    }
    const changes: Change[] = []

    for (const pop of Object.values(population.provinces)) {
      if (pop.capacity === 0) continue

      const isAtWar = countriesAtWar.has(pop.countryId)
      const headroom = Math.max(0, 1 - pop.count / pop.capacity)
      let growthRate = config.baseGrowthRatePerTurn * headroom
      if (isAtWar) growthRate *= config.warGrowthPenalty

      const rawGrowth      = pop.count * growthRate
      const newAccumulator = pop.growthAccumulator + rawGrowth
      const growthUnits    = Math.floor(newAccumulator)
      const newCount       = Math.min(pop.count + growthUnits, pop.capacity)
      const actualGrowth   = newCount - pop.count
      const newTier        = Math.floor(newCount / 1000)

      changes.push({
        provinceId:   pop.provinceId,
        newPop: {
          ...pop,
          count:             newCount,
          growthAccumulator: newAccumulator - growthUnits,
          incomeTier:        newTier,
        },
        actualGrowth,
        tierChanged: newTier !== pop.incomeTier,
        oldTier:     pop.incomeTier,
        newTier,
      })
    }

    if (changes.length === 0) return

    // Apply all state changes atomically
    stateStore.setState(draft => {
      const provinces = { ...draft.population.provinces }
      for (const { provinceId, newPop } of changes) {
        provinces[provinceId] = newPop
      }
      return { ...draft, population: { provinces } }
    })

    // Emit events after state is settled
    for (const { provinceId, newPop, actualGrowth, tierChanged, oldTier, newTier } of changes) {
      if (actualGrowth > 0) {
        eventBus.emit('population:grown', {
          provinceId,
          countryId: newPop.countryId,
          amount:    actualGrowth,
          newCount:  newPop.count,
        })
      }

      if (tierChanged) {
        if (oldTier > 0) {
          eventBus.emit('economy:province-modifier-removed', {
            provinceId,
            modifierId: `population:${provinceId}`,
          })
        }
        if (newTier > 0) {
          eventBus.emit('economy:province-modifier-added', {
            provinceId,
            modifier: {
              id:    `population:${provinceId}`,
              op:    'add',
              value: newTier * config.incomePerThousand,
              label: `Population (${newPop.count.toLocaleString()})`,
            },
          })
        }
      }
    }
  }

  return {
    update,
    destroy: () => {
      buildingConstructedSub.unsubscribe()
      conquestSub.unsubscribe()
    },
  }
}
