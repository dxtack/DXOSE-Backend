# Audit consolidation — Phase C smoke results (posting & approval coverage)

| Field | Value |
|--------|--------|
| **Phase** | **C** — session/document-level `AuditLog` for inventory count & stock report **submit / approve / reject / post**, plus posting engines with failure logging. |
| **Design** | **No per-ledger-line** audit rows; one **`POST`** per successful posting run. |

---

## 1. Implemented audit chain (summary)

| Workflow | Step | `entityType` | `action` | `note` prefix (operator filter) |
|----------|------|---------------|----------|----------------------------------|
| **Inventory Count** | Submit counts (→ REVEAL_REVIEW) | `STOCK_COUNT` | `SUBMIT` | `INVENTORY_COUNT_SUBMIT_COUNTS` |
| **Inventory Count** | Submit for approval | `STOCK_COUNT` | `SUBMIT` | `INVENTORY_COUNT_SUBMIT_FOR_APPROVAL` |
| **Inventory Count** | Approve (before ledger post) | `STOCK_COUNT` | `COUNT_APPROVE` | `INVENTORY_COUNT_APPROVE` |
| **Inventory Count** | Reject | `STOCK_COUNT` | `COUNT_REJECT` | `INVENTORY_COUNT_REJECT` |
| **Inventory Count** | Post ledger | `STOCK_COUNT` | `POST` | `INVENTORY_COUNT_POSTED` (`afterValue.referenceType=COUNT_SESSION`) |
| **Stock Report** | Submit | `STOCK_REPORT` | `SUBMIT` | `STOCK_REPORT_SUBMIT` |
| **Stock Report** | Approve (before ledger post) | `STOCK_REPORT` | `APPROVE` | `STOCK_REPORT_APPROVE` |
| **Stock Report** | Reject | `STOCK_REPORT` | `REJECT` | `STOCK_REPORT_REJECT` |
| **Stock Report** | Post ledger | `STOCK_REPORT` | `POST` | `STOCK_REPORT_POSTED` |
| **Legacy stock count** | Submit for approval | `STOCK_COUNT` | `SUBMIT` | `LEGACY_STOCK_COUNT_SUBMIT_FOR_APPROVAL` |
| **Legacy stock count** | Approve step (incl. multi-step) | `STOCK_COUNT` | `COUNT_APPROVE` | `LEGACY_STOCK_COUNT_APPROVE_STEP` / `…APPROVE_FINAL` |
| **Legacy stock count** | Reject | `STOCK_COUNT` | `COUNT_REJECT` | `LEGACY_STOCK_COUNT_REJECT` |
| **Legacy stock count** | Post ledger | `STOCK_COUNT` | `POST` | `LEGACY_STOCK_COUNT_POSTED` (`referenceType=STOCK_COUNT`) |

---

## 2. Posting failure visibility

| Engine | On failure |
|--------|------------|
| `postInventoryCountSession` | `logger.error('[Posting] postInventoryCountSession failed', { sessionId, tenantId, message, code })` then rethrow |
| `postStockCount` | `logger.error('[Posting] postStockCount failed', …)` then rethrow |
| `postStockReport` | `logger.error('[Posting] postStockReport failed', …)` then rethrow |

**No `POST` audit row** is written if the posting transaction throws (correct: no silent success).

**Stock report approve:** `APPROVE` audit is written **after** the approval DB transaction and **before** `postStockReport`. If posting fails, the audit trail may show **`APPROVE` without a following `POST`** — use logs + session/report status for support (pre-existing partial-failure class).

---

## 3. Commands (local)

**Static enum / action contract (no DB):**

```bash
cd OSE-backend && node scripts/smoke-audit-phase-c-static.js
```

**Windows PowerShell:**

```powershell
cd OSE-backend; node scripts/smoke-audit-phase-c-static.js
```

---

## 4. Run record

| Date (UTC) | Script | Result |
|------------|--------|--------|
| 2026-05-14 | `node scripts/smoke-audit-phase-c-static.js` | `pass: true` |

---

## 5. DB-backed evidence (recommended staging)

1. **Inventory count:** `SUBMIT` (counts) → `SUBMIT` (for approval) → `COUNT_APPROVE` → `POST` for same `entityId` (session id).  
2. **Reject path:** `COUNT_REJECT` without `POST`.  
3. **Stock report:** `SUBMIT` → `APPROVE` → `POST` (or `REJECT` without `POST`).  
4. **Legacy stock count:** multi-step `COUNT_APPROVE` notes include `step=` until `APPROVE_FINAL` + `POST`.

---

## 6. Rollback

| Change | Rollback |
|--------|----------|
| Phase C audit inserts + posting try/catch logs | Revert PR touching `inventoryCount.service.js`, `stockReport.service.js`, `stockCount.service.js`, `posting.service.js`, governance + smoke script. |

No migrations. Historical `AuditLog` rows from Phase C remain if already written.

---

## 7. Remaining uncovered areas (post–Phase C)

| Area | Gap |
|------|-----|
| **Store transfers** | Approve/reject/dispatch/receive — no `AuditLog` chain in scope. |
| **Movement / GRN / other postings** | Only `postDocument` had `MOVEMENT`/`POST` already; other engines not exhaustively listed here. |
| **Stock report `saveStockReport`** | Still only Phase A adjacent coverage (`CREATE` on save in controller from earlier work — unchanged). |
| **Mapping / raw `prisma.auditLog.create`** | Still bypasses `logAction` facade (Phase B). |
| **Per-line / per-cell detail** | Intentionally out of scope (session/document level only). |

---

## Related

- `AUDIT_CONSOLIDATION_ANALYSIS.md`  
- `AUDIT_EVENT_CATALOG.md`  
- `AUDIT_CONSOLIDATION_PLAN.md`  
- `AUDIT_PHASE_A_SMOKE_RESULTS.md`
