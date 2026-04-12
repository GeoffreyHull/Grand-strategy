import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { TickContext } from '../../engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { CountryId } from '@contracts/mechanics/map'
import type { DiplomaticRelation, DiplomaticStatus, DiplomacyState } from '@contracts/mechanics/diplomacy'
import { makeRelationKey, sortedPair, TRUCE_DURATION_TURNS, TRUCE_REQUEST_EXPIRY_TURNS } from './types'

// ── Initial state factory ─────────────────────────────────────────────────────

export function buildDiplomacyState(): DiplomacyState {
  return {
    relations: {},
    pendingTruceRequests: {},
    currentTurn: 0,
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function getStatus(
  a: CountryId,
  b: CountryId,
  relations: Readonly<Record<string, DiplomaticRelation>>,
): DiplomaticStatus | 'neutral' {
  const key = makeRelationKey(a as string, b as string)
  return relations[key]?.status ?? 'neutral'
}

function getAllies(
  countryId: CountryId,
  relations: Readonly<Record<string, DiplomaticRelation>>,
): CountryId[] {
  return Object.values(relations)
    .filter(r => r.status === 'allied' && (r.countryA === countryId || r.countryB === countryId))
    .map(r => (r.countryA === countryId ? r.countryB : r.countryA))
}

/** Write one or more relation updates into state in a single setState call. */
function applyRelationUpdates(
  store: StateStore<GameState>,
  updates: ReadonlyArray<{
    a: CountryId
    b: CountryId
    status: DiplomaticStatus
    truceExpiry?: number
  }>,
): void {
  store.setState(draft => {
    const relations = { ...draft.diplomacy.relations }
    for (const { a, b, status, truceExpiry } of updates) {
      const [ca, cb] = sortedPair(a as string, b as string) as [CountryId, CountryId]
      const key = makeRelationKey(ca as string, cb as string)
      relations[key] = {
        countryA: ca,
        countryB: cb,
        status,
        truceExpiresAtTurn: truceExpiry ?? null,
      }
    }
    return { ...draft, diplomacy: { ...draft.diplomacy, relations } }
  })
}

// ── Public mechanic factory ───────────────────────────────────────────────────

export interface DiplomacyMechanic {
  /** Called every game frame. Advances turn counter and expires truces. */
  update: (ctx: TickContext) => void

  /** Returns true only when the two countries are at war (prerequisite for attacks). */
  canAttack: (attackerId: CountryId, targetId: CountryId) => boolean

  /**
   * Declare war from declarerId on targetId.
   * - Blocked if a truce, existing war, or alliance is in place (emits war-rejected).
   * - Automatically calls allied countries into the war on both sides.
   */
  declareWar: (declarerId: CountryId, targetId: CountryId) => void

  /**
   * End a war between the two countries, placing a 5-turn truce.
   * Allied countries at war with the same enemy are also forced to peace.
   */
  makePeace: (countryA: CountryId, countryB: CountryId) => void

  /**
   * Sign a Non-Aggression Pact. Blocked if the countries are at war.
   * Upgrades an existing neutral relation; silently ignored if already NAP/allied.
   */
  signNonAggressionPact: (countryA: CountryId, countryB: CountryId) => void

  /**
   * Form an alliance. Blocked if the countries are at war.
   * Silently ignored if already allied.
   */
  formAlliance: (countryA: CountryId, countryB: CountryId) => void

  /**
   * Submit a truce request from requesterId to targetId.
   * - Blocked unless the two countries are currently at war.
   * - Silently ignored if a request for this pair is already pending.
   * - Emits diplomacy:truce-requested so the target can respond.
   */
  requestTruce: (requesterId: CountryId, targetId: CountryId) => void

  /**
   * Resolve a pending truce request.
   * - If accept is true: calls makePeace and emits diplomacy:truce-accepted.
   * - If accept is false: emits diplomacy:truce-rejected.
   * - Silently ignored if no pending request exists for this pair.
   */
  respondToTruceRequest: (requesterId: CountryId, targetId: CountryId, accept: boolean) => void

  /** Returns the full relation record, or null if no explicit relation exists (implies neutral). */
  getRelation: (countryA: CountryId, countryB: CountryId) => DiplomaticRelation | null

  /** Unsubscribes any internal event subscriptions. */
  destroy: () => void
}

export function initDiplomacy(
  bus: EventBus<EventMap>,
  store: StateStore<GameState>,
): DiplomacyMechanic {
  let lastProcessedTurn = -1

  // ── declareWar ──────────────────────────────────────────────────────────────

  function declareWar(declarerId: CountryId, targetId: CountryId): void {
    const { relations } = store.getSlice('diplomacy')
    const currentStatus = getStatus(declarerId, targetId, relations)

    if (currentStatus === 'truce') {
      bus.emit('diplomacy:war-rejected', { declarerId, targetId, reason: 'truce-active' })
      return
    }
    if (currentStatus === 'war') {
      bus.emit('diplomacy:war-rejected', { declarerId, targetId, reason: 'already-at-war' })
      return
    }
    if (currentStatus === 'allied') {
      bus.emit('diplomacy:war-rejected', { declarerId, targetId, reason: 'allied' })
      return
    }

    // Set the primary war relation
    applyRelationUpdates(store, [{ a: declarerId, b: targetId, status: 'war' }])
    bus.emit('diplomacy:war-declared', { declarerId, targetId })
    bus.emit('diplomacy:relation-changed', {
      countryA: declarerId,
      countryB: targetId,
      oldStatus: currentStatus,
      newStatus: 'war',
    })

    // Call in allies of the declarer against the target
    const declarerAllies = getAllies(declarerId, store.getSlice('diplomacy').relations)
    for (const ally of declarerAllies) {
      if ((ally as string) === (targetId as string)) continue
      const allyStatus = getStatus(ally, targetId, store.getSlice('diplomacy').relations)
      if (allyStatus === 'truce' || allyStatus === 'war' || allyStatus === 'allied') continue
      applyRelationUpdates(store, [{ a: ally, b: targetId, status: 'war' }])
      bus.emit('diplomacy:ally-called-to-war', { allyId: ally, calledById: declarerId, warTargetId: targetId })
      bus.emit('diplomacy:relation-changed', {
        countryA: ally,
        countryB: targetId,
        oldStatus: allyStatus,
        newStatus: 'war',
      })
    }

    // Call in allies of the target against the declarer
    const targetAllies = getAllies(targetId, store.getSlice('diplomacy').relations)
    for (const ally of targetAllies) {
      if ((ally as string) === (declarerId as string)) continue
      const allyStatus = getStatus(ally, declarerId, store.getSlice('diplomacy').relations)
      if (allyStatus === 'truce' || allyStatus === 'war' || allyStatus === 'allied') continue
      applyRelationUpdates(store, [{ a: ally, b: declarerId, status: 'war' }])
      bus.emit('diplomacy:ally-called-to-war', { allyId: ally, calledById: targetId, warTargetId: declarerId })
      bus.emit('diplomacy:relation-changed', {
        countryA: ally,
        countryB: declarerId,
        oldStatus: allyStatus,
        newStatus: 'war',
      })
    }
  }

  // ── makePeace ───────────────────────────────────────────────────────────────

  function makePeace(countryA: CountryId, countryB: CountryId): void {
    const { relations, currentTurn } = store.getSlice('diplomacy')
    const currentStatus = getStatus(countryA, countryB, relations)
    if (currentStatus !== 'war') return

    const truceExpiry = currentTurn + TRUCE_DURATION_TURNS

    // Set truce between the two belligerents
    applyRelationUpdates(store, [{ a: countryA, b: countryB, status: 'truce', truceExpiry }])
    bus.emit('diplomacy:peace-made', { countryA, countryB })
    bus.emit('diplomacy:relation-changed', {
      countryA,
      countryB,
      oldStatus: 'war',
      newStatus: 'truce',
    })

    // Force allies of A that are at war with B into peace
    const alliesOfA = getAllies(countryA, store.getSlice('diplomacy').relations)
    for (const ally of alliesOfA) {
      if ((ally as string) === (countryB as string)) continue
      if (getStatus(ally, countryB, store.getSlice('diplomacy').relations) === 'war') {
        applyRelationUpdates(store, [{ a: ally, b: countryB, status: 'truce', truceExpiry }])
        bus.emit('diplomacy:ally-forced-peace', { allyId: ally, peaceCountryId: countryA, enemyId: countryB })
        bus.emit('diplomacy:relation-changed', {
          countryA: ally,
          countryB,
          oldStatus: 'war',
          newStatus: 'truce',
        })
      }
    }

    // Force allies of B that are at war with A into peace
    const alliesOfB = getAllies(countryB, store.getSlice('diplomacy').relations)
    for (const ally of alliesOfB) {
      if ((ally as string) === (countryA as string)) continue
      if (getStatus(ally, countryA, store.getSlice('diplomacy').relations) === 'war') {
        applyRelationUpdates(store, [{ a: ally, b: countryA, status: 'truce', truceExpiry }])
        bus.emit('diplomacy:ally-forced-peace', { allyId: ally, peaceCountryId: countryB, enemyId: countryA })
        bus.emit('diplomacy:relation-changed', {
          countryA: ally,
          countryB: countryA,
          oldStatus: 'war',
          newStatus: 'truce',
        })
      }
    }
  }

  // ── signNonAggressionPact ────────────────────────────────────────────────────

  function signNonAggressionPact(countryA: CountryId, countryB: CountryId): void {
    const { relations } = store.getSlice('diplomacy')
    const currentStatus = getStatus(countryA, countryB, relations)
    if (currentStatus === 'war' || currentStatus === 'non-aggression' || currentStatus === 'allied') return
    applyRelationUpdates(store, [{ a: countryA, b: countryB, status: 'non-aggression' }])
    bus.emit('diplomacy:non-aggression-pact-signed', { countryA, countryB })
    bus.emit('diplomacy:relation-changed', { countryA, countryB, oldStatus: currentStatus, newStatus: 'non-aggression' })
  }

  // ── formAlliance ─────────────────────────────────────────────────────────────

  function formAlliance(countryA: CountryId, countryB: CountryId): void {
    const { relations } = store.getSlice('diplomacy')
    const currentStatus = getStatus(countryA, countryB, relations)
    if (currentStatus === 'war' || currentStatus === 'allied') return
    applyRelationUpdates(store, [{ a: countryA, b: countryB, status: 'allied' }])
    bus.emit('diplomacy:alliance-formed', { countryA, countryB })
    bus.emit('diplomacy:relation-changed', { countryA, countryB, oldStatus: currentStatus, newStatus: 'allied' })
  }

  // ── requestTruce ──────────────────────────────────────────────────────────────

  function requestTruce(requesterId: CountryId, targetId: CountryId): void {
    const { relations, pendingTruceRequests, currentTurn } = store.getSlice('diplomacy')

    // Only valid while at war
    if (getStatus(requesterId, targetId, relations) !== 'war') return

    // One pending request per pair at a time
    const key = makeRelationKey(requesterId as string, targetId as string)
    if (pendingTruceRequests[key] !== undefined) return

    store.setState(draft => ({
      ...draft,
      diplomacy: {
        ...draft.diplomacy,
        pendingTruceRequests: {
          ...draft.diplomacy.pendingTruceRequests,
          [key]: { requesterId, targetId, requestedAtTurn: currentTurn },
        },
      },
    }))

    bus.emit('diplomacy:truce-requested', { requesterId, targetId })
  }

  // ── respondToTruceRequest ─────────────────────────────────────────────────────

  function respondToTruceRequest(requesterId: CountryId, targetId: CountryId, accept: boolean): void {
    const { pendingTruceRequests } = store.getSlice('diplomacy')
    const key = makeRelationKey(requesterId as string, targetId as string)
    const pending = pendingTruceRequests[key]
    if (pending === undefined) return

    // Remove the pending request
    store.setState(draft => {
      const next = { ...draft.diplomacy.pendingTruceRequests }
      delete next[key]
      return { ...draft, diplomacy: { ...draft.diplomacy, pendingTruceRequests: next } }
    })

    if (accept) {
      makePeace(pending.requesterId, pending.targetId)
      bus.emit('diplomacy:truce-accepted', { requesterId: pending.requesterId, targetId: pending.targetId })
    } else {
      bus.emit('diplomacy:truce-rejected', { requesterId: pending.requesterId, targetId: pending.targetId })
    }
  }

  // ── canAttack ─────────────────────────────────────────────────────────────────

  function canAttack(attackerId: CountryId, targetId: CountryId): boolean {
    return getStatus(attackerId, targetId, store.getSlice('diplomacy').relations) === 'war'
  }

  // ── getRelation ───────────────────────────────────────────────────────────────

  function getRelation(countryA: CountryId, countryB: CountryId): DiplomaticRelation | null {
    const key = makeRelationKey(countryA as string, countryB as string)
    return store.getSlice('diplomacy').relations[key] ?? null
  }

  // ── update ────────────────────────────────────────────────────────────────────

  function update(ctx: TickContext): void {
    if (ctx.turn === lastProcessedTurn) return
    lastProcessedTurn = ctx.turn

    // Sync the canonical turn counter into state
    store.setState(draft => ({
      ...draft,
      diplomacy: { ...draft.diplomacy, currentTurn: ctx.turn },
    }))

    const { currentTurn, relations } = store.getSlice('diplomacy')

    // Expire truces whose duration has elapsed
    const expired = Object.values(relations).filter(
      r => r.status === 'truce' && r.truceExpiresAtTurn !== null && r.truceExpiresAtTurn <= currentTurn,
    )
    for (const truce of expired) {
      applyRelationUpdates(store, [{ a: truce.countryA, b: truce.countryB, status: 'neutral' }])
      bus.emit('diplomacy:truce-expired', { countryA: truce.countryA, countryB: truce.countryB })
      bus.emit('diplomacy:relation-changed', {
        countryA: truce.countryA,
        countryB: truce.countryB,
        oldStatus: 'truce',
        newStatus: 'neutral',
      })
    }

    // Expire unanswered truce requests
    const { pendingTruceRequests } = store.getSlice('diplomacy')
    const expiredRequests = Object.values(pendingTruceRequests).filter(
      r => r.requestedAtTurn + TRUCE_REQUEST_EXPIRY_TURNS <= currentTurn,
    )
    for (const req of expiredRequests) {
      const key = makeRelationKey(req.requesterId as string, req.targetId as string)
      store.setState(draft => {
        const next = { ...draft.diplomacy.pendingTruceRequests }
        delete next[key]
        return { ...draft, diplomacy: { ...draft.diplomacy, pendingTruceRequests: next } }
      })
      bus.emit('diplomacy:truce-rejected', { requesterId: req.requesterId, targetId: req.targetId })
    }
  }

  return { update, canAttack, declareWar, makePeace, signNonAggressionPact, formAlliance, requestTruce, respondToTruceRequest, getRelation, destroy: () => {} }
}
