# Phase 6 — Get Pass Timeline Migration Evidence

**Date:** 2026-06-26  
**Status:** **PASS — Runtime evidence complete (awaiting final approval)**  
**Scope:** Get Pass Detail → unified `timelineEntries[]` via Constitution Timeline API  
**Stop line:** Phase 7 (Inventory Count) **not started**

---

## Executive Summary

| Area | Result |
|------|--------|
| Discovery documented | **PASS** |
| Backend `getPassTimeline.builder.js` | **PASS** |
| Production fixtures (5 scenarios) | **PASS** — seeded via `getPass.service` |
| `GET /constitution/timeline/GET_PASS/:id` | **PASS** |
| Client builder removed from Detail UI | **PASS** — file **deleted** (no consumers) |
| Loading / Error / Empty states | **PASS** |
| Legacy `workflowSlots` + `auditEvents` | **Unchanged** |
| DB integration (runtime scenarios) | **PASS — 0 skipped** |
| Playwright API/DOM parity (5 × 2 viewports) | **PASS — 0 skipped** |
| Regression gate | **PASS** |
| `npm run build` | **PASS** |

**Runtime required scenarios: 0 skipped**

---

## 1. Fixture IDs (Grand Horizon)

Seeded with tag `PHASE6_TIMELINE_FIXTURE` via `node scripts/seed-phase6-get-pass-timeline-fixtures.js`.

| Scenario | Pass No | Document ID | Final status | Timeline entries |
|----------|---------|-------------|--------------|------------------|
| `active_workflow` | GP-2026-00024 | `457c3102-129e-4fac-b599-ec6a70e51137` | `PENDING_COST_CONTROL` | 6 |
| `pending_security` | GP-2026-00025 | `8f0191d2-92ac-4438-b4ac-91d91c2ec2c6` | `PENDING_SECURITY` | 6 |
| `security_out` | GP-2026-00028 | `d0a1569c-83bf-4a9d-baf5-4fa891ccaaff` | `OUT` | 7 |
| `returned` | GP-2026-00029 | `34bca186-eda2-4348-aa3f-f9ddf9bfdc8e` | `RETURNED` | 8 |
| `rejected` | GP-2026-00030 | `247ea548-9352-4907-892e-76eaf48d8918` | `REJECTED` | 3 |

**Report:** `Governance/timeline-remediation/backfill-reports/PHASE6_TIMELINE_FIXTURES.json`

---

## 2. Production transitions used (no DB patch)

| Scenario | Service calls | Actor |
|----------|---------------|-------|
| Create + submit | `createGetPass` → `submitGetPass` | `store@grandhorizon.com` (STOREKEEPER) |
| Dept approve | `approveGetPass` @ `PENDING_DEPT` | `hk.manager@grandhorizon.com` (DEPT_MANAGER) |
| Cost / Finance / GM | `approveGetPass` chain | `cost@`, `finance@`, `richard.evans@dxuat.com` (GM member on tenant) |
| Security OUT | `approveGetPass` @ `PENDING_SECURITY` | `steven.clark@dxuat.com` (SECURITY member on tenant) |
| Return | `processReturns` (full good qty) | `store@grandhorizon.com` |
| Reject | `rejectGetPass` @ `PENDING_COST_CONTROL` | `cost@grandhorizon.com` + `rejectionReason` |
| Post-reject guard | `approveGetPass` on REJECTED | **Blocked** — `Get Pass is not pending any approval` |

GM/SECURITY actors were linked to Grand Horizon tenant membership (existing DX UAT users) before seeding — lifecycle transitions still executed exclusively through production services.

---

## 3. Runtime verification highlights

### Security OUT (`security_out`)

- All approval steps through GM: `APPROVAL_STEP_COMPLETED`
- Security step: `APPROVAL_STEP_COMPLETED` + milestone `SECURITY_OUT` (`MILESTONE_COMPLETED`)
- `SECURITY_OUT.actedAt` === `checkedOutAt`; actor === `checkedOutBy` (Security user)
- Single `SECURITY_OUT` entry (no audit duplicate)

### Return (`returned`)

- `SECURITY_OUT` milestone before `RETURN_PROCESSED` milestone (chronological)
- Return is milestone (`RETURN_PROCESSED`), not approval step
- Final document status `RETURNED` aligns with last timeline entry

### Reject (`rejected`)

- Single `LIFECYCLE_EVENT` / `lifecycleEventType: REJECT` at stage `COST_CONTROL`
- `reason` from `rejectionReason`
- No `APPROVAL_STEP_CURRENT` or `APPROVAL_STEP_FUTURE` after reject
- Approve-after-reject blocked by business guard

### Active / Not yet OUT (`active_workflow`, `pending_security`)

- Completed steps: past tense (`*_COMPLETED`)
- Current step: action noun + `IN_PROGRESS`
- Future steps: action noun + `PENDING`
- No `SECURITY_OUT` before security checkout
- No return milestones before OUT

---

## 4. API payload sample (`security_out`)

```json
{
  "timelineEntries": [
    { "globalOrder": 1, "entryType": "LIFECYCLE_EVENT", "lifecycleEventType": "SUBMIT_FOR_APPROVAL", "stageKey": "LIFECYCLE" },
    { "globalOrder": 2, "entryType": "APPROVAL_STEP_COMPLETED", "stageKey": "DEPT", "status": "COMPLETED" },
    { "globalOrder": 3, "entryType": "APPROVAL_STEP_COMPLETED", "stageKey": "COST_CONTROL", "status": "COMPLETED" },
    { "globalOrder": 4, "entryType": "APPROVAL_STEP_COMPLETED", "stageKey": "FINANCE", "status": "COMPLETED" },
    { "globalOrder": 5, "entryType": "APPROVAL_STEP_COMPLETED", "stageKey": "GENERAL_MANAGER", "status": "COMPLETED" },
    { "globalOrder": 6, "entryType": "APPROVAL_STEP_COMPLETED", "stageKey": "SECURITY", "status": "COMPLETED" },
    { "globalOrder": 7, "entryType": "MILESTONE_COMPLETED", "stageKey": "SECURITY_OUT", "displayTitleKey": "TIMELINE.STAGE.SECURITY_OUT_COMPLETED", "actedAt": "<checkedOutAt>" }
  ]
}
```

Full payloads: `PHASE6_TIMELINE_FIXTURES.json` (per scenario).

---

## 5. API / DOM parity (Playwright)

**Script:** `OSE-Frontend/scripts/verify-phase6-detail-timeline.mjs`  
**Route:** `/get-passes/:id` (not legacy `/get-pass/:id`)  
**Viewports:** 1920×1080, 1366×768

| Metric | Value |
|--------|-------|
| **Passed** | 10 |
| **Failed** | 0 |
| **Skipped** | 0 |
| **Runtime required skipped** | 0 |

Per fixture: `domCountMatchesApi`, entry order, no raw `TIMELINE.*` keys in DOM, no `ACTED BY`, no horizontal page overflow, workflow timeline heading present, OUT/Return/Reject distinguished from approval steps.

**Screenshots:** `Governance/timeline-remediation/runtime-evidence/phase6/*.png`  
**Run report:** `Governance/timeline-remediation/runtime-evidence/phase6/PHASE6_PLAYWRIGHT_RESULTS.json`

### Sample DOM titles (`security_out`, 1920)

| # | DOM title |
|---|-----------|
| 1 | Submitted for approval |
| 2 | Department approved |
| 3 | Cost control approved |
| 4 | Finance approved |
| 5 | General manager approved |
| 6 | Security approved |
| 7 | Security released |

API count = DOM count = 7 for all OUT/Return/Reject scenarios.

---

## 6. Client builder deprecation

`buildGetPassWorkflowPresentationSlots()` in `get-pass-workflow-presentation.util.ts`:

- **Removed from Get Pass Detail** (Phase 6 implementation)
- **File deleted** — grep confirmed **zero consumers** in `OSE-Frontend`
- No parallel presentation path on Get Pass Detail (`[useTimelineEntries]="true"` only)

---

## 7. Files added/changed (runtime evidence pass)

| File | Change |
|------|--------|
| `OSE-backend/scripts/lib/phase6-get-pass-fixture.helpers.js` | **NEW** — production-service fixture builders |
| `OSE-backend/scripts/seed-phase6-get-pass-timeline-fixtures.js` | **NEW** — seed + JSON report |
| `OSE-backend/scripts/phase6-timeline-db-integration.test.js` | **UPDATED** — fixture-driven, 0 skip |
| `OSE-Frontend/scripts/verify-phase6-detail-timeline.mjs` | **UPDATED** — fixture report, `/get-passes/:id`, tally fix |
| `OSE-Frontend/.../get-pass-workflow-presentation.util.ts` | **DELETED** |

---

## 8. Test tally (honest)

| Suite | Passed | Skipped | Failed |
|-------|--------|---------|--------|
| `getPassTimeline.builder.test.js` | 6 | 0 | 0 |
| `phase6-timeline-db-integration.test.js` | 9 | **0** | 0 |
| `grn-timeline-db-integration.test.js` + GRN regression | 4 + 11 | 0 | 0 |
| `phase5-timeline-db-integration.test.js` | 3 | 0 | 0 |
| `movementApprovalAction.guard.test.js` | 12 | 0 | 0 |
| `approvalTimeline.builder.test.js` | 6 | 0 | 0 |
| `timeline-entry-render.util.spec.ts` | 11 | 0 | 0 |
| `verify-phase6-detail-timeline.mjs` (5 scenarios × 2 VP) | 10 | **0** | 0 |
| `npm run build` (OSE-Frontend) | 1 | 0 | 0 |

**Runtime required scenarios: 0 skipped**

---

## 9. Loading / Error / Empty

| State | UI | Fallback to client builder |
|-------|-----|------------------------------|
| Loading | `[data-testid="get-pass-timeline-loading"]` | **No** |
| Error | `[data-testid="get-pass-timeline-error"]` + Retry | **No** |
| Empty | `[data-testid="get-pass-timeline-empty"]` + Retry | **No** |

---

## 10. Risks (unchanged)

| Risk | Mitigation |
|------|------------|
| Target-tenant timeline read for internal transfer | Pre-existing tenant filter — destination view may 404 |
| Force-close settlement events | Out of Phase 6 scope |
| GM/SECURITY not in all tenant seeds | Grand Horizon now has fixture actors via tenant membership |

---

## Stop line

**Phase 7 — Inventory Count not started.**  
Phase 6 runtime evidence complete — ready for **final approval**.
