import type { CountryId, ProvinceId } from './map'

export type ArmyId = string & { readonly __brand: 'ArmyId' }

export interface Army {
  readonly id: ArmyId
  readonly countryId: CountryId
  readonly provinceId: ProvinceId
  readonly strength: number
  readonly createdFrame: number
}

export interface MilitaryState {
  readonly armies: Readonly<Record<ArmyId, Army>>
}
