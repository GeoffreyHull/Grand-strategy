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
export { DEFAULT_MILITARY_CONFIG } from './types'

export function buildMilitaryState() {
  return { armies: {} as Record<ArmyId, Army> }
}

export async function loadMilitaryConfig(
  url = `${import.meta.env.BASE_URL}config/military.json`,
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
  stateStore: StateStore<GameState>,
  ownerId: CountryId,
  locationId: ProvinceId,
  config = DEFAULT_MILITARY_CONFIG,
): void {
  const gold = stateStore.getState().economy?.countries[ownerId]?.gold ?? 0
  if (gold < config.army.cost) {
    eventBus.emit('military:army-build-rejected', {
      ownerId,
      locationId,
      reason: 'insufficient-gold',
    })
    return
  }

  eventBus.emit('economy:gold-deducted', {
    countryId: ownerId,
    amount:    config.army.cost,
    reason:    'army-recruitment',
  })
  eventBus.emit('construction:request', {
    jobId:         crypto.randomUUID() as JobId,
    ownerId,
    locationId,
    buildableType: 'army',
    durationTurns: config.army.durationTurns,
    metadata:      {},
  })
}

export function initMilitaryMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  config = DEFAULT_MILITARY_CONFIG,
): { destroy: () => void } {
  const constructionSub = eventBus.on('construction:complete', (payload) => {
    if (payload.buildableType !== 'army') return

    const armyId = crypto.randomUUID() as ArmyId
    const hasBarracks = Object.values(stateStore.getState().buildings?.buildings ?? {})
      .some(b => b.provinceId === payload.locationId && b.buildingType === 'barracks')
    const strength = config.army.strength + (hasBarracks ? config.army.barracksStrengthBonus : 0)
    const army: Army = {
      id:          armyId,
      countryId:   payload.ownerId,
      provinceId:  payload.locationId,
      strength,
      createdTurn: payload.completedTurn,
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

  const conquestSub = eventBus.on('map:province-conquered', (payload) => {
    const { provinceId, oldOwnerId } = payload
    const armies = stateStore.getSlice('military').armies
    const destroyed = Object.values(armies).filter(
      a => a.provinceId === provinceId && a.countryId === oldOwnerId,
    )

    if (destroyed.length === 0) return

    stateStore.setState(draft => {
      const next = { ...draft.military.armies }
      for (const a of destroyed) delete next[a.id]
      return { ...draft, military: { armies: next } }
    })

    for (const a of destroyed) {
      eventBus.emit('military:army-destroyed', {
        armyId:    a.id,
        countryId: a.countryId,
        provinceId,
      })
    }
  })

  const casualtiesSub = eventBus.on('military:casualties-taken', ({ casualties }) => {
    const armies = stateStore.getSlice('military').armies
    const toDestroy: Army[] = []
    const toReduce:  { army: Army; newStrength: number }[] = []

    for (const { armyId, strengthLost } of casualties) {
      const army = armies[armyId]
      if (!army) continue
      const newStrength = army.strength - strengthLost
      if (newStrength <= 0) {
        toDestroy.push(army)
      } else {
        toReduce.push({ army, newStrength })
      }
    }

    if (toDestroy.length === 0 && toReduce.length === 0) return

    stateStore.setState(draft => {
      const next = { ...draft.military.armies }
      for (const a of toDestroy) delete next[a.id]
      for (const { army, newStrength } of toReduce) {
        next[army.id] = { ...army, strength: newStrength }
      }
      return { ...draft, military: { armies: next } }
    })

    for (const a of toDestroy) {
      eventBus.emit('military:army-destroyed', {
        armyId:    a.id,
        countryId: a.countryId,
        provinceId: a.provinceId,
      })
    }
  })

  return {
    destroy: () => {
      constructionSub.unsubscribe()
      conquestSub.unsubscribe()
      casualtiesSub.unsubscribe()
    },
  }
}
