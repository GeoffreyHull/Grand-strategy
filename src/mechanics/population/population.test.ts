import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildPopulationState, initPopulationMechanic, DEFAULT_POPULATION_CONFIG } from './index'
import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { ProvinceId, CountryId, Province, Country } from '@contracts/mechanics/map'
import type { PopulationState } from '@contracts/mechanics/population'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProvinceId(s: string): ProvinceId { return s as ProvinceId }
function makeCountryId(s: string): CountryId   { return s as CountryId  }

function makeProvince(id: string, countryId: string, terrain = 'plains' as const): Province {
  return {
    id:          makeProvinceId(id),
    name:        id,
    countryId:   makeCountryId(countryId),
    cells:       [],
    isCoastal:   false,
    terrainType: terrain,
  }
}

function makeCountry(id: string): Country {
  return {
    id:                makeCountryId(id),
    name:              id,
    color:             '#fff',
    provinceIds:       [],
    capitalProvinceId: makeProvinceId(`${id}-cap`),
  }
}

type EmitFn = <K extends keyof EventMap>(event: K, payload: EventMap[K]) => void

function makeMocks(initialState: Partial<GameState> = {}): {
  eventBus: EventBus<EventMap>
  stateStore: StateStore<GameState>
  emit: EmitFn & ReturnType<typeof vi.fn>
  handlers: Map<string, (payload: unknown) => void>
} {
  const handlers = new Map<string, (payload: unknown) => void>()
  let state: GameState = {
    map: {
      provinces: {},
      countries: {},
      territories: {},
      selectedProvinceId: null,
      selectedCountryId: null,
      hoveredProvinceId: null,
      cellIndex: {},
    },
    ai:           { countries: {} },
    construction: { jobs: {} },
    military:     { armies: {} },
    navy:         { fleets: {} },
    buildings:    { buildings: {} },
    technology:   { technologies: {}, byCountry: {} },
    economy:      { provinces: {}, countries: {} },
    diplomacy:    { relations: {}, pendingTruceRequests: {}, currentTurn: 0 },
    population:   buildPopulationState(),
    culture:      { provinces: {}, countryCultures: {} },
    ...initialState,
  } as unknown as GameState

  const emit = vi.fn() as EmitFn & ReturnType<typeof vi.fn>

  const eventBus = {
    emit,
    on: (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, handler)
      return { unsubscribe: () => handlers.delete(event) }
    },
    off: vi.fn(),
    once: vi.fn(),
  } as unknown as EventBus<EventMap>

  const stateStore = {
    getState:  () => state,
    getSlice:  <K extends keyof GameState>(key: K) => state[key],
    setState:  (updater: (draft: GameState) => GameState) => {
      state = updater(state)
    },
  } as unknown as StateStore<GameState>

  return { eventBus, stateStore, emit, handlers }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildPopulationState', () => {
  it('returns empty provinces record', () => {
    const state = buildPopulationState()
    expect(state.provinces).toEqual({})
  })
})

describe('initPopulationMechanic', () => {
  let mocks: ReturnType<typeof makeMocks>

  beforeEach(() => {
    const pA = makeProvince('pA', 'cA', 'plains')
    const pB = makeProvince('pB', 'cB', 'mountains')
    const ocean = makeProvince('pOcean', 'cA', 'ocean')
    mocks = makeMocks({
      map: {
        provinces: {
          [pA.id]: pA,
          [pB.id]: pB,
          [ocean.id]: ocean,
        } as unknown as GameState['map']['provinces'],
        countries: {
          cA: makeCountry('cA'),
          cB: makeCountry('cB'),
        } as unknown as GameState['map']['countries'],
        territories: {},
        selectedProvinceId: null,
        selectedCountryId: null,
        hoveredProvinceId: null,
        cellIndex: {},
      },
    })
  })

  it('initialises province populations from terrain config', () => {
    initPopulationMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_POPULATION_CONFIG)
    const { provinces } = mocks.stateStore.getSlice('population')
    expect(provinces['pA' as ProvinceId]).toBeDefined()
    expect(provinces['pA' as ProvinceId]?.count).toBe(DEFAULT_POPULATION_CONFIG.initialPopulationByTerrain['plains'])
    expect(provinces['pB' as ProvinceId]?.count).toBe(DEFAULT_POPULATION_CONFIG.initialPopulationByTerrain['mountains'])
  })

  it('skips ocean provinces', () => {
    initPopulationMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_POPULATION_CONFIG)
    const { provinces } = mocks.stateStore.getSlice('population')
    expect(provinces['pOcean' as ProvinceId]).toBeUndefined()
  })

  it('emits income modifier for provinces with tier > 0 on init', () => {
    const cfg = { ...DEFAULT_POPULATION_CONFIG, initialPopulationByTerrain: { plains: 1500, mountains: 0, ocean: 0, hills: 0, forest: 0, desert: 0, tundra: 0 } }
    initPopulationMechanic(mocks.eventBus, mocks.stateStore, cfg)
    const calls = (mocks.emit as ReturnType<typeof vi.fn>).mock.calls
    const modAdded = calls.filter(([e]) => e === 'economy:province-modifier-added')
    expect(modAdded.length).toBeGreaterThan(0)
    const payload = modAdded[0]?.[1] as { provinceId: ProvinceId; modifier: { op: string; value: number } }
    expect(payload.modifier.op).toBe('add')
    expect(payload.modifier.value).toBeGreaterThan(0)
  })

  describe('update tick', () => {
    it('does not grow twice for the same turn', () => {
      const mechanic = initPopulationMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_POPULATION_CONFIG)
      mechanic.update({ turn: 1, frame: 300, deltaMs: 50, totalMs: 15000 })
      const after = mocks.stateStore.getSlice('population').provinces['pA' as ProvinceId]?.count ?? 0
      mechanic.update({ turn: 1, frame: 300, deltaMs: 50, totalMs: 15000 })
      const afterDuplicate = mocks.stateStore.getSlice('population').provinces['pA' as ProvinceId]?.count ?? 0
      expect(afterDuplicate).toBe(after)
    })

    it('grows population on a new turn', () => {
      const cfg = { ...DEFAULT_POPULATION_CONFIG, baseGrowthRatePerTurn: 0.1 }
      const mechanic = initPopulationMechanic(mocks.eventBus, mocks.stateStore, cfg)
      const before = mocks.stateStore.getSlice('population').provinces['pA' as ProvinceId]?.count ?? 0
      mechanic.update({ turn: 1, frame: 300, deltaMs: 50, totalMs: 15000 })
      const after = mocks.stateStore.getSlice('population').provinces['pA' as ProvinceId]?.count ?? 0
      expect(after).toBeGreaterThan(before)
    })

    it('emits population:grown when count increases', () => {
      const cfg = { ...DEFAULT_POPULATION_CONFIG, baseGrowthRatePerTurn: 0.5 }
      const mechanic = initPopulationMechanic(mocks.eventBus, mocks.stateStore, cfg)
      ;(mocks.emit as ReturnType<typeof vi.fn>).mockClear()
      mechanic.update({ turn: 1, frame: 300, deltaMs: 50, totalMs: 15000 })
      const calls = (mocks.emit as ReturnType<typeof vi.fn>).mock.calls
      const grownCalls = calls.filter(([e]) => e === 'population:grown')
      expect(grownCalls.length).toBeGreaterThan(0)
    })

    it('applies war growth penalty when country is at war', () => {
      const cfg = { ...DEFAULT_POPULATION_CONFIG, baseGrowthRatePerTurn: 0.5, warGrowthPenalty: 0 }
      // Put cA at war
      mocks = makeMocks({
        map: {
          provinces: { ['pA' as ProvinceId]: makeProvince('pA', 'cA', 'plains') } as unknown as GameState['map']['provinces'],
          countries: {} as unknown as GameState['map']['countries'],
          territories: {},
          selectedProvinceId: null,
          selectedCountryId: null,
          hoveredProvinceId: null,
          cellIndex: {},
        },
        diplomacy: {
          relations: {
            'cA:cC': { countryA: makeCountryId('cA'), countryB: makeCountryId('cC'), status: 'war', truceExpiresAtTurn: null },
          } as unknown as GameState['diplomacy']['relations'],
          pendingTruceRequests: {},
          currentTurn: 0,
        },
      })
      const mechanic = initPopulationMechanic(mocks.eventBus, mocks.stateStore, cfg)
      const before = mocks.stateStore.getSlice('population').provinces['pA' as ProvinceId]?.count ?? 0
      mechanic.update({ turn: 1, frame: 300, deltaMs: 50, totalMs: 15000 })
      const after = mocks.stateStore.getSlice('population').provinces['pA' as ProvinceId]?.count ?? 0
      // warGrowthPenalty = 0 means zero growth during war
      expect(after).toBe(before)
    })

    it('caps population at capacity', () => {
      const cfg = {
        ...DEFAULT_POPULATION_CONFIG,
        baseGrowthRatePerTurn: 100,
        initialPopulationByTerrain: { plains: 4999, hills: 0, mountains: 0, forest: 0, desert: 0, tundra: 0, ocean: 0 },
        capacityByTerrain: { plains: 5000, hills: 0, mountains: 0, forest: 0, desert: 0, tundra: 0, ocean: 0 },
      }
      const mechanic = initPopulationMechanic(mocks.eventBus, mocks.stateStore, cfg)
      for (let i = 1; i <= 10; i++) {
        mechanic.update({ turn: i, frame: i * 300, deltaMs: 50, totalMs: i * 300 * 50 })
      }
      const pop = mocks.stateStore.getSlice('population').provinces['pA' as ProvinceId]
      expect(pop?.count).toBeLessThanOrEqual(pop?.capacity ?? 0)
    })
  })

  describe('conquest transfer', () => {
    it('updates countryId and emits province-transferred on conquest', () => {
      initPopulationMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_POPULATION_CONFIG)
      ;(mocks.emit as ReturnType<typeof vi.fn>).mockClear()

      const handler = mocks.handlers.get('map:province-conquered')
      handler?.({
        provinceId:           makeProvinceId('pA'),
        newOwnerId:           makeCountryId('cB'),
        oldOwnerId:           makeCountryId('cA'),
        attackerStrengthLost: 0,
        defenderStrengthWiped: 0,
      })

      const pop = mocks.stateStore.getSlice('population').provinces['pA' as ProvinceId]
      expect(pop?.countryId).toBe('cB')

      const calls = (mocks.emit as ReturnType<typeof vi.fn>).mock.calls
      const transferred = calls.find(([e]) => e === 'population:province-transferred')
      expect(transferred).toBeDefined()
      expect(transferred?.[1]).toMatchObject({ provinceId: 'pA', newCountryId: 'cB', oldCountryId: 'cA' })
    })
  })

  describe('farm capacity bonus', () => {
    it('increases province capacity when a farm is constructed', () => {
      initPopulationMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_POPULATION_CONFIG)
      const before = mocks.stateStore.getSlice('population').provinces['pA' as ProvinceId]?.capacity ?? 0

      const handler = mocks.handlers.get('buildings:building-constructed')
      handler?.({
        buildingId:   'b1',
        countryId:    makeCountryId('cA'),
        provinceId:   makeProvinceId('pA'),
        buildingType: 'farm',
        scope:        'territory',
      })

      const after = mocks.stateStore.getSlice('population').provinces['pA' as ProvinceId]?.capacity ?? 0
      expect(after).toBe(before + DEFAULT_POPULATION_CONFIG.farmCapacityBonus)
    })

    it('ignores non-farm buildings', () => {
      initPopulationMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_POPULATION_CONFIG)
      const before = mocks.stateStore.getSlice('population').provinces['pA' as ProvinceId]?.capacity ?? 0

      const handler = mocks.handlers.get('buildings:building-constructed')
      handler?.({
        buildingId:   'b2',
        countryId:    makeCountryId('cA'),
        provinceId:   makeProvinceId('pA'),
        buildingType: 'barracks',
        scope:        'province',
      })

      const after = mocks.stateStore.getSlice('population').provinces['pA' as ProvinceId]?.capacity ?? 0
      expect(after).toBe(before)
    })
  })

  describe('destroy', () => {
    it('unsubscribes from events', () => {
      const { destroy } = initPopulationMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_POPULATION_CONFIG)
      destroy()
      // handlers removed — conquest event should no longer update state
      const handler = mocks.handlers.get('map:province-conquered')
      expect(handler).toBeUndefined()
    })
  })
})
