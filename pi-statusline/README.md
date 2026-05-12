# pi-statusline

Persistent status footer for PI coding agent. Displays a 2-line capsule-style status bar using Gruvbox Dark palette and Powerline separators, inspired by [Starship](https://starship.rs/) prompt.

<img src="assets/screenshot.png" alt="pi-statusline screenshot" width="600">

## Display

```
 model   thinking   main  +42 -7  ~/Code/03-pi
 45.2% ▓▓▓▓▓▓░░░░  89.2k/200k · 54.8% free
```

Each segment is a colored pill with Powerline ` ` / ` ` separators transitioning between segment colors.

### Line 1 — Session info

| Segment | Source | Capsule color |
|---------|--------|--------------|
| Model name | `ctx.model.id` | `orange` (#d65d0e) |
| Thinking level | Model config | `purple` (#b16286) |
| Git branch | `footerData.getGitBranch()` | `aqua` (#689d6a) |
| Code changes (+/-) | `git diff --shortstat HEAD` | `blue` (#458588) |
| Current path | `ctx.cwd` | `yellow` (#d79921) |

### Line 2 — Context usage

Progress bar capsule with usage-level color (< 50% green, 50–80% yellow, > 80% red). Token count and remaining percentage in `bg3` (#665c54) capsules.

## Architecture

Uses `ctx.ui.setFooter()` to register a persistent 2-line footer component. Renders with raw ANSI 24-bit escape codes (no dependency on PI theme colors), using the Gruvbox Dark palette for consistent appearance.

State is cached in a closure and refreshed on lifecycle events:

- `session_start` — initial setup, first context/git read
- `model_select` — model name and thinking level
- `turn_start` / `turn_end` — context usage and git stats
- `footerData.onBranchChange()` — git branch updates

Adjacent same-color capsules are merged with ` · ` separator to avoid redundant Powerline transitions.

### Key functions

- `buildPill(segments)` — renders capsule segments with Powerline open/body/arrow/close
- `mergeSegments(segments)` — merges adjacent same-color segments
- `collectGitStats(cwd)` — parses `git diff --shortstat HEAD` for insertion/deletion counts
- `buildLines(width, state)` — renders both footer lines

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
