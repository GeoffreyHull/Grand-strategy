// Internal types for the military mechanic.
// All public-facing game types live in src/contracts/mechanics/military.ts.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function assertPositiveFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number, got: ${String(value)}`)
  }
}

export interface ArmyConfig {
  readonly durationTurns: number
  readonly strength: number
  readonly barracksStrengthBonus: number
  readonly cost: number
}

export interface MilitaryConfig {
  readonly army: ArmyConfig
}

export const DEFAULT_MILITARY_CONFIG: MilitaryConfig = {
  army: { durationTurns: 60, strength: 100, barracksStrengthBonus: 25, cost: 50 },
}

export function validateMilitaryConfig(raw: unknown): MilitaryConfig {
  if (!isRecord(raw)) {
    throw new Error('military config must be an object')
  }
  const army = raw['army']
  if (!isRecord(army)) {
    throw new Error('military.army must be an object')
  }
  assertPositiveFiniteNumber(army['durationTurns'],        'military.army.durationTurns')
  assertPositiveFiniteNumber(army['strength'],              'military.army.strength')
  assertPositiveFiniteNumber(army['barracksStrengthBonus'], 'military.army.barracksStrengthBonus')
  assertPositiveFiniteNumber(army['cost'],                  'military.army.cost')
  return {
    army: {
      durationTurns:        army['durationTurns'] as number,
      strength:              army['strength'] as number,
      barracksStrengthBonus: army['barracksStrengthBonus'] as number,
      cost:                  army['cost'] as number,
    },
  }
}
