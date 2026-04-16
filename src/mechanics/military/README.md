# Military

## Purpose

Manages armies. Exposes a function to request army construction via the construction mechanic, and listens for completion events to create armies in state.

## Public API

| Export | Description |
|--------|-------------|
| `buildMilitaryState()` | Returns the initial `MilitaryState` `{ armies: {} }` |
| `requestBuildArmy(eventBus, stateStore, ownerId, locationId, config?)` | Checks the owner's gold; deducts the army cost and emits `construction:request` if affordable, otherwise emits `military:army-build-rejected` |
| `initMilitaryMechanic(eventBus, stateStore, config?)` | Subscribes to `construction:complete` and `map:province-conquered`, returns `{ destroy }` |
| `Army` | Re-exported from contracts |
| `ArmyId` | Re-exported from contracts |
| `MilitaryState` | Re-exported from contracts |

## Events Emitted

| Event name | Payload type | When it fires |
|------------|-------------|---------------|
| `economy:gold-deducted` | `{ countryId, amount, reason: 'army-recruitment' }` | When `requestBuildArmy` is called and the owner has sufficient gold |
| `construction:request` | `{ jobId, ownerId, locationId, buildableType: 'army', durationFrames, metadata: {} }` | Immediately after gold is deducted in `requestBuildArmy` |
| `military:army-build-rejected` | `{ ownerId, locationId, reason: 'insufficient-gold' }` | When `requestBuildArmy` is called but the owner cannot afford the cost |
| `military:army-raised` | `{ armyId, countryId, provinceId }` | When an army's construction job completes |
| `military:army-destroyed` | `{ armyId, countryId, provinceId }` | When a province is conquered and the defender's army is removed, or when an army's strength drops to 0 from casualties |

## Events Consumed

| Event name | Payload type | What the mechanic does with it |
|------------|-------------|-------------------------------|
| `construction:complete` | `{ buildableType, ownerId, locationId, completedFrame, ... }` | If `buildableType === 'army'`: creates an `Army` in state and emits `military:army-raised` |
| `map:province-conquered` | `{ provinceId, newOwnerId, oldOwnerId, ... }` | Destroys all armies belonging to `oldOwnerId` stationed in `provinceId`; emits `military:army-destroyed` for each |
| `military:casualties-taken` | `{ casualties: [{ armyId, strengthLost }] }` | Reduces each listed army's strength by `strengthLost`; armies reduced to ≤ 0 are deleted and `military:army-destroyed` is emitted for each |

## State Slice

`military: MilitaryState`

```typescript
interface MilitaryState {
  readonly armies: Readonly<Record<ArmyId, Army>>
}

interface Army {
  readonly id: ArmyId
  readonly countryId: CountryId
  readonly provinceId: ProvinceId
  readonly strength: number       // base 100; +25 if a barracks is present in the province
  readonly createdFrame: number
}
```

## Design Notes

- **Army recruitment costs gold** (default 50, configurable via `MilitaryConfig.army.cost`). Gold is checked and deducted upfront at request time by emitting `economy:gold-deducted`. The economy mechanic reduces the country's treasury in response. If the owner cannot afford the cost, `military:army-build-rejected` is emitted and no construction job is created.
- Army construction is delegated entirely to the construction mechanic. The military mechanic only handles the "what happens when it finishes" side.
- **Barracks grant a flat strength bonus** (`barracksStrengthBonus`, default +25) to any army raised in that province. The bonus applies once regardless of how many barracks are present. The check reads directly from the buildings state slice at completion time.
- No update function is needed — the mechanic is purely event-driven.
- `requestBuildArmy` is a standalone exported function (not a closure) so it can be called directly from UI or AI code without importing internal mechanic state.
- Army destruction on conquest is purely positional: any army belonging to the old owner in the exact conquered province is removed. Armies in adjacent provinces are unaffected.
- Multiple armies stacked in the same province are all destroyed together.
- **Casualties:** After every battle the map mechanic emits `military:casualties-taken`. The military mechanic processes each entry: armies that survive retain their reduced strength; armies reduced to 0 are deleted and `military:army-destroyed` fires. Casualty rates are computed by the map mechanic based on battle intensity (how close the fight was). Winner armies lose 12–27%, loser armies lose 28–48% of their strength per battle.

## Roadmap

> **Design note — Supply as a future mechanic.** Items #1 and #2 below are written as extensions of the military mechanic, but the supply system may eventually be extracted into its own top-level mechanic (`src/mechanics/supply/`). When that split happens, military will emit the "army needs supply" signal and the supply mechanic will own the connectivity walk, depot state, and attrition bookkeeping. Similarly, these items currently treat supply as a binary connected/disconnected flag; a future iteration may introduce **specific goods** (grain, iron, fodder, etc.) that armies consume and depots stockpile — not committed, but leave the door open when naming fields and events.

### 1. Supply lines & attrition (military ↔ map)

Armies projected away from a contiguous chain of owned provinces should bleed strength over time, modeling stretched logistics.

- Every `supplyCheckIntervalFrames`, military runs a per-army connectivity check: walk same-owner adjacent provinces from the army's current province and see if any owned-from-game-start "core" province is reachable. Reads adjacency and ownership from the shared map slice (no import).
- First tick an army is unsupplied: emit `military:army-supply-cut`. Each subsequent tick: emit `military:army-attrition { armyId, strengthLost }` and reduce strength. Reaching 0 destroys the army through the existing casualty pipeline.
- On reconnection: emit `military:army-supply-restored`. Armies recover strength at `supplyRecoveryRate` (a fraction of attrition losses) per frame, capped at original raised strength.
- Composes with naval invasion (navy roadmap) — landed armies are "supplied" if their landing province connects to an owned chain or stays adjacent to a friendly fleet.
- New config: `attritionPerFrameUnsupplied` (0.1), `supplyRecoveryRate`, `supplyCheckIntervalFrames` (30).
- Contract additions: three new event keys (`army-supply-cut`, `army-supply-restored`, `army-attrition`).

### 2. Supply depots & forward bases (military ↔ buildings, economy)

Extend the supply chain beyond "own-province reachability" — let players pre-position logistics. A depot in a frontier province counts as a virtual core for supply checks within a radius.

- New building type `supply-depot` (gold cost, construction-time same pipeline). Buildings mechanic already handles construction; military reads the buildings slice to enumerate depots.
- Supply check walks up to `depotSupplyRadius` provinces from any depot owned by the army's country, in addition to native cores.
- Depots consume gold per turn (`depotUpkeepPerFrame`). Emit `economy:gold-deducted { reason: 'depot-upkeep' }`.
- Enemy conquest of a depot province destroys it and emits `military:depot-lost { provinceId, ownerId }`. Sudden loss can cascade-cut supply for multiple armies in one tick.
- If supply is promoted to its own mechanic (see roadmap design note), depot state moves with it. If specific goods are later introduced, depots become the natural stockpile object — keep payload field naming generic enough to extend (`depotContents` reserved for future use).
- New events: `military:depot-lost`, `military:depot-established` (fires when buildings reports a depot finished).
- New config: `depotSupplyRadius` (2), `depotUpkeepPerFrame`.

### 3. Army fatigue & march speed (military ↔ map)

Armies shouldn't teleport for free. Add an invisible fatigue meter that rises with repeated movement/combat and falls while stationary.

- Per-army `fatigue: 0–100`. Each movement or battle adds configured amounts. Stationary army decays toward 0 at `fatigueRecoveryPerFrame`.
- Combat resolution reads attacker and defender fatigue; >60 applies a combat multiplier penalty (`fatigueCombatPenalty`).
- Emit `military:army-exhausted { armyId }` at threshold; `military:army-rested { armyId }` on recovery.
- New config: `fatigueGainPerMove`, `fatigueGainPerBattle`, `fatigueRecoveryPerFrame`, `fatigueCombatPenalty`, `fatigueExhaustionThreshold`.
- Contract additions: two new event keys; `Army` gains `fatigue` field.

### 4. Demobilization waves (military ↔ population, economy)

Let players (and AI) disband armies in peacetime to recover population instead of paying upkeep indefinitely.

- New action: `disbandArmy(armyId)` — emits `military:army-disbanded { armyId, countryId, provinceId, strengthReturned }`. Population mechanic adds a fraction back as pop; economy refunds a fraction of construction cost.
- AI ISOLATE action unlocks disbanding of overbudget armies.
- Disbanding during wartime triggers a `personality:desertion-stain` ledger entry (nations remember their leaders caving).
- New events: `military:army-disbanded`, `personality:desertion-stain` (consumed by personality).
- New config: `disbandPopReturnFraction`, `disbandGoldRefundFraction`.

### 5. Military Academy building (military ↔ buildings)

A province-level building that improves armies raised in it.

- New building type `military-academy`. Buildings mechanic already handles construction/cost.
- Any army raised in a province with a military academy gets `+academyStrengthBonus` (default +20) on top of the barracks bonus. Stackable with barracks.
- Optional: armies garrisoned in a province with an academy slowly recover strength at `academyHealPerFrame` (passive training).
- New config: `academyStrengthBonus`, `academyHealPerFrame`.
- Contract additions: new building type key; no new event keys required.

### 6. Army XP & tiers (military)

Armies themselves accumulate experience rather than tracking an abstract pool.

- Per-army `xp: number` (starts at 0). Each survived battle adds `xpPerBattle` (scaled by battle intensity). XP thresholds unlock tiers: Green → Seasoned → Veteran → Elite.
- Each tier grants a multiplicative combat bonus (`tierCombatMultiplier[tier]`, e.g. `[1.0, 1.1, 1.25, 1.45]`).
- XP decays slowly during peacetime garrisoning (`xpDecayPerFrame`) — use it or lose it.
- Emit `military:army-tier-up { armyId, newTier }` on threshold crossings.
- New events: `military:army-tier-up`.
- New config: `xpPerBattle`, `tierThresholds`, `tierCombatMultiplier`, `xpDecayPerFrame`.
- Contract additions: `Army` gains `xp: number` and `tier: ArmyTier` fields; new `ArmyTier` enum.

### 7. Unit tiers: militia / regular / elite (military ↔ economy, population)

At recruitment time, choose a quality tier. Each has different costs, recruit times, and strengths.

- `requestBuildArmy(..., tier: 'militia' | 'regular' | 'elite')`. Default stays `regular` for backward compat.
- Militia: cheap, fast, weak, drawn from local pop hit (no gold refund on disband).
- Regular: current behavior — moderate gold, moderate strength.
- Elite: high gold + requires a Military Academy in the province + slow recruit time, but high base strength.
- Emit `military:army-raised` with the tier in payload.
- New config: per-tier `cost`, `durationFrames`, `baseStrength`.
- Contract additions: `Army` gains `unitTier: UnitTier` field; new `UnitTier` union. (Note: distinct from the XP-based `tier` field in item #6 — name one of them differently when both land.)

### 8. Cavalry vs infantry composition (military ↔ map)

Introduce a second army dimension — the mix of cavalry and infantry — that interacts with terrain. Composes with unit tiers (#7): a militia, regular, or elite can each be infantry-heavy or cavalry-heavy.

- `Army` gains `cavalryRatio: 0–1` (set at recruit time, default 0.2).
- `requestBuildArmy` signature extends to accept `cavalryRatio` alongside `unitTier`. Final cost = `unitTier.cost × (1 + cavalryRatio × (cavalryCostMultiplier − 1))` so the two axes multiply cleanly.
- Combat multiplier depends on terrain × cavalry ratio:
  - Plains: `1.0 + cavalryRatio × 0.4` (cavalry favored).
  - Hills/Forest: `1.0 − cavalryRatio × 0.3` (cavalry hindered).
  - Mountains: `1.0 − cavalryRatio × 0.5`.
- New `stable` building gates cavalry recruitment above 0.5 ratio, independent of the Military Academy gate for elite tier — a province can have either, both, or neither.
- Militia tier caps `cavalryRatio` at 0.2 (conscripts can't field real cavalry); elite tier uncaps up to 1.0.
- New events: none required (ratio is a static army property).
- New config: `cavalryCostMultiplier`, `cavalryTerrainMultipliers`, per-tier `maxCavalryRatio`.
- Contract additions: `Army` gains `cavalryRatio` field; new `stable` building type.

### Implementation order (suggested)

1. **Supply lines** — the connectivity check is the only complex piece; everything else reuses the existing army strength pipeline.
- Movement and army merging are out of scope for this implementation.
