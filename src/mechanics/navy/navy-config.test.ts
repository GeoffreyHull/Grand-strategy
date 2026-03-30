import { describe, it, expect } from 'vitest'
import { validateNavyConfig, DEFAULT_NAVY_CONFIG } from './types'

const VALID: unknown = { fleet: { durationFrames: 120, ships: 3 } }

describe('DEFAULT_NAVY_CONFIG', () => {
  it('has positive durationFrames', () => {
    expect(DEFAULT_NAVY_CONFIG.fleet.durationFrames).toBeGreaterThan(0)
  })
  it('has positive ships', () => {
    expect(DEFAULT_NAVY_CONFIG.fleet.ships).toBeGreaterThan(0)
  })
})

describe('validateNavyConfig', () => {
  it('returns a typed config for valid input', () => {
    const result = validateNavyConfig(VALID)
    expect(result.fleet.durationFrames).toBe(120)
    expect(result.fleet.ships).toBe(3)
  })

  it('throws on null', () => {
    expect(() => validateNavyConfig(null)).toThrow('navy config must be an object')
  })
  it('throws on a string', () => {
    expect(() => validateNavyConfig('bad')).toThrow('navy config must be an object')
  })
  it('throws on an array', () => {
    expect(() => validateNavyConfig([])).toThrow('navy config must be an object')
  })
  it('throws when fleet key is missing', () => {
    expect(() => validateNavyConfig({})).toThrow('navy.fleet must be an object')
  })
  it('throws when fleet is not an object', () => {
    expect(() => validateNavyConfig({ fleet: 'bad' })).toThrow('navy.fleet must be an object')
  })

  it('throws when fleet.durationFrames is missing', () => {
    expect(() => validateNavyConfig({ fleet: { ships: 3 } })).toThrow('navy.fleet.durationFrames')
  })
  it('throws when fleet.durationFrames is zero', () => {
    expect(() => validateNavyConfig({ fleet: { durationFrames: 0, ships: 3 } })).toThrow('navy.fleet.durationFrames')
  })
  it('throws when fleet.durationFrames is negative', () => {
    expect(() => validateNavyConfig({ fleet: { durationFrames: -1, ships: 3 } })).toThrow('navy.fleet.durationFrames')
  })
  it('throws when fleet.durationFrames is Infinity', () => {
    expect(() => validateNavyConfig({ fleet: { durationFrames: Infinity, ships: 3 } })).toThrow('navy.fleet.durationFrames')
  })
  it('throws when fleet.durationFrames is a string', () => {
    expect(() => validateNavyConfig({ fleet: { durationFrames: '120', ships: 3 } })).toThrow('navy.fleet.durationFrames')
  })

  it('throws when fleet.ships is missing', () => {
    expect(() => validateNavyConfig({ fleet: { durationFrames: 120 } })).toThrow('navy.fleet.ships')
  })
  it('throws when fleet.ships is zero', () => {
    expect(() => validateNavyConfig({ fleet: { durationFrames: 120, ships: 0 } })).toThrow('navy.fleet.ships')
  })
  it('throws when fleet.ships is negative', () => {
    expect(() => validateNavyConfig({ fleet: { durationFrames: 120, ships: -2 } })).toThrow('navy.fleet.ships')
  })

  it('error message includes the field path', () => {
    expect(() => validateNavyConfig({ fleet: { durationFrames: 0, ships: 3 } }))
      .toThrow('navy.fleet.durationFrames must be a positive finite number')
  })
})
