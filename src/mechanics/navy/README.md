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

## Roadmap

### 1. Naval blockade (navy ↔ map, economy, diplomacy)

A fleet stationed in a coastal province belonging to a country it is at war with imposes a blockade — suppressing that province's income and cutting off seaborne reinforcement.

- Activation: fleet remains stationary in an enemy coastal province for `blockadeActivationFrames`. Navy reads war state via the existing diplomacy slice.
- On activation, navy emits `navy:blockade-started { fleetId, provinceId, blockadingCountryId, targetCountryId }` and an `economy:province-modifier-added` with id `blockade:<provinceId>` carrying the income suppression (`multiply (1 - blockadeIncomeReduction)`).
- Lifts on `military:army-destroyed` for the fleet equivalent (or new `navy:fleet-destroyed`), `diplomacy:peace-made`, or fleet movement; emits `navy:blockade-lifted { reason }`.
- New config: `blockadeIncomeReduction` (0.5), `blockadeActivationFrames`.
- Contract additions: two new event keys.

### 2. Naval invasion / amphibious landing (navy ↔ military, map, diplomacy)

A fleet co-located with a same-owner army can transport that army across sea to a non-adjacent coastal province at war with the owner. Unblocks isolated-territory strategy.

- New caller-facing function `requestTransport(fleetId, armyId, destinationProvinceId)` validates: same owner, both endpoints coastal, destination owner is at war.
- Validation failure → `navy:transport-rejected { reason: 'no-fleet' | 'not-coastal' | 'not-at-war' | 'fleet-busy' }`.
- On success: emit `navy:transport-in-progress { completesAtFrame }`. The army is marked immovable (`transportedByFleetId` field) and military leaves it alone for the duration.
- After `transportDurationFrames`, emit `navy:transport-complete { fleetId, armyId, newProvinceId }`. Military relocates the army.
- New config: `transportDurationFrames` (60), `transportCapacityPerFleet` (1).
- Contract additions: four new event keys; `Army` gains optional `transportedByFleetId: FleetId`.

### Implementation order (suggested)

1. **Blockade** — passive once-positioned mechanic, reuses existing economy modifier pipeline.
2. **Naval invasion** — adds movement/state-machine surface; land after blockade so coastal positioning is already meaningful.
