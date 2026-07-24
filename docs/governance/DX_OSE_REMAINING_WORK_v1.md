# DX OSE — Remaining Work Only

**Date:** 2026-07-21  
**Scope:** DX Grand Palace where tenant-specific; platform-wide where the affected code is shared.  
**Rule:** This document lists open work only. It is not a historical completion log and authorizes no implementation, deployment, data change, role change, or constitutional decision.

## Priority 0 — Stock and posting integrity

### 1. Complete Get Pass reversible-concurrency pilot

**Description:** Conditional atomic updates were added locally to reversible checkout and return release. The real DB test did not start because the preload path was passed as `test/harness/preload.js` instead of `./test/harness/preload.js`.

- **Affected code:** `src/services/postingGovernedGetPass.service.js`; `test/integration/characterization/get-pass-reversible-concurrency.test.js`
- **Severity:** 🔴
- **Status:** Started; stopped before test execution at `MODULE_NOT_FOUND` for the preload path. No test data was created.
- **Exact next step:** Review the two local diffs, then run only the isolated test with the corrected preload path against guarded database `ose_inventory_test`; stop and report the first functional/assertion failure without automatic remediation.

### 2. Posting idempotency — prevent duplicate effects

**Description:** Current duplicate guards are mostly `findFirst` followed by `create`, without a database-enforced posting-effect identity. Get Pass partial-return retries can create a fresh return record and repeat the effect even without concurrent requests.

- **Affected code:** `postingGovernedMovement.service.js`; `postingGovernedGrn.service.js`; `postingGovernedTransfer.service.js`; `postingGovernedGetPass.service.js`; `posting.service.js`; `getPass.service.js`; `prisma/schema.prisma`
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Inventory the legitimate ledger-row cardinality for every document type and define a proposed immutable `postingEffectKey`/source-line identity before requesting approval for any schema change.

### 3. Concurrency phase 2 — Breakage and Lost

**Description:** Both final-post paths read available stock, validate in JavaScript, then decrement unconditionally. Competing documents can consume the same availability and write stale `balanceAfter`.

- **Affected code:** `src/services/postingGovernedMovement.service.js`; callers in `breakage.service.js` and `lostItems.service.js`
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Add an isolated two-transaction test for competing Breakage/Lost documents, then prepare a shared conditional update returning on-hand, blocked quantity, and WAC.

### 4. Concurrency phase 3 — Store Transfer

**Description:** Transfer source has the same read-then-decrement race; destination receipt also writes an absolute quantity/WAC calculated from a stale read. A concurrent outbound or receipt can corrupt quantity or valuation.

- **Affected code:** `src/services/postingGovernedTransfer.service.js`; caller in `transfer.service.js`
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Characterize source and destination behavior with simultaneous transfers into and out of one item/location before changing the source decrement or destination weighted receipt.

### 5. Concurrency phase 4 — Get Pass permanent movement

**Description:** Permanent checkout decrements source stock after a separate read; destination receipt uses stale absolute quantity/WAC. The path is more sensitive because it crosses hotel custody and discrepancy handling.

- **Affected code:** `src/services/postingGovernedGetPass.service.js`; callers in `getPass.service.js`
- **Severity:** 🔴
- **Status:** Not started; reversible-only pilot remains unverified.
- **Exact next step:** After the reversible pilot passes and is approved, write an isolated permanent-checkout/destination-receipt concurrency characterization test without touching existing Get Pass records.

### 6. Concurrency phase 5 — Generic Movement and negative Adjustments

**Description:** Generic outbound types and negative adjustments validate a previously read balance before decrement. The generic route also retains legacy/internal movement reachability and some documents can be posted from `DRAFT`.

- **Affected code:** `src/services/posting.service.js`; `movement.controller.js`; `movement.routes.js`; `movement.service.js`
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Map every currently reachable movement type through `postDocument`, including its allowed lifecycle status, before replacing the shared decrement branch.

### 7. Concurrency phase 6 — Saved Stock Report and legacy Stock Count

**Description:** Negative variances use stale reads; Saved Stock Report approval and posting are separate transactions and lack a race-safe posting claim. A failed post can leave approval completed without inventory effects.

- **Affected code:** `src/services/posting.service.js`; `stockReport.service.js`; `postingEngine.service.js`
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Reproduce concurrent approval/post and post-failure behavior on disposable test fixtures, then document the required transaction/idempotency boundary.

### 8. Concurrency phase 7 — Canonical Inventory Count

**Description:** Policy-B adjustment is computed from a live balance but a concurrent movement after that read can invalidate the decrement and ledger target. Approval and posting are also separated.

- **Affected code:** `src/services/posting.service.js`; `inventoryCount.service.js`
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Define expected behavior when stock changes during count posting—recompute Policy B or return a deterministic conflict—then encode that decision in a real concurrent DB test.

### 9. Concurrency phase 8 — Inbound receipts, Opening Balance, and WAC

**Description:** GRN, Transfer destination, permanent Get Pass receipt, good return, and some positive adjustments calculate absolute quantity/WAC from stale reads. Opening Balance has separate overwrite semantics and must not be treated as a normal receipt.

- **Affected code:** `postingGovernedGrn.service.js`; `postingGovernedTransfer.service.js`; `postingGovernedGetPass.service.js`; `posting.service.js`
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Build a two-receipt test proving the lost-update/WAC behavior, then specify one database-side weighted-receipt contract and a separate expected-state contract for Opening Balance.

### 10. Closing Snapshot WAC reconstruction

**Description:** The active snapshot builder accumulates quantity but takes the latest positive ledger unit cost instead of replaying weighted value. Mixed receipt prices can produce an incorrect closing WAC and inventory value.

- **Affected code:** `src/platform/periodLedgerSnapshot.service.js`; call site in `periodClose.service.js`; `ledgerReplay.service.js`
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Add a deterministic ledger fixture with two different receipt costs and compare current snapshot output with weighted replay before selecting one valuation engine.

### 11. Reject zero-quantity posting lines consistently

**Description:** Some posting paths skip zero lines rather than rejecting the document, so a document can post with silently omitted lines. This conflicts with the requirement that every posted line has positive quantity.

- **Affected code:** `postingGovernedMovement.service.js`; other posting branches in `posting.service.js`
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Enumerate every `continue`/skip branch for non-positive quantities and add characterization tests showing which document types currently post successfully with zero lines.

### 12. Enforce integer quantities on inter-hotel return arrival

**Description:** Ordinary Process Return validates whole numbers, but inter-hotel arrival accepts finite fractional `goodQty`, `damagedQty`, and `lostQty`. Fractional return dispositions can therefore reach stock/workflow mutation.

- **Affected code:** `src/services/getPass.service.js`, inter-hotel return-arrival path around `goodQty`/`damagedQty`/`lostQty`
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Add characterization tests submitting fractional values for all three disposition fields, then apply the existing integer guard before any transaction or mutation.

## Priority 1 — Period governance and accounting metadata

### 13. Inventory Count must block period close

**Description:** Nonterminal Inventory Count sessions are emitted as `WARNING`; close readiness only checks `BLOCKER`. A period can therefore close before count differences are posted.

- **Affected code:** `periodCloseGovernance.service.js`; `periodClose.service.js`; Period Close frontend workspace
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Write a test where an in-period `COUNTING` session is the only finding and prove that Complete Close currently succeeds, then define exact period-scoping for the blocker.

### 14. Explicit, audited period opening

**Description:** Period rows can be created directly as `OPEN`, including provisioning/bootstrap paths, without a dedicated opening actor, verification, or audit event. Start/Complete Close can also create a missing period implicitly.

- **Affected code:** `periodClose.service.js`; `periodGuard.service.js`; `superAdmin.service.js`; period bootstrap migration; Period Close API/UI
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Map every `PeriodClose` creation call and decide the required pre-OPEN state and opening audit payload before proposing schema or workflow changes.

### 15. Atomic Complete Close boundary

**Description:** Blocker validation and snapshot construction currently occur before the transaction that writes snapshot/state changes. An intervening posting can change the ledger after validation or snapshot reads and before the period becomes CLOSED.

- **Affected code:** `periodClose.service.js`; `periodCloseGovernance.service.js`; `periodLedgerSnapshot.service.js`
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Write a real concurrent test that pauses Complete Close after blocker validation while another transaction posts, then specify the required isolation/locking boundary before changing code.

### 16. Opening verification against prior CURRENT snapshot

**Description:** Posting checks only that the target period is `OPEN`; it does not require reconciliation of opening quantity/value/WAC with the previous closing snapshot. The missing verification is present every month even when values happen to agree.

- **Affected code:** `periodGuard.service.js`; `periodClose.service.js`; `periodLedgerSnapshot.service.js`; Period Close API/UI
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Define and generate a read-only comparison report for previous CURRENT snapshot versus next-period opening state before deciding the persistence and posting gate.

### 17. Posting Date and Assigned Posting Period completeness

**Description:** Five document entities lack both fields, while additional active mirror/update paths leave existing fields null or derive an incorrect date. Ledger rows are generally more complete than their source/mirror documents.

- **Affected code:** `prisma/schema.prisma`; `posting.service.js`; `postingGovernedGrn.service.js`; `lostItems.service.js`; `postingGovernedGetPass.service.js`; `getPass.service.js`
- **Severity:** 🔴
- **Status:** Not started; any schema change requires explicit approval.
- **Exact next step:** Produce a field-by-field mapping for Inventory Count, Store Requisition, Store Issue, Get Pass Return, Saved Stock Report, and existing Movement mirrors, identifying the authoritative ledger source for each missing value.

### 18. Retire active `PERIOD_CLOSE_MANAGE`

**Description:** The legacy bundle is still accepted for view, close, resolution, cancel, and reopen; the frontend also depends on it for navigation. It remains part of the normal Finance Manager path rather than dormant compatibility.

- **Affected code:** `periodClose.routes.js`; `catalog.constitution.js`; `base-role-permissions.js`; ACC seed scripts; frontend routes/navigation/governance guards
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Generate a read-only usage/grant inventory showing every role and UI/backend check that still depends exclusively or additionally on `PERIOD_CLOSE_MANAGE`.

### 19. Tenant-local business day and period boundaries

**Description:** Storage is UTC, but report days and assigned periods use UTC calendar boundaries; the available auto-close timezone setting is not applied consistently. Transactions near local midnight can fall on the wrong hotel day/month.

- **Affected code:** `report-date-range.util.js`; `periodGuard.service.js`; `postingPeriod.util.js`; `periodAutoClose.service.js`; scheduler; tenant/timezone schema
- **Severity:** 🟡
- **Status:** Not started; a canonical Tenant timezone source is not established.
- **Exact next step:** Document expected outcomes for Saudi local times around 00:00 and month-end, then run read-only boundary tests against current utilities.

### 20. Period `ARCHIVED` lifecycle

**Description:** The Constitution defines `ARCHIVED`, but the database and service support only OPEN/CLOSING/CLOSED. Current closing works, but archive actor/time and a distinct immutable state cannot be represented.

- **Affected code:** `prisma/schema.prisma`; `periodClose.service.js`; Period Close API/UI
- **Severity:** 🟢
- **Status:** Not started; requires a governance decision before any schema work.
- **Exact next step:** Confirm whether archive is a real operational transition or whether the Constitution should treat long-term CLOSED as archival.

## Priority 1 — Access-control cleanup

### 21. Retire active ADMIN and legacy authority

**Description:** ADMIN remains defined and can obtain effective authority through legacy `role_permissions` fallback. The latest snapshot recorded 43 fallback permissions, 9 active assignments, and 10 memberships; a repository seed can reintroduce an active ADMIN membership.

- **Affected code:** `role-codes.constants.js`; `resolvePermissions.js`; `rbac.service.js`; `tenant.service.js`; `prisma/seeds/index.js`; ACC/tenant provisioning and role-assignment UI
- **Severity:** 🔴
- **Status:** Not started; live state must be revalidated before any deactivation.
- **Exact next step:** Run a read-only inventory for ADMIN roles, memberships, UR assignments, legacy grants, and provisioning entry points scoped by tenant, then present the exact rows/actions for approval.

### 22. Remove or quarantine RECEIVER and three E2E roles

**Description:** `RECEIVER`, `E2E_ROLE_A_1783042125830-169d38`, `E2E_ROLE_B_1783042125830-169d38`, and `E2E_VIEW_ONLY_1783042125830-169d38` were each recorded with one active assignment and one membership, while absent from the canonical catalog.

- **Affected code/data:** ACC roles, memberships, UR assignments and legacy role permissions; `workflow-pending.definitions.js` contains a RECEIVER presentation label
- **Severity:** 🔴
- **Status:** Not started; snapshot evidence exists, current live state needs read-only confirmation.
- **Exact next step:** Produce a role-by-role dependency report listing active users, assignments, permissions, workflow references, and tenant scope before requesting deactivation or deletion.

### 23. Retire ACC legacy fallback and uncatalogued permissions

**Description:** Roles without UR grants can still resolve permissions from legacy database rows; live test/legacy permission codes and middleware aliases sit outside the structured catalog or alter apparent meaning.

- **Affected code:** `resolvePermissions.js`; `rbac.service.js`; `authorize.js`; `catalog.constitution.js`; ACC seed/reconciliation scripts
- **Severity:** 🔴
- **Status:** Not started.
- **Exact next step:** Export a read-only matrix of every active role with UR grant count, fallback status, legacy-only codes, aliases, and affected users; do not disable fallback until all required authority is represented in UR.

### 24. Decompose composite `MANAGE` operations

**Description:** `MANAGE` is not universally View+Edit in runtime behavior; some bundles gate create, approve, reject, post, and delete together. Custom grants can therefore be broader or internally inconsistent.

- **Affected code:** `catalog.constitution.js`; `authorize.js`; GRN, Inventory Count, Master Data and other route permission guards
- **Severity:** 🟡
- **Status:** Not started.
- **Exact next step:** Build a route-to-operation matrix for each active `*_MANAGE` key and identify the first bundle whose removal does not require workflow redesign.

## Priority 2 — Reporting, evidence, and lifecycle alignment

### 25. #48 — Report-export ghost rows and raw UTC dates

**Description:** Project-owner evidence states that Breakage, Loss, and Inventory Change History `.xlsx` exports contain repeated subtotal/ghost rows and unrelated dates mixed into quantity/value columns; ordinary `SUM()` can produce approximately four times the correct result. Inventory Change History also displays raw UTC as the previous local day, while PDF and system totals remain correct.

- **Affected code:** Exact root cause not yet verified. Initial inspection target: `report.service.js`, Excel row/group/footer builders, `report-analytics-totals.js`, report column contracts, Inventory Change History export/date formatting.
- **Severity:** 🟡
- **Status:** Verbally documented by the project owner from an earlier review; code verification and reproducible fixture not started.
- **Exact next step:** Obtain one affected workbook or regenerate all three exports from a disposable/test fixture, classify every physical worksheet row (data/group/subtotal/footer), and compare Excel totals/dates against API/PDF before proposing a code change.

### 26. Item Import template creates separate ghost/preview rows

**Description:** This is separate from #48. The official Item Import template extends the used range through row 100 via validation/formatting and pre-populates a nameless row; round-trip parsing can show one false invalid preview row and inflated totals.

- **Affected code:** `src/controllers/item.controller.js`; `src/services/item.service.js`; frontend Item Import preview; missing regression coverage in item controller/service tests
- **Severity:** 🟡
- **Status:** Open; technical cause reproduced in memory, but no implementation or release-gate coverage exists.
- **Exact next step:** Add a failing template-generation → parse round-trip test asserting no unnamed row, correct preview totals, and no unintended used-range rows before choosing whether generation or logical-empty filtering should change.

### 27. Breakage reports include legacy `APPROVED`

**Description:** Financial Breakage reporting includes both POSTED and APPROVED rows and computes totals from document lines without requiring `postedAt` or ledger evidence. Anomalous or legacy APPROVED rows can therefore overstate official losses.

- **Affected code:** `report.service.js`; lifecycle/evidence presentation compatibility
- **Severity:** 🟡
- **Status:** Not started.
- **Exact next step:** Run a read-only reconciliation of every APPROVED Breakage row against `postedAt` and ledger effects, separating legitimate legacy rows from unposted anomalies.

### 28. Preserve original Get Pass notes

**Description:** `acceptReturnIntoDepartment` can append Manager Acceptance Notes to the original Get Pass `notes` field instead of keeping workflow evidence in a separate channel.

- **Affected code:** `getPass.service.js`, especially `acceptReturnIntoDepartment`
- **Severity:** 🟡
- **Status:** Not started.
- **Exact next step:** Trace every write to `GetPass.notes` after creation and list which audit/evidence field already exists for each appended workflow note.

### 29. Current Stock Balance “As of” presentation is misleading

**Description:** The report reads live `stockBalance`, but the workspace still exposes snapshot/date mode and exported presentation can say “As of …”. The selected date does not turn the live source into a historical balance.

- **Affected code:** `report-workspace.handlers.js`; `report-analytics.service.js`; frontend `reporting-workspace.registry.ts`; related export labels
- **Severity:** 🟡
- **Status:** Not started.
- **Exact next step:** Trace the selected date from UI request through handler/export and add a characterization test proving it does not change the live balance dataset.

### 30. Separate Checked Out and Dispatched evidence

**Description:** Active inter-hotel flow implements checkout and dispatch as one OUT transition and one timestamp. Inventory movement works, but separate actors, times, permissions, and elapsed duration cannot be audited.

- **Affected code:** `getPass.service.js`; `getPassTimeline.builder.js`; Get Pass schema/status enum; destination queue and frontend detail
- **Severity:** 🟡
- **Status:** Not started; requires confirmation that the hotel treats these as two physical events.
- **Exact next step:** Confirm the physical operating procedure with Security/Logistics and decide whether this is a workflow gap or a constitutional wording mismatch before changing code.

### 31. Unit-conversion boundary enforcement

**Description:** Manual/ordinary movements operate as base-unit quantities while item conversion metadata is not applied; imported GRN UOM mapping does perform conversion. A non-base quantity reaching a manual API can be treated 1:1.

- **Affected code:** `movement.service.js`; `grn.service.js`; `mapping.service.js`; Item/UOM models and GRN frontend
- **Severity:** 🟡
- **Status:** Not started.
- **Exact next step:** Enumerate every API accepting `unitId`, `qty`, and `qtyInBaseUnit`, and verify whether each rejects non-base units or applies an approved mapping.

### 32. Resolve Constitution Chapter 6 numbering collisions

**Description:** Path A renumbering applied: merge-inserted Chapter 6 clauses are now contiguous §6.10–§6.18 (former combined §6.22 split into §6.16 close + §6.17 reopen). D11 `(§6.11, §6.17)` Snapshot/Report Versioning citation deferred. Chapters 30/31 remain reserved/not merged; 32/33 unchanged.

- **Affected documents:** `DX_OSE_34_Clause_Merge_Report_v1.pdf`; `DX_OSE_CONSTITUTION_v2.2.docx/.pdf`; `DX_OSE_CONSTITUTION_v2.1_MERGE_REPORT.md`
- **Severity:** 🟢
- **Status:** Done (numbering + merge-report notes); D11 citation rewrite still deferred.
- **Exact next step:** Later governance review for D11 citation targets and optional merge of Snapshot/Report Versioning / Ch30–31 content (out of Path A scope).

### 33. Decide BDR-007 — Void versus Cancelled

**Description:** BDR-007 is **Active**: user-facing terminal state = **Void / Voided**; action button label = **Cancel**. Constitution Ch.2.5 editability row is **Void** only. Display layer maps internal `CANCELLED` document statuses to Voided; `ApprovalStatus.CANCELLED` remains technical approval-chain status. `MovementStatus.CANCELLED` retained in schema for legacy rows (no enum drop).

- **Affected documents/code:** Constitution v2.2 Ch.2.5 / Appendix B; FE i18n MSG_* success copy; inventory-count notes; lifecycle display mapping
- **Severity:** 🟢
- **Status:** Done (BDR-007 Active; display + docs).
- **Exact next step:** None for terminology; optional later data cleanup of legacy `MovementStatus.CANCELLED` rows only under a separate migration decision.

## Quick release checklist — still required before any push/deployment

- [ ] Obtain explicit approval to resume and complete the paused Get Pass pilot.
- [ ] Review the exact service/test diff; confirm no production file outside the approved scope changed.
- [ ] Correct and run the isolated test command using `./test/harness/preload.js`.
- [ ] Confirm the test guard reports `NODE_ENV=test`, localhost, and database name exactly `ose_inventory_test`.
- [ ] Confirm the test creates and removes its own tenant, users, items, locations, periods, balances, Get Passes, and ledger rows.
- [ ] Verify no query or fixture references DX Grand Palace IDs, July closed periods, or existing snapshots.
- [ ] Confirm `prisma/schema.prisma` and migration directories are unchanged for phase 1.
- [ ] Run the targeted concurrency proof, then relevant integration/unit suites and backend/frontend builds.
- [ ] Preserve the real test output as release evidence; do not replace a failed run with only a later successful run.
- [ ] Review duplicate-document output separately: phase 1 does not claim idempotency.
- [ ] Scan staged files for `.env`, `.env.*`, database URLs, JWT secrets, credentials, generated exports, screenshots, and raw tenant/user data.
- [ ] Keep `.env.test.local` untracked; commit only sanitized `.env.test.example` if needed.
- [ ] Verify runtime env values separately for `DATABASE_URL`, JWT secrets, ACC feature flags, storage configuration, and scheduler/period settings.
- [ ] Resolve the repository state before release: the current root status shows major tracked Governance deletions plus untracked `OSE-backend/`, `OSE-Frontend/`, and `.gitignore`; do not deploy from this state without explicit review.
- [ ] Confirm no live test roles, disposable tenants, or test ledger rows remain.
- [ ] Obtain explicit approval for production activation; local code presence is not deployment authorization.
- [ ] Record rollback scope: restore the prior two target functions and remove/disable the isolated test if the pilot is rejected.

