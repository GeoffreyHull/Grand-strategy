import type { BuildingType } from '@contracts/mechanics/buildings'

export function isBuildingType(value: unknown): value is BuildingType {
  return (
    value === 'barracks' ||
    value === 'port' ||
    value === 'farm' ||
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

export interface BuildingTypeConfig {
  readonly durationFrames: number
}

export interface BuildingsConfig {
  readonly buildings: Readonly<Record<BuildingType, BuildingTypeConfig>>
}

export const DEFAULT_BUILDINGS_CONFIG: BuildingsConfig = {
  buildings: {
    barracks: { durationFrames: 90 },
    port:     { durationFrames: 120 },
    farm:     { durationFrames: 60 },
    walls:    { durationFrames: 90 },
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

export function validateBuildingsConfig(raw: unknown): BuildingsConfig {
  if (!isRecord(raw)) {
    throw new Error('buildings config must be an object')
  }
  const buildings = raw['buildings']
  if (!isRecord(buildings)) {
    throw new Error('buildings.buildings must be an object')
  }
  const result: Record<string, BuildingTypeConfig> = {}
  for (const type of KNOWN_BUILDING_TYPES) {
    const entry = buildings[type]
    if (!isRecord(entry)) {
      throw new Error(`buildings.buildings.${type} must be an object`)
    }
    assertPositiveFiniteNumber(entry['durationFrames'], `buildings.buildings.${type}.durationFrames`)
    result[type] = { durationFrames: entry['durationFrames'] as number }
  }
  return { buildings: result as Record<BuildingType, BuildingTypeConfig> }
}
