# Phase 5 — Root Cause Audit (Final Clean Verification Addendum)

**Phase:** `phase-5-operational-details`  
**Scope:** Transfer, Breakage, Lost Items (GRN / Get Pass / IC excluded)  
**Generated:** 2026-06-28

## Executive summary

Prior Phase 5 browser PASS used Playwright request-rewriting patches (`installTransferConcurrencyPatch`, `installBreakageApprovePatch`, `installBreakageVoidPatch`), so production payload fidelity was not independently proven. The clean-verification addendum removed all request rewriting, strengthened ledger/action-matrix/void-timeline contracts, and re-ran gates. Additional product defects were found only after patches were removed. Final evidence: runtime **98/98**, browser **33/33**, regression **6/6**, all closure counters **0**, `requestRewriteCount: 0`, `phaseClosed: true`.

## Prior defects (verification reopen — still valid)

| ID | Defect | Fix |
|----|--------|-----|
| P5-DEF-001 | Breakage list returned Promise shells | `await withBreakageMediaUrls()` in list mapper |
| P5-DEF-002 | Transfer approve missing `concurrencyVersion` | Frontend sends version on submit/approve/reject |
| P5-DEF-003 | Transfer DRAFT timeline showed API error | Neutral empty state for DRAFT |
| P5-DEF-004 | Breakage void blocked on REJECTED | Allow void on DRAFT/REJECTED only |
| P5-DEF-005 | Breakage void missing reason | Frontend sends `reason` + `concurrencyVersion` |
| P5-DEF-006 | Breakage unified approve missing concurrency | Frontend sends `concurrencyVersion` |
| P5-DEF-007 | Transfer model syntax regression | Restore `TransferListApiPayload` |

## Clean-verification defects (proven after patch removal)

### P5-DEF-008 — Breakage Void timeline never emitted

| Field | Value |
|-------|-------|
| **Surface** | `GET /api/constitution/timeline/BREAKAGE/:id` after void |
| **Symptom** | `hasVoidTimeline: false`; API threw or omitted VOID entry |
| **Root cause** | `approvalTimeline.builder.js` did not emit VOID lifecycle entries; `timelineEntry.types.js` did not allow `lifecycleEventType: VOID` |
| **Fix** | Emit VOID from audit logs in builder; add `VOID` to allowed lifecycle types and sort weights; i18n `TIMELINE.LIFECYCLE.VOID` → “Voided” |

### P5-DEF-009 — Breakage reject missing concurrency version

| Field | Value |
|-------|-------|
| **Surface** | `POST /api/breakage/:id/reject` from detail modal |
| **Symptom** | HTTP 409 in clean browser `P5-CLEAN-BR-BRK-REJECT` |
| **Root cause** | `breakage.service.ts` `reject()` posted `{ comment }` only |
| **Fix** | Send `concurrencyVersion` from detail in reject modal and unified approval reject path |

### P5-DEF-010 — Transfer DRAFT PATCH crashed draft governance

| Field | Value |
|-------|-------|
| **Surface** | `PATCH /api/transfers/:id` on DRAFT |
| **Symptom** | HTTP 500 — Prisma `Unknown argument tenantId` on User |
| **Root cause** | `assertDraftOwnerActive` queried `user.tenantId` (non-existent field) |
| **Fix** | Resolve owner via `memberships: { some: { tenantId } }` |

### P5-DEF-011 — DELETE concurrency version ignored from query string

| Field | Value |
|-------|-------|
| **Surface** | `DELETE /api/transfers/:id?concurrencyVersion=N` |
| **Symptom** | HTTP 409 CONCURRENCY_VERSION_REQUIRED |
| **Root cause** | `parseVersionFromRequest` read body/If-Match only |
| **Fix** | Also parse `req.query.concurrencyVersion` |

## Invalidated prior evidence

| Finding | Why invalid |
|---------|-------------|
| Browser PASS with request patches | Patches injected `concurrencyVersion` / `reason` — not production-faithful |
| Void scenarios with `hasVoidTimeline: false` | Could not close until VOID timeline contract met |
| `ledger >= 1` style assertions | Replaced by exact field reconciliation |

## Clean-verification gate calibration (not product defects)

| ID | Finding | Resolution |
|----|---------|------------|
| P5-N-005 | Stale-concurrency denial logs CONCURRENCY_CONFLICT audit UPDATE | Denial harness uses `auditSuccess` count excluding conflict-only UPDATE rows |
| P5-N-006 | Transfer finance-post stock delta used seed-time snapshot | Browser gate re-snapshots stock immediately before finance post |
| P5-N-007 | Lost GM treatment matrix fixture at wrong stage | Added `lost.pendingGm` fixture at FINANCE_APPROVED |

## Closure counters (final)

All zero / true: `runtimeFailCount`, `browserFailCount`, `regressionFailCount`, `skippedCount`, `vacuousCount`, `requestRewriteCount`, `missingAllowBindingCount`, `missingDenyBindingCount`, `unexecutedActionBindingCount`, `ledgerFieldMismatchCount`, `missingVoidTimelineCount`, `unauthorizedVisibleMutationButtonCount`, `missingScenarioIdCount`; `frontendProductionBuildPass: true`.

## Phase closure

`phaseClosed: true` — clean browser verification with zero request rewriting; exact ledger/stock; full action-matrix allow+deny execution; void timeline proof; complete negative coverage. No Phase 6 work started. No Phase-5-Closed backup created.
