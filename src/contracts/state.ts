import type { Province, Country, Territory, ProvinceId, CountryId, TerritoryId } from './mechanics/map'
import type { AIState } from './mechanics/ai'
import type { ConstructionState } from './mechanics/construction'
import type { MilitaryState } from './mechanics/military'
import type { NavyState } from './mechanics/navy'
import type { BuildingsState } from './mechanics/buildings'
import type { TechnologyState } from './mechanics/technology'
import type { EconomyState } from './mechanics/economy'
import type { DiplomacyState } from './mechanics/diplomacy'
import type { PopulationState } from './mechanics/population'
import type { CultureState } from './mechanics/culture'
import type { ClimateState } from './mechanics/climate'
import type { PersonalityState } from './mechanics/personality'

export interface MapState {
  readonly provinces:   Readonly<Record<ProvinceId,  Province>>
  readonly countries:   Readonly<Record<CountryId,   Country>>
  /** Each hex cell as a Territory, keyed by "col,row" (same format as cellIndex). */
  readonly territories: Readonly<Record<TerritoryId, Territory>>
  readonly selectedProvinceId: ProvinceId | null
  readonly selectedCountryId:  CountryId  | null
  readonly hoveredProvinceId:  ProvinceId | null
  /** "col,row" → ProvinceId — O(1) cell lookup */
  readonly cellIndex: Readonly<Record<string, ProvinceId>>
}

export interface GameState {
  readonly map:          MapState
  readonly ai:           AIState
  readonly construction: ConstructionState
  readonly military:     MilitaryState
  readonly navy:         NavyState
  readonly buildings:    BuildingsState
  readonly technology:   TechnologyState
  readonly economy:      EconomyState
  readonly diplomacy:    DiplomacyState
  readonly population:   PopulationState
  readonly culture:      CultureState
  readonly climate:      ClimateState
  readonly personality:  PersonalityState
}
