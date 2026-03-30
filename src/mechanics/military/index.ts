import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId } from '@contracts/mechanics/map'
import type { JobId } from '@contracts/mechanics/construction'
import type { Army, ArmyId } from '@contracts/mechanics/military'

export type { Army, ArmyId, MilitaryState } from '@contracts/mechanics/military'

const ARMY_DURATION_FRAMES = 60

export function buildMilitaryState() {
  return { armies: {} as Record<ArmyId, Army> }
}

export function requestBuildArmy(
  eventBus: EventBus<EventMap>,
  ownerId: CountryId,
  locationId: ProvinceId,
): void {
  eventBus.emit('construction:request', {
    jobId:          crypto.randomUUID() as JobId,
    ownerId,
    locationId,
    buildableType:  'army',
    durationFrames: ARMY_DURATION_FRAMES,
    metadata:       {},
  })
}

export function initMilitaryMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
): { destroy: () => void } {
  const sub = eventBus.on('construction:complete', (payload) => {
    if (payload.buildableType !== 'army') return

    const armyId = crypto.randomUUID() as ArmyId
    const army: Army = {
      id:           armyId,
      countryId:    payload.ownerId,
      provinceId:   payload.locationId,
      strength:     100,
      createdFrame: payload.completedFrame,
    }

    stateStore.setState(draft => ({
      ...draft,
      military: { armies: { ...draft.military.armies, [armyId]: army } },
    }))

    eventBus.emit('military:army-raised', {
      armyId,
      countryId:  payload.ownerId,
      provinceId: payload.locationId,
    })
  })

  return { destroy: () => sub.unsubscribe() }
}
