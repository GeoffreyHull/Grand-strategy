import { describe, it, expect } from 'vitest'
import { validateMilitaryConfig, DEFAULT_MILITARY_CONFIG } from './types'

const VALID: unknown = { army: { durationTurns: 60, strength: 100, barracksStrengthBonus: 25, cost: 50 } }

describe('DEFAULT_MILITARY_CONFIG', () => {
  it('has positive durationTurns', () => {
    expect(DEFAULT_MILITARY_CONFIG.army.durationTurns).toBeGreaterThan(0)
  })
  it('has positive strength', () => {
    expect(DEFAULT_MILITARY_CONFIG.army.strength).toBeGreaterThan(0)
  })
  it('has positive cost', () => {
    expect(DEFAULT_MILITARY_CONFIG.army.cost).toBeGreaterThan(0)
  })
})

describe('validateMilitaryConfig', () => {
  it('returns a typed config for valid input', () => {
    const result = validateMilitaryConfig(VALID)
    expect(result.army.durationTurns).toBe(60)
    expect(result.army.strength).toBe(100)
  })

  it('throws on null', () => {
    expect(() => validateMilitaryConfig(null)).toThrow('military config must be an object')
  })
  it('throws on a string', () => {
    expect(() => validateMilitaryConfig('bad')).toThrow('military config must be an object')
  })
  it('throws on an array', () => {
    expect(() => validateMilitaryConfig([])).toThrow('military config must be an object')
  })
  it('throws when army key is missing', () => {
    expect(() => validateMilitaryConfig({})).toThrow('military.army must be an object')
  })
  it('throws when army is not an object', () => {
    expect(() => validateMilitaryConfig({ army: 42 })).toThrow('military.army must be an object')
  })

  it('throws when army.durationTurns is missing', () => {
    expect(() => validateMilitaryConfig({ army: { strength: 100 } })).toThrow('military.army.durationTurns')
  })
  it('throws when army.durationTurns is zero', () => {
    expect(() => validateMilitaryConfig({ army: { durationTurns: 0, strength: 100 } })).toThrow('military.army.durationTurns')
  })
  it('throws when army.durationTurns is negative', () => {
    expect(() => validateMilitaryConfig({ army: { durationTurns: -1, strength: 100 } })).toThrow('military.army.durationTurns')
  })
  it('throws when army.durationTurns is Infinity', () => {
    expect(() => validateMilitaryConfig({ army: { durationTurns: Infinity, strength: 100 } })).toThrow('military.army.durationTurns')
  })
  it('throws when army.durationTurns is NaN', () => {
    expect(() => validateMilitaryConfig({ army: { durationTurns: NaN, strength: 100 } })).toThrow('military.army.durationTurns')
  })
  it('throws when army.durationTurns is a string', () => {
    expect(() => validateMilitaryConfig({ army: { durationTurns: '60', strength: 100 } })).toThrow('military.army.durationTurns')
  })

  it('throws when army.strength is missing', () => {
    expect(() => validateMilitaryConfig({ army: { durationTurns: 60 } })).toThrow('military.army.strength')
  })
  it('throws when army.strength is zero', () => {
    expect(() => validateMilitaryConfig({ army: { durationTurns: 60, strength: 0 } })).toThrow('military.army.strength')
  })
  it('throws when army.strength is negative', () => {
    expect(() => validateMilitaryConfig({ army: { durationTurns: 60, strength: -5 } })).toThrow('military.army.strength')
  })

  it('error message includes the field path', () => {
    expect(() => validateMilitaryConfig({ army: { durationTurns: 0, strength: 100 } }))
      .toThrow('military.army.durationTurns must be a positive finite number')
  })

  it('accepts non-integer positive values', () => {
    const result = validateMilitaryConfig({ army: { durationTurns: 1.5, strength: 50.5, barracksStrengthBonus: 0.5, cost: 25.5 } })
    expect(result.army.durationTurns).toBe(1.5)
  })

  it('throws when army.cost is missing', () => {
    expect(() => validateMilitaryConfig({ army: { durationTurns: 60, strength: 100, barracksStrengthBonus: 25 } })).toThrow('military.army.cost')
  })
  it('throws when army.cost is zero', () => {
    expect(() => validateMilitaryConfig({ army: { durationTurns: 60, strength: 100, barracksStrengthBonus: 25, cost: 0 } })).toThrow('military.army.cost')
  })
  it('throws when army.cost is negative', () => {
    expect(() => validateMilitaryConfig({ army: { durationTurns: 60, strength: 100, barracksStrengthBonus: 25, cost: -10 } })).toThrow('military.army.cost')
  })
})
