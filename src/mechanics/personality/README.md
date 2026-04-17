# Personality

## Purpose

Tracks each nation's personality archetype plus two learned records that
shape AI decision-making:

1. A **RelationshipLedger** of signed trust entries toward every other nation,
   written by significant events (wars, alliances, conquests, climate
   shocks) and decayed linearly each turn.
2. A per-nation **InvestmentBias** — naval investment urgency, religious
   aggression, defensive urge, economic urge — that drifts from baseline
   based on lived experience (e.g. repeated storms → rising naval urgency)
   and slowly relaxes back each turn.

The AI mechanic consults these structures when scoring actions. Archetype
category multipliers are applied at query time so the same ledger entry
reads differently to different archetypes (a -10 religious grievance is a
-20 hostility number for a Zealot, but -10 for an Expansionist).

## Public API

| Export | Type | Description |
|---|---|---|
| `buildPersonalityState` | `(archetypeByCountry?, config?) => PersonalityState` | Initializes one `NationPersonality` per supplied (country, archetype) pair. |
| `initPersonalityMechanic` | `(eventBus, stateStore, config?) => { update, destroy }` | Wires subscriptions; returns the per-turn update and cleanup. |
| `DEFAULT_PERSONALITY_CONFIG` | `PersonalityConfig` | Built-in fallback configuration. |
| `trustScore` | `(state, fromCountry, towardCountry) => number` | Archetype-weighted trust — the primary query for AI scoring. |
| `getBias` | `(state, countryId) => InvestmentBias` | Retrieves a nation's investment biases. |
| `getNationPersonality` | `(state, countryId) => NationPersonality \| undefined` | Read-only lookup. |
| `ARCHETYPE_WEIGHTS` | `Record<Archetype, ArchetypeWeights>` | Per-archetype scoring weights and ledger multipliers. |
| `weightedMagnitude` | `(entryMag, category, archetype) => number` | Per-entry multiplier helper. |
| `weightedTrust`, `rawTrust`, `addEntry`, `decayLedger` | helpers | Lower-level primitives exposed for tests. |

Re-exports the public contracts from `@contracts/mechanics/personality`.

## Events Emitted

| Event | Payload | When |
|---|---|---|
| `personality:ledger-entry-added` | `{ countryId, targetId, entry }` | Any time a reactor writes a new ledger entry. |
| `personality:ledger-entry-decayed` | `{ countryId, targetId, entryId, newMagnitude }` | Each decay tick, for every entry whose magnitude changed. |
| `personality:bias-changed` | `{ countryId, field, newValue }` | When an investment bias crosses a drift or reaction update. |

## Events Consumed

| Event | Effect |
|---|---|
| `diplomacy:war-declared` | Target writes `aggression -40` toward declarer. |
| `diplomacy:alliance-formed` | Both sides write `alliance +30` entries. |
| `diplomacy:ally-called-to-war` | Caller writes `alliance +20` toward honouring ally. |
| `diplomacy:ally-forced-peace` | Abandoned ally writes `alliance -25` toward the peace-maker. |
| `map:province-conquered` | Old owner writes `aggression -30` toward new owner. |
| `climate:event-started` | Every other nation writes an `opportunism`/`rising-power` entry toward the afflicted nation, magnitude derived from effect severity. Self-bias bumps for Mercantile (naval investment), Zealot (religious aggression), Isolationist (defensive urge), etc. |

## State Slice

`GameState.personality: PersonalityState`

```typescript
interface PersonalityState {
  nations: Record<CountryId, NationPersonality>
}

interface NationPersonality {
  countryId: CountryId
  archetype: AIPersonalityArchetype
  ledger:    RelationshipLedger
  bias:      InvestmentBias
}
```

## Design Notes

**Archetype shared with AI mechanic.** The archetype enum lives in
`contracts/mechanics/ai.ts` (`expansionist | hegemon | mercantile |
isolationist | zealot`). The personality mechanic layers ledger multipliers
and investment biases on top — they're complementary, not a replacement for
the AIPersonality weight dials (aggression/diplomacy/economy/caution).

**Multipliers at query time, not write time.** Reactor entries are stored
with their raw magnitude. `weightedTrust` applies the archetype's
per-category multiplier when a consumer asks. This keeps event ordering
deterministic (the same event writes the same entry regardless of when it
fires) and makes it trivial to tune archetype feel without rewriting
history.

**Decay is linear.** Each turn, entries lose `decayPerTurn` absolute
magnitude toward zero and are dropped when they fall below
`ledgerCleanupThreshold`. Biases drift toward the archetype baseline at
`biasDecayPerTurn`. Linear decay was chosen over exponential so that
magnitude/turn-count arithmetic stays easy to reason about in tests and UI
tooltips.

**Cross-system coupling is event-mediated.** This mechanic never imports
from diplomacy, climate, map, or AI. Reactor logic is pure and unit-tested
in isolation; the index.ts file owns subscriptions and StateStore commits.

**Emergent behaviour, not scripted triggers.** The five requested
cross-system interactions (Zealot on drought, Expansionist on epidemic,
etc.) emerge from two ingredients: (a) climate events write
category-tagged entries indiscriminately, (b) archetype multipliers decide
whose attention to amplify. No branch in the code says "if Zealot + drought
then ...".

**Culture conversions.** The current culture event doesn't identify the
losing nation, so no ledger entry is written from `culture:province-converted`
directly. The `conquest` branch is a stronger signal anyway and covers the
aggressive-culture-imposition case. When the event payload is extended to
include the displaced owner, enable the `onProvinceConverted` reactor.

## Roadmap

### 1. Climate adaptation memory (personality ↔ climate)

The current climate reactors write a single ledger entry per event. Add **doctrinal memory**: repeated exposure to the same climate event type within a window shifts that nation's `InvestmentBias` in a lasting way that outlives the individual events.

- Maintain `climateDoctrine: Record<ClimateEventType, { count: number, lastSeenTurn: number }>` per nation.
- On `climate:event-started`, increment the count for that event type. If `count >= climateDoctrineThreshold` within `doctrineWindow` turns, apply a permanent (until decay) bias shift via `climateDoctrineBiasDeltas[eventType]` and emit `personality:climate-doctrine-shifted { countryId, climateEventType, newBiasField, newBiasValue }`.
  - Storm Season → raises `navalInvestmentUrgency`.
  - Drought → raises `defensiveUrge` and `economicUrge`.
  - Epidemic → raises `defensiveUrge`, suppresses `aggressiveness`.
- If the event type does not recur within `doctrineDecayTurns`, the doctrine relaxes back; emit `personality:climate-doctrine-decayed`.
- This is distinct from the existing per-event ledger reaction — that's the emotional response; this is the institutional response.
- New config: `climateDoctrineThreshold`, `doctrineWindow`, `doctrineDecayTurns`, `climateDoctrineBiasDeltas` map.
- Contract additions: two new event keys; `NationPersonality` gains `climateDoctrine: Record<ClimateEventType, ...>` field.

### Implementation order (suggested)

1. **Climate adaptation memory** — small, self-contained extension to the existing climate reactors. Do this before the AI roadmap's "consume personality bias" so the doctrine actually changes AI behavior visibly.
