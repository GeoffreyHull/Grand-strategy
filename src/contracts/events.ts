import type { ProvinceId, CountryId, TerritoryId } from './mechanics/map'
import type { DiplomaticStatus } from './mechanics/diplomacy'
import type { AIDecision } from './mechanics/ai'
import type { JobId, BuildableType } from './mechanics/construction'
import type { ArmyId } from './mechanics/military'
import type { FleetId } from './mechanics/navy'
import type { BuildingId, BuildingType, BuildingScope } from './mechanics/buildings'
import type { TechnologyId, TechnologyType } from './mechanics/technology'
import type { IncomeModifier } from './mechanics/economy'
import type { CultureId } from './mechanics/culture'

export interface EventMap {
  // Map mechanic events
  'map:province-selected':   { provinceId: ProvinceId; countryId: CountryId }
  'map:province-hovered':    { provinceId: ProvinceId | null }
  'map:country-selected':    { countryId: CountryId }
  'map:ready':               { provinceCount: number; countryCount: number }
  'map:province-conquered': {
    provinceId: ProvinceId
    newOwnerId: CountryId
    oldOwnerId: CountryId
    /** Total attacker army strength lost in the battle (from casualties). */
    attackerStrengthLost: number
    /** Total defender army strength wiped (all defender armies in the province are destroyed). */
    defenderStrengthWiped: number
  }
  'map:province-attack-repelled': {
    provinceId: ProvinceId
    attackerId: CountryId
    defenderId: CountryId
    attackStrength: number
    defenseStrength: number
    /** Total attacker army strength lost in the battle. */
    attackerStrengthLost: number
    /** Total defender army strength lost in the battle. */
    defenderStrengthLost: number
  }

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
  'economy:gold-deducted': {
    readonly countryId: CountryId
    readonly amount: number
    readonly reason: string
  }
  'economy:province-modifier-added': {
    readonly provinceId: ProvinceId
    readonly modifier: IncomeModifier
  }
  'economy:province-modifier-removed': {
    readonly provinceId: ProvinceId
    readonly modifierId: string
  }
  'economy:owner-modifier-added': {
    readonly countryId: CountryId
    readonly modifier: IncomeModifier
  }
  'economy:owner-modifier-removed': {
    readonly countryId: CountryId
    readonly modifierId: string
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
  'military:army-build-rejected': {
    readonly ownerId: CountryId
    readonly locationId: ProvinceId
    readonly reason: 'insufficient-gold'
  }
  'military:casualties-taken': {
    /** Per-army strength reductions for a single battle. */
    readonly casualties: readonly { readonly armyId: ArmyId; readonly strengthLost: number }[]
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
    /** Present for territory-scoped buildings (e.g. farm). */
    readonly territoryId?: TerritoryId
    readonly buildingType: BuildingType
    readonly scope: BuildingScope
  }
  'buildings:building-destroyed': {
    readonly buildingId: BuildingId
    readonly countryId: CountryId
    readonly provinceId: ProvinceId
    readonly territoryId?: TerritoryId
    readonly buildingType: BuildingType
    readonly scope: BuildingScope
  }
  'buildings:build-rejected': {
    readonly countryId: CountryId
    readonly provinceId: ProvinceId
    readonly territoryId?: TerritoryId
    readonly buildingType: BuildingType
    readonly reason: 'terrain-limit-reached' | 'not-coastal' | 'insufficient-gold' | 'territory-occupied'
  }

  // Diplomacy mechanic events
  'diplomacy:war-declared': {
    readonly declarerId: CountryId
    readonly targetId: CountryId
  }
  'diplomacy:war-rejected': {
    readonly declarerId: CountryId
    readonly targetId: CountryId
    readonly reason: 'truce-active' | 'already-at-war' | 'allied'
  }
  'diplomacy:peace-made': {
    readonly countryA: CountryId
    readonly countryB: CountryId
  }
  'diplomacy:truce-expired': {
    readonly countryA: CountryId
    readonly countryB: CountryId
  }
  'diplomacy:ally-called-to-war': {
    readonly allyId: CountryId
    readonly calledById: CountryId
    readonly warTargetId: CountryId
  }
  'diplomacy:ally-forced-peace': {
    readonly allyId: CountryId
    readonly peaceCountryId: CountryId
    readonly enemyId: CountryId
  }
  'diplomacy:non-aggression-pact-signed': {
    readonly countryA: CountryId
    readonly countryB: CountryId
  }
  'diplomacy:alliance-formed': {
    readonly countryA: CountryId
    readonly countryB: CountryId
  }
  'diplomacy:relation-changed': {
    readonly countryA: CountryId
    readonly countryB: CountryId
    readonly oldStatus: DiplomaticStatus | 'neutral'
    readonly newStatus: DiplomaticStatus
  }
  'diplomacy:truce-requested': {
    readonly requesterId: CountryId
    readonly targetId: CountryId
  }
  'diplomacy:truce-accepted': {
    readonly requesterId: CountryId
    readonly targetId: CountryId
  }
  'diplomacy:truce-rejected': {
    readonly requesterId: CountryId
    readonly targetId: CountryId
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

  // Population mechanic events
  'population:grown': {
    readonly provinceId: ProvinceId
    readonly countryId: CountryId
    readonly amount: number
    readonly newCount: number
  }
  'population:declined': {
    readonly provinceId: ProvinceId
    readonly countryId: CountryId
    readonly amount: number
    readonly newCount: number
  }
  'population:province-transferred': {
    readonly provinceId: ProvinceId
    readonly newCountryId: CountryId
    readonly oldCountryId: CountryId
  }

  // Culture mechanic events
  'culture:province-converted': {
    readonly provinceId: ProvinceId
    readonly oldCultureId: CultureId
    readonly newCultureId: CultureId
    readonly countryId: CountryId
  }
  'culture:assimilation-progressed': {
    readonly provinceId: ProvinceId
    readonly progress: number
    readonly targetCultureId: CultureId
  }
}
