import type { CountryId, ProvinceId } from './map'

export type TechnologyId = string & { readonly __brand: 'TechnologyId' }

export type TechnologyType =
  | 'agriculture'
  | 'iron-working'
  | 'steel-working'
  | 'trade-routes'
  | 'writing'
  | 'siege-engineering'
  | 'cartography'
  | 'bureaucracy'

export interface ResearchedTechnology {
  readonly id: TechnologyId
  readonly countryId: CountryId
  readonly provinceId: ProvinceId
  readonly technologyType: TechnologyType
  readonly completedFrame: number
}

export interface TechnologyState {
  /** All completed research records, keyed by TechnologyId */
  readonly technologies: Readonly<Record<TechnologyId, ResearchedTechnology>>
  /** Per-country index: countryId → list of researched TechnologyTypes */
  readonly byCountry: Readonly<Record<CountryId, readonly TechnologyType[]>>
}
