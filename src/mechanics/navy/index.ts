import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId } from '@contracts/mechanics/map'
import type { JobId } from '@contracts/mechanics/construction'
import type { Fleet, FleetId } from '@contracts/mechanics/navy'

export type { Fleet, FleetId, NavyState } from '@contracts/mechanics/navy'

const FLEET_DURATION_FRAMES = 120

export function buildNavyState() {
  return { fleets: {} as Record<FleetId, Fleet> }
}

export function requestBuildFleet(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  ownerId: CountryId,
  locationId: ProvinceId,
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
    durationFrames: FLEET_DURATION_FRAMES,
    metadata:       {},
  })
}

export function initNavyMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
): { destroy: () => void } {
  const sub = eventBus.on('construction:complete', (payload) => {
    if (payload.buildableType !== 'fleet') return

    const fleetId = crypto.randomUUID() as FleetId
    const fleet: Fleet = {
      id:           fleetId,
      countryId:    payload.ownerId,
      provinceId:   payload.locationId,
      ships:        3,
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
