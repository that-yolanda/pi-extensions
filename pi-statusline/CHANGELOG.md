# Changelog

## 0.2.2 (2026-05-16)

- Extract color roles into THEME config object for easier customization
- Merge git branch and change stats into a single capsule segment
- Consolidate token stats into one compact segment (in/out/cached/hit%)
- Shorten long paths to last 3 segments with ~/.../ prefix
- Update screenshot

## 0.2.1 (2026-05-15)

- Use absolute GitHub raw URLs for images in README
- Add `bugs` field to package.json

## 0.2.0 (2026-05-15)

- Redesign segment colors: cycle through orange → yellow → green → blue instead of fixed per-segment colors
- Show `provider/model` format when provider is available
- Add token usage display: input (miss + cache hit rate), output on line 2
- Add `thinking_level_select` event handler for real-time thinking level updates
- Add `refreshUsage()` to aggregate session-wide token metrics from conversation branch
- Remove `mergeSegments()` and `extractThinking()` functions
- Replace literal Powerline chars with Unicode escape sequences
- Add `pi.extensions` entry point config to package.json

## 0.1.2 (2026-05-12)

- Add screenshot to README
- Update install command to use `@that-yolanda` npm scope

## 0.1.1 (2026-05-12)

- Set up GitHub Actions OIDC trusted publishing

## 0.1.0 (2026-05-12)

- Initial release: persistent 2-line capsule-style status footer
- Model name, thinking level, git branch, code changes, working directory, context usage
- Powerline separators with Gruvbox Dark palette
