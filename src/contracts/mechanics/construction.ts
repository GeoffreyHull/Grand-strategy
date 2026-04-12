import type { CountryId, ProvinceId } from './map'

export type JobId = string & { readonly __brand: 'JobId' }

export type BuildableType = 'army' | 'fleet' | 'building' | 'technology'

export interface ConstructionJob {
  readonly jobId: JobId
  readonly ownerId: CountryId
  readonly locationId: ProvinceId
  readonly buildableType: BuildableType
  readonly durationTurns: number
  readonly progressTurns: number
  readonly metadata: Readonly<Record<string, unknown>>
}

export interface ConstructionState {
  readonly jobs: Readonly<Record<JobId, ConstructionJob>>
}
