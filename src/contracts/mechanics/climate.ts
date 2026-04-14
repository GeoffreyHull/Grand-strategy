// Public types for the climate mechanic — shared across mechanics via contracts.

import type { ProvinceId } from './map'

/**
 * Climate tag derived from a province's terrain/coastal status.
 * Drives which climate events can occur there.
 */
export type ClimateTag = 'arid' | 'temperate' | 'northern' | 'coastal'

/** Identifier for the kind of weather/biome event active in a province. */
export type ClimateEventType =
  | 'drought'
  | 'harsh-winter'
  | 'storm-season'
  | 'bumper-harvest'
  | 'epidemic'
  | 'mild-season'

/**
 * Effect payload describing every channel a climate event can influence.
 * Any subscriber consumes only the fields it cares about; unknown fields are ignored.
 */
export interface ClimateEffects {
  /** Multiplicative adjustment to province income (e.g. -0.4 = -40%). */
  readonly incomePct?: number
  /** Multiplicative adjustment to port income when a port is present. */
  readonly portIncomePct?: number
  /** Additive attrition percent applied to armies in the province. */
  readonly attritionPct?: number
  /** Flat unrest added to the province. */
  readonly unrestAdd?: number
  /** Additive movement-cost surcharge for entering/crossing the province. */
  readonly movementCostAdd?: number
  /** If true, no fleet may depart the province while the event is active. */
  readonly blocksFleetMovement?: boolean
  /** If true, population growth is halted in the province while active. */
  readonly pausesPopulationGrowth?: boolean
}

/** A climate event currently affecting a single province. */
export interface ActiveClimateEvent {
  /** Stable unique id. Also used as the economy modifier id (`climate:<id>`). */
  readonly id: string
  readonly provinceId: ProvinceId
  readonly eventType: ClimateEventType
  readonly climateTag: ClimateTag
  readonly startedOnTurn: number
  readonly expiresOnTurn: number
  readonly effects: ClimateEffects
}

export interface ClimateState {
  /** All active climate events, keyed by event id. */
  readonly active: Readonly<Record<string, ActiveClimateEvent>>
  /** Index: ProvinceId → active event ids currently in that province. */
  readonly byProvince: Readonly<Record<ProvinceId, readonly string[]>>
  /** Last turn on which the ClimateEngine rolled events. */
  readonly lastRollTurn: number
  /** Monotonic counter used to mint unique event ids. */
  readonly nextEventSeq: number
}
