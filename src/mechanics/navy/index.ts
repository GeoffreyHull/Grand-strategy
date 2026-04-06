import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId } from '@contracts/mechanics/map'
import type { JobId } from '@contracts/mechanics/construction'
import type { Fleet, FleetId } from '@contracts/mechanics/navy'
import {
  DEFAULT_NAVY_CONFIG,
  validateNavyConfig,
} from './types'

export type { Fleet, FleetId, NavyState } from '@contracts/mechanics/navy'
export type { NavyConfig } from './types'

export function buildNavyState() {
  return { fleets: {} as Record<FleetId, Fleet> }
}

export async function loadNavyConfig(
  url = `${import.meta.env.BASE_URL}config/navy.json`,
): Promise<import('./types').NavyConfig> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load navy config from ${url}: HTTP ${response.status}`)
  }
  const raw: unknown = await response.json()
  return validateNavyConfig(raw)
}

export function requestBuildFleet(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  ownerId: CountryId,
  locationId: ProvinceId,
  config = DEFAULT_NAVY_CONFIG,
): void {
  const province = stateStore.getSlice('map').provinces[locationId]

  if (!province?.isCoastal) {
    eventBus.emit('navy:fleet-rejected', {
      ownerId,
      locationId,
      reason: 'not-coastal',
    })
    return
  }

  eventBus.emit('construction:request', {
    jobId:          crypto.randomUUID() as JobId,
    ownerId,
    locationId,
    buildableType:  'fleet',
    durationFrames: config.fleet.durationFrames,
    metadata:       {},
  })
}

export function initNavyMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  config = DEFAULT_NAVY_CONFIG,
): { destroy: () => void } {
  const sub = eventBus.on('construction:complete', (payload) => {
    if (payload.buildableType !== 'fleet') return

    const fleetId = crypto.randomUUID() as FleetId
    const fleet: Fleet = {
      id:           fleetId,
      countryId:    payload.ownerId,
      provinceId:   payload.locationId,
      ships:        config.fleet.ships,
      createdFrame: payload.completedFrame,
    }

    stateStore.setState(draft => ({
      ...draft,
      navy: { fleets: { ...draft.navy.fleets, [fleetId]: fleet } },
    }))

    eventBus.emit('navy:fleet-formed', {
      fleetId,
      countryId:  payload.ownerId,
      provinceId: payload.locationId,
    })
  })

  return { destroy: () => sub.unsubscribe() }
}
