# Phase 3 — Movements Full Integrity: Root Cause Audit

Generated: 2026-06-28  
Status: **CLOSED** (`phaseClosed: true`)

## Browser verification gap (reopened and closed)

| Finding | Detail |
|---------|--------|
| RC-B1 | Initial browser script used `draftVisible \|\| postedVisible` as pass condition |
| RC-B2 | Post step never completed in headless run (`postedVisible: false`) |
| RC-B3 | Ledger/history not asserted (`historyLinkPresent: false`) |
| RC-B4 | Wrong nz-select index selected source location as movement type → create 422 |

**Fix:** Strict browser script (`phase3-browser-strict-v1`) with 12 mandatory steps, seeded fixture actor, confirmation modal handling, list search by document number, ledger card + API exact match.

**Result:** `PHASE_3_BROWSER_RESULTS.json` — `pass: true`, all steps true, ledger `referenceId` = doc ID, qtyIn=3, totalValue=15.

## Backend/runtime remediations (prior reopen — accepted)

| ID | Defect | Fix |
|----|--------|-----|
| RC-3.1 | Skipped foreign fixture PASS | Seeded foreign tenant doc; exact 404 |
| RC-3.2 | Register read not assignment-scoped | `assignmentOnly` scope on list/detail |
| RC-3.3 | Breakage/Lost missing assignment guard | `assertActiveAssignmentForMutation` |
| RC-3.4 | Incomplete ADJUSTMENT negatives | Full negative matrix in gate |
| RC-3.5 | No atomicity tests | `posting.service.test.js` rollback seams |

## Evidence index

- Runtime: `PHASE_3_RUNTIME_RESULTS.json` (35 runtime, 20 regression)
- Browser strict: `PHASE_3_BROWSER_RESULTS.json`
- Gate: `phase-3-movements-integrity-gate.cjs` + `phase-3-movement-register-browser.cjs`
