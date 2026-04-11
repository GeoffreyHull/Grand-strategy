import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildCultureState, initCultureMechanic, DEFAULT_CULTURE_CONFIG } from './index'
import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { ProvinceId, CountryId, Province, Country } from '@contracts/mechanics/map'
import type { CultureId } from '@contracts/mechanics/culture'
import { buildPopulationState } from '../population/index'

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
    provinceIds:       [makeProvinceId(`${id}-cap`)],
    capitalProvinceId: makeProvinceId(`${id}-cap`),
  }
}

type EmitFn = <K extends keyof EventMap>(event: K, payload: EventMap[K]) => void

function makeMocks(mapOverride?: Partial<GameState['map']>): {
  eventBus: EventBus<EventMap>
  stateStore: StateStore<GameState>
  emit: EmitFn & ReturnType<typeof vi.fn>
  handlers: Map<string, (payload: unknown) => void>
} {
  const handlers = new Map<string, (payload: unknown) => void>()

  const pA = makeProvince('pA', 'cA')
  const pB = makeProvince('pB', 'cB')

  let state: GameState = {
    map: {
      provinces: {
        [pA.id]: pA,
        [pB.id]: pB,
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
      ...mapOverride,
    },
    ai:           { countries: {} },
    construction: { jobs: {} },
    military:     { armies: {} },
    navy:         { fleets: {} },
    buildings:    { buildings: {} },
    technology:   { technologies: {}, byCountry: {} },
    economy:      { provinces: {}, countries: {} },
    diplomacy:    { relations: {}, pendingTruceRequests: {}, currentTurn: 0, framesPerTurn: 20 },
    population:   buildPopulationState(),
    culture:      buildCultureState(),
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

describe('buildCultureState', () => {
  it('returns empty provinces and countryCultures', () => {
    const state = buildCultureState()
    expect(state.provinces).toEqual({})
    expect(state.countryCultures).toEqual({})
  })
})

describe('initCultureMechanic', () => {
  let mocks: ReturnType<typeof makeMocks>

  beforeEach(() => {
    mocks = makeMocks()
  })

  it('assigns a culture to each country', () => {
    initCultureMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_CULTURE_CONFIG)
    const { countryCultures } = mocks.stateStore.getSlice('culture')
    expect(countryCultures['cA' as CountryId]).toBeDefined()
    expect(countryCultures['cB' as CountryId]).toBeDefined()
    expect(countryCultures['cA' as CountryId]).not.toBe(countryCultures['cB' as CountryId])
  })

  it('assigns each province the culture of its founding owner', () => {
    initCultureMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_CULTURE_CONFIG)
    const { provinces, countryCultures } = mocks.stateStore.getSlice('culture')
    expect(provinces['pA' as ProvinceId]?.cultureId).toBe(countryCultures['cA' as CountryId])
    expect(provinces['pB' as ProvinceId]?.cultureId).toBe(countryCultures['cB' as CountryId])
  })

  it('skips ocean provinces', () => {
    const ocean = makeProvince('pOcean', 'cA', 'ocean')
    mocks = makeMocks({
      provinces: {
        ['pA' as ProvinceId]: makeProvince('pA', 'cA'),
        ['pOcean' as ProvinceId]: ocean,
      } as unknown as GameState['map']['provinces'],
    })
    initCultureMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_CULTURE_CONFIG)
    const { provinces } = mocks.stateStore.getSlice('culture')
    expect(provinces['pOcean' as ProvinceId]).toBeUndefined()
  })

  it('emits no modifiers on init (all provinces match their owner)', () => {
    initCultureMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_CULTURE_CONFIG)
    const calls = (mocks.emit as ReturnType<typeof vi.fn>).mock.calls
    const modCalls = calls.filter(([e]) => e === 'economy:province-modifier-added' || e === 'economy:province-modifier-removed')
    expect(modCalls).toHaveLength(0)
  })

  describe('conquest', () => {
    it('adds mismatch modifier when conquered by foreign culture', () => {
      initCultureMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_CULTURE_CONFIG)
      ;(mocks.emit as ReturnType<typeof vi.fn>).mockClear()

      const handler = mocks.handlers.get('map:province-conquered')
      // cB conquers pA (which has cA culture)
      handler?.({
        provinceId:            makeProvinceId('pA'),
        newOwnerId:            makeCountryId('cB'),
        oldOwnerId:            makeCountryId('cA'),
        attackerStrengthLost:  0,
        defenderStrengthWiped: 0,
      })

      const calls = (mocks.emit as ReturnType<typeof vi.fn>).mock.calls
      const modAdded = calls.filter(([e]) => e === 'economy:province-modifier-added')
      expect(modAdded.length).toBe(1)
      const payload = modAdded[0]?.[1] as { modifier: { op: string; value: number; id: string } }
      expect(payload.modifier.op).toBe('multiply')
      expect(payload.modifier.value).toBe(DEFAULT_CULTURE_CONFIG.cultureMismatchModifier)
      expect(payload.modifier.id).toBe('culture-mismatch:pA')
    })

    it('resets assimilation progress on conquest', () => {
      // Set up a province mid-assimilation
      initCultureMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_CULTURE_CONFIG)

      // Manually advance assimilation progress
      const { culture } = mocks.stateStore.getState()
      mocks.stateStore['setState' as keyof typeof mocks.stateStore]?.((draft: GameState) => ({
        ...draft,
        culture: {
          ...draft.culture,
          provinces: {
            ...draft.culture.provinces,
            ['pA' as ProvinceId]: {
              ...culture.provinces['pA' as ProvinceId]!,
              assimilationProgress: 50,
            },
          },
        },
      }))

      const handler = mocks.handlers.get('map:province-conquered')
      handler?.({
        provinceId:            makeProvinceId('pA'),
        newOwnerId:            makeCountryId('cB'),
        oldOwnerId:            makeCountryId('cA'),
        attackerStrengthLost:  0,
        defenderStrengthWiped: 0,
      })

      const pCulture = mocks.stateStore.getSlice('culture').provinces['pA' as ProvinceId]
      expect(pCulture?.assimilationProgress).toBe(0)
    })

    it('does not add mismatch modifier when re-conquered by native owner', () => {
      initCultureMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_CULTURE_CONFIG)

      // First: cB conquers pA
      const handler = mocks.handlers.get('map:province-conquered')
      handler?.({
        provinceId:            makeProvinceId('pA'),
        newOwnerId:            makeCountryId('cB'),
        oldOwnerId:            makeCountryId('cA'),
        attackerStrengthLost:  0,
        defenderStrengthWiped: 0,
      })
      // Now cA reconquers pA — pA has cA culture, cA's native culture is cA → no mismatch
      ;(mocks.emit as ReturnType<typeof vi.fn>).mockClear()
      // Update map owner back to cA
      mocks.stateStore['setState' as keyof typeof mocks.stateStore]?.((draft: GameState) => ({
        ...draft,
        map: {
          ...draft.map,
          provinces: {
            ...draft.map.provinces,
            ['pA' as ProvinceId]: { ...draft.map.provinces['pA' as ProvinceId]!, countryId: makeCountryId('cB') },
          },
        },
      }))
      handler?.({
        provinceId:            makeProvinceId('pA'),
        newOwnerId:            makeCountryId('cA'),
        oldOwnerId:            makeCountryId('cB'),
        attackerStrengthLost:  0,
        defenderStrengthWiped: 0,
      })

      const calls = (mocks.emit as ReturnType<typeof vi.fn>).mock.calls
      const modAdded = calls.filter(([e]) => e === 'economy:province-modifier-added')
      // pA culture is cA's, new owner is cA → no new mismatch modifier
      expect(modAdded).toHaveLength(0)
    })
  })

  describe('assimilation tick', () => {
    it('does not tick on frame 0', () => {
      const mechanic = initCultureMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_CULTURE_CONFIG)
      // Conquer pA so there is a mismatch to assimilate
      const conquestHandler = mocks.handlers.get('map:province-conquered')
      conquestHandler?.({
        provinceId:            makeProvinceId('pA'),
        newOwnerId:            makeCountryId('cB'),
        oldOwnerId:            makeCountryId('cA'),
        attackerStrengthLost:  0,
        defenderStrengthWiped: 0,
      })
      // Manually update map to reflect new owner
      mocks.stateStore['setState' as keyof typeof mocks.stateStore]?.((draft: GameState) => ({
        ...draft,
        map: {
          ...draft.map,
          provinces: {
            ...draft.map.provinces,
            ['pA' as ProvinceId]: { ...draft.map.provinces['pA' as ProvinceId]!, countryId: makeCountryId('cB') },
          },
        },
      }))

      ;(mocks.emit as ReturnType<typeof vi.fn>).mockClear()
      mechanic.update({ frame: 0, deltaMs: 50, totalMs: 0 })
      const calls = (mocks.emit as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.filter(([e]) => e === 'culture:assimilation-progressed')).toHaveLength(0)
    })

    it('progresses assimilation on cycle frame', () => {
      const cfg = { ...DEFAULT_CULTURE_CONFIG, cycleFrames: 100, assimilationRatePerCycle: 5 }
      const mechanic = initCultureMechanic(mocks.eventBus, mocks.stateStore, cfg)

      // Conquer pA so there is a mismatch
      const conquestHandler = mocks.handlers.get('map:province-conquered')
      conquestHandler?.({
        provinceId:            makeProvinceId('pA'),
        newOwnerId:            makeCountryId('cB'),
        oldOwnerId:            makeCountryId('cA'),
        attackerStrengthLost:  0,
        defenderStrengthWiped: 0,
      })
      mocks.stateStore['setState' as keyof typeof mocks.stateStore]?.((draft: GameState) => ({
        ...draft,
        map: {
          ...draft.map,
          provinces: {
            ...draft.map.provinces,
            ['pA' as ProvinceId]: { ...draft.map.provinces['pA' as ProvinceId]!, countryId: makeCountryId('cB') },
          },
        },
      }))

      ;(mocks.emit as ReturnType<typeof vi.fn>).mockClear()
      mechanic.update({ frame: 100, deltaMs: 50, totalMs: 5000 })

      const progress = mocks.stateStore.getSlice('culture').provinces['pA' as ProvinceId]?.assimilationProgress
      expect(progress).toBe(5)

      const calls = (mocks.emit as ReturnType<typeof vi.fn>).mock.calls
      expect(calls.filter(([e]) => e === 'culture:assimilation-progressed').length).toBeGreaterThan(0)
    })

    it('converts culture and removes mismatch modifier when threshold reached', () => {
      const cfg = {
        ...DEFAULT_CULTURE_CONFIG,
        cycleFrames:              1,
        assimilationRatePerCycle: 100,
        assimilationThreshold:    100,
      }
      const mechanic = initCultureMechanic(mocks.eventBus, mocks.stateStore, cfg)

      const conquestHandler = mocks.handlers.get('map:province-conquered')
      conquestHandler?.({
        provinceId:            makeProvinceId('pA'),
        newOwnerId:            makeCountryId('cB'),
        oldOwnerId:            makeCountryId('cA'),
        attackerStrengthLost:  0,
        defenderStrengthWiped: 0,
      })
      mocks.stateStore['setState' as keyof typeof mocks.stateStore]?.((draft: GameState) => ({
        ...draft,
        map: {
          ...draft.map,
          provinces: {
            ...draft.map.provinces,
            ['pA' as ProvinceId]: { ...draft.map.provinces['pA' as ProvinceId]!, countryId: makeCountryId('cB') },
          },
        },
      }))

      ;(mocks.emit as ReturnType<typeof vi.fn>).mockClear()
      mechanic.update({ frame: 1, deltaMs: 50, totalMs: 50 })

      // Culture should have converted
      const { culture } = mocks.stateStore.getState()
      const pCulture = culture.provinces['pA' as ProvinceId]
      expect(pCulture?.cultureId).toBe(culture.countryCultures['cB' as CountryId])
      expect(pCulture?.assimilationProgress).toBe(0)

      const calls = (mocks.emit as ReturnType<typeof vi.fn>).mock.calls
      // Mismatch modifier removed
      const removed = calls.filter(([e]) => e === 'economy:province-modifier-removed')
      expect(removed.length).toBeGreaterThan(0)
      // province-converted emitted
      const converted = calls.filter(([e]) => e === 'culture:province-converted')
      expect(converted.length).toBe(1)
      expect(converted[0]?.[1]).toMatchObject({
        provinceId:   'pA',
        newCultureId: culture.countryCultures['cB' as CountryId],
      })
    })
  })

  describe('destroy', () => {
    it('unsubscribes from conquest events', () => {
      const { destroy } = initCultureMechanic(mocks.eventBus, mocks.stateStore, DEFAULT_CULTURE_CONFIG)
      destroy()
      expect(mocks.handlers.get('map:province-conquered')).toBeUndefined()
    })
  })
})
