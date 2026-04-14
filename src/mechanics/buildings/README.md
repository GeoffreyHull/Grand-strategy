# Buildings

## Purpose

Manages province and territory buildings (barracks, ports, farms, walls). Buildings
are classified as either **territory-scoped** (one per hex cell) or **province-scoped**
(limited by terrain type). Validates coastal requirements, terrain/territory limits,
and upfront gold affordability before requesting construction. On completion,
registers income modifiers with the economy mechanic so that farms and ports
generate gold each cycle.

## Public API

| Export | Description |
|--------|-------------|
| `buildBuildingsState()` | Returns the initial `BuildingsState` `{ buildings: {} }` |
| `requestBuildBuilding(eventBus, stateStore, ownerId, locationId, buildingType, config?, territoryId?)` | Validates limits, emits `construction:request` or `buildings:build-rejected`. `territoryId` is required for territory-scoped buildings (farm). |
| `initBuildingsMechanic(eventBus, stateStore, config?)` | Subscribes to `construction:complete`; emits building and economy events on completion |
| `getBuildingScope(buildingType)` | Returns `'territory'` for farm, `'province'` for all others |
| `Building` | Re-exported from contracts |
| `BuildingId` | Re-exported from contracts |
| `BuildingType` | Re-exported from contracts (`'barracks' \| 'port' \| 'farm' \| 'walls'`) |
| `BuildingScope` | Re-exported from contracts (`'territory' \| 'province'`) |
| `TerritoryId` | Re-exported from map contracts |
| `BuildingsState` | Re-exported from contracts |
| `BuildingsConfig` | Re-exported from types |
| `TerrainBuildingLimits` | Re-exported from types |

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `economy:gold-deducted` | `{ countryId, amount, reason }` | Immediately before `construction:request` when gold cost > 0; `reason` is `building:<type>` |
| `construction:request` | `{ jobId, ownerId, locationId, buildableType: 'building', durationFrames, metadata: { buildingType[, territoryId] } }` | When `requestBuildBuilding` passes all validation |
| `buildings:build-rejected` | `{ countryId, provinceId, [territoryId], buildingType, reason }` | When validation fails (`not-coastal`, `terrain-limit-reached`, `territory-occupied`, or `insufficient-gold`) |
| `buildings:building-constructed` | `{ buildingId, countryId, provinceId, [territoryId], buildingType, scope }` | When a building's construction job completes |
| `buildings:building-destroyed` | `{ buildingId, countryId, provinceId, [territoryId], buildingType, scope }` | When walls in a province are destroyed upon conquest (one event per wall) |
| `economy:province-modifier-added` | `{ provinceId, modifier }` | When a building with `incomeBonus > 0` completes (farms, ports) |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|------------|-------------|-------------------------------|
| `construction:complete` | `{ buildableType, ownerId, locationId, completedFrame, metadata }` | Creates a `Building` in state (with `scope` and optional `territoryId`), emits `buildings:building-constructed`, and emits `economy:province-modifier-added` if income > 0 |
| `map:province-conquered` | `{ provinceId, newOwnerId, oldOwnerId }` | Removes all walls in the conquered province from state and emits `buildings:building-destroyed` for each |

## State Slice

`buildings: BuildingsState`

```typescript
interface BuildingsState {
  readonly buildings: Readonly<Record<BuildingId, Building>>
}

interface Building {
  readonly id: BuildingId
  readonly countryId: CountryId       // who built it (does NOT change on conquest)
  readonly provinceId: ProvinceId
  readonly territoryId?: TerritoryId  // present only for territory-scoped buildings (farm)
  readonly buildingType: BuildingType
  readonly completedFrame: number
  readonly scope: BuildingScope       // 'territory' | 'province'
}
```

## Building Scope

Buildings are classified into two scopes:

| Scope | Buildings | Limit |
|-------|-----------|-------|
| `territory` | `farm` | Max **1 per hex cell** (TerritoryId). Pass `territoryId` to `requestBuildBuilding`. |
| `province`  | `barracks`, `port`, `walls` | Per-terrain limits (see table below). No `territoryId` needed. |

## Building Properties (defaults)

| Building | Scope | Duration | Gold cost | Income bonus | Notes |
|----------|-------|----------|-----------|-------------|-------|
| `farm`     | territory | 60 frames (3 s)   | 30 gold | +10 gold/cycle | 1 per hex cell |
| `port`     | province  | 120 frames (6 s)  | 75 gold | +15 gold/cycle | Requires coastal province |
| `barracks` | province  | 90 frames (4.5 s) | 50 gold | 0 | Military building |
| `walls`    | province  | 90 frames (4.5 s) | 60 gold | 0 | Defensive building |

## Terrain Building Limits (province-scoped only)

| Terrain | port | barracks | walls |
|---------|------|----------|-------|
| Plains    | 3 | 3 | 2 |
| Hills     | 2 | 2 | 3 |
| Mountains | 1 | 2 | 4 |
| Forest    | 2 | 2 | 2 |
| Desert    | 1 | 1 | 2 |
| Tundra    | 1 | 1 | 2 |
| Ocean     | 0 | 0 | 0 |

Port limits apply only if the province is coastal; non-coastal provinces
are rejected before the limit is checked.

Farms are territory-scoped — their limit (1 per territory) is checked via
`territory-occupied` rather than the terrain table.

## Design Notes

- **Territory vs province scope.** `getBuildingScope('farm')` returns `'territory'`; all other types return `'province'`. `requestBuildBuilding` branches on this: territory-scoped buildings check per-hex occupancy; province-scoped buildings check the terrain limit table.
- **`territoryId` is required for farms.** If `territoryId` is omitted when building a farm, `requestBuildBuilding` returns silently (no event emitted) — callers must provide a hex to plant on.
- **`requestBuildBuilding` reads `stateStore`** for province terrain, existing building counts, and country gold.
- **Gold is deducted upfront at request time**, not on completion. This prevents race conditions where the same gold is spent on multiple buildings.
- **Income is registered, not computed.** The buildings mechanic emits `economy:province-modifier-added`; the economy mechanic owns the math.
- **Building ownership does not transfer on conquest.** `building.countryId` records who built it and never changes.
- **Walls are destroyed on conquest.** All walls in a conquered province are removed from state. Other buildings (barracks, farms, ports) survive intact.
- No update function is needed — the mechanic is purely event-driven.

## Roadmap

### 1. Technology gates building unlocks (buildings ↔ technology)

Today any building can be built by anyone with the gold. Add a `techPrerequisite` field per building type so progression unlocks new types.

- Examples: `barracks` requires `iron-working`, `port` requires `cartography`, future `marketplace` requires `trade-routes`.
- `requestBuildBuilding` reads the country's researched techs from the shared state slice (no cross-mechanic import) and rejects with a new reason `'technology-required'` if missing.
- New config: `techPrerequisite?: TechnologyType` per building entry in `BuildingsConfig`.
- Contract additions: extend `buildings:build-rejected.reason` union with `'technology-required'`; `BuildingsConfig` gains `techPrerequisite` field.

### 2. Building deterioration from neglect (buildings ↔ economy)

Add a maintenance cost per building per economy cycle. When a country's gold goes negative, buildings start deteriorating; after a configurable grace window of unpaid upkeep, the most-recently-completed buildings are demolished.

- Each cycle: emit `economy:gold-deducted { reason: 'maintenance:<buildingType>' }` per active building.
- If the deduction would push gold below zero, increment the building's `unpaidCycles` counter and emit `buildings:building-deteriorated`.
- When `unpaidCycles >= neglectGraceFrames / cycleFrames`, remove the building, fire `economy:province-modifier-removed`, and emit `buildings:building-demolished { reason: 'neglect' }` (distinct from the conquest-driven `building-destroyed`).
- New config: `maintenanceCostPerCycle` per building type; `neglectGraceCycles`.
- Contract additions: two new event keys (`buildings:building-deteriorated`, `buildings:building-demolished`); `Building` gains `unpaidCycles: number`.

### Implementation order (suggested)

1. **Tech-gated unlocks** — pure validation addition, no new state, smallest blast radius.
2. **Deterioration** — adds per-tick state mutation and a real failure mode; land after tech gates so the unlock progression is visible first.
