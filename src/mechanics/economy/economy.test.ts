import { describe, it, expect, vi } from 'vitest'
import { buildEconomyState, initEconomyMechanic } from './index'
import { computeCountryIncome, DEFAULT_ECONOMY_CONFIG, validateEconomyConfig } from './types'
import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { TickContext } from '../../engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId, Province, Country } from '@contracts/mechanics/map'
import type { Building, BuildingId, BuildingType } from '@contracts/mechanics/buildings'

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

function makeProvince(id: string, countryId: string, isCoastal = false): Province {
  return {
    id:          id as ProvinceId,
    name:        id,
    countryId:   countryId as CountryId,
    cells:       [],
    isCoastal,
    terrainType: 'plains',
  }
}

function makeBuilding(id: string, provinceId: string, buildingType: BuildingType, countryId = 'builder'): Building {
  return {
    id:            id as BuildingId,
    countryId:     countryId as CountryId,
    provinceId:    provinceId as ProvinceId,
    buildingType,
    completedFrame: 1,
  }
}

function makeStateStore(provinces: Province[] = [], buildings: Building[] = []) {
  const provinceMap = Object.fromEntries(provinces.map(p => [p.id, p])) as Record<ProvinceId, Province>
  const countryIds = [...new Set(provinces.map(p => p.countryId))]
  const countryMap = Object.fromEntries(
    countryIds.map(cId => [
      cId,
      {
        id:               cId,
        name:             cId,
        color:            '#000',
        provinceIds:      provinces.filter(p => p.countryId === cId).map(p => p.id),
        capitalProvinceId: provinces.find(p => p.countryId === cId)?.id ?? cId,
      } as Country,
    ]),
  ) as Record<CountryId, Country>

  const buildingMap = Object.fromEntries(buildings.map(b => [b.id, b])) as Record<BuildingId, Building>

  let state: GameState = {
    map: {
      provinces: provinceMap,
      countries: countryMap,
      selectedProvinceId: null,
      hoveredProvinceId:  null,
      cellIndex:          {},
    },
    buildings: { buildings: buildingMap },
    economy:   buildEconomyState(),
  } as unknown as GameState

  return {
    getSlice: vi.fn(<K extends keyof GameState>(key: K) => state[key]),
    getState: vi.fn(() => state),
    setState: vi.fn((updater: (draft: GameState) => GameState) => { state = updater(state) }),
    subscribe: vi.fn(),
  } as unknown as StateStore<GameState>
}

const countryA = 'country-a' as CountryId
const countryB = 'country-b' as CountryId
const provA1   = 'prov-a1' as ProvinceId
const provA2   = 'prov-a2' as ProvinceId
const provB1   = 'prov-b1' as ProvinceId

function tick(frame: number): TickContext {
  return { frame, deltaMs: 50, totalMs: frame * 50 }
}

// ── computeCountryIncome ──────────────────────────────────────────────────────

describe('computeCountryIncome', () => {
  it('returns 0 for a country with no provinces', () => {
    const result = computeCountryIncome(countryA, {}, {}, DEFAULT_ECONOMY_CONFIG)
    expect(result).toBe(0)
  })

  it('returns base income per owned province', () => {
    const provinces = {
      [provA1]: makeProvince(provA1, countryA),
      [provA2]: makeProvince(provA2, countryA),
    } as Record<ProvinceId, Province>
    const result = computeCountryIncome(countryA, provinces, {}, DEFAULT_ECONOMY_CONFIG)
    expect(result).toBe(DEFAULT_ECONOMY_CONFIG.baseProvinceIncome * 2)
  })

  it('does not count provinces owned by another country', () => {
    const provinces = {
      [provB1]: makeProvince(provB1, countryB),
    } as Record<ProvinceId, Province>
    const result = computeCountryIncome(countryA, provinces, {}, DEFAULT_ECONOMY_CONFIG)
    expect(result).toBe(0)
  })

  it('adds farm bonus for a farm in an owned province', () => {
    const provinces = { [provA1]: makeProvince(provA1, countryA) } as Record<ProvinceId, Province>
    const buildings = { farm1: makeBuilding('farm1', provA1, 'farm') } as Record<BuildingId, Building>
    const base = DEFAULT_ECONOMY_CONFIG.baseProvinceIncome
    const result = computeCountryIncome(countryA, provinces, buildings, DEFAULT_ECONOMY_CONFIG)
    expect(result).toBe(base + DEFAULT_ECONOMY_CONFIG.buildingIncome.farm)
  })

  it('adds port bonus for a port in an owned province', () => {
    const provinces = { [provA1]: makeProvince(provA1, countryA, true) } as Record<ProvinceId, Province>
    const buildings = { port1: makeBuilding('port1', provA1, 'port') } as Record<BuildingId, Building>
    const base = DEFAULT_ECONOMY_CONFIG.baseProvinceIncome
    const result = computeCountryIncome(countryA, provinces, buildings, DEFAULT_ECONOMY_CONFIG)
    expect(result).toBe(base + DEFAULT_ECONOMY_CONFIG.buildingIncome.port)
  })

  it('barracks and walls add 0 income', () => {
    const provinces = { [provA1]: makeProvince(provA1, countryA) } as Record<ProvinceId, Province>
    const buildings = {
      b1: makeBuilding('b1', provA1, 'barracks'),
      b2: makeBuilding('b2', provA1, 'walls'),
    } as Record<BuildingId, Building>
    const base = DEFAULT_ECONOMY_CONFIG.baseProvinceIncome
    const result = computeCountryIncome(countryA, provinces, buildings, DEFAULT_ECONOMY_CONFIG)
    expect(result).toBe(base)
  })

  it('does not count a building in an enemy-owned province', () => {
    const provinces = { [provB1]: makeProvince(provB1, countryB) } as Record<ProvinceId, Province>
    const buildings = { farm1: makeBuilding('farm1', provB1, 'farm', countryA) } as Record<BuildingId, Building>
    const result = computeCountryIncome(countryA, provinces, buildings, DEFAULT_ECONOMY_CONFIG)
    expect(result).toBe(0)
  })

  it('counts a captured building (built by enemy) in an owned province', () => {
    // Province now owned by countryA but building.countryId is countryB (original builder)
    const provinces = { [provA1]: makeProvince(provA1, countryA) } as Record<ProvinceId, Province>
    const buildings = { farm1: makeBuilding('farm1', provA1, 'farm', countryB) } as Record<BuildingId, Building>
    const base = DEFAULT_ECONOMY_CONFIG.baseProvinceIncome
    const result = computeCountryIncome(countryA, provinces, buildings, DEFAULT_ECONOMY_CONFIG)
    expect(result).toBe(base + DEFAULT_ECONOMY_CONFIG.buildingIncome.farm)
  })
})

// ── validateEconomyConfig ─────────────────────────────────────────────────────

describe('validateEconomyConfig', () => {
  const VALID = {
    cycleFrames: 60,
    baseProvinceIncome: 5,
    startingGold: 50,
    buildingIncome: { farm: 10, port: 15, barracks: 0, walls: 0 },
  }

  it('accepts a valid config', () => {
    expect(validateEconomyConfig(VALID)).toMatchObject(VALID)
  })

  it('throws when cycleFrames is missing', () => {
    expect(() => validateEconomyConfig({ ...VALID, cycleFrames: undefined })).toThrow('economy.cycleFrames')
  })

  it('throws when cycleFrames is zero', () => {
    expect(() => validateEconomyConfig({ ...VALID, cycleFrames: 0 })).toThrow('economy.cycleFrames')
  })

  it('throws when baseProvinceIncome is negative', () => {
    expect(() => validateEconomyConfig({ ...VALID, baseProvinceIncome: -1 })).toThrow('economy.baseProvinceIncome')
  })

  it('throws when startingGold is negative', () => {
    expect(() => validateEconomyConfig({ ...VALID, startingGold: -1 })).toThrow('economy.startingGold')
  })

  it('throws when buildingIncome is missing', () => {
    const { buildingIncome: _, ...rest } = VALID
    expect(() => validateEconomyConfig(rest)).toThrow('economy.buildingIncome')
  })

  it('throws when farm income is negative', () => {
    expect(() => validateEconomyConfig({ ...VALID, buildingIncome: { ...VALID.buildingIncome, farm: -1 } }))
      .toThrow('economy.buildingIncome.farm')
  })
})

// ── buildEconomyState ─────────────────────────────────────────────────────────

describe('buildEconomyState', () => {
  it('starts with an empty countries record', () => {
    expect(buildEconomyState()).toEqual({ countries: {} })
  })
})

// ── initEconomyMechanic ───────────────────────────────────────────────────────

describe('initEconomyMechanic — initialization', () => {
  it('initializes a CountryEconomy entry for each country in map state', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([
      makeProvince(provA1, countryA),
      makeProvince(provB1, countryB),
    ])
    initEconomyMechanic(bus, store)

    const eco = store.getSlice('economy')
    expect(eco.countries[countryA]).toBeDefined()
    expect(eco.countries[countryB]).toBeDefined()
  })

  it('sets starting gold from config', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(provA1, countryA)])
    initEconomyMechanic(bus, store)

    expect(store.getSlice('economy').countries[countryA].gold).toBe(DEFAULT_ECONOMY_CONFIG.startingGold)
  })

  it('computes incomePerCycle as base province income on startup', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([
      makeProvince(provA1, countryA),
      makeProvince(provA2, countryA),
    ])
    initEconomyMechanic(bus, store)

    const expected = DEFAULT_ECONOMY_CONFIG.baseProvinceIncome * 2
    expect(store.getSlice('economy').countries[countryA].incomePerCycle).toBe(expected)
  })

  it('includes building bonuses in initial income', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore(
      [makeProvince(provA1, countryA)],
      [makeBuilding('farm1', provA1, 'farm')],
    )
    initEconomyMechanic(bus, store)

    const expected = DEFAULT_ECONOMY_CONFIG.baseProvinceIncome + DEFAULT_ECONOMY_CONFIG.buildingIncome.farm
    expect(store.getSlice('economy').countries[countryA].incomePerCycle).toBe(expected)
  })
})

describe('initEconomyMechanic — update', () => {
  it('adds incomePerCycle to gold at cycle boundaries', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(provA1, countryA)])
    const { update } = initEconomyMechanic(bus, store)

    const beforeGold = store.getSlice('economy').countries[countryA].gold
    update(tick(DEFAULT_ECONOMY_CONFIG.cycleFrames))
    const afterGold  = store.getSlice('economy').countries[countryA].gold

    expect(afterGold).toBe(beforeGold + DEFAULT_ECONOMY_CONFIG.baseProvinceIncome)
  })

  it('does not change gold on non-cycle frames', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(provA1, countryA)])
    const { update } = initEconomyMechanic(bus, store)

    const beforeGold = store.getSlice('economy').countries[countryA].gold
    update(tick(1))
    update(tick(DEFAULT_ECONOMY_CONFIG.cycleFrames - 1))
    expect(store.getSlice('economy').countries[countryA].gold).toBe(beforeGold)
  })

  it('does not change gold at frame 0', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(provA1, countryA)])
    const { update } = initEconomyMechanic(bus, store)

    const beforeGold = store.getSlice('economy').countries[countryA].gold
    update(tick(0))
    expect(store.getSlice('economy').countries[countryA].gold).toBe(beforeGold)
  })

  it('emits economy:income-collected with correct fields at cycle boundary', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(provA1, countryA)])
    const { update } = initEconomyMechanic(bus, store)

    update(tick(DEFAULT_ECONOMY_CONFIG.cycleFrames))

    expect(bus.emit).toHaveBeenCalledWith('economy:income-collected', expect.objectContaining({
      countryId: countryA,
      amount:    DEFAULT_ECONOMY_CONFIG.baseProvinceIncome,
      frame:     DEFAULT_ECONOMY_CONFIG.cycleFrames,
    }))
  })

  it('does not emit economy:income-collected for a country with 0 income', () => {
    const bus   = makeMockEventBus()
    // country with no provinces → 0 income
    const store = makeStateStore([makeProvince(provA1, countryA)])
    // We'll test countryB which isn't in map — so it never gets initialized
    // Instead test directly: country with zero income via custom config
    const zeroConfig = { ...DEFAULT_ECONOMY_CONFIG, baseProvinceIncome: 0, buildingIncome: { farm: 0, port: 0, barracks: 0, walls: 0 } }
    const { update } = initEconomyMechanic(bus, store, zeroConfig)

    update(tick(zeroConfig.cycleFrames))

    const incomeCalls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === 'economy:income-collected',
    )
    expect(incomeCalls).toHaveLength(0)
  })

  it('gold accumulates correctly over multiple cycles', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(provA1, countryA)])
    const { update } = initEconomyMechanic(bus, store)

    const startGold = store.getSlice('economy').countries[countryA].gold
    update(tick(DEFAULT_ECONOMY_CONFIG.cycleFrames))
    update(tick(DEFAULT_ECONOMY_CONFIG.cycleFrames * 2))
    update(tick(DEFAULT_ECONOMY_CONFIG.cycleFrames * 3))

    const expected = startGold + DEFAULT_ECONOMY_CONFIG.baseProvinceIncome * 3
    expect(store.getSlice('economy').countries[countryA].gold).toBe(expected)
  })
})

describe('initEconomyMechanic — buildings:building-constructed handler', () => {
  it('recomputes income when a building is constructed', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(provA1, countryA)])
    initEconomyMechanic(bus, store)

    const incomeBefore = store.getSlice('economy').countries[countryA].incomePerCycle

    // Add farm to state, then fire the event
    store.setState(draft => ({
      ...draft,
      buildings: {
        buildings: {
          ...draft.buildings.buildings,
          ['farm1' as BuildingId]: makeBuilding('farm1', provA1, 'farm'),
        },
      },
    }))

    bus.emit('buildings:building-constructed', {
      buildingId:   'farm1' as BuildingId,
      countryId:    countryA,
      provinceId:   provA1,
      buildingType: 'farm',
    })

    const incomeAfter = store.getSlice('economy').countries[countryA].incomePerCycle
    expect(incomeAfter).toBe(incomeBefore + DEFAULT_ECONOMY_CONFIG.buildingIncome.farm)
  })
})

describe('initEconomyMechanic — map:province-conquered handler', () => {
  it('recomputes income for both countries when a province changes hands', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([
      makeProvince(provA1, countryA),
      makeProvince(provB1, countryB),
    ])
    initEconomyMechanic(bus, store)

    const incomeABefore = store.getSlice('economy').countries[countryA].incomePerCycle
    const incomeBBefore = store.getSlice('economy').countries[countryB].incomePerCycle

    // Transfer provB1 from countryB to countryA in state
    store.setState(draft => ({
      ...draft,
      map: {
        ...draft.map,
        provinces: {
          ...draft.map.provinces,
          [provB1]: { ...draft.map.provinces[provB1], countryId: countryA },
        },
      },
    }))

    bus.emit('map:province-conquered', {
      provinceId:  provB1,
      newOwnerId:  countryA,
      oldOwnerId:  countryB,
    })

    const incomeAAfter = store.getSlice('economy').countries[countryA].incomePerCycle
    const incomeBAfter = store.getSlice('economy').countries[countryB].incomePerCycle

    expect(incomeAAfter).toBeGreaterThan(incomeABefore)
    expect(incomeBAfter).toBeLessThan(incomeBBefore)
  })
})

describe('initEconomyMechanic — destroy', () => {
  it('stops responding to buildings:building-constructed after destroy', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(provA1, countryA)])
    const { destroy } = initEconomyMechanic(bus, store)

    const setStateCalls = (store.setState as ReturnType<typeof vi.fn>).mock.calls.length
    destroy()

    store.setState(draft => ({
      ...draft,
      buildings: {
        buildings: {
          ...draft.buildings.buildings,
          ['farm1' as BuildingId]: makeBuilding('farm1', provA1, 'farm'),
        },
      },
    }))
    bus.emit('buildings:building-constructed', {
      buildingId: 'farm1' as BuildingId, countryId: countryA, provinceId: provA1, buildingType: 'farm',
    })

    // Only the setState calls before destroy plus the one we made manually above
    expect((store.setState as ReturnType<typeof vi.fn>).mock.calls.length).toBe(setStateCalls + 1)
  })

  it('stops responding to map:province-conquered after destroy', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(provA1, countryA)])
    const { destroy } = initEconomyMechanic(bus, store)

    const setStateCalls = (store.setState as ReturnType<typeof vi.fn>).mock.calls.length
    destroy()

    bus.emit('map:province-conquered', {
      provinceId: provA1, newOwnerId: countryB, oldOwnerId: countryA,
    })

    expect((store.setState as ReturnType<typeof vi.fn>).mock.calls.length).toBe(setStateCalls)
  })
})
