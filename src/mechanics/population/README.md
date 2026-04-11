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
