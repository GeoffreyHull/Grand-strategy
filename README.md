# Grand-strategy

A browser-based grand strategy game written in TypeScript. Runs entirely in the browser with a hex-grid world map, isolated game mechanics, and an event-driven architecture.

## Quick Start

```bash
npm install
npm run dev       # dev server with HMR
npm test          # run tests
npm run typecheck # type check only
npm run build     # production build
```

## Architecture

Mechanics are strictly isolated — they communicate only through typed events (`src/contracts/events.ts`). Each mechanic lives in `src/mechanics/<name>/` and exports only through its `index.ts`.

See [CLAUDE.md](./CLAUDE.md) for the full architecture guide and agent conventions.

---

## Planned Features

### New Mechanics

- [ ] **Population** — Province population growth over time, manpower pools capping army recruitment, unrest from foreign occupation, revolts when unrest exceeds threshold.
- [ ] **Religion / Culture** — Provinces have religion and culture tags. Same-religion/culture bonuses to loyalty and income; missionaries convert provinces; interfaith relation penalties.
- [ ] **Trade System** — Trade routes generating income for connected nations; blockadeable by fleets. Distinct from the existing port income modifier. Design TBD.
- [ ] **Events System** — Scripted/random in-game events (plague, bumper harvest, noble revolt, mercenary offers, golden age) with choices and consequences. Lower priority — implement after core systems are stable.

### Mechanic Depth

- [ ] **Technology — Effects** — Apply actual bonuses: Agriculture → +20% farm income, Iron-working → army +15 strength, Steel-working → army +30 strength, Trade-routes → +15% port income, Writing → cheaper diplomatic actions, Siege-engineering → halves wall defense for attacker, Cartography → fog-of-war reveal, Bureaucracy → −25% building upkeep.
- [ ] **Combat Depth** — Army movement between provinces (1 province/turn), multi-turn sieges for fortified provinces, attrition in enemy territory, naval blockades cutting province income, casualties proportional to strength ratio.
- [ ] **Economy — Upkeep** — Per-turn gold cost for armies and fleets; desertion/disbanding on insufficient gold. Building maintenance costs. Bankruptcy state blocking recruitment and war declaration.
- [ ] **New Building Types** — Market (trade bonus), University (research speed +30%), Temple (unrest −10), Mine (income on hills/mountains), Road (movement cost −1 to adjacent province), Fortress (wall defense upgrade: +120 instead of +60).

### UI / UX

- [ ] **Minimap** — Corner overview of the full world with pan-position indicator.
- [ ] **Notifications panel** — Scrollable log of significant events (wars declared, research completed, conquests, revolts).
- [ ] **Diplomacy screen** — Matrix view of all nation relationships.
- [ ] **Tech tree visualization** — Dependency graph showing researched vs. available vs. locked technologies.
- [ ] **Fog of War** — Provinces not adjacent to your territory show last-known owner rather than current state.
- [ ] **Province info panel** — Full province details on selection: owner, population, buildings, army/fleet presence, income.
- [ ] **Tooltip system** — Hover tooltips for provinces, units, and buildings.

### Engine / Infrastructure

- [ ] **Persistence** — Save/load game state via `localStorage` (serialize full `GameState` to JSON) with autosave every N turns.
- [ ] **Integration tests** — `tests/integration/` directory exists but contains no tests. Cross-mechanic flows (e.g. AI decision → construction → army raised) need coverage.
- [ ] **Turn resolution order** — Define and enforce a deterministic per-turn processing order across mechanics.

---

## Deferred / Long-Term

- **Victory Conditions** — No win states planned yet.
- **Player UI** — No player-controlled nation or build queue UI yet; game is AI-only for now.
- **Rulers / Leaders** — Per-nation rulers with stats affecting AI behavior; succession and death events. Revisit after population is stable.
- **Espionage** — Spies, sabotage, gold theft, revolt incitement. Revisit after diplomacy and population are mature.
- **Map editor / world data tooling** — Province layout is hardcoded in `WorldData.ts`. Low priority until the world design is final.
