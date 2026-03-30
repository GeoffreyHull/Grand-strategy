import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId } from '@contracts/mechanics/map'
import type { JobId } from '@contracts/mechanics/construction'
import type { Army, ArmyId } from '@contracts/mechanics/military'
import {
  DEFAULT_MILITARY_CONFIG,
  validateMilitaryConfig,
} from './types'

export type { Army, ArmyId, MilitaryState } from '@contracts/mechanics/military'
export type { MilitaryConfig } from './types'

export function buildMilitaryState() {
  return { armies: {} as Record<ArmyId, Army> }
}

export async function loadMilitaryConfig(
  url = '/config/military.json',
): Promise<import('./types').MilitaryConfig> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load military config from ${url}: HTTP ${response.status}`)
  }
  const raw: unknown = await response.json()
  return validateMilitaryConfig(raw)
}

export function requestBuildArmy(
  eventBus: EventBus<EventMap>,
  ownerId: CountryId,
  locationId: ProvinceId,
  config = DEFAULT_MILITARY_CONFIG,
): void {
  eventBus.emit('construction:request', {
    jobId:          crypto.randomUUID() as JobId,
    ownerId,
    locationId,
    buildableType:  'army',
    durationFrames: config.army.durationFrames,
    metadata:       {},
  })
}

export function initMilitaryMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  config = DEFAULT_MILITARY_CONFIG,
): { destroy: () => void } {
  const sub = eventBus.on('construction:complete', (payload) => {
    if (payload.buildableType !== 'army') return

    const armyId = crypto.randomUUID() as ArmyId
    const army: Army = {
      id:           armyId,
      countryId:    payload.ownerId,
      provinceId:   payload.locationId,
      strength:     config.army.strength,
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
