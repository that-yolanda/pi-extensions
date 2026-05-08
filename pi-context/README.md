# pi-context

Context window usage visualization command for PI coding agent. Shows a token grid with category breakdown.

## Usage

Run `/context` in PI to display the overlay. Press any key to close.

## Architecture

Registers a single command `context` via `pi.registerCommand()`.

### Token estimation

Uses a simple `length / 4` heuristic to estimate token counts. The raw estimates are then scaled by a ratio (`totalActual / totalRaw`) to match the actual token count reported by the agent.

### Visualization

- **Token grid**: 10×5 block grid where each block represents a proportional share of the context window
- **Category breakdown**: Shows system prompt, tool definitions, tool calls, messages, available space, and auto-compact reserve
- **Colors**: Each category has a fixed color (`muted`, `warning`, `accent`, `dim`, `text`)

### Key functions

- `getReserveTokens(cwd)` — reads `reserveTokens` from `.pi/settings.json` or `~/.pi/agent/settings.json`
- `formatTokens(n)` — formats token counts as `N/A`, `1k`, `1.5M` (in `utils.ts`)

## Testing

Tests for `formatTokens` are in `__tests__/utils.test.ts`.

```bash
cd pi-context && pnpm test
```
