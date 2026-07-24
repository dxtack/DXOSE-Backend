# Phase 8 — Movement Workflow & Returns Approve Modal Evidence

**Date:** 2026-06-26  
**Status:** **PASS — Discovery complete; Approve Modal regression PASS**

---

## 8.1 Discovery — Registry vs Standalone

| Question | Evidence |
|----------|----------|
| Movement list role | **Hybrid registry** over `movement_documents` — lists all posted/pending movement rows |
| `New Movement` | Creates **standalone draft** via `createMovementDraft()` (`OSE-backend/src/services/movement.service.js`) |
| Detail route | `/movements/:id` → `MovementFormComponent` |
| Governed types | `BREAKAGE`, `LOST`, `COUNT_ADJUSTMENT` — owned by source modules; register view is **read-only mirror** |
| Direct types | `ADJUSTMENT`, `OPENING_BALANCE`, `RETURN`, etc. — **DRAFT → POST** (no ApprovalRequest) |
| Approval on register | Only when `movementType` is BREAKAGE/LOST (via `approvalRequests` relation) |
| Register badges | Posting-centric: DRAFT / AWAITING_POSTING / POSTED / REJECTED / VOID (`movement-register-display.util.ts`) |
| Timeline on detail | `auditEvents` via `GET /constitution/timeline/MOVEMENT/:id` — **not** unified `timelineEntries` migration |
| Ledger link | Posted documents show ledger rows via `LedgerService.byDocument()` |

**Decision:** Movement register is an **aggregated operational view**. Constitution unified timeline authority for governed documents lives on **Breakage / Lost Items / Inventory Count** detail pages (Phases 3–7). Movement-form retains **audit supplement** only — avoids duplicate approval timelines. Direct internal movements (ADJUSTMENT) expose actor/datetime via POST audit rows.

**Routing note:** List navigates to `/movements/:id` for all types (including governed). Register detail is read-only; users with workflow permissions use source module lists for actions. No functional routing bug evidenced.

---

## 8.2 Workflow States (Register Display)

| Raw status | Register display |
|------------|------------------|
| DRAFT | DRAFT |
| `postedAt` set / POSTED | POSTED |
| REJECTED | REJECTED |
| VOID | VOID |
| FINANCE_APPROVED, PENDING_GM, etc. | AWAITING_POSTING |

---

## 8.3 Constitution Mapping

| Requirement | Movement disposition |
|-------------|---------------------|
| C02-2.8-001..008 | **Satisfied at source module** for BREAKAGE/LOST/COUNT_ADJUSTMENT; Movement register audit path is supplementary |
| C22-22.3-001 | In-scope workflow modules migrated to `timelineEntries[]`; Movement register excluded from migration scope (no duplicate timeline) |

**No new Requirement opened** — governed workflows already remediated on source detail views.

---

## 8.4 Posting Verification (Register)

For governed posted rows (e.g. COUNT_ADJUSTMENT from Inventory Count Phase 7):

| Source | Check |
|--------|-------|
| Inventory Count timeline | POSTING entry with ledger reconciliation **PASS** |
| Inventory Ledger | COUNT_ADJUSTMENT row **PASS** |
| Stock Balance | `balanceAfter` matches counted qty **PASS** |

Direct ADJUSTMENT movements: POST audit action `POST` logged in `posting.service.js`; ledger rows appear on movement-form when read-only.

---

## 8.5 Returns Approve Modal Regression

| Check | Result |
|-------|--------|
| `documentContext + approvedOnly` preserved | **PASS** (`returns-workflow-approve-modal.component.html`) |
| Not forced to `timelineEntries` | **PASS** |
| Approved steps only | **PASS** (spec: `documentContext + approvedOnly path unchanged`) |
| No duplicate / layout break | **PASS** (unchanged binding) |

Evidence: `OSE-Frontend/src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.spec.ts` lines 235–242.

---

## 8.6 Tests

| Suite | Pass | Skip | Fail |
|-------|------|------|------|
| Phase 5 DB (Transfer/Breakage/Lost) | 3 | 0 | 0 |
| Shared renderer spec (approve modal path) | ✓ | 0 | 0 |
| Frontend build | ✓ | — | — |

**Runtime Movement fixtures:** Not required as separate seed — governed scenarios covered by Phase 5/7 source-module fixtures; register verified via existing movement_documents in tenant data.

---

## Risks

- Movement-form unified `timelineEntries` migration deferred intentionally to prevent duplicate timelines with source modules.
- List does not deep-link to Breakage/Lost/IC detail — pre-existing UX pattern, not a timeline blocker.
