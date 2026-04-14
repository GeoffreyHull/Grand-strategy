// Mechanic-private types and the config schema for the climate mechanic.

import type { ClimateEffects, ClimateEventType, ClimateTag } from '@contracts/mechanics/climate'

/** One entry in the climate event catalog — the shape of a rollable event. */
export interface ClimateEventDefinition {
  readonly eventType: ClimateEventType
  /** Tags on which this event may fire. Empty/omitted means any non-ocean tag. */
  readonly allowedTags: readonly ClimateTag[]
  readonly durationTurns: number
  readonly weight: number
  readonly effects: ClimateEffects
}

export interface ClimateConfig {
  /** Number of turns between each roll pass. */
  readonly rollIntervalTurns: number
  /** Probability (0..1) that any given province rolls a non-mild event on a roll pass. */
  readonly eventChancePerProvince: number
  readonly events: readonly ClimateEventDefinition[]
}

// ── Built-in defaults ─────────────────────────────────────────────────────────

export const DEFAULT_CLIMATE_CONFIG: ClimateConfig = {
  rollIntervalTurns: 3,
  eventChancePerProvince: 0.25,
  events: [
    {
      eventType:     'drought',
      allowedTags:   ['arid'],
      durationTurns: 4,
      weight:        1.0,
      effects:       { incomePct: -0.4 },
    },
    {
      eventType:     'harsh-winter',
      allowedTags:   ['northern'],
      durationTurns: 3,
      weight:        1.0,
      effects:       { attritionPct: 0.2 },
    },
    {
      eventType:     'storm-season',
      allowedTags:   ['coastal'],
      durationTurns: 3,
      weight:        1.0,
      effects:       { portIncomePct: -0.5, blocksFleetMovement: true },
    },
    {
      eventType:     'bumper-harvest',
      allowedTags:   ['temperate'],
      durationTurns: 2,
      weight:        1.0,
      effects:       { incomePct: 0.3 },
    },
    {
      eventType:     'epidemic',
      allowedTags:   ['arid', 'temperate', 'northern', 'coastal'],
      durationTurns: 5,
      weight:        0.35,
      effects:       { pausesPopulationGrowth: true, unrestAdd: 15 },
    },
    {
      eventType:     'mild-season',
      allowedTags:   ['arid', 'temperate', 'northern', 'coastal'],
      durationTurns: 2,
      weight:        0.6,
      effects:       {},
    },
  ],
}

// ── Config validation ────────────────────────────────────────────────────────

function validateDefinition(raw: unknown): ClimateEventDefinition | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>

  const eventType = obj['eventType']
  const duration  = obj['durationTurns']
  const weight    = obj['weight']
  const tags      = obj['allowedTags']
  const effects   = obj['effects']

  if (typeof eventType !== 'string') return null
  if (typeof duration !== 'number' || duration < 1) return null
  if (typeof weight !== 'number' || weight < 0) return null
  if (!Array.isArray(tags)) return null
  if (typeof effects !== 'object' || effects === null) return null

  const validTags: ClimateTag[] = ['arid', 'temperate', 'northern', 'coastal']
  const allowedTags = tags.filter((t): t is ClimateTag =>
    typeof t === 'string' && (validTags as readonly string[]).includes(t),
  )

  return {
    eventType:     eventType as ClimateEventType,
    allowedTags,
    durationTurns: Math.floor(duration),
    weight,
    effects:       effects as ClimateEffects,
  }
}

export function validateClimateConfig(raw: unknown): ClimateConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Climate config must be a JSON object')
  }
  const obj = raw as Record<string, unknown>

  const rollIntervalTurns =
    typeof obj['rollIntervalTurns'] === 'number' && obj['rollIntervalTurns'] >= 1
      ? Math.floor(obj['rollIntervalTurns'])
      : DEFAULT_CLIMATE_CONFIG.rollIntervalTurns

  const eventChancePerProvince =
    typeof obj['eventChancePerProvince'] === 'number'
      ? Math.max(0, Math.min(1, obj['eventChancePerProvince']))
      : DEFAULT_CLIMATE_CONFIG.eventChancePerProvince

  const rawEvents = Array.isArray(obj['events']) ? obj['events'] : []
  const events = rawEvents
    .map(validateDefinition)
    .filter((e): e is ClimateEventDefinition => e !== null)

  return {
    rollIntervalTurns,
    eventChancePerProvince,
    events: events.length > 0 ? events : DEFAULT_CLIMATE_CONFIG.events,
  }
}
