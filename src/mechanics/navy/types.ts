// Internal types for the navy mechanic.
// All public-facing game types live in src/contracts/mechanics/navy.ts.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function assertPositiveFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number, got: ${String(value)}`)
  }
}

export interface FleetConfig {
  readonly durationTurns: number
  readonly ships: number
}

export interface NavyConfig {
  readonly fleet: FleetConfig
}

export const DEFAULT_NAVY_CONFIG: NavyConfig = {
  fleet: { durationTurns: 120, ships: 3 },
}

export function validateNavyConfig(raw: unknown): NavyConfig {
  if (!isRecord(raw)) {
    throw new Error('navy config must be an object')
  }
  const fleet = raw['fleet']
  if (!isRecord(fleet)) {
    throw new Error('navy.fleet must be an object')
  }
  assertPositiveFiniteNumber(fleet['durationTurns'], 'navy.fleet.durationTurns')
  assertPositiveFiniteNumber(fleet['ships'],          'navy.fleet.ships')
  return {
    fleet: {
      durationTurns: fleet['durationTurns'] as number,
      ships:          fleet['ships'] as number,
    },
  }
}
