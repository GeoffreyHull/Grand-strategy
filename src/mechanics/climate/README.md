# Climate

## Purpose

Passively simulates per-province weather and biome conditions. Every few turns it rolls climate events (Drought, Harsh Winter, Storm Season, Bumper Harvest, Epidemic, Mild Season) weighted by a derived climate tag, applies temporary modifiers to the province, and expires them when their duration ends. Other mechanics react to these events rather than climate mutating their state directly.

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `buildClimateState` | `() => ClimateState` | Returns the initial empty state; used by the StateStore bootstrap. |
| `loadClimateConfig` | `(url?) => Promise<ClimateConfig>` | Fetches and validates `config/climate.json`. |
| `initClimateMechanic` | `(eventBus, stateStore, config?, rng?) => { update, destroy }` | Wires up subscriptions; returns the update tick and a cleanup function. `rng` is injectable for deterministic testing. |
| `DEFAULT_CLIMATE_CONFIG` | `ClimateConfig` | Built-in fallback config. |
| `deriveClimateTag` | `(province) => ClimateTag \| null` | Pure helper — maps terrain/coastal to a ClimateTag. |
| `rollClimate` | `(turn, provinces, state, config, rng?) => RollResult` | Pure roll function used by the mechanic and exposed for tests. |
| `getActiveClimateEvents` | `(state, provinceId) => readonly ActiveClimateEvent[]` | Read-only query for other mechanics/UI. |

Re-exports: `ClimateTag`, `ClimateEventType`, `ClimateEffects`, `ActiveClimateEvent`, `ClimateState`, `ClimateConfig`.

## Events Emitted

| Event name | Payload type | When it fires |
|---|---|---|
| `climate:event-started` | `{ event: ActiveClimateEvent }` | A new climate event begins on a province. |
| `climate:event-expired` | `{ eventId, provinceId, eventType }` | An active event reaches its expiry turn. |
| `economy:province-modifier-added` | `{ provinceId, modifier }` | Translates income/port-income effects into the economy pipeline. Modifier id = `climate:<eventId>:income` or `:port`. |
| `economy:province-modifier-removed` | `{ provinceId, modifierId }` | On expiry or ownership transfer. |

## Events Consumed

| Event name | What the mechanic does with it |
|---|---|
| `map:province-conquered` | Re-emits economy modifiers so the new owner inherits current weather penalties/bonuses. |

## State Slice

`GameState.climate: ClimateState`

```typescript
interface ClimateState {
  active:       Record<string, ActiveClimateEvent>   // keyed by event id
  byProvince:   Record<ProvinceId, readonly string[]> // lookup: province → active event ids
  lastRollTurn: number
  nextEventSeq: number                                // monotonic id minter
}
```

Ocean provinces are excluded (no climate tag).

## Design Notes

**Climate tags are derived, not stored.** `deriveClimateTag` reads `terrainType` + `isCoastal` from existing map data — no new world data is introduced. `desert→arid`, `tundra→northern`, otherwise `coastal` beats the default `temperate`.

**Turn cadence.** `rollIntervalTurns` (default 3) controls how often the engine rolls for events. Within a roll, each non-ocean province has `eventChancePerProvince` (default 0.25) to roll a non-mild event; otherwise it stays quiet. At most one active event per province at a time.

**Effect channels and consumers.** Effects are a flat payload with optional fields (`incomePct`, `portIncomePct`, `attritionPct`, `unrestAdd`, `movementCostAdd`, `blocksFleetMovement`, `pausesPopulationGrowth`). Today, only income/port-income are auto-translated into `IncomeModifier`s the economy mechanic already understands. The other channels are persisted on `ActiveClimateEvent` and published on the event payload so future consumers (combat attrition, fleet movement, unrest, population pause) can subscribe without re-rolling history.

**Isolation.** The mechanic never imports from other mechanics. It reads map state through the `StateStore` to discover provinces, and emits events for anything other mechanics need to know. The ClimateEngine itself is a pure function: `rollClimate` has no side effects and takes an injectable RNG, which makes tests deterministic.

**Port events.** Storm-season modifiers are conditional — they only apply when the province actually has a port building, using the economy mechanic's existing `condition: { type: 'hasBuilding', buildingType: 'port' }` field.

**Conquest.** When a province changes hands mid-event, the event persists (weather doesn't care about borders), but the economy modifier is re-emitted so the new owner's income pipeline sees it consistently.

**Config.** `public/config/climate.json` overrides any field. Missing/invalid falls back to `DEFAULT_CLIMATE_CONFIG` with a console warning (handled by `main.ts`).
