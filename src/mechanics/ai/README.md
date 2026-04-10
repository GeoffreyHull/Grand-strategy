# AI Mechanic

## Purpose

Provides a utility-based decision-making framework for all AI-controlled nations.
Each nation has a personality archetype that biases its strategy. Every 60 game
frames (~3 seconds at 20 Hz) each AI nation scores five action types (EXPAND,
FORTIFY, ALLY, ISOLATE, RESEARCH), weights the scores by personality, adds a small
random noise, and emits the highest-scoring action as an `ai:decision-made` event.

The mechanic reads `DiplomacyState` and `TechnologyState` each tick to make
context-aware decisions: war targets avoid allied/truce nations, ally targets skip
nations already allied or at war, and research urgency falls as techs are learned.

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

Each action type has a pure scoring function. The final score is
`utility × personalityWeight + random(0, 0.1)`.

| Action | Utility function | Personality weight | Notes |
|--------|-----------------|-------------------|-------|
| EXPAND | `1 − own/max + 0.15 bonus if foreign nations exist` | `aggression` | Penalises large nations |
| FORTIFY | ratio of coastal/hilly/mountain provinces | `caution` | Exposed borders raise score |
| ALLY | base 0.3 + 0.1 if aggressive threat, −0.1 if repeated; 0 if no legal targets | `diplomacy` | Checks DiplomacyState for valid candidates |
| ISOLATE | `0.2 + caution × 0.3` | `caution` | Pure personality signal |
| RESEARCH | `remainingTechs / 8` | `economy` | Falls to 0 when all 8 techs are known |

### Target selection

- **EXPAND**: calls `findWarTarget` which picks the country with the fewest provinces
  among all nations that are not allied, at war, or in truce with the attacker.
  Returns `null` when no legal target exists; `main.ts` silently skips the
  `declareWar` call in that case.
- **ALLY**: calls `findAllyTarget` which scores candidates by diplomacy trait,
  favouring diplomat/merchant archetypes, and skips nations already allied or at
  war with the decision-maker.
- **FORTIFY / ISOLATE / RESEARCH**: `targetCountryId` is always `null`.

### AIContext

`AIController.update` and `evaluateDecision` receive an `AIContext` bag instead of
individual state parameters. Adding a new scoring signal from a future mechanic only
requires extending `AIContext` (internal `types.ts`) and the `update` call in
`index.ts`. No changes to the controller's method signatures are needed.

```ts
interface AIContext {
  mapState:        MapState
  aiState:         AIState
  diplomacyState:  DiplomacyState
  technologyState: TechnologyState
}
```

### Decision interval

Decisions are gated by `decisionIntervalFrames` (default 60 frames). This
prevents the AI from thrashing and gives downstream mechanics time to act on a
decision before it changes.

### No cross-mechanic imports

The AI mechanic never imports from `src/mechanics/map/` or any other mechanic.
State is read through `StateStore.getState()` (via `GameState`) and decisions
are communicated via `ai:decision-made` events.
