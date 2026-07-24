# ACC P2 — Enforcement Alignment

**Phase:** P2 (preparation + pilot only)  
**Status:** Implemented — no P3 cutover  
**Build requirement:** PASS after each wave

---

## 1. Executive summary

P2 bridges the gap between **ACC as configuration UI** and **runtime authorization**, without removing legacy paths.

| Layer | Before P2 | After P2 |
|-------|-----------|----------|
| Settings Users | Could change `TenantMember.roleId` (access) | Identity only — role changes blocked |
| UrUserAssignment | Manual / backfill only | Dual-write on create + membership sync |
| Effective permissions preview | Global union only | Session-scoped via acc-runtime when linked |
| Scope enforcement | Middleware built, not mounted | Wired after authenticate (flag OFF by default) |
| Route migration | Ad hoc | Inventory API + migration hints |

**P3 remains untouched:** no matrix removal, no `roleId` auth removal, no full route cutover.

---

## 2. Architecture walkthrough

### 2.1 Dual sources of truth (current state)

```
┌─────────────────────┐         ┌──────────────────────┐
│   TenantMember      │         │  UrUserAssignment    │
│   (runtime session) │ ◄─P2──► │  (ACC policy store)  │
│   roleId, tenantId  │ legacy: │  role, scope, notes  │
└──────────┬──────────┘   tag   └──────────┬───────────┘
           │                               │
           ▼                               ▼
    auth.service /                  user-rights APIs
    acc-runtime                     permission-resolution
    JWT permissions                 effective preview
```

**Session path (runtime):**

1. Login → `TenantMember` for active property
2. `accRuntime.resolveSession()` → `resolvePermissionsForMembership()`
3. Finds `UrUserAssignment` via `notes='legacy:<TenantMember.id>'` or role+property match
4. Loads `ur_role_permissions` + overrides → JWT `permissions[]`
5. If ACC ≠ legacy and drift-safe fallback ON → **legacy wins**

**ACC admin path:**

1. Settings → create user → `TenantMember` + **sync** `UrUserAssignment`
2. ACC → manage assignments / roles / overrides directly
3. Effective Permissions tab → `resolveEffectivePermissionsForSession()` when linked

### 2.2 Permission resolution engines

| Engine | Scope | Used by |
|--------|-------|---------|
| `permission-resolution.engine` — `resolveEffectivePermissions` | All active assignments (UNION) | ACC preview fallback |
| `permission-resolution.engine` — `resolveEffectivePermissionsForSession` | Single session assignment | ACC preview (default) |
| `acc-runtime/resolvePermissions` | Session membership | JWT / middleware |

P2 adds **session alignment** for the ACC preview so operators see what acc-runtime would compute when linkage exists.

### 2.3 Settings / Identity boundary

**Governed split (P1 + P2):**

| Settings (Identity) | ACC (Access) |
|---------------------|--------------|
| Create user | Assign roles |
| Activate / deactivate | Scope (properties, departments) |
| Password | Overrides |
| Profile fields | Effective permissions preview |
| Initial role on **create** only (membership bootstrap) | Role lifecycle (P1) |

**API behavior:**

- `PUT /users/:id/role` → `403 ACCESS_MANAGED_IN_ACC`
- `PUT /users/:id` with changed `role` → `403 ACCESS_MANAGED_IN_ACC`
- Same role in payload on edit → ignored (no error)

### 2.4 Scope enforcement pilot

**Flag:** `ENABLE_SCOPE_ENFORCEMENT=true` (default: false)

When enabled, after `authenticate`:

- `scopeEnforcementMiddleware` resolves `req.scopeContext` from assignments
- Attaches `req.scopedPrisma` for future route migration
- **Fail-open** on errors — legacy RBAC unchanged

**Related flag:** `USE_NEW_POLICY_ENGINE` — Path B scope (Wave 8), separate from middleware mount.

### 2.5 Route migration preparation

**Inventory:** `GET /api/access-control/enforcement/route-migration-inventory`

Scans route files for `authorize(role)` vs `requirePermission`.  
**41 calls across 11 files** — migration hints only, no route changes in P2.

---

## 3. New APIs (read-only / operator)

Base: `/api/access-control/enforcement`

| Endpoint | Purpose |
|----------|---------|
| `GET /p2-status` | Combined P2 alignment status + coverage summary |
| `GET /assignment-coverage` | TenantMember ↔ assignment linkage report |
| `GET /linkage-analysis?userId=` | Session linkage + permission drift eval |
| `GET /route-migration-inventory` | authorize(role) inventory |

Existing endpoints unchanged: `/status`, `/session-evaluation`, etc.

---

## 4. Scripts

| Command | Purpose |
|---------|---------|
| `npm run backfill:assignments` | Populate `legacy:*` assignments (S7) |
| `npm run validate:assignments-backfill` | S7 coverage gate |
| `npm run validate:p2-coverage` | P2 linkage report (may exit 1 if gaps) |
| `npm run verify:p2-enforcement` | Static P2 deliverable verification |

---

## 5. Feature flags & rollback

| Flag | Default | Rollback action |
|------|---------|-----------------|
| `ENABLE_SCOPE_ENFORCEMENT` | false | Unset or `=false` |
| `ACC_HARD_CUTOVER` | true (≠ false) | `ACC_HARD_CUTOVER=false` |
| `ACC_PERMISSION_DRIFT_SAFE_FALLBACK` | true | Keep ON until pilot clean |
| `ENABLE_UR_SHADOW_MODE` | false | Enable for drift monitoring |
| `USE_NEW_POLICY_ENGINE` | false | Enable per pilot tenant only |

**Principle:** staged rollout, fail-open scope, drift-safe permission fallback until verified.

---

## 6. Known limitations (accepted in P2)

1. **Runtime still uses TenantMember** for session role display in some paths.
2. **Drift-safe fallback** may hide ACC permission changes from JWT until linkage + pilot sign-off.
3. **authorize(role)** routes bypass permission matrix and shadow mode.
4. **Scope middleware** attached but routes still use global `prisma` — no data filtering until Wave 8 migration.
5. **Create user** still sets initial `TenantMember.roleId` — provisioning, not ongoing access management.

---

## 7. P3 boundary (not started)

- Remove `TenantMember.roleId` from authorization path
- Retire static PERMISSIONS matrix fallback
- Complete route migration to `requirePermission`
- Full runtime = ACC admin model

---

## 8. Verification checklist

- [ ] `npm run verify:p2-enforcement` — PASS
- [ ] `npm run validate:p2-coverage` — review unmigrated count
- [ ] Settings edit user — role read-only, no API role change
- [ ] Create user — assignment synced (`legacy:<memberId>`)
- [ ] ACC Effective Permissions — shows `session-scoped` when linked
- [ ] `GET /access-control/enforcement/p2-status` — returns coverage + flags
- [ ] Frontend build PASS

---

*Document version: P2 implementation — architecture walkthrough for review before P3.*
