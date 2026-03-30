# CLAUDE.md — Grand-strategy

This file orients AI assistants (Claude Code and similar tools) working in this repository.

---

## Project Overview

**Name:** Grand-strategy
**Status:** Greenfield — no source code exists yet. Only a placeholder `README.md` is present.
**Purpose:** Not yet defined in code or documentation. Before writing any code, confirm the project's goals and intended tech stack with the repository owner.

---

## Repository Structure

Current layout (as of initial commit):

```
Grand-strategy/
├── CLAUDE.md        ← this file
└── README.md        ← placeholder title only
```

As the project grows, expected top-level directories include (confirm with owner):

```
Grand-strategy/
├── src/             ← application source code
├── tests/           ← test files mirroring src/ structure
├── docs/            ← design documents, ADRs
├── CLAUDE.md
└── README.md
```

---

## Git Workflow

- **Primary branch:** `main`
- **Feature branches:** `<type>/<short-description>` (e.g., `feat/map-renderer`, `fix/turn-order-bug`)
- **Commit signing:** Enabled (SSH key). Do not bypass signing (`--no-gpg-sign`).
- **Push command:** Always use `git push -u origin <branch-name>` on first push.
- **No force pushes** to `main` without explicit owner approval.
- Keep commits atomic — one logical change per commit.

---

## Development Setup

No tech stack has been selected. Before scaffolding any project structure:

1. Ask the repository owner which language/framework to use.
2. Create the appropriate config files (`package.json`, `pyproject.toml`, `Cargo.toml`, etc.).
3. Document the setup steps in `README.md`.

---

## Code Conventions

Until a stack is chosen and a linter/formatter is configured, follow these defaults:

- **Naming:** snake_case for files and variables in Python/Rust; camelCase for JS/TS variables, PascalCase for types/components.
- **Indentation:** 4 spaces (Python, Rust) or 2 spaces (JS/TS).
- **Line length:** 100 characters max.
- **No speculative abstractions** — write code for the task at hand, not hypothetical future needs.
- **No unused imports, variables, or dead code** — clean up as you go.

---

## Testing

No tests exist yet. When writing new code:

- Add tests alongside each new module or feature.
- Mirror the source structure under `tests/`.
- Prefer unit tests; add integration tests for cross-component behavior.
- All tests must pass before committing.

---

## AI Assistant Guidelines

Follow these when working in this repo as an AI assistant:

1. **Confirm before choosing a tech stack.** This repo has no language or framework yet — do not scaffold a project without owner approval.
2. **Read before editing.** Never modify a file without reading it first.
3. **Stay on the designated branch.** Check `git branch` before committing. Never push to `main` unless explicitly instructed.
4. **Keep commits signed and atomic.** One logical change per commit; do not use `--no-verify` or `--no-gpg-sign`.
5. **Do not add features beyond what was asked.** No extra helpers, utilities, or "nice to haves" unless requested.
6. **Do not create documentation files** (`.md`) unless explicitly asked.
7. **Update this file** when significant new conventions, dependencies, or workflows are established.
