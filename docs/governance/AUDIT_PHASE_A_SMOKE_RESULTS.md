# Audit consolidation — Phase A smoke results (integrity hotfixes)

| Field | Value |
|--------|--------|
| **Phase** | **A** — invalid `AuditAction` remediation, OB semantic fix, observable audit failures, shared Prisma for trail. |
| **Scope** | No workflow redesign; no enum expansion (actions mapped to existing `AuditAction` + `note`). |

---

## 1. What was verified

| Area | Verification |
|------|----------------|
| **Invalid action handling** | All Phase A–touched `logAction` calls use **`AuditAction` values only** (`VOID`, `UPDATE`, `APPROVE`, etc.). |
| **`CANCEL` behavior** | Inventory count draft cancel now persists **`VOID`** with `note` containing `domainVerb=CANCEL_DRAFT` for operator clarity. |
| **Get Pass** | Former invalid verbs (`CLOSE`, `PROCESS_RETURN`, `CONFIRM_RECEIPT_DESTINATION`, `ACCEPT_DESTINATION_DEPARTMENT`, `APPROVE_PENDING_SECURITY`, `APPROVE_<STATUS>`) → **`UPDATE`** or **`APPROVE`** + stable **`note`** tokens (`GET_PASS_*`). |
| **Opening Balance enable** | **`REOPEN_PERIOD`** removed from OB enable paths; replaced with **`UPDATE`** + explicit `note` that the event is **not** fiscal period reopen. |
| **Audit failure visibility** | `auditTrail.service.js` and `audit.service.js` log failures with **`logger.error`** and structured fields (`message`, `code`, `tenantId`, `entityType`, `entityId`, `action`). |
| **`EntityType.GET_PASS`** | Defined on `EntityType` export so `entityType` is never `undefined`. |
| **Prisma client** | `auditTrail.service.js` uses shared **`config/database`** prisma instance (no second pool). |

---

## 2. Commands (local)

**Static enum / action contract (no `DATABASE_URL` required):**

```bash
cd OSE-backend && node scripts/smoke-audit-phase-a.js
```

**Windows PowerShell:**

```powershell
cd OSE-backend; node scripts/smoke-audit-phase-a.js
```

---

## 3. Run record

| Date (UTC) | Script | Result |
|------------|--------|--------|
| 2026-05-14 | `node scripts/smoke-audit-phase-a.js` | `pass: true`, `allowedCount: 17` |

---

## 4. DB-backed checks (optional / staging)

Not required for Phase A sign-off; recommended before production:

1. Cancel an **inventory count** draft → one `audit_log` row, **`action = VOID`**, note contains `domainVerb=CANCEL_DRAFT`.
2. **Enable OB** via `POST /settings/ob-enable` or `PATCH /inventory/status` → **`action = UPDATE`**, note prefix `OB_IMPORT_ENABLED`, **not** `REOPEN_PERIOD`.
3. **Get Pass** — confirm destination receipt → **`UPDATE`**, `note = GET_PASS_CONFIRM_RECEIPT_DESTINATION`.
4. Force a bad audit write in a dev-only branch → confirm **`logger.error`** line appears in app logs with `code` when Prisma rejects.

---

## 5. Rollback

| Change | Rollback |
|--------|----------|
| Action / note remapping | Revert PR touching `inventoryCount.service.js`, `getPass.service.js`, `setting.controller.js`, `inventory.controller.js`, `auditTrail.service.js`, `audit.service.js`. |
| `auditTrail` prisma singleton | Restore standalone `PrismaClient` only if operational issue (unlikely). |

**Data:** New rows use `VOID` / `UPDATE` / `APPROVE` with richer `note`. Historical rows that **failed** to insert still absent (unchanged). Historical **successful** `REOPEN_PERIOD` rows from OB enable remain; filtering by date or `note` may be needed for old audits.

---

## 6. Residual risks (Phase A scope)

- **Posting** (`postInventoryCountSession`, etc.) still has **no** audit row — deferred to Phase C in `AUDIT_CONSOLIDATION_PLAN.md`.
- **Get Pass** reverse-audit UI still keys off **`UPDATE` + `note` in (...)`**; new notes (`GET_PASS_CONFIRM_RECEIPT_DESTINATION`, etc.) are **not** in that reverse trail query — intentional; extend separately if UI needs those timestamps.
- **`mapping.service.js`** still uses raw `prisma.auditLog.create` — unchanged in Phase A.

---

## Related

- `AUDIT_CONSOLIDATION_ANALYSIS.md`  
- `AUDIT_EVENT_CATALOG.md`  
- `AUDIT_CONSOLIDATION_PLAN.md`
