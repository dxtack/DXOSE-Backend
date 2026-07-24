# Phase 1 — Scope Engine Implementation Notes

Governance reference: `docs/governance/rbac-target-matrix/GOVERNANCE_FREEZE_v1.txt`

## Schema

Migration: `prisma/migrations/20260519120000_tenant_member_scope_flags/migration.sql`

- `tenant_members.canViewAllDepartments` (default `false`)
- `tenant_members.canViewAllLocations` (default `false`)

Deploy:

```bash
cd OSE-backend
npx prisma migrate deploy
npx prisma generate   # stop API first if EPERM on Windows
```

Data backfill (UAT dept managers): `20260519130000_backfill_dept_manager_department_scope` sets `departmentId` for `fb.manager@` / `hk.manager@` (FB/HK codes). New dept managers must have `tenant_members.departmentId` assigned in admin UI.

Rollback (manual):

```sql
ALTER TABLE "tenant_members"
  DROP COLUMN IF EXISTS "canViewAllDepartments",
  DROP COLUMN IF EXISTS "canViewAllLocations";
```

## Scope engine

- `src/services/scope/scope.constants.js`
- `src/services/scope/scope.service.js` — `resolveUserScope`, `buildScopeWhere`, `assertInScope`, `buildScopeMeta`
- `src/services/scope/scopeContext.js` — controller/service helpers
- `src/utils/scopeError.js` — `SCOPE_VIOLATION` (403) / `NOT_FOUND` (404)

### scopeSource precedence

1. ORG_BYPASS  
2. CUSTOM_OVERRIDE (`canViewAllDepartments` + `canViewAllLocations`)  
3. LOCATION_ASSIGNMENT  
4. DEPARTMENT  
5. ROLE_DEFAULT  

### Modules wired (Phase 1)

| Module | Service |
|--------|---------|
| Breakage | `breakage.service.js` |
| Lost | `lostItems.service.js` |
| Transfer | `transfer.service.js` |
| Stock balances | `stock.service.js` |
| Ledger | `ledger.service.js` |
| Reports | `report.service.js` (`clampReportFilters`) |
| Dashboard | `dashboard.service.js` (operations profile + scope meta) |
| Inventory count | `stockCount.service.js` |
| GRN | `grn.service.js` |
| Get Pass | `getPass.service.js` |

List/detail/workflow/export paths use the same scope filters where applicable.

API meta (lists): `meta.scope`, `meta.scopeApplied`, `meta.scopeLabel`, `meta.reason` (`SCOPE_NO_VISIBLE_RECORDS` when scoped + empty).

## Smoke test

```bash
cd OSE-backend
node scripts/smoke-scope-engine.js
```

Requires DB with tenant, F&B/HK departments, locations, and test users (see script).

## Regression checklist

- [ ] F&B user does not see HK breakage/lost/transfers  
- [ ] HK user does not see F&B  
- [ ] Finance sees tenant-wide lists  
- [ ] Storekeeper sees only `location_users` assignments  
- [ ] Direct URL to out-of-scope document → 403/404  
- [ ] Stock export uses same filters as list  
- [ ] Dashboard operations (storekeeper) totals match assigned locations  

## Hotfix (UAT visibility)

**Root cause:** `tenant_members.canViewAllDepartments/Locations` default `false` was overwriting role defaults and could block tenant-wide roles. Fixed: only `true+true` on membership applies CUSTOM_OVERRIDE widen.

**Legacy movement docs:** Tenant-wide roles use no line filter. Dept managers match lines by department/location OR own `DRAFT` docs.

**HK Breakage list (movement scope):** Breakage/Lost share `movementDocumentScopeWhere` on `MovementDocument`. Scope matches **line** `location.departmentId` / `locationId` **or** document `sourceLocationId` (no Prisma `sourceLocation` relation — filter by ID list). Department scope loads active + inactive location IDs. List search uses `AND` so search `OR` does not overwrite scope `OR`.

Diagnostic scripts: `scripts/diagnose-hk-breakage-vs-lost.js`, `scripts/simulate-hk-breakage-list.js`, `scripts/diagnose-hk-breakage-excluded.js`.

**Create/Edit form scope:** `GET /departments`, `GET /locations`, `GET /categories`, `GET /inventory/items-by-locations/:id` filter by `resolveUserScope`. `POST /breakage` and `POST /lost-items` call `assertLocationInScope` on header + lines. Frontend create forms lock department for `DEPT_MANAGER` with `departmentId` on JWT.

**Rollback flags (env):**

```env
ENABLE_SCOPE_ENGINE=false
# or per module:
ENABLE_BREAKAGE_SCOPE=false
ENABLE_LOST_SCOPE=false
```

**Debug meta (dev):** `SCOPE_DEBUG=true` adds `meta.scopeDebug.scopeWhere`, `meta.totalUnscoped`, `meta.totalAfterScope`.

## Phase 2 (blocked)

Do not start RBAC alignment (`ADMIN` deprecation, `HOTEL_USERS_MANAGE`) until Phase 1 acceptance passes.
