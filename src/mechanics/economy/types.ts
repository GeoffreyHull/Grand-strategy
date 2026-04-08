// Internal types and helpers for the economy mechanic.
// Public-facing types live in src/contracts/mechanics/economy.ts.

import type { Province, ProvinceId, CountryId } from '@contracts/mechanics/map'
import type { Building, BuildingId, BuildingType } from '@contracts/mechanics/buildings'

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

export interface BuildingIncomeConfig {
  readonly farm: number
  readonly port: number
  readonly barracks: number
  readonly walls: number
}

export interface EconomyConfig {
  /** How many frames between income ticks (default 60 = 3 s at 20 Hz) */
  readonly cycleFrames: number
  /** Gold earned per province owned per income cycle */
  readonly baseProvinceIncome: number
  /** Additional gold per building type per income cycle */
  readonly buildingIncome: BuildingIncomeConfig
  /** Starting gold for every country */
  readonly startingGold: number
}

export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  cycleFrames:        60,
  baseProvinceIncome: 5,
  buildingIncome: {
    farm:     10,
    port:     15,
    barracks: 0,
    walls:    0,
  },
  startingGold: 50,
}

export function validateEconomyConfig(raw: unknown): EconomyConfig {
  if (!isRecord(raw)) throw new Error('economy config must be an object')

  assertPositiveFiniteNumber(raw['cycleFrames'],        'economy.cycleFrames')
  assertNonNegativeFiniteNumber(raw['baseProvinceIncome'], 'economy.baseProvinceIncome')
  assertNonNegativeFiniteNumber(raw['startingGold'],       'economy.startingGold')

  const bi = raw['buildingIncome']
  if (!isRecord(bi)) throw new Error('economy.buildingIncome must be an object')
  assertNonNegativeFiniteNumber(bi['farm'],     'economy.buildingIncome.farm')
  assertNonNegativeFiniteNumber(bi['port'],     'economy.buildingIncome.port')
  assertNonNegativeFiniteNumber(bi['barracks'], 'economy.buildingIncome.barracks')
  assertNonNegativeFiniteNumber(bi['walls'],    'economy.buildingIncome.walls')

  return {
    cycleFrames:        raw['cycleFrames']        as number,
    baseProvinceIncome: raw['baseProvinceIncome'] as number,
    startingGold:       raw['startingGold']       as number,
    buildingIncome: {
      farm:     bi['farm']     as number,
      port:     bi['port']     as number,
      barracks: bi['barracks'] as number,
      walls:    bi['walls']    as number,
    },
  }
}

/**
 * Compute how much income a country earns per cycle.
 * Income is based on provinces currently owned by that country, plus
 * bonuses from any buildings physically located in those provinces
 * (regardless of who built them — captured buildings benefit the new owner).
 */
export function computeCountryIncome(
  countryId: CountryId,
  provinces: Readonly<Record<ProvinceId, Province>>,
  buildings: Readonly<Record<BuildingId, Building>>,
  config: EconomyConfig,
): number {
  const ownedProvinceIds = new Set<ProvinceId>()
  for (const province of Object.values(provinces)) {
    if (province.countryId === countryId) ownedProvinceIds.add(province.id)
  }

  let income = ownedProvinceIds.size * config.baseProvinceIncome

  for (const building of Object.values(buildings)) {
    if (!ownedProvinceIds.has(building.provinceId)) continue
    const bonus = config.buildingIncome[building.buildingType as BuildingType] ?? 0
    income += bonus
  }

  return income
}
