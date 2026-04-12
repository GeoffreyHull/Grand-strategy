import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildConstructionState, initConstructionMechanic } from './index'
import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { JobId } from '@contracts/mechanics/construction'
import type { TickContext } from '../../engine/GameLoop'

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
    return { unsubscribe: vi.fn(() => { handlers.get(event as string)?.delete(handler as Handler<keyof EventMap>) }) }
  })

  return { emit, on, off: vi.fn(), once: vi.fn() } as unknown as EventBus<EventMap> & { emit: typeof emit; on: typeof on }
}

function makeStateStore(initial: Partial<GameState> = {}) {
  let state = {
    construction: buildConstructionState(),
    ...initial,
  } as GameState

  return {
    getSlice: vi.fn(<K extends keyof GameState>(key: K) => state[key]),
    getState: vi.fn(() => state),
    setState: vi.fn((updater: (draft: GameState) => GameState) => { state = updater(state) }),
    subscribe: vi.fn(),
  } as unknown as StateStore<GameState>
}

function makeCtx(turn: number): TickContext {
  return { turn, frame: turn * 300, deltaMs: 50, totalMs: turn * 300 * 50 }
}

const jobId1 = 'job-1' as JobId
const jobId2 = 'job-2' as JobId

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildConstructionState', () => {
  it('starts with an empty jobs record', () => {
    expect(buildConstructionState()).toEqual({ jobs: {} })
  })
})

describe('initConstructionMechanic — construction:request handler', () => {
  it('adds a job to state when a valid request is received', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initConstructionMechanic(bus, store)

    bus.emit('construction:request', {
      jobId: jobId1, ownerId: 'c1' as never, locationId: 'p1' as never,
      buildableType: 'army', durationTurns: 10, metadata: {},
    })

    expect(store.setState).toHaveBeenCalledOnce()
    const updater = (store.setState as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const next = updater({ construction: buildConstructionState() } as GameState)
    expect(next.construction.jobs[jobId1]).toBeDefined()
    expect(next.construction.jobs[jobId1].progressTurns).toBe(0)
  })

  it('emits construction:enqueued after adding a job', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initConstructionMechanic(bus, store)

    bus.emit('construction:request', {
      jobId: jobId1, ownerId: 'c1' as never, locationId: 'p1' as never,
      buildableType: 'army', durationTurns: 10, metadata: {},
    })

    expect(bus.emit).toHaveBeenCalledWith('construction:enqueued', expect.objectContaining({ jobId: jobId1 }))
  })

  it('emits construction:cancelled for a duplicate jobId', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initConstructionMechanic(bus, store)

    bus.emit('construction:request', {
      jobId: jobId1, ownerId: 'c1' as never, locationId: 'p1' as never,
      buildableType: 'army', durationTurns: 10, metadata: {},
    })
    bus.emit('construction:request', {
      jobId: jobId1, ownerId: 'c1' as never, locationId: 'p1' as never,
      buildableType: 'army', durationTurns: 10, metadata: {},
    })

    expect(bus.emit).toHaveBeenCalledWith('construction:cancelled', expect.objectContaining({ jobId: jobId1, reason: 'duplicate-job-id' }))
  })

  it('does not add a duplicate job to state', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    initConstructionMechanic(bus, store)

    bus.emit('construction:request', {
      jobId: jobId1, ownerId: 'c1' as never, locationId: 'p1' as never,
      buildableType: 'army', durationTurns: 10, metadata: {},
    })
    const callsBefore = (store.setState as ReturnType<typeof vi.fn>).mock.calls.length

    bus.emit('construction:request', {
      jobId: jobId1, ownerId: 'c1' as never, locationId: 'p1' as never,
      buildableType: 'army', durationTurns: 10, metadata: {},
    })

    expect((store.setState as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })
})

describe('initConstructionMechanic — update tick', () => {
  it('increments progressTurns each tick', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    const { update } = initConstructionMechanic(bus, store)

    bus.emit('construction:request', {
      jobId: jobId1, ownerId: 'c1' as never, locationId: 'p1' as never,
      buildableType: 'army', durationTurns: 5, metadata: {},
    })

    update(makeCtx(1))
    expect(store.getSlice('construction').jobs[jobId1].progressTurns).toBe(1)
  })

  it('does not complete a job before durationTurns ticks', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    const { update } = initConstructionMechanic(bus, store)

    bus.emit('construction:request', {
      jobId: jobId1, ownerId: 'c1' as never, locationId: 'p1' as never,
      buildableType: 'army', durationTurns: 3, metadata: {},
    })

    update(makeCtx(1))
    update(makeCtx(2))

    expect(store.getSlice('construction').jobs[jobId1]).toBeDefined()
    expect(bus.emit).not.toHaveBeenCalledWith('construction:complete', expect.anything())
  })

  it('removes a job from state when progressTurns reaches durationTurns', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    const { update } = initConstructionMechanic(bus, store)

    bus.emit('construction:request', {
      jobId: jobId1, ownerId: 'c1' as never, locationId: 'p1' as never,
      buildableType: 'army', durationTurns: 3, metadata: {},
    })

    update(makeCtx(1))
    update(makeCtx(2))
    update(makeCtx(3))

    expect(store.getSlice('construction').jobs[jobId1]).toBeUndefined()
  })

  it('emits construction:complete with correct payload on completion', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    const { update } = initConstructionMechanic(bus, store)

    bus.emit('construction:request', {
      jobId: jobId1, ownerId: 'c1' as never, locationId: 'p1' as never,
      buildableType: 'fleet', durationTurns: 2, metadata: { extra: true },
    })

    update(makeCtx(1))
    update(makeCtx(99))

    expect(bus.emit).toHaveBeenCalledWith('construction:complete', expect.objectContaining({
      jobId:         jobId1,
      buildableType: 'fleet',
      ownerId:       'c1',
      locationId:    'p1',
      completedTurn: 99,
      metadata:      { extra: true },
    }))
  })

  it('passes metadata through to construction:complete unchanged', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    const { update } = initConstructionMechanic(bus, store)
    const meta = { buildingType: 'barracks', custom: 42 }

    bus.emit('construction:request', {
      jobId: jobId1, ownerId: 'c1' as never, locationId: 'p1' as never,
      buildableType: 'building', durationTurns: 1, metadata: meta,
    })

    update(makeCtx(1))

    expect(bus.emit).toHaveBeenCalledWith('construction:complete', expect.objectContaining({ metadata: meta }))
  })

  it('completes multiple jobs in the same tick when both reach duration', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    const { update } = initConstructionMechanic(bus, store)

    bus.emit('construction:request', {
      jobId: jobId1, ownerId: 'c1' as never, locationId: 'p1' as never,
      buildableType: 'army', durationTurns: 2, metadata: {},
    })
    bus.emit('construction:request', {
      jobId: jobId2, ownerId: 'c1' as never, locationId: 'p2' as never,
      buildableType: 'fleet', durationTurns: 2, metadata: {},
    })

    update(makeCtx(1))
    update(makeCtx(2))

    const completeCalls = (bus.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === 'construction:complete'
    )
    expect(completeCalls).toHaveLength(2)
  })
})

describe('initConstructionMechanic — destroy', () => {
  it('unsubscribes from construction:request on destroy', () => {
    const bus = makeMockEventBus()
    const store = makeStateStore()
    const { destroy } = initConstructionMechanic(bus, store)
    destroy()

    bus.emit('construction:request', {
      jobId: jobId1, ownerId: 'c1' as never, locationId: 'p1' as never,
      buildableType: 'army', durationTurns: 5, metadata: {},
    })

    expect(store.setState).not.toHaveBeenCalled()
  })
})
