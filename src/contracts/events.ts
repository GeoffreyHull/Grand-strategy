import type { ProvinceId, CountryId } from './mechanics/map'
import type { AIDecision } from './mechanics/ai'
import type { JobId, BuildableType } from './mechanics/construction'
import type { ArmyId } from './mechanics/military'
import type { FleetId } from './mechanics/navy'
import type { BuildingId, BuildingType } from './mechanics/buildings'
import type { TechnologyId, TechnologyType } from './mechanics/technology'

export interface EventMap {
  // Map mechanic events
  'map:province-selected':   { provinceId: ProvinceId; countryId: CountryId }
  'map:province-hovered':    { provinceId: ProvinceId | null }
  'map:country-selected':    { countryId: CountryId }
  'map:ready':               { provinceCount: number; countryCount: number }
  'map:province-conquered':       { provinceId: ProvinceId; newOwnerId: CountryId; oldOwnerId: CountryId }
  'map:province-attack-repelled': { provinceId: ProvinceId; attackerId: CountryId; defenderId: CountryId; attackStrength: number; defenseStrength: number }

  // AI mechanic events
  'ai:decision-made':      { decision: AIDecision }
  'ai:player-country-set': { countryId: CountryId }

  // Construction mechanic events
  'construction:request': {
    readonly jobId: JobId
    readonly ownerId: CountryId
    readonly locationId: ProvinceId
    readonly buildableType: BuildableType
    readonly durationFrames: number
    readonly metadata: Readonly<Record<string, unknown>>
  }
  'construction:enqueued': {
    readonly jobId: JobId
    readonly ownerId: CountryId
    readonly buildableType: BuildableType
  }
  'construction:cancelled': {
    readonly jobId: JobId
    readonly reason: string
  }
  'construction:complete': {
    readonly jobId: JobId
    readonly ownerId: CountryId
    readonly locationId: ProvinceId
    readonly buildableType: BuildableType
    readonly completedFrame: number
    readonly metadata: Readonly<Record<string, unknown>>
  }

  // Economy mechanic events
  'economy:income-collected': {
    readonly countryId: CountryId
    readonly amount: number
    readonly frame: number
  }

  // Military mechanic events
  'military:army-raised': {
    readonly armyId: ArmyId
    readonly countryId: CountryId
    readonly provinceId: ProvinceId
  }
  'military:army-destroyed': {
    readonly armyId: ArmyId
    readonly countryId: CountryId
    readonly provinceId: ProvinceId
  }

  // Navy mechanic events
  'navy:fleet-formed': {
    readonly fleetId: FleetId
    readonly countryId: CountryId
    readonly provinceId: ProvinceId
  }
  'navy:fleet-rejected': {
    readonly ownerId: CountryId
    readonly locationId: ProvinceId
    readonly reason: 'not-coastal'
  }

  // Buildings mechanic events
  'buildings:building-constructed': {
    readonly buildingId: BuildingId
    readonly countryId: CountryId
    readonly provinceId: ProvinceId
    readonly buildingType: BuildingType
  }

  // Technology mechanic events
  'technology:research-completed': {
    readonly technologyId: TechnologyId
    readonly countryId: CountryId
    readonly technologyType: TechnologyType
  }
  'technology:research-rejected': {
    readonly ownerId: CountryId
    readonly technologyType: TechnologyType
    readonly reason: 'already-researched'
  }
}
