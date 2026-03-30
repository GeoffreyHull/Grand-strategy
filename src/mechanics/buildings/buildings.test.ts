import { describe, it, expect, vi } from 'vitest'
import { buildBuildingsState, initBuildingsMechanic, requestBuildBuilding } from './index'
import { isBuildingType, BUILDING_DURATIONS } from './types'
import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId } from '@contracts/mechanics/map'
import type { JobId } from '@contracts/mechanics/construction'
import type { BuildingType } from '@contracts/mechanics/buildings'

// ── Test helpers ──────────────────────────────────────────────────────────────

type Handler<K extends keyof EventMap> = (payload: EventMap[K]) => void

function makeMockEventBus() {
  const handlers = new Map<string, Set<Handler<keyof EventMap>>>()

  const emit = vi.fn(<K extends keyof EventMap>(event: K, payload: EventMap[K]) => {
    const set = handlers.get(event as string)
    if (set) for (const h of set) (h as Handler<K>)(payload)
  })

  const on = vi.fn(<K extends keyof EventMap>(event: K, handler: Handler<K>) => {
    if (!handlers.has(event as string)) handlers.set(event as string, new Set())
    handlers.get(event as string)!.add(handler as Handler<keyof EventMap>)
    return { unsubscribe: vi.fn(() => { handlers.get(event as string)?.delete(handler as Handler<keyof EventMap>) }) }
  })

  return { emit, on, off: vi.fn(), once: vi.fn() } as unknown as EventBus<EventMap> & { emit: typeof emit; on: typeof on }
}

function makeStateStore() {
  let state: GameState = {
    buildings: buildBuildingsState(),
  } as unknown as GameState

  return {
    getSlice: vi.fn(<K extends keyof GameState>(key: K) => state[key]),
    getState: vi.fn(() => state),
    setState: vi.fn((updater: (draft: GameState) => GameState) => { state = updater(state) }),
    subscribe: vi.fn(),
  } as unknown as StateStore<GameState>
}

const ownerId    = 'valdorn' as CountryId
const locationId = 'ironhold' as ProvinceId

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildBuildingsState', () => {
  it('starts with an empty buildings record', () => {
    expect(buildBuildingsState()).toEqual({ buildings: {} })
  })
})

describe('requestBuildBuilding — event payload', () => {
  it('emits construction:request with buildableType building', () => {
    const bus = makeMockEventBus()
    requestBuildBuilding(bus, ownerId, locationId, 'barracks')
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({ buildableType: 'building' }))
  })

  it.each<[BuildingType, number]>([
    ['barracks', 90],
    ['port', 120],
    ['farm', 60],
    ['walls', 90],
  ])('emits correct durationFrames for %s (%i)', (buildingType: BuildingType, expected: number) => {
    const bus = makeMockEventBus()
    requestBuildBuilding(bus, ownerId, locationId, buildingType)
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({ durationFrames: expected }))
  })

  it('includes buildingType in metadata', () => {
    const bus = makeMockEventBus()
    requestBuildBuilding(bus, ownerId, locationId, 'port')
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({
      metadata: expect.objectContaining({ buildingType: 'port' }),
    }))
  })
})

describe('isBuildingType', () => {
  it.each<BuildingType>(['barracks', 'port', 'farm', 'walls'])('returns true for %s', (bt: BuildingType) => {
    expect(isBuildingType(bt)).toBe(true)
  })

  it('returns false for an unknown string', () => {
    expect(isBuildingType('castle')).toBe(false)
  })

  it('returns false for a number', () => {
    expect(isBuildingType(42)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isBuildingType(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isBuildingType(undefined)).toBe(false)
  })

  it('returns false for an object', () => {
    expect(isBuildingType({ buildingType: 'farm' })).toBe(false)
  })
})

describe('initBuildingsMechanic — construction:complete handler', () => {
  it('ignores construction:complete events for non-building buildableTypes', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 5, metadata: {},
    })

    expect(store.setState).not.toHaveBeenCalled()
  })

  it('ignores construction:complete with invalid metadata.buildingType', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedFrame: 5, metadata: { buildingType: 'castle' },
    })

    expect(store.setState).not.toHaveBeenCalled()
  })

  it.each<BuildingType>(['barracks', 'port', 'farm', 'walls'])('creates a %s building in state', (buildingType: BuildingType) => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedFrame: 5, metadata: { buildingType },
    })

    const buildings = store.getSlice('buildings').buildings
    const b = Object.values(buildings)[0]
    expect(b).toBeDefined()
    expect(b.buildingType).toBe(buildingType)
  })

  it('emits buildings:building-constructed with correct payload', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedFrame: 5, metadata: { buildingType: 'farm' },
    })

    expect(bus.emit).toHaveBeenCalledWith('buildings:building-constructed', expect.objectContaining({
      countryId:    ownerId,
      provinceId:   locationId,
      buildingType: 'farm',
    }))
  })

  it('Building.completedFrame matches completedFrame from the event', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedFrame: 55, metadata: { buildingType: 'walls' },
    })

    const b = Object.values(store.getSlice('buildings').buildings)[0]
    expect(b.completedFrame).toBe(55)
  })

  it('multiple buildings can coexist in state', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedFrame: 1, metadata: { buildingType: 'barracks' },
    })
    bus.emit('construction:complete', {
      jobId: 'j2' as JobId, ownerId, locationId,
      buildableType: 'building', completedFrame: 2, metadata: { buildingType: 'farm' },
    })

    expect(Object.keys(store.getSlice('buildings').buildings)).toHaveLength(2)
  })
})

describe('initBuildingsMechanic — destroy', () => {
  it('stops responding to construction:complete after destroy', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    const { destroy } = initBuildingsMechanic(bus, store)
    destroy()

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedFrame: 1, metadata: { buildingType: 'barracks' },
    })

    expect(store.setState).not.toHaveBeenCalled()
  })
})
