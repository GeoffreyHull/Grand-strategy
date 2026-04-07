# Map Mechanic

## Purpose

Renders and manages the world map — a 30×20 pointy-top hex grid containing 20 nations and 130 named provinces. Handles province selection/hover via mouse interaction and emits typed events for other mechanics to consume. Supports camera zoom (scroll wheel / pinch) and pan (drag / touch) with full mobile support.

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
| `map:province-selected` | `{ provinceId, countryId }` | User clicks or taps a province cell |
| `map:province-hovered` | `{ provinceId \| null }` | Mouse enters or leaves a province |
| `map:country-selected` | `{ countryId }` | User clicks any province (fires with province-selected) |
| `map:ready` | `{ provinceCount, countryCount }` | After `initMapMechanic` completes setup |
| `map:province-conquered` | `{ provinceId, newOwnerId, oldOwnerId }` | An AI nation successfully expands into a neighbouring province |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|---|---|---|
| `map:province-hovered` | `{ provinceId \| null }` | Updates `hoveredProvinceId` in state; refreshes info panel |
| `map:province-selected` | `{ provinceId, countryId }` | Updates `selectedProvinceId` in state; refreshes info panel |
| `ai:decision-made` | `{ decision }` | On `EXPAND` action: picks a random neighbouring province of a different country, transfers ownership in state, emits `map:province-conquered` |

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

Camera state (`CameraState`) is pure UI state — it is **not** stored in `GameState`. It is managed locally in `initMapMechanic` and never serialised.

## Camera Controls

| Action | Desktop | Mobile |
|---|---|---|
| **Pan** | Left-click drag | Single-finger drag |
| **Zoom** | Scroll wheel | Pinch-to-zoom (two fingers) |
| **Select province** | Left-click (no drag) | Tap |

- Zoom range: `MIN_ZOOM` (0.3×) to `MAX_ZOOM` (5×).
- Zoom is always centered on the cursor / pinch midpoint.
- Pinch also pans: moving both fingers translates the view simultaneously.

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

- **Camera implementation:** `Camera.ts` provides pure math (`zoomToward`, `screenToWorld`). `MapRenderer` applies a single `ctx.setTransform` before drawing all world-space geometry; no per-cell offset math changes were needed. `MapInteraction` converts screen coords to world coords via `screenToWorld` before hex hit-testing.
- **Drag vs click disambiguation:** A press is treated as a click only if the pointer moves less than 4px total. This prevents accidental province selection while panning.
- **Touch gesture restart:** When one finger lifts during a two-finger gesture (pinch → single pan), the interaction seamlessly restarts a single-touch pan from the current position.
- **Label visibility:** Province labels are shown only when `hexSize × zoom ≥ 22` effective pixels, keeping the map readable at all zoom levels.
- **Hex geometry:** Pointy-top, odd-row offset. Cell centers computed by `HexGrid.ts`; pixel→hex inversion done via `pixelToHex`. `isPointInHex` is available but the primary interaction uses `pixelToHex` for speed.
- **isCoastal derivation:** Computed automatically in `buildMapState()` — a province is coastal if any of its cells has a neighbour cell with no assigned province (ocean).
- **Cell conflict detection:** `map.test.ts` validates that no two provinces share a cell, serving as a data integrity gate.
- **Border rendering:** Per-edge classification: ocean edge → dark border; cross-country edge → thick black border (2.5px); cross-province edge → thin darkened-color border (0.8px). This produces the classic grand-strategy look without needing explicit border data.
- **Info panel and legend** are updated via DOM manipulation in `index.ts`; canvas rendering is pure draw-only via `MapRenderer`.
- **No `any` types.** Branded `ProvinceId`/`CountryId` string types catch ID mixups at compile time.
