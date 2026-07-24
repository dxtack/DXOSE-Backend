# Contrast QA Checklist (Ch.28.1)

Release gate spot-check for primary controls against agreed WCAG 2.1 AA targets (4.5:1 normal text, 3:1 large text/UI components).

## Scope

- Primary action buttons (`nz-button[nzType="primary"]`)
- Form labels on white/near-white surfaces
- Error banners (`nz-alert[nzType="error"]`)
- Navigation active item in main sidebar

## Procedure

1. Open each governed screen in staging with default theme.
2. Sample foreground/background with browser devtools or contrast checker.
3. Record pass/fail in release notes; block release if any primary control fails.

## Evidence

Governance verification artifact — not an automated CI suite.
