import { describe, it, expect } from 'vitest'
import { validateBuildingsConfig, DEFAULT_BUILDINGS_CONFIG } from './types'

const VALID: unknown = {
  buildings: {
    barracks: { durationFrames: 90 },
    port:     { durationFrames: 120 },
    farm:     { durationFrames: 60 },
    walls:    { durationFrames: 90 },
  },
}

describe('DEFAULT_BUILDINGS_CONFIG', () => {
  it('has a positive durationFrames for each building type', () => {
    for (const entry of Object.values(DEFAULT_BUILDINGS_CONFIG.buildings)) {
      expect(entry.durationFrames).toBeGreaterThan(0)
    }
  })
  it('covers all four building types', () => {
    const keys = Object.keys(DEFAULT_BUILDINGS_CONFIG.buildings).sort()
    expect(keys).toEqual(['barracks', 'farm', 'port', 'walls'])
  })
})

describe('validateBuildingsConfig', () => {
  it('returns a typed config for valid input', () => {
    const result = validateBuildingsConfig(VALID)
    expect(result.buildings.barracks.durationFrames).toBe(90)
    expect(result.buildings.port.durationFrames).toBe(120)
    expect(result.buildings.farm.durationFrames).toBe(60)
    expect(result.buildings.walls.durationFrames).toBe(90)
  })

  it('throws on null', () => {
    expect(() => validateBuildingsConfig(null)).toThrow('buildings config must be an object')
  })
  it('throws on a string', () => {
    expect(() => validateBuildingsConfig('bad')).toThrow('buildings config must be an object')
  })
  it('throws when buildings key is missing', () => {
    expect(() => validateBuildingsConfig({})).toThrow('buildings.buildings must be an object')
  })
  it('throws when buildings is not an object', () => {
    expect(() => validateBuildingsConfig({ buildings: [] })).toThrow('buildings.buildings must be an object')
  })

  it('throws when a known type key is missing', () => {
    const missing = { buildings: { barracks: { durationFrames: 90 }, port: { durationFrames: 120 }, farm: { durationFrames: 60 } } }
    expect(() => validateBuildingsConfig(missing)).toThrow('buildings.buildings.walls')
  })

  it('throws when a building entry is not an object', () => {
    const bad = { buildings: { barracks: 90, port: { durationFrames: 120 }, farm: { durationFrames: 60 }, walls: { durationFrames: 90 } } }
    expect(() => validateBuildingsConfig(bad)).toThrow('buildings.buildings.barracks must be an object')
  })

  it('throws when durationFrames is zero for a building type', () => {
    const bad = { buildings: { barracks: { durationFrames: 0 }, port: { durationFrames: 120 }, farm: { durationFrames: 60 }, walls: { durationFrames: 90 } } }
    expect(() => validateBuildingsConfig(bad)).toThrow('buildings.buildings.barracks.durationFrames')
  })

  it('throws when durationFrames is negative for a building type', () => {
    const bad = { buildings: { barracks: { durationFrames: 90 }, port: { durationFrames: -1 }, farm: { durationFrames: 60 }, walls: { durationFrames: 90 } } }
    expect(() => validateBuildingsConfig(bad)).toThrow('buildings.buildings.port.durationFrames')
  })

  it('throws when durationFrames is a string', () => {
    const bad = { buildings: { barracks: { durationFrames: '90' }, port: { durationFrames: 120 }, farm: { durationFrames: 60 }, walls: { durationFrames: 90 } } }
    expect(() => validateBuildingsConfig(bad)).toThrow('buildings.buildings.barracks.durationFrames')
  })

  it('error message includes the exact field path', () => {
    const bad = { buildings: { barracks: { durationFrames: 0 }, port: { durationFrames: 120 }, farm: { durationFrames: 60 }, walls: { durationFrames: 90 } } }
    expect(() => validateBuildingsConfig(bad))
      .toThrow('buildings.buildings.barracks.durationFrames must be a positive finite number')
  })

  it('accepts custom durations', () => {
    const custom = { buildings: { barracks: { durationFrames: 1 }, port: { durationFrames: 999 }, farm: { durationFrames: 5 }, walls: { durationFrames: 200 } } }
    const result = validateBuildingsConfig(custom)
    expect(result.buildings.port.durationFrames).toBe(999)
  })
})
