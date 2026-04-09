import type { BuildingType } from '@contracts/mechanics/buildings'

export function isBuildingType(value: unknown): value is BuildingType {
  return (
    value === 'barracks' ||
    value === 'port'     ||
    value === 'farm'     ||
    value === 'walls'
  )
}

// ── Config types ──────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function assertPositiveFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number, got: ${String(value)}`)
  }
}

function assertNonNegativeInteger(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`${path} must be a non-negative integer, got: ${String(value)}`)
  }
}

export interface BuildingTypeConfig {
  readonly durationFrames: number
  /** Upfront gold cost paid when construction is requested */
  readonly goldCost: number
  /** Gold added to province income per cycle when this building is present */
  readonly incomeBonus: number
}

export interface TerrainBuildingLimits {
  readonly farm:     number
  readonly port:     number
  readonly barracks: number
  readonly walls:    number
}

export interface BuildingsConfig {
  readonly buildings: Readonly<Record<BuildingType, BuildingTypeConfig>>
  /** Maximum number of each building type per province, keyed by terrain type */
  readonly limits: Readonly<Record<string, TerrainBuildingLimits>>
}

export const DEFAULT_BUILDINGS_CONFIG: BuildingsConfig = {
  buildings: {
    barracks: { durationFrames: 90,  goldCost: 50, incomeBonus: 0  },
    port:     { durationFrames: 120, goldCost: 75, incomeBonus: 15 },
    farm:     { durationFrames: 60,  goldCost: 30, incomeBonus: 10 },
    walls:    { durationFrames: 90,  goldCost: 60, incomeBonus: 0  },
  },
  limits: {
    plains:    { farm: 20, port: 3, barracks: 3, walls: 2 },
    hills:     { farm: 10, port: 2, barracks: 2, walls: 3 },
    mountains: { farm: 5,  port: 1, barracks: 2, walls: 4 },
    forest:    { farm: 8,  port: 2, barracks: 2, walls: 2 },
    desert:    { farm: 3,  port: 1, barracks: 1, walls: 2 },
    tundra:    { farm: 2,  port: 1, barracks: 1, walls: 2 },
    ocean:     { farm: 0,  port: 0, barracks: 0, walls: 0 },
  },
}

/** Kept for backward compatibility with existing tests. */
export const BUILDING_DURATIONS: Readonly<Record<BuildingType, number>> = {
  barracks: 90,
  port:     120,
  farm:      60,
  walls:     90,
}

const KNOWN_BUILDING_TYPES: readonly BuildingType[] = ['barracks', 'port', 'farm', 'walls']
const KNOWN_TERRAIN_TYPES = ['plains', 'hills', 'mountains', 'forest', 'desert', 'tundra', 'ocean'] as const

function validateTerrainLimits(raw: unknown, path: string): TerrainBuildingLimits {
  if (!isRecord(raw)) throw new Error(`${path} must be an object`)
  assertNonNegativeInteger(raw['farm'],     `${path}.farm`)
  assertNonNegativeInteger(raw['port'],     `${path}.port`)
  assertNonNegativeInteger(raw['barracks'], `${path}.barracks`)
  assertNonNegativeInteger(raw['walls'],    `${path}.walls`)
  return {
    farm:     raw['farm']     as number,
    port:     raw['port']     as number,
    barracks: raw['barracks'] as number,
    walls:    raw['walls']    as number,
  }
}

export function validateBuildingsConfig(raw: unknown): BuildingsConfig {
  if (!isRecord(raw)) throw new Error('buildings config must be an object')

  const buildings = raw['buildings']
  if (!isRecord(buildings)) throw new Error('buildings.buildings must be an object')

  const resultBuildings: Record<string, BuildingTypeConfig> = {}
  for (const type of KNOWN_BUILDING_TYPES) {
    const entry = buildings[type]
    if (!isRecord(entry)) throw new Error(`buildings.buildings.${type} must be an object`)
    assertPositiveFiniteNumber(entry['durationFrames'], `buildings.buildings.${type}.durationFrames`)
    assertNonNegativeInteger(entry['goldCost']    as unknown, `buildings.buildings.${type}.goldCost`)
    assertNonNegativeInteger(entry['incomeBonus'] as unknown, `buildings.buildings.${type}.incomeBonus`)
    resultBuildings[type] = {
      durationFrames: entry['durationFrames'] as number,
      goldCost:       entry['goldCost']       as number,
      incomeBonus:    entry['incomeBonus']    as number,
    }
  }

  const limits = raw['limits']
  if (!isRecord(limits)) throw new Error('buildings.limits must be an object')

  const resultLimits: Record<string, TerrainBuildingLimits> = {}
  for (const terrain of KNOWN_TERRAIN_TYPES) {
    resultLimits[terrain] = validateTerrainLimits(limits[terrain], `buildings.limits.${terrain}`)
  }

  return {
    buildings: resultBuildings as Record<BuildingType, BuildingTypeConfig>,
    limits:    resultLimits,
  }
}
