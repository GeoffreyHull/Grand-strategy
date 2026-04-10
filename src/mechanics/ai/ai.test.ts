import { describe, it, expect, vi } from 'vitest'
import type { EventBus } from '../../engine/EventBus'
import type { EventMap } from '@contracts/events'
import type { MapState } from '@contracts/state'
import type { DiplomacyState } from '@contracts/mechanics/diplomacy'
import type { TechnologyState } from '@contracts/mechanics/technology'
import type { AIState, AICountryState, AIPersonality } from '@contracts/mechanics/ai'
import type { CountryId, ProvinceId } from '@contracts/mechanics/map'
import type { AIContext } from './types'
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

/** Build a minimal AIContext for testing. All diplomacy/tech state is empty by default. */
function makeContext(
  mapState: MapState,
  aiState: AIState,
  diplomacyOverride: Partial<DiplomacyState> = {},
  technologyOverride: Partial<TechnologyState> = {},
): AIContext {
  return {
    mapState,
    aiState,
    diplomacyState: {
      relations: {},
      pendingTruceRequests: {},
      currentTurn: 0,
      framesPerTurn: 100,
      ...diplomacyOverride,
    },
    technologyState: {
      technologies: {} as TechnologyState['technologies'],
      byCountry: {} as TechnologyState['byCountry'],
      ...technologyOverride,
    },
  }
}

/** Build a minimal war relation between two countries. */
function warRelation(a: string, b: string): Record<string, DiplomacyState['relations'][string]> {
  const [ca, cb] = a < b ? [a, b] : [b, a]
  const key = `${ca}:${cb}`
  return {
    [key]: {
      countryA: cid(ca),
      countryB: cid(cb),
      status: 'war',
      truceExpiresAtTurn: null,
    },
  }
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

  it('lastDecisions is empty for all nations initially', () => {
    const state = buildAIState()
    for (const cs of Object.values(state.countries)) {
      expect(cs.lastDecisions).toHaveLength(0)
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
    const context = makeContext(mapState, aiState)
    const countryState = aiState.countries['valdorn']!

    const decision = ctrl.evaluateDecision(countryState, context, 100)

    expect(decision.countryId).toBe('valdorn')
    expect(['EXPAND', 'FORTIFY', 'ALLY', 'ISOLATE', 'RESEARCH']).toContain(decision.action)
    expect(decision.priority).toBeGreaterThanOrEqual(0)
    expect(decision.priority).toBeLessThanOrEqual(1)
    expect(decision.frame).toBe(100)
  })

  it('ALLY decision includes a targetCountryId', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ solenne: 3, valdorn: 3 })
    const aiState = makeAIState()
    // Suppress RESEARCH competition by marking all techs known for solenne
    const allTechs = ['agriculture', 'iron-working', 'steel-working', 'trade-routes', 'writing', 'siege-engineering', 'cartography', 'bureaucracy'] as const
    const context = makeContext(mapState, aiState, {}, {
      byCountry: { [cid('solenne')]: allTechs } as unknown as TechnologyState['byCountry'],
    })

    let allyFound = false
    for (let i = 0; i < 100; i++) {
      const decision = ctrl.evaluateDecision(aiState.countries['solenne']!, context, i)
      if (decision.action === 'ALLY') {
        expect(decision.targetCountryId).not.toBeNull()
        allyFound = true
        break
      }
    }
    expect(allyFound).toBe(true)
  })

  it('EXPAND decision includes a targetCountryId when a valid war target exists', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    // kharrath (conqueror, high aggression) with a small province count to maximise EXPAND score
    const mapState = makeMapState({ kharrath: 1, valdorn: 5 })
    const aiState = makeAIState()
    const context = makeContext(mapState, aiState)

    let expandFound = false
    for (let i = 0; i < 100; i++) {
      const decision = ctrl.evaluateDecision(aiState.countries['kharrath']!, context, i)
      if (decision.action === 'EXPAND') {
        expect(decision.targetCountryId).not.toBeNull()
        expandFound = true
        break
      }
    }
    expect(expandFound).toBe(true)
  })

  it('EXPAND prefers the weakest (fewest provinces) war target', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    // attacker has 2 provinces; weak has 1, strong has 10
    const mapState = makeMapState({ kharrath: 2, valdorn: 1, solenne: 10 })
    const aiState = makeAIState()
    const context = makeContext(mapState, aiState)

    let expandCount = 0
    let alwaysWeakest = true
    for (let i = 0; i < 50; i++) {
      const decision = ctrl.evaluateDecision(aiState.countries['kharrath']!, context, i)
      if (decision.action === 'EXPAND') {
        expandCount++
        if (decision.targetCountryId !== 'valdorn') alwaysWeakest = false
      }
    }

    if (expandCount > 0) {
      expect(alwaysWeakest).toBe(true)
    }
  })

  it('EXPAND returns null targetCountryId when all others are allied or at war', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ kharrath: 2, valdorn: 5 })
    const aiState = makeAIState()
    // Mark kharrath–valdorn as allied
    const diplomacy: Partial<DiplomacyState> = {
      relations: {
        'kharrath:valdorn': {
          countryA: cid('kharrath'),
          countryB: cid('valdorn'),
          status: 'allied',
          truceExpiresAtTurn: null,
        },
      },
    }
    const context = makeContext(mapState, aiState, diplomacy)

    for (let i = 0; i < 20; i++) {
      const decision = ctrl.evaluateDecision(aiState.countries['kharrath']!, context, i)
      if (decision.action === 'EXPAND') {
        expect(decision.targetCountryId).toBeNull()
      }
    }
  })

  it('FORTIFY, ISOLATE, and RESEARCH decisions have null targetCountryId', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ dravenn: 5 })
    const aiState = makeAIState()
    const context = makeContext(mapState, aiState)

    for (let i = 0; i < 20; i++) {
      const decision = ctrl.evaluateDecision(aiState.countries['dravenn']!, context, i)
      if (decision.action === 'FORTIFY' || decision.action === 'ISOLATE' || decision.action === 'RESEARCH') {
        expect(decision.targetCountryId).toBeNull()
      }
    }
  })

  it('RESEARCH returns null targetCountryId and scores 0 when all techs are known', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ auren: 5, kharrath: 3 })
    const aiState = makeAIState()
    const allKnown = [
      'agriculture', 'iron-working', 'steel-working', 'trade-routes',
      'writing', 'siege-engineering', 'cartography', 'bureaucracy',
    ] as const
    const techOverride: Partial<TechnologyState> = {
      byCountry: { [cid('auren')]: allKnown } as unknown as TechnologyState['byCountry'],
    }
    const context = makeContext(mapState, aiState, {}, techOverride)

    let researchCount = 0
    for (let i = 0; i < 100; i++) {
      const decision = ctrl.evaluateDecision(aiState.countries['auren']!, context, i)
      if (decision.action === 'RESEARCH') researchCount++
    }
    // With 0 remaining techs, RESEARCH score is 0 and should essentially never win
    expect(researchCount).toBe(0)
  })
})

// ── AIController.update — decision interval ───────────────────────────────────

describe('AIController.update — decision interval', () => {
  it('does not decide before the interval elapses', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ valdorn: 5 })
    const aiState = makeAIState({ valdorn: { lastDecisionFrame: 0 } }, 60)
    const context = makeContext(mapState, aiState)

    const changed = ctrl.update(30, context)

    expect(changed.length).toBe(0)
    expect(bus.emit).not.toHaveBeenCalled()
  })

  it('decides once the interval has elapsed', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ valdorn: 5, kharrath: 7 })
    const aiState = makeAIState({}, 60)
    const context = makeContext(mapState, aiState)

    const changed = ctrl.update(60, context)

    expect(changed.length).toBe(20)
    // Each nation takes at least 1 action; aggressive ones may take more.
    expect((bus.emit as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(20)
  })

  it('skips player-controlled countries', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ valdorn: 5 })
    const aiState = makeAIState({ valdorn: { isPlayerControlled: true } }, 1)
    const context = makeContext(mapState, aiState)

    const changed = ctrl.update(100, context)

    const valdornChanged = changed.some(c => c.countryId === 'valdorn')
    expect(valdornChanged).toBe(false)
  })

  it('updates lastDecisionFrame after deciding', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ kharrath: 8 })
    const aiState = makeAIState({}, 60)
    const context = makeContext(mapState, aiState)

    const changed = ctrl.update(60, context)

    const kharrathState = changed.find(c => c.countryId === 'kharrath')
    expect(kharrathState?.lastDecisionFrame).toBe(60)
  })

  it('emits ai:decision-made for each deciding nation', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ valdorn: 5, solenne: 6, kharrath: 7 })
    const aiState = makeAIState({}, 1)
    const context = makeContext(mapState, aiState)

    ctrl.update(5, context)

    expect(bus.emit).toHaveBeenCalledWith('ai:decision-made', expect.objectContaining({
      decision: expect.objectContaining({
        action: expect.stringMatching(/^(EXPAND|FORTIFY|ALLY|ISOLATE|RESEARCH)$/),
      }),
    }))
  })
})

// ── Personality weighting ─────────────────────────────────────────────────────

describe('personality weighting', () => {
  it('conqueror prefers EXPAND over ISOLATE on average', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    const mapState = makeMapState({ kharrath: 3, solenne: 10 })
    const aiState = makeAIState()
    const context = makeContext(mapState, aiState)

    let expandCount = 0
    let isolateCount = 0
    for (let i = 0; i < 100; i++) {
      const d = ctrl.evaluateDecision(aiState.countries['kharrath']!, context, i)
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
    // Suppress RESEARCH so the defensive personality bias is visible
    const allTechs = ['agriculture', 'iron-working', 'steel-working', 'trade-routes', 'writing', 'siege-engineering', 'cartography', 'bureaucracy'] as const
    const context = makeContext(mapState, aiState, {}, {
      byCountry: { [cid('dravenn')]: allTechs } as unknown as TechnologyState['byCountry'],
    })

    let expandCount = 0
    let defensiveCount = 0
    for (let i = 0; i < 100; i++) {
      const d = ctrl.evaluateDecision(aiState.countries['dravenn']!, context, i)
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
    // Suppress RESEARCH so the alliance-seeking personality bias is visible
    const allTechs = ['agriculture', 'iron-working', 'steel-working', 'trade-routes', 'writing', 'siege-engineering', 'cartography', 'bureaucracy'] as const
    const context = makeContext(mapState, aiState, {}, {
      byCountry: { [cid('solenne')]: allTechs } as unknown as TechnologyState['byCountry'],
    })

    let allyCount = 0
    let expandCount = 0
    for (let i = 0; i < 100; i++) {
      const d = ctrl.evaluateDecision(aiState.countries['solenne']!, context, i)
      if (d.action === 'ALLY') allyCount++
      if (d.action === 'EXPAND') expandCount++
    }

    expect(allyCount).toBeGreaterThan(expandCount)
  })

  it('merchant prioritises RESEARCH over EXPAND on average', () => {
    const bus = mockEventBus()
    const ctrl = new AIController(bus)
    // Give auren (merchant) a medium province count so EXPAND isn't zero
    const mapState = makeMapState({ auren: 5, kharrath: 8 })
    const aiState = makeAIState()
    const context = makeContext(mapState, aiState)

    let researchCount = 0
    let expandCount = 0
    for (let i = 0; i < 100; i++) {
      const d = ctrl.evaluateDecision(aiState.countries['auren']!, context, i)
      if (d.action === 'RESEARCH') researchCount++
      if (d.action === 'EXPAND') expandCount++
    }

    expect(researchCount).toBeGreaterThan(expandCount)
  })
})

// ── SEEK_PEACE scoring ────────────────────────────────────────────────────────

describe('SEEK_PEACE scoring', () => {
  it('scores 0 when the country has no active wars', () => {
    const ctrl = new AIController(mockEventBus())
    // kharrath and solenne exist in DEFAULT_PERSONALITIES; no war set up
    const mapState = makeMapState({ kharrath: 5, solenne: 5 })
    const aiState = makeAIState()
    const context = makeContext(mapState, aiState) // no wars

    // SEEK_PEACE raw score is 0 when not at war, so it should never win
    let total = 0
    for (let i = 0; i < 20; i++) {
      const d = ctrl.evaluateDecision(aiState.countries['kharrath']!, context, i)
      if (d.action === 'SEEK_PEACE') total++
    }
    expect(total).toBe(0)
  })

  it('diplomat personality seeks peace more often than conqueror when losing', () => {
    const ctrl = new AIController(mockEventBus())
    // kharrath is at war with a much larger solenne — kharrath is losing
    const mapState = makeMapState({ kharrath: 2, solenne: 10 })
    const diplomacyState: Partial<DiplomacyState> = { relations: warRelation('kharrath', 'solenne') }

    // Override kharrath's personality to be a diplomat for the diplomatic context
    const diplomatAI = makeAIState({ kharrath: { personality: DEFAULT_PERSONALITIES['solenne']! } })
    // kharrath keeps its conqueror personality in the default context
    const conquerorAI = makeAIState()

    const diplomatContext = makeContext(mapState, diplomatAI, diplomacyState)
    const conquerorContext = makeContext(mapState, conquerorAI, diplomacyState)

    let diplomatPeace = 0
    let conquerorPeace = 0
    for (let i = 0; i < 200; i++) {
      if (ctrl.evaluateDecision(diplomatAI.countries['kharrath']!, diplomatContext, i).action === 'SEEK_PEACE') diplomatPeace++
      if (ctrl.evaluateDecision(conquerorAI.countries['kharrath']!, conquerorContext, i).action === 'SEEK_PEACE') conquerorPeace++
    }

    expect(diplomatPeace).toBeGreaterThan(conquerorPeace)
  })

  it('SEEK_PEACE targets the war enemy with the most provinces', () => {
    const ctrl = new AIController(mockEventBus())
    // kharrath is at war with solenne; solenne is the stronger enemy
    const mapState = makeMapState({ kharrath: 3, solenne: 8 })
    const diplomacyState: Partial<DiplomacyState> = { relations: warRelation('kharrath', 'solenne') }
    // Give kharrath a diplomat personality so it prefers SEEK_PEACE
    const aiState = makeAIState({ kharrath: { personality: DEFAULT_PERSONALITIES['solenne']! } })
    const context = makeContext(mapState, aiState, diplomacyState)

    // Over many trials, every SEEK_PEACE decision should target solenne
    for (let i = 0; i < 100; i++) {
      const d = ctrl.evaluateDecision(aiState.countries['kharrath']!, context, i)
      if (d.action === 'SEEK_PEACE') {
        expect(d.targetCountryId).toBe(cid('solenne'))
      }
    }
  })
})

// ── evaluateTruceResponse ─────────────────────────────────────────────────────

describe('evaluateTruceResponse', () => {
  it('conqueror winning decisively rejects more often than it accepts', () => {
    const ctrl = new AIController(mockEventBus())
    // kharrath (conqueror) has far more provinces than solenne → clearly winning
    const mapState = makeMapState({ solenne: 2, kharrath: 12 })
    const aiState = makeAIState() // kharrath is conqueror by default
    const context = makeContext(mapState, aiState)

    // solenne (requester) → kharrath (responder/target)
    let acceptCount = 0
    for (let i = 0; i < 100; i++) {
      if (ctrl.evaluateTruceResponse(cid('solenne'), cid('kharrath'), context)) acceptCount++
    }
    expect(acceptCount).toBeLessThan(30) // rejects most of the time
  })

  it('diplomat losing accepts more often than it rejects', () => {
    const ctrl = new AIController(mockEventBus())
    // kharrath (requester) has far more provinces; solenne (diplomat, responder) is struggling
    const mapState = makeMapState({ kharrath: 12, solenne: 2 })
    const aiState = makeAIState() // solenne is diplomat by default
    const context = makeContext(mapState, aiState)

    // kharrath (requester) → solenne (responder/target)
    let acceptCount = 0
    for (let i = 0; i < 100; i++) {
      if (ctrl.evaluateTruceResponse(cid('kharrath'), cid('solenne'), context)) acceptCount++
    }
    expect(acceptCount).toBeGreaterThan(60) // accepts most of the time
  })

  it('returns false when the target country does not exist in AI state', () => {
    const ctrl = new AIController(mockEventBus())
    const context = makeContext(makeMapState(), makeAIState())
    expect(ctrl.evaluateTruceResponse(cid('unknown-a'), cid('unknown-b'), context)).toBe(false)
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
