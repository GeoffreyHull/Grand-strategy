# Map Mechanic

## Purpose

Renders and manages the world map — a 30×20 pointy-top hex grid containing 20 nations and 130 named provinces. Handles province selection/hover via mouse interaction and emits typed events for other mechanics to consume.

## Public API

Exported from `src/mechanics/map/index.ts`:

| Export | Type | Description |
|---|---|---|
| `buildMapState()` | `() => MapState` | Builds the initial map state from world data. Call once at startup. |
| `initMapMechanic(canvas, eventBus, stateStore)` | Function | Wires up the renderer, interaction, and event subscriptions. Returns `{ render, destroy }`. |
| `Province` | type | Re-exported from contracts |
| `Country` | type | Re-exported from contracts |
| `ProvinceId` | type | Re-exported from contracts |
| `CountryId` | type | Re-exported from contracts |

## Events Emitted

| Event name | Payload type | When it fires |
|---|---|---|
| `map:province-selected` | `{ provinceId, countryId }` | User clicks a province cell |
| `map:province-hovered` | `{ provinceId \| null }` | Mouse enters or leaves a province |
| `map:country-selected` | `{ countryId }` | User clicks any province (fires with province-selected) |
| `map:ready` | `{ provinceCount, countryCount }` | After `initMapMechanic` completes setup |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|---|---|---|
| `map:province-hovered` | `{ provinceId \| null }` | Updates `hoveredProvinceId` in state; refreshes info panel |
| `map:province-selected` | `{ provinceId, countryId }` | Updates `selectedProvinceId` in state; refreshes info panel |

*(The mechanic subscribes to its own events so state flows through a single path.)*

## State Slice

`GameState.map: MapState`

```typescript
interface MapState {
  provinces: Record<ProvinceId, Province>   // all 130 provinces
  countries:  Record<CountryId,  Country>   // all 20 nations
  selectedProvinceId: ProvinceId | null
  hoveredProvinceId:  ProvinceId | null
  cellIndex: Record<string, ProvinceId>     // "col,row" → ProvinceId, O(1) lookup
}
```

## World Design

**Grid:** 30 columns × 20 rows (pointy-top hex, odd-row offset coordinates)

**Nations (20):**

| # | Nation | Color |
|---|---|---|
| 1 | Kingdom of Valdorn | `#3d6b9e` |
| 2 | Republic of Solenne | `#e8c53a` |
| 3 | Thornwood Dominion | `#2d7a40` |
| 4 | Duchy of Auren | `#c17a2a` |
| 5 | Empire of Kharrath | `#8b2222` |
| 6 | Principality of Verath | `#7b5ea7` |
| 7 | Free Cities of Halvorn | `#3aabb5` |
| 8 | Theocracy of Luminar | `#f0d84a` |
| 9 | Sultanate of Zhardan | `#d4a017` |
| 10 | Clanlands of Durnrak | `#7a5230` |
| 11 | Marchlands of Mireth | `#5b8c3a` |
| 12 | Ostmark Confederation | `#6699cc` |
| 13 | Pelundra Reach | `#993366` |
| 14 | Serath Emirates | `#cc8833` |
| 15 | Dravenn Hegemony | `#4a4a6a` |
| 16 | Ulgrath Tribes | `#8b4513` |
| 17 | Norwind Republic | `#5599aa` |
| 18 | Carath Alliance | `#aa6633` |
| 19 | Wyrmfen Conclave | `#336655` |
| 20 | Vyshan Principality | `#aa3388` |

**Provinces:** 130 total (5–7 per nation). Each occupies 3–5 contiguous hex cells.

## Design Notes

- **Hex geometry:** Pointy-top, odd-row offset. Cell centers computed by `HexGrid.ts`; pixel→hex inversion done via `pixelToHex`. `isPointInHex` is available but the primary interaction uses `pixelToHex` for speed.
- **isCoastal derivation:** Computed automatically in `buildMapState()` — a province is coastal if any of its cells has a neighbour cell with no assigned province (ocean).
- **Cell conflict detection:** `map.test.ts` validates that no two provinces share a cell, serving as a data integrity gate.
- **Border rendering:** Per-edge classification: ocean edge → dark border; cross-country edge → thick black border (2.5px); cross-province edge → thin darkened-color border (0.8px). This produces the classic grand-strategy look without needing explicit border data.
- **Info panel and legend** are updated via DOM manipulation in `index.ts`; canvas rendering is pure draw-only via `MapRenderer`.
- **No `any` types.** Branded `ProvinceId`/`CountryId` string types catch ID mixups at compile time.
