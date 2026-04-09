# Diplomacy

## Purpose

Manages all diplomatic relations between countries: wars, truces, non-aggression pacts, and alliances. Acts as the gating layer for military aggression — a country may only attack another when the two are at war.

## Public API

Exported from `index.ts`:

| Export | Description |
|--------|-------------|
| `buildDiplomacyState(framesPerTurn?)` | Returns the initial `DiplomacyState` for `StateStore` |
| `initDiplomacy(bus, store)` | Initialises the mechanic; returns a `DiplomacyMechanic` object |
| `DEFAULT_FRAMES_PER_TURN` | Default frames per diplomatic turn (100 ≈ 5 s at 20 Hz) |
| `DiplomacyMechanic` (type) | Return type of `initDiplomacy` |
| `DiplomaticStatus` (type) | `'neutral' \| 'non-aggression' \| 'allied' \| 'war' \| 'truce'` |
| `DiplomaticRelation` (type) | Full relation record from the state |
| `DiplomacyState` (type) | Mechanic state slice |

### `DiplomacyMechanic` methods

| Method | Description |
|--------|-------------|
| `declareWar(declarerId, targetId)` | Declare war; blocked by active truce, existing war, or alliance. Automatically calls allies in on both sides. |
| `makePeace(countryA, countryB)` | End a war; imposes a 5-turn truce. Allied co-belligerents are forced to peace simultaneously. |
| `signNonAggressionPact(countryA, countryB)` | Establish a NAP; no-op if at war or already NAP/allied. |
| `formAlliance(countryA, countryB)` | Establish an alliance; no-op if at war or already allied. |
| `canAttack(attackerId, targetId)` | Returns `true` only when the two countries are at war. |
| `getRelation(countryA, countryB)` | Returns the `DiplomaticRelation` or `null` if no explicit relation exists (implies neutral). |
| `update(ctx)` | Advances the turn counter and expires elapsed truces; must be registered with the game loop. |
| `destroy()` | Cleans up any internal subscriptions (currently none). |

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `diplomacy:war-declared` | `{ declarerId, targetId }` | War successfully declared |
| `diplomacy:war-rejected` | `{ declarerId, targetId, reason }` | War blocked (`'truce-active'` \| `'already-at-war'` \| `'allied'`) |
| `diplomacy:peace-made` | `{ countryA, countryB }` | Peace agreed, truce begins |
| `diplomacy:truce-expired` | `{ countryA, countryB }` | Truce duration elapsed, relation returns to neutral |
| `diplomacy:ally-called-to-war` | `{ allyId, calledById, warTargetId }` | An ally was automatically pulled into a war |
| `diplomacy:ally-forced-peace` | `{ allyId, peaceCountryId, enemyId }` | An ally was forced to peace because their partner made peace |
| `diplomacy:non-aggression-pact-signed` | `{ countryA, countryB }` | NAP established |
| `diplomacy:alliance-formed` | `{ countryA, countryB }` | Alliance established |
| `diplomacy:relation-changed` | `{ countryA, countryB, oldStatus, newStatus }` | Any relation status change (UI/AI hook) |

## Events Consumed

None. All diplomacy actions are invoked directly via the mechanic's methods (from `main.ts` or the AI mechanic via `ai:decision-made`).

## State Slice

```typescript
interface DiplomacyState {
  relations: Record<string, DiplomaticRelation>  // key: "smallerId:largerId"
  currentTurn: number                            // increments every framesPerTurn frames
  framesPerTurn: number                          // default 100
}

interface DiplomaticRelation {
  countryA: CountryId          // lexicographically first
  countryB: CountryId          // lexicographically second
  status: DiplomaticStatus
  truceExpiresAtTurn: number | null  // set only when status === 'truce'
}
```

Only pairs with a non-neutral relation are stored. `getRelation` returns `null` for neutral pairs.

## Design Notes

- **Canonical key ordering**: relation keys are always `"smallerId:largerId"` (lexicographic). This makes lookup O(1) and argument-order-independent.
- **Truce blocks ally call-ins**: if an ally has an active truce with the war target, they are not dragged into the war.
- **Allied countries cannot declare war on each other**: `declareWar` emits `war-rejected` with reason `'allied'`.
- **Peace is mutual and cascading**: when A and B make peace, all of A's allies at war with B (and B's allies at war with A) are simultaneously forced into the same truce.
- **Truce duration is 5 turns** (`TRUCE_DURATION_TURNS = 5`). One turn = `framesPerTurn` frames (default 100, ≈ 5 s at 20 Hz).
- **`canAttack` is the war gate**: any mechanic that initiates military aggression must call `canAttack(attackerId, targetId)` and abort if it returns `false`.
- **No cross-mechanic imports**: diplomacy does not import from military, map, or any other mechanic. Integration is done via events and direct method calls in `main.ts`.
