# Diplomacy

## Purpose

Manages all diplomatic relations between countries: wars, truces, truce requests, non-aggression pacts, and alliances. Acts as the gating layer for military aggression — a country may only attack another when the two are at war. Truce requests give AI (and future player) belligerents a negotiated path to peace rather than an instant cease-fire.

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
| `requestTruce(requesterId, targetId)` | Submit a truce request; blocked unless at war. No-op if a request is already pending for this pair. Emits `diplomacy:truce-requested`. |
| `respondToTruceRequest(requesterId, targetId, accept)` | Resolve a pending request. If `accept` is `true`, calls `makePeace` and emits `diplomacy:truce-accepted`. If `false`, emits `diplomacy:truce-rejected`. No-op if no pending request exists. |
| `getRelation(countryA, countryB)` | Returns the `DiplomaticRelation` or `null` if no explicit relation exists (implies neutral). |
| `update(ctx)` | Advances the turn counter, expires elapsed truces, and expires unanswered truce requests after `TRUCE_REQUEST_EXPIRY_TURNS` turns. Must be registered with the game loop. |
| `destroy()` | Cleans up any internal subscriptions (currently none). |

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `diplomacy:war-declared` | `{ declarerId, targetId }` | War successfully declared |
| `diplomacy:war-rejected` | `{ declarerId, targetId, reason }` | War blocked (`'truce-active'` \| `'already-at-war'` \| `'allied'`) |
| `diplomacy:peace-made` | `{ countryA, countryB }` | Peace agreed, truce begins |
| `diplomacy:truce-expired` | `{ countryA, countryB }` | Truce duration elapsed, relation returns to neutral |
| `diplomacy:truce-requested` | `{ requesterId, targetId }` | A belligerent submitted a truce request |
| `diplomacy:truce-accepted` | `{ requesterId, targetId }` | The target accepted; `peace-made` fires immediately after |
| `diplomacy:truce-rejected` | `{ requesterId, targetId }` | The target rejected, or the request expired unanswered |
| `diplomacy:ally-called-to-war` | `{ allyId, calledById, warTargetId }` | An ally was automatically pulled into a war |
| `diplomacy:ally-forced-peace` | `{ allyId, peaceCountryId, enemyId }` | An ally was forced to peace because their partner made peace |
| `diplomacy:non-aggression-pact-signed` | `{ countryA, countryB }` | NAP established |
| `diplomacy:alliance-formed` | `{ countryA, countryB }` | Alliance established |
| `diplomacy:relation-changed` | `{ countryA, countryB, oldStatus, newStatus }` | Any relation status change (UI/AI hook) |

## Events Consumed

None. All diplomacy actions are invoked directly via the mechanic's methods (from `main.ts`). `main.ts` bridges AI decisions to diplomacy calls.

## State Slice

```typescript
interface DiplomacyState {
  relations: Record<string, DiplomaticRelation>            // key: "smallerId:largerId"
  pendingTruceRequests: Record<string, PendingTruceRequest> // key: "smallerId:largerId"
  currentTurn: number                                      // increments every framesPerTurn frames
  framesPerTurn: number                                    // default 100
}

interface DiplomaticRelation {
  countryA: CountryId          // lexicographically first
  countryB: CountryId          // lexicographically second
  status: DiplomaticStatus
  truceExpiresAtTurn: number | null  // set only when status === 'truce'
}

interface PendingTruceRequest {
  requesterId: CountryId   // who asked for the truce
  targetId: CountryId      // who must respond
  requestedAtTurn: number  // expires after TRUCE_REQUEST_EXPIRY_TURNS (3) turns
}
```

Only pairs with a non-neutral relation are stored. `getRelation` returns `null` for neutral pairs. At most one pending truce request exists per belligerent pair.

## Design Notes

- **Canonical key ordering**: relation keys are always `"smallerId:largerId"` (lexicographic). This makes lookup O(1) and argument-order-independent. Pending truce request keys use the same scheme.
- **Truce blocks ally call-ins**: if an ally has an active truce with the war target, they are not dragged into the war.
- **Allied countries cannot declare war on each other**: `declareWar` emits `war-rejected` with reason `'allied'`.
- **Peace is mutual and cascading**: when A and B make peace, all of A's allies at war with B (and B's allies at war with A) are simultaneously forced into the same truce.
- **Truce duration is 5 turns** (`TRUCE_DURATION_TURNS = 5`). One turn = `framesPerTurn` frames (default 100, ≈ 5 s at 20 Hz).
- **Truce request expiry is 3 turns** (`TRUCE_REQUEST_EXPIRY_TURNS = 3`). Unanswered requests are silently removed and emit `diplomacy:truce-rejected`.
- **One pending request per pair**: `requestTruce` is a no-op if a request already exists for that pair (regardless of direction).
- **`canAttack` is the war gate**: any mechanic that initiates military aggression must call `canAttack(attackerId, targetId)` and abort if it returns `false`.
- **AI response is immediate**: `main.ts` listens to `diplomacy:truce-requested` and, if the target is an AI country, calls `aiMechanic.evaluateTruceResponse()` synchronously before calling `respondToTruceRequest()`. Player-targeted requests remain pending until the player acts via UI.
- **No cross-mechanic imports**: diplomacy does not import from military, map, or any other mechanic. Integration is done via events and direct method calls in `main.ts`.
