# Phase 4 Root Cause Audit — Verification Reopen

**Generated:** 2026-06-28

## Why formal closure was rejected

The initial Phase 4 gate reported green (`phaseClosed: true`) but did not prove mandatory lifecycle cases:

1. **Skipped passes masquerading as success** — API scenarios used `skipped: true, pass: true` when GRN/Transfer/IC documents were absent.
2. **Vacuous timeline proof** — `Array.isArray(entries)` and empty arrays could pass.
3. **Wrong API envelope** — Timeline entries live at `response.data.timelineEntries`, not top-level; live API checks returned empty arrays silently.
4. **No controlled Send Back / Resubmit / Return flows** — No fixture executed submit → send back → resubmit with exact counts.
5. **Insufficient v3 GM proof** — Lookups allowed `hasGmStamp: false`; no requirement for `gmApprovedAt` + GM actor on pinned v3 chain.
6. **Loose browser assertions** — Title accepted via OR (`Approval timeline`, `WORKFLOW HISTORY`); actor check used OR not AND.

## Semantic label defects (confirmed via runtime + browser)

| Surface | Symptom | Root cause | Fix |
|---|---|---|---|
| Inventory Count | `Count submitted / Approved` | `MILESTONE_COMPLETED` default badge → `APPROVED` for all non-GRN stages | Map `COUNT_SUBMITTED` → `COMPLETED` |
| Inventory Count | Duplicate `Submitted` in UI text | Title + badge both translate to "Submitted" (expected UX); gate now counts role rows not raw text | Browser assertion uses DOM role labels |
| Inventory Count card | `WORKFLOW HISTORY` eyebrow above timeline | Legacy `RETURNS_WORKFLOW.WORKFLOW_HISTORY` eyebrow on IC detail | Removed eyebrow; h2 only |
| Get Pass return | Checkout/return badges generic | Missing stage-specific badge keys | `CHECKED_OUT`, `RETURNED` status i18n |

## GRN `Received & validated / Completed`

Runtime and browser confirm this is **semantically correct**: operational milestone completed, not approval. Badge `Completed` matches backend `MILESTONE_COMPLETED` + `RECEIVED_VALIDATED` stage.

## Fixture strategy

`phase-4-timeline-fixture-seed.cjs` on tenant `closeout-audit-hotel-disposable`:

- Seeds GRN (submit + cost/finance approval)
- Transfer (create/submit/approve/post chain)
- Breakage (submit/approve)
- Get Pass v4 send-back + resubmit (Finance send back, creator resubmit)
- Get Pass TEMPORARY full OUT + physical return
- Get Pass v3 GM (pin archived v3 before submit; approve through GM)
- Inventory Count posted (finance + GM approve via service layer)

Normalized snapshots stored in `PHASE_4_TIMELINE_FIXTURES.json` for exact-order gate comparison.
