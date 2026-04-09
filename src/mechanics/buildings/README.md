# Buildings

## Purpose

Manages province buildings (barracks, ports, farms, walls). Validates coastal
requirements, terrain-based building limits, and upfront gold affordability
before requesting construction. On completion, registers income modifiers with
the economy mechanic so that farms and ports generate gold each cycle.

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
| `economy:gold-deducted` | `{ countryId, amount, reason }` | Immediately before `construction:request` when gold cost > 0; `reason` is `building:<type>` |
| `construction:request` | `{ jobId, ownerId, locationId, buildableType: 'building', durationFrames, metadata: { buildingType } }` | When `requestBuildBuilding` passes all validation |
| `buildings:build-rejected` | `{ countryId, provinceId, buildingType, reason }` | When a port is placed on non-coastal land, the terrain limit is reached, or the country has insufficient gold |
| `buildings:building-constructed` | `{ buildingId, countryId, provinceId, buildingType }` | When a building's construction job completes |
| `buildings:building-destroyed` | `{ buildingId, countryId, provinceId, buildingType }` | When walls in a province are destroyed upon conquest (one event per wall) |
| `economy:province-modifier-added` | `{ provinceId, modifier }` | When a building with `incomeBonus > 0` completes (farms, ports) |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|------------|-------------|-------------------------------|
| `construction:complete` | `{ buildableType, ownerId, locationId, completedFrame, metadata }` | Creates a `Building` in state, emits `buildings:building-constructed`, and emits `economy:province-modifier-added` if the building has income |
| `map:province-conquered` | `{ provinceId, newOwnerId, oldOwnerId }` | Removes all walls buildings in the conquered province from state and emits `buildings:building-destroyed` for each |

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

| Building | Duration | Gold cost | Income bonus | Notes |
|----------|----------|-----------|-------------|-------|
| `farm`     | 60 frames (3 s)   | 30 gold | +10 gold/cycle | Terrain-capped |
| `port`     | 120 frames (6 s)  | 75 gold | +15 gold/cycle | Requires coastal province |
| `barracks` | 90 frames (4.5 s) | 50 gold | 0 | Military building |
| `walls`    | 90 frames (4.5 s) | 60 gold | 0 | Defensive building |

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

- **`requestBuildBuilding` now requires `stateStore`** to read province terrain,
  existing building counts, and country gold. This is a targeted read (province +
  buildings + economy slices) rather than a global dependency.
- **Gold is deducted upfront at request time**, not on completion. This prevents
  race conditions where the same gold is spent on multiple buildings. The mechanic
  emits `economy:gold-deducted`; the economy mechanic owns the state mutation.
- **Income is registered, not computed.** The buildings mechanic tells the
  economy mechanic what income a building adds (`economy:province-modifier-added`)
  using the `incomeBonus` from config. The economy mechanic owns the math.
- **Building ownership does not transfer on conquest.** `building.countryId`
  records who built it and never changes. Income from captured buildings goes
  to the province owner regardless of who built them — this is handled by the
  economy mechanic's province-bound modifier model.
- **Walls are destroyed on conquest.** When a province is conquered, all walls
  in that province are removed from state. This represents the attacker
  dismantling fortifications to prevent future resistance. Other buildings
  (barracks, farms, ports) survive conquest intact.
- No update function is needed — the mechanic is purely event-driven.
