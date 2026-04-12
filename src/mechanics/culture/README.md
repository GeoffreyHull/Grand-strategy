# Culture

## Purpose

Tracks the cultural identity of each province and models assimilation of foreign-culture provinces over time. When a country conquers a province that carries a different culture, it suffers a small income penalty until the population gradually adopts the conqueror's culture. This creates a cost of empire expansion beyond the immediate military and economic pressures.

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `buildCultureState` | `() => CultureState` | Returns the initial empty state; used by the StateStore bootstrap. |
| `loadCultureConfig` | `(url?) => Promise<CultureConfig>` | Fetches and validates `config/culture.json`. |
| `initCultureMechanic` | `(eventBus, stateStore, config?) => { update, destroy }` | Wires up all subscriptions; returns the update tick and cleanup function. |
| `DEFAULT_CULTURE_CONFIG` | `CultureConfig` | Built-in fallback config used when the JSON file is missing or invalid. |

Re-exports: `CultureId`, `ProvinceCulture`, `CultureState`, `CultureConfig`.

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `culture:province-converted` | `{ provinceId, oldCultureId, newCultureId, countryId }` | When assimilation progress reaches the threshold and a province adopts the owner's culture. |
| `culture:assimilation-progressed` | `{ provinceId, progress, targetCultureId }` | Each assimilation tick for a mismatched province (before conversion). |
| `economy:province-modifier-added` | `{ provinceId, modifier }` | When a province is conquered by a country with a different culture (adds mismatch penalty). |
| `economy:province-modifier-removed` | `{ provinceId, modifierId }` | When a province is reconquered by its native-culture owner, or when assimilation completes. |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|------------|-------------|-------------------------------|
| `map:province-conquered` | `{ provinceId, newOwnerId, oldOwnerId, … }` | Resets assimilation progress; adds/removes mismatch economy modifier based on cultural match between province and new owner. |

## State Slice

`GameState.culture: CultureState`

```typescript
interface CultureState {
  provinces:      Record<ProvinceId, ProvinceCulture>
  countryCultures: Record<CountryId, CultureId>
}

interface ProvinceCulture {
  provinceId:           ProvinceId
  cultureId:            CultureId  // dominant culture in this province
  assimilationProgress: number     // 0–100; resets to 0 on conquest
}
```

Each country has one native culture, derived deterministically from its `CountryId` (`culture:<countryId>`). All provinces begin with their founding owner's culture — no mismatches exist at game start.

## Design Notes

**Neutral baseline.** Cultural match carries no bonus. Only mismatch carries a penalty (default −10% province income via a `multiply 0.9` modifier, id `culture-mismatch:<provinceId>`). This means existing economies are unaffected at start and the cost only appears when expansion crosses cultural lines.

**Assimilation.** Each `cycleFrames`-frame tick, every province whose culture differs from its owner's culture gains `assimilationRatePerCycle` progress points. At `assimilationThreshold` (default 100) the province culture converts, the mismatch modifier is removed, and `culture:province-converted` is emitted. Progress resets to 0 on conquest.

**One modifier per province.** The modifier id is stable (`culture-mismatch:<provinceId>`). On each conquest the mechanic removes any existing modifier and adds a new one if the new owner's culture differs from the province culture. This prevents duplicate modifiers during repeated ownership changes.

**Ocean provinces.** Excluded from the culture state — they cannot be owned and have no cultural identity.

**Config.** `public/config/culture.json` can override any numeric field. Missing or invalid files fall back to `DEFAULT_CULTURE_CONFIG` with a console warning (handled by `main.ts`).
