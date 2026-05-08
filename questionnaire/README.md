# questionnaire

Interactive questionnaire tool for PI coding agent. Supports single and multiple questions with single-select and multi-select modes.

## Usage

Register as a tool — the AI calls `questionnaire` with a list of questions:

```json
{
  "questions": [
    {
      "id": "framework",
      "label": "Framework",
      "prompt": "Which framework do you prefer?",
      "options": [
        { "value": "react", "label": "React" },
        { "value": "vue", "label": "Vue" },
        { "value": "svelte", "label": "Svelte" }
      ]
    },
    {
      "id": "features",
      "label": "Features",
      "prompt": "Which features do you need?",
      "multiSelect": true,
      "options": [
        { "value": "auth", "label": "Authentication" },
        { "value": "db", "label": "Database" },
        { "value": "api", "label": "API layer" }
      ]
    }
  ]
}
```

## Parameters

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `id` | string | required | Unique identifier |
| `label` | string | `Q1`, `Q2`... | Short tab label (multi-question mode) |
| `prompt` | string | required | Full question text |
| `options` | array | required | Available choices |
| `allowOther` | boolean | `true` | Show "Type something" option |
| `multiSelect` | boolean | `false` | Allow multiple selections |

## Modes

- **Single question**: Simple vertical option list. Enter selects and advances immediately.
- **Multiple questions**: Tab bar navigation between questions + Submit tab. All questions must be answered before submitting.

### Single-select (default)

- ↑↓ navigate, Enter select, Esc cancel

### Multi-select (`multiSelect: true`)

- ↑↓ navigate, Space toggle (☑/☐), Enter confirm selection, Esc cancel

### Custom input (`allowOther: true`)

Both modes support a "Type something." option that opens an inline text editor. In multi-select mode, custom inputs accumulate and are displayed with a `→` prefix.

## Architecture

Single-file extension (`index.ts`) built with `@earendil-works/pi-tui`:

- **State machine**: `handleInput()` routes key events based on `inputMode`, `currentTab`, and `multiSelect` flags
- **Rendering**: `render()` produces styled text lines using `theme.fg()`/`theme.bg()`
- **Editor**: Uses `Editor` component from pi-tui for custom text input with autocomplete
- **Result**: Returns `QuestionnaireResult` with `answers[]` and `cancelled` flag

### Key data structures

```
Question → { id, prompt, options[], allowOther, multiSelect }
Answer   → { id, value, label, wasCustom, index?, selections? }
```

Multi-select answers include a `selections[]` array instead of a single `value`.

## Testing

TUI-heavy code — exempt from unit testing per project conventions.
