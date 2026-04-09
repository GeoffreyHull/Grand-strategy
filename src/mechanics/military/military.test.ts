import { describe, it, expect, vi } from 'vitest'
import { buildMilitaryState, initMilitaryMechanic, requestBuildArmy } from './index'
import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId } from '@contracts/mechanics/map'
import type { JobId } from '@contracts/mechanics/construction'
import type { ArmyId } from '@contracts/mechanics/military'
import type { Building, BuildingId, BuildingType } from '@contracts/mechanics/buildings'
import { DEFAULT_MILITARY_CONFIG } from './types'

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

function makeBuilding(id: string, provinceId: ProvinceId, buildingType: BuildingType): Building {
  return { id: id as BuildingId, countryId: ownerId, provinceId, buildingType, completedFrame: 1 }
}

function makeStateStore(existingBuildings: Building[] = []) {
  const buildingMap = Object.fromEntries(existingBuildings.map(b => [b.id, b])) as Record<BuildingId, Building>

  let state: GameState = {
    military:  buildMilitaryState(),
    buildings: { buildings: buildingMap },
  } as unknown as GameState

  return {
    getSlice: vi.fn(<K extends keyof GameState>(key: K) => state[key]),
    getState: vi.fn(() => state),
    setState: vi.fn((updater: (draft: GameState) => GameState) => { state = updater(state) }),
    subscribe: vi.fn(),
  } as unknown as StateStore<GameState>
}

const ownerId   = 'valdorn' as CountryId
const locationId = 'ironhold' as ProvinceId

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildMilitaryState', () => {
  it('starts with an empty armies record', () => {
    expect(buildMilitaryState()).toEqual({ armies: {} })
  })
})

describe('requestBuildArmy', () => {
  it('emits construction:request with buildableType army', () => {
    const bus = makeMockEventBus()
    requestBuildArmy(bus, ownerId, locationId)
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({ buildableType: 'army' }))
  })

  it('emits construction:request with durationFrames 60', () => {
    const bus = makeMockEventBus()
    requestBuildArmy(bus, ownerId, locationId)
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({ durationFrames: 60 }))
  })

  it('emits construction:request with empty metadata', () => {
    const bus = makeMockEventBus()
    requestBuildArmy(bus, ownerId, locationId)
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({ metadata: {} }))
  })

  it('emits construction:request with a unique jobId each call', () => {
    const bus = makeMockEventBus()
    requestBuildArmy(bus, ownerId, locationId)
    requestBuildArmy(bus, ownerId, locationId)
    const calls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) => c[0] === 'construction:request')
    const id1 = calls[0][1].jobId as JobId
    const id2 = calls[1][1].jobId as JobId
    expect(id1).not.toBe(id2)
  })
})

describe('initMilitaryMechanic — construction:complete handler', () => {
  it('ignores construction:complete events for non-army buildableTypes', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initMilitaryMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'fleet', completedFrame: 5, metadata: {},
    })

    expect(store.setState).not.toHaveBeenCalled()
  })

  it('creates an Army in state on army construction:complete', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initMilitaryMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 10, metadata: {},
    })

    const armies = store.getSlice('military').armies
    const army = Object.values(armies)[0]
    expect(army).toBeDefined()
    expect(army.countryId).toBe(ownerId)
    expect(army.provinceId).toBe(locationId)
  })

  it('emits military:army-raised with correct fields', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initMilitaryMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 10, metadata: {},
    })

    expect(bus.emit).toHaveBeenCalledWith('military:army-raised', expect.objectContaining({
      countryId:  ownerId,
      provinceId: locationId,
    }))
  })

  it('Army.strength is 100', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initMilitaryMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 10, metadata: {},
    })

    const army = Object.values(store.getSlice('military').armies)[0]
    expect(army.strength).toBe(100)
  })

  it('Army.createdFrame matches completedFrame from the event', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initMilitaryMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 42, metadata: {},
    })

    const army = Object.values(store.getSlice('military').armies)[0]
    expect(army.createdFrame).toBe(42)
  })

  it('multiple completions produce distinct ArmyIds', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initMilitaryMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 1, metadata: {},
    })
    bus.emit('construction:complete', {
      jobId: 'j2' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 2, metadata: {},
    })

    const ids = Object.keys(store.getSlice('military').armies) as ArmyId[]
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
  })
})

describe('initMilitaryMechanic — map:province-conquered handler', () => {
  function raiseArmy(bus: ReturnType<typeof makeMockEventBus>, store: ReturnType<typeof makeStateStore>, provinceId: ProvinceId, countryId: CountryId) {
    bus.emit('construction:complete', {
      jobId: crypto.randomUUID() as JobId,
      ownerId: countryId,
      locationId: provinceId,
      buildableType: 'army',
      completedFrame: 1,
      metadata: {},
    })
  }

  it('removes the defender army when its province is conquered', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initMilitaryMechanic(bus, store)

    raiseArmy(bus, store, locationId, ownerId)
    expect(Object.keys(store.getSlice('military').armies)).toHaveLength(1)

    bus.emit('map:province-conquered', {
      provinceId: locationId,
      newOwnerId: 'attacker' as CountryId,
      oldOwnerId: ownerId,
    })

    expect(Object.keys(store.getSlice('military').armies)).toHaveLength(0)
  })

  it('emits military:army-destroyed for each destroyed army', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initMilitaryMechanic(bus, store)

    raiseArmy(bus, store, locationId, ownerId)
    raiseArmy(bus, store, locationId, ownerId)

    bus.emit('map:province-conquered', {
      provinceId: locationId,
      newOwnerId: 'attacker' as CountryId,
      oldOwnerId: ownerId,
    })

    const destroyCalls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === 'military:army-destroyed',
    )
    expect(destroyCalls).toHaveLength(2)
    for (const call of destroyCalls) {
      expect(call[1]).toMatchObject({ countryId: ownerId, provinceId: locationId })
    }
  })

  it('does not remove armies belonging to the attacker', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initMilitaryMechanic(bus, store)

    const attackerId = 'attacker' as CountryId
    raiseArmy(bus, store, locationId, attackerId)

    bus.emit('map:province-conquered', {
      provinceId: locationId,
      newOwnerId: attackerId,
      oldOwnerId: ownerId,
    })

    expect(Object.keys(store.getSlice('military').armies)).toHaveLength(1)
  })

  it('does not remove armies in a different province', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initMilitaryMechanic(bus, store)

    const otherProvince = 'elsewhere' as ProvinceId
    raiseArmy(bus, store, otherProvince, ownerId)

    bus.emit('map:province-conquered', {
      provinceId: locationId,
      newOwnerId: 'attacker' as CountryId,
      oldOwnerId: ownerId,
    })

    expect(Object.keys(store.getSlice('military').armies)).toHaveLength(1)
  })

  it('does nothing when no defender armies are present', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initMilitaryMechanic(bus, store)

    bus.emit('map:province-conquered', {
      provinceId: locationId,
      newOwnerId: 'attacker' as CountryId,
      oldOwnerId: ownerId,
    })

    expect(store.setState).not.toHaveBeenCalled()
  })
})

describe('initMilitaryMechanic — destroy', () => {
  it('stops responding to construction:complete after destroy', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    const { destroy } = initMilitaryMechanic(bus, store)
    destroy()

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 1, metadata: {},
    })

    expect(store.setState).not.toHaveBeenCalled()
  })

  it('stops responding to map:province-conquered after destroy', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    const { destroy } = initMilitaryMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 1, metadata: {},
    })
    destroy()

    const setStateCalls = (store.setState as ReturnType<typeof vi.fn>).mock.calls.length

    bus.emit('map:province-conquered', {
      provinceId: locationId,
      newOwnerId: 'attacker' as CountryId,
      oldOwnerId: ownerId,
    })

    expect((store.setState as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(setStateCalls)
  })
})

// ── initMilitaryMechanic — barracks strength bonus ────────────────────────────

describe('initMilitaryMechanic — barracks strength bonus', () => {
  it('army raised without barracks has base strength', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initMilitaryMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 1, metadata: {},
    })
    const army = Object.values(store.getSlice('military').armies)[0]
    expect(army.strength).toBe(DEFAULT_MILITARY_CONFIG.army.strength)
  })

  it('army raised in province with barracks gets strength bonus', () => {
    const barracks = makeBuilding('b1', locationId, 'barracks')
    const bus      = makeMockEventBus()
    const store    = makeStateStore([barracks])
    initMilitaryMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 1, metadata: {},
    })
    const army = Object.values(store.getSlice('military').armies)[0]
    const expected = DEFAULT_MILITARY_CONFIG.army.strength + DEFAULT_MILITARY_CONFIG.army.barracksStrengthBonus
    expect(army.strength).toBe(expected)
  })

  it('barracks in a different province does not grant the bonus', () => {
    const barracks = makeBuilding('b1', 'other-province' as ProvinceId, 'barracks')
    const bus      = makeMockEventBus()
    const store    = makeStateStore([barracks])
    initMilitaryMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 1, metadata: {},
    })
    const army = Object.values(store.getSlice('military').armies)[0]
    expect(army.strength).toBe(DEFAULT_MILITARY_CONFIG.army.strength)
  })

  it('non-barracks buildings in the province do not grant the bonus', () => {
    const farm = makeBuilding('f1', locationId, 'farm')
    const bus  = makeMockEventBus()
    const store = makeStateStore([farm])
    initMilitaryMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 1, metadata: {},
    })
    const army = Object.values(store.getSlice('military').armies)[0]
    expect(army.strength).toBe(DEFAULT_MILITARY_CONFIG.army.strength)
  })

  it('bonus applies only once regardless of how many barracks are in the province', () => {
    const b1  = makeBuilding('b1', locationId, 'barracks')
    const b2  = makeBuilding('b2', locationId, 'barracks')
    const bus = makeMockEventBus()
    const store = makeStateStore([b1, b2])
    initMilitaryMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 1, metadata: {},
    })
    const army = Object.values(store.getSlice('military').armies)[0]
    const expected = DEFAULT_MILITARY_CONFIG.army.strength + DEFAULT_MILITARY_CONFIG.army.barracksStrengthBonus
    expect(army.strength).toBe(expected)
  })
})
