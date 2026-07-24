# Transfer audit stabilization — plan (Phase 1 slice)

| Field | Value |
|--------|--------|
| **Goal** | Reconstructable **store transfer** operational history in `AuditLog` without workflow or UX redesign. |
| **Principles** | Document-level events; valid `AuditAction` only; meaningful `note` tokens; minimal blast radius; backward compatible. |

---

## 1. Scope

| In scope | Out of scope |
|----------|----------------|
| `OSE-backend/src/services/transfer.service.js` | Loan / “asset transfer” PDF domain (no matching service slice) |
| Create, submit, approve, reject, dispatch, receive | `updateTransfer` / `deleteTransfer` audit (missing `userId` — optional follow-up) |
| Receive failure logging | Per-ledger-line audit rows |

---

## 2. Implementation checklist (done)

- [x] `CREATE` after `createTransfer`
- [x] `SUBMIT` after `submitTransfer` transaction
- [x] `APPROVE` after each `approveTransfer` (note: step vs final)
- [x] `REJECT` after `rejectTransfer`
- [x] `UPDATE` after `dispatchTransfer`
- [x] `POST` after successful `receiveTransfer` transaction
- [x] `try/catch` + `logger.error` on `receiveTransfer` failure

---

## 3. Rollback

Revert `transfer.service.js` and remove/retire governance/smoke files for this slice. **No migrations.**

---

## 4. Smoke

| Script | Purpose |
|--------|---------|
| `OSE-backend/scripts/smoke-transfer-audit-static.js` | Confirms `AuditAction` includes all actions used by transfer slice |

DB-backed golden-path checks: optional staging (see `TRANSFER_AUDIT_SMOKE_RESULTS.md`).

---

## 5. Follow-ups (not committed)

1. Pass **`userId`** into `updateTransfer` / `deleteTransfer` from controller → **`UPDATE`** / **`DELETE`** audit.  
2. **Loan / asset** workflow audit when a single service owns lifecycle.  
3. **Phase B** unified writer (optional dedupe with `logAction` imports).

---

## Related

- `TRANSFER_AUDIT_ANALYSIS.md`  
- `TRANSFER_AUDIT_SMOKE_RESULTS.md`  
- `AUDIT_CONSOLIDATION_PLAN.md`
