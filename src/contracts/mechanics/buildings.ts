import type { CountryId, ProvinceId } from './map'

export type BuildingId = string & { readonly __brand: 'BuildingId' }

export type BuildingType = 'barracks' | 'port' | 'farm' | 'walls'

export interface Building {
  readonly id: BuildingId
  readonly countryId: CountryId
  readonly provinceId: ProvinceId
  readonly buildingType: BuildingType
  readonly completedFrame: number
}

export interface BuildingsState {
  readonly buildings: Readonly<Record<BuildingId, Building>>
}
