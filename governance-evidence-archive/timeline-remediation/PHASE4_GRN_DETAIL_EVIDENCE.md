# Phase 4 — GRN Detail Migration Evidence (15-Entry Remediation)

**Date:** 2026-06-26  
**Status:** **PASS — 15/15 API/DOM parity** — stopped before Phase 5  
**Scope:** GRN Detail unified `timelineEntries[]` consumption + mandatory 3-Send-Back fixture correction

---

## Executive Summary

| Area | Result |
|------|--------|
| GRN Detail wired to unified timeline path | **DONE** |
| Mandatory 3-Send-Back scenario | **15 entries** (was incorrectly reported as 12) |
| Root cause of 12 vs 15 | **Fixture gap** — Finance steps never recorded in cycles 1–3 |
| Builder / dedup / UI hiding | **Not the cause** (verified) |
| API ↔ DOM parity | **15/15** (1920 + 1366) |
| Unit tests | **46/46 PASS** (full frontend suite) |
| GRN builder tests | **3/3 PASS** |
| DB integration | **4/4 PASS** |
| API smoke | **11/11 checks PASS** |
| Playwright runtime | **PASS** |
| Frontend build | **PASS** |

**Fixture GRN:** `GRN-2026-00019` (`39230fd2-3076-40ae-b426-28dbe9ad40a7`)  
**Endpoint:** `GET /api/constitution/timeline/GRN/:id`

---

## 1. Root cause — why the first report showed 12 entries

The prior Phase 4 seed and DB integration fixture executed **Cost Control approve only** before each Send Back (from `PENDING_FINANCE`). Finance approval steps were never marked `APPROVED` in `approvalHistory`, so the builder correctly emitted only:

- 1 milestone
- 3× Cost Control completed
- 3× Send Back + 3× Resubmit
- Cycle 4 Current + Future

**Missing 3 entries:** Finance Approved for cycles 1, 2, and 3.

| Hypothesis | Verdict |
|------------|---------|
| Builder does not read all ApprovalSteps | **Rejected** — builder emits finance when step status is `APPROVED` |
| Dedup merged Cost/Finance across cycles | **Rejected** — dedup key is `sourceRef` (`approvalStepId` + `approvalRequestId`), unique per cycle |
| Duplicate `sourceRef` | **Rejected** — each cycle has distinct request/step IDs in fixture JSON |
| Approval history incomplete in DB | **Confirmed** — fixture never completed finance steps |
| Playwright fixture skipped Finance | **Confirmed** — same as seed (`approveCostOnly` pattern) |
| Timeline UI hid entries | **Rejected** — API itself returned 12 before fix |

### Fix applied

1. **`OSE-backend/scripts/lib/grn-timeline-fixture.helpers.js`** — shared helpers:
   - Resolve `COST_CONTROL` and `FINANCE_MANAGER` tenant members
   - `approveCostStep` via `approveGrn`
   - `completeFinanceStepWithoutPosting` — records finance step as `APPROVED` without posting (finance is the final GRN step; live `approveGrn` would POST and block Send Back)
2. **`seed-grn-phase4-timeline-fixtures.js`** — uses cost + finance completion per cycle 1–3
3. **`grn-timeline-db-integration.test.js`** — same pattern; asserts `entries.length === 15`
4. **`smoke-grn-detail-timeline-api.js`** — asserts 15 entries, 3 finance completed
5. **`verify-grn-detail-timeline-phase4.mjs`** — asserts 15 DOM rows + 3 finance titles

**Note:** Production Send Back occurs from `PENDING_FINANCE` before finance posts. The mandatory scenario requires finance-completed history entries; the fixture uses direct step completion to match builder contract without posting.

---

## 2. Expected vs actual — entry-by-entry comparison

| # | Expected | Actual API | Actual DOM | Match |
|---|----------|------------|------------|:-----:|
| 1 | Received & Validated — Completed | `MILESTONE_COMPLETED` / cycle 1 / `COMPLETED` | Received & validated | ✓ |
| 2 | Cost Control Approved — Cycle 1 | `APPROVAL_STEP_COMPLETED` / `COST_CONTROL` / cycle 1 | Cost control approved | ✓ |
| 3 | Finance Approved — Cycle 1 | `APPROVAL_STEP_COMPLETED` / `FINANCE` / cycle 1 | Finance approved | ✓ |
| 4 | Sent Back #1 | `LIFECYCLE_EVENT` / `SEND_BACK` / cycle 1 | Sent back for correction | ✓ |
| 5 | Resubmitted — Cycle 2 | `LIFECYCLE_EVENT` / `RESUBMIT` / cycle 2 | Resubmitted for approval | ✓ |
| 6 | Cost Control Approved — Cycle 2 | `APPROVAL_STEP_COMPLETED` / `COST_CONTROL` / cycle 2 | Cost control approved | ✓ |
| 7 | Finance Approved — Cycle 2 | `APPROVAL_STEP_COMPLETED` / `FINANCE` / cycle 2 | Finance approved | ✓ |
| 8 | Sent Back #2 | `LIFECYCLE_EVENT` / `SEND_BACK` / cycle 2 | Sent back for correction | ✓ |
| 9 | Resubmitted — Cycle 3 | `LIFECYCLE_EVENT` / `RESUBMIT` / cycle 3 | Resubmitted for approval | ✓ |
| 10 | Cost Control Approved — Cycle 3 | `APPROVAL_STEP_COMPLETED` / `COST_CONTROL` / cycle 3 | Cost control approved | ✓ |
| 11 | Finance Approved — Cycle 3 | `APPROVAL_STEP_COMPLETED` / `FINANCE` / cycle 3 | Finance approved | ✓ |
| 12 | Sent Back #3 | `LIFECYCLE_EVENT` / `SEND_BACK` / cycle 3 | Sent back for correction | ✓ |
| 13 | Resubmitted — Cycle 4 | `LIFECYCLE_EVENT` / `RESUBMIT` / cycle 4 | Resubmitted for approval | ✓ |
| 14 | Cost Control Approval — Cycle 4 / In Progress | `APPROVAL_STEP_CURRENT` / `COST_CONTROL` / `IN_PROGRESS` | Cost control approval | ✓ |
| 15 | Finance Approval — Cycle 4 / Pending | `APPROVAL_STEP_FUTURE` / `FINANCE` / `PENDING` | Finance approval | ✓ |

**Prior gap (12-entry report):** rows 3, 7, 11 (Finance Approved cycles 1–3) were absent from API and DOM.

---

## 3. Full API entry list (ordered)

Source: `backfill-reports/PHASE4_GRN_FIXTURES.json` + live smoke `2026-06-26T19:24`

| globalOrder | cycle | entryType | stageKey | displayTitleKey | status | actor | actedAt | lifecycleEventType | sourceRef |
|------------:|------:|-----------|----------|-----------------|--------|-------|---------|-------------------|-----------|
| 1 | 1 | MILESTONE_COMPLETED | RECEIVED_VALIDATED | TIMELINE.STAGE.RECEIVED_VALIDATED_COMPLETED | COMPLETED | Nadia Ibrahim | 2026-06-26T19:22:35.696Z | — | — |
| 2 | 1 | APPROVAL_STEP_COMPLETED | COST_CONTROL | TIMELINE.STAGE.COST_CONTROL_COMPLETED | COMPLETED | Nadia Ibrahim | 2026-06-26T19:22:36.000Z | — | `{approvalRequestId: 7c61fb1e…, approvalStepId: b3a3f590…}` |
| 3 | 1 | APPROVAL_STEP_COMPLETED | FINANCE | TIMELINE.STAGE.FINANCE_COMPLETED | COMPLETED | Youssef Karimi | 2026-06-26T19:22:36.055Z | — | `{approvalRequestId: 7c61fb1e…, approvalStepId: 51e98e47…}` |
| 4 | 1 | LIFECYCLE_EVENT | LIFECYCLE | TIMELINE.LIFECYCLE.SEND_BACK | COMPLETED | Nadia Ibrahim | 2026-06-26T19:22:36.120Z | SEND_BACK | `{auditLogId: f58c7602…}` |
| 5 | 2 | LIFECYCLE_EVENT | LIFECYCLE | TIMELINE.LIFECYCLE.RESUBMIT | COMPLETED | Nadia Ibrahim | 2026-06-26T19:22:36.218Z | RESUBMIT | `{auditLogId: 3a3783d5…}` |
| 6 | 2 | APPROVAL_STEP_COMPLETED | COST_CONTROL | TIMELINE.STAGE.COST_CONTROL_COMPLETED | COMPLETED | Nadia Ibrahim | 2026-06-26T19:22:36.299Z | — | `{approvalRequestId: 2b630ccc…, approvalStepId: 446c935e…}` |
| 7 | 2 | APPROVAL_STEP_COMPLETED | FINANCE | TIMELINE.STAGE.FINANCE_COMPLETED | COMPLETED | Youssef Karimi | 2026-06-26T19:22:36.336Z | — | `{approvalRequestId: 2b630ccc…, approvalStepId: 30fc5772…}` |
| 8 | 2 | LIFECYCLE_EVENT | LIFECYCLE | TIMELINE.LIFECYCLE.SEND_BACK | COMPLETED | Nadia Ibrahim | 2026-06-26T19:22:36.398Z | SEND_BACK | `{auditLogId: 2be3bc9b…}` |
| 9 | 3 | LIFECYCLE_EVENT | LIFECYCLE | TIMELINE.LIFECYCLE.RESUBMIT | COMPLETED | Nadia Ibrahim | 2026-06-26T19:22:36.507Z | RESUBMIT | `{auditLogId: ede18fe5…}` |
| 10 | 3 | APPROVAL_STEP_COMPLETED | COST_CONTROL | TIMELINE.STAGE.COST_CONTROL_COMPLETED | COMPLETED | Nadia Ibrahim | 2026-06-26T19:22:36.592Z | — | `{approvalRequestId: 9301a9b7…, approvalStepId: a80bf05e…}` |
| 11 | 3 | APPROVAL_STEP_COMPLETED | FINANCE | TIMELINE.STAGE.FINANCE_COMPLETED | COMPLETED | Youssef Karimi | 2026-06-26T19:22:36.635Z | — | `{approvalRequestId: 9301a9b7…, approvalStepId: ba10982b…}` |
| 12 | 3 | LIFECYCLE_EVENT | LIFECYCLE | TIMELINE.LIFECYCLE.SEND_BACK | COMPLETED | Nadia Ibrahim | 2026-06-26T19:22:36.688Z | SEND_BACK | `{auditLogId: feaac31e…}` |
| 13 | 4 | LIFECYCLE_EVENT | LIFECYCLE | TIMELINE.LIFECYCLE.RESUBMIT | COMPLETED | Nadia Ibrahim | 2026-06-26T19:22:36.770Z | RESUBMIT | `{auditLogId: 739e1a39…}` |
| 14 | 4 | APPROVAL_STEP_CURRENT | COST_CONTROL | TIMELINE.STAGE.COST_CONTROL_APPROVAL | IN_PROGRESS | — | — | — | `{approvalRequestId: d60e3747…, approvalStepId: 05f989db…}` |
| 15 | 4 | APPROVAL_STEP_FUTURE | FINANCE | TIMELINE.STAGE.FINANCE_APPROVAL | PENDING | — | — | — | `{approvalRequestId: d60e3747…, approvalStepId: a5322232…}` |

Full machine-readable payload: `backfill-reports/PHASE4_GRN_FIXTURES.json` → `fixtures[0].timelineEntries`

---

## 4. Full DOM entry list (Playwright — same order)

```
 1. Received & validated
 2. Cost control approved
 3. Finance approved
 4. Sent back for correction
 5. Resubmitted for approval
 6. Cost control approved
 7. Finance approved
 8. Sent back for correction
 9. Resubmitted for approval
10. Cost control approved
11. Finance approved
12. Sent back for correction
13. Resubmitted for approval
14. Cost control approval
15. Finance approval
```

Machine-readable: `runtime-evidence/phase4/PHASE4_PLAYWRIGHT_RESULT.json` → `results[].domTitles`

---

## 5. Dedup verification — Cost/Finance across cycles

Each completed approval step has a **unique** `sourceRef.approvalStepId` per cycle:

| Cycle | Cost stepId (suffix) | Finance stepId (suffix) |
|------:|----------------------|-------------------------|
| 1 | `…ce06` | `…341e` |
| 2 | `…0a6f` | `…aba25` |
| 3 | `…a211` | `…66e2` |

Frontend dedup (`timeline-entry-render.util.ts`) keys on `sourceRef` identity — **does not** merge by `stageKey`, title, actor, or `cycleNumber` alone. Unit test #6/#7 in Phase 3 explicitly cover repeated `stageKey` across cycles.

---

## 6. Acceptance checklist

| Criterion | Result |
|-----------|:------:|
| API contains 15 entries in specified order | **PASS** |
| DOM contains 15 entries | **PASS** |
| Cycles 1–3 each have Cost + Finance completed | **PASS** |
| 3× Send Back visible | **PASS** |
| 3× Resubmit visible | **PASS** |
| Cycle 4 shows Current + Pending | **PASS** |
| API/DOM parity 15/15 | **PASS** |
| No duplicate entries | **PASS** (unique sourceRef per approval) |
| No missing entries | **PASS** |
| Screenshots + JSON updated | **PASS** |

---

## 7. GRN Detail wiring (unchanged from Phase 4 implementation)

```html
<app-returns-workflow-timeline
  [useTimelineEntries]="true"
  [timelineEntries]="timelineEntries() ?? []"
/>
```

No `presentationSlots` / `auditEvents` / `documentContext` on GRN Detail timeline.

---

## 8. Screenshots & JSON evidence

| Artifact | Path |
|----------|------|
| Screenshot 1920×1080 | `runtime-evidence/phase4/three_send_back_cycle_4_active-3sendback-1920x1080.png` |
| Screenshot 1366×768 | `runtime-evidence/phase4/three_send_back_cycle_4_active-3sendback-1366x768.png` |
| Playwright JSON | `runtime-evidence/phase4/PHASE4_PLAYWRIGHT_RESULT.json` |
| Fixture JSON | `backfill-reports/PHASE4_GRN_FIXTURES.json` |

---

## 9. Test results (post-remediation)

```
grnTimeline.builder.test.js               3/3 PASS (15-entry assert on 4-cycle)
grn-timeline-db-integration.test.js       4/4 PASS (15-entry DB-backed 4-cycle)
smoke-grn-detail-timeline-api.js         11/11 checks PASS
npm run test (OSE-Frontend)              46/46 PASS
verify-grn-detail-timeline-phase4.mjs    PASS (15/15 both viewports)
npm run build                            PASS
```

### Playwright parity matrix

| Check | 1920×1080 | 1366×768 |
|-------|:---------:|:--------:|
| DOM count = API count (15) | PASS | PASS |
| 3 Send Back (API + DOM) | PASS | PASS |
| 3 Resubmit (API + DOM) | PASS | PASS |
| 3 Finance completed (API + DOM) | PASS | PASS |
| No raw lifecycle keys | PASS | PASS |
| No horizontal overflow | PASS | PASS |

---

## 10. Files changed in remediation pass

```
OSE-backend/scripts/lib/grn-timeline-fixture.helpers.js   (new)
OSE-backend/scripts/seed-grn-phase4-timeline-fixtures.js
OSE-backend/scripts/grn-timeline-db-integration.test.js
OSE-backend/scripts/smoke-grn-detail-timeline-api.js
OSE-backend/src/platform/timeline/grnTimeline.builder.test.js  (15 assert)
OSE-Frontend/scripts/verify-grn-detail-timeline-phase4.mjs
Governance/timeline-remediation/backfill-reports/PHASE4_GRN_FIXTURES.json
Governance/timeline-remediation/runtime-evidence/phase4/*
```

---

## Stop line

**Phase 5 (Transfer / Breakage / Lost) not started.**  
Awaiting approval of **15/15** Phase 4 gate.
