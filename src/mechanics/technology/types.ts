import type { TechnologyType } from '@contracts/mechanics/technology'

export function isTechnologyType(value: unknown): value is TechnologyType {
  return (
    value === 'agriculture' ||
    value === 'iron-working' ||
    value === 'steel-working' ||
    value === 'trade-routes' ||
    value === 'writing' ||
    value === 'siege-engineering' ||
    value === 'cartography' ||
    value === 'bureaucracy'
  )
}

// ── Config types ──────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function assertPositiveFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number, got: ${String(value)}`)
  }
}

export interface TechnologyTypeConfig {
  readonly durationTurns: number
}

export interface TechnologyConfig {
  readonly technologies: Readonly<Record<TechnologyType, TechnologyTypeConfig>>
}

export const DEFAULT_TECHNOLOGY_CONFIG: TechnologyConfig = {
  technologies: {
    'agriculture':       { durationTurns: 60  },
    'iron-working':      { durationTurns: 90  },
    'steel-working':     { durationTurns: 120 },
    'trade-routes':      { durationTurns: 80  },
    'writing':           { durationTurns: 70  },
    'siege-engineering': { durationTurns: 100 },
    'cartography':       { durationTurns: 80  },
    'bureaucracy':       { durationTurns: 90  },
  },
}

const KNOWN_TECHNOLOGY_TYPES: readonly TechnologyType[] = [
  'agriculture',
  'iron-working',
  'steel-working',
  'trade-routes',
  'writing',
  'siege-engineering',
  'cartography',
  'bureaucracy',
]

export function validateTechnologyConfig(raw: unknown): TechnologyConfig {
  if (!isRecord(raw)) {
    throw new Error('technology config must be an object')
  }
  const technologies = raw['technologies']
  if (!isRecord(technologies)) {
    throw new Error('technology.technologies must be an object')
  }
  const result: Record<string, TechnologyTypeConfig> = {}
  for (const type of KNOWN_TECHNOLOGY_TYPES) {
    const entry = technologies[type]
    if (!isRecord(entry)) {
      throw new Error(`technology.technologies.${type} must be an object`)
    }
    assertPositiveFiniteNumber(entry['durationTurns'], `technology.technologies.${type}.durationTurns`)
    result[type] = { durationTurns: entry['durationTurns'] as number }
  }
  return { technologies: result as Record<TechnologyType, TechnologyTypeConfig> }
}
