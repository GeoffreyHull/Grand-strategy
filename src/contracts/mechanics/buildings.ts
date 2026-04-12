import type { CountryId, ProvinceId, TerritoryId } from './map'

export type BuildingId = string & { readonly __brand: 'BuildingId' }

export type BuildingType = 'barracks' | 'port' | 'farm' | 'walls'

/** Whether a building belongs to a single hex territory or to the whole province. */
export type BuildingScope = 'territory' | 'province'

export interface Building {
  readonly id: BuildingId
  readonly countryId: CountryId
  readonly provinceId: ProvinceId
  /** Present only for territory-scoped buildings (e.g. farm). */
  readonly territoryId?: TerritoryId
  readonly buildingType: BuildingType
  readonly completedTurn: number
  readonly scope: BuildingScope
}

export interface BuildingsState {
  readonly buildings: Readonly<Record<BuildingId, Building>>
}
