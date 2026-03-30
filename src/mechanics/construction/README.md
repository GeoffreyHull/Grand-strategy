# Construction

## Purpose

Generic build queue for all constructable things in the game (armies, fleets, buildings). Owns the timer/progress logic and emits completion events. The construction mechanic is deliberately type-agnostic — it does not know what an "army" or "building" is. Other mechanics subscribe to `construction:complete` and filter by `buildableType`.

## Public API

| Export | Description |
|--------|-------------|
| `buildConstructionState()` | Returns the initial `ConstructionState` `{ jobs: {} }` |
| `initConstructionMechanic(eventBus, stateStore)` | Subscribes to `construction:request`, returns `{ update, destroy }` |
| `ConstructionJob` | Re-exported from contracts |
| `ConstructionState` | Re-exported from contracts |
| `JobId` | Re-exported from contracts |
| `BuildableType` | Re-exported from contracts |

### `update(ctx: TickContext)`

Called every game tick (20 Hz). Advances `progressFrames` on all active jobs by 1. When a job reaches `durationFrames`, it is removed from state and `construction:complete` is emitted. All state mutations are batched into a single `setState` call per tick.

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `construction:enqueued` | `{ jobId, ownerId, buildableType }` | Immediately after a valid `construction:request` is processed |
| `construction:cancelled` | `{ jobId, reason }` | When a request is rejected (e.g. duplicate `jobId`) |
| `construction:complete` | `{ jobId, ownerId, locationId, buildableType, completedFrame, metadata }` | When a job's `progressFrames` reaches `durationFrames` |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|------------|-------------|-------------------------------|
| `construction:request` | `{ jobId, ownerId, locationId, buildableType, durationFrames, metadata }` | Validates no duplicate `jobId`, then adds the job to the queue |

## State Slice

`construction: ConstructionState`

```typescript
interface ConstructionState {
  readonly jobs: Readonly<Record<JobId, ConstructionJob>>
}

interface ConstructionJob {
  readonly jobId: JobId
  readonly ownerId: CountryId
  readonly locationId: ProvinceId
  readonly buildableType: BuildableType   // 'army' | 'fleet' | 'building'
  readonly durationFrames: number
  readonly progressFrames: number         // incremented each update tick
  readonly metadata: Readonly<Record<string, unknown>>  // opaque; passed through to construction:complete
}
```

## Design Notes

- **Opaque types**: `buildableType` and `metadata` are treated as opaque data. The construction mechanic never inspects metadata — it passes it through verbatim to `construction:complete`.
- **Caller-generated JobId**: The requester generates the `JobId` (typically via `crypto.randomUUID() as JobId`). This keeps ID generation out of the construction mechanic and makes tests deterministic.
- **Single setState per tick**: The `update` function does one pass over all jobs, building the next state in memory, then calls `setState` once. This avoids N deep clones per tick.
- **Emit after setState**: `construction:complete` is emitted after the state is updated, so downstream handlers see a clean queue (the completed job is already removed).
- **No resource management**: Cost deduction and validation is intentionally out of scope. The economy mechanic (future) will handle costs before emitting `construction:request`.
