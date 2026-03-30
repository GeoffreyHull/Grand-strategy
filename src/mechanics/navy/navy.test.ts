import { describe, it, expect, vi } from 'vitest'
import { buildNavyState, initNavyMechanic, requestBuildFleet } from './index'
import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState, MapState } from '@contracts/state'
import type { CountryId, ProvinceId, Province } from '@contracts/mechanics/map'
import type { JobId } from '@contracts/mechanics/construction'
import type { FleetId } from '@contracts/mechanics/navy'

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

function makeMapState(provinces: Partial<Record<string, Partial<Province>>> = {}): MapState {
  return {
    provinces: provinces as MapState['provinces'],
    countries: {},
    selectedProvinceId: null,
    hoveredProvinceId: null,
    cellIndex: {},
  }
}

function makeStateStore(mapState?: MapState) {
  let state: GameState = {
    map:  mapState ?? makeMapState(),
    navy: buildNavyState(),
  } as unknown as GameState

  return {
    getSlice: vi.fn(<K extends keyof GameState>(key: K) => state[key]),
    getState: vi.fn(() => state),
    setState: vi.fn((updater: (draft: GameState) => GameState) => { state = updater(state) }),
    subscribe: vi.fn(),
  } as unknown as StateStore<GameState>
}

const ownerId        = 'valdorn' as CountryId
const coastalId      = 'coastal-province' as ProvinceId
const inlandId       = 'inland-province' as ProvinceId
const nonexistentId  = 'no-such-province' as ProvinceId

const coastalProvince: Partial<Province> = { id: coastalId, isCoastal: true }
const inlandProvince:  Partial<Province> = { id: inlandId,  isCoastal: false }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildNavyState', () => {
  it('starts with an empty fleets record', () => {
    expect(buildNavyState()).toEqual({ fleets: {} })
  })
})

describe('requestBuildFleet', () => {
  it('emits construction:request when province isCoastal', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore(makeMapState({ [coastalId]: coastalProvince }))
    requestBuildFleet(bus, store, ownerId, coastalId)
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({ buildableType: 'fleet' }))
  })

  it('emits construction:request with durationFrames 120', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore(makeMapState({ [coastalId]: coastalProvince }))
    requestBuildFleet(bus, store, ownerId, coastalId)
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({ durationFrames: 120 }))
  })

  it('emits navy:fleet-rejected with reason not-coastal for an inland province', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore(makeMapState({ [inlandId]: inlandProvince }))
    requestBuildFleet(bus, store, ownerId, inlandId)
    expect(bus.emit).toHaveBeenCalledWith('navy:fleet-rejected', expect.objectContaining({ reason: 'not-coastal', locationId: inlandId }))
  })

  it('emits navy:fleet-rejected when province does not exist', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore(makeMapState({}))
    requestBuildFleet(bus, store, ownerId, nonexistentId)
    expect(bus.emit).toHaveBeenCalledWith('navy:fleet-rejected', expect.objectContaining({ reason: 'not-coastal' }))
  })

  it('does NOT emit construction:request when province is not coastal', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore(makeMapState({ [inlandId]: inlandProvince }))
    requestBuildFleet(bus, store, ownerId, inlandId)
    expect(bus.emit).not.toHaveBeenCalledWith('construction:request', expect.anything())
  })
})

describe('initNavyMechanic — construction:complete handler', () => {
  it('ignores construction:complete events for non-fleet buildableTypes', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initNavyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId: coastalId,
      buildableType: 'army', completedFrame: 5, metadata: {},
    })

    expect(store.setState).not.toHaveBeenCalled()
  })

  it('creates a Fleet in state on fleet construction:complete', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initNavyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId: coastalId,
      buildableType: 'fleet', completedFrame: 10, metadata: {},
    })

    const fleets = store.getSlice('navy').fleets
    const fleet = Object.values(fleets)[0]
    expect(fleet).toBeDefined()
    expect(fleet.countryId).toBe(ownerId)
    expect(fleet.provinceId).toBe(coastalId)
  })

  it('emits navy:fleet-formed with correct fields', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initNavyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId: coastalId,
      buildableType: 'fleet', completedFrame: 10, metadata: {},
    })

    expect(bus.emit).toHaveBeenCalledWith('navy:fleet-formed', expect.objectContaining({
      countryId:  ownerId,
      provinceId: coastalId,
    }))
  })

  it('Fleet.ships is a positive number', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initNavyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId: coastalId,
      buildableType: 'fleet', completedFrame: 10, metadata: {},
    })

    const fleet = Object.values(store.getSlice('navy').fleets)[0]
    expect(fleet.ships).toBeGreaterThan(0)
  })

  it('Fleet.createdFrame matches completedFrame from the event', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initNavyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId: coastalId,
      buildableType: 'fleet', completedFrame: 77, metadata: {},
    })

    const fleet = Object.values(store.getSlice('navy').fleets)[0]
    expect(fleet.createdFrame).toBe(77)
  })
})

describe('initNavyMechanic — destroy', () => {
  it('stops responding to construction:complete after destroy', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    const { destroy } = initNavyMechanic(bus, store)
    destroy()

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId: coastalId,
      buildableType: 'fleet', completedFrame: 1, metadata: {},
    })

    expect(store.setState).not.toHaveBeenCalled()
  })
})
