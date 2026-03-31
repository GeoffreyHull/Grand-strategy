import { describe, it, expect, vi } from 'vitest'
import {
  buildTechnologyState,
  initTechnologyMechanic,
  requestResearchTechnology,
} from './index'
import { isTechnologyType } from './types'
import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId, ProvinceId } from '@contracts/mechanics/map'
import type { JobId } from '@contracts/mechanics/construction'
import type { TechnologyType } from '@contracts/mechanics/technology'

// ── Test helpers ──────────────────────────────────────────────────────────────

type Handler<K extends keyof EventMap> = (payload: EventMap[K]) => void

function makeMockEventBus() {
  const handlers = new Map<string, Set<Handler<keyof EventMap>>>()

  const emit = vi.fn(<K extends keyof EventMap>(event: K, payload: EventMap[K]) => {
    const set = handlers.get(event as string)
    if (set) for (const h of set) (h as Handler<K>)(payload)
  })

  const on = vi.fn(<K extends keyof EventMap>(event: K, handler: Handler<K>) => {
    if (!handlers.has(event as string)) handlers.set(event as string, new Set())
    handlers.get(event as string)!.add(handler as Handler<keyof EventMap>)
    return {
      unsubscribe: vi.fn(() => {
        handlers.get(event as string)?.delete(handler as Handler<keyof EventMap>)
      }),
    }
  })

  return { emit, on, off: vi.fn(), once: vi.fn() } as unknown as EventBus<EventMap> & {
    emit: typeof emit
    on: typeof on
  }
}

function makeStateStore(initial?: Partial<GameState>) {
  let state: GameState = {
    technology: buildTechnologyState(),
    ...initial,
  } as unknown as GameState

  return {
    getSlice: vi.fn(<K extends keyof GameState>(key: K) => state[key]),
    getState: vi.fn(() => state),
    setState: vi.fn((updater: (draft: GameState) => GameState) => { state = updater(state) }),
    subscribe: vi.fn(),
  } as unknown as StateStore<GameState>
}

const ownerId    = 'valdorn'  as CountryId
const otherId    = 'astryn'   as CountryId
const locationId = 'ironhold' as ProvinceId

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildTechnologyState', () => {
  it('starts with empty technologies and byCountry records', () => {
    expect(buildTechnologyState()).toEqual({ technologies: {}, byCountry: {} })
  })
})

describe('requestResearchTechnology — event payload', () => {
  it('emits construction:request with buildableType technology', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    requestResearchTechnology(bus, store, ownerId, locationId, 'agriculture')
    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({ buildableType: 'technology' }))
  })

  it.each<[TechnologyType, number]>([
    ['agriculture',       60],
    ['iron-working',      90],
    ['steel-working',    120],
    ['trade-routes',      80],
    ['writing',           70],
    ['siege-engineering', 100],
    ['cartography',       80],
    ['bureaucracy',       90],
  ])('emits correct durationFrames for %s (%i)', (technologyType: TechnologyType, expected: number) => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    requestResearchTechnology(bus, store, ownerId, locationId, technologyType)
    expect(bus.emit).toHaveBeenCalledWith(
      'construction:request',
      expect.objectContaining({ durationFrames: expected }),
    )
  })

  it('includes technologyType in metadata', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    requestResearchTechnology(bus, store, ownerId, locationId, 'writing')
    expect(bus.emit).toHaveBeenCalledWith(
      'construction:request',
      expect.objectContaining({ metadata: expect.objectContaining({ technologyType: 'writing' }) }),
    )
  })
})

describe('requestResearchTechnology — duplicate prevention', () => {
  it('emits technology:research-rejected if country already has the tech', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initTechnologyMechanic(bus, store)

    // Complete first research
    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'technology', completedFrame: 10, metadata: { technologyType: 'agriculture' },
    })

    // Try to research again
    requestResearchTechnology(bus, store, ownerId, locationId, 'agriculture')

    expect(bus.emit).toHaveBeenCalledWith('technology:research-rejected', {
      ownerId,
      technologyType: 'agriculture',
      reason: 'already-researched',
    })
  })

  it('does not emit construction:request when rejecting a duplicate', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initTechnologyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'technology', completedFrame: 10, metadata: { technologyType: 'agriculture' },
    })

    bus.emit.mockClear()
    requestResearchTechnology(bus, store, ownerId, locationId, 'agriculture')

    expect(bus.emit).not.toHaveBeenCalledWith('construction:request', expect.anything())
  })

  it('allows the same tech for different countries', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initTechnologyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'technology', completedFrame: 10, metadata: { technologyType: 'agriculture' },
    })

    // Different country requests the same tech — should be allowed
    requestResearchTechnology(bus, store, otherId, locationId, 'agriculture')

    expect(bus.emit).toHaveBeenCalledWith('construction:request', expect.objectContaining({ buildableType: 'technology' }))
  })
})

describe('isTechnologyType', () => {
  it.each<TechnologyType>([
    'agriculture', 'iron-working', 'steel-working', 'trade-routes',
    'writing', 'siege-engineering', 'cartography', 'bureaucracy',
  ])('returns true for %s', (tt: TechnologyType) => {
    expect(isTechnologyType(tt)).toBe(true)
  })

  it('returns false for an unknown string', () => {
    expect(isTechnologyType('gunpowder')).toBe(false)
  })

  it('returns false for a number', () => {
    expect(isTechnologyType(42)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isTechnologyType(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isTechnologyType(undefined)).toBe(false)
  })

  it('returns false for an object', () => {
    expect(isTechnologyType({ technologyType: 'agriculture' })).toBe(false)
  })
})

describe('initTechnologyMechanic — construction:complete handler', () => {
  it('ignores construction:complete events for non-technology buildableTypes', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initTechnologyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'army', completedFrame: 5, metadata: {},
    })

    expect(store.setState).not.toHaveBeenCalled()
  })

  it('ignores construction:complete with invalid metadata.technologyType', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initTechnologyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'technology', completedFrame: 5, metadata: { technologyType: 'gunpowder' },
    })

    expect(store.setState).not.toHaveBeenCalled()
  })

  it.each<TechnologyType>([
    'agriculture', 'iron-working', 'steel-working', 'trade-routes',
    'writing', 'siege-engineering', 'cartography', 'bureaucracy',
  ])('creates a %s entry in technologies state', (technologyType: TechnologyType) => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initTechnologyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'technology', completedFrame: 5, metadata: { technologyType },
    })

    const techs = store.getSlice('technology').technologies
    const entry = Object.values(techs)[0]
    expect(entry).toBeDefined()
    expect(entry.technologyType).toBe(technologyType)
  })

  it('adds the technologyType to the byCountry index', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initTechnologyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'technology', completedFrame: 5, metadata: { technologyType: 'writing' },
    })

    expect(store.getSlice('technology').byCountry[ownerId]).toContain('writing')
  })

  it('emits technology:research-completed with correct payload', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initTechnologyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'technology', completedFrame: 5, metadata: { technologyType: 'trade-routes' },
    })

    expect(bus.emit).toHaveBeenCalledWith('technology:research-completed', expect.objectContaining({
      countryId:      ownerId,
      technologyType: 'trade-routes',
    }))
  })

  it('ResearchedTechnology.completedFrame matches completedFrame from the event', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initTechnologyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'technology', completedFrame: 77, metadata: { technologyType: 'cartography' },
    })

    const entry = Object.values(store.getSlice('technology').technologies)[0]
    expect(entry.completedFrame).toBe(77)
  })

  it('multiple technologies can coexist for the same country', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initTechnologyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'technology', completedFrame: 1, metadata: { technologyType: 'agriculture' },
    })
    bus.emit('construction:complete', {
      jobId: 'j2' as JobId, ownerId, locationId,
      buildableType: 'technology', completedFrame: 2, metadata: { technologyType: 'writing' },
    })

    expect(Object.keys(store.getSlice('technology').technologies)).toHaveLength(2)
    expect(store.getSlice('technology').byCountry[ownerId]).toHaveLength(2)
  })

  it('technologies for different countries are tracked separately in byCountry', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    initTechnologyMechanic(bus, store)

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'technology', completedFrame: 1, metadata: { technologyType: 'agriculture' },
    })
    bus.emit('construction:complete', {
      jobId: 'j2' as JobId, ownerId: otherId, locationId,
      buildableType: 'technology', completedFrame: 2, metadata: { technologyType: 'writing' },
    })

    expect(store.getSlice('technology').byCountry[ownerId]).toEqual(['agriculture'])
    expect(store.getSlice('technology').byCountry[otherId]).toEqual(['writing'])
  })
})

describe('initTechnologyMechanic — destroy', () => {
  it('stops responding to construction:complete after destroy', () => {
    const bus   = makeMockEventBus()
    const store = makeStateStore()
    const { destroy } = initTechnologyMechanic(bus, store)
    destroy()

    bus.emit('construction:complete', {
      jobId: 'j1' as JobId, ownerId, locationId,
      buildableType: 'technology', completedFrame: 1, metadata: { technologyType: 'agriculture' },
    })

    expect(store.setState).not.toHaveBeenCalled()
  })
})
