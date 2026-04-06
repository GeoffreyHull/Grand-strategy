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

## TODO

### Mechanics — Missing

- [ ] **Diplomacy** — Relations, alliances, wars, peace deals. AI `ALLY` decisions currently emit but nothing acts on them. Needs `src/mechanics/diplomacy/`, `src/contracts/mechanics/diplomacy.ts`, and diplomacy events in `EventMap`.
- [ ] **Economy** — Gold income, upkeep costs, trade routes. Buildings produce no economic output yet. Province `baseIncome` exists in the map contract but is unused.
- [ ] **Population** — Province population growth, manpower pools, unrest. Required for realistic army recruitment limits and economic scaling.
- [ ] **Events System** — Scripted/random in-game events (e.g. plague, rebellion, discovery) with player choices and consequences. CLAUDE.md lists this as a planned mechanic.

### Mechanics — Partially Implemented

- [ ] **Military — Combat** — Armies can be raised but cannot move or fight. Need movement, battle resolution, and province conquest.
- [ ] **Military — AI integration** — AI emits `EXPAND` decisions but nothing translates them into army movement or attack orders.
- [ ] **Navy — Combat & movement** — Fleets can be formed (coastal provinces only) but have no movement, naval combat, or blockade logic.
- [ ] **Buildings — Effects** — Buildings can be constructed but produce no game effects (no income bonus, no recruitment boost, etc.).
- [ ] **Technology — Effects** — Technologies can be researched but unlock nothing. Need an effect layer that modifies unit stats, building output, etc.
- [ ] **AI — Execution** — AI decisions (`EXPAND`, `FORTIFY`, `ALLY`, `ISOLATE`) are scored and emitted but no mechanic acts on them beyond logging.
- [ ] **Construction — Build queue UI** — The construction queue runs headlessly; there is no UI to inspect or cancel jobs.

### UI / UX

- [ ] **Province info panel** — Show full province details on selection: owner, population, buildings, army/fleet presence, income.
- [ ] **Country overview panel** — Treasury, technology level, army/fleet roster, diplomatic relations.
- [ ] **Turn / time controls** — Pause, speed controls, turn counter. Currently the game loop runs unchecked at 20 Hz.
- [ ] **Minimap** — Overview minimap for large-map navigation.
- [ ] **Tooltip system** — Hover tooltips for provinces, units, and buildings.
- [ ] **Player country selection** — No UI to choose which of the 20 nations the player controls. `ai:player-country-set` event exists but is never emitted from the UI.

### Engine / Infrastructure

- [ ] **Persistence** — Save/load game state (localStorage or file download/upload).
- [ ] **Turn resolution order** — Define and enforce a deterministic per-turn processing order across mechanics.
- [ ] **Win/loss conditions** — No victory conditions defined. Need a game-over mechanic.
- [ ] **Map editor / world data tooling** — Province layout is hardcoded in `WorldData.ts`. A visual editor or JSON-driven loader would make iteration easier.
- [ ] **Integration tests** — `tests/integration/` directory exists but contains no tests. Cross-mechanic flows (e.g. AI decision → construction → army raised) need coverage.
