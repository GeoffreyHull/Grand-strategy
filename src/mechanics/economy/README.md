# Economy

## Purpose

Manages gold (currency) for each country using a two-layer modifier system.
Province income is computed from terrain base values plus building modifiers
(province-bound) combined with technology/policy multipliers (owner-bound).
This separation means conquered buildings benefit the new owner, while
technology bonuses stay with the country that researched them.

## Public API

| Export | Description |
|--------|-------------|
| `buildEconomyState()` | Returns initial `EconomyState` `{ provinces: {}, countries: {} }` |
| `loadEconomyConfig(url?)` | Loads and validates `EconomyConfig` from a JSON URL |
| `initEconomyMechanic(eventBus, stateStore, config?)` | Initialises income tracking; returns `{ update, destroy }` |
| `EconomyState` | Re-exported from contracts |
| `ProvinceEconomy` | Re-exported from contracts |
| `CountryEconomy` | Re-exported from contracts |
| `IncomeModifier` | Re-exported from contracts |
| `EconomyConfig` | Re-exported from types |

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `economy:income-collected` | `{ countryId, amount, frame }` | Every `cycleFrames` frames for each country with positive income |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|------------|-------------|-------------------------------|
| `economy:province-modifier-added` | `{ provinceId, modifier }` | Appends modifier to province; recomputes `currentIncome` |
| `economy:province-modifier-removed` | `{ provinceId, modifierId }` | Removes modifier from province; recomputes `currentIncome` |
| `economy:owner-modifier-added` | `{ countryId, modifier }` | Appends modifier to country; recomputes `currentIncome` for all owned provinces |
| `economy:owner-modifier-removed` | `{ countryId, modifierId }` | Removes modifier from country; recomputes all owned provinces |
| `map:province-conquered` | `{ provinceId, newOwnerId, oldOwnerId }` | Recomputes `currentIncome` for conquered province using new owner's modifiers |

## State Slice

`economy: EconomyState`

```typescript
interface EconomyState {
  readonly provinces: Readonly<Record<ProvinceId, ProvinceEconomy>>
  readonly countries: Readonly<Record<CountryId, CountryEconomy>>
}

interface ProvinceEconomy {
  readonly baseIncome: number          // terrain base, never changes after init
  readonly provinceModifiers: readonly IncomeModifier[]  // buildings — travel with province on conquest
  readonly currentIncome: number       // cached: (base + flat adds) × multipliers
}

interface CountryEconomy {
  readonly gold: number
  readonly modifiers: readonly IncomeModifier[]  // tech/policy — tied to owner, not province
}

interface IncomeModifier {
  readonly id: string               // stable unique ID for removal
  readonly op: 'add' | 'multiply'
  readonly value: number
  readonly label: string            // UI display: "Farm", "Efficient Farming"
  readonly buildingType?: string    // set for building modifiers; used for condition evaluation
  readonly condition?: {
    readonly type: 'hasBuilding'
    readonly buildingType: string   // modifier only applies if province has this building
  }
}
```

**Income pipeline** (applied per province each recompute):
```
1. base  = terrainIncome[province.terrainType]
2. + sum of 'add' modifiers (province + applicable owner)
3. × product of 'multiply' modifiers (province + applicable owner)
```

Owner modifiers with a `condition` are only included if the province's own
`provinceModifiers` contain a modifier with a matching `buildingType`.

**Default terrain incomes** (`public/config/economy.json`):

| Terrain | Income/cycle |
|---------|-------------|
| Plains | 5 |
| Forest | 4 |
| Hills | 3 |
| Desert | 2 |
| Mountains | 1 |
| Tundra | 1 |
| Ocean | 0 |

## Design Notes

- **Province-bound vs owner-bound modifiers.** Buildings travel with the
  province when it is conquered; technology stays with the country that
  researched it. These are stored separately in `ProvinceEconomy.provinceModifiers`
  and `CountryEconomy.modifiers`.
- **Condition evaluation is self-contained.** The economy mechanic never reads
  `GameState.buildings`. Whether a building type is present in a province is
  derived from `provinceModifiers` whose `buildingType` field is set by the
  buildings mechanic when emitting `economy:province-modifier-added`.
- **`currentIncome` is a cached derived value.** It is eagerly recomputed
  whenever any input (province modifier, owner modifier, or province ownership)
  changes. The update tick only needs to sum pre-cached values.
- **Save/load caveat.** `initEconomyMechanic` initialises province entries from
  current map state at startup. If save/load is added later, the economy state
  should be restored from the save rather than re-initialised.
- Spending gold (build costs, army upkeep) is out of scope for this
  implementation.
