# Pre-Wave 2 — RBAC & Workflow Integrity (STOP before Wave 2)

| Field | Value |
|--------|--------|
| **Status** | Implemented — requires migration + re-login UAT |
| **Blocks** | Wave 2 (Snapshot Qty rename, governance polish, UX wave) |

## Root cause

- Frontend `hasPermission` used **JWT `permissions[]` only** (no role fallback).
- Backend `hasPermission` used JWT first, then static matrix — **divergence**.
- `role_permissions` in DB was **incomplete** for STOREKEEPER / FINANCE_MANAGER (GRN, count, ledger).

## Fixes

1. **Migration** `20260520130000_pre_wave2_rbac_operational_parity` — grants matrix bundle + `permissionVersion++`.
2. **JWT merge** `rbac.service.js` + `rbac-matrix.constants.js` — union DB + matrix on every login.
3. **Frontend fallback** `role-permission-fallback.ts` + `auth.service.ts` `hasPermission`.
4. **Workflow pipeline** — count `waitingForRole` → `FINANCE_MANAGER` on approval; `REVEAL_REVIEW` → `COST_CONTROL`; summary `pendingInventoryCountCount`.
5. **Labels** — removed pilot hybrid approver copy on count detail.

## Deploy steps

```bash
cd OSE-backend
npx prisma migrate deploy
npm run smoke:pre-wave2-rbac
```

All users on STOREKEEPER / FINANCE_MANAGER / COST_CONTROL / AUDITOR must **log out and log in** (JWT refresh).

## UAT checklist

| Role | Verify |
|------|--------|
| Storekeeper | Sidebar: GRN, Inventory Count, Movements, Ledger; can create GRN + count |
| Finance | Movements, Ledger, Audit, Period close, approve/post count |
| Cost Control | Count in pipeline when REVEAL_REVIEW; variance review |
| Workflow | `/workflow-pipeline` module filter INVENTORY_COUNT shows open sessions |

## Wave 2+ (deferred)

See user notes: Snapshot Qty rename, countDate, period warnings, UX polish — **do not start until this UAT passes.**
