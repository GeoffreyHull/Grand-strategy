// Public types for the map mechanic — shared across mechanics via contracts.
// These types cross module boundaries (other mechanics may use ProvinceId, CountryId, etc.)

export type ProvinceId = string & { readonly __brand: 'ProvinceId' }
export type CountryId  = string & { readonly __brand: 'CountryId'  }

export interface HexCoord {
  readonly col: number
  readonly row: number
}

export type TerrainType =
  | 'plains'
  | 'hills'
  | 'mountains'
  | 'forest'
  | 'desert'
  | 'tundra'
  | 'ocean'

export interface Province {
  readonly id: ProvinceId
  readonly name: string
  readonly countryId: CountryId
  readonly cells: readonly HexCoord[]
  readonly isCoastal: boolean
  readonly terrainType: TerrainType
}

export interface Country {
  readonly id: CountryId
  readonly name: string
  readonly color: string
  readonly provinceIds: readonly ProvinceId[]
  readonly capitalProvinceId: ProvinceId
}
