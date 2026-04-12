// Internal types and helpers for the economy mechanic.
// Public-facing types live in src/contracts/mechanics/economy.ts.

import type { IncomeModifier } from '@contracts/mechanics/economy'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function assertPositiveFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number, got: ${String(value)}`)
  }
}

function assertNonNegativeFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${path} must be a non-negative finite number, got: ${String(value)}`)
  }
}

export interface EconomyConfig {
  /** Starting gold for every country */
  readonly startingGold: number
  /** Base income per terrain type per turn */
  readonly terrainIncome: Readonly<Record<string, number>>
}

export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  startingGold:  50,
  terrainIncome: {
    plains:    5,
    hills:     3,
    mountains: 1,
    forest:    4,
    desert:    2,
    tundra:    1,
    ocean:     0,
  },
}

export function validateEconomyConfig(raw: unknown): EconomyConfig {
  if (!isRecord(raw)) throw new Error('economy config must be an object')

  assertNonNegativeFiniteNumber(raw['startingGold'], 'economy.startingGold')

  const ti = raw['terrainIncome']
  if (!isRecord(ti)) throw new Error('economy.terrainIncome must be an object')
  const terrainIncome: Record<string, number> = {}
  for (const [terrain, value] of Object.entries(ti)) {
    assertNonNegativeFiniteNumber(value, `economy.terrainIncome.${terrain}`)
    terrainIncome[terrain] = value as number
  }

  return {
    startingGold:  raw['startingGold']  as number,
    terrainIncome,
  }
}

/**
 * Apply the two-layer modifier pipeline to compute a province's current income.
 *
 * Pipeline order:
 *   1. base terrain income
 *   2. + flat 'add' modifiers (province-bound + applicable owner-bound)
 *   3. × 'multiply' modifiers (province-bound + applicable owner-bound)
 *
 * Owner modifiers with a `condition` are only applied when that condition is
 * satisfied by the province's own modifiers (e.g. province has a farm).
 */
export function computeProvinceIncome(
  base: number,
  provinceModifiers: readonly IncomeModifier[],
  ownerModifiers: readonly IncomeModifier[],
): number {
  // Derive which building types are present from province modifiers.
  // Building-sourced modifiers carry a `buildingType` field for this purpose.
  const presentBuildingTypes = new Set(
    provinceModifiers
      .filter(m => m.buildingType !== undefined)
      .map(m => m.buildingType as string),
  )

  const applicableOwner = ownerModifiers.filter(m => {
    if (!m.condition) return true
    if (m.condition.type === 'hasBuilding') {
      return presentBuildingTypes.has(m.condition.buildingType)
    }
    return false
  })

  const all = [...provinceModifiers, ...applicableOwner]

  const flatSum = all
    .filter(m => m.op === 'add')
    .reduce((sum, m) => sum + m.value, 0)

  const multiplier = all
    .filter(m => m.op === 'multiply')
    .reduce((product, m) => product * m.value, 1)

  return (base + flatSum) * multiplier
}
