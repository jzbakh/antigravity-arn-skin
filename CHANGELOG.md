# Changelog

All notable changes to ARN-Skin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] — 2026-05-10

### Added

- CI auto-publishes the `.vsix` to VS Marketplace + Open VSX on release,
  with a tag/version pre-flight and unit-test gate. Requires `VSCE_PUBLISH`
  and `OPEN_VSX` repo secrets.
- Marketplace stats badges are now self-hosted on an orphan `badges`
  branch, refreshed every 6h. Replaces the deprecated
  `vsmarketplacebadges.dev` endpoints used at v1.0.0.
- README — "five smart toggles" section in EN/FR/CN/ES/AR/TH.
- `SECURITY.md` describing the GitHub Private Security Advisory flow.

### Security

- Override `serialize-javascript` to `^7.0.5` in `test/package.json`.
  Closes Dependabot alerts: high-severity RCE (incomplete fix for
  CVE-2020-7660) and moderate-severity DoS (CVE-2026-34043). devDep
  only — never bundled in the `.vsix`.

### Notes

- No runtime change in `extension.js`, no theme JSON change. v1.0.1 is
  functionally identical to v1.0.0 for end users.

## [1.0.0] — 2026-05-09

First public release.

### Themes

- Seven space-themed colour palettes:
  - **Spaceport** · *Tungsten Grid* — industrial charcoal grey with golden accents
  - **Nebula** · *Amethyst Void* — violet, magenta and cyan cosmos
  - **Neptune** · *Glacial Navy* — teal ocean ice
  - **Uranus** · *Glacial Teal* — teal and ultramarine variant
  - **Io** · *Acid Haze* — neon lime green on deep black
  - **Jupiter** · *Amber Light* — light parchment (the only light theme)
  - **Mars** · *Amber Storm* — burnt orange on red earth

### Customisation

- **Quick Customization** — edit 12 base colours and 5 toggles; the extension
  derives every other workbench colour automatically.
- **Advanced: UI Colors** — full JSONC editor for every workbench key, with
  IntelliSense from a bundled JSON Schema (~480+ keys).
- **Advanced: Syntax Colors** — semantic-token and TextMate-rule editor with
  the gutter colour picker active on every entry.
- **Reset** — revert all customisation for the active theme in one action.
- Real-time apply pipeline (400 ms debounced).
- The `Skin` status-bar item shows whether the active theme is customised
  and acts as the entry point for every action.

### Compatibility

- Antigravity IDE, VSCode, Cursor, VSCodium, Windsurf and any other
  VSCode-based editor that supports the Marketplace or Open VSX.
- Requires VSCode `^1.95.0` (for `chat.linesAddedForeground` and the rest
  of the `chat.*` surface keys).

### Engineering

- Zero runtime dependencies — single-file JavaScript extension.
- 448 automated tests (328 unit + 120 integration) running on Linux,
  macOS and Windows in CI, plus a weekly Insiders cron job.
- GPL-3.0-or-later licensed.

[1.0.1]: https://github.com/jzbakh/antigravity-arn-skin/releases/tag/v1.0.1
[1.0.0]: https://github.com/jzbakh/antigravity-arn-skin/releases/tag/v1.0.0
