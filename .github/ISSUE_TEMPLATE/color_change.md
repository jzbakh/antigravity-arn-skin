---
name: Color change proposal
about: Suggest changing one or more colors in an ARN theme
title: 'Color: <theme> — <short description>'
labels: colors
assignees: jzbakh
---

## Summary

Briefly describe the change you are proposing and why.

## Proposed changes

Fill in one row per modified key. Use the exact theme label (as shown in
`Preferences → Color Theme`) and the exact VSCode color key.

| Theme | Key | Current value | Proposed value |
| :--- | :--- | :--- | :--- |
| Arn · Mars — Amber Storm | `editor.background` | `#1a0f08` | `#1d1109` |
| Arn · Mars — Amber Storm | `editor.foreground` | `#f0d2a0` | `#f5d8a5` |
| <!-- add more rows as needed --> | | | |

> Tip: theme files live under [`themes/`](../../themes). Open the JSON for
> the relevant theme to look up the current value of any key.

## Before / After screenshots

Attach **at least one** before screenshot and **one** after screenshot.

A single before/after pair may cover multiple keys at once, but every key
listed in the table above MUST be visible in both the before and the after
capture. If a key only shows up under a specific condition (e.g. a hover
state, an active tab, an error squiggle), include a capture that triggers
that condition.

### Before
<!-- Drag and drop your before screenshot(s) here -->

### After
<!-- Drag and drop your after screenshot(s) here -->

## Affected languages or surfaces

List the file types or UI surfaces where the change is most visible
(e.g. JavaScript syntax, side bar, terminal, Chat panel).

## Contrast check (text-on-surface changes only)

When the change involves text against a surface, paste the foreground /
background contrast ratio from a tool such as
[WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/).

| Foreground | Background | Ratio | Pass / Fail |
| :--- | :--- | :--- | :--- |
| `#f5d8a5` | `#1d1109` | 11.2:1 | AAA |

## Additional context

Anything else that helps the review (palette references, links to
discussions, related issues).

## Pre-flight

- [ ] I have searched the existing issues and this is not a duplicate.
- [ ] The before / after screenshots show every key listed in the table.
- [ ] I have not bundled unrelated colour changes into this proposal.
