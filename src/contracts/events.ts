import type { ProvinceId, CountryId } from './mechanics/map'

export interface EventMap {
  // Map mechanic events
  'map:province-selected': { provinceId: ProvinceId; countryId: CountryId }
  'map:province-hovered':  { provinceId: ProvinceId | null }
  'map:country-selected':  { countryId: CountryId }
  'map:ready':             { provinceCount: number; countryCount: number }

  // Stubs for future mechanics (empty payloads as placeholders)
  // 'diplomacy:war-declared':    { attackerId: CountryId; defenderId: CountryId }
  // 'economy:trade-route-formed': { fromId: ProvinceId; toId: ProvinceId }
}
