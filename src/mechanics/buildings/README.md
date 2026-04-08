# Buildings

## Purpose

Manages province buildings (barracks, ports, farms, walls). Validates coastal
requirements and terrain-based building limits before requesting construction.
On completion, registers income modifiers with the economy mechanic so that
farms and ports generate gold each cycle.

## Public API

| Export | Description |
|--------|-------------|
| `buildBuildingsState()` | Returns the initial `BuildingsState` `{ buildings: {} }` |
| `requestBuildBuilding(eventBus, stateStore, ownerId, locationId, buildingType, config?)` | Validates limits, emits `construction:request` or `buildings:build-rejected` |
| `initBuildingsMechanic(eventBus, stateStore, config?)` | Subscribes to `construction:complete`; emits building and economy events on completion |
| `Building` | Re-exported from contracts |
| `BuildingId` | Re-exported from contracts |
| `BuildingType` | Re-exported from contracts (`'barracks' \| 'port' \| 'farm' \| 'walls'`) |
| `BuildingsState` | Re-exported from contracts |
| `BuildingsConfig` | Re-exported from types |
| `TerrainBuildingLimits` | Re-exported from types |

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `construction:request` | `{ jobId, ownerId, locationId, buildableType: 'building', durationFrames, metadata: { buildingType } }` | When `requestBuildBuilding` passes all validation |
| `buildings:build-rejected` | `{ countryId, provinceId, buildingType, reason }` | When a port is placed on non-coastal land, or the terrain limit for that building type is reached |
| `buildings:building-constructed` | `{ buildingId, countryId, provinceId, buildingType }` | When a building's construction job completes |
| `economy:province-modifier-added` | `{ provinceId, modifier }` | When a building with `incomeBonus > 0` completes (farms, ports) |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|------------|-------------|-------------------------------|
| `construction:complete` | `{ buildableType, ownerId, locationId, completedFrame, metadata }` | Creates a `Building` in state, emits `buildings:building-constructed`, and emits `economy:province-modifier-added` if the building has income |

## State Slice

`buildings: BuildingsState`

```typescript
interface BuildingsState {
  readonly buildings: Readonly<Record<BuildingId, Building>>
}

interface Building {
  readonly id: BuildingId
  readonly countryId: CountryId   // who built it (does NOT change on conquest)
  readonly provinceId: ProvinceId
  readonly buildingType: BuildingType
  readonly completedFrame: number
}
```

## Building Properties (defaults)

| Building | Duration | Income bonus | Notes |
|----------|----------|-------------|-------|
| `farm`     | 60 frames (3 s)   | +10 gold/cycle | Terrain-capped |
| `port`     | 120 frames (6 s)  | +15 gold/cycle | Requires coastal province |
| `barracks` | 90 frames (4.5 s) | 0 | Military building |
| `walls`    | 90 frames (4.5 s) | 0 | Defensive building |

## Terrain Building Limits (defaults)

| Terrain | farm | port | barracks | walls |
|---------|------|------|----------|-------|
| Plains    | 20 | 3 | 3 | 2 |
| Hills     | 10 | 2 | 2 | 3 |
| Mountains |  5 | 1 | 2 | 4 |
| Forest    |  8 | 2 | 2 | 2 |
| Desert    |  3 | 1 | 1 | 2 |
| Tundra    |  2 | 1 | 1 | 2 |
| Ocean     |  0 | 0 | 0 | 0 |

Port limits apply only if the province is coastal; non-coastal provinces
are rejected before the limit is checked.

## Design Notes

- **`requestBuildBuilding` now requires `stateStore`** to read province terrain
  and existing building counts. This is a targeted read (province + buildings
  slice) rather than a global dependency.
- **Income is registered, not computed.** The buildings mechanic tells the
  economy mechanic what income a building adds (`economy:province-modifier-added`)
  using the `incomeBonus` from config. The economy mechanic owns the math.
- **Building ownership does not transfer on conquest.** `building.countryId`
  records who built it and never changes. Income from captured buildings goes
  to the province owner regardless of who built them — this is handled by the
  economy mechanic's province-bound modifier model.
- No update function is needed — the mechanic is purely event-driven.
