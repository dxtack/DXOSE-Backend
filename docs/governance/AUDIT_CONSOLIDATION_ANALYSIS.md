# Audit consolidation — current-state analysis (Phase 1)

| Field | Value |
|--------|--------|
| **Scope** | Backend `AuditLog` writers, `audit.service` vs `auditTrail.service`, workflow/posting/approval touchpoints, inventory count vs legacy stock count. **Out of scope:** UX, dashboards, analytics, `referenceType` normalization, aggressive workflow rewrites. |
| **Storage** | Single table: `audit_log` (`AuditLog` in `prisma/schema.prisma`). |
| **Goal of this doc** | Baseline + living record for **Audit Consolidation**: **Phase A** integrity, **Phase C** count/report workflow + posting. |

---

## 1. Executive summary

The system uses **one physical audit table** but **multiple independent write patterns** (`audit.service.log`, `auditTrail.logAction`, and **raw `prisma.auditLog.create`**). **Payload shape still differs** across writers. **Phase A** fixed invalid `AuditAction` / semantics / observability on targeted paths. **Phase C** added **session/document-level** audit for **inventory count** and **saved stock report** lifecycles (**submit / approve / reject / post**) and **`POST`** on the three count/report posting engines, with **structured posting-failure logs**. **Remaining:** transfers and other domains; **Phase B** facade; mapping raw writes; full payload standardization.

---

## 2. Current audit writers (inventory)

| Writer | Module | API | Target table | Notable fields |
|--------|--------|-----|----------------|----------------|
| **`audit.service`** (`log`) | `OSE-backend/src/services/audit.service.js` | `log({ tenantId, entityType, entityId, action, changedBy, beforeValue, afterValue, ipAddress, userAgent })` | `auditLog.create` | Deep-clones JSON for before/after; **no `note`**; **no `tx`** |
| **`auditTrail.service`** (`logAction`) | `OSE-backend/src/services/auditTrail.service.js` | `logAction({ tenantId, entityType, entityId, action, changedBy, note, beforeValue, afterValue, tx })` | `auditLog.create` | Supports **`tx`**; **`note`**; failures → **`logger.error`** (structured) |
| **Direct Prisma** | `OSE-backend/src/services/mapping.service.js` | `prisma.auditLog.create` ×3 | Same | Bypasses both services; **no `note`** |

### 2.1 Call sites observed (non-exhaustive for future growth)

| Area | File(s) | Mechanism | Entity type / pattern | Actions used |
|------|-----------|------------|-------------------------|----------------|
| **Auth** | `auth.controller.js` | `auditService.log` | `USER` | `LOGIN`, `LOGOUT` |
| **Users** | `users.controller.js` | `auditService.log` | `USER` | `CREATE`, `UPDATE` |
| **Tenant settings (generic key/value)** | `setting.service.js` | `auditService.log` | **`TenantSetting`** (string, not in `EntityType`) | `CREATE`, `UPDATE` |
| **OB finalize (transactional)** | `setting.service.js` | `logAction` | `EntityType.SETTINGS`, `entityId: 'allowOpeningBalance'` | `FINALIZE_OB` |
| **OB lock / enable (controller)** | `setting.controller.js`, `inventory.controller.js` | `logAction` | `SETTINGS` | `LOCK_OB`, **`UPDATE`** + `note` prefix **`OB_IMPORT_ENABLED`** for enable (Phase A — no longer `REOPEN_PERIOD`) |
| **Movement posting** | `posting.service.js` (`postDocument` after tx) | `logAction` | `EntityType.MOVEMENT` | `POST` |
| **Legacy stock count posting** | `posting.service.js` `postStockCount` | `logAction` **after** successful tx | `STOCK_COUNT` | **`POST`** (`note`: `LEGACY_STOCK_COUNT_POSTED`, `referenceType=STOCK_COUNT`) |
| **Stock report posting** | `posting.service.js` `postStockReport` | `logAction` **after** successful tx | `STOCK_REPORT` | **`POST`** |
| **Inventory count posting** | `posting.service.js` `postInventoryCountSession` | `logAction` **after** successful tx | `STOCK_COUNT` | **`POST`** (`note`: `INVENTORY_COUNT_POSTED`, `COUNT_SESSION`) |
| **Inventory count — submit counts** | `inventoryCount.service.js` `submitCounts` | `logAction` | `STOCK_COUNT` | **`SUBMIT`** |
| **Inventory count — submit for approval** | `inventoryCount.service.js` `submitForApproval` | `logAction` | `STOCK_COUNT` | **`SUBMIT`** |
| **Inventory count — approve / reject** | `inventoryCount.service.js` | `logAction` | `STOCK_COUNT` | **`COUNT_APPROVE`** / **`COUNT_REJECT`** |
| **Inventory count cancel (draft)** | `inventoryCount.service.js` | `logAction` (inside tx) | `EntityType.STOCK_COUNT` | **`VOID`** + `note` with `domainVerb=CANCEL_DRAFT` (Phase A) |
| **Period close / reopen** | `periodClose.service.js` | `logAction` | `EntityType.PERIOD_CLOSE` | `CLOSE_PERIOD`, `REOPEN_PERIOD` |
| **Saved stock report — save only** | `stockReport.controller.js` | `logAction` | `EntityType.STOCK_REPORT` | `CREATE` |
| **Saved stock report — submit / approve / reject** | `stockReport.service.js` | `logAction` | `STOCK_REPORT` | **`SUBMIT`**, **`APPROVE`**, **`REJECT`** |
| **Legacy stock count — submit / approve / reject** | `stockCount.service.js` | `logAction` | `STOCK_COUNT` | **`SUBMIT`**, **`COUNT_APPROVE`** (per step), **`COUNT_REJECT`** |
| **Legacy stock count service** | `stockCount.service.js` | `logAction` / `EntityType` | **Workflow + posting via `posting.service`** | See above |
| **Legacy stock count controller** | `stockCount.controller.js` | — | **No direct `AuditLog`** (delegates to services / `posting.service`) | — |
| **Store transfer (inter-location)** | `transfer.service.js` | `logAction` | `EntityType.TRANSFER` | **`CREATE`**, **`SUBMIT`**, **`APPROVE`** (step/final `note`), **`REJECT`**, **`UPDATE`** (dispatch), **`POST`** (receive / ledger posted) |
| **Get Pass workflow** | `getPass.service.js` | `logAction` (many) | `EntityType.GET_PASS` | **`AuditAction` + `note`** (Phase A) |
| **FutureLog mappings** | `mapping.service.js` | `prisma.auditLog.create` | `ItemMapping`, `UomMapping`, `VendorMapping` | `CREATE`, `UPDATE` |
| **Read API** | `audit.routes.js` → `auditService.getAuditLog` | Read | Paginated `auditLog` + `changedByUser` | — |

---

## 3. Prisma `AuditAction` enum vs code (drift / silent failure)

Defined in `prisma/schema.prisma` (`enum AuditAction`):  
`CREATE`, `UPDATE`, `DELETE`, `POST`, `VOID`, `APPROVE`, `REJECT`, `IMPORT`, `LOGIN`, `LOGOUT`, `SUBMIT`, `CLOSE_PERIOD`, `REOPEN_PERIOD`, `LOCK_OB`, `FINALIZE_OB`, `COUNT_APPROVE`, `COUNT_REJECT`.

### 3.1 Phase A remediation (2026)

The following **invalid** action strings were removed from active `logAction` paths (mapped to **`VOID`**, **`UPDATE`**, or **`APPROVE`** with explicit **`note`** tokens — see `AUDIT_PHASE_A_SMOKE_RESULTS.md`):

| Former action | Replacement |
|---------------|----------------|
| `CANCEL` (inventory count cancel) | `VOID` + `note` includes `domainVerb=CANCEL_DRAFT` |
| `CLOSE`, `PROCESS_RETURN`, `CONFIRM_RECEIPT_DESTINATION`, `ACCEPT_DESTINATION_DEPARTMENT` | `UPDATE` + `GET_PASS_*` note |
| `APPROVE_PENDING_SECURITY`, `APPROVE_${STATUS}` | `APPROVE` + note (`GET_PASS_APPROVE_PENDING_SECURITY` or `GET_PASS_APPROVE_STEP:…`) |
| `REOPEN_PERIOD` on OB enable | `UPDATE` + `OB_IMPORT_ENABLED` note (fiscal **period** reopen remains `REOPEN_PERIOD` in `periodClose.service.js` only) |

**Residual:** Other files may still introduce invalid enums; **grep / CI** guard recommended (Phase B+). **`COUNT_APPROVE` / `COUNT_REJECT`** are now used for **inventory count** and **legacy stock count** approvals (Phase C).

### 3.2 Historical reference (pre–Phase A)

Previously, invalid actions caused Prisma rejects and **silent** loss because failures were only `console.error` on the trail path.

---

## 4. Duplicated patterns and inconsistencies

### 4.1 Dual services + ~~dual Prisma clients~~ shared trail client (Phase A)

- **`audit.service`** uses `require('../config/database')` (shared prisma pattern elsewhere).
- **`auditTrail.service`** now uses the **same** `../config/database` prisma singleton (**Phase A** — removed standalone `new PrismaClient()`).

### 4.2 ~~Same enum value, wrong business meaning~~ OB enable fixed (Phase A)

- **`REOPEN_PERIOD`** is **no longer** used for **Opening Balance enable** (`setting.controller.js`, `inventory.controller.js`). OB enable logs **`UPDATE`** with an explicit `OB_IMPORT_ENABLED` note. **`periodClose.service.js`** still correctly uses **`REOPEN_PERIOD`** for fiscal period reopen.

### 4.3 `EntityType` constants — **`GET_PASS` added** (Phase A)

- **`EntityType.GET_PASS`** is now **`'GET_PASS'`** in `auditTrail.service.js`.

### 4.4 `entityType` string conventions

Mix of **`EntityType.*` UPPER_SNAKE**, **`'USER'`**, **`'TenantSetting'`**, **`'ItemMapping'`** PascalCase, etc. Reconstruction and admin filters require **case/style normalization** (governance, not necessarily immediate schema change).

### 4.5 Actor field

- **`changedBy`** is consistently **user UUID** where a user exists.
- **System-only** operations (if any) are not uniformly distinguished (no `actorType` / `system` flag on `AuditLog`).

### 4.6 Payload shape

- **M14 path**: optional IP/UA; no `note`.
- **Trail path**: optional `note`, optional full `beforeValue`/`afterValue`, optional transactional write.
- **Mapping path**: minimal before/after, no note.

---

## 5. Coverage status & residual gaps

| Workflow | Status |
|----------|--------|
| **Inventory Count** — snapshot, submit, approve, reject, post | **Phase C:** `submitCounts`, `submitForApproval`, `approve`, `reject`, and **`postInventoryCountSession`** emit `AuditLog` at **session/document** granularity. |
| **Legacy Stock Count** — create, lines, submit, approve, void, post | **Phase C:** `submitForApproval`, `processApproval`, **`postStockCount`** audited; **create / update lines / void** still without dedicated rows. |
| **Stock report workflow** | **Phase C:** **submit / approve / reject** + **`postStockReport`** `POST`; **save** still `CREATE` in controller only. |
| **Transfers** | **Store transfer** (`transfer.service.js`): **Phase 1 slice** — `CREATE` / `SUBMIT` / `APPROVE` / `REJECT` / dispatch `UPDATE` / receive `POST`. See `TRANSFER_AUDIT_*`. Other transfer-like domains not expanded here. |

---

## 6. Workflow traceability gaps

1. **Count session lifecycle** can be reconstructed from **`AuditLog`** for **canonical inventory count** and **saved stock report** golden paths (**Phase C**); **void / draft edits** may still lack rows.  
2. **Ledger** rows still carry `referenceType` / `referenceId`; audit **`note`** echoes `COUNT_SESSION` vs `STOCK_COUNT` for readers (no normalization).

---

## 7. Audit reconstruction risks

| Risk | Severity | Description |
|------|----------|-------------|
| **Silent dropped writes** | **Med** | Invalid `AuditAction` on **Phase A paths** fixed; failures now **structured `logger.error`**. Other code paths still need hardening / CI grep. |
| **Semantic false positives** | **Low** | OB enable **no longer** uses `REOPEN_PERIOD`. Historical OB-enable rows (if any succeeded before Phase A) may still show `REOPEN_PERIOD`. |
| **Incomplete chain** | **Low–Med** | **Count/report** + **store transfer receive** now have **`POST`** where ledger posts. Residual: draft update/delete without audit; non–store-transfer domains. |
| **Entity type chaos** | **Med** | Mixed conventions; cross-tenant reporting and filters brittle. |
| **Dual Prisma** | **Low** | **Resolved** for `auditTrail` (Phase A). |

---

## 8. Inventory Count vs legacy stock count (audit lens)

| Topic | Canonical **Inventory Count** | Legacy **stock-count** API |
|--------|-------------------------------|----------------------------|
| **Ledger `referenceType` on post** | `COUNT_SESSION` (`postInventoryCountSession`) | `STOCK_COUNT` (`postStockCount`) |
| **`AuditLog` posting event** | **`POST`** row after `postInventoryCountSession` | **`POST`** after `postStockCount` |
| **Session cancel audit** | **`VOID`** persists (`STOCK_COUNT`); operator cancel semantics in `note` | N/A in reviewed path |
| **Evidence** | N/A for audit table | Exports only; no extra `AuditLog` |

**Narrative:** Canonical and legacy count **posting** now emit **`POST`** on the same **`entityId`** as workflow events (`STOCK_COUNT`). Ledger remains source of line-level truth.

---

## 9. Recommended consolidation strategy (analysis only)

1. **Stabilize correctness first:** ~~align all `action` strings~~ **Phase A aligned high-risk paths**; extend grep/CI for remaining files. Eliminate **silent failure** — **Phase A:** structured **`logger.error`** on trail + M14 audit failures.
2. **Single write facade:** one module (`auditWriter` or extend `audit.service`) supporting **`note`**, **`tx`**, **`ipAddress`/`userAgent`**, and **validated** `entityType` / `action`.
3. **~~Fix semantic bugs~~** **OB enable semantic fix done (Phase A).** Optional future: dedicated enum for OB enable.
4. **~~Close coverage gaps~~** **Phase C (minimal):** inventory count **submit / approve / reject / post**; stock report **submit / approve / reject / post**; legacy stock count **submit / approve / reject / post**; **`postInventoryCountSession` / `postStockCount` / `postStockReport`** session-level **`POST`**. **Store transfer slice:** `TRANSFER_AUDIT_*` + `transfer.service.js`. **Deferred:** other movement domains beyond store transfer.
5. **`EntityType`:** **`GET_PASS` done (Phase A)**; mappings / tenant settings normalization deferred.
6. **~~Prisma singleton~~** **`auditTrail` routed through shared client (Phase A).**

---

## Related

- `AUDIT_PHASE_C_SMOKE_RESULTS.md` — Phase C verification + residual gaps.  
- `TRANSFER_AUDIT_ANALYSIS.md` — store transfer operational audit slice  
- `TRANSFER_AUDIT_PLAN.md`  
- `TRANSFER_AUDIT_SMOKE_RESULTS.md`  
- `AUDIT_PHASE_A_SMOKE_RESULTS.md` — Phase A verification commands and rollback.  
- `AUDIT_EVENT_CATALOG.md` — canonical names and payload contracts (target + current).  
- `AUDIT_CONSOLIDATION_PLAN.md` — phased execution, rollback, smoke.  
- `INVENTORY_COUNT_REPORTING_SAFETY_ANALYSIS.md` — reporting truth (complementary; not audit table).  
- `LEGACY_STOCK_COUNT_SUNSET_PLAN.md` — legacy route lifecycle vs audit scope.

---

## 10. Phase A integrity hotfixes (implemented) — code anchors

| Item | Location |
|------|-----------|
| Inventory count cancel → `VOID` | `OSE-backend/src/services/inventoryCount.service.js` |
| OB enable → `UPDATE` + note | `OSE-backend/src/controllers/setting.controller.js`, `OSE-backend/src/controllers/inventory.controller.js` |
| Get Pass actions + notes | `OSE-backend/src/services/getPass.service.js` |
| Trail logger: shared prisma + `logger.error` | `OSE-backend/src/services/auditTrail.service.js` |
| M14 logger: `err.code` on failure | `OSE-backend/src/services/audit.service.js` |
| Static smoke (Phase A) | `OSE-backend/scripts/smoke-audit-phase-a.js` |
| Static smoke (Phase C actions) | `OSE-backend/scripts/smoke-audit-phase-c-static.js` |

---

## 11. Phase C — posting & approval coverage (implemented)

| Item | Location |
|------|-----------|
| Inventory count submit / approve / reject / post | `OSE-backend/src/services/inventoryCount.service.js`, `OSE-backend/src/services/posting.service.js` `postInventoryCountSession` |
| Stock report submit / approve / reject / post | `OSE-backend/src/services/stockReport.service.js`, `posting.service.js` `postStockReport` |
| Legacy stock count submit / approve / reject / post | `OSE-backend/src/services/stockCount.service.js`, `posting.service.js` `postStockCount` |
| Posting failure logs | `posting.service.js` (`logger.error` in `postStockCount`, `postStockReport`, `postInventoryCountSession`) |

---

## 12. Store transfer audit slice (implemented)

| Item | Location |
|------|-----------|
| Create / submit / approve / reject / dispatch / receive + receive failure log | `OSE-backend/src/services/transfer.service.js` |
| Static smoke | `OSE-backend/scripts/smoke-transfer-audit-static.js` |
