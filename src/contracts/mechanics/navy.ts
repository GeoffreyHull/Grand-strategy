import type { CountryId, ProvinceId } from './map'

export type FleetId = string & { readonly __brand: 'FleetId' }

export interface Fleet {
  readonly id: FleetId
  readonly countryId: CountryId
  readonly provinceId: ProvinceId
  readonly ships: number
  readonly createdFrame: number
}

export interface NavyState {
  readonly fleets: Readonly<Record<FleetId, Fleet>>
}
