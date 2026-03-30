# Buildings

## Purpose

Manages province buildings (barracks, ports, farms, walls). Requests construction via the construction mechanic and listens for completion events to create buildings in state. Each building type has its own construction duration.

## Public API

| Export | Description |
|--------|-------------|
| `buildBuildingsState()` | Returns the initial `BuildingsState` `{ buildings: {} }` |
| `requestBuildBuilding(eventBus, ownerId, locationId, buildingType)` | Emits a `construction:request` with the appropriate duration and `buildingType` in metadata |
| `initBuildingsMechanic(eventBus, stateStore)` | Subscribes to `construction:complete`, returns `{ destroy }` |
| `Building` | Re-exported from contracts |
| `BuildingId` | Re-exported from contracts |
| `BuildingType` | Re-exported from contracts (`'barracks' \| 'port' \| 'farm' \| 'walls'`) |
| `BuildingsState` | Re-exported from contracts |

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `construction:request` | `{ jobId, ownerId, locationId, buildableType: 'building', durationFrames, metadata: { buildingType } }` | When `requestBuildBuilding` is called |
| `buildings:building-constructed` | `{ buildingId, countryId, provinceId, buildingType }` | When a building's construction job completes |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|------------|-------------|-------------------------------|
| `construction:complete` | `{ buildableType, ownerId, locationId, completedFrame, metadata }` | If `buildableType === 'building'` and `metadata.buildingType` is a valid `BuildingType`: creates a `Building` in state and emits `buildings:building-constructed` |

## State Slice

`buildings: BuildingsState`

```typescript
interface BuildingsState {
  readonly buildings: Readonly<Record<BuildingId, Building>>
}

interface Building {
  readonly id: BuildingId
  readonly countryId: CountryId
  readonly provinceId: ProvinceId
  readonly buildingType: BuildingType
  readonly completedFrame: number
}
```

## Building Durations (frames at 20 Hz)

| Building | Frames | Seconds |
|----------|--------|---------|
| `farm`     | 60  | 3 s |
| `barracks` | 90  | 4.5 s |
| `walls`    | 90  | 4.5 s |
| `port`     | 120 | 6 s |

## Design Notes

- **Metadata round-trip**: `buildingType` is passed through `construction:request` metadata as `unknown` and recovered via the `isBuildingType` type guard in `types.ts`. No `any` required.
- **Defensive guard**: if `metadata.buildingType` fails the type guard (e.g. corrupt data), the completion event is silently ignored.
- No update function is needed — the mechanic is purely event-driven.
- Building effects (e.g. barracks boosting army training speed, port enabling fleets) are out of scope and will be implemented in future iterations.
