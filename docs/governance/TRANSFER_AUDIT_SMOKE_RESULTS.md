# Transfer audit — smoke results (store transfer slice)

| Field | Value |
|--------|--------|
| **Scope** | `transfer.service.js` — **create**, **submit**, **approve** (multi-step), **reject**, **dispatch**, **receive** (`POST` = ledger posting visibility). |

---

## 1. Expected `AuditLog` chain (happy path)

| Order | `action` | `note` prefix (contains) |
|-------|----------|---------------------------|
| 1 | `CREATE` | `STORE_TRANSFER_CREATE` |
| 2 | `SUBMIT` | `STORE_TRANSFER_SUBMIT` |
| 3 | `APPROVE` | `STORE_TRANSFER_APPROVE_STEP` (×2 for 3-step chain until final) |
| 4 | `APPROVE` | `STORE_TRANSFER_APPROVE_FINAL` |
| 5 | `UPDATE` | `STORE_TRANSFER_DISPATCH` |
| 6 | `POST` | `STORE_TRANSFER_RECEIVED_POSTED` |

**Reject path:** `CREATE` → `SUBMIT` → … → `REJECT` (`STORE_TRANSFER_REJECT`) — no dispatch/receive/`POST`.

---

## 2. Posting visibility

| Path | Behavior |
|------|----------|
| **Receive succeeds** | One **`POST`** row; ledger rows use `referenceType: 'TRANSFER'`, `referenceId: transfer.id` (unchanged). |
| **Receive fails** | **No** `POST` row; **`logger.error('[Transfer] receiveTransfer failed', { transferId, tenantId, message, code })`** then rethrow. |

---

## 3. Commands (static)

```bash
cd OSE-backend && node scripts/smoke-transfer-audit-static.js
```

**PowerShell:**

```powershell
cd OSE-backend; node scripts/smoke-transfer-audit-static.js
```

---

## 4. Run record

| Date (UTC) | Script | Result |
|------------|--------|--------|
| 2026-05-14 | `node scripts/smoke-transfer-audit-static.js` | `pass: true` (expected) |

---

## 5. DB-backed evidence (staging / optional)

1. Create draft → filter `AuditLog` by `entityId` = transfer id → **`CREATE`**.  
2. Submit → **`SUBMIT`**.  
3. Approve through steps → **`APPROVE`** rows with step vs final `note`.  
4. Dispatch → **`UPDATE`**.  
5. Receive → **`POST`** + verify ledger `TRANSFER_OUT` / `TRANSFER_IN` for same `referenceId`.

---

## 6. Rollback

Revert `OSE-backend/src/services/transfer.service.js` only for audit additions + receive `try/catch` logging. No schema changes.

---

## 7. Remaining gaps

| Item | Status |
|------|--------|
| **Draft update / delete** | No audit (no `userId` on service methods — see `TRANSFER_AUDIT_PLAN.md`) |
| **Asset / loan “transfer”** | Not covered — different product surface |
| **Dual Prisma** in `transfer.service` | Still uses standalone `PrismaClient` (pre-existing); not changed in this slice |

---

## Related

- `TRANSFER_AUDIT_ANALYSIS.md`  
- `TRANSFER_AUDIT_PLAN.md`  
- `AUDIT_PHASE_C_SMOKE_RESULTS.md` (pattern reference)
