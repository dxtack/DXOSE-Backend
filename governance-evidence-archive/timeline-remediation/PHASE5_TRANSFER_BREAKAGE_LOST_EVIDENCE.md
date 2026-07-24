# Phase 5 — Transfer / Breakage / Lost Timeline Migration Evidence

**Date:** 2026-06-26  
**Status:** **PASS** (closure complete incl. production workflow guard + currentStep invariant — awaiting final approval; **Phase 6 not started**)  
**Scope:** Transfer Detail, Breakage Detail, Lost Items Detail → unified `timelineEntries[]` + Workflow Timeline labels

---

## Executive Summary

| Area | Result |
|------|--------|
| Shared approval timeline builder | **PASS** |
| Production workflow guard + currentStep invariant | **PASS** — `movementApprovalAction.guard.js` + `submitBreakage` fix |
| Transfer / Breakage / Lost API `timelineEntries[]` | **PASS** |
| CANCELLED → not shown as PENDING | **PASS** (unit + DB integration) |
| Reject as single LIFECYCLE REJECT | **PASS** (runtime + unit) |
| Frontend migration (3 detail screens) | **PASS** |
| Workflow Timeline naming & labels (unified path only) | **PASS** |
| Legacy `workflowSlots` / `auditEvents` | **Unchanged** |
| GRN Phase 4 regression | **15/15 PASS** |
| Approve Modal / legacy renderer | **Unchanged** |
| Runtime Playwright (Transfer + Breakage + Lost) | **10/10 parity** (1920 + 1366) |
| phase5 DB integration | **3/3 PASS** (was 3 pass / 2 skip) |
| `npm run build` | **PASS** |

---

## 1. Runtime fixtures (Grand Horizon tenant)

Seeded via `OSE-backend/scripts/seed-phase5-timeline-fixtures.js` + `scripts/lib/phase5-timeline-fixture.helpers.js`.

| Scenario | Module | Document | Status | Timeline entries |
|----------|--------|----------|--------|-----------------:|
| `transfer_posted` | TRANSFER | `TRF-202605-0002` | POSTED | 4 |
| `breakage_happy` | BREAKAGE | `BRK-*` (PHASE5_TIMELINE_FIXTURE) | FINANCE_APPROVED | 4 |
| `breakage_rejected` | BREAKAGE | `BRK-*` (PHASE5_TIMELINE_FIXTURE) | REJECTED | 2 |
| `lost_happy` | LOST | `LST-*` (PHASE5_TIMELINE_FIXTURE) | FINANCE_APPROVED | 4 |
| `lost_rejected` | LOST | `LST-*` (PHASE5_TIMELINE_FIXTURE) | REJECTED | 2 |

Full JSON: `backfill-reports/PHASE5_TIMELINE_FIXTURES.json`

### Breakage happy path (runtime)

- Create → Submit → Cost approve → Finance approve (GM step current)
- Actors: Khalid Hassan (DEPT auto), Nadia Ibrahim (Cost), Youssef Karimi (Finance)
- Notes on completed steps verified in API payload

### Breakage reject (runtime)

- Reject at Cost Control with comment `Phase5 reject note`
- Single `LIFECYCLE_EVENT` / `REJECT`; actor Nadia Ibrahim; `reason` populated
- No `PENDING` / `APPROVAL_STEP_FUTURE` after reject

### Lost happy / reject

- Same 4-step chain as Breakage; reject at Cost with same invariants

---

## 2. Transfer POSTED with `postedAt = null` — investigation

**Affected records (Grand Horizon):**

| transferNo | id | status | postedAt | postedBy | audit TRANSFER events |
|------------|-----|--------|----------|----------|------------------------|
| TRF-202605-0001 | `4c9541f0-…` | POSTED | **null** | **null** | **none** |
| TRF-202605-0002 | `89cc13cb-…` | POSTED | **null** | **null** | **none** |

**Trusted recovery source — `inventory_ledger`:**

| transferNo | First ledger row | Actor | movementType |
|------------|------------------|-------|--------------|
| TRF-202605-0001 | 2026-05-13T13:40:09.869Z | store@grandhorizon.com (Khalid Hassan) | TRANSFER_OUT |
| TRF-202605-0002 | 2026-05-13T13:41:23.018Z | store@grandhorizon.com (Khalid Hassan) | TRANSFER_OUT |

**Conclusion:**

- `postedAt` / `postedBy` null on document row = **legacy data gap** (pre-migration posting metadata not backfilled).
- Posting **did occur** — ledger rows exist with actor and timestamp.
- **No fabricated timestamps** — timeline POSTING entry recovered from earliest ledger row via `resolveTransferPostingEvidence()` in `documentTimeline.service.js`.
- Audit log has **no** TRANSFER posting events for these records.

**After fix — TRF-202605-0002 timeline (4 entries):**

| globalOrder | entryType | Title | Badge (UI) | Actor | actedAt (source) |
|------------:|-----------|-------|------------|-------|------------------|
| 1 | APPROVAL_STEP_COMPLETED | Department approved | Approved | Omar Al-Said | step |
| 2 | APPROVAL_STEP_COMPLETED | Finance approved | Approved | Youssef Karimi | step |
| 3 | APPROVAL_STEP_COMPLETED | Admin approved | Approved | Sarah Ahmed | step |
| 4 | POSTING | Posted to inventory | Posted | Khalid Hassan | **ledger** |

---

## 3. Workflow Timeline naming & labels (unified path only)

Applied to `timelineEntries` renderer only — **legacy presentation / modal paths unchanged**.

| Change | Implementation |
|--------|----------------|
| Card title | `Workflow timeline` (GRN / Transfer / Breakage / Lost i18n `*.DETAIL.TIMELINE`) |
| Metadata | Single line: `By {name} · {datetime} · Duration: …` — no duplicate actor beside title |
| Label | `By` replaces `ACTED BY` |
| Semantic badges | Lifecycle → event type (Sent Back, Resubmitted, Rejected); approvals → Approved; current → In progress; future → Pending; posting → Posted; Received & Validated → Completed |
| Reason / Note | `Reason:` / `Note:` with spacing (no uppercase concatenation) |

Files: `returns-workflow-timeline.component.*`, `timeline-entry-i18n.util.ts`, `en.json` / `ar.json`

---

## 4. API / DOM parity — runtime (Playwright)

**Script:** `OSE-Frontend/scripts/verify-phase5-detail-timeline.mjs`  
**Result:** `runtime-evidence/phase5/PHASE5_PLAYWRIGHT_RESULT.json` — **`pass: true`**

| Fixture | 1920×1080 | 1366×768 | API=DOM | no ACTED BY | Reject invariants |
|---------|:---------:|:--------:|:-------:|:-----------:|:-----------------:|
| transfer_posted | PASS (4) | PASS (4) | ✓ | ✓ | n/a |
| breakage_happy | PASS (4) | PASS (4) | ✓ | ✓ | n/a |
| breakage_rejected | PASS (2) | PASS (2) | ✓ | ✓ | single reject, no pending |
| lost_happy | PASS (4) | PASS (4) | ✓ | ✓ | n/a |
| lost_rejected | PASS (2) | PASS (2) | ✓ | ✓ | single reject, no pending |

Screenshots: `runtime-evidence/phase5/*-{1920,1366}.png`

---

## 5. Test results (closure run — guard corrected)

```
approvalTimeline.builder.test.js        6/6 PASS  (src/platform/timeline/)
grnTimeline.builder.test.js             3/3 PASS
timelineEntry.test.js                  10/10 PASS  (src/platform/timeline/)
phase5-timeline-db-integration.test.js    3/3 PASS
grn-timeline-db-integration.test.js       4/4 PASS   (15/15 + 10-cycle regression)
movementApprovalAction.guard.test.js     12/12 PASS
movement-submit-current-step.test.js        7/7 PASS
lost-approval-workflow.test.js            6/6 PASS (+1 skip: no draft breakage probe)
breakage-get-by-id.test.js                2/2 PASS
timeline-entry-render.util.spec.ts       11/11 PASS
npm run build                             PASS
verify-phase5-detail-timeline.mjs        10/10 PASS (5 fixtures × 2 viewports)
```

Shared renderer component spec (`returns-workflow-timeline.component.spec.ts`): **14 tests** — run via `ng test` (Vitest standalone lacks Angular JIT for component harness).

### DB integration assertions (Breakage / Lost — no longer skipped)

- Happy fixtures: ≥3 entries, completed steps use `_COMPLETED` title keys
- Reject fixtures: exactly 1 `REJECT` lifecycle event, zero `PENDING` / future steps, actor + reason present
- Transfer POSTED: POSTING entry present (ledger recovery)

---

## 6. Supporting fixes (seed / runtime enablers)

| Fix | Why |
|-----|-----|
| `getBreakageById` — `await withBreakageMediaUrls()` | Submit failed: returned unresolved Promise → `status` undefined → editable guard saw "In Review" |
| `assertMovementApprovalActionAllowed` (replaces removed editable guard on Lost) | In-flight Lost docs are "In Review" but must accept approve/reject on current step |
| `submitBreakage` — `resolveFirstPendingApprovalStepNumber` | Production bug: submit reset `currentStep=1` while step 1 already APPROVED on create |

---

## Production Workflow Guard Verification

### Root cause — why editable guard was wrong for approval

| Question | Evidence |
|----------|----------|
| **What guard was removed?** | `assertDocumentEditableByLifecycle('LOST', doc.status)` on `action !== 'REJECT'` inside `processLostApprovalStep` |
| **What did it block?** | Any document whose user-facing state is not `Draft` or `Returned` — including `DEPT_APPROVED` → **In Review** |
| **Why it blocked valid approval** | Lost create sets `status: DEPT_APPROVED` immediately; Cost Control approve is a **workflow action**, not a document edit. Guard conflated "cannot edit lines" with "cannot approve current step" |
| **Edit vs workflow action** | `assertDocumentEditableByLifecycle` (Ch.2.5) guards **mutations to document content** (submit, void, line edits). Approve/reject are **approvalRequest step transitions** — Breakage never used editable guard on `processApprovalStep`; only on submit/void |
| **Why not delete without replacement?** | Phase 5 interim fix removed the guard entirely — **reverted**. Replaced with `assertMovementApprovalActionAllowed` |

### Replacement — `assertMovementApprovalActionAllowed`

File: `OSE-backend/src/platform/movementApprovalAction.guard.js`

Wired in: `processLostApprovalStep`, `processApprovalStep` (Breakage — adds missing `approvalRequest.status === PENDING` + pipeline status checks)

| Check | Blocks |
|-------|--------|
| Terminal doc (`APPROVED`, `VOID`, `REJECTED`) | Post-terminal actions |
| `approvalRequest.status !== 'PENDING'` | Stale actions after request resolved |
| Doc status not in pipeline (`DEPT_APPROVED`, `COST_CONTROL_APPROVED`, `FINANCE_APPROVED`) | Approve on `DRAFT` before submit |
| `currentStep.stepNumber !== approvalRequest.currentStep` | Future / wrong step |
| `currentStep.status !== 'PENDING'` | Duplicate approve on completed step |
| *(downstream)* `assertUserHasBreakageLostStepPermission` | Insufficient role/permission |
| *(downstream)* prev-steps approved | Out-of-order approve |
| *(Breakage only)* `assertConcurrencyVersion` | Stale concurrent approve |

**Editable guard retained** on submit/void/content mutations — not removed from those paths.

### Mandatory tests

| Scenario | Test file | Result |
|----------|-----------|--------|
| **Allowed:** approve current step | `lost-approval-workflow.test.js` | PASS |
| **Allowed:** reject current step | `lost-approval-workflow.test.js` | PASS |
| **Blocked:** future step | `movementApprovalAction.guard.test.js` | PASS |
| **Blocked:** duplicate on completed step | `movementApprovalAction.guard.test.js` | PASS |
| **Blocked:** after reject terminal | guard + workflow integration | PASS |
| **Blocked:** after approved terminal | `movementApprovalAction.guard.test.js` | PASS |
| **Blocked:** no approval request | `movementApprovalAction.guard.test.js` | PASS |
| **Blocked:** request not PENDING | `movementApprovalAction.guard.test.js` | PASS |
| **Blocked:** insufficient permission | `lost-approval-workflow.test.js` | PASS |
| **Blocked:** DRAFT not in pipeline | `movementApprovalAction.guard.test.js` | PASS |
| **Blocked:** stale concurrency (Breakage) | `lost-approval-workflow.test.js` | PASS |
| **Invariant:** Breakage submit → currentStep = first PENDING | `movement-submit-current-step.test.js` | PASS (7/7) |
| **Invariant:** Lost create → currentStep = first PENDING | `movement-submit-current-step.test.js` | PASS |
| **Runtime:** Cost approve without fixture DB patch | `movement-submit-current-step.test.js` | PASS |

### Production `currentStep` invariant (Breakage submit drift — fixed)

**Bug confirmed:** `submitBreakage` unconditionally set `approvalRequest.currentStep = 1` after submit, while `createMovementApprovalRequest` pre-approves step 1 (DEPT) and sets `currentStep = 2` on create.

**Production path verified (no `syncApprovalCurrentStep`, no DB patch):**

| Step | Breakage | Lost |
|------|----------|------|
| After create | Step 1 `APPROVED`, `currentStep = 2` | Step 1 `APPROVED`, `currentStep = 2`, status `DEPT_APPROVED` |
| After submit | Step 1 `APPROVED`, `currentStep = 2` (unchanged, not reset to 1) | n/a (no submit) |
| Cost Control approve | PASS via `processApprovalStep` | PASS via `processLostApprovalStep` |

**Fix:** `submitBreakage` now calls `resolveFirstPendingApprovalStepNumber(steps)` inside the submit transaction and sets `currentStep` to the first `PENDING` step. Submit notification email targets the pending step role (Cost Control), not DEPT.

**Removed:** `syncApprovalCurrentStep` fixture helper — runtime fixtures and tests no longer require test-only DB correction.

**Lost Items:** No submit drift — create path already set `currentStep = 2` correctly; verified by production service tests.

### `getBreakageById` — `await withBreakageMediaUrls()`

| Item | Detail |
|------|--------|
| **Bug** | `getBreakageById` returned `withUserFacingState('BREAKAGE', withBreakageMediaUrls(enriched))` without `await` |
| **Effect on submit** | `doc.status` was `undefined` → `mapUserFacingState` → **In Review** → `assertDocumentEditableByLifecycle` threw before submit |
| **Contract** | Response shape unchanged: still `{ ...doc, photoUrl, attachments, lines, userFacingState }` — now fully resolved |
| **Regression** | `scripts/breakage-get-by-id.test.js` — asserts `typeof status === 'string'`, not a Promise, media fields present |

---

## 7. Legacy regression (unchanged)

| Check | Result |
|-------|--------|
| `workflowSlots` + `auditEvents` still returned | **PASS** |
| GRN 15/15 Phase 4 | **PASS** |
| Transfer legacy 3-step (ADMIN) | **PASS** (TRF-202605-0002) |
| Shared renderer legacy path | **PASS** |
| Approve Modal | **Not modified** |
| Get Pass / Inventory Count | **Not modified** |

---

## 8. Data gaps (documented, not fabricated)

| Gap | Records | Mitigation |
|-----|---------|------------|
| `storeTransfer.postedAt` / `postedBy` null | TRF-202605-0001, TRF-202605-0002 | Timeline POSTING from `inventory_ledger`; document row backfill out of Phase 5 scope |
| No TRANSFER audit posting events | Same transfers | Documented; ledger is SSOT for posting time/actor in timeline |

---

## Stop line

**Phase 6 — Get Pass not started.**  
Phase 5 closure evidence complete (incl. **Production Workflow Guard Verification**) — awaiting **final approval** before Phase 6 gate.

### Final gate re-run (2026-06-26 — currentStep drift fixed)

| Gate | Result |
|------|--------|
| `movement-submit-current-step.test.js` | **7/7 PASS** (production path, no fixture sync) |
| `movementApprovalAction.guard.test.js` | 12/12 PASS |
| `lost-approval-workflow.test.js` | 6/6 PASS (+1 skip) |
| `breakage-get-by-id.test.js` | 2/2 PASS |
| `phase5-timeline-db-integration.test.js` | 3/3 PASS |
| `grn-timeline-db-integration.test.js` | 4/4 PASS (15/15 regression) |
| `approvalTimeline.builder.test.js` | 6/6 PASS |
| `timelineEntry.test.js` | 10/10 PASS |
| `timeline-entry-render.util.spec.ts` | 11/11 PASS |
| `verify-phase5-detail-timeline.mjs` | 10/10 PASS |
| `npm run build` | PASS |
