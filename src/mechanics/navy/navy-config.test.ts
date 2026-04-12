import { describe, it, expect } from 'vitest'
import { validateNavyConfig, DEFAULT_NAVY_CONFIG } from './types'

const VALID: unknown = { fleet: { durationTurns: 120, ships: 3 } }

describe('DEFAULT_NAVY_CONFIG', () => {
  it('has positive durationTurns', () => {
    expect(DEFAULT_NAVY_CONFIG.fleet.durationTurns).toBeGreaterThan(0)
  })
  it('has positive ships', () => {
    expect(DEFAULT_NAVY_CONFIG.fleet.ships).toBeGreaterThan(0)
  })
})

describe('validateNavyConfig', () => {
  it('returns a typed config for valid input', () => {
    const result = validateNavyConfig(VALID)
    expect(result.fleet.durationTurns).toBe(120)
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

  it('throws when fleet.durationTurns is missing', () => {
    expect(() => validateNavyConfig({ fleet: { ships: 3 } })).toThrow('navy.fleet.durationTurns')
  })
  it('throws when fleet.durationTurns is zero', () => {
    expect(() => validateNavyConfig({ fleet: { durationTurns: 0, ships: 3 } })).toThrow('navy.fleet.durationTurns')
  })
  it('throws when fleet.durationTurns is negative', () => {
    expect(() => validateNavyConfig({ fleet: { durationTurns: -1, ships: 3 } })).toThrow('navy.fleet.durationTurns')
  })
  it('throws when fleet.durationTurns is Infinity', () => {
    expect(() => validateNavyConfig({ fleet: { durationTurns: Infinity, ships: 3 } })).toThrow('navy.fleet.durationTurns')
  })
  it('throws when fleet.durationTurns is a string', () => {
    expect(() => validateNavyConfig({ fleet: { durationTurns: '120', ships: 3 } })).toThrow('navy.fleet.durationTurns')
  })

  it('throws when fleet.ships is missing', () => {
    expect(() => validateNavyConfig({ fleet: { durationTurns: 120 } })).toThrow('navy.fleet.ships')
  })
  it('throws when fleet.ships is zero', () => {
    expect(() => validateNavyConfig({ fleet: { durationTurns: 120, ships: 0 } })).toThrow('navy.fleet.ships')
  })
  it('throws when fleet.ships is negative', () => {
    expect(() => validateNavyConfig({ fleet: { durationTurns: 120, ships: -2 } })).toThrow('navy.fleet.ships')
  })

  it('error message includes the field path', () => {
    expect(() => validateNavyConfig({ fleet: { durationTurns: 0, ships: 3 } }))
      .toThrow('navy.fleet.durationTurns must be a positive finite number')
  })
})
