# Phase 2 — RBAC Alignment (Implementation Notes)

Governance: `docs/governance/rbac-target-matrix/GOVERNANCE_FREEZE_v1.txt`

## Scope

- **In scope:** ADMIN UI deprecation, Finance operational parity, `HOTEL_USERS_MANAGE`, route/permission alignment, JWT `permissionVersion` bump on role-permission migration.
- **Out of scope:** Phase 4 cleanup, ADMIN row deletion, broad refactors.

## Migration

```bash
cd OSE-backend
npx prisma migrate deploy
```

`20260519140000_phase2_rbac_hotel_users_finance` — adds `HOTEL_USERS_MANAGE`, links Finance Manager permissions, bumps `permissionVersion` for affected users.

## Rollback (manual)

```sql
DELETE FROM "role_permissions" rp
USING "permissions" p, "roles" r
WHERE rp."permissionId" = p.id AND rp."roleId" = r.id
  AND r.code = 'FINANCE_MANAGER'
  AND p.code IN ('HOTEL_USERS_MANAGE', 'TENANT_OPS_DIAGNOSE');

DELETE FROM "permissions" WHERE code IN ('HOTEL_USERS_MANAGE', 'TENANT_OPS_DIAGNOSE');
```

Redeploy previous API build. Users must re-login after permission rollback.

## Smoke (local)

```bash
cd OSE-backend
npx prisma migrate deploy
node scripts/smoke-scope-engine.js
```

Manual RBAC checks:

- Finance: operational nav (breakage, lost, transfers, count, ledger, reports, period close, integrity), workflow actions, posting, `/users` with `HOTEL_USERS_MANAGE`
- Dept Manager: no `/users`, no cross-dept lists (Phase 1 scope unchanged)
- ORG: `USERS_COMPANY_MANAGE`, cross-property user search, period reopen
- ADMIN: not in role dropdowns; legacy DB rows still login until reassigned

```bash
# API: deprecated role assignment
curl -X POST .../api/users -d '{"role":"ADMIN",...}'  # → 403 ROLE_DEPRECATED
# JWT stale: change role → permissionVersion bump → 401 PERMISSIONS_STALE until re-login
```

## Acceptance mapping

| Criterion | Implementation |
|-----------|----------------|
| No operational ADMIN dependency | Removed from assignable roles, approval bypasses, most `authorize('ADMIN')` |
| Finance parity | DB `role_permissions` + `authorize.js` matrix |
| HOTEL_USERS_MANAGE | Permission + `/api/users` `requireAnyPermission` |
| Stale JWT | Existing `permissionVersion` check + migration bump |
| Scope Engine untouched | No changes to `resolveUserScope` / `buildScopeWhere` precedence |
| Users scope governance API | `PUT /users/:id` accepts `canViewAllDepartments`, `canViewAllLocations`, `locationIds`; list/get return scope fields |

## Follow-up (UAT)

- Users modal UI for scope flags + location multi-select (API ready; Finance/ORG only via route permissions).
- Super-admin tenant provisioning still assigns legacy `ADMIN` membership rows (internal; not hotel operational UI).
