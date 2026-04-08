# Economy

## Purpose

Manages gold (currency) for each country. Countries earn gold each income cycle
based on the number of provinces they own plus bonuses from buildings in those
provinces. Farms and ports increase income; barracks and walls do not.

## Public API

| Export | Description |
|--------|-------------|
| `buildEconomyState()` | Returns the initial `EconomyState` `{ countries: {} }` |
| `loadEconomyConfig(url?)` | Loads and validates `EconomyConfig` from a JSON URL |
| `initEconomyMechanic(eventBus, stateStore, config?)` | Initializes income tracking, returns `{ update, destroy }` |
| `EconomyState` | Re-exported from contracts |
| `CountryEconomy` | Re-exported from contracts |
| `EconomyConfig` | Re-exported from types |

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `economy:income-collected` | `{ countryId, amount, frame }` | Every `cycleFrames` frames for each country with positive income |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|------------|-------------|-------------------------------|
| `buildings:building-constructed` | `{ buildingId, countryId, provinceId, buildingType }` | Recomputes `incomePerCycle` for all countries |
| `map:province-conquered` | `{ provinceId, newOwnerId, oldOwnerId }` | Recomputes `incomePerCycle` for all countries |

## State Slice

`economy: EconomyState`

```typescript
interface EconomyState {
  readonly countries: Readonly<Record<CountryId, CountryEconomy>>
}

interface CountryEconomy {
  readonly gold: number           // current treasury balance
  readonly incomePerCycle: number // gold earned per income cycle (recomputed on change)
}
```

**Default config** (`public/config/economy.json`):

| Setting | Value | Notes |
|---------|-------|-------|
| `cycleFrames` | 60 | Income tick every 3 s at 20 Hz |
| `baseProvinceIncome` | 5 | Gold per province owned per cycle |
| `buildingIncome.farm` | 10 | Bonus per farm in an owned province |
| `buildingIncome.port` | 15 | Bonus per port in an owned province |
| `buildingIncome.barracks` | 0 | No income bonus |
| `buildingIncome.walls` | 0 | No income bonus |
| `startingGold` | 50 | Starting treasury for each country |

## Design Notes

- **Income is positional, not ownership-based.** A farm in a conquered province
  benefits the new owner, not whoever built it. This matches grand-strategy
  convention and avoids stale building-ownership data after conquests.
- `incomePerCycle` is stored in state so the UI can display it without
  recomputing. It is recomputed eagerly whenever buildings or province ownership
  change.
- The first income tick fires at frame `cycleFrames` (not frame 0) to avoid
  double-counting starting gold.
- Spending gold (armies, buildings) is out of scope for this implementation.
  Future work: add a `gold >= cost` guard in `requestBuildArmy` /
  `requestBuildBuilding` and emit a deduction event.
