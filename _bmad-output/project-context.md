---
project_name: 'Grand-strategy'
user_name: 'Geoff'
date: '2026-04-18'
sections_completed: ['technology_stack', 'language_specific_rules', 'mechanic_isolation', 'testing_rules', 'code_quality', 'critical_rules']
status: 'complete'
rule_count: 85
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

| Technology | Version | Purpose |
|-----------|---------|---------|
| TypeScript | 5.4.0 | Language with strict mode enabled |
| Vite | 5.2.0 | Build tool and dev server |
| Vitest | 1.5.0 | Testing framework (jsdom environment) |
| jsdom | 29.0.1 | DOM simulation for tests |
| Target | ES2022 | JavaScript output target |
| Module System | ESNext | Modern module resolution |
| Environment | Browser-only | No Node APIs in mechanics |

---

## Critical Implementation Rules

### Language-Specific Rules

**TypeScript Configuration:**
- Strict mode enabled (`"strict": true`) — enforce across all code
- No `any` type — use `unknown` and narrow with type guards
- Module target ES2022 with ESNext resolution — modern syntax throughout
- Path aliases: `@contracts/*` points to `./src/contracts/*`

**Import/Export Patterns:**
- Named exports ONLY — no default exports anywhere
- `interface` for object shapes, `type` for unions and aliases
- Only one public export file per mechanic: `index.ts`
- Internal types stay in `types.ts` (not exported outside mechanic)

**Module-Level Constraints:**
- Zero side effects at module level — only declarations allowed
- No dynamic imports or module initialization logic
- Readonly properties preferred in contracts and public APIs
- No `window`, `document`, or `canvas` references in logic files (renderer files only)

### Mechanic Isolation & Architecture Rules

**Single Public Surface:**
- Each mechanic's `index.ts` is its ONLY external export
- External code imports only from `src/mechanics/<name>/index.ts` — never from internal files
- Other files in a mechanic (types.ts, implementation files) are private

**No Cross-Mechanic Imports:**
- Mechanics must NEVER `import` from `src/mechanics/<other>/`
- Communication between mechanics ONLY through EventBus (emit/subscribe events)
- Use event types from `src/contracts/events.ts` for type safety

**EventBus Communication Pattern:**
- Emit events to notify other mechanics: `eventBus.emit('eventName', payload)`
- Subscribe to events: `eventBus.subscribe('eventName', handler)`
- All event types defined in `src/contracts/events.ts`
- Event payload types must be immutable and serializable

**Contract Boundaries:**
- Mechanics cannot edit `src/engine/`, `src/contracts/`, or `src/main.ts`
- Need a new contract type? Add `// TODO: add to contracts` comment in mechanic README.md
- Engine agent handles all contract and core engine changes

**State Management:**
- Each mechanic manages its own slice of GameState
- State shape defined in `src/contracts/state.ts`
- Immutability enforced — never mutate shared state directly
- StateStore provides read-only access to other mechanics' state

### Testing Rules

**Test Organization & Requirements:**
- Tests live in `src/mechanics/<name>/<name>.test.ts` (colocated with code, not separate tree)
- Cross-mechanic integration tests live in `tests/integration/`
- Every exported function from `index.ts` must have at least one test
- Test environment: jsdom (browser simulation)

**Mock Usage:**
- Tests MUST mock EventBus — never use real instances
- Tests MUST mock StateStore — never use real instances
- Create test doubles for dependencies, inject them into functions
- Use Vitest's `vi.fn()` for spies and mocks

**Test Coverage Requirements:**
- Public API functions: 100% test coverage required
- Internal utility functions: minimum 80% coverage
- Integration tests verify cross-mechanic event communication works
- Run tests with `npm test` (Vitest watch mode)

**What NOT to Do in Tests:**
- Do not create real EventBus or StateStore instances
- Do not test without mocking external dependencies
- Do not skip type checking — tests also run through TypeScript strict mode
- Do not hardcode timeouts or rely on execution order between tests

### Code Quality & Style Rules

**File Naming Conventions:**
- Classes: PascalCase (`HexGrid.ts`, `EventBus.ts`, `AIController.ts`)
- Modules/utilities: camelCase (`types.ts`, `index.ts`, `helpers.ts`)
- Test files: `<name>.test.ts` suffix (colocated with implementation)

**Type and Interface Conventions:**
- Use `interface` for object shapes (public API contracts)
- Use `type` for unions, aliases, and discriminated types
- Prefix generic types with context: `MapState`, `MilitaryEvent`, `DiplomacyData`
- Readonly arrays in public APIs: `readonly T[]` not `T[]`

**Code Organization:**
- One responsibility per file — keep files focused
- Group related exports in `index.ts`
- Private implementation details in separate internal files
- No "catch-all" utility files — domain-specific helpers belong in their mechanic

**Documentation Requirements:**
- Every mechanic README.md must have: Purpose, Public API, Events Emitted/Consumed, State Slice, Design Notes
- Update README.md in same commit as code changes — outdated README is a bug
- Minimal inline comments — focus on WHY, not WHAT (code names should be clear)
- Only comment non-obvious behavior or workarounds

**Type Checking:**
- Run `npm run typecheck` before committing — zero TS errors required
- Build command includes type check: `npm run build` fails if types don't pass

### Critical Don't-Miss Rules

**Absolute Prohibitions (Breaking Isolation):**
- ❌ NEVER import from `src/mechanics/<other>/` — use events instead
- ❌ NEVER edit `src/engine/`, `src/contracts/`, `src/main.ts` — mechanic agents don't touch these
- ❌ NEVER use `any` type — TypeScript strict mode will fail
- ❌ NEVER export default — always use named exports
- ❌ NEVER use `window`, `document`, `canvas` in logic files (only in renderers)
- ❌ NEVER mutate state directly — enforce immutability in all contracts

**Event Communication Gotchas:**
- Event handlers execute synchronously — design for it
- Circular event chains can hang the game loop — break cycles with event debouncing
- Event payload must be serializable (no functions, circular refs)
- Subscribe early (in init/constructor) — late subscriptions miss historical events

**Build & Deployment:**
- Type check MUST pass before build: `npm run typecheck` or build fails
- Tests MUST pass before deploying — integration tests catch mechanic conflicts
- Never bypass hooks: no `--no-verify` or `--no-gpg-sign`
- Force push to main is forbidden — use proper git workflow

**Performance Gotchas:**
- Do not subscribe to events in loops — batch subscriptions at init time
- StateStore reads are synchronous — keep queries fast
- Canvas rendering (map, UI) must be in renderer, not state updates
- Avoid creating new event payloads in hot paths

**Common Mistakes to Avoid:**
- Publishing internal types in `index.ts` — keep `types.ts` private
- Using relative imports for cross-mechanic code — won't work after refactoring
- Forgetting to update mechanic README.md with each commit
- Testing real EventBus instead of mocks — defeats isolation testing

---

## Usage Guidelines

**For AI Agents:**

- Read this file completely before implementing any code in this project
- Follow ALL rules exactly as documented — they prevent silent failures and isolation breaks
- When in doubt about a pattern, prefer the more restrictive option (isolation over convenience)
- Reference this file when proposing changes to shared contracts or architecture
- Update this file if new patterns emerge during implementation (notify team)

**For Humans:**

- Keep this file lean and focused on agent implementation needs
- Update when technology stack versions change (especially TypeScript, Vite, Vitest)
- Review quarterly for outdated rules that agents no longer need to be reminded of
- Remove rules that become obvious over time as project matures
- Add rules when you notice agents making repeated mistakes

**Integration with CLAUDE.md:**

- This file complements `CLAUDE.md` (project instructions file)
- CLAUDE.md is the authoritative guide; this file highlights the most critical LLM-relevant rules
- AI agents should read both files before implementing

**Last Updated:** 2026-04-18
