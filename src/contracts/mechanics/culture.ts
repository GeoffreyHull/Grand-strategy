import type { ProvinceId, CountryId } from './map'

/** Stable string identifier for a distinct culture group. */
export type CultureId = string & { readonly __brand: 'CultureId' }

export interface ProvinceCulture {
  readonly provinceId: ProvinceId
  /** The dominant culture currently present in this province. */
  readonly cultureId: CultureId
  /**
   * Assimilation progress toward the owning country's culture.
   * Range 0–100. Resets to 0 on conquest. At 100 the province culture converts.
   */
  readonly assimilationProgress: number
}

export interface CultureState {
  /** Per-province culture data, keyed by ProvinceId. */
  readonly provinces: Readonly<Record<ProvinceId, ProvinceCulture>>
  /** The native culture for each country, keyed by CountryId. */
  readonly countryCultures: Readonly<Record<CountryId, CultureId>>
}
