# Grand-strategy: Project Documentation

**Project Type:** Browser-based grand strategy game (Turn-based 4X)  
**Language:** TypeScript (strict mode)  
**Build:** Vite + TypeScript  
**Testing:** Vitest  
**Runtime:** Browser only (no Node APIs)  
**Status:** Active development with 13 mechanics implemented

---

## Executive Summary

Grand-strategy is a real-time hex-grid turn-based 4X game played entirely in the browser. The game runs **autonomous AI nations** on a 30×20 hex grid with 130 provinces and 20 nations. There is no player character — the game is AI-only observation/interaction.

The architecture uses **strict mechanic isolation**: each game system (map, military, diplomacy, economy, etc.) lives in its own directory, exports only through a single `index.ts` file, and communicates with other mechanics **exclusively through typed events** via an `EventBus`. This design allows agents to work on individual mechanics with minimal context.

**Core loop:** Fixed 20 Hz update tick → event-driven mechanic updates → deterministic per-turn game state → per-frame rendering.

---

## Technology Stack

| Component | Version | Notes |
|-----------|---------|-------|
| **Language** | TypeScript 5.4.0 | Strict mode: `true` |
| **Build** | Vite 5.2.0 | ES2022 target, ESNext module resolution |
| **Testing** | Vitest 1.5.0 | jsdom environment for browser simulation |
| **Runtime DOM** | jsdom 29.0.1 | Test environment only |

**Configuration Files:**
- `tsconfig.json` — strict mode, path aliases (`@contracts/*`)
- `vite.config.ts` — base path `/Grand-strategy/`, ES2022 target
- `vitest.config.ts` — jsdom environment, test pattern includes `src/**/*.test.ts`

---

## Project Structure

```
src/
├── main.ts                           ← Entry point; bootstraps game loop & registers mechanics
├── contracts/                        ← Shared types & event definitions (off-limits for mechanic agents)
│   ├── index.ts
│   ├── state.ts                     ← GameState root interface
│   ├── events.ts                    ← EventMap with all event types
│   └── mechanics/                   ← Per-mechanic public type exports
│       ├── map.ts, ai.ts, military.ts, ...(13 total)
├── engine/                          ← Core game loop (off-limits for mechanic agents)
│   ├── GameLoop.ts                  ← 20 Hz update/render scheduler
│   ├── EventBus.ts                  ← Event emitter/subscriber
│   └── StateStore.ts                ← Immutable state container
└── mechanics/                       ← Game systems (each one is a mechanic agent's responsibility)
    ├── map/                        ← Hex grid, provinces, rendering
    ├── ai/                         ← AI decision-making per nation
    ├── military/                   ← Armies, combat resolution
    ├── navy/                       ← Fleets
    ├── buildings/                  ← Building construction & effects
    ├── construction/               ← Construction queue manager
    ├── economy/                    ← Gold income & upkeep
    ├── diplomacy/                  ← Peace/war relations
    ├── population/                 ← Population mechanics
    ├── culture/                    ← Cultural conversion & assimilation
    ├── climate/                    ← Terrain types, climate effects
    ├── personality/                ← Nation personality traits & memory
    └── technology/                 ← Tech tree & research
```

Each mechanic `src/mechanics/<name>/` contains:
- `index.ts` — **only** file that external code imports
- `types.ts` — internal types (not exported outside mechanic)
- `README.md` — required documentation (Purpose, Public API, Events, State, Design Notes)
- `<name>.test.ts` — colocated tests
- Additional `.ts` files as needed (internal implementation)

---

## Architecture: Mechanic Isolation

**Core rule:** Mechanics do **not** import from each other. All communication goes through `EventBus`.

### Event-Driven Communication

All mechanics subscribe to an `EventBus`:

```typescript
eventBus.subscribe('military:army-raised', handler)
eventBus.emit('military:army-raised', { armyId, countryId, provinceId })
```

**Event types** are defined in `src/contracts/events.ts` as a single `EventMap`:
```typescript
export interface EventMap {
  'military:army-raised': { armyId: ArmyId; countryId: CountryId; provinceId: ProvinceId }
  'map:province-conquered': { provinceId: ProvinceId; newOwnerId: CountryId; oldOwnerId: CountryId }
  // ... 30+ event types
}
```

### Shared State

`src/contracts/state.ts` defines the **root `GameState` interface**:

```typescript
export interface GameState {
  readonly map:          MapState
  readonly ai:           AIState
  readonly military:     MilitaryState
  readonly navy:         NavyState
  readonly buildings:    BuildingsState
  readonly construction: ConstructionState
  readonly economy:      EconomyState
  readonly diplomacy:    DiplomacyState
  readonly population:   PopulationState
  readonly culture:      CultureState
  readonly climate:      ClimateState
  readonly personality:  PersonalityState
}
```

Each mechanic manages its own slice. Mechanics **read-only** access other slices via `StateStore.getState()`. Mutations flow through events.

### Example: Army Recruitment Flow

1. **AI decides to recruit** → `ai:decision-made { decision: RECRUIT }`
2. **Military mechanic responds** → calls `requestBuildArmy()` which emits:
   - `economy:gold-deducted { amount, reason: 'army-recruitment' }`
   - `construction:request { buildableType: 'army', durationFrames }`
3. **Economy mechanic** deducts gold from country state
4. **Construction mechanic** tracks the job
5. **After construction finishes** → `construction:complete`
6. **Military mechanic responds** → creates army in state, emits `military:army-raised`
7. **Map mechanic** updates leaderboard on the next render

**No cross-imports.** Each mechanic is a black box; only event contracts matter.

---

## Game Loop (20 Hz / 1 frame every 50ms)

```
GameLoop.tick():
  1. Accumulate elapsed time
  2. For each 50ms step:
     a. Call all registered updateFn() → mechanics update state
     b. Events fire synchronously during updates
     c. All subscribers are notified immediately
  3. Render phase: call all renderFn()
     a. MapRenderer draws hex grid + units
     b. LeaderboardRenderer updates DOM panel
     c. CombatLogRenderer appends entries
```

**Turn timing:**
- `FRAMES_PER_TURN = 300` frames = 15 seconds real-time
- Turn number: `Math.floor(frame / 300)`
- Game logic expresses timing in "turns" not frames (frames are internal)

---

## Implemented Mechanics (13 Total)

### 1. **Map** (`src/mechanics/map/`)
- **Renders** the 30×20 hex grid with 130 provinces, 20 nations
- **Handles** camera (pan/zoom), province selection, and mouse interaction
- **Tracks** war declarations (gates province conquest)
- **Resolves** combat: attacker vs defender, terrain modifiers, morale, casualties
- **Events:** `map:province-selected`, `map:province-conquered`, `map:province-attack-repelled`, etc.

### 2. **AI** (`src/mechanics/ai/`)
- **Decision-making** per nation (per 60 frames): RECRUIT, BUILD, EXPAND, SEEK_PEACE, ISOLATE
- **Archetypes** (5 personality types) bias decisions: expansionist, diplomat, mercantile, zealot, hegemon
- **Scoring** per action based on nation state (gold, army strength, population, tech)
- **Events:** `ai:decision-made { decision }`

### 3. **Military** (`src/mechanics/military/`)
- **Manages armies:** recruit, deploy, casualty tracking
- **Composition:** each army has `strength` (base 100, +25 from barracks)
- **Casualties** from combat tracked via `military:casualties-taken`
- **Emits:** `military:army-raised`, `military:army-destroyed`, `military:army-build-rejected`

### 4. **Navy** (`src/mechanics/navy/`)
- **Manages fleets:** similar lifecycle to armies
- **Fleet composition:** each fleet has strength
- **Blockade logic** (in-progress): fleets block province income
- **Events:** `navy:fleet-raised`, `navy:fleet-destroyed`

### 5. **Buildings** (`src/mechanics/buildings/`)
- **Building types:** `walls` (defense), `barracks` (army strength), `farm` (income), `harbor` (fleet), `temple` (unrest reduction)
- **Per-province buildings:** can have multiple types
- **Construction integration:** emits build request to construction mechanic
- **Effects:** read by other mechanics (e.g., military reads barracks for +strength bonus)
- **Events:** `buildings:building-constructed`, `buildings:building-destroyed`

### 6. **Construction** (`src/mechanics/construction/`)
- **Queue manager** for all buildables (buildings, armies, fleets, technology)
- **Job tracking:** stores duration, owner, location, type
- **Completion:** emits `construction:complete` when a job finishes
- **Events:** `construction:request`, `construction:complete`, `construction:canceled`

### 7. **Economy** (`src/mechanics/economy/`)
- **Income per turn** from farms & harbors; calculated per province
- **Upkeep** deducted per turn (buildings, armies, fleets — TBD)
- **Gold balance** tracked per country
- **Emits:** `economy:income-collected`, `economy:gold-deducted`, `economy:bankrupt` (if balance < 0)
- **Note:** full upkeep system not yet implemented

### 8. **Diplomacy** (`src/mechanics/diplomacy/`)
- **Relations:** War, Peace, Truce status per country pair
- **War gate:** map mechanic only allows conquest between countries at war
- **Events:** `diplomacy:war-declared`, `diplomacy:peace-made`, `diplomacy:truce-formed`

### 9. **Population** (`src/mechanics/population/`)
- **Province population** grows over time
- **Army recruitment** draws from population (recruitment penalty TBD)
- **Unrest** from foreign occupation, cultural mismatch
- **Revolts** if unrest exceeds threshold
- **Events:** `population:growth`, `population:unrest-increase`, `population:revolt`

### 10. **Culture** (`src/mechanics/culture/`)
- **Province culture tags** (e.g., "Nordic", "Silk Road", "Islander")
- **Assimilation:** foreign-culture provinces slowly convert to owner's culture
- **Bonuses:** same-culture +loyalty, same-culture +income modifiers
- **Events:** `culture:assimilation-progressed`, `culture:cultural-shift`

### 11. **Climate** (`src/mechanics/climate/`)
- **Terrain types:** plains, hills, mountains, forest, tundra, desert
- **Climate tags:** arctic, tropical, temperate, arid
- **Terrain modifiers** applied in combat (terrain affects defense multiplier)
- **No events yet** — purely data-driven via types

### 12. **Personality** (`src/mechanics/personality/`)
- **Ledger system:** each nation maintains a ledger of grievances, alliances, trust entries
- **Emotional memory:** records why nations like/dislike each other
- **AI consumption:** personality entries bias AI decisions (hold grudges, reward loyalty)
- **Events:** `personality:ledger-entry-added`, `personality:relationship-changed`

### 13. **Technology** (`src/mechanics/technology/`)
- **Tech tree:** linear progression (Agricultural → Iron-working → Steel-working → Writing, etc.)
- **Research:** nations choose a tech and queue it for research
- **Completion:** emits `technology:researched`, unlocks diplomatic/military bonuses
- **Effects** (TBD): currently tracked but bonuses not applied to combat/diplomacy
- **Events:** `technology:research-started`, `technology:researched`

---

## Key Game Concepts

### Nations (20 total)
- Kingdom of Valdorn, Republic of Solenne, Thornwood Dominion, ... (named fantasy nations)
- Each controls 5–7 provinces
- Color-coded on map for visual distinction

### Provinces (130 total)
- Named entities occupying 3–5 contiguous hex cells
- Owned by a nation, support population, buildings, armies
- Can be conquered in combat
- Have terrain (affects combat, culture assimilation)

### Turns
- 1 turn = 300 frames = 15 seconds real-time
- AI makes decisions every 60 frames (~5 seconds = 0.33 turns)
- All game mechanics operate on turns (construction time, research time, etc.)

### Combat Resolution
- **Attacker:** `armies × morale + base 50 + flat roll [0–30]`
- **Defender:** `armies × terrain × morale + walls bonus 60 + base 20 + flat roll [0–30]`
- **Morale:** ±15% per side (0.85–1.15×)
- **Terrain multipliers:** plains 1.0, hills 1.3, mountains 1.6, forest 1.2, tundra 1.1, desert 0.9
- **Outcome:** winner (12–27% casualties), loser (28–48% casualties)
- **Emits:** `map:province-conquered` or `map:province-attack-repelled`

---

## Code Conventions

### Naming
- **Classes:** PascalCase (`HexGrid.ts`, `EventBus.ts`, `AIController.ts`)
- **Modules/utilities:** camelCase (`types.ts`, `index.ts`)
- **Types:** PascalCase (`Province`, `CountryId`, `ArmyState`)
- **Unions:** `type` keyword; objects: `interface` keyword
- **No `any`** — TypeScript strict mode enforced; use `unknown` and narrow

### Exports
- **Named exports only** — no default exports
- **Single public surface:** only `index.ts` is imported externally
- **Internal types** stay in `types.ts`

### Tests
- Location: `src/mechanics/<name>/<name>.test.ts` (colocated)
- **Mock EventBus and StateStore** — never use real instances
- **Every exported function** must have at least one test
- Command: `npm test` (Vitest watch mode)

### Immutability
- `readonly` arrays and properties in all contracts
- State mutations only via events, never direct mutation
- Prevents subtle bugs from shared mutable state

---

## Development Workflow

**Local setup:**
```bash
npm install
npm run dev          # Vite dev server, HMR enabled
npm test             # Vitest watch
npm run typecheck    # Type check only
npm run build        # Production build (includes type check)
```

**Git workflow:**
- Branch naming: `feat/<feature>`, `fix/<bug>`, etc.
- Commits are atomic (one logical change per commit)
- PRs include mechanic changes + updated `README.md` in the mechanic
- Commit signing enabled (never `--no-verify` or `--no-gpg-sign`)

**Mechanic README.md updates:**
Required sections (update in every commit):
- Purpose
- Public API (exported functions/types)
- Events Emitted (table)
- Events Consumed (table)
- State Slice (interface definition)
- Design Notes (key decisions, tradeoffs)

---

## Roadmap: 26 Planned Military Features

The military mechanic has a detailed 26-item roadmap documented in `src/mechanics/military/README.md`. Highlights:

1. **Supply lines & attrition** (high priority)
2. **Army XP & tiers**
3. **Unit types (infantry/cavalry/siege)**
4. **Mountain entrenchment**
5. **Doctrine system**
... through ...
26. **Negotiated surrender**

Implementation order is defined; many items compose (e.g., supply lines feed into overstretch penalties).

---

## Known Limitations & TODOs

### Missing Features
- **Player UI** — no player nation or interactive controls yet (AI-only)
- **Persistence** — no save/load (would use localStorage JSON serialization)
- **Turn resolution order** — not formally defined; should document per-mechanic tick order
- **Integration tests** — `tests/integration/` directory exists but is empty
- **Technology effects** — research completes but bonuses don't apply yet to combat/diplomacy
- **Upkeep system** — armies/fleets don't have per-turn maintenance costs yet
- **Full unrest mechanics** — population unrest tracked but doesn't trigger revolts
- **Fog of war** — not implemented; all provinces visible to all nations

### Design TODOs
- **Victory conditions** — what are the win states?
- **River mechanics** — should they be crossable-with-penalty or impassable unless bridged?
- **Spy/intelligence** — how to implement without breaking isolation?
- **Standing-army dissatisfaction** — should peacetime idle armies have costs?

---

## AI Decision-Making

Each nation runs an AI loop every 60 frames (within the 20 Hz main loop). AI evaluates six possible actions:

1. **RECRUIT:** Build an army
2. **BUILD:** Construct a building
3. **EXPAND:** Attack a neighboring province
4. **SEEK_PEACE:** Negotiate peace with an enemy
5. **ISOLATE:** Do nothing (withdraw)
6. **ALLY:** Form an alliance (limited use)

Scoring is **personality-driven**: each archetype (expansionist, diplomat, mercantile, zealot, hegemon) weights actions differently based on:
- Nation's current strength (gold, army count)
- Neighbor threat/opportunity
- Personality ledger entries (grudges, trust, betrayals)
- Tech/research status

No forward planning across multiple turns; each decision is greedy (highest score wins).

---

## Testing Strategy

**Unit tests:** Each mechanic has tests for exported functions; mocks EventBus and StateStore.

**Integration tests:** Cross-mechanic flows live in `tests/integration/` (currently empty — this is a priority gap).

**Manual testing:** Game runs in browser; observer can watch AI nations interact.

**No end-to-end framework yet** — would need a scripted test harness to validate multi-turn scenarios (e.g., "nation A recruits army → attacks neighbor B → wins → takes province").

---

## Performance Considerations

- **20 Hz game loop** ensures smooth 60 FPS rendering (tick every 3 frames)
- **State immutability** prevents accidental mutations but requires careful cloning
- **Event subscriptions** happen at mechanic init; no dynamic subscription/unsubscription
- **Canvas rendering** (hex grid, units) is the main CPU consumer; optimized with single `setTransform`
- **No artificial delays** — all timing is frame-based, deterministic

---

## File Statistics

- **77 TypeScript files** total (including tests)
- **13 mechanics** with dedicated directories
- **~3000 lines** of core game logic (excluding tests)
- **~500 lines** of engine code (GameLoop, EventBus, StateStore)

---

## How AI Agents Work on This Project

**Per-mechanic isolation:** Each mechanic agent gets:
1. `src/mechanics/<name>/` (their mechanic directory)
2. `src/contracts/mechanics/<name>.ts` (public types)
3. `src/contracts/events.ts` (event signatures)
4. CLAUDE.md Section 0 (isolation rules)

**No access to:**
- `src/engine/` (game loop, event bus, state store)
- Other mechanics' internals
- `src/main.ts` (bootstrap; engine agent only)

**Workflow:**
1. Read mechanic's README to understand purpose, public API, events
2. Check `src/contracts/events.ts` for event types the mechanic emits/consumes
3. Implement/fix code in the mechanic directory
4. Write tests (colocated, mocking EventBus/StateStore)
5. Update README if public API or events changed
6. PR is reviewed; merged to main

---

## Next Steps

**For new developers:**
1. Read `CLAUDE.md` (project architecture & agent conventions)
2. Pick a mechanic from the roadmap
3. Read that mechanic's `README.md` to understand its purpose
4. Check events in `src/contracts/events.ts`
5. Write tests first (red), then implement

**For product/planning:**
1. Finalize roadmap priorities (military has 26 items — which land first?)
2. Add victory conditions & player UI design
3. Create persistence/save-game story
4. Plan integration test framework

---

## Contact & Resources

- **Source:** `C:\Users\hullg\Documents\Github\Grand-strategy`
- **Issue tracking:** (To be configured)
- **Design documents:** `CLAUDE.md`, individual mechanic READMEs
- **Agent prompt template:** See CLAUDE.md Section 15

---

**Documentation generated:** 2026-04-18  
**Project context:** See `_bmad-output/project-context.md` for AI agent rules
