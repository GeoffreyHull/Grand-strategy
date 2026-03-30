import type { EventBus } from '../../engine/EventBus'
import type { StateStore } from '../../engine/StateStore'
import type { TickContext } from '../../engine/GameLoop'
import type { EventMap } from '@contracts/events'
import type { GameState } from '@contracts/state'
import type { ConstructionJob, JobId } from '@contracts/mechanics/construction'

export type { ConstructionJob, ConstructionState, JobId, BuildableType } from '@contracts/mechanics/construction'

export function buildConstructionState() {
  return { jobs: {} as Record<JobId, ConstructionJob> }
}

export function initConstructionMechanic(
  eventBus: EventBus<EventMap>,
  stateStore: StateStore<GameState>,
): { update: (ctx: TickContext) => void; destroy: () => void } {
  const sub = eventBus.on('construction:request', (payload) => {
    const { jobs } = stateStore.getSlice('construction')

    if (jobs[payload.jobId] !== undefined) {
      eventBus.emit('construction:cancelled', {
        jobId: payload.jobId,
        reason: 'duplicate-job-id',
      })
      return
    }

    const job: ConstructionJob = {
      jobId:          payload.jobId,
      ownerId:        payload.ownerId,
      locationId:     payload.locationId,
      buildableType:  payload.buildableType,
      durationFrames: payload.durationFrames,
      progressFrames: 0,
      metadata:       payload.metadata,
    }

    stateStore.setState(draft => ({
      ...draft,
      construction: { jobs: { ...draft.construction.jobs, [job.jobId]: job } },
    }))

    eventBus.emit('construction:enqueued', {
      jobId:         job.jobId,
      ownerId:       job.ownerId,
      buildableType: job.buildableType,
    })
  })

  function update(ctx: TickContext): void {
    const { jobs } = stateStore.getSlice('construction')
    const entries = Object.entries(jobs) as [JobId, ConstructionJob][]
    if (entries.length === 0) return

    const nextJobs: Record<JobId, ConstructionJob> = {}
    const completed: ConstructionJob[] = []

    for (const [jobId, job] of entries) {
      const next = job.progressFrames + 1
      if (next >= job.durationFrames) {
        completed.push(job)
      } else {
        nextJobs[jobId] = { ...job, progressFrames: next }
      }
    }

    stateStore.setState(draft => ({
      ...draft,
      construction: { jobs: nextJobs },
    }))

    for (const job of completed) {
      eventBus.emit('construction:complete', {
        jobId:          job.jobId,
        ownerId:        job.ownerId,
        locationId:     job.locationId,
        buildableType:  job.buildableType,
        completedFrame: ctx.frame,
        metadata:       job.metadata,
      })
    }
  }

  function destroy(): void {
    sub.unsubscribe()
  }

  return { update, destroy }
}
