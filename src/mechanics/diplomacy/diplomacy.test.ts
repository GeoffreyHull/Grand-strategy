import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CountryId } from '@contracts/mechanics/map'
import type { GameState } from '@contracts/state'
import type { EventMap } from '@contracts/events'
import { EventBus } from '../../engine/EventBus'
import { StateStore } from '../../engine/StateStore'
import { buildDiplomacyState, initDiplomacy } from './diplomacy'

// ── Helpers ───────────────────────────────────────────────────────────────────

function id(s: string): CountryId {
  return s as CountryId
}

function makeStore(framesPerTurn = 100): StateStore<GameState> {
  return new StateStore({
    diplomacy: buildDiplomacyState(framesPerTurn),
  } as unknown as GameState)
}

function makeBus(): EventBus<EventMap> {
  return new EventBus<EventMap>()
}

const A = id('country-a')
const B = id('country-b')
const C = id('country-c')
const D = id('country-d')

// ── buildDiplomacyState ───────────────────────────────────────────────────────

describe('buildDiplomacyState', () => {
  it('creates empty relations at turn 0', () => {
    const state = buildDiplomacyState()
    expect(state.relations).toEqual({})
    expect(state.currentTurn).toBe(0)
  })

  it('accepts a custom framesPerTurn', () => {
    const state = buildDiplomacyState(50)
    expect(state.framesPerTurn).toBe(50)
  })
})

// ── declareWar ────────────────────────────────────────────────────────────────

describe('declareWar', () => {
  it('sets relation to war and emits war-declared', () => {
    const bus = makeBus()
    const store = makeStore()
    const diplomacy = initDiplomacy(bus, store)

    const declared = vi.fn()
    bus.on('diplomacy:war-declared', declared)

    diplomacy.declareWar(A, B)

    expect(declared).toHaveBeenCalledWith({ declarerId: A, targetId: B })
    expect(diplomacy.getRelation(A, B)?.status).toBe('war')
  })

  it('is symmetric — canAttack works in both directions', () => {
    const diplomacy = initDiplomacy(makeBus(), makeStore())
    diplomacy.declareWar(A, B)
    expect(diplomacy.canAttack(A, B)).toBe(true)
    expect(diplomacy.canAttack(B, A)).toBe(true)
  })

  it('emits war-rejected with truce-active when a truce exists', () => {
    const bus = makeBus()
    const store = makeStore()
    const diplomacy = initDiplomacy(bus, store)

    // Put A-B into truce manually by declaring war then making peace
    diplomacy.declareWar(A, B)
    diplomacy.makePeace(A, B)

    const rejected = vi.fn()
    bus.on('diplomacy:war-rejected', rejected)

    diplomacy.declareWar(A, B)

    expect(rejected).toHaveBeenCalledWith({ declarerId: A, targetId: B, reason: 'truce-active' })
    expect(diplomacy.getRelation(A, B)?.status).toBe('truce')
  })

  it('emits war-rejected with already-at-war when already at war', () => {
    const bus = makeBus()
    const store = makeStore()
    const diplomacy = initDiplomacy(bus, store)
    diplomacy.declareWar(A, B)

    const rejected = vi.fn()
    bus.on('diplomacy:war-rejected', rejected)
    diplomacy.declareWar(A, B)

    expect(rejected).toHaveBeenCalledWith({ declarerId: A, targetId: B, reason: 'already-at-war' })
  })

  it('emits war-rejected with allied when targeting an ally', () => {
    const bus = makeBus()
    const store = makeStore()
    const diplomacy = initDiplomacy(bus, store)
    diplomacy.formAlliance(A, B)

    const rejected = vi.fn()
    bus.on('diplomacy:war-rejected', rejected)
    diplomacy.declareWar(A, B)

    expect(rejected).toHaveBeenCalledWith({ declarerId: A, targetId: B, reason: 'allied' })
  })

  it("calls declarer's allies into the war", () => {
    const bus = makeBus()
    const store = makeStore()
    const diplomacy = initDiplomacy(bus, store)
    diplomacy.formAlliance(A, C) // C is allied to A

    const called = vi.fn()
    bus.on('diplomacy:ally-called-to-war', called)

    diplomacy.declareWar(A, B) // C should be called in against B

    expect(called).toHaveBeenCalledWith({ allyId: C, calledById: A, warTargetId: B })
    expect(diplomacy.getRelation(C, B)?.status).toBe('war')
  })

  it("calls target's allies into the war against the declarer", () => {
    const bus = makeBus()
    const store = makeStore()
    const diplomacy = initDiplomacy(bus, store)
    diplomacy.formAlliance(B, D) // D is allied to B

    const called = vi.fn()
    bus.on('diplomacy:ally-called-to-war', called)

    diplomacy.declareWar(A, B) // D should be called in against A

    expect(called).toHaveBeenCalledWith({ allyId: D, calledById: B, warTargetId: A })
    expect(diplomacy.getRelation(D, A)?.status).toBe('war')
  })

  it('does not call an ally into war if that ally has a truce with the target', () => {
    const bus = makeBus()
    const store = makeStore()
    const diplomacy = initDiplomacy(bus, store)

    // First give C a truce with B
    diplomacy.declareWar(C, B)
    diplomacy.makePeace(C, B) // C-B truce

    diplomacy.formAlliance(A, C) // C is allied to A

    const called = vi.fn()
    bus.on('diplomacy:ally-called-to-war', called)

    diplomacy.declareWar(A, B) // C should NOT be called in (truce with B)

    expect(called).not.toHaveBeenCalled()
  })
})

// ── makePeace ─────────────────────────────────────────────────────────────────

describe('makePeace', () => {
  it('changes status to truce and emits peace-made', () => {
    const bus = makeBus()
    const store = makeStore()
    const diplomacy = initDiplomacy(bus, store)
    diplomacy.declareWar(A, B)

    const peaceMade = vi.fn()
    bus.on('diplomacy:peace-made', peaceMade)

    diplomacy.makePeace(A, B)

    expect(peaceMade).toHaveBeenCalledWith({ countryA: A, countryB: B })
    expect(diplomacy.getRelation(A, B)?.status).toBe('truce')
  })

  it('sets truceExpiresAtTurn to currentTurn + 5', () => {
    const store = makeStore()
    const diplomacy = initDiplomacy(makeBus(), store)
    diplomacy.declareWar(A, B)
    diplomacy.makePeace(A, B)

    const relation = diplomacy.getRelation(A, B)
    expect(relation?.truceExpiresAtTurn).toBe(5)
  })

  it('does nothing if countries are not at war', () => {
    const bus = makeBus()
    const store = makeStore()
    const diplomacy = initDiplomacy(bus, store)

    const peaceMade = vi.fn()
    bus.on('diplomacy:peace-made', peaceMade)
    diplomacy.makePeace(A, B)

    expect(peaceMade).not.toHaveBeenCalled()
  })

  it("forces A's allies at war with B into peace", () => {
    const bus = makeBus()
    const store = makeStore()
    const diplomacy = initDiplomacy(bus, store)

    // C is allied with A; both A and C are at war with B
    diplomacy.formAlliance(A, C)
    diplomacy.declareWar(A, B) // auto-calls C into war with B

    const forced = vi.fn()
    bus.on('diplomacy:ally-forced-peace', forced)

    diplomacy.makePeace(A, B) // C should also be forced to peace with B

    expect(forced).toHaveBeenCalledWith({ allyId: C, peaceCountryId: A, enemyId: B })
    expect(diplomacy.getRelation(C, B)?.status).toBe('truce')
  })

  it("forces B's allies at war with A into peace", () => {
    const bus = makeBus()
    const store = makeStore()
    const diplomacy = initDiplomacy(bus, store)

    diplomacy.formAlliance(B, D)
    diplomacy.declareWar(A, B) // D gets called in against A

    const forced = vi.fn()
    bus.on('diplomacy:ally-forced-peace', forced)

    diplomacy.makePeace(A, B)

    expect(forced).toHaveBeenCalledWith({ allyId: D, peaceCountryId: B, enemyId: A })
    expect(diplomacy.getRelation(D, A)?.status).toBe('truce')
  })

  it('blocks canAttack after peace', () => {
    const diplomacy = initDiplomacy(makeBus(), makeStore())
    diplomacy.declareWar(A, B)
    diplomacy.makePeace(A, B)
    expect(diplomacy.canAttack(A, B)).toBe(false)
  })
})

// ── signNonAggressionPact ─────────────────────────────────────────────────────

describe('signNonAggressionPact', () => {
  it('sets relation to non-aggression and emits event', () => {
    const bus = makeBus()
    const diplomacy = initDiplomacy(bus, makeStore())

    const signed = vi.fn()
    bus.on('diplomacy:non-aggression-pact-signed', signed)

    diplomacy.signNonAggressionPact(A, B)

    expect(signed).toHaveBeenCalledWith({ countryA: A, countryB: B })
    expect(diplomacy.getRelation(A, B)?.status).toBe('non-aggression')
  })

  it('is a no-op when countries are at war', () => {
    const bus = makeBus()
    const diplomacy = initDiplomacy(bus, makeStore())
    diplomacy.declareWar(A, B)

    const signed = vi.fn()
    bus.on('diplomacy:non-aggression-pact-signed', signed)
    diplomacy.signNonAggressionPact(A, B)

    expect(signed).not.toHaveBeenCalled()
    expect(diplomacy.getRelation(A, B)?.status).toBe('war')
  })

  it('is a no-op when already non-aggression', () => {
    const bus = makeBus()
    const diplomacy = initDiplomacy(bus, makeStore())
    diplomacy.signNonAggressionPact(A, B)

    const signed = vi.fn()
    bus.on('diplomacy:non-aggression-pact-signed', signed)
    diplomacy.signNonAggressionPact(A, B)

    expect(signed).not.toHaveBeenCalled()
  })
})

// ── formAlliance ──────────────────────────────────────────────────────────────

describe('formAlliance', () => {
  it('sets relation to allied and emits event', () => {
    const bus = makeBus()
    const diplomacy = initDiplomacy(bus, makeStore())

    const formed = vi.fn()
    bus.on('diplomacy:alliance-formed', formed)

    diplomacy.formAlliance(A, B)

    expect(formed).toHaveBeenCalledWith({ countryA: A, countryB: B })
    expect(diplomacy.getRelation(A, B)?.status).toBe('allied')
  })

  it('is a no-op when countries are at war', () => {
    const bus = makeBus()
    const diplomacy = initDiplomacy(bus, makeStore())
    diplomacy.declareWar(A, B)

    const formed = vi.fn()
    bus.on('diplomacy:alliance-formed', formed)
    diplomacy.formAlliance(A, B)

    expect(formed).not.toHaveBeenCalled()
  })

  it('is a no-op when already allied', () => {
    const bus = makeBus()
    const diplomacy = initDiplomacy(bus, makeStore())
    diplomacy.formAlliance(A, B)

    const formed = vi.fn()
    bus.on('diplomacy:alliance-formed', formed)
    diplomacy.formAlliance(A, B)

    expect(formed).not.toHaveBeenCalled()
  })
})

// ── canAttack ─────────────────────────────────────────────────────────────────

describe('canAttack', () => {
  it('returns false for neutral countries', () => {
    const diplomacy = initDiplomacy(makeBus(), makeStore())
    expect(diplomacy.canAttack(A, B)).toBe(false)
  })

  it('returns false for non-aggression pact', () => {
    const diplomacy = initDiplomacy(makeBus(), makeStore())
    diplomacy.signNonAggressionPact(A, B)
    expect(diplomacy.canAttack(A, B)).toBe(false)
  })

  it('returns false for allies', () => {
    const diplomacy = initDiplomacy(makeBus(), makeStore())
    diplomacy.formAlliance(A, B)
    expect(diplomacy.canAttack(A, B)).toBe(false)
  })

  it('returns true only when at war', () => {
    const diplomacy = initDiplomacy(makeBus(), makeStore())
    diplomacy.declareWar(A, B)
    expect(diplomacy.canAttack(A, B)).toBe(true)
  })
})

// ── update / truce expiry ─────────────────────────────────────────────────────

describe('update / truce expiry', () => {
  it('advances currentTurn every framesPerTurn frames', () => {
    const store = makeStore(3)
    const diplomacy = initDiplomacy(makeBus(), store)
    const ctx = { deltaMs: 50, totalMs: 50, frame: 0 }

    diplomacy.update(ctx)
    diplomacy.update(ctx)
    expect(store.getSlice('diplomacy').currentTurn).toBe(0)

    diplomacy.update(ctx) // 3rd frame — turn advances
    expect(store.getSlice('diplomacy').currentTurn).toBe(1)
  })

  it('expires a truce after 5 turns and emits truce-expired', () => {
    const bus = makeBus()
    const store = makeStore(1) // 1 frame = 1 turn for easy testing
    const diplomacy = initDiplomacy(bus, store)

    diplomacy.declareWar(A, B)
    diplomacy.makePeace(A, B) // truce expires at turn 5

    const expired = vi.fn()
    bus.on('diplomacy:truce-expired', expired)

    const ctx = { deltaMs: 50, totalMs: 50, frame: 0 }

    // Advance 4 turns — truce should still hold
    for (let i = 0; i < 4; i++) diplomacy.update(ctx)
    expect(diplomacy.getRelation(A, B)?.status).toBe('truce')
    expect(expired).not.toHaveBeenCalled()

    // 5th turn — truce expires
    diplomacy.update(ctx)
    expect(diplomacy.getRelation(A, B)?.status).toBe('neutral')
    expect(expired).toHaveBeenCalledWith({ countryA: A, countryB: B })
  })

  it('allows war to be declared after truce expires', () => {
    const bus = makeBus()
    const store = makeStore(1)
    const diplomacy = initDiplomacy(bus, store)

    diplomacy.declareWar(A, B)
    diplomacy.makePeace(A, B)

    const ctx = { deltaMs: 50, totalMs: 50, frame: 0 }
    for (let i = 0; i < 5; i++) diplomacy.update(ctx)

    const declared = vi.fn()
    bus.on('diplomacy:war-declared', declared)
    diplomacy.declareWar(A, B)

    expect(declared).toHaveBeenCalled()
    expect(diplomacy.canAttack(A, B)).toBe(true)
  })
})

// ── getRelation ───────────────────────────────────────────────────────────────

describe('getRelation', () => {
  it('returns null when no explicit relation exists', () => {
    const diplomacy = initDiplomacy(makeBus(), makeStore())
    expect(diplomacy.getRelation(A, B)).toBeNull()
  })

  it('returns the same relation regardless of argument order', () => {
    const diplomacy = initDiplomacy(makeBus(), makeStore())
    diplomacy.declareWar(A, B)
    expect(diplomacy.getRelation(A, B)).toEqual(diplomacy.getRelation(B, A))
  })
})
