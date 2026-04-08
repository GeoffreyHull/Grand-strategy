import { describe, it, expect, vi } from 'vitest'
import { buildEconomyState, initEconomyMechanic } from './index'
import { computeProvinceIncome, DEFAULT_ECONOMY_CONFIG, validateEconomyConfig } from './types'
import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { TickContext } from '../../engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId, Province, Country } from '@contracts/mechanics/map'
import type { IncomeModifier } from '@contracts/mechanics/economy'

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

function makeProvince(id: string, countryId: string, terrainType: Province['terrainType'] = 'plains'): Province {
  return { id: id as ProvinceId, name: id, countryId: countryId as CountryId, cells: [], isCoastal: false, terrainType }
}

function makeCountry(id: string, provinces: string[]): Country {
  return {
    id:               id as CountryId,
    name:             id,
    color:            '#000',
    provinceIds:      provinces as ProvinceId[],
    capitalProvinceId: provinces[0] as ProvinceId,
  }
}

function makeStateStore(provinces: Province[] = []) {
  const provinceMap = Object.fromEntries(provinces.map(p => [p.id, p])) as Record<ProvinceId, Province>
  const countryIds  = [...new Set(provinces.map(p => p.countryId))]
  const countryMap  = Object.fromEntries(
    countryIds.map(cId => [cId, makeCountry(cId, provinces.filter(p => p.countryId === cId).map(p => p.id))]),
  ) as Record<CountryId, Country>

  let state: GameState = {
    map: { provinces: provinceMap, countries: countryMap, selectedProvinceId: null, hoveredProvinceId: null, cellIndex: {} },
    buildings: { buildings: {} },
    economy:   buildEconomyState(),
  } as unknown as GameState

  return {
    getSlice: vi.fn(<K extends keyof GameState>(key: K) => state[key]),
    getState: vi.fn(() => state),
    setState: vi.fn((updater: (draft: GameState) => GameState) => { state = updater(state) }),
    subscribe: vi.fn(),
  } as unknown as StateStore<GameState>
}

function tick(frame: number): TickContext {
  return { frame, deltaMs: 50, totalMs: frame * 50 }
}

const cA = 'country-a' as CountryId
const cB = 'country-b' as CountryId
const pA1 = 'prov-a1' as ProvinceId
const pA2 = 'prov-a2' as ProvinceId
const pB1 = 'prov-b1' as ProvinceId

function flatMod(id: string, value: number, label = 'test', buildingType?: string): IncomeModifier {
  return { id, op: 'add', value, label, buildingType }
}
function multiplyMod(id: string, value: number, label = 'test', condition?: IncomeModifier['condition']): IncomeModifier {
  return { id, op: 'multiply', value, label, condition }
}

// ── computeProvinceIncome ─────────────────────────────────────────────────────

describe('computeProvinceIncome', () => {
  it('returns base income when there are no modifiers', () => {
    expect(computeProvinceIncome(5, [], [])).toBe(5)
  })

  it('adds flat province modifiers to base', () => {
    expect(computeProvinceIncome(5, [flatMod('f1', 10)], [])).toBe(15)
  })

  it('stacks multiple flat modifiers', () => {
    expect(computeProvinceIncome(5, [flatMod('f1', 10), flatMod('f2', 10)], [])).toBe(25)
  })

  it('applies a multiply modifier after flat adds', () => {
    // (5 + 10) × 1.10 = 16.5
    expect(computeProvinceIncome(5, [flatMod('f1', 10)], [multiplyMod('m1', 1.10)])).toBeCloseTo(16.5)
  })

  it('stacks multiple multiply modifiers', () => {
    // (5) × 1.10 × 1.05 = 5.775
    expect(computeProvinceIncome(5, [], [multiplyMod('m1', 1.10), multiplyMod('m2', 1.05)])).toBeCloseTo(5.775)
  })

  it('applies owner modifier without condition unconditionally', () => {
    expect(computeProvinceIncome(5, [], [flatMod('o1', 3)])).toBe(8)
  })

  it('applies conditional owner modifier when building is present', () => {
    const farmMod   = flatMod('farm-id', 10, 'Farm', 'farm')
    const techMod   = multiplyMod('tech-1', 1.10, 'Efficient Farming', { type: 'hasBuilding', buildingType: 'farm' })
    // (5 + 10) × 1.10 = 16.5
    expect(computeProvinceIncome(5, [farmMod], [techMod])).toBeCloseTo(16.5)
  })

  it('does NOT apply conditional owner modifier when building is absent', () => {
    const techMod = multiplyMod('tech-1', 1.10, 'Efficient Farming', { type: 'hasBuilding', buildingType: 'farm' })
    expect(computeProvinceIncome(5, [], [techMod])).toBe(5)
  })

  it('base 0 with multiplier stays 0', () => {
    expect(computeProvinceIncome(0, [], [multiplyMod('m1', 2)])).toBe(0)
  })
})

// ── validateEconomyConfig ─────────────────────────────────────────────────────

describe('validateEconomyConfig', () => {
  const VALID = { cycleFrames: 60, startingGold: 50, terrainIncome: { plains: 5, hills: 3 } }

  it('accepts a valid config', () => {
    expect(validateEconomyConfig(VALID)).toMatchObject({ cycleFrames: 60, startingGold: 50 })
  })

  it('throws when cycleFrames is zero', () => {
    expect(() => validateEconomyConfig({ ...VALID, cycleFrames: 0 })).toThrow('economy.cycleFrames')
  })

  it('throws when startingGold is negative', () => {
    expect(() => validateEconomyConfig({ ...VALID, startingGold: -1 })).toThrow('economy.startingGold')
  })

  it('throws when terrainIncome is missing', () => {
    const { terrainIncome: _, ...rest } = VALID
    expect(() => validateEconomyConfig(rest)).toThrow('economy.terrainIncome')
  })

  it('throws when a terrain income value is negative', () => {
    expect(() => validateEconomyConfig({ ...VALID, terrainIncome: { plains: -1 } })).toThrow('economy.terrainIncome.plains')
  })
})

// ── buildEconomyState ─────────────────────────────────────────────────────────

describe('buildEconomyState', () => {
  it('starts with empty provinces and countries', () => {
    expect(buildEconomyState()).toEqual({ provinces: {}, countries: {} })
  })
})

// ── initEconomyMechanic — initialisation ──────────────────────────────────────

describe('initEconomyMechanic — initialisation', () => {
  it('creates a ProvinceEconomy entry for each province', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA), makeProvince(pB1, cB)])
    initEconomyMechanic(bus, store)
    expect(store.getSlice('economy').provinces[pA1]).toBeDefined()
    expect(store.getSlice('economy').provinces[pB1]).toBeDefined()
  })

  it('sets baseIncome from terrainIncome config', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA, 'plains')])
    initEconomyMechanic(bus, store)
    expect(store.getSlice('economy').provinces[pA1].baseIncome).toBe(DEFAULT_ECONOMY_CONFIG.terrainIncome['plains'])
  })

  it('sets currentIncome to baseIncome with no modifiers', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA, 'mountains')])
    initEconomyMechanic(bus, store)
    const { baseIncome, currentIncome } = store.getSlice('economy').provinces[pA1]
    expect(currentIncome).toBe(baseIncome)
  })

  it('creates a CountryEconomy entry for each country', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA)])
    initEconomyMechanic(bus, store)
    expect(store.getSlice('economy').countries[cA]).toBeDefined()
  })

  it('sets starting gold from config', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA)])
    initEconomyMechanic(bus, store)
    expect(store.getSlice('economy').countries[cA].gold).toBe(DEFAULT_ECONOMY_CONFIG.startingGold)
  })

  it('starts with empty province and owner modifier lists', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA)])
    initEconomyMechanic(bus, store)
    expect(store.getSlice('economy').provinces[pA1].provinceModifiers).toHaveLength(0)
    expect(store.getSlice('economy').countries[cA].modifiers).toHaveLength(0)
  })
})

// ── economy:province-modifier-added ──────────────────────────────────────────

describe('initEconomyMechanic — economy:province-modifier-added', () => {
  it('adds the modifier to province modifiers', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA)])
    initEconomyMechanic(bus, store)

    bus.emit('economy:province-modifier-added', { provinceId: pA1, modifier: flatMod('farm-1', 10, 'Farm', 'farm') })

    expect(store.getSlice('economy').provinces[pA1].provinceModifiers).toHaveLength(1)
  })

  it('updates currentIncome to include the new flat modifier', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA, 'plains')])
    initEconomyMechanic(bus, store)

    const base = store.getSlice('economy').provinces[pA1].baseIncome
    bus.emit('economy:province-modifier-added', { provinceId: pA1, modifier: flatMod('farm-1', 10, 'Farm', 'farm') })

    expect(store.getSlice('economy').provinces[pA1].currentIncome).toBe(base + 10)
  })

  it('applies conditional owner modifier after farm is added', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA, 'plains')])
    initEconomyMechanic(bus, store)

    // Add tech modifier first (condition: hasBuilding farm) — shouldn't apply yet
    bus.emit('economy:owner-modifier-added', {
      countryId: cA,
      modifier:  multiplyMod('tech-1', 1.10, 'Efficient Farming', { type: 'hasBuilding', buildingType: 'farm' }),
    })
    const incomeBeforeFarm = store.getSlice('economy').provinces[pA1].currentIncome

    // Now add farm — condition is now met
    bus.emit('economy:province-modifier-added', { provinceId: pA1, modifier: flatMod('farm-1', 10, 'Farm', 'farm') })

    const incomeAfterFarm  = store.getSlice('economy').provinces[pA1].currentIncome
    const base = store.getSlice('economy').provinces[pA1].baseIncome
    // (base + 10) × 1.10
    expect(incomeAfterFarm).toBeCloseTo((base + 10) * 1.10)
    expect(incomeAfterFarm).toBeGreaterThan(incomeBeforeFarm)
  })
})

// ── economy:province-modifier-removed ────────────────────────────────────────

describe('initEconomyMechanic — economy:province-modifier-removed', () => {
  it('removes the modifier from province modifiers', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA)])
    initEconomyMechanic(bus, store)

    bus.emit('economy:province-modifier-added',   { provinceId: pA1, modifier: flatMod('farm-1', 10, 'Farm', 'farm') })
    bus.emit('economy:province-modifier-removed',  { provinceId: pA1, modifierId: 'farm-1' })

    expect(store.getSlice('economy').provinces[pA1].provinceModifiers).toHaveLength(0)
  })

  it('recalculates currentIncome after removal', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA, 'plains')])
    initEconomyMechanic(bus, store)

    const base = store.getSlice('economy').provinces[pA1].baseIncome
    bus.emit('economy:province-modifier-added',   { provinceId: pA1, modifier: flatMod('farm-1', 10, 'Farm', 'farm') })
    bus.emit('economy:province-modifier-removed',  { provinceId: pA1, modifierId: 'farm-1' })

    expect(store.getSlice('economy').provinces[pA1].currentIncome).toBe(base)
  })
})

// ── economy:owner-modifier-added ──────────────────────────────────────────────

describe('initEconomyMechanic — economy:owner-modifier-added', () => {
  it('adds the modifier to the country modifiers list', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA)])
    initEconomyMechanic(bus, store)

    bus.emit('economy:owner-modifier-added', { countryId: cA, modifier: multiplyMod('tech-1', 1.10, 'Tech') })

    expect(store.getSlice('economy').countries[cA].modifiers).toHaveLength(1)
  })

  it('recomputes all owned provinces when an unconditional owner modifier is added', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA, 'plains'), makeProvince(pA2, cA, 'hills')])
    initEconomyMechanic(bus, store)

    const baseA1 = store.getSlice('economy').provinces[pA1].baseIncome
    const baseA2 = store.getSlice('economy').provinces[pA2].baseIncome

    bus.emit('economy:owner-modifier-added', { countryId: cA, modifier: multiplyMod('tech-1', 2) })

    expect(store.getSlice('economy').provinces[pA1].currentIncome).toBe(baseA1 * 2)
    expect(store.getSlice('economy').provinces[pA2].currentIncome).toBe(baseA2 * 2)
  })

  it('does not affect provinces owned by a different country', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA), makeProvince(pB1, cB, 'plains')])
    initEconomyMechanic(bus, store)

    const bBefore = store.getSlice('economy').provinces[pB1].currentIncome
    bus.emit('economy:owner-modifier-added', { countryId: cA, modifier: multiplyMod('tech-1', 2) })

    expect(store.getSlice('economy').provinces[pB1].currentIncome).toBe(bBefore)
  })

  it('conditional modifier does not apply to provinces without the required building', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA, 'plains')])
    initEconomyMechanic(bus, store)

    const base = store.getSlice('economy').provinces[pA1].baseIncome
    bus.emit('economy:owner-modifier-added', {
      countryId: cA,
      modifier:  multiplyMod('tech-1', 1.10, 'Efficient Farming', { type: 'hasBuilding', buildingType: 'farm' }),
    })

    expect(store.getSlice('economy').provinces[pA1].currentIncome).toBe(base)
  })
})

// ── economy:owner-modifier-removed ───────────────────────────────────────────

describe('initEconomyMechanic — economy:owner-modifier-removed', () => {
  it('removes modifier from country and recomputes provinces', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA, 'plains')])
    initEconomyMechanic(bus, store)

    const base = store.getSlice('economy').provinces[pA1].baseIncome
    bus.emit('economy:owner-modifier-added',   { countryId: cA, modifier: multiplyMod('tech-1', 2) })
    bus.emit('economy:owner-modifier-removed', { countryId: cA, modifierId: 'tech-1' })

    expect(store.getSlice('economy').countries[cA].modifiers).toHaveLength(0)
    expect(store.getSlice('economy').provinces[pA1].currentIncome).toBe(base)
  })
})

// ── map:province-conquered ────────────────────────────────────────────────────

describe('initEconomyMechanic — map:province-conquered', () => {
  it('recomputes the conquered province with the new owner\'s modifiers', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA, 'plains'), makeProvince(pB1, cB)])
    initEconomyMechanic(bus, store)

    // Country B has a ×2 multiplier; Country A does not
    bus.emit('economy:owner-modifier-added', { countryId: cB, modifier: multiplyMod('tech-b', 2) })

    // Simulate conquest: pA1 changes owner to cB in map state
    store.setState(draft => ({
      ...draft,
      map: { ...draft.map, provinces: { ...draft.map.provinces, [pA1]: { ...draft.map.provinces[pA1], countryId: cB } } },
    }))

    bus.emit('map:province-conquered', { provinceId: pA1, newOwnerId: cB, oldOwnerId: cA })

    const base = store.getSlice('economy').provinces[pA1].baseIncome
    expect(store.getSlice('economy').provinces[pA1].currentIncome).toBe(base * 2)
  })

  it('province modifiers (buildings) are preserved after conquest', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA, 'plains'), makeProvince(pB1, cB)])
    initEconomyMechanic(bus, store)

    bus.emit('economy:province-modifier-added', { provinceId: pA1, modifier: flatMod('farm-1', 10, 'Farm', 'farm') })
    store.setState(draft => ({
      ...draft,
      map: { ...draft.map, provinces: { ...draft.map.provinces, [pA1]: { ...draft.map.provinces[pA1], countryId: cB } } },
    }))
    bus.emit('map:province-conquered', { provinceId: pA1, newOwnerId: cB, oldOwnerId: cA })

    expect(store.getSlice('economy').provinces[pA1].provinceModifiers).toHaveLength(1)
  })
})

// ── update — income tick ──────────────────────────────────────────────────────

describe('initEconomyMechanic — update', () => {
  it('adds province income to country gold at a cycle boundary', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA, 'plains')])
    const { update } = initEconomyMechanic(bus, store)

    const startGold = store.getSlice('economy').countries[cA].gold
    const income    = store.getSlice('economy').provinces[pA1].currentIncome
    update(tick(DEFAULT_ECONOMY_CONFIG.cycleFrames))

    expect(store.getSlice('economy').countries[cA].gold).toBe(startGold + income)
  })

  it('does not change gold at non-cycle frames', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA)])
    const { update } = initEconomyMechanic(bus, store)

    const startGold = store.getSlice('economy').countries[cA].gold
    update(tick(1))
    update(tick(DEFAULT_ECONOMY_CONFIG.cycleFrames - 1))
    expect(store.getSlice('economy').countries[cA].gold).toBe(startGold)
  })

  it('does not change gold at frame 0', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA)])
    const { update } = initEconomyMechanic(bus, store)

    const startGold = store.getSlice('economy').countries[cA].gold
    update(tick(0))
    expect(store.getSlice('economy').countries[cA].gold).toBe(startGold)
  })

  it('aggregates income from all owned provinces', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA, 'plains'), makeProvince(pA2, cA, 'hills')])
    const { update } = initEconomyMechanic(bus, store)

    const startGold  = store.getSlice('economy').countries[cA].gold
    const incA1      = store.getSlice('economy').provinces[pA1].currentIncome
    const incA2      = store.getSlice('economy').provinces[pA2].currentIncome
    update(tick(DEFAULT_ECONOMY_CONFIG.cycleFrames))

    expect(store.getSlice('economy').countries[cA].gold).toBe(startGold + incA1 + incA2)
  })

  it('emits economy:income-collected per country with positive income', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA, 'plains')])
    const { update } = initEconomyMechanic(bus, store)

    update(tick(DEFAULT_ECONOMY_CONFIG.cycleFrames))

    expect(bus.emit).toHaveBeenCalledWith('economy:income-collected', expect.objectContaining({
      countryId: cA,
      frame:     DEFAULT_ECONOMY_CONFIG.cycleFrames,
    }))
  })

  it('gold accumulates over multiple cycles', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA, 'plains')])
    const { update } = initEconomyMechanic(bus, store)

    const startGold = store.getSlice('economy').countries[cA].gold
    const income    = store.getSlice('economy').provinces[pA1].currentIncome
    update(tick(DEFAULT_ECONOMY_CONFIG.cycleFrames))
    update(tick(DEFAULT_ECONOMY_CONFIG.cycleFrames * 2))
    update(tick(DEFAULT_ECONOMY_CONFIG.cycleFrames * 3))

    expect(store.getSlice('economy').countries[cA].gold).toBe(startGold + income * 3)
  })
})

// ── destroy ───────────────────────────────────────────────────────────────────

describe('initEconomyMechanic — destroy', () => {
  it('stops responding to economy:province-modifier-added', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA)])
    const { destroy } = initEconomyMechanic(bus, store)
    const callsBefore = (store.setState as ReturnType<typeof vi.fn>).mock.calls.length
    destroy()
    bus.emit('economy:province-modifier-added', { provinceId: pA1, modifier: flatMod('f1', 10) })
    expect((store.setState as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })

  it('stops responding to economy:owner-modifier-added', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA)])
    const { destroy } = initEconomyMechanic(bus, store)
    const callsBefore = (store.setState as ReturnType<typeof vi.fn>).mock.calls.length
    destroy()
    bus.emit('economy:owner-modifier-added', { countryId: cA, modifier: multiplyMod('m1', 2) })
    expect((store.setState as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })

  it('stops responding to map:province-conquered', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore([makeProvince(pA1, cA), makeProvince(pB1, cB)])
    const { destroy } = initEconomyMechanic(bus, store)
    const callsBefore = (store.setState as ReturnType<typeof vi.fn>).mock.calls.length
    destroy()
    bus.emit('map:province-conquered', { provinceId: pA1, newOwnerId: cB, oldOwnerId: cA })
    expect((store.setState as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })
})
