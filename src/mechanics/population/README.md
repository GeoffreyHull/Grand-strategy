# Population

## Purpose

Tracks the population headcount of each land province and drives slow demographic growth over time. Population size scales province income and is affected by terrain, farm buildings, and war. This mechanic provides the foundational demographic layer that culture and future mechanics can build upon.

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `buildPopulationState` | `() => PopulationState` | Returns the initial empty state; used by the StateStore bootstrap. |
| `loadPopulationConfig` | `(url?) => Promise<PopulationConfig>` | Fetches and validates `config/population.json`. |
| `initPopulationMechanic` | `(eventBus, stateStore, config?) => { update, destroy }` | Wires up all subscriptions; returns the update tick and a cleanup function. |
| `DEFAULT_POPULATION_CONFIG` | `PopulationConfig` | Built-in fallback config used when the JSON file is missing or invalid. |

Re-exports: `ProvincePopulation`, `PopulationState`, `PopulationConfig`.

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `population:grown` | `{ provinceId, countryId, amount, newCount }` | Each growth tick when a province's population increases. |
| `population:province-transferred` | `{ provinceId, newCountryId, oldCountryId }` | When a province is conquered and its population changes allegiance. |
| `economy:province-modifier-added` | `{ provinceId, modifier }` | When population crosses a 1,000-person tier boundary upward, registering a flat income bonus. |
| `economy:province-modifier-removed` | `{ provinceId, modifierId }` | When population crosses a tier boundary and the previous modifier is replaced. |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|------------|-------------|-------------------------------|
| `map:province-conquered` | `{ provinceId, newOwnerId, oldOwnerId, … }` | Updates the province population's `countryId` to the new owner; emits `population:province-transferred`. |
| `buildings:building-constructed` | `{ provinceId, buildingType, … }` | When `buildingType === 'farm'`, increases the province's population capacity by `farmCapacityBonus`. |

## State Slice

`GameState.population: PopulationState`

```typescript
interface PopulationState {
  provinces: Record<ProvinceId, ProvincePopulation>
}

interface ProvincePopulation {
  provinceId:         ProvinceId
  countryId:          CountryId   // current owner (updated on conquest)
  count:              number      // current headcount
  capacity:           number      // max sustainable population
  growthAccumulator:  number      // fractional growth carried over between ticks
  incomeTier:         number      // floor(count / 1000) — tracks active modifier value
}
```

Ocean provinces are excluded from the state (they never have population).

## Design Notes

**Growth model.** Population grows logistically: each cycle the increment is `count × rate × (1 − count/capacity)`. Growth slows automatically as the province fills toward capacity, avoiding runaway values without hard clamps.

**Income integration.** Population contributes a flat income bonus per 1,000 residents (`incomePerThousand` config). The bonus is delivered as a named `economy:province-modifier-added` event (id `population:<provinceId>`) so the economy mechanic can include it in its income pipeline. When population crosses a 1,000-person boundary the old modifier is removed and a new one is emitted — there is always at most one active population modifier per province.

**War penalty.** If the owning country is at war, the growth rate is multiplied by `warGrowthPenalty` (default 0.5). This creates demographic pressure from prolonged conflicts.

**Farm synergy.** Each farm constructed in a province adds `farmCapacityBonus` (default 1,000) to its capacity, allowing larger populations to be sustained on high-value terrain.

**Config.** `public/config/population.json` can override any numeric field. Missing or invalid files fall back to `DEFAULT_POPULATION_CONFIG` with a console warning (handled by `main.ts`).

## Roadmap

Planned expansions that broaden what affects, and is affected by, population. All five fit the isolation model: population subscribes to existing events or emits new ones documented here as `// TODO: add to contracts`. None require a cross-mechanic import.

### 1. Manpower as a recruitment cost (population ↔ military)

Today armies cost only gold. Add a population draw so empires are demographically capped, not just fiscally.

- Population exposes a `manpowerAvailable` derivation (e.g. `floor(count × manpowerFraction)`), or military queries via a new event.
- On `military:army-raised`, population deducts `manpowerPerArmy` from the source province.
- If the source province is below `minManpowerFloor`, population emits `population:recruitment-rejected` and military aborts.
- New events: `population:manpower-drained`, `population:recruitment-rejected`.
- New config: `manpowerPerArmy`, `minManpowerFloor`, `manpowerFraction`.
- Contract additions needed: two new event keys in `contracts/events.ts`.

### 2. Climate events kill or starve population (climate → population)

Population currently ignores `climate:event-started`. Subscribe and apply demographic shocks.

- `Epidemic` → instant headcount loss (config `epidemicMortality`, e.g. 5–15%) and growth multiplier 0 for the duration.
- `Drought` / `Harsh Winter` → growth multiplier 0; effective capacity reduced by a config factor (count clamped down if it exceeds reduced capacity).
- `Bumper Harvest` → growth multiplier ×2 for the duration.
- Tracking: per-province active multiplier stack so events can stack and expire cleanly on `climate:event-expired`.
- New config: `climateGrowthMultipliers`, `epidemicMortality`, `droughtCapacityFactor`.
- No new contracts — uses existing climate events.

### 3. Inter-province migration (population ↔ map)

Overcrowded provinces leak people each tick into same-owner adjacent provinces with available headroom.

- Trigger: `count / capacity > migrationThreshold` (e.g. 0.85).
- Destination selection: same-owner neighbours from `map.provinces[id].adjacency`, weighted by inverse density.
- Per-tick volume: `(count - threshold × capacity) × migrationRate`, split across eligible neighbours.
- Optional bonus: presence of a `port` building on either end multiplies migration rate (sea routes).
- New event: `population:migrated { fromProvinceId, toProvinceId, amount }`.
- New config: `migrationThreshold`, `migrationRate`, `portMigrationBonus`.
- Contract additions: one new event key.

### 4. Urbanization tiers / cities (population → buildings, economy, military)

Replace the linear per-1,000 income modifier with stepped settlement tiers.

- Tiers: `village` (default), `town` (≥5k), `city` (≥25k), `metropolis` (≥100k). Thresholds in config.
- On tier change, emit `population:settlement-tier-changed { provinceId, oldTier, newTier }`.
- Income shifts from flat `incomePerThousand` to a tier-driven multiplier (e.g. village ×1.0, town ×1.2, city ×1.5, metropolis ×2.0) layered on the existing additive modifier.
- Buildings mechanic gates new types (`marketplace`, `university`) on minimum tier — buildings reads tier via the event or by querying population state via a small contract addition.
- Military / diplomacy can use the tier as war-score weight or peace-deal value.
- New contract type: `SettlementTier` union in `contracts/mechanics/population.ts`; new event key.
- Replaces the current single tier-jump modifier emission with a tier-aware version (backwards-compatible during transition).

### 5. Population-weighted assimilation and unrest (population ↔ culture)

Culture currently assimilates at a fixed rate independent of who outnumbers whom. Make it demographic.

- Assimilation rate becomes a function of `nativeCulturePopulation / totalPopulation` across the country (or province), not a flat config value. A small conqueror absorbing a huge foreign population assimilates slowly or not at all.
- Population emits `population:unrest-rising { provinceId, severity }` when foreign-culture headcount × turns-since-conquest exceeds an unrest threshold. Culture, diplomacy, or a future events mechanic can react (revolts, separatist CBs, income penalty stacking).
- Conversely, a heavily populated native-culture core produces a passive `population:assimilation-pressure` event that culture can use as a multiplier.
- New events: `population:unrest-rising`, `population:assimilation-pressure`.
- New config: `unrestThreshold`, `unrestSeverityCurve`.
- Requires culture to consume new events; contract additions: two event keys.

### Implementation order (suggested)

1. **Climate shocks** — smallest blast radius, no new cross-mechanic contracts.
2. **Migration** — internal to population + map adjacency reads, one new event.
3. **Manpower cost** — needs military to cooperate; design the rejection flow first.
4. **Urbanization tiers** — touches buildings/economy gating, biggest contract surface.
5. **Population-weighted assimilation & unrest** — depends on tier/manpower data settling first.
