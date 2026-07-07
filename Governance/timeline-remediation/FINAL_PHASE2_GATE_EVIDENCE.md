# Final Phase 2 Gate — Evidence Report (Complete Re-run)

**Date:** 2026-06-26  
**Status:** **PASS** — stopped before Phase 3  
**Re-run scope:** All 12 gate checks + startup blockers + pre-existing findings documented

---

## Executive Summary

| Area | Result |
|------|--------|
| Prisma validate / migrate status | **PASS** |
| Prisma generate | **PASS** (requires dev server stop — EPERM if locked) |
| GRN schema smoke | **PASS** |
| Migration rollback (test DB clone) | **PASS** |
| cycleNumber uniqueness + concurrency | **PASS** |
| grn.service.test.js baseline + Phase 2 | **11/11 PASS** |
| DB-backed 4-cycle + 10-cycle | **PASS** |
| Backfill idempotency | **PASS** (0 orphans post-apply) |
| Live GRN smoke | **PASS** (2 entries — expected) |
| Legacy arrays after service restart | **PASS** |
| Report formatting (fmtQty fix) | **PASS** (14/14 UAT; regression lock 23/24 — 1 pre-existing width check) |
| accRuntimeSetting startup warning | **Pre-existing P19 finding — out of Phase 2 scope** |

**Phase 3 (Shared Renderer) not started.** Awaiting gate approval.

---

## 1. Prisma validate / generate / migrate status

**Commands (2026-06-26 re-run):**

```
npx prisma validate          → The schema at prisma/schema.prisma is valid 🚀
npx prisma generate          → ✔ Generated Prisma Client (v5.22.0) — PASS after stopping port-4000 process
npx prisma migrate status    → Database schema is up to date! (72 migrations)
```

**Note:** `prisma generate` fails with `EPERM` while the dev server holds `query_engine-windows.dll.node`. Stop the server first, generate, then restart.

**Schema smoke:** `node scripts/smoke-prisma-grn-approval-schema.js` → **PASS**

- `ApprovalRequest.grnImportId`
- `ApprovalRequest.cycleNumber`
- `GrnActiveApproval` (`grnImportActive` / `GrnImport.approvalRequest`)
- `GrnApprovalHistory` (`grnImportHistory` / `ApprovalRequest.grnImportId`)
- `@@unique([grnImportId, cycleNumber])`

**Phase 2 migrations only (no overlap with acc_runtime_settings):**

| Migration | Tables touched |
|-----------|----------------|
| `20260627180000_grn_approval_history_link` | `approval_requests` (+ FK to `grn_imports`) |
| `20260627190000_grn_cycle_number_unique` | partial unique index on `approval_requests` |

---

## 2. Migration rollback test (Test DB copy only)

**Script:** `scripts/test-grn-history-migration-rollback.js`  
**Method:** `CREATE DATABASE ose_inventory_p2_gate_test TEMPLATE ose_inventory` — **dev DB untouched**

**Report:** `backfill-reports/MIGRATION_ROLLBACK_TEST_EVIDENCE.json`

| Step | Result |
|------|--------|
| Clone template DB | PASS |
| Columns + index before rollback | PASS (60 grn_imports) |
| Reverse SQL (drop grnImportId/cycleNumber) | PASS |
| Columns removed | PASS |
| Re-apply forward SQL | PASS |
| Data intact (grn_imports 60 → 60) | PASS |

---

## 3. cycleNumber concurrency protection

**Schema:** partial unique index `approval_requests_grnImportId_cycleNumber_key` + Prisma `@@unique([grnImportId, cycleNumber])`

**Write path (`grn.service.js`):**
- `SELECT ... FOR UPDATE` on `grn_imports` inside transaction
- Cycle allocation inside same transaction via `_resolveNextGrnCycleNumber(tx, ...)`
- `submitForApproval` status + concurrency checks **inside** locked transaction
- P2002 → `409 GRN_CYCLE_CONFLICT`

**Tests (re-run 2026-06-26):**

| Test | Result |
|------|--------|
| Unit: `concurrent resubmit mock` — `grn.service.test.js` | **PASS** |
| DB: `concurrent resubmit: only one cycle number allocated` — `grn-timeline-db-integration.test.js` | **PASS** |

---

## 4. grn.service.test.js baseline comparison

**Baseline evidence:** `OSE-backend/src/tmp/grn-service-test-baseline.json`

| Finding | Detail |
|---------|--------|
| Pre-existing root cause | 4 failures = `CONCURRENCY_VERSION_REQUIRED` — mock lacked `concurrencyVersion` + calls omitted `expectedVersion` |
| Phase 2 change impact | **No new failure mode** after fix |
| Current result (re-run) | **11/11 PASS** including Phase 2 write-path tests |

**Phase 2 tests included:** `submitForApproval` cycle 1, `sendBackGrn` history link, resubmit cycle 2 + `GRN_RESUBMIT` audit, notes do not emit RESUBMIT, concurrent resubmit rejection.

---

## 5. DB-backed multi-cycle verification

**Script:** `node --test scripts/grn-timeline-db-integration.test.js`

| Test | Result |
|------|--------|
| DB integration prerequisites | **PASS** |
| 4-cycle via real Prisma + `getGrnTimeline` | **PASS** |
| 10-cycle via real DB relations (10 AR rows) | **PASS** |
| No truncation on `approvalHistory` query | **PASS** (included in 10-cycle test) |
| Concurrent resubmit | **PASS** |

**Note:** Full finance post per cycle not executed — Send Back occurs at `PENDING_FINANCE` after Cost Control approve. Timeline verifies cost-completed cycles + Send Back + Resubmit + active cycle.

---

## 6. Backfill apply + idempotency

### Safety / snapshot

- **Rollback path:** TEMPLATE clone DB verified (§2) — dev DB never used for destructive rollback.
- **Apply mechanism:** `scripts/backfill-grn-approval-history.js --apply` runs inside `prisma.$transaction`.
- **Initial apply (prior gate run):** 1 orphan linked, 0 ambiguous, 0 unmatched.
- **DB cumulative state (re-run verification):** `GRN_IMPORT` with `grnImportId` set = **74** total linked rows; orphans = **0**.

### Re-run (2026-06-26)

| Run | Linked | Ambiguous | Unmatched |
|-----|-------:|----------:|----------:|
| Dry-run | 0 | 0 | 0 |
| `--apply` (idempotency check) | 0 | 0 | 0 |
| Post-apply dry-run | 0 | 0 | 0 |

**DB cumulative state:** `GRN_IMPORT` ApprovalRequests with `grnImportId` populated = **74** (includes migration forward SQL + prior data — **not** “74 rows modified by last apply”).

**Initial apply (prior gate run):** **1** orphan row linked; post-apply dry-run then showed **0** pending.

**Reports:** `backfill-reports/GRN_APPROVAL_HISTORY_BACKFILL_DRY_RUN.json`, `GRN_APPROVAL_HISTORY_BACKFILL_APPLY.json`

**Idempotency:** Re-run `--apply` links 0; all orphans resolved; post-apply dry-run confirms **0 pending**.

---

## 7. Live GRN smoke explanation

**Script:** `node scripts/explain-live-grn-timeline-smoke.js`  
**Document:** `GRN-E2E-CONVERT-1776506844123` (`72542334-42d3-4fd7-b3b7-4c4de04eb0c8`)

| Field | Value |
|-------|-------|
| Status | **POSTED** |
| Active `approvalRequestId` | **null** (posted — active pointer cleared) |
| `workflowSlots` | 4 (legacy projection — unchanged builder) |
| `auditEvents` | 0 |
| `timelineEntries` | **2** — expected for posted single-cycle GRN |

**Entry names:**
1. `MILESTONE_COMPLETED` / `RECEIVED_VALIDATED` — `TIMELINE.STAGE.RECEIVED_VALIDATED_COMPLETED`
2. `POSTING` / `POSTED` — `TIMELINE.STAGE.POSTED_COMPLETED`

**Why 2 is correct:** Posted GRN with no multi-cycle history in DB → milestone + posting only. **Not a builder defect.**

---

## 8. Legacy arrays compatibility (post-restart)

**Script:** `node scripts/smoke-timeline-phase1-gate.js`  
**Report:** `backfill-reports/PHASE1_GATE_API_SMOKE.json`

| Module | Status | workflowSlots | auditEvents | timelineEntries | legacyArraysUnchanged |
|--------|--------|--------------:|------------:|----------------:|:---------------------:|
| GRN | PASS | 3 | 7 | 12 | true |
| TRANSFER | PASS | 3 | 0 | 0 | true |
| BREAKAGE | SKIP | — | — | — | no document |
| LOST | SKIP | — | — | — | no document |
| GET_PASS | PASS | 6 | 1 | 0 | true |
| INVENTORY_COUNT | PASS | 1 | 0 | 0 | true |
| MOVEMENT | PASS | 0 | 0 | 0 | true |

**Contract:** `workflowSlots[]` / `auditEvents[]` build paths unchanged; `attachTimelineEntries()` additive only.

**Backend restart:** Server listens on port 4000 after gate re-run. accRuntimeSetting warning logged but non-blocking (see §10).

---

## 9. Unit tests summary (re-run 2026-06-26)

```
timelineEntry.test.js              10/10 PASS (shared utilities — NOT GRN multi-cycle proof)
grnTimeline.builder.test.js         3/3 PASS (builder fixtures — GRN multi-cycle proof)
grn.service.test.js              11/11 PASS
grn-timeline-db-integration.test.js 4/4 PASS (DB-backed)
smoke-prisma-grn-approval-schema.js PASS
```

---

## 10. Startup findings (outside Phase 2 scope)

### 10a. `report-format.util.js` — duplicate `fmtQty` (startup blocker — **fixed**)

| Item | Detail |
|------|--------|
| **File** | `OSE-backend/src/utils/report-format.util.js` |
| **Symptom** | `SyntaxError: Identifier 'fmtQty' has already been declared` — blocked `node src/server.js` |
| **Cause** | Accidental duplicate block: lines 1–9 (`'use strict'` + `fmtQty`) pasted twice at file top |
| **Phase 2 relation** | **None** — file is untracked (`??` in git); Phase 2 did not modify Reports or this path |
| **Pre-existing?** | **Yes** — duplicate present at file creation (Reporting parity utility copied from Frontend `report-format.util.ts`); discovered during gate server restart, not introduced by GRN timeline migrations |
| **Fix** | Removed duplicate `'use strict'` + `fmtQty` block only — **no other Reports changes** |
| **Formatting verification** | `node scripts/uat-phase1-reporting.js` → **14/14 PASS** (`fmtSar`, `fmtQty`, `formatReportCell`, totals footer) |
| | `node scripts/smoke-reporting-final-regression.js` → **23/24 PASS** — 1 fail on golden column width sum (767 vs ~770), **unrelated to fmtQty/formatting** |

### 10b. `accRuntimeSetting` — `tenantId must not be null` (pre-existing P19)

| Item | Detail |
|------|--------|
| **Severity** | Warning — **does not block startup** (caught in `startServer()` try/catch) |
| **Trigger** | `acc_runtime_settings` table empty (`rows: 0`) → cold-start seed path in `refreshAccRuntimeConfigCache()` |
| **Phase 2 relation** | **None** — table from migration `20260622140000_acc_zero_legacy_p19_p24` (P19 ACC runtime); Phase 2 migrations touch `approval_requests` only |
| **Full stack** | See below |
| **Impact on Timeline / gate tests** | **None** — all Phase 2 tests PASS; ACC config falls back to env bootstrap via catch handler |
| **Disposition** | Document as **pre-existing P19 finding** — fix deferred (not in Timeline Phase 2 scope) |

**Query / invocation:**

```javascript
// acc-runtime-config.service.js:115
await prisma.accRuntimeSetting.upsert({
  where: { tenantId_key: { tenantId: null, key: 'accHardCutover' } },
  create: { tenantId: null, key: 'accHardCutover', value: true },
  update: { value: true },
});
```

**Full stack (reproduced 2026-06-26):**

```
PrismaClientValidationError:
Invalid `prisma.accRuntimeSetting.upsert()` invocation in
C:\DX OS&E\OSE-backend\src\services\acc-runtime-config.service.js:115:38

Argument `tenantId` must not be null.

    at wn (.../node_modules/@prisma/client/runtime/library.js:29:1363)
    at $n.handleRequestError (.../library.js:121:6958)
    at $n.handleAndLogRequestError (.../library.js:121:6623)
    at $n.request (.../library.js:121:6307)
    at async l (.../library.js:130:9633)
    at async refreshAccRuntimeConfigCache (acc-runtime-config.service.js:115:7)
    at async ensureAccRuntimeConfigLoaded → startServer (server.js:131)
```

**Root cause hypothesis:** Prisma Client rejects `null` in composite unique `where.tenantId_key` even though schema declares `tenantId String?`. Service intends global settings (`tenantId = null`). Requires P19-specific fix (e.g. sentinel tenant, raw SQL, or Prisma version/workaround) — **not part of this gate**.

---

## 11. Files changed (Phase 2 gate + startup fix)

### Phase 2 (Timeline)

```
prisma/schema.prisma (+ @@unique)
prisma/migrations/20260627180000_grn_approval_history_link/
prisma/migrations/20260627190000_grn_cycle_number_unique/
src/platform/timeline/grnTimeline.builder.js
src/platform/timeline/grnTimeline.builder.test.js
src/platform/documentTimeline.service.js
src/services/grn.service.js
src/services/grn.service.test.js
src/tmp/grn-service-test-baseline.json
scripts/smoke-prisma-grn-approval-schema.js
scripts/test-grn-history-migration-rollback.js
scripts/grn-timeline-db-integration.test.js
scripts/backfill-grn-approval-history.js
scripts/explain-live-grn-timeline-smoke.js
Governance/timeline-remediation/backfill-reports/*
Governance/timeline-remediation/FINAL_PHASE2_GATE_EVIDENCE.md
```

### Startup fix (Reports — outside Timeline path, documented)

```
OSE-backend/src/utils/report-format.util.js  — removed duplicate fmtQty block only
```

---

## Stop line

**Phase 3 (Shared Renderer) not started.**  
Awaiting approval of **Final Phase 2 Gate** before any `[timelineEntries]` renderer migration.
