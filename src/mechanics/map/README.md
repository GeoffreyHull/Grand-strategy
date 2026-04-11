# Map Mechanic

## Purpose

Renders and manages the world map — a 30×20 pointy-top hex grid containing 20 nations and 130 named provinces. Handles province selection/hover via mouse interaction and emits typed events for other mechanics to consume. Supports camera zoom (scroll wheel / pinch) and pan (drag / touch) with full mobile support.

## Public API

Exported from `src/mechanics/map/index.ts`:

| Export | Type | Description |
|---|---|---|
| `buildMapState()` | `() => MapState` | Builds the initial map state from world data. Call once at startup. |
| `initMapMechanic(canvas, eventBus, stateStore)` | Function | Wires up the renderer, interaction, leaderboard, and event subscriptions. Returns `{ render, destroy }`. |
| `appendCombatLog(text, type, turn)` | Function | Append an entry to the combat log HTML panel. |
| `Province` | type | Re-exported from contracts |
| `Country` | type | Re-exported from contracts |
| `Territory` | type | Re-exported from contracts — represents a single hex cell |
| `ProvinceId` | type | Re-exported from contracts |
| `CountryId` | type | Re-exported from contracts |
| `TerritoryId` | type | Re-exported from contracts — branded `"col,row"` string |

## Events Emitted

| Event name | Payload type | When it fires |
|---|---|---|
| `map:country-selected` | `{ countryId }` | First click on any province (or click on a province of a different country) |
| `map:province-selected` | `{ provinceId, countryId }` | Second click on a province whose country is already selected |
| `map:province-hovered` | `{ provinceId \| null }` | Mouse enters or leaves a province |
| `map:ready` | `{ provinceCount, countryCount }` | After `initMapMechanic` completes setup |
| `map:province-conquered` | `{ provinceId, newOwnerId, oldOwnerId }` | An AI nation wins a combat and takes a neighbouring province |
| `map:province-attack-repelled` | `{ provinceId, attackerId, defenderId, attackStrength, defenseStrength }` | An attack fails — defender holds the province |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|---|---|---|
| `map:province-hovered` | `{ provinceId \| null }` | Updates `hoveredProvinceId` in state; refreshes info panel |
| `map:country-selected` | `{ countryId }` | Updates `selectedCountryId`, clears `selectedProvinceId` in state; refreshes info panel |
| `map:province-selected` | `{ provinceId, countryId }` | Updates `selectedProvinceId` in state; refreshes info panel |
| `ai:decision-made` | `{ decision }` | On `EXPAND`: captures `decision.frame` for combat log turn labelling, then runs combat resolution against a random neighbouring province **owned by a country currently at war with the attacker** (truced/neutral neighbours are excluded from the candidate pool). Attacker uses armies in adjacent provinces + base 50; defender uses armies in target province × terrain multiplier (plains 1.0, hills 1.3, mountains 1.6, forest 1.2, tundra 1.1, desert 0.9) + walls bonus 60 + base 20. Attacker win → `map:province-conquered`; defender win → `map:province-attack-repelled` |
| `military:army-raised` | `{ armyId, countryId, provinceId }` | Refreshes info panel and leaderboard to show updated army counts |
| `military:army-destroyed` | `{ armyId, ... }` | Refreshes leaderboard to reflect reduced military strength |
| `buildings:building-constructed` | `{ buildingId, ... }` | Refreshes info panel to show updated building list |
| `map:province-conquered` | `{ provinceId, ... }` | Refreshes info panel and leaderboard to reflect new ownership |
| `economy:income-collected` | `{ ... }` | Refreshes info panel and leaderboard to reflect updated gold totals |
| `economy:gold-deducted` | `{ ... }` | Refreshes info panel and leaderboard to reflect updated gold totals |
| `diplomacy:war-declared` | `{ declarerId, targetId }` | Adds the country pair to the local `activeWars` set so province capture is permitted |
| `diplomacy:peace-made` | `{ countryA, countryB }` | Removes the country pair from `activeWars`, blocking further province capture |

*(The mechanic subscribes to its own events so state flows through a single path.)*

## State Slice

`GameState.map: MapState`

```typescript
interface MapState {
  provinces:   Record<ProvinceId,  Province>   // all 130 provinces
  countries:   Record<CountryId,   Country>    // all 20 nations
  territories: Record<TerritoryId, Territory>  // one entry per hex cell (600 total)
  selectedProvinceId: ProvinceId | null        // set on second click (province mode)
  selectedCountryId:  CountryId  | null        // set on first click (country mode)
  hoveredProvinceId:  ProvinceId | null
  cellIndex: Record<string, ProvinceId>        // "col,row" → ProvinceId, O(1) lookup
}

interface Territory {
  id:         TerritoryId  // "col,row" format, matching cellIndex keys
  provinceId: ProvinceId
  col:        number
  row:        number
}
```

`TerritoryId` format is `"col,row"` — intentionally identical to the `cellIndex` key format so lookups are free.

Camera state (`CameraState`) is pure UI state — it is **not** stored in `GameState`. It is managed locally in `initMapMechanic` and never serialised.

## Camera Controls

| Action | Desktop | Mobile |
|---|---|---|
| **Pan** | Left-click drag | Single-finger drag |
| **Zoom** | Scroll wheel | Pinch-to-zoom (two fingers) |
| **Select country** | Left-click (no drag) on any province | Tap |
| **Select province** | Left-click (no drag) on a province of the already-selected country | Tap |

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
- **Two-step selection:** First click on a province selects that country (highlights all its provinces with a subtle white overlay + perimeter border; info panel shows country-level stats). A second click on a province of the already-selected country selects that specific province (shows full country + province info). Clicking a province of a different country resets to country-selection for the new nation. This is implemented by tracking `selectedCountryId` in `MapState`: `MapInteraction` checks whether the clicked province's country matches `selectedCountryId` before deciding which events to emit. `map:country-selected` always fires first (clearing `selectedProvinceId`), then `map:province-selected` fires if applicable (setting `selectedProvinceId`).
- **Drag vs click disambiguation:** A press is treated as a click only if the pointer moves less than 4px total. This prevents accidental province selection while panning.
- **Touch gesture restart:** When one finger lifts during a two-finger gesture (pinch → single pan), the interaction seamlessly restarts a single-touch pan from the current position.
- **Label visibility:** Province labels are shown only when `hexSize × zoom ≥ 22` effective pixels, keeping the map readable at all zoom levels.
- **Hex geometry:** Pointy-top, odd-row offset. Cell centers computed by `HexGrid.ts`; pixel→hex inversion done via `pixelToHex`. `isPointInHex` is available but the primary interaction uses `pixelToHex` for speed.
- **Territory model:** `buildMapState()` creates one `Territory` per hex cell. `TerritoryId` is the `"col,row"` string — the same format as `cellIndex` keys, so converting a territory to its province is `cellIndex[territory.id]` (O(1)).
- **isCoastal derivation:** Computed automatically in `buildMapState()` — a province is coastal if any of its cells has a neighbour cell with no assigned province (ocean).
- **Cell conflict detection:** `map.test.ts` validates that no two provinces share a cell, serving as a data integrity gate.
- **Border rendering:** Per-edge classification: ocean edge → dark border; cross-country edge → thick black border (2.5px); cross-province edge → thin darkened-color border (0.8px). This produces the classic grand-strategy look without needing explicit border data.
- **Info panel and legend** are updated via DOM manipulation in `index.ts`; canvas rendering is pure draw-only via `MapRenderer`.
- **Combat log turn numbers:** Each log entry displays a `Turn N` label derived from `Math.floor(frame / 60) + 1`, where 60 is the AI decision interval. This groups all attacks from the same decision cycle under the same turn number. The `.log-turn` CSS class (defined in `index.html`) styles the label as a small grey annotation above the entry text.
- **Attack arrows:** After each combat resolution, a transient `AttackArrow` (defined in `types.ts`) is pushed to a local array in `initMapMechanic`. The arrow records the attacker's adjacent province IDs, the target province ID, the result (`'conquered'` or `'repelled'`), and a `createdAt` timestamp. `MapRenderer.render()` receives the arrow list and draws color-coded arrows in world space: green (`#22ee77`) for a successful capture, red (`#ff4444`) for a repelled attack. Arrows fade out smoothly over the last 1.2 s of their 4 s display window. Expired arrows are pruned before each render call (FIFO order). No arrow state leaks into `GameState`.
- **Leaderboard panel:** `LeaderboardRenderer.ts` computes a score per country (`provinces × 1000 + militaryStrength + gold / 10`) and re-renders the `#leaderboard-list` DOM element whenever province counts, army strength, or gold changes. Countries with zero provinces are flagged as eliminated and sorted to the bottom. The panel is collapsible (CSS `.collapsed` toggle) via a click handler in `index.html`, matching the pattern used by the legend and combat log panels. The static column-header row lives outside `#leaderboard-list` so it is never cleared by `renderLeaderboard`.
- **No `any` types.** Branded `ProvinceId`/`CountryId` string types catch ID mixups at compile time.
- **War gate:** Province capture is only permitted when an active war exists between the attacker and defender. The mechanic maintains a local `activeWars: Set<string>` (keyed by sorted country ID pair) updated via `diplomacy:war-declared` / `diplomacy:peace-made` events. This avoids a direct import of the diplomacy mechanic while still enforcing the invariant. Combat candidates are pre-filtered to only active-war provinces before random selection — this ensures EXPAND actions are never wasted on truced or neutral neighbours (important once truces are in play). Because the map mechanic's `ai:decision-made` handler runs before `main.ts` declares war (registration order), a country must declare war in one tick and attack in a subsequent tick — matching realistic grand-strategy behavior.
