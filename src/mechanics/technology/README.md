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

Re-exported contract types: `ResearchedTechnology`, `TechnologyId`, `TechnologyType`, `TechnologyState`, `TechnologyConfig`, `TechnologyTypeConfig`.

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `construction:request` | `EventMap['construction:request']` | When `requestResearchTechnology` is called and the tech is not yet known. |
| `technology:research-completed` | `{ technologyId, countryId, technologyType }` | After `construction:complete` is processed and state is updated. |
| `technology:research-rejected` | `{ ownerId, technologyType, reason: 'already-researched' }` | When `requestResearchTechnology` is called but the country already has that technology. |

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
