import type { CountryId } from './map'

export type DiplomaticStatus = 'neutral' | 'non-aggression' | 'allied' | 'war' | 'truce'

export interface DiplomaticRelation {
  readonly countryA: CountryId  // lexicographically first
  readonly countryB: CountryId  // lexicographically second
  readonly status: DiplomaticStatus
  /** Null unless status === 'truce'. The turn number at which the truce lifts. */
  readonly truceExpiresAtTurn: number | null
}

/** A truce request sent by one belligerent to the other during an active war. */
export interface PendingTruceRequest {
  /** The country that initiated the request. */
  readonly requesterId: CountryId
  /** The country being asked to accept or reject. */
  readonly targetId: CountryId
  /** Turn on which the request was made; expires after TRUCE_REQUEST_EXPIRY_TURNS. */
  readonly requestedAtTurn: number
}

export interface DiplomacyState {
  readonly relations: Readonly<Record<string, DiplomaticRelation>>
  /**
   * Pending truce requests, keyed by the canonical pair key ("smallerId:largerId").
   * At most one pending request per belligerent pair at any time.
   */
  readonly pendingTruceRequests: Readonly<Record<string, PendingTruceRequest>>
  readonly currentTurn: number
  readonly framesPerTurn: number
}
