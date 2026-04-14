# AI Mechanic

## Purpose

Provides a utility-based decision-making framework for all AI-controlled nations.
Each nation has a personality archetype that biases its strategy. Every 60 game
frames (~3 seconds at 20 Hz) each AI nation scores six action types (EXPAND,
FORTIFY, ALLY, ISOLATE, RESEARCH, SEEK_PEACE), weights the scores by personality,
adds small random noise, and emits one or more `ai:decision-made` events.

The number of actions taken per decision is judgment-based: aggressive and
economically active personalities can take up to 4 actions per turn (e.g. a
expansionist might declare war on two nations and raise multiple armies in the same
decision batch), while cautious/isolationist personalities typically take only one.
A minimum score threshold — raised by high caution and lowered by high aggression —
gates whether an action fires at all.

The mechanic reads `DiplomacyState`, `MapState`, and `TechnologyState` each tick to make
context-aware decisions: war targets avoid allied/truce nations, ally targets skip
nations already allied or at war, research urgency falls as techs are learned, and
SEEK_PEACE urgency rises when a country is outnumbered or fighting on multiple fronts.

When a truce request arrives (`diplomacy:truce-requested`), `main.ts` calls
`evaluateTruceResponse` synchronously so the AI responds immediately to incoming
requests — without waiting for the next decision cycle.

## Public API

All exports come from `src/mechanics/ai/index.ts`.

### `buildAIState(playerCountryId?: CountryId): AIState`

Constructs the initial `AIState` with all 20 nations assigned their default
personalities. Pass a `CountryId` to mark one nation as player-controlled
(it will not receive AI decisions). Called once during game bootstrap.

### `initAIMechanic(eventBus, stateStore): { update, evaluateTruceResponse, destroy }`

Initialises the mechanic. Register `update` with the game loop:

```ts
const aiMechanic = initAIMechanic(eventBus, stateStore)
gameLoop.addUpdateSystem(aiMechanic.update)
```

`evaluateTruceResponse(requesterId, targetId, context)` — evaluates whether an
AI-controlled `targetId` should accept a truce request from `requesterId`. Called by
`main.ts` when `diplomacy:truce-requested` fires and the target is AI-controlled.
Returns `true` to accept, `false` to reject.

`destroy()` cleans up event subscriptions.

### Re-exported contract types

`AIState`, `AICountryState`, `AIPersonality`, `AIDecision`, `AIActionType`,
`AIPersonalityArchetype`

## Events Emitted

| Event name | Payload type | When it fires |
|---|---|---|
| `ai:decision-made` | `{ decision: AIDecision }` | Once per action in the decision batch; a single nation may emit this 1–4 times per interval |

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
  lastDecisions: readonly AIDecision[]       // all actions taken in the last batch
  lastDecisionFrame: number
}
```

## Personality Archetypes

| Archetype | Aggression | Diplomacy | Economy | Caution | Nations |
|---|---|---|---|---|---|
| `expansionist` | 0.8 | 0.1 | 0.3 | 0.2 | Kharrath, Valdorn, Ulgrath |
| `hegemon` | 0.4 | 0.7 | 0.5 | 0.4 | Solenne, Halvorn, Ostmark, Carath |
| `mercantile` | 0.2 | 0.5 | 0.8 | 0.4 | Auren, Luminar, Verath, Vyshan, Norwind |
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
| SEEK_PEACE | `powerDeficit × 0.5 + personalityUrge × 0.4 + multiFrontPenalty`; 0 if not at war | none (raw score) | `powerDeficit = max(0, 1 − own/totalEnemy)`; `personalityUrge = caution × 0.4 + (1−aggression) × 0.3`; multi-front penalty caps at 0.3 |

### Multi-action decision logic

`evaluateDecisions` (used by `update`) replaces the old single-best-action approach:

1. All five action types are scored as before.
2. A **threshold** filters out low-utility actions:
   `threshold = 0.25 + caution × 0.15 − aggression × 0.05`
3. An **action budget** caps total actions per turn:
   `maxActions = clamp(1, 1 + round(aggression × 2 + economy × 0.5), 4)`
4. Eligible actions (above threshold) are sorted by score descending.
5. High-scoring actions (> 0.65) may fire more than once — up to their per-type cap:
   - EXPAND: max 2 (attack up to 2 nations)
   - FORTIFY: max 3 (raise up to 3 armies)
   - ALLY: max 2 (form up to 2 alliances)
   - ISOLATE: max 2 (fortify up to 2 provinces)
   - RESEARCH: max 1 (queue at most 1 tech)
   - SEEK_PEACE: max 1 (one truce request per decision)
6. For EXPAND and ALLY, already-chosen targets are excluded from subsequent
   repetitions of the same action so the same nation is never targeted twice.
7. At least one action is always returned (fallback to the highest-scoring action
   even if it doesn't clear the threshold).

**Effective action ranges by archetype:**

| Archetype | Typical actions/turn | maxActions budget |
|-----------|---------------------|-------------------|
| expansionist | 2–4 | 3 |
| zealot | 1–3 | 2 |
| hegemon / mercantile | 1–2 | 2 |
| isolationist | 1 | 1 |

### Target selection

- **EXPAND**: calls `findWarTarget` which picks the country with the fewest provinces
  among all nations that are not allied, at war, or in truce with the attacker.
  Accepts an `excluded` set so repeated EXPAND decisions in the same batch attack
  different nations. Returns `null` when no legal target exists.
- **ALLY**: calls `findAllyTarget` which scores candidates by diplomacy trait,
  favouring hegemon/mercantile archetypes, and skips nations already allied or at
  war with the decision-maker. Accepts an `excluded` set for multi-alliance batches.
- **FORTIFY / ISOLATE / RESEARCH**: `targetCountryId` is always `null`.
- **SEEK_PEACE**: calls `findWarEnemy` which picks the enemy with the **most** provinces (the biggest threat). Returns `null` when not at war.

### `evaluateDecision` (single-action, public)

Kept for testing and compatibility. Scores all actions, picks the single best, and
returns one `AIDecision`. Does not apply the multi-action threshold or budget logic.

### AIContext

`evaluateDecisions` and `evaluateDecision` receive an `AIContext` bag instead of
individual state parameters. Adding a new scoring signal from a future mechanic only
requires extending `AIContext` (internal `types.ts`) and the `update` call in
`index.ts`.

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

### Truce response evaluation

`evaluateTruceResponse(requesterId, targetId, context)` is a synchronous method
called by `main.ts` — not part of the normal decision cycle. It computes:

```
powerRatio  = responderProvinces / Math.max(1, requesterProvinces)
winBonus    = max(0, powerRatio − 1.0) × 0.4   // winning → lean toward reject
acceptBase  = diplomacy × 0.5 + caution × 0.3
aggrPenalty = aggression × 0.4
acceptScore = acceptBase − aggrPenalty − winBonus + random(0, 0.1)
accept      = acceptScore > 0.25
```

Diplomats and isolationists with a disadvantage almost always accept. Conquerors
and zealots with a clear advantage almost always reject.

### No cross-mechanic imports

The AI mechanic never imports from `src/mechanics/map/` or any other mechanic.
State is read through `StateStore.getState()` (via `GameState`) and decisions
are communicated via `ai:decision-made` events.

## Roadmap

### 1. AI scoring consumes personality bias (ai ↔ personality)

The AI scores actions using only the hardcoded `AIPersonality` weight dials. The personality mechanic already maintains live `InvestmentBias` values shaped by lived experience (climate shocks, repeated wars, etc.) — but AI ignores them. Close the loop.

- Extend `AIContext` with the personality slice: `personalityState: PersonalityState`.
- Each scoring pass, look up the deciding nation's `getBias(state, countryId)` and apply the values to per-action additive modifiers via a `biasToActionWeightMap` config:
  - `navalInvestmentUrgency` → `+FORTIFY` weight on coastal provinces, `−EXPAND` weight on landlocked targets.
  - `defensiveUrge` → `+FORTIFY` and `+SEEK_PEACE` weights.
  - `economicUrge` → `+RESEARCH` and `−EXPAND` weights.
  - `religiousAggression` → `+EXPAND` weight against ideologically-different cultures (composes with the culture roadmap's ideology tags).
- Cap total bias adjustment per action at `biasInfluenceCap` to prevent runaway dominance.
- This makes nations that have *experienced* repeated naval shocks actually invest in the navy, not just carry a stat that nothing reads.
- New event (debug/UI signal only): `ai:bias-incorporated { countryId, biasSnapshot }`.
- New config: `biasToActionWeightMap`, `biasInfluenceCap`.
- Contract additions: one new event key; `AIContext` extension documented in `contracts/mechanics/ai.ts`.

### Implementation order (suggested)

1. **Consume personality bias** — land *after* personality's "climate adaptation memory" roadmap item so doctrine shifts have somewhere to go. Without this, the personality state mutates but never affects play.
