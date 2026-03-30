# Navy

## Purpose

Manages fleets. Validates coastal constraints before requesting fleet construction, and listens for completion events to create fleets in state. Only coastal provinces can host a fleet.

## Public API

| Export | Description |
|--------|-------------|
| `buildNavyState()` | Returns the initial `NavyState` `{ fleets: {} }` |
| `requestBuildFleet(eventBus, stateStore, ownerId, locationId)` | Validates `isCoastal`, then emits `construction:request` for a fleet (120 frames). Emits `navy:fleet-rejected` if not coastal. |
| `initNavyMechanic(eventBus, stateStore)` | Subscribes to `construction:complete`, returns `{ destroy }` |
| `Fleet` | Re-exported from contracts |
| `FleetId` | Re-exported from contracts |
| `NavyState` | Re-exported from contracts |

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `construction:request` | `{ jobId, ownerId, locationId, buildableType: 'fleet', durationFrames: 120, metadata: {} }` | When `requestBuildFleet` is called on a coastal province |
| `navy:fleet-rejected` | `{ ownerId, locationId, reason: 'not-coastal' }` | When `requestBuildFleet` is called on a non-coastal or unknown province |
| `navy:fleet-formed` | `{ fleetId, countryId, provinceId }` | When a fleet's construction job completes |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|------------|-------------|-------------------------------|
| `construction:complete` | `{ buildableType, ownerId, locationId, completedFrame, ... }` | If `buildableType === 'fleet'`: creates a `Fleet` in state and emits `navy:fleet-formed` |

## State Slice

`navy: NavyState`

```typescript
interface NavyState {
  readonly fleets: Readonly<Record<FleetId, Fleet>>
}

interface Fleet {
  readonly id: FleetId
  readonly countryId: CountryId
  readonly provinceId: ProvinceId
  readonly ships: number          // default 3
  readonly createdFrame: number
}
```

## Design Notes

- Coastal validation reads from `stateStore.getSlice('map')` — no cross-mechanic import, just shared state.
- `requestBuildFleet` receives `stateStore` as an explicit parameter rather than a closure, keeping it a pure, testable function.
- No update function is needed — the mechanic is purely event-driven.
- Naval movement, combat, and port requirements are out of scope for this initial implementation.
- Future: require a `port` building in the province before allowing fleet construction.
