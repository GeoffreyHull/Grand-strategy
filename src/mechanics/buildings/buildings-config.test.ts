import { describe, it, expect } from 'vitest'
import { validateBuildingsConfig, DEFAULT_BUILDINGS_CONFIG } from './types'

const VALID_LIMITS = {
  plains:    { farm: 20, port: 3, barracks: 3, walls: 2 },
  hills:     { farm: 10, port: 2, barracks: 2, walls: 3 },
  mountains: { farm: 5,  port: 1, barracks: 2, walls: 4 },
  forest:    { farm: 8,  port: 2, barracks: 2, walls: 2 },
  desert:    { farm: 3,  port: 1, barracks: 1, walls: 2 },
  tundra:    { farm: 2,  port: 1, barracks: 1, walls: 2 },
  ocean:     { farm: 0,  port: 0, barracks: 0, walls: 0 },
}

const VALID: unknown = {
  buildings: {
    barracks: { durationFrames: 90,  goldCost: 50, incomeBonus: 0  },
    port:     { durationFrames: 120, goldCost: 75, incomeBonus: 15 },
    farm:     { durationFrames: 60,  goldCost: 30, incomeBonus: 10 },
    walls:    { durationFrames: 90,  goldCost: 60, incomeBonus: 0  },
  },
  limits: VALID_LIMITS,
}

describe('DEFAULT_BUILDINGS_CONFIG', () => {
  it('has a positive durationFrames for each building type', () => {
    for (const entry of Object.values(DEFAULT_BUILDINGS_CONFIG.buildings)) {
      expect(entry.durationFrames).toBeGreaterThan(0)
    }
  })

  it('has a non-negative goldCost for each building type', () => {
    for (const entry of Object.values(DEFAULT_BUILDINGS_CONFIG.buildings)) {
      expect(entry.goldCost).toBeGreaterThanOrEqual(0)
    }
  })

  it('has a non-negative incomeBonus for each building type', () => {
    for (const entry of Object.values(DEFAULT_BUILDINGS_CONFIG.buildings)) {
      expect(entry.incomeBonus).toBeGreaterThanOrEqual(0)
    }
  })

  it('covers all four building types', () => {
    const keys = Object.keys(DEFAULT_BUILDINGS_CONFIG.buildings).sort()
    expect(keys).toEqual(['barracks', 'farm', 'port', 'walls'])
  })

  it('has limits for all terrain types', () => {
    const terrains = ['plains', 'hills', 'mountains', 'forest', 'desert', 'tundra', 'ocean']
    for (const terrain of terrains) {
      expect(DEFAULT_BUILDINGS_CONFIG.limits[terrain]).toBeDefined()
    }
  })
})

describe('validateBuildingsConfig', () => {
  it('returns a typed config for valid input', () => {
    const result = validateBuildingsConfig(VALID)
    expect(result.buildings.barracks.durationFrames).toBe(90)
    expect(result.buildings.port.durationFrames).toBe(120)
    expect(result.buildings.barracks.goldCost).toBe(50)
    expect(result.buildings.port.goldCost).toBe(75)
    expect(result.buildings.farm.incomeBonus).toBe(10)
    expect(result.buildings.port.incomeBonus).toBe(15)
  })

  it('throws on null',     () => { expect(() => validateBuildingsConfig(null)).toThrow('buildings config must be an object') })
  it('throws on a string', () => { expect(() => validateBuildingsConfig('bad')).toThrow('buildings config must be an object') })

  it('throws when buildings key is missing', () => {
    expect(() => validateBuildingsConfig({ limits: VALID_LIMITS })).toThrow('buildings.buildings must be an object')
  })

  it('throws when limits key is missing', () => {
    expect(() => validateBuildingsConfig({ buildings: (VALID as Record<string, unknown>)['buildings'] }))
      .toThrow('buildings.limits must be an object')
  })

  it('throws when a known building type key is missing', () => {
    const missing = { buildings: { barracks: { durationFrames: 90, goldCost: 50, incomeBonus: 0 }, port: { durationFrames: 120, goldCost: 75, incomeBonus: 15 }, farm: { durationFrames: 60, goldCost: 30, incomeBonus: 10 } }, limits: VALID_LIMITS }
    expect(() => validateBuildingsConfig(missing)).toThrow('buildings.buildings.walls')
  })

  it('throws when a building entry is not an object', () => {
    const bad = { buildings: { barracks: 90, port: { durationFrames: 120, goldCost: 75, incomeBonus: 15 }, farm: { durationFrames: 60, goldCost: 30, incomeBonus: 10 }, walls: { durationFrames: 90, goldCost: 60, incomeBonus: 0 } }, limits: VALID_LIMITS }
    expect(() => validateBuildingsConfig(bad)).toThrow('buildings.buildings.barracks must be an object')
  })

  it('throws when durationFrames is zero', () => {
    const bad = { buildings: { barracks: { durationFrames: 0, goldCost: 50, incomeBonus: 0 }, port: { durationFrames: 120, goldCost: 75, incomeBonus: 15 }, farm: { durationFrames: 60, goldCost: 30, incomeBonus: 10 }, walls: { durationFrames: 90, goldCost: 60, incomeBonus: 0 } }, limits: VALID_LIMITS }
    expect(() => validateBuildingsConfig(bad)).toThrow('buildings.buildings.barracks.durationFrames')
  })

  it('throws when durationFrames is negative', () => {
    const bad = { buildings: { barracks: { durationFrames: 90, goldCost: 50, incomeBonus: 0 }, port: { durationFrames: -1, goldCost: 75, incomeBonus: 15 }, farm: { durationFrames: 60, goldCost: 30, incomeBonus: 10 }, walls: { durationFrames: 90, goldCost: 60, incomeBonus: 0 } }, limits: VALID_LIMITS }
    expect(() => validateBuildingsConfig(bad)).toThrow('buildings.buildings.port.durationFrames')
  })

  it('throws when goldCost is negative', () => {
    const bad = { buildings: { barracks: { durationFrames: 90, goldCost: -1, incomeBonus: 0 }, port: { durationFrames: 120, goldCost: 75, incomeBonus: 15 }, farm: { durationFrames: 60, goldCost: 30, incomeBonus: 10 }, walls: { durationFrames: 90, goldCost: 60, incomeBonus: 0 } }, limits: VALID_LIMITS }
    expect(() => validateBuildingsConfig(bad)).toThrow('buildings.buildings.barracks.goldCost')
  })

  it('throws when goldCost is missing', () => {
    const bad = { buildings: { barracks: { durationFrames: 90, incomeBonus: 0 }, port: { durationFrames: 120, goldCost: 75, incomeBonus: 15 }, farm: { durationFrames: 60, goldCost: 30, incomeBonus: 10 }, walls: { durationFrames: 90, goldCost: 60, incomeBonus: 0 } }, limits: VALID_LIMITS }
    expect(() => validateBuildingsConfig(bad)).toThrow('buildings.buildings.barracks.goldCost')
  })

  it('throws when incomeBonus is negative', () => {
    const bad = { buildings: { barracks: { durationFrames: 90, goldCost: 50, incomeBonus: 0 }, port: { durationFrames: 120, goldCost: 75, incomeBonus: -1 }, farm: { durationFrames: 60, goldCost: 30, incomeBonus: 10 }, walls: { durationFrames: 90, goldCost: 60, incomeBonus: 0 } }, limits: VALID_LIMITS }
    expect(() => validateBuildingsConfig(bad)).toThrow('buildings.buildings.port.incomeBonus')
  })

  it('throws when a terrain limits entry is missing', () => {
    const badLimits = { ...VALID_LIMITS, plains: undefined }
    const bad = { buildings: (VALID as Record<string, unknown>)['buildings'], limits: badLimits }
    expect(() => validateBuildingsConfig(bad)).toThrow('buildings.limits.plains')
  })

  it('throws when a limit value is negative', () => {
    const badLimits = { ...VALID_LIMITS, plains: { farm: -1, port: 3, barracks: 3, walls: 2 } }
    const bad = { buildings: (VALID as Record<string, unknown>)['buildings'], limits: badLimits }
    expect(() => validateBuildingsConfig(bad)).toThrow('buildings.limits.plains.farm')
  })

  it('accepts custom durations and bonuses', () => {
    const custom = {
      buildings: { barracks: { durationFrames: 1, goldCost: 0, incomeBonus: 0 }, port: { durationFrames: 999, goldCost: 100, incomeBonus: 20 }, farm: { durationFrames: 5, goldCost: 10, incomeBonus: 5 }, walls: { durationFrames: 200, goldCost: 40, incomeBonus: 0 } },
      limits: VALID_LIMITS,
    }
    const result = validateBuildingsConfig(custom)
    expect(result.buildings.port.durationFrames).toBe(999)
    expect(result.buildings.port.goldCost).toBe(100)
    expect(result.buildings.port.incomeBonus).toBe(20)
  })
})
