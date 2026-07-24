# Transfer audit stabilization — analysis (Phase 1 slice)

| Field | Value |
|--------|--------|
| **Scope** | **Store transfer** API (`StoreTransfer` / `transfer.service.js`). **“Asset transfer”** in PDF/email copy refers to **loans** — no dedicated loan lifecycle service in this repo slice; analysis focuses on **inter-location store transfers**. |
| **Storage** | Same `audit_log` table; `entityType` = **`TRANSFER`** (`EntityType.TRANSFER`). |

---

## 1. Workflow summary (existing)

| Step | API (approx.) | Status transition | Ledger |
|------|----------------|-------------------|--------|
| Draft | `POST /transfers` | `DRAFT` | None |
| Submit | `POST …/submit` | `DRAFT` → `SUBMITTED` then approval pipeline sets `PENDING_*` | None |
| Approve / reject | `POST …/approve` / `…/reject` | Multi-step → `APPROVED` or `REJECTED` | None |
| Dispatch | `POST …/dispatch` | `APPROVED` → `IN_TRANSIT` | None |
| Receive | `POST …/receive` | `IN_TRANSIT` → `RECEIVED` / `CLOSED` | **`TRANSFER_OUT`** + **`TRANSFER_IN`** per line (atomic tx) |

**Movement guard:** `movement.service.js` blocks manual `TRANSFER_OUT` / `TRANSFER_IN`; economics run through **receive** only.

---

## 2. Gaps before this slice

| Gap | Severity | Notes |
|-----|----------|--------|
| **No `AuditLog` on any transfer transition** | **P1** | Operators relied on `StoreTransfer` rows + ledger only. |
| **No structured failure log on receive** | **P1** | Failures surfaced as API errors only. |
| **Multi-step approval** | **P1** | `approvalChain.service.js` mutates steps; no audit trail at service boundary. |
| **Update / delete draft** | **P2** | `updateTransfer` / `deleteTransfer` lack `userId` — cannot attribute actor without API change. |

---

## 3. Inconsistencies (pre-slice)

| Topic | Observation |
|--------|-------------|
| **Entity naming** | Prisma `requestType: STORE_TRANSFER` vs `EntityType.TRANSFER` — intentional shorthand; `note` prefixes **`STORE_TRANSFER_*`** disambiguate. |
| **Dispatch action** | No `DISPATCH` enum value — use **`UPDATE`** + `STORE_TRANSFER_DISPATCH` `note` (same pattern as Get Pass Phase A). |
| **Receive vs `POST`** | Receive creates ledger lines; one **`POST`** audit = “financial receipt completed” (document-level), not per line. |

---

## 4. Reconstruction model (after slice)

| Question | Source |
|----------|--------|
| Who initiated? | `CREATE` row `changedBy` = creator (`requestedBy` alignment). |
| Who submitted? | `SUBMIT` `changedBy`. |
| Who approved / rejected? | `APPROVE` / `REJECT` `changedBy` per action. |
| Who dispatched? | `UPDATE` (`STORE_TRANSFER_DISPATCH`) `changedBy`. |
| Who received / posted? | `POST` (`STORE_TRANSFER_RECEIVED_POSTED`) `changedBy`. |
| When? | `changedAt` on each row. |
| Which document? | `entityId` = transfer id; `afterValue.transferNo` / `note`. |

---

## 5. Residual risks

| Risk | Mitigation |
|------|------------|
| **Audit after DB commit** | Same non-atomic pattern as Phase C; rare mismatch if process crashes immediately after write. |
| **Draft edit/delete** | Documented gap until `userId` plumbed through. |

---

## Related

- `TRANSFER_AUDIT_PLAN.md`  
- `TRANSFER_AUDIT_SMOKE_RESULTS.md`  
- `AUDIT_CONSOLIDATION_ANALYSIS.md`
