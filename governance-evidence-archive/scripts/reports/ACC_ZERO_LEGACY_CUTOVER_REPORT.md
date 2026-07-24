# ACC Zero-Legacy Safe Cutover — Final Execution Report

**Date:** 2026-07-03  
**Environment:** Dev/Test DB (read-only inventory + code cutover)  
**Status:** Code cutover **complete** with **runtime evidence**; **ORG_MANAGER governance grants require Amr review**

---

## 1. Baseline

| Item | Result |
|------|--------|
| Git diff (pre-change) | Governance deletions only; OSE-backend/Frontend untracked |
| Unit tests (baseline) | **332 / 332 PASS** |
| Unit tests (post-cutover) | **332 / 332 PASS** |
| Integration tests | **72 / 72 PASS** |
| Frontend production build | **PASS** |

---

## 2. DB Inventory Counts (Read-Only)

| Metric | Count |
|--------|------:|
| Active users | 257 |
| Active ACC assignments | 242 |
| Active roles | 14 |
| `ur_role_permission` rows | 216 |
| Legacy `role_permission` rows | 320 |
| ORG_MANAGER users (distinct) | 19 |
| SUPER_ADMIN users | 2 |
| Inactive assignments | 18 |
| Active memberships scanned | 276 |
| **FALLBACK_DEPENDENT** (empty ACC + static matrix would grant) | **0** |
| Zero effective permissions (operational) | 0 |
| Classification SAFE | 244 |
| Classification NEEDS_ACC_REVIEW | 30 |
| Classification GOVERNANCE_ONLY | 2 |

Report: `Governance/scripts/reports/ACC_ZERO_LEGACY_INVENTORY.json`

---

## 3. Fallback-Dependent Users/Roles

**None.** After cutover, no operational user has empty ACC resolution that would have relied on static matrix fallback.

30 **NEEDS_ACC_REVIEW** entries are ORG_MANAGER memberships where historical static matrix listed more codes than current ACC role grants (expected after removing auto all-codes grant).

---

## 4. Authorization Code Inventory (Summary)

| Class | Action taken |
|-------|--------------|
| **A** Governance identity | Retained (`requireSuperAdmin`, tenant scope, ORG tenant switch) |
| **B** Scope-only | Retained where step role + permission dual-gate applies |
| **C** Operational violations | **Removed:** static matrix fallback, ORG_MANAGER all-codes, SUPER_ADMIN ADMIN mirror, `canBypassWorkflowStep` in workflow permission checks, count prepare/execute role-only gates |
| **D** Display | Unchanged |
| **E** Dead | Removed unused `canBypassWorkflowStep` imports |

`authorize(...roles)` remains exported but **unused on routes**.

---

## 5. Shadow Telemetry

Added `ACC_ROLE_FALLBACK_HIT` via `src/services/acc-role-fallback-telemetry.service.js`.

Logged when static matrix **would** have allowed access (telemetry only — decision is deny).

Runtime matrix run emitted 2 expected telemetry events for synthetic empty-permission users.

---

## 6. ACC Data Remediation

**No DB writes performed.** No blind matrix backfill.

Per constitutional directive, ORG_MANAGER auto-grant of all operational codes was **removed in code**. Accounts with sparse ACC role grants (e.g. 2 permissions) need **explicit ACC grants** for governance screens — **decision required from Amr** (see §19).

---

## 7. Static Fallback Removal

`hasPermission` in `middleware/authorize.js`:

- Non-empty `permissions[]` → ACC check only  
- Empty / missing `permissions[]` → **false** (fail closed)  
- **No** `PERMISSIONS[role]` runtime fallback  
- Telemetry logs would-be static matrix hits

---

## 8. Legacy DB Fallback Status

`resolvePermissionsForMembership`:

- ACC canonical path only (`ur_user_assignment` → `ur_role_permission` / overrides)  
- Miss or error → **`[]`** (fail closed)  
- Removed fallback to `getPermissionsForMembership` legacy union  
- `accPermissionDriftSafeFallback` unchanged (default **false**)

`getPermissionsForMembership` (rbac.service.js):

- Removed ORG_MANAGER `loadAllPermissionCodes()` auto-grant  
- Removed SUPER_ADMIN → ADMIN permission mirror  
- Still reads `ur_*` / `role_permissions` for **non-session** callers only

---

## 9. JWT / permissionVersion Behavior

`authenticate.js`:

- JWT **missing** `permissionVersion` → **401 `PERMISSIONS_STALE`**  
- JWT version **≠** DB → **401 `PERMISSIONS_STALE`**  
- Forces silent refresh path on frontend

Login / refresh / switch-tenant continue to embed `permissionVersion` and ACC-resolved `permissions[]`.

---

## 10. Frontend Refresh Behavior

Existing interceptor already handles `PERMISSIONS_STALE` and `TOKEN_EXPIRED`:

- Single-flight silent refresh  
- One retry with `X-Skip-Auth-Retry`  
- Logout on failure  

No UI redesign changes.

---

## 11. Operational Role Checks Migrated

| Area | Change |
|------|--------|
| `step-permission-enforcement.js` | Removed ORG/SUPER workflow permission bypass |
| `inventory-count-workflow.helpers.js` | Prepare → `STOCK_COUNT_MANAGE`; Execute → dual-gate COST_CONTROL + permission |
| Breakage/Lost | Unused bypass imports removed |

Workflow **step role matching** (dual-gate) retained — role identifies step, permission authorizes action.

---

## 12. Governance Exceptions Retained

- Super Admin portal: `requireSuperAdminGuard` / `requireSuperAdmin` middleware (**role identity**)  
- ORG_MANAGER tenant switch / `x-tenant-id` scoping  
- `resolveUserBestRole` for session identity display  
- Workflow dual-gate (step role + permission)

---

## 13. ORG_MANAGER Final Behavior

- **Identity/governance role only** at session level  
- Permissions from **ACC assignment + role ur permissions** only (typical: 2–43 codes depending on role row)  
- **No** automatic all-operational-codes grant  
- Operational hotel actions require explicit ACC permissions on assignment  

⚠️ **Amr decision needed:** which governance permissions (e.g. `USERS_COMPANY_MANAGE`, `SETTINGS_MANAGE`, `ACCESS_CONTROL_VIEW`) must be granted per ORG_MANAGER role in ACC — **not auto-copied from static matrix**.

---

## 14. SUPER_ADMIN Final Behavior

- Portal access via role guard (unchanged)  
- **No** automatic hotel operational permissions via ADMIN role mirror  
- Operational hotel access requires ACC assignment permissions  

---

## 15. Workflow Authorization Final Behavior

- Approve/Reject/Send Back: **permission + step role** (dual-gate)  
- No global ORG_MANAGER/SUPER_ADMIN bypass on permission checks  
- Count lifecycle: prepare requires `STOCK_COUNT_MANAGE`; execute requires COST_CONTROL step + permission  

---

## 16. Runtime Scenario Counts

`Governance/scripts/acc-zero-legacy-runtime-matrix.js`: **10 / 10 PASS**

Covers: empty permissions deny, explicit grant/deny, bypass removal, live membership resolution, ORG_MANAGER not all-codes.

---

## 17. Test / Build Counts

| Suite | Pass | Fail |
|-------|-----:|-----:|
| Unit | 332 | 0 |
| Integration | 72 | 0 |
| Runtime matrix | 10 | 0 |
| Frontend build | 1 | 0 |

---

## 18. Lockout Verification

| Check | Result |
|-------|--------|
| Users with zero ACC + static fallback | **0** — no lockout from fallback removal |
| Integration auth flows | **PASS** |
| Valid ACC users (sample STOREKEEPER) | **39 permissions resolved** |
| ORG_MANAGER sparse grants | **May lose routes** without explicit ACC grants — **not lockout**, intentional restriction |
| JWT missing version | Transitional refresh (not global logout) |

---

## 19. Remaining Blockers / Decisions for Amr

1. **ORG_MANAGER ACC grants:** Define minimum governance permission set per org-manager role in ACC UI (not blind matrix copy).  
2. **30 NEEDS_ACC_REVIEW memberships:** Review whether reduced permission sets are correct per org.  
3. **Scope service role shortcuts** (`scope.service.js` tenant-wide by role) — not migrated in this pass; classify if next wave needed.  
4. **Dashboard/export-mask role checks** — not migrated; separate permission migration if required.

---

## 20. Files Changed

| File | Change |
|------|--------|
| `src/middleware/authorize.js` | Fail-closed hasPermission + telemetry |
| `src/middleware/authenticate.js` | Strict permissionVersion |
| `src/acc-runtime/resolvePermissions.js` | ACC-only resolution |
| `src/services/rbac.service.js` | Remove ORG_MANAGER/SUPER_ADMIN auto-grants |
| `src/acc-authority/step-permission-enforcement.js` | Remove workflow bypass |
| `src/services/inventory-count-workflow.helpers.js` | Permission-based count gates |
| `src/services/breakage.service.js` | Remove dead import |
| `src/services/lostItems.service.js` | Remove dead import |
| `src/acc-authority/step-permission-enforcement.test.js` | Updated expectations |
| `src/services/inventory-count-lifecycle.behavior.test.js` | Updated for permission gates |
| `src/services/acc-role-fallback-telemetry.service.js` | **New** |
| `Governance/scripts/acc-zero-legacy-inventory.js` | **New** |
| `Governance/scripts/acc-zero-legacy-runtime-matrix.js` | **New** |

---

## 21. Database Writes

**None.** Zero DB mutations in this execution.

---

## 22. Confirmations

| Statement | Status |
|-----------|--------|
| ACC is operational SSOT | ✅ Code paths enforce ACC-only |
| Empty permissions fail closed | ✅ |
| No static role fallback (runtime) | ✅ |
| No blind matrix backfill | ✅ |
| No privilege escalation | ✅ Verified in runtime matrix |
| No login lockout for valid ACC users | ✅ Integration + inventory |
| No PDF/UI redesign | ✅ |
| No schema/migration | ✅ |
| No rollback/restore | ✅ |
| No fabricated evidence | ✅ Tests executed locally |

---

## Conclusion

**ACC Zero-Legacy authorization cutover is implemented in code** with full unit/integration/runtime verification on Dev/Test.

**Not fully closed for production sign-off** until:

1. Amr approves ORG_MANAGER governance permission grants in ACC for affected accounts.  
2. Residual **Class C** scope/dashboard/export role checks are migrated (optional follow-up).  
3. Production runtime smoke after ACC grant review.

**No global logout was performed.** Transitional `PERMISSIONS_STALE` refresh handles legacy JWTs.
