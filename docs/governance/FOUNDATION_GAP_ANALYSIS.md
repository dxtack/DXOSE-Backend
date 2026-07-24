# DX OSE — Foundation Gap Analysis (Phase 1)

| Field | Value |
|--------|--------|
| **Version** | 1.0 |
| **Date** | 2026-05-14 |
| **Scope** | As-implemented backend (`OSE-backend`), frontend contracts (`OSE-Frontend` enums/routes), cross-checked against `PRODUCT_CONTRACTS.md` and `WORKFLOW_MATRIX.md` v1.0 |
| **Purpose** | Define **stabilization-only** gaps: inconsistencies, governance drift, audit/report/posting risks, and duplication—**not** feature expansion. |

---

## 1. Executive summary

The system already encodes strong principles in places (for example, explicit posting engines, period guards, and movement guards that block manual `TRANSFER_IN` / `TRANSFER_OUT` and direct `RECEIVE` without GRN). However, **the same persistence and business concepts are surfaced through multiple HTTP lifecycles**, **posting and ledger pairing rules are not uniform across document types**, and **audit logging uses two writer patterns** into one table. Several matrix rows remain **`TBD` / `Needs Review`**, which is accurate: **Get Pass** and **Lost** posting semantics are distributed and easy to misread without a single authoritative state machine doc per transition.

**Highest combined risk (operational + audit):** dual **inventory count** surfaces on `StockCountSession` with **different approval depth, different posting engines, different ledger reference types**—and historically **different period-date semantics at post** (now **aligned** on `countDate`/`createdAt` for both posting functions). This still threatens “trust in numbers” and reviewer-grade traceability until APIs and posting engines converge.

---

## 2. Review methodology

1. Read `docs/governance/PRODUCT_CONTRACTS.md` and `docs/governance/WORKFLOW_MATRIX.md` as the compliance baseline.  
2. Verified implementation in `OSE-backend/prisma/schema.prisma`, `OSE-backend/src/services/posting.service.js`, `OSE-backend/src/services/inventoryCount.service.js`, `OSE-backend/src/services/stockCount.service.js`, `OSE-backend/src/services/breakage.service.js`, `OSE-backend/src/services/lostItems.service.js`, `OSE-backend/src/services/periodGuard.service.js`, `OSE-backend/src/services/movement.service.js`, `OSE-backend/src/services/audit.service.js`, `OSE-backend/src/services/auditTrail.service.js`, routes under `OSE-backend/src/routes/`, and `OSE-Frontend/src/app/core/models/enums.ts`.  
3. Classified gaps by contract area (Product Contracts §1–§4, Feature governance) and by risk type.

---

## 3. Workflow inconsistencies

### 3.1 Inventory count: two APIs, two lifecycles, one table

| Aspect | Canonical `/api/inventory-count` | Legacy `/api/stock-count` |
|--------|----------------------------------|---------------------------|
| Routes | `inventoryCount.routes.js` — explicit `authorize` on approve | `stockCount.routes.js` — `POST /:id/approve` has **no** route-level permission; comment says “RBAC handled in service” |
| Approval | `submitForApproval` builds a **single-step** `ApprovalRequest` (`totalSteps: 1`, `FINANCE_MANAGER`) | `submitForApproval` builds **three steps** (HOD → Cost → Finance) |
| Posting | `postingService.postInventoryCountSession` — variances from `StockCountLocationQty`, `referenceType: COUNT_SESSION` | `postingService.postStockCount` — variances from `StockCountLine`, `referenceType: STOCK_COUNT`, **single** `session.locationId` |
| Period guard date | `postInventoryCountSession` uses **`session.countDate` or `session.createdAt`** for `checkPeriodLock` *(aligned with `postStockCount` as of inventory-count stabilization)* | `postStockCount` uses **`session.countDate` or `session.createdAt`** (whichever is set) |

**Impact:** Same `StockCountSession` model can follow **incompatible** paths; reviewers comparing ledger to “the count” may not know which surface produced the adjustment or which date governed period lock. **Violates** Product Contract **§1.1** (explicit transition → posting), **§1.2** (reduce special cases), and **§3** (declared truth source).

### 3.2 `MovementStatus` overload

`StockCountSession.status` uses `MovementStatus`, which also drives movement documents (breakage, lost, manual movements). Count-specific states (`COUNTING`, `REVEAL_REVIEW`, `RECOUNTING`) live in the **same** enum as operational movement states.

**Impact:** Higher chance of **semantic collision** in UI, reports, and filters; frontend `MovementStatus` type in `enums.ts` is **incomplete** versus Prisma (missing count-specific states), increasing type-level drift.

### 3.3 Breakage vs lost: parallel chains with subtle posting differences

Both use `ApprovalRequest`-driven steps and `MovementDocument`. **Breakage** finalizes with `_postBreakageInTransaction`; **lost** uses `applyStockImpactOnFinalApproval`. For `GET_PASS_RETURN`, both paths can record **ledger without decrementing `qtyOnHand`**, with comments that physical stock was already adjusted earlier—**valid if consistently enforced**, but **easy to mis-audit** if partial failures or alternate entry paths exist.

**Lost** additionally supports **legacy** `approve-dept` / `approve-cost` / … routes for `INTERNAL` docs **without** an approval request, while unified approval uses `POST /lost/:id/approve`—**dual mental models** on one document type (documented partially in code comments, not in matrix row 4).

### 3.4 GRN: overlapping “status” controls

Matrix lists both `POST /grn/:id/post` and `PATCH /grn/:id/status` (approve/reject style). Controller restricts finance on PATCH (e.g. finance may only reject). **Posting** remains on `postGrn`; PATCH is not the ledger trigger—**good**—but **two channels to terminal-ish states** increases support burden and audit narrative fragmentation unless every transition is logged uniformly.

### 3.5 Stock report (saved) vs retired upload workflow

`stockReport.routes.js` wires several paths to `retiredWorkflow` while keeping `GET /saved` and PDF export active. **Operational truth** for “which stock report path is canonical” is **ambiguous** without customer-facing routing inventory (matrix §14 already flags TBD).

### 3.6 Period close model vs guards

`PeriodClose.status` is a **string** (`OPEN` / `CLOSED`), not a Prisma enum; `periodGuard.service.js` queries `status: 'CLOSED'`. **Behavior is consistent internally** but weaker than enum-backed contracts for schema-level enforcement (Product Contract **§1.1** “explicit finite set” as north star).

---

## 4. Governance violations (mapped to Product Contracts)

| Contract | Violation / drift |
|----------|-------------------|
| **§1.1 Canonical document model** | Same document store (`StockCountSession`) exposed by two workflow APIs; period lock basis differs between posting functions. |
| **§1.2 No silent posting** | No undocumented silent posting was confirmed for GRN PATCH vs POST in this pass; **risk** remains where ledger writes occur outside `posting.service.js` (breakage, lost, get pass, GRN service paths)—posting is **distributed**, not only one module. |
| **§1.2 One approval philosophy** | Count: **1-step finance** vs **3-step** legacy; stock-count approve route lacks symmetric `authorize` middleware. |
| **§1.3 Audit consolidation** | **Two writers**: `audit.service` (`log`) vs `auditTrail.service` (`logAction`) → same `AuditLog` table, different optional fields (`note` vs `ipAddress` / `userAgent` usage patterns). |
| **§3 Reporting truth** | Multiple ledger `referenceType` values for count-like events (`STOCK_COUNT`, `COUNT_SESSION`, `STOCK_REPORT`); export/filter parity not verified file-by-file in this pass—**risk** flagged below. |
| **§4 Audit strategy** | Duplicate write patterns; `logAction` uses string `action` while schema has `AuditAction` enum—relies on valid enum members at call sites; not all domain services use the same helper. |
| **Feature governance** | `WORKFLOW_MATRIX.md` correctly marks several **Needs Review** items; codebase still behaves as **source of truth**, so matrix **must** be updated when stabilization changes transitions (matrix maintenance rule). |

---

## 5. Operational risks

1. **Wrong count API in production** — Operations or integrations could use legacy `/stock-count` while the product narrative emphasizes `/inventory-count`, producing different approval burden and different ledger references.  
2. **Period lock bypass perception** — Inventory count posting uses “today” for period check, not necessarily `countDate` / snapshot semantics; finance may believe count is locked to count month while engine uses wall-clock date.  
3. **Get Pass reverse logistics** — Ledger and balance updates are spread across `getPass.service.js` (many touch points). Without a maintained per-transition matrix, **on-call debugging** is slower and error-prone.  
4. **Breakage / lost GET_PASS_RETURN** — If upstream steps fail to remove on-hand quantity, **ledger-only** finalization can desync financial records from physical stock.  
5. **Retired stock-report routes** — Partial retirement can strand users or scripts on dead paths if gateway documentation lags.

---

## 6. Semantic conflicts

| Topic | Conflict |
|-------|----------|
| **“POSTED”** | GRN `POSTED`, movement `POSTED`, count session `POSTED`, store issue `POSTED`—same word, different document classes and immutability rules. |
| **“APPROVED”** | Transfers/requisitions vs movement documents vs count sessions—approval does **not** universally imply posting (matrix cross-cutting note is correct; risk is **UI copy** implying otherwise). |
| **Requisition states** | Frontend `RequisitionStatus` type omits `PENDING_DEPT`, `PENDING_FINANCE`, `PENDING_FINAL` present in Prisma—**client/server drift** for filters and labels. |
| **MovementStatus** | Frontend type omits count lifecycle states present in Prisma. |
| **Count variance source** | “Book” quantity may come from live balances at sheet generation (`useLiveBalances` path) versus snapshot semantics—must be one **declared truth** per report (Contract **§3.2**). |

---

## 7. Duplicated logic areas

1. **Posting / ledger + balance** — `posting.service.js` (manual/count/stock report) vs **inline** transactions in `breakage.service.js`, `lostItems.service.js`, `getPass.service.js`, `transfer.service.js`, `grn` path (not fully enumerated here). Duplication increases the chance one path **skips** `balanceAfter`, WAC rules, or period guard.  
2. **Audit logging** — `audit.service` and `auditTrail.service` (Product Contract **§1.3** already names this debt).  
3. **Approval step machinery** — `ApprovalRequest` / `ApprovalStep` shared across types, but **role gates** differ (route `authorize`, `requirePermission`, controller asserts, service-only checks).  
4. **Auto-lock opening balance** — Similar tenant setting upserts appear in multiple posting functions inside `posting.service.js` (intentional repeat but still a **single-policy** maintenance point).

---

## 8. Reporting risks

1. **Reference type fragmentation** — Ledger rows for adjustments may reference `STOCK_COUNT`, `COUNT_SESSION`, or `STOCK_REPORT`; OMC / valuation / custom exports must **include all** or explicitly exclude with reason—otherwise **under-reported variance**.  
2. **Dual count engines** — Reports that assume “one count posting model” may double-count or miss variances if session populated via cells vs lines inconsistently.  
3. **UI vs export filters** — Product Contract **§3.1** requires on-screen filters to match exports; not every report component was audited in this pass—**treat as verification backlog** per report family (`report-engine`, valuation, summary, generated reports).  
4. **Valuation at posting time** — `postInventoryCountSession` documents `CURRENT_WAC_AT_POSTING`; any report using frozen count-time value must not mix without a declared basis.

---

## 9. Audit risks

1. **Dual audit writers** — Narrative fragmentation: some flows log via `auditTrail.logAction` with `note`, others via `audit.service.log` with IP/UA; consumers of `audit_log` may see **inconsistent shapes**.  
2. **Best-effort swallow** — Both services catch errors and log to console/logger; aligns with “must not break flow” but **weakens hard audit** targets for posting (Contract **§4.2** target state: posting class events should be **hard requirement** eventually).  
3. **Posting outside central engine** — Harder to prove **complete** coverage of “who posted what, when, from which transition” unless each domain service logs a **canonical** event with document number and reference keys.  
4. **Matrix TBDs** — Lost posting, Get Pass posting map, period close vs lock relationship—audit **procedures** cannot be finalized until matrix and code agree.

---

## 10. Recommended stabilization priorities

Ordered by **highest operational and audit impact first** (stabilization, not feature work).

| Priority | Item | Rationale |
|----------|------|-----------|
| **P0** | **Unify or strictly gate `StockCountSession` lifecycles** — single customer-facing API or mutual exclusion (e.g. env **`BLOCK_LEGACY_STOCK_COUNT_CREATE`**). **Period lock at post:** `postStockCount` and `postInventoryCountSession` both use **`countDate` / `createdAt`** for `checkPeriodLock` (aligned). | Remaining dual API + dual engine risk until full convergence. |
| **P0** | **Document and test posting triggers** for breakage, lost, get pass, GRN, transfer receive—single internal doc derived from code, then sync `WORKFLOW_MATRIX.md`. | Closes `TBD` / `Needs Review` gaps; reduces silent dispute risk. |
| **P1** | **Consolidate audit write path** — migrate callers to one module (`auditTrail` extended or `audit.service` unified), normalize `entityType`/`action` usage, decide on IP/UA and `note` policy. | Contract **§1.3** / **§4** explicit objective. |
| **P1** | **Harmonize route-level authorization** — legacy stock-count `approve` / evidence / list now require **`VIEW_INVENTORY`** at the route (`stockCount.routes.js`); service step-role checks unchanged. | Reduces anonymous-posting surface vs `authenticate` only. |
| **P1** | **Reporting truth pass** — per report, declare scope + truth source; verify export uses same query parameters as UI (Contract **§3**). | Reduces “Excel says something else” disputes. |
| **P2** | **Frontend enum parity** with Prisma for `MovementStatus`, `RequisitionStatus`, and any other drift found by codegen or CI check. | Prevents wrong labels and client-side branching. |
| **P2** | **Period close schema hardening** — migrate `PeriodClose.status` string to enum when safe; align all readers/writers. | Schema-level governance alignment. |
| **P2** | **Stock report retirement** — complete customer path audit (matrix §14); remove or clearly 410/redirect dead routes to reduce confusion. | Operational clarity. |
| **P3** | **Dashboard ordering vs Contract §5** — validate “stuck / SLA first” against `dashboard.service.js` widget ordering; adjust only if current layout contradicts charter without large UI redesign. | Mostly ordering/priority, not new widgets. |

---

## 11. Explicit non-goals (per Phase 1 charter)

Per user instructions, this analysis **does not** propose: UI redesign, new modules, AI features, ERP expansion, new workflows, or broad refactors without justification. Recommended work is **alignment, consolidation, documentation, and guardrails** only.

---

## 12. Next engineering artifacts (suggested)

1. **Delta update** to `WORKFLOW_MATRIX.md` after P0 verification (same PR as code, per matrix maintenance rule).  
2. **Test / smoke matrix** row for each posting transition touched in P0–P1 (Contract: “no silent posting changes without tests/smoke notes”).  
3. Optional: **glossary** file for `POSTED` / `APPROVED` / `Received` per document class (Product Contract **§3.2**)—only if product wants it; not required to close this gap doc.

---

## References (implementation)

- Governance: `docs/governance/PRODUCT_CONTRACTS.md`, `docs/governance/WORKFLOW_MATRIX.md`  
- Posting: `OSE-backend/src/services/posting.service.js`  
- Count (canonical): `OSE-backend/src/services/inventoryCount.service.js`, `OSE-backend/src/routes/inventoryCount.routes.js`  
- Count (legacy): `OSE-backend/src/services/stockCount.service.js`, `OSE-backend/src/routes/stockCount.routes.js`  
- Breakage / lost: `OSE-backend/src/services/breakage.service.js`, `OSE-backend/src/services/lostItems.service.js`  
- Period guard: `OSE-backend/src/services/periodGuard.service.js`  
- Movement guards: `OSE-backend/src/services/movement.service.js`  
- Audit: `OSE-backend/src/services/audit.service.js`, `OSE-backend/src/services/auditTrail.service.js`  
- Schema: `OSE-backend/prisma/schema.prisma`  
- Frontend types: `OSE-Frontend/src/app/core/models/enums.ts`
