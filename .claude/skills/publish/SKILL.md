---
name: publish
description: 发布 pi-extensions 包到 npm。分析变更、生成 changelog、更新版本、触发 CI 发布。当用户说"发布"、"publish"、"release"、"新版本"时触发。
---

# Publish

pi-extensions 项目的发布流程。将指定包发布到 npm（通过 GitHub Actions OIDC trusted publisher）。

## User Input Tools

When this skill prompts the user, follow this tool-selection rule (priority order):

1. **Prefer built-in user-input tools** exposed by the current agent runtime — e.g., `AskUserQuestion`, `request_user_input`, `clarify`, `ask_user`, or any equivalent.
2. **Fallback**: if no such tool exists, emit a numbered plain-text message and ask the user to reply with the chosen number/answer for each question.
3. **Batching**: if the tool supports multiple questions per call, combine all applicable questions into a single call; if only single-question, ask them one at a time in priority order.

## Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview changes without executing |

## Packages

| Directory | npm name |
|-----------|----------|
| `pi-context` | `@that-yolanda/pi-context` |
| `pi-memory-honcho` | `@that-yolanda/pi-memory-honcho` |
| `pi-questionnaire` | `@that-yolanda/pi-questionnaire` |
| `pi-statusline` | `@that-yolanda/pi-statusline` |

## File Locations

| Item | Path |
|------|------|
| Version | `<package>/package.json` → `version` |
| Changelog | `<package>/CHANGELOG.md` |
| Publish script | `scripts/publish.mjs` |
| CI workflow | `.github/workflows/publish.yml` |

## Workflow

### Step 1: Pre-flight Checks

```bash
# Must be on main
git branch --show-current

# Must be clean (or only staged changes)
git status --porcelain

# Current version of target package
cat <package>/package.json | grep version
```

If not on main or dirty working tree, stop and ask user to resolve first.

### Step 2: Analyze Changes

Collect commits since last version bump for the target package:

```bash
# Find the last publish commit for this package
git log --oneline --grep="chore(<package>):" | head -1

# If found, show commits since then
git log <last-commit>..HEAD --oneline -- <package>/

# If not found, show all commits touching this package
git log --oneline -- <package>/
```

### Step 3: Determine Version Bump

Ask user which package to publish and what version bump:

1. **Package** (single select): pi-context, pi-memory-honcho, pi-questionnaire, pi-statusline
2. **Version bump** (single select): patch, minor, major

Rules (suggestion, user decides):
- `feat:` commits → minor
- `fix:` / `docs:` / `refactor:` commits → patch
- Breaking changes → major

Display: `<current> → <next>`

### Step 4: Generate Changelog

Analyze commits and write a changelog entry for `<package>/CHANGELOG.md`.

**Format**:
```markdown
## X.Y.Z (YYYY-MM-DD)

### Features
- Description of new feature

### Fixes
- Description of fix

### Docs
- Description of doc change
```

Only include sections with changes. Omit empty sections.

Insert at the top of the file (after the `# Changelog` header). Preserve existing content.

If `CHANGELOG.md` doesn't exist, create it with the header first:

```markdown
# Changelog

## X.Y.Z (YYYY-MM-DD)
...
```

### Step 5: Update Version

```bash
# Bump version in package.json (no git tag)
npm version <patch|minor|major> --no-git-tag-version
```

Verify the new version is correct.

### Step 6: User Confirmation

Before committing, show preview and ask for confirmation:

**Preview output**:
```
Package: @that-yolanda/pi-context
Version: 0.1.1 → 0.2.0

Changelog:
  ### Features
  - Add real-time token count refresh on turn events

Files changed:
  - pi-context/package.json
  - pi-context/CHANGELOG.md
```

Ask user to confirm (single select):
- "Yes, commit and publish"
- "No, cancel"

### Step 7: Commit and Publish

```bash
# Stage release files
git add <package>/package.json <package>/CHANGELOG.md

# Create release commit
git commit -m "chore(<package>): publish <version>"

# Push to main
git push origin main

# Trigger CI workflow
gh workflow run publish.yml -f package='@that-yolanda/<package>'
```

**Note**: Do NOT add Co-Authored-By line. This is a release commit, not a code contribution.

### Step 8: Report Result

```
Published @that-yolanda/pi-context@0.2.0

Commit: abc1234 chore(pi-context): publish 0.2.0
CI: https://github.com/that-yolanda/pi-extensions/actions

Files changed:
  - pi-context/package.json (0.1.1 → 0.2.0)
  - pi-context/CHANGELOG.md
```

## Example Usage

```
/publish                    # Interactive: ask which package and version
/publish pi-context         # Publish pi-context, ask version
/publish pi-context patch   # Publish pi-context with patch bump
/publish pi-context --dry-run  # Preview only
```

## When to Use

Trigger when user says:
- "publish", "发布", "release"
- "发布新版本", "bump version"
- "publish pi-context"
