import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId, TerritoryId } from '@contracts/mechanics/map'
import type { JobId } from '@contracts/mechanics/construction'
import type { Building, BuildingId, BuildingType } from '@contracts/mechanics/buildings'
import {
  DEFAULT_BUILDINGS_CONFIG,
  validateBuildingsConfig,
  isBuildingType,
  getBuildingScope,
} from './types'

export type { Building, BuildingId, BuildingType, BuildingScope, BuildingsState } from '@contracts/mechanics/buildings'
export type { TerritoryId } from '@contracts/mechanics/map'
export type { BuildingsConfig, BuildingTypeConfig, TerrainBuildingLimits } from './types'
export { DEFAULT_BUILDINGS_CONFIG, getBuildingScope } from './types'

export function buildBuildingsState() {
  return { buildings: {} as Record<BuildingId, Building> }
}

export async function loadBuildingsConfig(
  url = `${import.meta.env.BASE_URL}config/buildings.json`,
): Promise<import('./types').BuildingsConfig> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load buildings config from ${url}: HTTP ${response.status}`)
  }
  const raw: unknown = await response.json()
  return validateBuildingsConfig(raw)
}

/**
 * Request construction of a building.
 *
 * - Territory-scoped buildings (farm): pass `territoryId` for the target hex.
 *   Rejected with `territory-occupied` if that hex already has a farm.
 * - Province-scoped buildings (barracks, port, walls): no `territoryId` needed.
 *   Validated against terrain-based limits; ports also require a coastal province.
 *
 * On any failure emits `buildings:build-rejected` and returns early.
 */
export function requestBuildBuilding(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  ownerId: CountryId,
  locationId: ProvinceId,
  buildingType: BuildingType,
  config = DEFAULT_BUILDINGS_CONFIG,
  territoryId?: TerritoryId,
): void {
  const { map, buildings } = stateStore.getState()
  const province = map.provinces[locationId]
  if (!province) return

  const scope = getBuildingScope(buildingType)

  // Ports require a coastal province
  if (buildingType === 'port' && !province.isCoastal) {
    eventBus.emit('buildings:build-rejected', {
      countryId: ownerId, provinceId: locationId, buildingType, reason: 'not-coastal',
    })
    return
  }

  if (scope === 'territory') {
    // Territory-scoped: one building of this type per territory (hex cell)
    if (!territoryId) return
    const occupied = Object.values(buildings.buildings).some(
      b => b.territoryId === territoryId && b.buildingType === buildingType,
    )
    if (occupied) {
      eventBus.emit('buildings:build-rejected', {
        countryId: ownerId, provinceId: locationId, territoryId, buildingType,
        reason: 'territory-occupied',
      })
      return
    }
  } else {
    // Province-scoped: check terrain-based limit
    const terrainLimits = config.limits[province.terrainType]
    if (terrainLimits) {
      const limit = (terrainLimits as unknown as Record<string, number>)[buildingType]
      if (limit !== undefined) {
        const existing = Object.values(buildings.buildings).filter(
          b => b.provinceId === locationId && b.buildingType === buildingType,
        ).length
        if (existing >= limit) {
          eventBus.emit('buildings:build-rejected', {
            countryId: ownerId, provinceId: locationId, buildingType, reason: 'terrain-limit-reached',
          })
          return
        }
      }
    }
  }

  // Check country has enough gold to pay the upfront cost
  const goldCost = config.buildings[buildingType].goldCost
  const countryEconomy = stateStore.getState().economy?.countries[ownerId]
  if (goldCost > 0 && (!countryEconomy || countryEconomy.gold < goldCost)) {
    eventBus.emit('buildings:build-rejected', {
      countryId: ownerId, provinceId: locationId,
      ...(scope === 'territory' && territoryId ? { territoryId } : {}),
      buildingType, reason: 'insufficient-gold',
    })
    return
  }

  // Deduct gold before enqueuing construction
  if (goldCost > 0) {
    eventBus.emit('economy:gold-deducted', {
      countryId: ownerId, amount: goldCost, reason: `building:${buildingType}`,
    })
  }

  eventBus.emit('construction:request', {
    jobId:          crypto.randomUUID() as JobId,
    ownerId,
    locationId,
    buildableType:  'building',
    durationTurns: config.buildings[buildingType].durationTurns,
    metadata:       scope === 'territory' && territoryId
      ? { buildingType, territoryId }
      : { buildingType },
  })
}

export function initBuildingsMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  config = DEFAULT_BUILDINGS_CONFIG,
): { destroy: () => void } {
  const constructionSub = eventBus.on('construction:complete', (payload) => {
    if (payload.buildableType !== 'building') return

    const rawType = payload.metadata['buildingType']
    if (!isBuildingType(rawType)) return

    const scope = getBuildingScope(rawType)
    const rawTerritoryId = payload.metadata['territoryId']
    const territoryId: TerritoryId | undefined =
      scope === 'territory' && typeof rawTerritoryId === 'string'
        ? rawTerritoryId as TerritoryId
        : undefined

    const buildingId = crypto.randomUUID() as BuildingId
    const building: Building = {
      id:             buildingId,
      countryId:      payload.ownerId,
      provinceId:     payload.locationId,
      ...(territoryId !== undefined ? { territoryId } : {}),
      buildingType:   rawType,
      completedTurn: payload.completedTurn,
      scope,
    }

    stateStore.setState(draft => ({
      ...draft,
      buildings: { buildings: { ...draft.buildings.buildings, [buildingId]: building } },
    }))

    eventBus.emit('buildings:building-constructed', {
      buildingId,
      countryId:    payload.ownerId,
      provinceId:   payload.locationId,
      ...(territoryId !== undefined ? { territoryId } : {}),
      buildingType: rawType,
      scope,
    })

    // Emit income modifier so the economy mechanic can update province income.
    // Only emitted for buildings that actually contribute income.
    const incomeBonus = config.buildings[rawType].incomeBonus
    if (incomeBonus > 0) {
      eventBus.emit('economy:province-modifier-added', {
        provinceId: payload.locationId,
        modifier: {
          id:           buildingId,
          op:           'add',
          value:        incomeBonus,
          label:        rawType,
          buildingType: rawType,
        },
      })
    }
  })

  // Walls in a conquered province are destroyed — they represent fortifications
  // that the attacker tears down to prevent future resistance.
  const conquestSub = eventBus.on('map:province-conquered', (payload) => {
    const walls = Object.values(stateStore.getState().buildings.buildings).filter(
      b => b.provinceId === payload.provinceId && b.buildingType === 'walls',
    )

    if (walls.length === 0) return

    stateStore.setState(draft => {
      const remaining = { ...draft.buildings.buildings }
      for (const w of walls) delete remaining[w.id]
      return { ...draft, buildings: { buildings: remaining } }
    })

    for (const w of walls) {
      eventBus.emit('buildings:building-destroyed', {
        buildingId:   w.id,
        countryId:    w.countryId,
        provinceId:   w.provinceId,
        buildingType: w.buildingType,
        scope:        w.scope,
      })
    }
  })

  return {
    destroy: () => {
      constructionSub.unsubscribe()
      conquestSub.unsubscribe()
    },
  }
}
