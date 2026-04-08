import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId } from '@contracts/mechanics/map'
import type { JobId } from '@contracts/mechanics/construction'
import type { Building, BuildingId, BuildingType } from '@contracts/mechanics/buildings'
import {
  DEFAULT_BUILDINGS_CONFIG,
  validateBuildingsConfig,
  isBuildingType,
} from './types'

export type { Building, BuildingId, BuildingType, BuildingsState } from '@contracts/mechanics/buildings'
export type { BuildingsConfig, BuildingTypeConfig, TerrainBuildingLimits } from './types'

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
 * Request construction of a building. Validates coastal requirement for ports
 * and terrain-based building limits before emitting a construction request.
 * Emits `buildings:build-rejected` and returns early if validation fails.
 */
export function requestBuildBuilding(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  ownerId: CountryId,
  locationId: ProvinceId,
  buildingType: BuildingType,
  config = DEFAULT_BUILDINGS_CONFIG,
): void {
  const { map, buildings } = stateStore.getState()
  const province = map.provinces[locationId]
  if (!province) return

  // Ports require a coastal province
  if (buildingType === 'port' && !province.isCoastal) {
    eventBus.emit('buildings:build-rejected', {
      countryId: ownerId, provinceId: locationId, buildingType, reason: 'not-coastal',
    })
    return
  }

  // Check terrain-based limit for this building type
  const terrainLimits = config.limits[province.terrainType]
  if (terrainLimits) {
    const limit = terrainLimits[buildingType]
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

  eventBus.emit('construction:request', {
    jobId:          crypto.randomUUID() as JobId,
    ownerId,
    locationId,
    buildableType:  'building',
    durationFrames: config.buildings[buildingType].durationFrames,
    metadata:       { buildingType },
  })
}

export function initBuildingsMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  config = DEFAULT_BUILDINGS_CONFIG,
): { destroy: () => void } {
  const sub = eventBus.on('construction:complete', (payload) => {
    if (payload.buildableType !== 'building') return

    const rawType = payload.metadata['buildingType']
    if (!isBuildingType(rawType)) return

    const buildingId = crypto.randomUUID() as BuildingId
    const building: Building = {
      id:             buildingId,
      countryId:      payload.ownerId,
      provinceId:     payload.locationId,
      buildingType:   rawType,
      completedFrame: payload.completedFrame,
    }

    stateStore.setState(draft => ({
      ...draft,
      buildings: { buildings: { ...draft.buildings.buildings, [buildingId]: building } },
    }))

    eventBus.emit('buildings:building-constructed', {
      buildingId,
      countryId:    payload.ownerId,
      provinceId:   payload.locationId,
      buildingType: rawType,
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

  return { destroy: () => sub.unsubscribe() }
}
