# CLAUDE.md — Grand-strategy

This file is the authoritative guide for AI assistants (Claude Code agents) working in this repository. Read it fully before making any changes.

---

## 0. Agent Quick Reference

> **Mechanic agents: read this section only.** The rest of the file is for human developers and the engine agent.

**Your context:**
- Your mechanic: `src/mechanics/<name>/` (all files)
- Shared contracts: `src/contracts/mechanics/<name>.ts`, `src/contracts/events.ts`
- Do NOT read or modify: `src/engine/`, `src/contracts/` (any other file), `src/main.ts`

**Hard rules:**
1. Only export from `index.ts`. No other file in your mechanic may be imported externally.
2. Never import from another mechanic (`src/mechanics/<other>/`). Use events instead.
3. To communicate with other mechanics: emit or subscribe to events via `src/contracts/events.ts`.
4. Need a new contract type or event? Add a `// TODO: add to contracts` comment and document it in your `README.md`. Do not edit `contracts/` directly.
5. No `window`, `document`, or `canvas` in logic files — renderer files only.

**Code conventions:**
- Named exports only (no default exports). No `any` — use `unknown`. `interface` for objects, `type` for unions.
- File names: PascalCase for classes (`HexGrid.ts`), camelCase for modules (`types.ts`).
- No side effects at module level.

**Tests:** `src/mechanics/<name>/<name>.test.ts`. Mock `EventBus` and `StateStore` — never use real instances.

**README:** Update `README.md` in every commit. An outdated README is a bug. Required sections: Purpose, Public API, Events Emitted, Events Consumed, State Slice, Design Notes.

---

## 1. Project Overview

**Grand-strategy** is a browser-based grand strategy game written in TypeScript. It runs entirely in the browser with no server-side runtime. The game is designed around strictly isolated mechanics so that a dedicated Claude agent can be spun up at any time to work on a single mechanic with a minimal, focused context.

---

## 2. Tech Stack

| Concern | Choice |
|---------|--------|
| Language | TypeScript (strict mode — `"strict": true`) |
| Build & dev server | Vite |
| Testing | Vitest |
| Runtime target | Browser only (no Node APIs in mechanics) |
| UI / rendering | Plain TypeScript + Canvas / DOM (no framework) |

---

## 3. Architecture — Mechanic Isolation Model

Each game mechanic lives in its own directory under `src/mechanics/`. Mechanics are **not allowed to import from each other**. All cross-mechanic communication goes through the shared `src/contracts/` layer and the `EventBus`.

This isolation means any agent working on a mechanic only needs three things in context:

1. `src/mechanics/<mechanic>/` — its own files
2. `src/contracts/` — shared interfaces and event types
3. `CLAUDE.md` — these conventions

---

## 4. Directory Structure

```
Grand-strategy/
├── CLAUDE.md, README.md, index.html, package.json, tsconfig.json, vite.config.ts, vitest.config.ts
├── src/
│   ├── main.ts                       ← bootstraps game loop, registers mechanics
│   ├── contracts/                    ← shared interfaces, event types, enums
│   │   ├── index.ts                  ← barrel export
│   │   ├── events.ts                 ← typed EventBus event map
│   │   ├── state.ts                  ← root GameState shape
│   │   └── mechanics/<name>.ts       ← one file per mechanic (map, diplomacy, military, economy, population, technology, events-system)
│   ├── engine/
│   │   ├── GameLoop.ts, EventBus.ts, StateStore.ts
│   └── mechanics/
│       └── <name>/                   ← one directory per mechanic (same names as above)
│           ├── README.md             ← mechanic documentation (required)
│           ├── index.ts              ← public API — only file others may import
│           ├── types.ts              ← mechanic-private types
│           ├── <name>.test.ts
│           └── ...                   ← additional implementation files as needed
└── tests/
    └── integration/                  ← cross-mechanic integration tests only
```

---

## 5. Contracts Layer

`src/contracts/` is the **only** shared code between mechanics.

- `events.ts` — defines the typed `EventMap` (key → payload). Mechanics emit and subscribe to events by name using these types.
- `state.ts` — defines the top-level `GameState` interface. Each mechanic slice is typed here.
- `mechanics/<name>.ts` — per-mechanic public types that must cross module boundaries (e.g. a `Province` type that both map and economy need).

**Rules for contracts:**
- Contracts are pure TypeScript types/interfaces — no runtime logic.
- Only the engine agent modifies `contracts/`. Mechanic agents may **propose** additions to contracts but must not edit the files directly; they should leave a `// TODO: add to contracts` comment and document the need in their mechanic's `README.md`.

---

## 6. Agent Dispatch Table

**For any mechanic agent** (`<name>` = map | diplomacy | military | economy | population | technology | events-system):
- `src/mechanics/<name>/**`
- `src/contracts/mechanics/<name>.ts`
- `src/contracts/events.ts`
- `CLAUDE.md` **Section 0 only**

**Engine agent:** `src/engine/**`, `src/contracts/**`, `src/main.ts`, `CLAUDE.md` (full)

---

## 7. Model Selection

| Task | Model |
|------|-------|
| Planning (architecture, design, implementation plans) | `claude-sonnet-4-6` |
| Coding (implementation, editing files, tests) | `claude-haiku-4-5-20251001` |

When dispatching subagents via the Agent tool:
- Use `model: "sonnet"` for `Plan` subagents.
- Use `model: "haiku"` (or omit, since Haiku is the session default) for `general-purpose` and `Explore` subagents doing implementation work.

---

## 8. Isolation Rules


These rules are absolute. Do not break them.

1. **Single public surface.** A mechanic's `index.ts` is its only export. External code imports only from `src/mechanics/<name>/index.ts`, never from internal files (`MapRenderer.ts`, `types.ts`, etc.).
2. **No cross-mechanic imports.** A mechanic must not import from `src/mechanics/<other>/`. If mechanic A needs data from mechanic B, it subscribes to an event that B emits, using event types from `src/contracts/events.ts`.
3. **Private types stay private.** A mechanic's `types.ts` is internal unless a type truly belongs in `contracts/`.
4. **Engine and contracts are off-limits for mechanic agents.** Mechanics do not edit `src/engine/` or `src/contracts/`. They request contract changes via comments and `README.md` notes.
5. **No browser globals in logic files.** Pure game logic (state manipulation, calculations) must not reference `window`, `document`, or `canvas`. Only renderer files may touch the DOM/Canvas.

---

## 9. Per-Mechanic README.md

Every mechanic directory **must** contain a `README.md`. The agent responsible for that mechanic owns this file.

**Required sections in each mechanic README.md:**

```markdown
# <Mechanic Name>

## Purpose
What this mechanic does and why it exists.

## Public API
List of exported functions/classes from index.ts with brief descriptions.

## Events Emitted
| Event name | Payload type | When it fires |
|------------|-------------|---------------|

## Events Consumed
| Event name | Payload type | What the mechanic does with it |
|------------|-------------|-------------------------------|

## State Slice
Description of the mechanic's portion of GameState.

## Design Notes
Key decisions, tradeoffs, known limitations.
```

**The mechanic's README.md must be updated in the same commit as any code change.** An outdated README is a bug.

---

## 10. Adding a New Mechanic

Follow this checklist exactly:

1. Create `src/mechanics/<name>/` directory.
2. Create `src/mechanics/<name>/README.md` (fill in all required sections).
3. Create `src/mechanics/<name>/index.ts` (empty public API to start).
4. Create `src/mechanics/<name>/types.ts` for internal types.
5. Create `src/mechanics/<name>/<name>.test.ts`.
6. Add `src/contracts/mechanics/<name>.ts` with public-facing types (engine agent task — file a request if you are a mechanic agent).
7. Add the mechanic's event keys to `src/contracts/events.ts` (engine agent task).
8. Register the mechanic in `src/main.ts` (engine agent task).
9. Add a row to the Agent Dispatch Table (Section 6) in this `CLAUDE.md`.

---

## 11. Code Conventions

- **File names:** PascalCase for classes (`HexGrid.ts`), camelCase for modules (`types.ts`, `index.ts`).
- **Exports:** Named exports only — no default exports.
- **Types:** Prefer `interface` for object shapes, `type` for unions/aliases.
- **No `any`.** Use `unknown` and narrow it. `any` causes TypeScript strict mode to fail silently.
- **Immutability:** Prefer readonly arrays and properties in contracts and public APIs.
- **No side effects at import time.** Module-level code must be pure declarations.

---

## 12. Testing Conventions

- Tests live in `src/mechanics/<name>/<name>.test.ts` (co-located, not in a separate `tests/` tree).
- Cross-mechanic integration tests live in `tests/integration/`.
- Every exported function must have at least one test.
- Tests must not use real `EventBus` or `StateStore` — pass mocks or test doubles.
- Run tests with `npm test` (Vitest).

---

## 13. Build & Dev Commands

```bash
npm install          # install dependencies
npm run dev          # start Vite dev server with HMR
npm run build        # production build to dist/
npm run preview      # preview production build locally
npm test             # run Vitest in watch mode
npm run typecheck    # tsc --noEmit (no emit, just type check)
```

---

## 14. Git Workflow

- **Primary branch:** `main`
- **Feature branches:** `<type>/<short-description>` (e.g., `feat/hex-grid`, `fix/economy-overflow`)
- **Commit signing:** Enabled (SSH key). Never bypass with `--no-gpg-sign` or `--no-verify`.
- **Push:** `git push -u origin <branch-name>` on first push.
- **No force pushes** to `main`.
- Commits must be atomic — one logical change per commit.
- Mechanic agents commit only within their mechanic's directory and their mechanic's `README.md`. Changes to `contracts/`, `engine/`, or `main.ts` require the engine agent.

---

## 15. Minimal Agent Prompt Template

Use this template to keep task prompts short when dispatching a mechanic agent:

```
Mechanic: <name>
Branch: <branch-name>
Task: <one sentence describing what to implement or fix>

Context files:
- src/mechanics/<name>/        (your mechanic)
- src/contracts/mechanics/<name>.ts
- src/contracts/events.ts
- CLAUDE.md Section 0          (rules — read this section only)
```

For the engine agent, replace the context block with:
```
Context files: src/engine/**, src/contracts/**, src/main.ts, CLAUDE.md (full)
```
