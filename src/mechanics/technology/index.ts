import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId } from '@contracts/mechanics/map'
import type { JobId } from '@contracts/mechanics/construction'
import type {
  ResearchedTechnology,
  TechnologyId,
  TechnologyType,
} from '@contracts/mechanics/technology'
import {
  DEFAULT_TECHNOLOGY_CONFIG,
  validateTechnologyConfig,
  isTechnologyType,
} from './types'

export type { ResearchedTechnology, TechnologyId, TechnologyType, TechnologyState } from '@contracts/mechanics/technology'
export type { TechnologyConfig, TechnologyTypeConfig } from './types'
export { DEFAULT_TECHNOLOGY_CONFIG } from './types'
export { initTechnologyEffects } from './effects'

export function buildTechnologyState() {
  return {
    technologies: {} as Record<TechnologyId, ResearchedTechnology>,
    byCountry: {} as Record<CountryId, readonly TechnologyType[]>,
  }
}

export async function loadTechnologyConfig(
  url = `${import.meta.env.BASE_URL}config/technology.json`,
): Promise<import('./types').TechnologyConfig> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load technology config from ${url}: HTTP ${response.status}`)
  }
  const raw: unknown = await response.json()
  return validateTechnologyConfig(raw)
}

export function requestResearchTechnology(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  ownerId: CountryId,
  locationId: ProvinceId,
  technologyType: TechnologyType,
  config = DEFAULT_TECHNOLOGY_CONFIG,
): void {
  const existing = stateStore.getSlice('technology').byCountry[ownerId] ?? []
  if (existing.includes(technologyType)) {
    eventBus.emit('technology:research-rejected', { ownerId, technologyType, reason: 'already-researched' })
    return
  }

  eventBus.emit('construction:request', {
    jobId:         crypto.randomUUID() as JobId,
    ownerId,
    locationId,
    buildableType: 'technology',
    durationTurns: config.technologies[technologyType].durationTurns,
    metadata:      { technologyType },
  })
}

export function initTechnologyMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
  config = DEFAULT_TECHNOLOGY_CONFIG,  // reserved for future per-type behavior
): { destroy: () => void } {
  void config

  const sub = eventBus.on('construction:complete', (payload) => {
    if (payload.buildableType !== 'technology') return

    const rawType = payload.metadata['technologyType']
    if (!isTechnologyType(rawType)) return

    const technologyId = crypto.randomUUID() as TechnologyId
    const researched: ResearchedTechnology = {
      id:             technologyId,
      countryId:      payload.ownerId,
      provinceId:     payload.locationId,
      technologyType: rawType,
      completedTurn:  payload.completedTurn,
    }

    stateStore.setState(draft => {
      const prevList = draft.technology.byCountry[payload.ownerId] ?? []
      return {
        ...draft,
        technology: {
          technologies: { ...draft.technology.technologies, [technologyId]: researched },
          byCountry:    { ...draft.technology.byCountry, [payload.ownerId]: [...prevList, rawType] },
        },
      }
    })

    eventBus.emit('technology:research-completed', {
      technologyId,
      countryId:      payload.ownerId,
      technologyType: rawType,
    })
  })

  return { destroy: () => sub.unsubscribe() }
}
