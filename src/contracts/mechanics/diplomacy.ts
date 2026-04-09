import type { CountryId } from './map'

export type DiplomaticStatus = 'neutral' | 'non-aggression' | 'allied' | 'war' | 'truce'

export interface DiplomaticRelation {
  readonly countryA: CountryId  // lexicographically first
  readonly countryB: CountryId  // lexicographically second
  readonly status: DiplomaticStatus
  /** Null unless status === 'truce'. The turn number at which the truce lifts. */
  readonly truceExpiresAtTurn: number | null
}

export interface DiplomacyState {
  readonly relations: Readonly<Record<string, DiplomaticRelation>>
  readonly currentTurn: number
  readonly framesPerTurn: number
}
