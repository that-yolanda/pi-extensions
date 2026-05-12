<div align="center">

<h1>PI Extensions</h1>

Personal collection of extensions for the [PI coding agent](https://github.com/badlogic/pi-mono). Persistent memory, context visualization, interactive questionnaires, and a capsule-style status bar.

**[中文](README.zh.md)** | **[English](README.md)**

</div>

---

## Features

### pi-memory-honcho

Honcho-backed persistent memory with dialectic reasoning. Stores user preferences and facts across sessions, shares memory across linked AI tool workspaces, and injects context into the system prompt via configurable recall modes.

> Forked from [acsezen/pi-memory-honcho](https://github.com/acsezen/pi-memory-honcho).

### pi-context

Context window visualization via the `/context` command. Renders a token grid with category breakdown (system prompt, tool definitions, messages, available space, auto-compact reserve).

<img src="pi-context/assets/screenshot.gif" alt="pi-context screenshot" width="600">

### pi-questionnaire

Interactive single/multi-question UI tool. Supports single-select and multi-select modes with tab bar navigation, custom text input, and inline autocomplete.

### pi-statusline

Persistent 2-line capsule-style status footer inspired by [Starship](https://starship.rs/). Shows model name, thinking level, git branch, code changes, working directory, and context usage with Powerline separators using the Gruvbox Dark palette.

<img src="pi-statusline/assets/screenshot.png" alt="pi-statusline screenshot" width="600">

## Quick Start

Install extensions into PI:

```bash
pi install npm:@that-yolanda/pi-memory-honcho
pi install npm:@that-yolanda/pi-context
pi install npm:@that-yolanda/pi-questionnaire
pi install npm:@that-yolanda/pi-statusline
```

See each extension's README for specific setup instructions.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 10

### Setup

```bash
git clone https://github.com/that-yolanda/pi-extensions.git
cd pi-extensions
pnpm install
```

### Commands

```bash
# Lint & format
pnpm check
pnpm fix

# Run all tests
pnpm test

# Single extension
pnpm --filter pi-memory-honcho test
pnpm --filter pi-memory-honcho typecheck
```

## Reference

- [pi-memory-honcho README](pi-memory-honcho/README.md)
- [pi-context README](pi-context/README.md)
- [pi-statusline README](pi-statusline/README.md)
- [pi-questionnaire README](pi-questionnaire/README.md)

## License

[MIT](LICENSE)
