import { describe, it, expect, vi } from 'vitest'
import type { EventBus } from '../../engine/EventBus'
import type { EventMap } from '@contracts/events'
import type { Province, ProvinceId, CountryId, TerrainType } from '@contracts/mechanics/map'
import type { ClimateState } from '@contracts/mechanics/climate'
import {
  DEFAULT_CLIMATE_CONFIG,
  buildClimateState,
  deriveClimateTag,
  rollClimate,
} from './index'
import { validateClimateConfig } from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pid(s: string): ProvinceId { return s as ProvinceId }
function cid(s: string): CountryId { return s as CountryId }

function makeProvince(id: string, terrain: TerrainType, isCoastal = false): Province {
  return {
    id:          pid(id),
    name:        id,
    countryId:   cid('owner'),
    cells:       [],
    isCoastal,
    terrainType: terrain,
  }
}

/** Deterministic RNG: emits values from a cycling array. */
function makeRng(values: readonly number[]): () => number {
  let i = 0
  return () => {
    const v = values[i % values.length] ?? 0
    i++
    return v
  }
}

function mockEventBus(): EventBus<EventMap> {
  return {
    emit: vi.fn(),
    on:   vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    off:  vi.fn(),
    once: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  } as unknown as EventBus<EventMap>
}

// ── deriveClimateTag ──────────────────────────────────────────────────────────

describe('deriveClimateTag', () => {
  it('desert → arid (even when coastal)', () => {
    expect(deriveClimateTag({ terrainType: 'desert', isCoastal: false })).toBe('arid')
    expect(deriveClimateTag({ terrainType: 'desert', isCoastal: true })).toBe('arid')
  })

  it('tundra → northern (even when coastal)', () => {
    expect(deriveClimateTag({ terrainType: 'tundra', isCoastal: false })).toBe('northern')
    expect(deriveClimateTag({ terrainType: 'tundra', isCoastal: true })).toBe('northern')
  })

  it('coastal plains/forest/hills → coastal', () => {
    expect(deriveClimateTag({ terrainType: 'plains',   isCoastal: true })).toBe('coastal')
    expect(deriveClimateTag({ terrainType: 'forest',   isCoastal: true })).toBe('coastal')
    expect(deriveClimateTag({ terrainType: 'hills',    isCoastal: true })).toBe('coastal')
  })

  it('non-coastal plains/forest/hills/mountains → temperate', () => {
    expect(deriveClimateTag({ terrainType: 'plains',    isCoastal: false })).toBe('temperate')
    expect(deriveClimateTag({ terrainType: 'forest',    isCoastal: false })).toBe('temperate')
    expect(deriveClimateTag({ terrainType: 'hills',     isCoastal: false })).toBe('temperate')
    expect(deriveClimateTag({ terrainType: 'mountains', isCoastal: false })).toBe('temperate')
  })

  it('ocean → null', () => {
    expect(deriveClimateTag({ terrainType: 'ocean', isCoastal: false })).toBeNull()
  })
})

// ── rollClimate: roll cadence ─────────────────────────────────────────────────

describe('rollClimate — cadence', () => {
  it('does not roll before rollIntervalTurns has elapsed', () => {
    const provinces = { p1: makeProvince('p1', 'desert') }
    // last roll at turn 0, interval 3 → no roll at turn 1, 2
    const state: ClimateState = { ...buildClimateState(), lastRollTurn: 0 }
    // rng tuned so every chance passes, but we expect no roll at all
    const rng = makeRng([0, 0, 0, 0, 0])
    const result = rollClimate(1, provinces as unknown as Record<string, Province>, state, DEFAULT_CLIMATE_CONFIG, rng)
    expect(result.started).toHaveLength(0)
    expect(result.nextState.lastRollTurn).toBe(0)
  })

  it('rolls on the scheduled turn', () => {
    const provinces = { p1: makeProvince('p1', 'desert') }
    const state: ClimateState = { ...buildClimateState(), lastRollTurn: 0 }
    const rng = makeRng([0, 0])  // chance-roll passes, event-pick first in weight order
    const result = rollClimate(3, provinces as unknown as Record<string, Province>, state, DEFAULT_CLIMATE_CONFIG, rng)
    expect(result.started.length).toBeGreaterThan(0)
    expect(result.nextState.lastRollTurn).toBe(3)
  })

  it('skips ocean provinces', () => {
    const provinces = { o1: makeProvince('o1', 'ocean') }
    const state = buildClimateState()
    const rng = makeRng([0, 0, 0, 0])
    const result = rollClimate(0, provinces as unknown as Record<string, Province>, state, DEFAULT_CLIMATE_CONFIG, rng)
    expect(result.started).toHaveLength(0)
  })

  it('respects eventChancePerProvince', () => {
    const provinces = { p1: makeProvince('p1', 'desert') }
    const state = buildClimateState()
    // rng returns 0.99 → always exceeds the 0.25 default chance → no events
    const rng = makeRng([0.99])
    const result = rollClimate(0, provinces as unknown as Record<string, Province>, state, DEFAULT_CLIMATE_CONFIG, rng)
    expect(result.started).toHaveLength(0)
  })
})

// ── rollClimate: tag-based event selection ───────────────────────────────────

describe('rollClimate — event selection', () => {
  it('arid provinces can roll drought', () => {
    const provinces = { p1: makeProvince('p1', 'desert') }
    const state = buildClimateState()
    // Custom config with only drought as an option so the weighted pick is deterministic.
    const config = {
      ...DEFAULT_CLIMATE_CONFIG,
      events: DEFAULT_CLIMATE_CONFIG.events.filter(e => e.eventType === 'drought'),
    }
    const rng = makeRng([0, 0])
    const result = rollClimate(0, provinces as unknown as Record<string, Province>, state, config, rng)
    expect(result.started).toHaveLength(1)
    expect(result.started[0]!.eventType).toBe('drought')
    expect(result.started[0]!.climateTag).toBe('arid')
  })

  it('temperate provinces cannot roll drought', () => {
    const provinces = { p1: makeProvince('p1', 'plains', false) }
    const state = buildClimateState()
    const config = {
      ...DEFAULT_CLIMATE_CONFIG,
      events: DEFAULT_CLIMATE_CONFIG.events.filter(e => e.eventType === 'drought'),
    }
    const rng = makeRng([0, 0])
    const result = rollClimate(0, provinces as unknown as Record<string, Province>, state, config, rng)
    expect(result.started).toHaveLength(0)
  })

  it('coastal provinces roll storm-season with correct payload', () => {
    const provinces = { p1: makeProvince('p1', 'plains', true) }
    const state = buildClimateState()
    const config = {
      ...DEFAULT_CLIMATE_CONFIG,
      events: DEFAULT_CLIMATE_CONFIG.events.filter(e => e.eventType === 'storm-season'),
    }
    const rng = makeRng([0, 0])
    const result = rollClimate(0, provinces as unknown as Record<string, Province>, state, config, rng)
    expect(result.started).toHaveLength(1)
    expect(result.started[0]!.eventType).toBe('storm-season')
    expect(result.started[0]!.effects.portIncomePct).toBe(-0.5)
    expect(result.started[0]!.effects.blocksFleetMovement).toBe(true)
  })
})

// ── rollClimate: expiry ──────────────────────────────────────────────────────

describe('rollClimate — expiry', () => {
  it('expires events whose expiresOnTurn has passed', () => {
    const provinces = { p1: makeProvince('p1', 'plains', true) }
    let state = buildClimateState()

    // Roll once at turn 0 using a storm-only config.
    const config = {
      ...DEFAULT_CLIMATE_CONFIG,
      events: DEFAULT_CLIMATE_CONFIG.events.filter(e => e.eventType === 'storm-season'),
    }
    const rng = makeRng([0, 0])
    let result = rollClimate(0, provinces as unknown as Record<string, Province>, state, config, rng)
    state = result.nextState
    expect(Object.values(state.active)).toHaveLength(1)
    const expiresOn = Object.values(state.active)[0]!.expiresOnTurn

    // Advance to the expiry turn.
    result = rollClimate(expiresOn, provinces as unknown as Record<string, Province>, state, config, makeRng([0.99]))
    expect(result.expired).toHaveLength(1)
    expect(Object.keys(result.nextState.active)).toHaveLength(0)
    expect(result.nextState.byProvince['p1']).toBeUndefined()
  })

  it('does not start a second event in an occupied province', () => {
    const provinces = { p1: makeProvince('p1', 'desert') }
    let state = buildClimateState()
    const config = {
      ...DEFAULT_CLIMATE_CONFIG,
      events: DEFAULT_CLIMATE_CONFIG.events.filter(e => e.eventType === 'drought'),
    }
    const rng = makeRng([0, 0, 0, 0, 0, 0])

    let result = rollClimate(0, provinces as unknown as Record<string, Province>, state, config, rng)
    state = result.nextState
    expect(Object.values(state.active)).toHaveLength(1)

    // Next scheduled roll (turn 3): province still occupied (drought lasts 4) — no new event.
    result = rollClimate(3, provinces as unknown as Record<string, Province>, state, config, rng)
    expect(result.started).toHaveLength(0)
    expect(Object.values(result.nextState.active)).toHaveLength(1)
  })
})

// ── validateClimateConfig ────────────────────────────────────────────────────

describe('validateClimateConfig', () => {
  it('accepts a well-formed config', () => {
    const result = validateClimateConfig({
      rollIntervalTurns: 5,
      eventChancePerProvince: 0.5,
      events: [
        { eventType: 'drought', allowedTags: ['arid'], durationTurns: 2, weight: 1, effects: { incomePct: -0.2 } },
      ],
    })
    expect(result.rollIntervalTurns).toBe(5)
    expect(result.eventChancePerProvince).toBe(0.5)
    expect(result.events).toHaveLength(1)
  })

  it('falls back to defaults when events list is empty', () => {
    const result = validateClimateConfig({ events: [] })
    expect(result.events.length).toBeGreaterThan(0)
  })

  it('clamps eventChancePerProvince into [0, 1]', () => {
    expect(validateClimateConfig({ eventChancePerProvince: -0.5 }).eventChancePerProvince).toBe(0)
    expect(validateClimateConfig({ eventChancePerProvince: 1.5 }).eventChancePerProvince).toBe(1)
  })

  it('throws on non-object input', () => {
    expect(() => validateClimateConfig(null)).toThrow()
    expect(() => validateClimateConfig('nope')).toThrow()
  })
})

// ── Emission smoke test ──────────────────────────────────────────────────────

describe('integration — event emission shape', () => {
  it('mockEventBus receives climate:event-started as expected payload shape', () => {
    const bus = mockEventBus()
    // Directly emit the canonical shape to ensure the payload matches EventMap typing.
    const event = {
      id: 'climate-1',
      provinceId: pid('p1'),
      eventType: 'drought' as const,
      climateTag: 'arid' as const,
      startedOnTurn: 0,
      expiresOnTurn: 4,
      effects: { incomePct: -0.4 },
    }
    bus.emit('climate:event-started', { event })
    expect(bus.emit).toHaveBeenCalledWith('climate:event-started', { event })
  })
})
