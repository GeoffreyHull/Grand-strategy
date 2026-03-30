import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId } from '@contracts/mechanics/map'
import type { JobId } from '@contracts/mechanics/construction'
import type { Building, BuildingId, BuildingType } from '@contracts/mechanics/buildings'
import { BUILDING_DURATIONS, isBuildingType } from './types'

export type { Building, BuildingId, BuildingType, BuildingsState } from '@contracts/mechanics/buildings'

export function buildBuildingsState() {
  return { buildings: {} as Record<BuildingId, Building> }
}

export function requestBuildBuilding(
  eventBus: EventBus<EventMap>,
  ownerId: CountryId,
  locationId: ProvinceId,
  buildingType: BuildingType,
): void {
  eventBus.emit('construction:request', {
    jobId:          crypto.randomUUID() as JobId,
    ownerId,
    locationId,
    buildableType:  'building',
    durationFrames: BUILDING_DURATIONS[buildingType],
    metadata:       { buildingType },
  })
}

export function initBuildingsMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
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
  })

  return { destroy: () => sub.unsubscribe() }
}
