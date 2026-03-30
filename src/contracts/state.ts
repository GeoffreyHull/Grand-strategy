import type { Province, Country, ProvinceId, CountryId } from './mechanics/map'
import type { AIState } from './mechanics/ai'

export interface MapState {
  readonly provinces: Readonly<Record<ProvinceId, Province>>
  readonly countries:  Readonly<Record<CountryId,  Country>>
  readonly selectedProvinceId: ProvinceId | null
  readonly hoveredProvinceId:  ProvinceId | null
  /** "col,row" → ProvinceId — O(1) cell lookup */
  readonly cellIndex: Readonly<Record<string, ProvinceId>>
}

export interface GameState {
  readonly map: MapState
  readonly ai: AIState
  // Future slices:
  // readonly diplomacy: DiplomacyState
  // readonly economy: EconomyState
}
