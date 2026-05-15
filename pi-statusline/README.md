# pi-statusline

Persistent status footer for PI coding agent. Displays a 2-line capsule-style status bar using Powerline separators with a cycling orange → yellow → aqua → blue → bg2 → bg3 color palette.

<img src="https://raw.githubusercontent.com/that-yolanda/pi-extensions/main/pi-statusline/assets/screenshot.png" alt="pi-statusline screenshot" width="600">

## Display

```
 provider/model   thinking   main  + 42 - 7  ~/Code/03-pi
 200k  ↑ 89k → 12k / 77k 64%  ↓ 8k  ▓▓▓▓▓▓░░░░ 54.8% free
```

Each segment is a colored pill with Powerline separators. Colors cycle through orange, yellow, aqua, blue, bg2, bg3.

### Line 1 — Session info

| Segment | Source | Example |
|---------|--------|---------|
| Model name | `ctx.model.id` (with provider prefix) | `anthropic/claude-opus-4-7` |
| Thinking level | `thinking_level_select` event | `high` |
| Git branch | `footerData.getGitBranch()` | `main` |
| Code changes | `git diff --shortstat HEAD` | `+ 42 - 7` |
| Current path | `ctx.cwd` (shortened) | `~/Code/03-pi` |

### Line 2 — Context + token usage

| Segment | Description |
|---------|-------------|
| Context window | Total context window size |
| Input breakdown | Total input → cache miss / cache hit (hit rate %) |
| Output | Total output tokens |
| Available bar | `█`/`░` bar (used in bg2, free in bg1 on bg3 background) with remaining % free |

## Architecture

Uses `ctx.ui.setFooter()` to register a persistent 2-line footer component. Renders with raw ANSI 24-bit escape codes (no dependency on PI theme colors).

State is cached in a closure and refreshed on lifecycle events:

- `session_start` — initial setup: model, provider, context/git/usage data
- `model_select` — model and provider update
- `thinking_level_select` — thinking level from dedicated event
- `turn_start` / `turn_end` — context usage, git stats, and token metrics
- `footerData.onBranchChange()` — git branch updates

### Key functions

- `buildPill(segments)` — renders capsule segments with Powerline open/body/arrow/close
- `segColor(idx)` — returns cycling color from orange → yellow → aqua → blue → bg2 → bg3
- `collectGitStats(cwd)` — parses `git diff --shortstat HEAD` for insertion/deletion counts
- `refreshUsage(ctx)` — aggregates `input`, `output`, `cacheRead`, `cacheWrite` from conversation branch
- `buildLines(width, state)` — renders both footer lines

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
