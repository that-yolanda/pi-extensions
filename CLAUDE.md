# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal collection of PI (coding agent) extensions. Each extension is a self-contained directory exporting a default function that receives `ExtensionAPI` and registers tools, commands, or hooks.

**Repository:** https://github.com/that-yolanda/pi-extensions.git

## Extensions

| Directory | Type | Description |
|-----------|------|-------------|
| `questionnaire/` | Tool (`questionnaire`) | Interactive single/multi-question UI with single-select and multi-select support |
| `pi-context/` | Command (`context`) | Visualizes context window usage with a token grid and category breakdown |
| `pi-memory-honcho/` | Tools + Commands | Honcho-backed persistent memory with dialectic reasoning, credential sanitization, cross-workspace sharing (forked from [acsezen](https://github.com/acsezen/pi-memory-honcho)) |
| `pi-statusline/` | Footer | Persistent 2-line capsule-style status bar with model, git branch, code changes, and context usage |

> **Before modifying any extension**, read its `README.md` for architecture details and design decisions. Each extension has its own documentation to avoid polluting this file with implementation specifics.

### Extension Structure Conventions

- Each extension lives in its own directory with `index.ts` as the entry point
- Extensions may optionally have their own `package.json`, `tsconfig.json`, and `__tests__/`
- All extensions export `export default function(pi: ExtensionAPI)`

## Commands

```bash
# Lint & format (all files, project root)
biome check .
biome check --fix --unsafe .   # auto-fix lint + format

# Type checking (per extension with tsconfig)
cd pi-memory-honcho && pnpm typecheck

# Tests (each extension with tests has its own vitest)
cd pi-memory-honcho && pnpm test
cd pi-memory-honcho && pnpm test -- extensions/__tests__/pure.test.ts  # single test file
cd pi-context && pnpm test
```

## Code Style

- **Tab indentation** enforced by `biome.json`
- **Node.js imports** use `node:` protocol (e.g. `node:fs`, `node:path`, `node:os`)
- **PI framework** imports use `@earendil-works/*` scope (not `@mariozechner/*`)
- Import specifiers sorted alphabetically by biome
- Type-only imports use `import type` syntax
- All code comments in English

## Code Quality

- **Biome** is configured at repo root (`biome.json`) for all linting and formatting
- After any code change, run `biome check --fix --unsafe .` before committing
- Fix all errors reported by Biome — warnings are acceptable
- TypeScript strict mode is enabled — ensure type safety in all new code

## PI Extension API

Extensions register capabilities via `pi.registerTool()` or `pi.registerCommand()`:

- **Tools**: `execute()` (returns result), `renderCall()` (shows invocation), `renderResult()` (shows output). Interactive TUI via `ctx.ui.custom()` with `render()`, `handleInput()`, `invalidate()` lifecycle.
- **Commands**: `handler()` for overlay UIs (`ctx.ui.custom()`) or simple prompts (`ctx.ui.input()`).
- **TUI**: Uses `@earendil-works/pi-tui` components. Theme: `theme.fg(color, text)`, `theme.bg(color, text)`.

## Testing

- Test files go in `<extension>/__tests__/<module>.test.ts`
- Use vitest (`describe`/`test`/`expect`)
- Only test pure logic functions — TUI-heavy code is exempt
- Test edge cases and boundary conditions
- Tests must not depend on external services or network
- New pure utility functions must have corresponding tests

## Code Commit Convention

- Conventional Commit prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`
- Include module scope: `feat(questionnaire): add multi-select support`
- Body explains **why**, not **what**
- Avoid vague descriptions: "improve performance", "optimize code", "fix issue"
