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
export type { BuildingsConfig, BuildingTypeConfig } from './types'

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

export function requestBuildBuilding(
  eventBus: EventBus<EventMap>,
  ownerId: CountryId,
  locationId: ProvinceId,
  buildingType: BuildingType,
  config = DEFAULT_BUILDINGS_CONFIG,
): void {
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
  config = DEFAULT_BUILDINGS_CONFIG,  // reserved for future per-type behavior
): { destroy: () => void } {
  void config  // consumed for API consistency; handler currently uses only metadata
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
  })

  return { destroy: () => sub.unsubscribe() }
}
