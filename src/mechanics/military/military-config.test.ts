import { describe, it, expect } from 'vitest'
import { validateMilitaryConfig, DEFAULT_MILITARY_CONFIG } from './types'

const VALID: unknown = { army: { durationFrames: 60, strength: 100, barracksStrengthBonus: 25 } }

describe('DEFAULT_MILITARY_CONFIG', () => {
  it('has positive durationFrames', () => {
    expect(DEFAULT_MILITARY_CONFIG.army.durationFrames).toBeGreaterThan(0)
  })
  it('has positive strength', () => {
    expect(DEFAULT_MILITARY_CONFIG.army.strength).toBeGreaterThan(0)
  })
})

describe('validateMilitaryConfig', () => {
  it('returns a typed config for valid input', () => {
    const result = validateMilitaryConfig(VALID)
    expect(result.army.durationFrames).toBe(60)
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

  it('throws when army.durationFrames is missing', () => {
    expect(() => validateMilitaryConfig({ army: { strength: 100 } })).toThrow('military.army.durationFrames')
  })
  it('throws when army.durationFrames is zero', () => {
    expect(() => validateMilitaryConfig({ army: { durationFrames: 0, strength: 100 } })).toThrow('military.army.durationFrames')
  })
  it('throws when army.durationFrames is negative', () => {
    expect(() => validateMilitaryConfig({ army: { durationFrames: -1, strength: 100 } })).toThrow('military.army.durationFrames')
  })
  it('throws when army.durationFrames is Infinity', () => {
    expect(() => validateMilitaryConfig({ army: { durationFrames: Infinity, strength: 100 } })).toThrow('military.army.durationFrames')
  })
  it('throws when army.durationFrames is NaN', () => {
    expect(() => validateMilitaryConfig({ army: { durationFrames: NaN, strength: 100 } })).toThrow('military.army.durationFrames')
  })
  it('throws when army.durationFrames is a string', () => {
    expect(() => validateMilitaryConfig({ army: { durationFrames: '60', strength: 100 } })).toThrow('military.army.durationFrames')
  })

  it('throws when army.strength is missing', () => {
    expect(() => validateMilitaryConfig({ army: { durationFrames: 60 } })).toThrow('military.army.strength')
  })
  it('throws when army.strength is zero', () => {
    expect(() => validateMilitaryConfig({ army: { durationFrames: 60, strength: 0 } })).toThrow('military.army.strength')
  })
  it('throws when army.strength is negative', () => {
    expect(() => validateMilitaryConfig({ army: { durationFrames: 60, strength: -5 } })).toThrow('military.army.strength')
  })

  it('error message includes the field path', () => {
    expect(() => validateMilitaryConfig({ army: { durationFrames: 0, strength: 100 } }))
      .toThrow('military.army.durationFrames must be a positive finite number')
  })

  it('accepts non-integer positive values', () => {
    const result = validateMilitaryConfig({ army: { durationFrames: 1.5, strength: 50.5, barracksStrengthBonus: 0.5 } })
    expect(result.army.durationFrames).toBe(1.5)
  })
})
