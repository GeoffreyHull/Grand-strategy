import { describe, it, expect, vi } from 'vitest'
import { buildBuildingsState, initBuildingsMechanic, requestBuildBuilding } from './index'
import { isBuildingType, BUILDING_DURATIONS, DEFAULT_BUILDINGS_CONFIG } from './types'
import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId, TerritoryId, Province } from '@contracts/mechanics/map'
import type { JobId } from '@contracts/mechanics/construction'
import type { Building, BuildingId, BuildingScope, BuildingType } from '@contracts/mechanics/buildings'

const conqueredId  = 'conquered-province' as ProvinceId
const otherOwner   = 'other-kingdom' as CountryId

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
    return {
      unsubscribe: vi.fn(() => {
        handlers.get(event as string)?.delete(handler as Handler<keyof EventMap>)
      }),
    }
  })

  return { emit, on, off: vi.fn(), once: vi.fn() } as unknown as
    EventBus<EventMap> & { emit: typeof emit; on: typeof on }
}

function makeProvince(
  id: string,
  terrainType: Province['terrainType'] = 'plains',
  isCoastal = false,
): Province {
  return { id: id as ProvinceId, name: id, countryId: 'owner' as CountryId, cells: [], isCoastal, terrainType }
}

function makeStateStore(
  province = makeProvince(locationId),
  existingBuildings: Building[] = [],
  countryGold = 1000,
) {
  const buildingMap = Object.fromEntries(existingBuildings.map(b => [b.id, b])) as Record<BuildingId, Building>

  let state: GameState = {
    map: {
      provinces: { [province.id]: province },
      countries: {},
      selectedProvinceId: null,
      hoveredProvinceId: null,
      cellIndex: {},
    },
    buildings: { buildings: buildingMap },
    economy: {
      provinces: {},
      countries: { [ownerId]: { gold: countryGold, modifiers: [] } },
    },
  } as unknown as GameState

  return {
    getSlice: vi.fn(<K extends keyof GameState>(key: K) => state[key]),
    getState: vi.fn(() => state),
    setState: vi.fn((updater: (draft: GameState) => GameState) => { state = updater(state) }),
    subscribe: vi.fn(),
  } as unknown as StateStore<GameState>
}

function makeBuilding(
  id: string,
  provinceId: string,
  buildingType: BuildingType,
  territoryId?: TerritoryId,
): Building {
  const scope: BuildingScope = buildingType === 'farm' ? 'territory' : 'province'
  return {
    id:             id as BuildingId,
    countryId:      ownerId,
    provinceId:     provinceId as ProvinceId,
    ...(territoryId !== undefined ? { territoryId } : {}),
    buildingType,
    completedTurn: 1,
    scope,
  }
}

const ownerId    = 'valdorn' as CountryId
const locationId = 'ironhold' as ProvinceId

// ── buildBuildingsState ───────────────────────────────────────────────────────

describe('buildBuildingsState', () => {
  it('starts with an empty buildings record', () => {
    expect(buildBuildingsState()).toEqual({ buildings: {} })
  })
})

// ── requestBuildBuilding — happy path ─────────────────────────────────────────

describe('requestBuildBuilding — event payload', () => {
  it('emits construction:request with buildableType building', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    requestBuildBuilding(bus, store, ownerId, locationId, 'barracks')
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({ buildableType: 'building' }))
  })

  it.each<[BuildingType, number]>([
    ['barracks', 90],
    ['port', 120],
    ['walls', 90],
  ])('emits correct durationTurns for %s (%i)', (buildingType, expected) => {
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId, 'plains', true))
    requestBuildBuilding(bus, store, ownerId, locationId, buildingType)
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({ durationTurns: expected }))
  })

  it('emits correct durationTurns for farm (territory-scoped)', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId, 'plains', true))
    requestBuildBuilding(bus, store, ownerId, locationId, 'farm', DEFAULT_BUILDINGS_CONFIG, '3,4' as TerritoryId)
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({ durationTurns: 60 }))
  })

  it('includes buildingType in metadata', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId, 'plains', true))
    requestBuildBuilding(bus, store, ownerId, locationId, 'port')
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({
      metadata: expect.objectContaining({ buildingType: 'port' }),
    }))
  })
})

// ── requestBuildBuilding — coastal guard ──────────────────────────────────────

describe('requestBuildBuilding — coastal guard', () => {
  it('rejects a port in a non-coastal province with reason not-coastal', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId, 'plains', false))
    requestBuildBuilding(bus, store, ownerId, locationId, 'port')
    expect(bus.emit).toHaveBeenCalledWith('buildings:build-rejected', expect.objectContaining({
      buildingType: 'port', reason: 'not-coastal',
    }))
  })

  it('does not emit construction:request when a port is rejected for coastal', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId, 'plains', false))
    requestBuildBuilding(bus, store, ownerId, locationId, 'port')
    const calls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some((c: unknown[]) => c[0] === 'construction:request')).toBe(false)
  })

  it('allows a port in a coastal province', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId, 'plains', true))
    requestBuildBuilding(bus, store, ownerId, locationId, 'port')
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.anything())
  })
})

// ── requestBuildBuilding — terrain limits (province-scoped buildings) ─────────

describe('requestBuildBuilding — terrain limits', () => {
  it('rejects barracks when the terrain limit is reached', () => {
    const mountainProvince = makeProvince(locationId, 'mountains')
    const limit = DEFAULT_BUILDINGS_CONFIG.limits['mountains'].barracks   // 2
    const existing = Array.from({ length: limit }, (_, i) =>
      makeBuilding(`barracks-${i}`, locationId, 'barracks'),
    )
    const bus   = makeMockEventBus()
    const store = makeStateStore(mountainProvince, existing)
    requestBuildBuilding(bus, store, ownerId, locationId, 'barracks')
    expect(bus.emit).toHaveBeenCalledWith('buildings:build-rejected', expect.objectContaining({
      buildingType: 'barracks', reason: 'terrain-limit-reached',
    }))
  })

  it('allows barracks when under the terrain limit', () => {
    const mountainProvince = makeProvince(locationId, 'mountains')
    const limit = DEFAULT_BUILDINGS_CONFIG.limits['mountains'].barracks   // 2
    const existing = Array.from({ length: limit - 1 }, (_, i) =>
      makeBuilding(`barracks-${i}`, locationId, 'barracks'),
    )
    const bus   = makeMockEventBus()
    const store = makeStateStore(mountainProvince, existing)
    requestBuildBuilding(bus, store, ownerId, locationId, 'barracks')
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.anything())
  })

  it('plains allow more barracks than mountains', () => {
    const plainsLimit   = DEFAULT_BUILDINGS_CONFIG.limits['plains'].barracks
    const mountainLimit = DEFAULT_BUILDINGS_CONFIG.limits['mountains'].barracks
    expect(plainsLimit).toBeGreaterThan(mountainLimit)
  })

  it('only counts buildings in the same province towards the limit', () => {
    const mountainProvince = makeProvince(locationId, 'mountains')
    const limit = DEFAULT_BUILDINGS_CONFIG.limits['mountains'].barracks
    // Fill limit in a DIFFERENT province
    const existing = Array.from({ length: limit }, (_, i) =>
      makeBuilding(`barracks-${i}`, 'other-province', 'barracks'),
    )
    const bus   = makeMockEventBus()
    const store = makeStateStore(mountainProvince, existing)
    requestBuildBuilding(bus, store, ownerId, locationId, 'barracks')
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.anything())
  })
})

// ── requestBuildBuilding — territory-scoped buildings (farm) ──────────────────

describe('requestBuildBuilding — territory occupancy (farm)', () => {
  const tid = '3,4' as TerritoryId

  it('rejects a farm when the territory already has a farm', () => {
    const existing = [makeBuilding('farm-0', locationId, 'farm', tid)]
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId), existing)
    requestBuildBuilding(bus, store, ownerId, locationId, 'farm', DEFAULT_BUILDINGS_CONFIG, tid)
    expect(bus.emit).toHaveBeenCalledWith('buildings:build-rejected', expect.objectContaining({
      buildingType: 'farm', reason: 'territory-occupied', territoryId: tid,
    }))
  })

  it('allows a farm when the territory is unoccupied', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId))
    requestBuildBuilding(bus, store, ownerId, locationId, 'farm', DEFAULT_BUILDINGS_CONFIG, tid)
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.anything())
  })

  it('allows a farm on a different territory even when another territory already has a farm', () => {
    const otherTid = '5,6' as TerritoryId
    const existing = [makeBuilding('farm-0', locationId, 'farm', tid)]
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId), existing)
    requestBuildBuilding(bus, store, ownerId, locationId, 'farm', DEFAULT_BUILDINGS_CONFIG, otherTid)
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.anything())
  })

  it('silently returns when no territoryId is provided for a farm', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId))
    requestBuildBuilding(bus, store, ownerId, locationId, 'farm')
    expect(bus.emit).not.toHaveBeenCalled()
  })

  it('passes territoryId in construction:request metadata', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId))
    requestBuildBuilding(bus, store, ownerId, locationId, 'farm', DEFAULT_BUILDINGS_CONFIG, tid)
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({
      metadata: expect.objectContaining({ buildingType: 'farm', territoryId: tid }),
    }))
  })
})

// ── isBuildingType ────────────────────────────────────────────────────────────

describe('isBuildingType', () => {
  it.each<BuildingType>(['barracks', 'port', 'farm', 'walls'])('returns true for %s', (bt) => {
    expect(isBuildingType(bt)).toBe(true)
  })

  it('returns false for an unknown string', () => { expect(isBuildingType('castle')).toBe(false) })
  it('returns false for a number',         () => { expect(isBuildingType(42)).toBe(false) })
  it('returns false for null',             () => { expect(isBuildingType(null)).toBe(false) })
  it('returns false for undefined',        () => { expect(isBuildingType(undefined)).toBe(false) })
  it('returns false for an object',        () => { expect(isBuildingType({ buildingType: 'farm' })).toBe(false) })
})

// ── initBuildingsMechanic — construction:complete handler ─────────────────────

describe('initBuildingsMechanic — construction:complete handler', () => {
  it('ignores non-building buildableTypes', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedTurn: 5, metadata: {},
    })
    expect(store.setState).not.toHaveBeenCalled()
  })

  it('ignores construction:complete with invalid metadata.buildingType', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedTurn: 5, metadata: { buildingType: 'castle' },
    })
    expect(store.setState).not.toHaveBeenCalled()
  })

  it.each<[BuildingType, 'territory' | 'province']>([
    ['barracks', 'province'],
    ['port',     'province'],
    ['farm',     'territory'],
    ['walls',    'province'],
  ])('creates a %s building in state with scope %s', (buildingType, expectedScope) => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)
    const metadata: Record<string, unknown> = { buildingType }
    if (buildingType === 'farm') metadata['territoryId'] = '3,4'
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedTurn: 5, metadata,
    })
    const b = Object.values(store.getSlice('buildings').buildings)[0]
    expect(b).toBeDefined()
    expect(b.buildingType).toBe(buildingType)
    expect(b.scope).toBe(expectedScope)
  })

  it('emits buildings:building-constructed with correct payload', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedTurn: 5, metadata: { buildingType: 'farm', territoryId: '3,4' },
    })
    expect(bus.emit).toHaveBeenCalledWith('buildings:building-constructed', expect.objectContaining({
      countryId: ownerId, provinceId: locationId, buildingType: 'farm',
      scope: 'territory', territoryId: '3,4',
    }))
  })

  it('Building.completedTurn matches completedTurn from the event', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedTurn: 55, metadata: { buildingType: 'walls' },
    })
    const b = Object.values(store.getSlice('buildings').buildings)[0]
    expect(b.completedTurn).toBe(55)
  })

  it('multiple buildings can coexist in state', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedTurn: 1, metadata: { buildingType: 'barracks' },
    })
    bus.emit('construction:complete', {
      jobId: 'j2' as JobId, ownerId, locationId,
      buildableType: 'building', completedTurn: 2, metadata: { buildingType: 'farm' },
    })
    expect(Object.keys(store.getSlice('buildings').buildings)).toHaveLength(2)
  })
})

// ── initBuildingsMechanic — economy modifier emission ─────────────────────────

describe('initBuildingsMechanic — economy:province-modifier-added', () => {
  it('emits economy:province-modifier-added for a farm (income > 0)', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedTurn: 1, metadata: { buildingType: 'farm' },
    })
    const calls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls
    const modEvent = calls.find((c: unknown[]) => c[0] === 'economy:province-modifier-added')
    expect(modEvent).toBeDefined()
    expect(modEvent![1]).toMatchObject({
      provinceId: locationId,
      modifier: expect.objectContaining({
        op:           'add',
        value:        DEFAULT_BUILDINGS_CONFIG.buildings.farm.incomeBonus,
        buildingType: 'farm',
      }),
    })
  })

  it('emits economy:province-modifier-added for a port (income > 0)', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedTurn: 1, metadata: { buildingType: 'port' },
    })
    const calls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some((c: unknown[]) => c[0] === 'economy:province-modifier-added')).toBe(true)
  })

  it('does NOT emit economy:province-modifier-added for barracks (income = 0)', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedTurn: 1, metadata: { buildingType: 'barracks' },
    })
    const calls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some((c: unknown[]) => c[0] === 'economy:province-modifier-added')).toBe(false)
  })

  it('does NOT emit economy:province-modifier-added for walls (income = 0)', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedTurn: 1, metadata: { buildingType: 'walls' },
    })
    const calls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some((c: unknown[]) => c[0] === 'economy:province-modifier-added')).toBe(false)
  })

  it('modifier id matches the generated buildingId', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedTurn: 1, metadata: { buildingType: 'farm' },
    })
    const building = Object.values(store.getSlice('buildings').buildings)[0]
    const calls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls
    const modEvent = calls.find((c: unknown[]) => c[0] === 'economy:province-modifier-added')
    expect(modEvent![1].modifier.id).toBe(building.id)
  })
})

// ── initBuildingsMechanic — destroy ───────────────────────────────────────────

describe('initBuildingsMechanic — destroy', () => {
  it('stops responding to construction:complete after destroy', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    const { destroy } = initBuildingsMechanic(bus, store)
    destroy()
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'building', completedTurn: 1, metadata: { buildingType: 'barracks' },
    })
    expect(store.setState).not.toHaveBeenCalled()
  })
})

// ── requestBuildBuilding — gold cost ──────────────────────────────────────────

describe('requestBuildBuilding — gold cost', () => {
  it('rejects with insufficient-gold when country cannot afford the building', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId), [], 0)
    requestBuildBuilding(bus, store, ownerId, locationId, 'barracks')
    expect(bus.emit).toHaveBeenCalledWith('buildings:build-rejected', expect.objectContaining({
      buildingType: 'barracks', reason: 'insufficient-gold',
    }))
  })

  it('does not emit construction:request when gold is insufficient', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId), [], 0)
    requestBuildBuilding(bus, store, ownerId, locationId, 'barracks')
    const calls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some((c: unknown[]) => c[0] === 'construction:request')).toBe(false)
  })

  it('emits economy:gold-deducted with the correct amount when gold is sufficient', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId), [], 1000)
    requestBuildBuilding(bus, store, ownerId, locationId, 'barracks')
    expect(bus.emit).toHaveBeenCalledWith('economy:gold-deducted', expect.objectContaining({
      countryId: ownerId,
      amount:    DEFAULT_BUILDINGS_CONFIG.buildings.barracks.goldCost,
      reason:    'building:barracks',
    }))
  })

  it('emits economy:gold-deducted before construction:request', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId), [], 1000)
    requestBuildBuilding(bus, store, ownerId, locationId, 'farm', DEFAULT_BUILDINGS_CONFIG, '3,4' as TerritoryId)
    const calls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0])
    const deductIdx     = calls.indexOf('economy:gold-deducted')
    const constructIdx  = calls.indexOf('construction:request')
    expect(deductIdx).toBeGreaterThanOrEqual(0)
    expect(deductIdx).toBeLessThan(constructIdx)
  })

  it.each<[BuildingType, number]>([
    ['barracks', 50],
    ['port',     75],
    ['farm',     30],
    ['walls',    60],
  ])('%s costs %i gold', (buildingType, cost) => {
    expect(DEFAULT_BUILDINGS_CONFIG.buildings[buildingType].goldCost).toBe(cost)
  })

  it('rejects with insufficient-gold when gold is exactly one below cost', () => {
    const cost  = DEFAULT_BUILDINGS_CONFIG.buildings.farm.goldCost
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId), [], cost - 1)
    requestBuildBuilding(bus, store, ownerId, locationId, 'farm', DEFAULT_BUILDINGS_CONFIG, '3,4' as TerritoryId)
    expect(bus.emit).toHaveBeenCalledWith('buildings:build-rejected', expect.objectContaining({
      reason: 'insufficient-gold',
    }))
  })

  it('allows construction when gold equals the cost exactly', () => {
    const cost  = DEFAULT_BUILDINGS_CONFIG.buildings.farm.goldCost
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId), [], cost)
    requestBuildBuilding(bus, store, ownerId, locationId, 'farm', DEFAULT_BUILDINGS_CONFIG, '3,4' as TerritoryId)
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.anything())
  })
})

// ── initBuildingsMechanic — walls destroyed on conquest ───────────────────────

describe('initBuildingsMechanic — walls destroyed on province conquest', () => {
  it('removes walls from state when the province is conquered', () => {
    const wall  = makeBuilding('wall-1', conqueredId, 'walls')
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId), [wall])
    initBuildingsMechanic(bus, store)
    bus.emit('map:province-conquered', {
      provinceId: conqueredId, newOwnerId: ownerId, oldOwnerId: otherOwner,
    })
    expect(store.getState().buildings.buildings['wall-1' as BuildingId]).toBeUndefined()
  })

  it('emits buildings:building-destroyed for each destroyed wall', () => {
    const wall  = makeBuilding('wall-1', conqueredId, 'walls')
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId), [wall])
    initBuildingsMechanic(bus, store)
    bus.emit('map:province-conquered', {
      provinceId: conqueredId, newOwnerId: ownerId, oldOwnerId: otherOwner,
    })
    expect(bus.emit).toHaveBeenCalledWith('buildings:building-destroyed', expect.objectContaining({
      buildingId:   'wall-1' as BuildingId,
      provinceId:   conqueredId,
      buildingType: 'walls',
    }))
  })

  it('destroys all walls when multiple exist in the province', () => {
    const wall1 = makeBuilding('wall-1', conqueredId, 'walls')
    const wall2 = makeBuilding('wall-2', conqueredId, 'walls')
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId), [wall1, wall2])
    initBuildingsMechanic(bus, store)
    bus.emit('map:province-conquered', {
      provinceId: conqueredId, newOwnerId: ownerId, oldOwnerId: otherOwner,
    })
    const remaining = Object.values(store.getState().buildings.buildings)
    expect(remaining).toHaveLength(0)
    const destroyedCalls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls
      .filter((c: unknown[]) => c[0] === 'buildings:building-destroyed')
    expect(destroyedCalls).toHaveLength(2)
  })

  it('does not destroy non-walls buildings when province is conquered', () => {
    const barracks = makeBuilding('barracks-1', conqueredId, 'barracks')
    const farm     = makeBuilding('farm-1', conqueredId, 'farm')
    const bus      = makeMockEventBus()
    const store    = makeStateStore(makeProvince(locationId), [barracks, farm])
    initBuildingsMechanic(bus, store)
    bus.emit('map:province-conquered', {
      provinceId: conqueredId, newOwnerId: ownerId, oldOwnerId: otherOwner,
    })
    const remaining = Object.values(store.getState().buildings.buildings)
    expect(remaining).toHaveLength(2)
    expect(bus.emit).not.toHaveBeenCalledWith('buildings:building-destroyed', expect.anything())
  })

  it('does not destroy walls in other provinces', () => {
    const wallHere  = makeBuilding('wall-here', conqueredId, 'walls')
    const wallOther = makeBuilding('wall-other', locationId, 'walls')
    const bus       = makeMockEventBus()
    const store     = makeStateStore(makeProvince(locationId), [wallHere, wallOther])
    initBuildingsMechanic(bus, store)
    bus.emit('map:province-conquered', {
      provinceId: conqueredId, newOwnerId: ownerId, oldOwnerId: otherOwner,
    })
    expect(store.getState().buildings.buildings['wall-other' as BuildingId]).toBeDefined()
  })

  it('does nothing when the conquered province has no buildings', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initBuildingsMechanic(bus, store)
    bus.emit('map:province-conquered', {
      provinceId: conqueredId, newOwnerId: ownerId, oldOwnerId: otherOwner,
    })
    expect(store.setState).not.toHaveBeenCalled()
    expect(bus.emit).not.toHaveBeenCalledWith('buildings:building-destroyed', expect.anything())
  })

  it('stops responding to map:province-conquered after destroy', () => {
    const wall  = makeBuilding('wall-1', conqueredId, 'walls')
    const bus   = makeMockEventBus()
    const store = makeStateStore(makeProvince(locationId), [wall])
    const { destroy } = initBuildingsMechanic(bus, store)
    destroy()
    bus.emit('map:province-conquered', {
      provinceId: conqueredId, newOwnerId: ownerId, oldOwnerId: otherOwner,
    })
    expect(store.setState).not.toHaveBeenCalled()
  })
})
