import type { ProvinceId, CountryId } from './map'

export interface ProvincePopulation {
  readonly provinceId: ProvinceId
  readonly countryId: CountryId
  /** Total population headcount for this province. */
  readonly count: number
  /** Maximum sustainable population given terrain and buildings. */
  readonly capacity: number
  /** Sub-unit growth accumulator; integer part flushes to `count` each tick. */
  readonly growthAccumulator: number
  /**
   * The income tier currently registered as an economy modifier.
   * Tier = floor(count / 1000). Used to detect when to update the modifier.
   */
  readonly incomeTier: number
}

export interface PopulationState {
  readonly provinces: Readonly<Record<ProvinceId, ProvincePopulation>>
}
