import type { TerrainType } from '@contracts/mechanics/map'

export interface PopulationConfig {
  /** Initial population per terrain type when the map first loads. */
  readonly initialPopulationByTerrain: Readonly<Record<TerrainType | string, number>>
  /** Maximum sustainable population per terrain type (base capacity). */
  readonly capacityByTerrain: Readonly<Record<TerrainType | string, number>>
  /**
   * Logistic growth rate per turn — fraction of remaining headroom added.
   * e.g. 0.01 = 1% of (capacity - count) added each turn.
   */
  readonly baseGrowthRatePerTurn: number
  /** Multiplier applied to growth while the owning country is at war. Range 0–1. */
  readonly warGrowthPenalty: number
  /** Capacity bonus added per farm building in the province. */
  readonly farmCapacityBonus: number
  /** Flat income bonus added per 1,000 population in a province. */
  readonly incomePerThousand: number
}

export const DEFAULT_POPULATION_CONFIG: PopulationConfig = {
  initialPopulationByTerrain: {
    plains: 500,
    hills: 300,
    mountains: 150,
    forest: 200,
    desert: 100,
    tundra: 100,
    ocean: 0,
  },
  capacityByTerrain: {
    plains: 5000,
    hills: 2500,
    mountains: 1500,
    forest: 2000,
    desert: 1000,
    tundra: 1000,
    ocean: 0,
  },
  baseGrowthRatePerTurn: 0.01,
  warGrowthPenalty: 0.5,
  farmCapacityBonus: 1000,
  incomePerThousand: 1,
}

export function validatePopulationConfig(raw: unknown): PopulationConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Population config must be a JSON object')
  }
  const obj = raw as Record<string, unknown>
  return {
    ...DEFAULT_POPULATION_CONFIG,
    ...(typeof obj['baseGrowthRatePerTurn'] === 'number'
      ? { baseGrowthRatePerTurn: obj['baseGrowthRatePerTurn'] } : {}),
    ...(typeof obj['warGrowthPenalty'] === 'number'
      ? { warGrowthPenalty: obj['warGrowthPenalty'] } : {}),
    ...(typeof obj['farmCapacityBonus'] === 'number'
      ? { farmCapacityBonus: obj['farmCapacityBonus'] } : {}),
    ...(typeof obj['incomePerThousand'] === 'number'
      ? { incomePerThousand: obj['incomePerThousand'] } : {}),
  }
}
