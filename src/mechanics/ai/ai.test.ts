import { describe, it, expect, vi } from 'vitest'
import type { EventBus } from '../../engine/EventBus'
import type { EventMap } from '@contracts/events'
import type { MapState } from '@contracts/state'
import type { AIState, AICountryState, AIPersonality } from '@contracts/mechanics/ai'
import type { CountryId, ProvinceId } from '@contracts/mechanics/map'
import { buildAIState } from './index'
import { DEFAULT_PERSONALITIES } from './personalities'
import { AIController } from './AIController'

// ── Helpers ───────────────────────────────────────────────────────────────────

function cid(s: string): CountryId { return s as CountryId }
function pid(s: string): ProvinceId { return s as ProvinceId }

/** Minimal EventBus mock — captures emitted events. */
function mockEventBus(): EventBus<EventMap> {
  return {
    emit: vi.fn(),
    on:   vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    off:  vi.fn(),
    once: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  } as unknown as EventBus<EventMap>
}

/** Minimal MapState with configurable province counts per country. */
function makeMapState(
  countryProvinceCounts: Record<string, number> = {},
): MapState {
  const countries: Record<string, unknown> = {}
  const provinces: Record<string, unknown> = {}

  for (const [id, count] of Object.entries(countryProvinceCounts)) {
    const provinceIds: ProvinceId[] = []
    for (let i = 0; i < count; i++) {
      const pId = pid(`${id}-p${i}`)
      provinceIds.push(pId)
      provinces[pId] = {
        id: pId,
        name: `Province ${i}`,
        countryId: cid(id),
        terrainType: 'plains',
        isCoastal: false,
        cells: [],
      }
    }
    countries[id] = {
      id: cid(id),
      name: id,
      color: '#ffffff',
      capitalProvinceId: provinceIds[0] ?? pid(`${id}-p0`),
      provinceIds,
    }
  }

  return {
    countries: countries as unknown as MapState['countries'],
    provinces: provinces as unknown as MapState['provinces'],
    selectedProvinceId: null,
    hoveredProvinceId: null,
    cellIndex: {},
  }
}

/** Build a minimal AIState for testing with one or more countries. */
function makeAIState(
  overrides: Partial<Record<string, Partial<AICountryState>>> = {},
  decisionIntervalFrames = 60,
): AIState {
  const base = buildAIState()
  const countries = { ...base.countries }

  for (const [id, partial] of Object.entries(overrides)) {
    const existing = countries[id]
    if (existing) {
      countries[id] = { ...existing, ...partial }
    }
  }

  return { ...base, countries, decisionIntervalFrames }
}

// ── buildAIState ──────────────────────────────────────────────────────────────

describe('buildAIState', () => {
  it('creates entries for all 20 nations', () => {
    const state = buildAIState()
    expect(Object.keys(state.countries).length).toBe(20)
  })

  it('all nations are AI-controlled by default', () => {
    const state = buildAIState()
    for (const cs of Object.values(state.countries)) {
      expect(cs.isPlayerControlled).toBe(false)
    }
  })

  it('marks the specified country as player-controlled', () => {
    const state = buildAIState(cid('valdorn'))
    expect(state.countries['valdorn']?.isPlayerControlled).toBe(true)
    expect(state.playerCountryId).toBe('valdorn')
  })

  it('only one country is player-controlled when playerCountryId is given', () => {
    const state = buildAIState(cid('kharrath'))
    const playerControlled = Object.values(state.countries).filter(cs => cs.isPlayerControlled)
    expect(playerControlled.length).toBe(1)
  })

  it('default decisionIntervalFrames is 60', () => {
    const state = buildAIState()
    expect(state.decisionIntervalFrames).toBe(60)
  })

  it('all countries have valid personalities', () => {
    const state = buildAIState()
    for (const cs of Object.values(state.countries)) {
      const { aggression, diplomacy, economy, caution } = cs.personality
      expect(aggression).toBeGreaterThanOrEqual(0)
      expect(aggression).toBeLessThanOrEqual(1)
      expect(diplomacy).toBeGreaterThanOrEqual(0)
      expect(diplomacy).toBeLessThanOrEqual(1)
      expect(economy).toBeGreaterThanOrEqual(0)
      expect(economy).toBeLessThanOrEqual(1)
      expect(caution).toBeGreaterThanOrEqual(0)
      expect(caution).toBeLessThanOrEqual(1)
    }
  })

  it('lastDecision is null for all nations initially', () => {
    const state = buildAIState()
    for (const cs of Object.values(state.countries)) {
      expect(cs.lastDecision).toBeNull()
    }
  })
})

// ── DEFAULT_PERSONALITIES ─────────────────────────────────────────────────────

describe('DEFAULT_PERSONALITIES', () => {
  it('covers all 20 nations', () => {
    expect(Object.keys(DEFAULT_PERSONALITIES).length).toBe(20)
  })

  it('kharrath is a conqueror', () => {
    expect(DEFAULT_PERSONALITIES['kharrath']?.archetype).toBe('conqueror')
  })

  it('solenne is a diplomat', () => {
    expect(DEFAULT_PERSONALITIES['solenne']?.archetype).toBe('diplomat')
  })

  it('auren is a merchant', () => {
    expect(DEFAULT_PERSONALITIES['auren']?.archetype).toBe('merchant')
  })

  it('dravenn is an isolationist', () => {
    expect(DEFAULT_PERSONALITIES['dravenn']?.archetype).toBe('isolationist')
  })

  it('thornwood is a zealot', () => {
    expect(DEFAULT_PERSONALITIES['thornwood']?.archetype).toBe('zealot')
  })
})

// ── AIController.evaluateDecision ─────────────────────────────────────────────

describe('AIController.evaluateDecision', () => {
  it('returns a valid AIDecision', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ valdorn: 5, kharrath: 8 })
    const aiState = makeAIState()
    const countryState = aiState.countries['valdorn']!

    const decision = ctrl.evaluateDecision(countryState, mapState, aiState, 100)

    expect(decision.countryId).toBe('valdorn')
    expect(['EXPAND', 'FORTIFY', 'ALLY', 'ISOLATE']).toContain(decision.action)
    expect(decision.priority).toBeGreaterThanOrEqual(0)
    expect(decision.priority).toBeLessThanOrEqual(1)
    expect(decision.frame).toBe(100)
  })

  it('ALLY decision includes a targetCountryId', () => {
    // Force an ALLY decision by giving the country max diplomacy
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ solenne: 3, valdorn: 3 })
    const aiState = makeAIState()

    // Run multiple times to account for random noise
    let allyFound = false
    for (let i = 0; i < 50; i++) {
      const decision = ctrl.evaluateDecision(aiState.countries['solenne']!, mapState, aiState, i)
      if (decision.action === 'ALLY') {
        expect(decision.targetCountryId).not.toBeNull()
        allyFound = true
        break
      }
    }
    // Solenne is a diplomat — ALLY should come up at least occasionally
    expect(allyFound).toBe(true)
  })

  it('non-ALLY decision has null targetCountryId', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ dravenn: 5 })
    const aiState = makeAIState()

    // Run many times and check that non-ALLY decisions have null target
    for (let i = 0; i < 20; i++) {
      const decision = ctrl.evaluateDecision(aiState.countries['dravenn']!, mapState, aiState, i)
      if (decision.action !== 'ALLY') {
        expect(decision.targetCountryId).toBeNull()
      }
    }
  })
})

// ── AIController.update — decision interval ───────────────────────────────────

describe('AIController.update — decision interval', () => {
  it('does not decide before the interval elapses', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ valdorn: 5 })
    // lastDecisionFrame = 0, interval = 60; call at frame 30
    const aiState = makeAIState({ valdorn: { lastDecisionFrame: 0 } }, 60)

    const changed = ctrl.update(30, mapState, aiState)

    expect(changed.length).toBe(0)
    expect(bus.emit).not.toHaveBeenCalled()
  })

  it('decides once the interval has elapsed', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ valdorn: 5, kharrath: 7 })
    // lastDecisionFrame = 0, interval = 60; call at frame 60
    const aiState = makeAIState({}, 60)

    const changed = ctrl.update(60, mapState, aiState)

    // All 20 AI nations should decide on frame 60 (all started at frame 0)
    expect(changed.length).toBe(20)
    expect(bus.emit).toHaveBeenCalledTimes(20)
  })

  it('skips player-controlled countries', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ valdorn: 5 })
    const aiState = makeAIState({ valdorn: { isPlayerControlled: true } }, 1)

    const changed = ctrl.update(100, mapState, aiState)

    const valdornChanged = changed.some(c => c.countryId === 'valdorn')
    expect(valdornChanged).toBe(false)
  })

  it('updates lastDecisionFrame after deciding', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ kharrath: 8 })
    const aiState = makeAIState({}, 60)

    const changed = ctrl.update(60, mapState, aiState)

    const kharrathState = changed.find(c => c.countryId === 'kharrath')
    expect(kharrathState?.lastDecisionFrame).toBe(60)
  })

  it('emits ai:decision-made for each deciding nation', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ valdorn: 5, solenne: 6, kharrath: 7 })
    const aiState = makeAIState({}, 1) // interval=1 so every frame triggers

    ctrl.update(5, mapState, aiState)

    expect(bus.emit).toHaveBeenCalledWith('ai:decision-made', expect.objectContaining({
      decision: expect.objectContaining({ action: expect.stringMatching(/^(EXPAND|FORTIFY|ALLY|ISOLATE)$/) }),
    }))
  })
})

// ── Personality weighting ─────────────────────────────────────────────────────

describe('personality weighting', () => {
  it('conqueror prefers EXPAND over ISOLATE on average', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    // Give kharrath (conqueror) 3 provinces; max is 10 → expansion score high
    const mapState = makeMapState({ kharrath: 3, solenne: 10 })
    const aiState = makeAIState()

    let expandCount = 0
    let isolateCount = 0
    for (let i = 0; i < 100; i++) {
      const d = ctrl.evaluateDecision(aiState.countries['kharrath']!, mapState, aiState, i)
      if (d.action === 'EXPAND') expandCount++
      if (d.action === 'ISOLATE') isolateCount++
    }

    expect(expandCount).toBeGreaterThan(isolateCount)
  })

  it('isolationist prefers ISOLATE or FORTIFY over EXPAND on average', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ dravenn: 5, kharrath: 7 })
    const aiState = makeAIState()

    let expandCount = 0
    let defensiveCount = 0
    for (let i = 0; i < 100; i++) {
      const d = ctrl.evaluateDecision(aiState.countries['dravenn']!, mapState, aiState, i)
      if (d.action === 'EXPAND') expandCount++
      if (d.action === 'ISOLATE' || d.action === 'FORTIFY') defensiveCount++
    }

    expect(defensiveCount).toBeGreaterThan(expandCount)
  })

  it('diplomat prefers ALLY over EXPAND on average', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ solenne: 7, kharrath: 4 })
    const aiState = makeAIState()

    let allyCount = 0
    let expandCount = 0
    for (let i = 0; i < 100; i++) {
      const d = ctrl.evaluateDecision(aiState.countries['solenne']!, mapState, aiState, i)
      if (d.action === 'ALLY') allyCount++
      if (d.action === 'EXPAND') expandCount++
    }

    expect(allyCount).toBeGreaterThan(expandCount)
  })
})

// ── Type guards ───────────────────────────────────────────────────────────────

describe('type correctness', () => {
  it('AIPersonality stat values are in [0, 1] for all archetypes', () => {
    const archetypes = ['conqueror', 'diplomat', 'merchant', 'isolationist', 'zealot'] as const
    const seen = new Set<string>()

    for (const [, personality] of Object.entries(DEFAULT_PERSONALITIES) as [string, AIPersonality][]) {
      if (seen.has(personality.archetype)) continue
      seen.add(personality.archetype)
      expect(archetypes).toContain(personality.archetype)
      for (const val of [personality.aggression, personality.diplomacy, personality.economy, personality.caution]) {
        expect(val).toBeGreaterThanOrEqual(0)
        expect(val).toBeLessThanOrEqual(1)
      }
    }
  })
})
