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

### 9. Country-wide doctrine tier (military)

Instead of per-army tech leaks, each country picks a single active "doctrine" that biases all their armies — a commitment choice, not a research one.

- New state: `MilitaryState.doctrine: Record<CountryId, Doctrine | null>`.
- Doctrines (pick one at a time, switchable with a cooldown):
  - **Shock Doctrine**: +15% combat strength in attack, −10% in defense.
  - **Defensive Doctrine**: +20% combat strength in defense, −5% in attack.
  - **Attrition Doctrine**: armies recover strength 2× faster in own territory, −10% combat strength.
  - **Mobile Doctrine**: +0.2 effective cavalry ratio regardless of actual mix, +10% fatigue gain.
- Switching emits `military:doctrine-changed { countryId, oldDoctrine, newDoctrine }`. Cooldown prevents thrashing.
- AI personality biases the default choice (expansionist → Shock, isolationist → Defensive, mercantile → Attrition, zealot → Shock).
- New events: `military:doctrine-changed`.
- New config: `doctrineCooldownFrames`, per-doctrine modifier tables.
- Contract additions: one new event key; `Doctrine` union.

### 10. Rebels as a first-class faction (military ↔ map, population, diplomacy)

Introduce rebel forces as non-state armies that can occupy, fight, and be negotiated with. Opens up civil-war scenarios, uprisings in newly-conquered provinces, and post-defeat holdouts.

- **TODO — flesh out**: what spawns rebels (low-happiness provinces, mutinies, disbanded armies refusing to go home, cultural-mismatch revolts, etc.)? Do they have a "country" ID or a special reserved one? Do they share borders/capture provinces like a nation, or only contest them? Can they be bribed / co-opted via diplomacy? How are they rendered on the map (color? icon?)? Do they use the same combat pipeline as national armies?
- Likely contract additions: a reserved `CountryId` for rebels, or a parallel `RebelFaction` entity with its own slice.
- Likely new events: `military:rebels-spawned`, `military:rebels-defeated`, `map:province-rebel-occupied`.
- Design constraint: must not break the existing `activeWars` pair-keyed set in map — rebels need a simpler "everyone at war with them" rule, or they participate via a special marker.

### 11. Dissatisfaction with standing armies in peacetime (military ↔ economy, personality, population)

A country that keeps a large army around with no active war should pay some political/economic cost. Standing force ≠ free force.

- **TODO — flesh out**: what does the cost look like? Options:
  - Rising unrest in provinces hosting idle armies (population mechanic).
  - A per-army "unused" ledger entry from the hosting province toward the country's leadership (personality).
  - Escalating upkeep over time (economy) — the longer an army sits idle, the more expensive it gets.
  - A combination of the above.
- What counts as "peacetime"? No active wars at all, or no active wars involving this specific country?
- Does the penalty differ by unit tier (#7) — are elite armies more expensive to keep idle than militia, or less?
- How does this interact with a country that mothballs armies on purpose for defense? Does a Defensive Doctrine (#9) reduce the penalty?
- Likely new events: `military:army-idle`, `military:idle-cost-applied`.
- Likely new config: `peacetimeIdleThresholdFrames`, `peacetimeCostPerFrame`.

### 12. Mountain entrenchment (military ↔ map)

Let defenders invest time in a terrain-specific defense bonus.

- Per-army `entrenchment: 0–100`. Rises at `entrenchPerFrame` while stationary in a mountain or hills province (also forests, half rate). Resets to 0 on move.
- Combat defense multiplier = `1 + entrenchment / 100 × terrainEntrenchMax[terrain]` (mountains max 0.8, hills 0.5, forest 0.3).
- Attackers drain defender entrenchment each battle (`entrenchDrainPerBattle`, default 30).
- Emit `military:army-entrenched { armyId, level }` at 25/50/75/100 thresholds.
- New events: `military:army-entrenched`.
- New config: `entrenchPerFrame`, `terrainEntrenchMax`, `entrenchDrainPerBattle`.
- Contract additions: `Army` gains `entrenchment` field.

### 13. Unit types: infantry / cavalry / siege (military ↔ buildings, map)

Generalize the cavalry idea from #8 into a full three-way composition, tracked as actual soldier counts rather than ratios.

- Replace `Army.strength: number` + `Army.cavalryRatio: number` (#8) with `Army.composition: { infantry: number, cavalry: number, siege: number }`. The total `strength` is a derived sum.
- Recruit-time cost = per-type cost summed: `infantry × infantryCost + cavalry × cavalryCost + siege × siegeCost`. Siege is the most expensive, cavalry ≈ 1.5× infantry.
- Combat role per type:
  - **Infantry**: baseline. No terrain modifiers, no special properties.
  - **Cavalry**: terrain-sensitive (plains good, mountains/forest bad), drives pursuit damage (#19 if adopted).
  - **Siege**: near-useless in open combat (multiplier 0.5 on that type's contribution), but halves siege duration against fortified provinces and reduces fortification defense multiplier by 1 tier.
- Building gates:
  - `stable` unlocks cavalry recruitment (from #8).
  - `siege-workshop` (new) unlocks siege recruitment.
- Battle losses are applied proportionally across all three types — if an army takes 40% casualties, each count drops ~40%. Exact distribution rule (flat % vs weighted toward the front-line type) is a **TODO**.
- Replenishment (via barracks/academy/supply) buys back counts of each type at the current per-type cost.
- New config: per-type `cost`, `openCombatMultiplier`, `terrainModifiers` table, `siegeDurationMultiplier`, `siegeFortDebuff`.
- Contract additions: `Army.composition: UnitComposition` (replaces `strength` and `cavalryRatio` from #8); new `siege-workshop` building type.

Note: if #13 lands, integrate with #8 — the `cavalryRatio` field is superseded by explicit cavalry counts. Existing barracks/military-academy strength bonuses are applied at raise time to the composition (e.g. +25 distributed proportionally, or only to infantry — **TODO** decide).

### 14. Rivers, fords, & bridges (military ↔ map)

Rivers as tactical obstacles — but exactly how they work needs design work before implementation.

> **Refinement needed before implementing.** The core idea is solid but the crossing model is unsettled. Key open question: are rivers **crossable anywhere with a penalty** (simple, always possible, just expensive) or **impassable unless a natural ford or bridge is present** (harder, creates real chokepoints and strategic map geometry)? The second option makes rivers far more meaningful but requires per-edge data for fords AND bridges plus pathing rules for how an army actually navigates them. It also raises edge cases: what if a river has no ford or bridge anywhere (island-like pocket)? Can boats substitute once navy is in play? Is a bridge a per-edge building or a per-province building that applies to all river edges of the province?

- Rough sketch (subject to refinement above):
  - Map data grows a per-edge `isRiver: boolean` and optionally `hasFord: boolean`.
  - New `bridge` building type built at an edge. A bridge on either side of a river edge allows crossing.
  - In the "crossable-with-penalty" model: attacking across an unforded/unbridged river applies `riverCrossingMultiplier` (default 0.7×) to the attacker.
  - In the "impassable" model: armies simply cannot move across a river edge without a ford or bridge; attacks are refused with a clearer rejection event.
  - Scorched earth: an owner withdrawing can spend gold to destroy their own bridge. Emit `map:bridge-destroyed`.
- New events: `map:bridge-built`, `map:bridge-destroyed`, possibly `military:river-crossing-blocked` in the impassable model.
- New config: `riverCrossingMultiplier` (penalty model) OR nothing movement-wise in the impassable model, `bridgeCost`, `bridgeDemolitionCost`.
- Contract additions: per-edge river/ford data in map state; new `bridge` building type.

### 15. Named battles & turning points (military ↔ personality, events-system)

Give large, decisive engagements a name and a historical record — inspired by Dwarf Fortress's approach to artifact histories where items carry the date, name, and backstory of their creation.

- After each battle, if `combinedStrength > namedBattleThreshold` AND `winMargin > 0.3`, generate a named battle record. Naming is deterministic: "Battle of <provinceName>" with a suffix for repeats ("Second Battle of Stormfell"). Emit `military:named-battle { battleId, name, winnerId, loserId, provinceId, frame, details }`.
- The `details` payload captures the story: attacker/defender country names, army sizes, terrain, doctrine (#9), unit composition (#13), which side was entrenched (#12), whether cavalry was decisive, and the final strength delta. Enough data for a rich narrative tooltip or log entry.
- Store a persistent list of named battles in state (`MilitaryState.notableBattles`), not a ring buffer — history doesn't forget. Optional config to archive old entries to a separate store if the list grows too large.
- Personality ledger entries reference named battles in their metadata — a `-40 aggression` entry becomes "remembered for the Battle of Stormfell" in UI tooltips.
- Combat log panel prefers the named-battle text over the generic description.
- Future extension: named battles could be referenced by war monuments (#28 if adopted), AI decision-making (avoid attacking provinces where you lost a named battle recently), and diplomacy (leverage in peace negotiations — "we won the Battle of X").
- New events: `military:named-battle`.
- New config: `namedBattleThreshold`, `namedBattleMarginThreshold`.
- Contract additions: one new event key; `MilitaryState.notableBattles: readonly NamedBattle[]`; `NamedBattle` interface with full detail fields.

### 16. AI strategic focus (military ↔ ai)

Give AI nations a single priority enemy per decision cycle so attacks concentrate on one front instead of scattering randomly.

- Each AI decision cycle, compute a `priorityTargetId` from the existing EXPAND scoring pass: pick the enemy with the highest combined score of threat (province count, army strength near border) and opportunity (weak defenses, terrain advantage, personality bias).
- All EXPAND actions that cycle target only the priority enemy's provinces. Multiple EXPAND decisions in one batch (#137 in ai design notes) hit different provinces of the same enemy rather than splitting across two wars.
- Store as `AICountryState.priorityTargetId: CountryId | null` — recalculated fresh each cycle, no persistent state to maintain.
- Personality shapes focus: expansionist nations prioritize weak neighbors (opportunity), cautious nations prioritize the biggest threat, zealots prioritize cultural mismatches.
- New events: `ai:focus-changed { countryId, newTargetId, oldTargetId }` (debug/UI signal only).
- New config: `focusStickinessBonus` (small additive score to keep the same target across cycles, preventing thrashing).
- Contract additions: `AICountryState` gains `priorityTargetId` field; one new event key.

> **Future AI refinement.** This is a first step toward smarter AI — the scoring is still one-dimensional (pick one enemy). Later iterations should consider multi-front coordination (hold one front defensively while pushing another), army positioning awareness (prefer targets where you have troops nearby), alliance coordination (focus on the same enemy your ally is fighting), and long-term strategic planning (weaken a rival's economy before attacking). Each of these is a separate roadmap item when the base focus system is proven.

### 17. Martial legacy (military ↔ personality, ai)

Countries accumulate a living military history — not as a stat modifier, but as a narrative record that shapes how the world sees them and how AI nations reason about them.

- Per-country `martialLegacy: MartialLegacy` — a structured record, not a single number. Tracks: total wars fought, wars won/lost, named battles (#15) participated in (with outcomes), longest streak of victories, most devastating defeat, rivals (countries fought more than once).
- This is **worldbuilding data, not a combat modifier**. It does not directly affect recruitment cost, army strength, or morale. It is a read-only historical record that other systems consume for narrative and decision-making.
- **AI consumption (future):** AI decision scoring reads the legacy record to:
  - Hold grudges: countries that have lost named battles against a rival weight EXPAND toward that rival higher (revenge motive).
  - Fear proven conquerors: countries with long victory streaks are avoided as EXPAND targets by cautious/mercantile archetypes.
  - Respect martial peers: hegemon archetypes prefer ALLY with countries that have a strong war record.
  - Avoid repeating mistakes: a country that lost badly in mountain provinces should deprioritize mountain targets.
- **Personality integration:** The legacy record feeds into personality ledger entries naturally — "lost the Battle of Stormfell" becomes a persistent grudge entry, not a temporary one.
- Legacy is append-only during the game. No decay — history doesn't forget.
- New events: `military:legacy-updated { countryId, entryType, details }` (fires after each war concludes or named battle occurs).
- Contract additions: `MilitaryState` gains `martialLegacy: Record<CountryId, MartialLegacy>`; `MartialLegacy` interface.

> **Not a modifier.** Resist the temptation to turn this into "+X% combat strength for high legacy." The value is in AI reasoning and narrative richness, not numerical bonuses. If bonuses are ever added, they should be a separate roadmap item with explicit justification.

### 18. War monuments & victory parades (military ↔ buildings, personality)

After winning a war, the victor can build a monument in the province where a named battle (#15) occurred — a permanent visible marker on the map and a thorn in the loser's side.

- New building type `war-monument` — can only be built in a province where a named battle happened and the builder won. Costs gold, no construction time (instant, ceremonial).
- Monuments are purely narrative/UI: they appear on the map, show the battle's story on hover (pulling from the named battle's detail payload), and feed into the martial legacy record (#17).
- Personality: all nations that *lost* that battle write a `−15 grievance` ledger entry when the monument is built (salt in the wound). Zealot archetypes feel this as `−25`.
- Multiple monuments in the same province stack visually — a province that saw three decisive victories becomes a memorial ground.
- Composes with culture mechanic: monuments in foreign-culture provinces slow assimilation (the locals resent the trophy) — or accelerate it (the victors impose their narrative). **TODO** decide which.
- New events: `military:monument-erected { provinceId, battleId, countryId }`.
- New config: `monumentCost`.
- Contract additions: one new event key; new `war-monument` building type.

### 19. War weariness (military ↔ ai, diplomacy)

A country-level exhaustion meter that rises the longer a war drags on. For now, its only mechanical effect is boosting the AI's desire for peace.

- Per-country `warWeariness: number` (starts 0). Rises each frame a country is at war. Accelerates with: army losses, named battle defeats (#15), multiple simultaneous wars.
- Resets to 0 on peace. Drops slowly if only one war remains (consolidation relief).
- **Current scope:** War weariness is fed into the AI's SEEK_PEACE scoring as an additive bonus: `weariness / 100 × wearinessPeaceWeight`. High weariness makes even aggressive archetypes willing to negotiate. This is the only gameplay effect for now.
- Emit `military:war-weariness-changed { countryId, newWeariness }` each time the value crosses a 25-point threshold (for UI/debug).
- Diplomacy composes: enemies can read your approximate weariness and hold out for better terms.
- New events: `military:war-weariness-changed`.
- New config: `wearinessGainPerFrame`, `wearinessAcceleratorPerLoss`, `wearinessPeaceWeight`.
- Contract additions: `MilitaryState` gains `warWeariness: Record<CountryId, number>`; one new event key.

> **Future expansion.** War weariness is intentionally scoped to AI peace desire only. Later iterations could add: recruitment cost increases at high weariness, desertion cascades, population unrest, and player-facing UI pressure. Each would be a separate roadmap item.

### 20. Logistical overstretch / command fragmentation (military ↔ map)

The more armies a country fields, the less effective each one becomes — diminishing returns on raw military mass.

- When a country has more than `overstretchThreshold` (default 5) armies, each army beyond the threshold suffers a combat penalty: `−overstretchPenaltyPerArmy × excessCount`.
- Represents stretched command structure, divided attention, supply competition.
- Penalty is global to all that country's armies, not just the excess ones.
- Emit `military:command-overstretched { countryId, armyCount, penaltyApplied }` when threshold is crossed.
- Composes with doctrine (#9): Mobile Doctrine raises the threshold by 2.
- New events: `military:command-overstretched`, `military:command-restored`.
- New config: `overstretchThreshold`, `overstretchPenaltyPerArmy`, `overstretchPenaltyCap`.

> **Revisit post-implementation.** This is a deliberately simple first pass. Future iterations should consider: per-front overstretch (5 armies on one front is worse than 5 spread across three), supply-line interaction (#1 — unsupplied armies count double toward overstretch), technology reducing the threshold (better comms tech = more armies manageable), and personality-driven tolerance (expansionist archetypes handle more armies before penalty kicks in). Keep this note after implementation as a reminder.

### 21. Religious schism desertion (military ↔ culture, population)

If a nation conquers enough foreign-culture provinces, its armies stationed in those provinces risk losing troops to religious/cultural defection.

- Per-army tick: if stationed in a province whose culture differs from the army's owner AND the owner holds more foreign-culture provinces than own-culture provinces, roll `schismDesertionChance`.
- On desertion: strength loss + emit `military:schism-desertion { armyId, provinceId, strengthLost }`. Personality writes a `religious-grievance` entry.
- Composes with culture assimilation — once the province converts, the risk disappears.
- New events: `military:schism-desertion`.
- New config: `schismDesertionChance`, `schismStrengthLoss`, `schismForeignProvinceRatioThreshold`.

### 22. Wall-derived fortress garrisons (military ↔ buildings, map)

Provinces with walls automatically generate a small defensive garrison — not a full army, but a speed bump that attackers must overcome before conquering.

- Any province with a `walls` building gets a `garrison: number` (derived from fortification level if map roadmap #1 lands, else flat `garrisonStrength` default 30).
- Garrisons are NOT armies — they don't appear in `MilitaryState.armies`, can't move, can't attack. They only add to the province's defense during combat resolution.
- Garrisons regenerate to full between attacks at `garrisonRegenPerFrame`.
- If the province is conquered, the garrison is destroyed. It rebuilds when/if the province is recaptured and still has walls.
- New events: `military:garrison-destroyed { provinceId }`, `military:garrison-restored { provinceId }`.
- New config: `garrisonStrength`, `garrisonRegenPerFrame`, per-fortification-level garrison values.
- Contract additions: two new event keys; province-level garrison data (could live in map or military slice — **TODO** decide).

### 23. Population-drafted garrison levies (military ↔ population)

Let provinces raise cheap, weak militia garrisons from their local population — distinct from recruited armies. The bigger the province's population, the larger the levy.

- New action: `raiseLevy(provinceId)` — creates a garrison-like force sized by `population × levyRatio` (default 0.05). Costs no gold but directly reduces province population.
- Levies are immobile (like garrisons in #22) and fight at `levyCombatEfficiency` (default 0.5× strength).
- Levies dissolve after `levyDurationFrames` — the farmers go home. Emit `military:levy-disbanded { provinceId, popReturned }` and population is partially restored.
- **Dead levies are dead people.** Only surviving levy strength is returned to population on disbandment. If the levy is destroyed in combat, that population is permanently lost — no resurrection. Track `initialStrength` vs `currentStrength` at disbandment time; `popReturned = levyPopReturnFraction × (currentStrength / initialStrength) × originalPopTaken`.
- Cannot stack with a full garrison (#22) — levies are the "no walls" fallback defense.
- New events: `military:levy-raised { provinceId, strength }`, `military:levy-disbanded`.
- New config: `levyRatio`, `levyCombatEfficiency`, `levyDurationFrames`, `levyPopReturnFraction`.
- Contract additions: two new event keys.

### 24. Spies & sabotage (military ↔ economy, buildings)

Introduce a basic espionage action: spend gold to send a spy to an enemy province. Success sabotages a building or drains gold.

- New action: `sendSpy(countryId, targetProvinceId)` — costs `spyCost` gold, takes `spyTravelFrames` to arrive. On arrival, roll `spySuccessChance`.
- Success: pick a random building in the target province and disable it for `sabotageDisableDuration` frames. Emit `military:spy-sabotage { targetProvinceId, buildingId, spyOwnerId }`. Or drain `spyGoldStolen` from the target's treasury.
- Failure: spy is caught. Emit `military:spy-caught { spyOwnerId, targetCountryId }`. Personality writes a `−20 espionage` grievance ledger entry.
- AI uses this opportunistically — zealot/expansionist archetypes spy on war targets before attacking.
- Scouting/intelligence gathering (revealing enemy army positions, early warning) should also live under this spy system rather than being tied to cavalry or other unit types.
- New events: `military:spy-sabotage`, `military:spy-caught`, `military:spy-deployed`.
- New config: `spyCost`, `spyTravelFrames`, `spySuccessChance`, `sabotageDisableDuration`, `spyGoldStolen`.
- Contract additions: three new event keys.

### 25. Pillaging conquered provinces (military ↔ economy, map, personality)

When a province is conquered, the victor can choose to pillage it — extracting immediate gold at the cost of wrecking the province's economy.

- On `map:province-conquered`, the conqueror may emit `military:pillage { provinceId, countryId }`. Immediate gold payout (`pillageGoldAmount`), but the province gets a long-duration economy modifier (`pillage-devastation`: −50% income for `devastationDurationFrames`).
- Pillaged provinces also lose population (`pillagePopLoss`).
- Personality: every nation writes a `−25 brutality` ledger entry toward the pillager. Zealot archetypes write `−35`.
- AI expansionist/zealot archetypes pillage by default; mercantile/hegemon never do (they want the province productive).
- Composes with martial legacy (#17) — pillaging adds a "sacked <provinceName>" entry to the historical record.
- New events: `military:pillage`, `military:province-devastated`.
- New config: `pillageGoldAmount`, `pillagePopLoss`, `devastationIncomeMultiplier`, `devastationDurationFrames`.
- Contract additions: two new event keys.

> **Revisit before implementing.** The core idea is solid but details need work: is pillaging automatic or a player/AI choice? If a choice, what's the UI for the player and the decision logic for AI? Should the devastation be a flat penalty or scale with army size? Can you pillage the same province twice? How does this interact with culture assimilation (pillaged provinces should resist conversion harder)? Does the defending population fight back (composing with levies #23)?

### 26. Negotiated surrender & safe passage (military ↔ diplomacy)

When a nation is clearly losing, allow a formal surrender that's better than fighting to the last province — cede territory in exchange for survival.

- New diplomatic action: `offerSurrender(loserId, winnerId, provincesToCede[])`. The loser proposes giving up specific provinces in exchange for immediate peace.
- AI evaluates based on personality: expansionists demand more provinces, diplomats accept fair offers, zealots demand total capitulation.
- Accepted: provinces transfer without combat, peace is made, personality writes `+10 pragmatism` entries both ways.
- Rejected: war continues, but the rejected offer is recorded in martial legacy (#17).
- Safe passage clause: surrendering nation's armies in ceded provinces get one tick to "retreat" to an owned province before being destroyed.
- New events: `diplomacy:surrender-offered`, `diplomacy:surrender-accepted`, `diplomacy:surrender-rejected`.
- New config: `surrenderMinProvincesRatio` (minimum % of contested provinces the winner demands).
- Contract additions: three new event keys.

### Implementation order (suggested)

1. **Supply lines** — the connectivity check is the only complex piece; everything else reuses the existing army strength pipeline.
- Movement and army merging are out of scope for this implementation.
