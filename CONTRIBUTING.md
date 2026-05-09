# Contributing to ARN-Skin

Thanks for taking the time to contribute. This document explains how to file
useful reports, propose changes, and run the test suite locally.

ARN-Skin ships seven curated space-themed colour palettes plus a real-time
customisation panel for VSCode-family editors (Antigravity IDE, VSCode,
Cursor, VSCodium, Windsurf, ...). Quality and visual consistency are the
top priorities, so every contribution is reviewed against that bar.

---

## Table of contents

- [Reporting bugs](#reporting-bugs)
- [Requesting features](#requesting-features)
- [Proposing colour changes](#proposing-colour-changes)
- [Development setup](#development-setup)
- [Running the tests](#running-the-tests)
- [Code style](#code-style)
- [Pull request checklist](#pull-request-checklist)
- [Project layout](#project-layout)
- [License](#license)

---

## Reporting bugs

Open a new issue using the **Bug report** template — it covers everything
the maintainer needs (theme label, editor, OS, repro steps, screenshot).

Before submitting, please:

1. Make sure you are running the latest published version.
2. Search the [existing issues](https://github.com/jzbakh/antigravity-arn-skin/issues)
   to confirm the bug has not already been reported.
3. Reproduce the problem with all other extensions disabled, so we can rule
   out interference.

## Requesting features

Open a new issue using the **Feature request** template. Explain *why* the
feature would help — concrete examples are much more useful than abstract
suggestions. The extension stays intentionally focused, so not every
request will land, but every well-described request gets a thoughtful
answer.

## Proposing colour changes

Colour proposals are always welcome. Each palette has been tuned with
care, but no review is exhaustive — if a colour feels off to your eyes,
or a contrast could be stronger on a particular language or surface,
please share your thoughts. The structured form below exists to keep the
discussion focused, not to gate-keep: fill in the parts you can, and the
maintainer is happy to help refine the rest during review.

Open a new issue using the **Color change proposal** template. The template
asks for:

- A table listing every modified theme + key + current/proposed value.
- Before / after screenshots that show every modified key. One pair of
  screenshots can cover several keys at once, but every key in the table
  must be visible in both captures.
- A WCAG contrast ratio for any text-on-surface change.

Please do not bundle unrelated colour changes in the same proposal —
keeping each issue focused on a single visual concern makes review and
discussion much easier.

## Development setup

```bash
git clone https://github.com/jzbakh/antigravity-arn-skin.git
cd antigravity-arn-skin
cd test && npm ci
```

The extension itself has zero runtime dependencies — only the test harness
under `test/` pulls a few devDependencies (Mocha, vscode-test).

To launch a development host:

1. Open the repository in VSCode.
2. Press `F5` (Run → Start Debugging) — a new Extension Development Host
   window opens with ARN-Skin loaded.
3. Switch to one of the seven themes and try the `Skin` status-bar entry.

## Running the tests

The suite is split into two layers:

```bash
cd test
npm run test:unit         # 328 unit tests (pure helpers, no editor needed)
npm run test:integration  # 116 integration tests (boots a VSCode instance)
npm test                  # runs both
```

## Continuous integration

Every pull request is automatically validated by a four-stage GitHub
Actions pipeline ([`.github/workflows/tests.yml`](.github/workflows/tests.yml)):

1. **Validate** — fast structural checks: every JSON file parses, the
   manifest declares its required fields, and the schema is well-formed.
   Fails the pipeline early on obvious problems.
2. **Unit** — the 328 pure-helper Mocha tests, on Linux, macOS and Windows
   in parallel.
3. **Integration · stable** — the 116 vscode-test integration tests, on
   the same three OSes, against the latest VSCode stable.
4. **CI passed** — an aggregate gate that succeeds only when stages 1–3
   all succeed; this is the single status check that branch protection
   should require.

A separate weekly cron job (Mondays 08:00 UTC) re-runs the integration
suite against VSCode Insiders to catch regressions in upcoming editor
releases before they ship.

Pull requests are reviewed by the maintainer ([@jzbakh](https://github.com/jzbakh))
once CI is green; the [CODEOWNERS](.github/CODEOWNERS) file requests that
review automatically.

## Code style

- The extension is hand-written, dependency-free JavaScript. Keep it that
  way — no build step, no transpilation.
- Match the existing 4-space indentation.
- Prefer descriptive variable names over comments. Comments belong on
  *why* a particular approach was chosen, not on what the code does.
- Do not introduce TODO/FIXME markers; either fix the issue or open one.

## Pull request checklist

Before submitting:

- [ ] All tests pass locally (`npm test` inside `test/`).
- [ ] The change is focused on a single concern — no drive-by refactors.
- [ ] If you touched a theme JSON, the structural tests still pass
      (cross-theme consistency, hex validity, transparency contract).
- [ ] If you touched `extension.js`, you added or updated the relevant
      unit / integration tests.
- [ ] The PR description explains *why* the change is needed and includes
      before/after screenshots for any visual change.

## Project layout

```
antigravity-arn-skin/
├── extension.js              # All extension logic (single file, no deps)
├── package.json              # Marketplace manifest
├── themes/                   # 7 theme JSON files
├── schemas/
│   └── arn-advanced.schema.json   # JSON Schema for the Advanced UI editor
├── media/                    # Theme icons + marketing assets
├── test/
│   ├── unit/                 # Pure-helper Mocha tests
│   └── integration/          # vscode-test integration suite
├── .github/
│   ├── workflows/tests.yml         # CI pipeline (validate → unit → integration)
│   ├── ISSUE_TEMPLATE/             # Bug, feature, colour-change templates
│   ├── pull_request_template.md    # PR template
│   └── CODEOWNERS                  # Auto-request review from the maintainer
├── CONTRIBUTING.md           # This file
├── CODE_OF_CONDUCT.md
├── LICENSE                   # GPL-3.0-or-later
└── README.md                 # User-facing documentation (multi-language)
```

## License

By contributing to ARN-Skin you agree that your contributions are licensed
under the [GNU General Public License v3.0 or later](LICENSE), the same
licence that covers the rest of the project.
