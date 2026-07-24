# DX OSE — Workflow Matrix (As-Implemented Reference)

| Field | Value |
|--------|--------|
| **Version** | 1.0 |
| **Created Date** | 2026-05-14 |
| **Product Owner** | DX OSE Product Leadership *(assign named owner)* |
| **Purpose** | Capture **current** workflow surfaces (states, HTTP transitions, posting triggers) as implemented in the codebase—**not** a theoretical template. |
| **Scope** | Backend routes under `OSE-backend/src/routes/` and enums/models in `OSE-backend/prisma/schema.prisma` as of charter date. Frontend-only nuances may require **Needs Review**. |

---

## How to read this matrix

- **Document type** — primary business object.  
- **States** — from Prisma enum or model field where applicable.  
- **Transitions (API)** — representative HTTP actions (prefix `/api` assumed).  
- **Posting trigger** — when stock/ledger changes **per product intent** (confirm in service if extending).  
- **Evidence** — attachments / exports / PDFs available in routes.  
- **Closure** — terminal or locked states.  
- **Operational owner** — **first-line** actor (not exclusive).  
- **Audit expectations** — what reviewers typically need; implementation detail may span `audit_log` and domain tables.

**Legend:** `TBD` = not fully verified in this pass; `Needs Review` = requires product/engineering walkthrough of service code paths.

---

## 1. Store transfer (`StoreTransfer`)

| Attribute | Detail |
|-----------|--------|
| **Primary model** | `StoreTransfer` (`store_transfers`) |
| **State enum** | `TransferStatus` |
| **States** | **Active (V2):** `DRAFT`, `PENDING_DEPT`, `PENDING_FINANCE`, `POSTED`, `REJECTED`. **Historical read-only (enum retained):** `SUBMITTED`, `PENDING_FINAL`, `APPROVED`, `IN_TRANSIT`, `RECEIVED`, `CLOSED` |
| **Transitions (API)** | `POST /transfers` (create DRAFT) · `PATCH /transfers/:id` (DRAFT) · `DELETE /transfers/:id` (DRAFT) · `POST /transfers/:id/submit` · `POST /transfers/:id/approve` · `POST /transfers/:id/reject` · `POST /transfers/:id/send-back` |
| **Approval** | `ApprovalRequest` with `requestType = STORE_TRANSFER` (multi-step; role gates in `approvalChain.service.js`) |
| **Posting trigger** | **Finance final approval** — atomic posting: `TRANSFER_OUT` (source) + `TRANSFER_IN` (destination); status → `POSTED`. **Not** on create, submit, dispatch, or receive. |
| **Evidence** | `GET /transfers/:id/evidence` (+ PDF); reason/notes on document |
| **Closure** | `POSTED` / `REJECTED`; DRAFT deletable. Legacy `RECEIVED`/`CLOSED`/`IN_TRANSIT` rows are read-only. |
| **Operational owner** | Storekeeper (create); Dept Manager + Finance Manager (approval chain) |
| **Retired (SYS-DEC-07)** | `POST /transfers/:id/dispatch` · `POST /transfers/:id/receive` — **removed**; no redirect/alias |
| **Audit expectations** | Transfer number, state transitions, approvers, receive quantities, ledger reference type `TRANSFER` |

**Source:** `prisma/schema.prisma` (`TransferStatus`, `StoreTransfer`), `routes/transfer.routes.js`, `services/transfer.service.js`, `services/approvalChain.service.js`

---

## 2. GRN — Goods receipt (`GrnImport`)

| Attribute | Detail |
|-----------|--------|
| **Primary model** | `GrnImport` (`grn_imports`) |
| **State enum** | `GrnStatus` |
| **States** | `DRAFT`, `VALIDATED`, `PENDING_APPROVAL` (legacy), `PENDING_FINANCE`, `APPROVED` (legacy), `POSTED`, `REJECTED` |
| **Governed flow** | Create → `VALIDATED` (Cost Control queue) → `PENDING_FINANCE` (Cost Control via `PATCH /grn/:id/status`) → `POSTED` (Finance via same endpoint; stock/ledger in one transaction) |
| **Transitions (API)** | `POST /grn` (create → `VALIDATED`) · `PATCH /grn/:id/status` (`PENDING_FINANCE` \| `POSTED` \| `REJECTED`) · legacy `POST …/validate`, `submit`, `approve`, `reject`, `resubmit` · `POST /grn/:id/post` **deprecated (410)** |
| **Role segregation** | Cost Control: `VALIDATED` → `PENDING_FINANCE` or reject. Finance: `PENDING_FINANCE` → `POSTED` or reject. `ORG_MANAGER` **not** in finance/cost patch roles (use dedicated test users in UAT). |
| **Posting trigger** | **`PATCH /grn/:id/status` with `POSTED`** only when status is `PENDING_FINANCE` — `postingEngine.postGrnInTransaction` inside the same DB transaction |
| **Evidence** | Invoice file on create (`pdfAttachmentUrl`); Excel import preview routes |
| **Closure** | `POSTED`, `REJECTED` (resubmit path) |
| **Operational owner** | Storekeeper (create, `GRN_MANAGE`); Cost Control (review); Finance Manager (final approve + post) |
| **Audit expectations** | GRN number, `approvedBy` (Cost Control), `postedBy` / `postedAt` (Finance), ledger references |
| **Detail / PDF presentation timeline** | Received & validated (`importedByUser`) → Cost Control approved (`approvedByUser`) → Finance approved (`postedByUser`) → Posted to inventory (system timestamp only). Actors are always the real system users who performed each step — not assumed role labels. Cost Control approval time is not persisted after finance post; UI shows actor only or “Date not recorded”. |

**Source:** `prisma/schema.prisma` (`GrnStatus`), `routes/grn.routes.js`, `services/grn.service.js`, `services/grn-workflow-presentation.util.js`

---

## 3. Breakage (`MovementDocument` + `movementType = BREAKAGE`)

| Attribute | Detail |
|-----------|--------|
| **Primary model** | `MovementDocument` (`movement_documents`) |
| **State enum** | `MovementStatus` (subset used by breakage pipeline) |
| **States (typical)** | Includes `DEPT_APPROVED`, `COST_CONTROL_APPROVED`, `FINANCE_APPROVED`, `APPROVED`, `REJECTED`, `VOID`, `POSTED` *(exact reachable set = service rules)* |
| **Transitions (API)** | `POST /breakage` (create + optional photo) · `POST /breakage/:id/submit` · `POST /breakage/:id/approve-dept` · `approve-cost` · `approve-finance` · `approve-gm` · `approve` · `reject` · `void` · `POST /breakage/:id/attachment` · evidence `GET /breakage/:id/evidence` (+ `/evidence/pdf`) |
| **Approval** | Multi-step; `APPROVE_BREAKAGE` permission family on approve/reject routes |
| **Posting trigger** | **Final approval / GM path** posts to ledger inside transaction (see `breakage.service.js` comments: final GM posts financial breakage) — **Needs Review** for exact stock vs ledger-only nuance per line type |
| **Evidence** | Photos + attachments; evidence pack endpoints |
| **Closure** | `APPROVED` / `VOID` / `REJECTED` (per service); **`void` requires `reason` (Ch.15.2)** |
| **Operational owner** | Dept / Cost / Finance / GM chain; storekeeper where create allowed |
| **Audit expectations** | Document no, approvers, attachments, ledger entries |

**Source:** `routes/breakage.routes.js`, `services/breakage.service.js`, `MovementType.BREAKAGE`

---

## 4. Lost items (`MovementDocument` + `movementType = LOST`)

| Attribute | Detail |
|-----------|--------|
| **Primary model** | `MovementDocument` |
| **State enum** | `MovementStatus` (pipeline parallels breakage; see `lostItems.service.js`) |
| **Transitions (API)** | `POST /lost-items` · `approve-dept` · `approve-cost` · `approve-finance` · `approve-gm` · `approve` · `reject` |
| **Approval** | `APPROVE_LOST` family |
| **Posting trigger** | **TBD / Needs Review** — confirm in `lostItems.service.js` for final post timing vs breakage parity |
| **Evidence** | **TBD** — verify attachment/evidence parity with breakage |
| **Closure** | **TBD** — terminal statuses |
| **Operational owner** | Same style approval chain as breakage (service comments) |
| **Audit expectations** | Same as breakage class documents |

**Source:** `routes/lostItems.routes.js`, `services/lostItems.service.js`

---

## 5. Get pass (`GetPass`)

| Attribute | Detail |
|-----------|--------|
| **Primary model** | `GetPass` (`get_passes`) |
| **State enum** | `GetPassStatus` |
| **States** | `DRAFT`, `PENDING_DEPT`, `PENDING_COST_CONTROL`, `PENDING_FINANCE`, `PENDING_GM`, `PENDING_SECURITY`, `APPROVED`, `OUT`, `RECEIVED_AT_DESTINATION`, `RETURNING`, `RETURN_RECEIVED_AT_GATE`, `PARTIALLY_RETURNED`, `RETURNED`, `CLOSED`, `REJECTED` |
| **Transitions (API)** | `POST /get-passes` · `PUT /get-passes/:id` · `DELETE /get-passes/:id` · `POST /get-passes/:id/submit` · `approve` · `reject` · `confirm-receipt` · `accept-into-department` · `ship-back` · `confirm-return-exit` · `confirm-return-arrival` · `accept-return-into-department` · `return` · `close` · `GET /get-passes/:id/pdf` |
| **Approval** | Mixed permissions per route (`GET_PASS_*`); some `approve` routes delegate to controller for role logic |
| **Posting trigger** | **Needs Review** — stock/ledger effects are distributed across return/checkout flows (`getPass.service.js`); map each transition to ledger events in a future matrix revision |
| **Evidence** | PDF export; rich domain fields on model (receipt condition/notes) |
| **Closure** | `CLOSED`, `REJECTED`, returned paths per enum |
| **Operational owner** | Issuing dept / security / destination roles (hotel-native) |
| **Audit expectations** | Pass number, cross-tenant internal transfer flags, timestamps on model |

**Source:** `prisma/schema.prisma` (`GetPass`, `GetPassStatus`), `routes/getPass.routes.js`

---

## 6. Store requisition (`StoreRequisition`)

| Attribute | Detail |
|-----------|--------|
| **Primary model** | `StoreRequisition` (`store_requisitions`) |
| **State enum** | `RequisitionStatus` |
| **States** | `DRAFT`, `SUBMITTED`, `PENDING_DEPT`, `PENDING_FINANCE`, `PENDING_FINAL`, `APPROVED`, `PARTIALLY_ISSUED`, `FULLY_ISSUED`, `CLOSED`, `REJECTED` |
| **Transitions (API)** | `POST /requisitions` · `PATCH /requisitions/:id` (DRAFT only) · `DELETE` (DRAFT) · `POST /requisitions/:id/submit` · `approve` · `reject` |
| **Approval** | Controller enforces manager guard (see `requisition.controller.js` header comments in codebase) |
| **Posting trigger** | **Not on requisition approval alone** — inventory issue via `StoreIssue` |
| **Evidence** | `remarks`, `rejectionReason` fields |
| **Closure** | `CLOSED`, `REJECTED`, issued states |
| **Operational owner** | Requesting department / approvers |
| **Audit expectations** | Req number, approval trail, link to issues |

**Source:** `prisma/schema.prisma` (`RequisitionStatus`), `routes/requisition.routes.js`

---

## 7. Store issue (`StoreIssue`)

| Attribute | Detail |
|-----------|--------|
| **Primary model** | `StoreIssue` (`store_issues`) |
| **State enum** | `IssueStatus` |
| **States** | `DRAFT`, `POSTED` |
| **Transitions (API)** | `POST /issues` · `PATCH /issues/:id` (DRAFT) · `DELETE` (DRAFT) · **`POST /issues/:id/post`** (atomic posting) |
| **Approval** | Implicit in posting permission (`ISSUE_CREATE` on post route) |
| **Posting trigger** | **`POST /issues/:id/post`** |
| **Evidence** | `attachmentUrl` field on model |
| **Closure** | `POSTED` |
| **Operational owner** | Storekeeper / issuer |
| **Audit expectations** | Issue no, link to requisition, postedAt |

**Source:** `prisma/schema.prisma` (`IssueStatus`), `routes/issue.routes.js`

---

## 8. Inventory count — canonical API (`StockCountSession` via `/api/inventory-count`)

| Attribute | Detail |
|-----------|--------|
| **Primary model** | `StockCountSession` (`stock_count_sessions`) |
| **State enum** | **`MovementStatus`** (count sessions reuse movement status enum) |
| **States (enum)** | `DRAFT`, `COUNTING`, `REVEAL_REVIEW`, `RECOUNTING`, `DEPT_APPROVED`, `COST_CONTROL_APPROVED`, `FINANCE_APPROVED`, `APPROVED`, `PENDING_APPROVAL`, `POSTED`, `VOID`, `REJECTED` |
| **Transitions (API)** | `POST /inventory-count/sessions` · `start` · `cancel` · `export` · `pdf` · `upload` · `sheets/...` · `updateCountedQty` · **`submit-counts`** · `variances` · **`submit-approval`** · **`approve`** · **`reject`** |
| **Approval** | **2-step chain:** step 1 `FINANCE_MANAGER` → session `FINANCE_APPROVED`; step 2 `GENERAL_MANAGER` → post. `approve` / `reject`: `FINANCE_MANAGER`, `GENERAL_MANAGER`, `ORG_MANAGER`, `SUPER_ADMIN` (routes). Bypass: `ORG_MANAGER`, `SUPER_ADMIN` only. |
| **Posting trigger** | **Final `approve` (GM step)** → `postingService.postInventoryCountSession` → session `POSTED` with `postedAt`. Finance step does **not** post. |
| **Period guard (posting)** | `postInventoryCountSession` calls `checkPeriodLock` using **`countDate`**, then **`createdAt`** if needed — **same basis as** legacy `postStockCount` (stabilization alignment). |
| **Evidence** | Excel + PDF exports; upload; variance review endpoints |
| **Closure** | `POSTED`, `VOID`/`REJECTED` / cancelled — **draft cancel requires `reason` (Ch.15.2)** via `POST .../cancel` |
| **Operational owner** | Storekeeper / cost / dept counting; **Finance then GM** approval before post |
| **Audit expectations** | Session no, blind mode, snapshot time, ledger entries for adjustments |

**Strategic note:** This path is the **killer module** anchor (count → variance → posting → evidence → audit).

**Presentation (UAT, read-only):** Detail screen and Evidence PDF share `inventory-count-workflow-presentation.util.js` via `getSession.workflowTimeline`. Timeline order: **Variance review (Cost Control — milestone, not an approval step)** → Finance approved → General manager approved → Posted to inventory (separate posting node). Evidence PDF KPIs: net signed variance value + absolute variance exposure.

**Source:** `routes/inventoryCount.routes.js`, `services/inventoryCount.service.js`, `StockCountSession.status`

---

## 9. Stock count — legacy API surface (`/api/stock-count`)

| Attribute | Detail |
|-----------|--------|
| **Primary model** | **Same** `StockCountSession` table |
| **Transitions (API)** | `POST /stock-count` · `PUT /stock-count/:id/lines` · `submit` · `approve` · `void` · evidence `GET .../evidence` (+ pdf/excel) |
| **Route guards** | Evidence + list/detail + **`approve`** require **`VIEW_INVENTORY`** (JWT/matrix). `POST /` create remains **`MANAGE_INVENTORY`** unless env blocks it (see below). |
| **Posting trigger** | **`approve`** → `processApproval` in `stockCount.service.js` (POSTED) |
| **Stabilization env** | `BLOCK_LEGACY_STOCK_COUNT_CREATE=1` → `POST /stock-count` returns **403** (`LEGACY_STOCK_COUNT_CREATE_DISABLED`); use **`POST /api/inventory-count/sessions`**. `LEGACY_STOCK_COUNT_TELEMETRY=1` → structured access logs for this mount. |
| **Product note** | **Dual surface** to same persistence (`/inventory-count` vs `/stock-count`). Consolidation/deprecation is a **Phase 1** governance topic—do not invent new third paths. |

**Source:** `routes/stockCount.routes.js`

---

## 10. Manual movement (`MovementDocument` via `/api/movements`)

| Attribute | Detail |
|-----------|--------|
| **Primary model** | `MovementDocument` |
| **State enum** | `MovementStatus` |
| **Transitions (API)** | `POST /movements` · `PUT /movements/:id` · **`POST /movements/:id/post`** |
| **Posting trigger** | **Post** action (service guards special cases—e.g. direct `TRANSFER_IN`/`TRANSFER_OUT` blocked; transfers must use transfer API) |
| **Evidence** | `attachmentUrl`, `photoKey`, notes |
| **Closure** | `POSTED`, `VOID`, `REJECTED` |
| **Operational owner** | Storekeeper / admin |
| **Audit expectations** | movementType, documentNo, posting |

**Source:** `routes/movement.routes.js`, `services/movement.service.js` (guard comments)

---

## 11. Period close (`PeriodClose`)

| Attribute | Detail |
|-----------|--------|
| **Constitution** | Chapter 6 — Period Management (D1–D12, 2026-07-05) |
| **Primary model** | `PeriodClose` (`period_closes`) — Period Registry per tenant/year/month |
| **State field** | `OPEN` · `CLOSING` · `CLOSED` (no `Archived`; no `month = null` annual row) |
| **Transitions (API)** | `GET /period-close` · `GET /period-close/:id` · **`POST /period-close/close`** · **`POST /period-close/:id/reopen`** |
| **Close flow** | `OPEN → CLOSING` (validation + resolution workspace) → `CLOSED` when Blockers = 0 |
| **Reopen** | Latest closed period only; reverse sequential; mandatory reason; `PERIOD_REOPEN_EXECUTE` |
| **Re-close** | `OPEN → CLOSING → CLOSED`; new Snapshot Version; prior → SUPERSEDED |
| **Approval** | ACC permission codes (§6.15) — not role-hardcoded routes |
| **Posting trigger** | Close creates CURRENT snapshot from ledger through period end; posting guard via Central Period Guard |
| **Evidence** | `notes`; immutable Snapshot Versions in `PeriodSnapshot` (+ version status) |
| **December** | UI label **December - Year End Closing**; same engine as other months |
| **Auto Close** | Optional per hotel; same validation engine; notify on blockers |
| **Operational owner** | Finance (ACC-granted) |
| **Audit expectations** | Close, reopen, re-close, workspace actions, auto close attempts, snapshot superseding |

**Source:** `prisma/schema.prisma` (`PeriodClose`), `routes/periodClose.routes.js`, Constitution §6

---

## 12. Lost & found item (`LostFoundItem`)

| Attribute | Detail |
|-----------|--------|
| **Primary model** | `LostFoundItem` (`lost_found_items` map) |
| **State enum** | `LostFoundStatus` — `FOUND`, `RETURNED` |
| **Transitions (API)** | `POST /lost-found` · `PATCH /lost-found/:id/return` |
| **Posting trigger** | **None** in matrix sense (operational record, not inventory posting by default) |
| **Evidence** | `photoKey` |
| **Closure** | `RETURNED` |
| **Operational owner** | Security / housekeeping (hotel context) |
| **Audit expectations** | Create + return timestamps |

**Source:** `prisma/schema.prisma` (`LostFoundItem`), `routes/lostFound.routes.js`

---

## 13. Generated reports (`GeneratedReport`)

| Attribute | Detail |
|-----------|--------|
| **Primary model** | `GeneratedReport` (report engine persistence) |
| **Behavior** | `POST /reports/generate` creates artifacts; exports `GET /reports/:id/excel|pdf` |
| **Posting trigger** | **N/A** (reporting reads data; does not post stock) |
| **Workflow class** | **Analytics output**, not an operational document—**do not** treat as inventory workflow |

**Source:** `routes/reports.routes.js`

---

## 14. Saved stock report (legacy stock report surface)

| Attribute | Detail |
|-----------|--------|
| **Routes** | `GET /stock-report/saved`, `saved/:id`, `saved/:id/pdf` |
| **Matrix status** | **TBD / Needs Review** — `stockReport.routes.js` marks some flows **retired**; confirm active customer path before documenting lifecycle |

**Source:** `routes/stockReport.routes.js`

---

## Cross-cutting: `ApprovalRequest` / `ApprovalStep`

Used by multiple workflows (`ApprovalRequestType` enum includes `BREAKAGE`, `STORE_TRANSFER`, `COUNT_ADJUSTMENT`, `STOCK_REPORT`, etc.). **Posting** remains **document-specific**—do not assume approval alone posts.

---

## Canonical sources (for updates)

| Layer | Path |
|--------|------|
| Schema | `OSE-backend/prisma/schema.prisma` |
| HTTP surfaces | `OSE-backend/src/routes/*.routes.js` |
| Posting engine | `OSE-backend/src/services/posting.service.js` |
| Period guard | `OSE-backend/src/services/periodGuard.service.js` |

---

## Maintenance rule

When code changes a state machine:

1. Update this matrix **in the same PR** (or open a follow-up ticket with **due date ≤ 5 days**).  
2. If uncertain, use **`TBD / Needs Review`**—**never** invent transitions.

---

## Version history

| Version | Date | Notes |
|---------|------|------|
| 1.0 | 2026-05-14 | Initial extraction from schema + routes |
