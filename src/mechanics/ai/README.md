# AI Mechanic

## Purpose

Provides a utility-based decision-making framework for all AI-controlled nations.
Each nation has a personality archetype that biases its strategy. Every 60 game
frames (~3 seconds at 20 Hz) each AI nation scores four action types (EXPAND,
FORTIFY, ALLY, ISOLATE), weights the scores by personality, adds a small random
noise, and emits the highest-scoring action as an `ai:decision-made` event.

Future mechanics (diplomacy, military, economy) subscribe to these events to
execute the actual game consequences of each decision.

## Public API

All exports come from `src/mechanics/ai/index.ts`.

### `buildAIState(playerCountryId?: CountryId): AIState`

Constructs the initial `AIState` with all 20 nations assigned their default
personalities. Pass a `CountryId` to mark one nation as player-controlled
(it will not receive AI decisions). Called once during game bootstrap.

### `initAIMechanic(eventBus, stateStore): { update, destroy }`

Initialises the mechanic. Register `update` with the game loop:

```ts
const aiMechanic = initAIMechanic(eventBus, stateStore)
gameLoop.addUpdateSystem(aiMechanic.update)
```

`destroy()` cleans up event subscriptions.

### Re-exported contract types

`AIState`, `AICountryState`, `AIPersonality`, `AIDecision`, `AIActionType`,
`AIPersonalityArchetype`

## Events Emitted

| Event name | Payload type | When it fires |
|---|---|---|
| `ai:decision-made` | `{ decision: AIDecision }` | Each time an AI nation completes its decision cycle |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|---|---|---|
| `ai:player-country-set` | `{ countryId: CountryId }` | Marks that country as player-controlled; it no longer receives AI decisions |

## State Slice

`GameState.ai: AIState`

```ts
interface AIState {
  countries: Record<string, AICountryState>  // keyed by CountryId string
  playerCountryId: CountryId | null
  decisionIntervalFrames: number             // default 60 ≈ 3 s at 20 Hz
}

interface AICountryState {
  countryId: CountryId
  isPlayerControlled: boolean
  personality: AIPersonality
  lastDecision: AIDecision | null
  lastDecisionFrame: number
}
```

## Personality Archetypes

| Archetype | Aggression | Diplomacy | Economy | Caution | Nations |
|---|---|---|---|---|---|
| `conqueror` | 0.8 | 0.1 | 0.3 | 0.2 | Kharrath, Valdorn, Ulgrath |
| `diplomat` | 0.1 | 0.8 | 0.4 | 0.3 | Solenne, Halvorn, Ostmark, Carath |
| `merchant` | 0.2 | 0.5 | 0.8 | 0.4 | Auren, Luminar, Verath, Vyshan, Norwind |
| `isolationist` | 0.2 | 0.2 | 0.5 | 0.8 | Dravenn, Durnrak, Wyrmfen |
| `zealot` | 0.6 | 0.2 | 0.3 | 0.3 | Thornwood, Mireth, Pelundra, Zhardan, Serath |

## Design Notes

### Utility scoring
Each action type has a pure scoring function that reads `MapState` and `AIState`:

- **EXPAND** — `1 - ownProvinceCount/maxProvinceCount + 0.15 bonus if foreign neighbours exist`. Penalises large nations; rewards smaller ones.
- **FORTIFY** — ratio of coastal/hilly/mountainous provinces to total. Nations with exposed borders prioritise defence.
- **ALLY** — base 0.3, +0.1 if any conqueror/zealot nation exists, -0.1 if last decision was ALLY (prevents ALLY loops).
- **ISOLATE** — `0.2 + caution × 0.3`. Pure personality signal.

The final score for each action is `utility × personalityWeight + random(0, 0.1)`.
`personalityWeight` is: EXPAND↔`aggression`, FORTIFY↔`caution`, ALLY↔`diplomacy`, ISOLATE↔`caution`.

### Decision interval
Decisions are gated by `decisionIntervalFrames` (default 60 frames). This
prevents the AI from thrashing and gives future mechanics time to act on a
decision before it changes.

### No cross-mechanic imports
The AI mechanic never imports from `src/mechanics/map/` or any other mechanic.
It reads map data through the `StateStore` (via `GameState.map`) and communicates
decisions through `ai:decision-made` events that future mechanics consume.

### Forward compatibility
The `AIDecision` type includes a `targetCountryId` field (for ALLY decisions and
future war targets) and a `priority` score that downstream mechanics can use to
rank competing AI demands.
