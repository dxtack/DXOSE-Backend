# Phase 2 — GRN Data Model + Unlimited Cycles Evidence

**Date:** 2026-06-26  
**Status:** Complete — stopped before Phase 3.

---

## Migration result

**Migration:** `20260627180000_grn_approval_history_link`

```sql
approval_requests.grnImportId  UUID nullable, FK → grn_imports
approval_requests.cycleNumber  INT NOT NULL DEFAULT 1
INDEX approval_requests_grnImportId_idx
```

**Applied:** `npx prisma migrate deploy` — success.

**Prisma validate:** schema valid.

**Prisma generate:** blocked by running server file lock (EPERM on query_engine DLL). Migration + runtime use existing client; regenerate after server restart if needed.

---

## Prisma relations (explicit)

| Relation | Side A | Side B |
|----------|--------|--------|
| **GrnActiveApproval** | `GrnImport.approvalRequestId` → `ApprovalRequest` | `@relation("GrnActiveApproval")` |
| **GrnApprovalHistory** | `ApprovalRequest.grnImportId` → `GrnImport` | `@relation("GrnApprovalHistory")` |

No generic `documentType`/`documentId` FK for GRN history.

---

## Write-path changes

| Path | Change |
|------|--------|
| `submitForApproval` | Sets `grnImportId` + `cycleNumber`; logs `SUBMIT` / `GRN_RESUBMIT` audit with cycle numbers when prior cycles exist |
| `sendBackGrn` | On cancel, sets `grnImportId` on AR (history link); clears active pointer only |
| `_ensureGrnApprovalStarted` | Sets `grnImportId` + `cycleNumber` on new AR |

**RESUBMIT:** explicit business transition only (`submitForApproval` after prior cycles). **Never** inferred from `notes` text.

---

## Builder

**File:** `OSE-backend/src/platform/timeline/grnTimeline.builder.js`

- `buildGrnTimelineRawEntries(grn, auditEvents)` — history from `approvalHistory` + active `approvalRequest`
- Wired in `getGrnTimeline()` → `attachTimelineEntries(..., rawEntries)`
- **Legacy:** `buildGrnWorkflowTimeline()` unchanged for `workflowSlots[]`

---

## Backfill dry-run (before `--apply`)

**Script:** `OSE-backend/scripts/backfill-grn-approval-history.js`

**Command:** `node scripts/backfill-grn-approval-history.js`

**Report:** `Governance/timeline-remediation/backfill-reports/GRN_APPROVAL_HISTORY_BACKFILL_DRY_RUN.json`

| Metric | Count |
|--------|------:|
| Linked (would apply) | 1 |
| Ambiguous | 0 |
| Unmatched | 0 |

**Apply not run** — dry-run only per plan. Use `--apply` after human review.

---

## Unit tests (actual GRN builder)

**File:** `grnTimeline.builder.test.js`

**Command:** `node --test src/platform/timeline/grnTimeline.builder.test.js`

| Test | Result |
|------|--------|
| GRN builder 4-cycle (3 Send Back + cycle 4 active) | PASS |
| GRN builder 10-cycle mandatory | PASS |
| RESUBMIT not from notes | PASS |

**Note:** `timelineEntry.test.js` 4/10 cycle tests remain **shared sort/merge utility** tests only — not GRN multi-cycle proof.

---

## Legacy compatibility

**Wording:** Legacy arrays structurally and semantically unchanged.

- `workflowSlots[]` still from `buildGrnWorkflowTimeline()` — no builder change
- `auditEvents[]` still from `fetchAuditEvents()` — unchanged order
- `timelineEntries[]` additive via `attachTimelineEntries()`
- Phase 1 gate service smoke: GRN `workflowSlotsCount=4`, `auditEventsCount=0`, `timelineEntriesCount=2`

---

## Phase 1 Final Gate (completed before Phase 2)

| Check | Result |
|-------|--------|
| Timeline unit tests (10) | PASS |
| GRN builder tests (3) | PASS |
| `smoke-constitution-v2-platform.js` | PASS |
| `npm run build` (Frontend) | PASS |
| Service-layer timeline smoke | PASS |
| `en.json` / `ar.json` valid, no duplicate keys | PASS |

---

## Files changed

```
OSE-backend/prisma/schema.prisma
OSE-backend/prisma/migrations/20260627180000_grn_approval_history_link/migration.sql
OSE-backend/src/services/grn.service.js
OSE-backend/src/platform/documentTimeline.service.js
OSE-backend/src/platform/timeline/grnTimeline.builder.js
OSE-backend/src/platform/timeline/grnTimeline.builder.test.js
OSE-backend/scripts/backfill-grn-approval-history.js
OSE-backend/scripts/smoke-timeline-phase1-gate.js
scripts/validate-i18n-json-keys.mjs
Governance/timeline-remediation/backfill-reports/*
Governance/timeline-remediation/PHASE2_GRN_EVIDENCE.md
```

---

## Risks before Phase 3

1. **Renderer still uses legacy inputs** — FE unchanged; user sees old timeline until Phase 3.
2. **Backfill not applied** — historical cancelled AR may lack `grnImportId` until `--apply`.
3. **Prisma generate** — retry after stopping backend server.
4. **`grn.service.test.js`** — 4 pre-existing failures (concurrency version in mocks); unrelated to Phase 2.

---

## Next: Phase 3

Shared `returns-workflow-timeline` — `[timelineEntries]` input; legacy consumers unchanged.
