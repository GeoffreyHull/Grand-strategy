# Technology

## Purpose

Allows countries to research technologies that represent advances in agriculture, metallurgy, trade, governance, and military capability. Research is time-gated and tracked per country — each country maintains its own set of discovered technologies. A country cannot research the same technology twice.

## Public API

| Export | Description |
|--------|-------------|
| `buildTechnologyState()` | Returns the initial empty `TechnologyState` for use in `StateStore`. |
| `loadTechnologyConfig(url?)` | Fetches and validates `/config/technology.json`; falls back to `DEFAULT_TECHNOLOGY_CONFIG` defaults if no custom URL is provided. |
| `requestResearchTechnology(eventBus, stateStore, ownerId, locationId, technologyType, config?)` | Begins researching a technology. Emits `construction:request` (via the construction mechanic) or `technology:research-rejected` if the country already has the tech. |
| `initTechnologyMechanic(eventBus, stateStore, config?)` | Wires up the `construction:complete` listener; updates state and emits `technology:research-completed` when research finishes. Returns `{ destroy }`. |
| `initTechnologyEffects(eventBus)` | Wires up economy modifier side-effects for researched technologies. Listens to `technology:research-completed` and emits the appropriate `economy:owner-modifier-added` events. Returns `{ destroy }`. Call alongside `initTechnologyMechanic` during game bootstrap. |

Re-exported contract types: `ResearchedTechnology`, `TechnologyId`, `TechnologyType`, `TechnologyState`, `TechnologyConfig`, `TechnologyTypeConfig`.

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `construction:request` | `EventMap['construction:request']` | When `requestResearchTechnology` is called and the tech is not yet known. |
| `technology:research-completed` | `{ technologyId, countryId, technologyType }` | After `construction:complete` is processed and state is updated. |
| `technology:research-rejected` | `{ ownerId, technologyType, reason: 'already-researched' }` | When `requestResearchTechnology` is called but the country already has that technology. |
| `economy:owner-modifier-added` | `{ countryId, modifier }` | Emitted by `initTechnologyEffects` when agriculture or trade-routes research completes. |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|------------|-------------|-------------------------------|
| `construction:complete` | `EventMap['construction:complete']` | If `buildableType === 'technology'` and the metadata `technologyType` is valid, creates a `ResearchedTechnology` record, updates the `byCountry` index, and emits `technology:research-completed`. |

## State Slice

```typescript
interface TechnologyState {
  technologies: Record<TechnologyId, ResearchedTechnology>
  byCountry:    Record<CountryId, readonly TechnologyType[]>
}
```

- **`technologies`** — flat record of all completed research across all countries, keyed by `TechnologyId`.
- **`byCountry`** — per-country index mapping `CountryId` to the ordered list of `TechnologyType` values that country has researched. Used for O(1)-ish duplicate checks and queries like "what does country X know?".

## Design Notes

- **Construction pipeline.** Research uses the shared construction queue (`buildableType: 'technology'`) rather than managing its own timer, keeping the concurrency and progress logic centralised in the construction mechanic.
- **Per-country tracking.** `byCountry` is maintained alongside the flat `technologies` record so callers can answer "does country X know Y?" without scanning the full record.
- **Duplicate prevention at request time.** `requestResearchTechnology` reads `byCountry` and rejects the request immediately if the tech is already known, emitting `technology:research-rejected` before a construction job is created.
- **No prerequisites.** Technologies are independent in this initial implementation. Prerequisites can be layered on top by extending `requestResearchTechnology` to check a dependency list.
- **Config-driven durations.** Research times live in `public/config/technology.json` and are validated at load time with `validateTechnologyConfig`. Hardcoded defaults are provided via `DEFAULT_TECHNOLOGY_CONFIG` so the mechanic works in tests without network access.
- **8 initial technologies.** `agriculture`, `iron-working`, `steel-working`, `trade-routes`, `writing`, `siege-engineering`, `cartography`, `bureaucracy`. New types are added by extending the `TechnologyType` union in `src/contracts/mechanics/technology.ts`, adding an entry to `DEFAULT_TECHNOLOGY_CONFIG` / the JSON config, and updating `KNOWN_TECHNOLOGY_TYPES` in `types.ts`.
- **Effects are a separate init.** `initTechnologyEffects` is intentionally separate from `initTechnologyMechanic` so that effect application can be tested in isolation and so that integrators can defer or omit effects during testing. Both must be called at game bootstrap for full behaviour.
- **Stable modifier IDs.** Economy modifiers applied by `initTechnologyEffects` use deterministic IDs of the form `technology:<type>:<countryId>`. This makes them addressable for future removal (e.g. if a tech could ever be lost) without maintaining extra state.
- **Pending effects.** `iron-working`, `steel-working`, `writing`, `siege-engineering`, `cartography`, and `bureaucracy` require new contract types before their effects can be implemented. See the TODO comments in `effects.ts` and the engine agent task list.
