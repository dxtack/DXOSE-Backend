# ORG_MANAGER Targeted ACC Governance Review — READ-ONLY

**Date:** 2026-07-03  
**Mode:** READ-ONLY (zero DB writes, zero grants, zero production code changes)  
**Scope:** 30 ORG_MANAGER memberships (resolved-role) classified `NEEDS_ACC_REVIEW` + residual role checks

Data sources (read-only scripts, zero writes):
- `Governance/scripts/acc-org-manager-governance-review.js` → `reports/ACC_ORG_MANAGER_GOVERNANCE_REVIEW.json`
- `Governance/scripts/acc-org-manager-runtime-readonly.js`

---

## 1. Total memberships

**30** memberships resolve to ORG_MANAGER (22 have ORG_MANAGER DB role row; +8 promoted via `resolveUserBestRole` because the user is ORG_MANAGER in another tenant).

**Critical finding:** In **every** membership, `accPermissionCount === assignmentPermissionCount`. All permissions come from **explicit ACC `ur_user_assignment` rows** — **none** depend on the removed static role fallback.

---

## 2. Classification of each membership

| Classification | Count |
|---|---:|
| TEST_ONLY | 28 |
| GOVERNANCE_DASHBOARD_ONLY | 1 |
| OPERATIONAL_ASSIGNMENT_REQUIRED | 1 |

Account type: **29 memberships are TEST/AUDIT/DISPOSABLE** (emails contain `test`, `.local`, `dxuat`, `phase{1..5}-gate`, `closeout-audit`, `e2e`, `disposable`). Only `amr@ga.com` is a non-marked account, but it lives on **test-org / voco** dev tenants.

There are **no confirmed production ORG_MANAGER accounts** in this Dev/Test DB.

---

## 3. Current ACC permissions (representative)

| User | Tenant | Class | ACC perms | Source |
|---|---|---|---:|---|
| amr@ga.com | test-org | GOVERNANCE_DASHBOARD_ONLY | 2 (`VIEW_DASHBOARD`, `E2E_OTHER_…`) | ACC assignment |
| amr@ga.com | voco | OPERATIONAL_ASSIGNMENT_REQUIRED | 43 (full operational) | ACC assignment |
| daniel.carter@dxuat.com | dx-marina-hotel | TEST_ONLY | 43 | ACC assignment |
| daniel.carter@dxuat.com | dx-hospitality-group | TEST_ONLY | 2 | ACC assignment |
| p1-reg-org@phase1-gate.local | closeout-audit-org-disposable | TEST_ONLY | 0 | none |

Full per-membership data in the JSON report.

---

## 4. Accessible vs denied governance routes

Governance route → permission mapping used (view separated from manage):

| Route | Required permission | Kind |
|---|---|---|
| Org Dashboard | `VIEW_DASHBOARD`/`DASHBOARD_VIEW` | SAFE_GOVERNANCE |
| Workflow Pipeline | `WORKFLOW_PIPELINE_VIEW` | SAFE_GOVERNANCE |
| Users workspace | `HOTEL_USERS_MANAGE`/`USERS_COMPANY_MANAGE` | SENSITIVE_GOVERNANCE |
| Roles | `USERS_COMPANY_MANAGE` | SENSITIVE_GOVERNANCE |
| Access Control (view) | `ACCESS_CONTROL_VIEW` | SAFE_GOVERNANCE |
| Access Control (manage) | `ACCESS_CONTROL_MANAGE` | SENSITIVE_GOVERNANCE |
| Settings | `SETTINGS_MANAGE` | SENSITIVE_GOVERNANCE |
| Audit Log | `AUDIT_LOG_VIEW` | SAFE_GOVERNANCE |
| Reports (view) | `REPORTS_VIEW` | SAFE_GOVERNANCE |
| Reports (export) | `REPORTS_EXPORT` | SENSITIVE_GOVERNANCE |
| Integrity | `INTEGRITY_VIEW` | SAFE_GOVERNANCE |
| Period Close | `PERIOD_CLOSE_MANAGE` | SENSITIVE_GOVERNANCE |

- Accounts with `acc=43`: all governance + operational routes accessible (via explicit ACC).
- Accounts with `acc=2`: only Org Dashboard.
- Accounts with `acc=0`: all governance routes denied (correct — no ACC assignment).

**"Routes lost vs static matrix"** = routes the old role fallback *would* have opened but which were never backed by a real ACC grant → **correct denial**, not lockout.

---

## 5. Targeted proposed grants

| Recommendation | Count |
|---|---:|
| INACTIVE/TEST (no grant) | 28 |
| GRANT PROPOSED | 1 |
| MANUAL REVIEW | 1 |

- **GRANT PROPOSED — `amr@ga.com` @ test-org:** baseline `DASHBOARD_VIEW`, `WORKFLOW_PIPELINE_VIEW` only. **Downgraded to MANUAL REVIEW in this report** because it is a dev/test-org account, not confirmed production.
- **MANUAL REVIEW — `amr@ga.com` @ voco:** already holds 43 permissions via explicit ACC assignment; verify the assignment is intentional. No auto-action.

**Net production-safe recommendation: propose ZERO auto-grants.** No account demonstrates a real governance function lost due to fallback removal.

---

## 6. Reason for each proposed permission

Only baseline governance considered (never operational):
- `DASHBOARD_VIEW` / `VIEW_DASHBOARD` — org oversight landing surface; no action.
- `WORKFLOW_PIPELINE_VIEW` — read-only pipeline visibility; no approve/reject.

No `GRN_*`, `TRANSFER_*`, `APPROVE_*`, `MOVEMENT_*`, `STOCK_COUNT_*`, `GET_PASS_*`, `IMPORT_*` proposed for any account.

---

## 7. Permissions excluded and why

All operational permissions excluded by rule — a role name must never grant them:
`MOVEMENT_CREATE, ADJUSTMENT_CREATE, GRN_MANAGE, TRANSFER_*, BREAKAGE_*, APPROVE_*, LOST_*, STOCK_COUNT_MANAGE, APPROVE_INVENTORY_COUNT, GET_PASS_*, IMPORT_*`.  
Sensitive governance (`SETTINGS_MANAGE`, `ACCESS_CONTROL_MANAGE`, `USERS_COMPANY_MANAGE`, `REPORTS_EXPORT`) excluded from auto-proposal — require explicit per-account governance decision.

---

## 8. Accounts needing no grant

28 TEST_ONLY memberships + the voco account (already fully assigned) = no grant action.

## 9. Accounts needing manual review

- `amr@ga.com` @ voco (43 perms — verify assignment intent)
- `amr@ga.com` @ test-org (only if promoted to a real production org later)

## 10. Test / inactive accounts

29 of 30 are test/audit/disposable. Zero-ACC disposable org accounts (`p1/p2/p3-*-gate.local`) correctly resolve to 0 permissions.

---

## 11. Residual role-check classification

### `export-mask.service.js`
| Item | Line | Condition | Class | Current behavior | Min safe change | Risk |
|---|---|---|---|---|---|---|
| `userMayViewSensitiveExport` | 22 | `user.role === 'SUPER_ADMIN' \|\| 'ADMIN'` → return true | **C — operational violation** | Role name unmasks cost/financial fields on export without a permission | Remove role shortcut; rely on `reports.view_cost`/`inventory.view_cost`/`financial.view` | SUPER_ADMIN/ADMIN would need explicit cost permission; needs governance decision on platform cost visibility |

### `scope.service.js`
| Item | Line | Condition | Class | Current behavior | Min safe change | Risk |
|---|---|---|---|---|---|---|
| `GOVERNANCE_TENANT_WIDE_ROLES` | 48, 76–90, 115 | ORG_MANAGER/SUPER_ADMIN → tenant-wide scope | **B — scope only** | Widens data visibility *after* permission gate; does not grant View/Action | Derive tenant-wide from ACC assignment (no-department rows already yield tenant-wide) | If ORG_MANAGER lacks ACC assignment they'd see nothing even with a VIEW permission — needs assignment backfill first |
| `PROPERTY_WIDE_OVERSIGHT_ROLES` | 51–59, 119–124 | FINANCE/COST_CONTROL/GM/STOREKEEPER → property-wide scope | **B — scope only** | Role-based data breadth; permission gate still applies | Derive from ACC assignment scope | Could narrow legitimate oversight; requires assignment review |

### `dashboard.service.js`
| Item | Line | Condition | Class | Current behavior | Min safe change | Risk |
|---|---|---|---|---|---|---|
| `resolveDashboardProfile` | 91–100 | Role → UI layout profile | **D — display only** | Chooses widget layout; route gated by `VIEW_DASHBOARD` | Optional: permission/assignment-derived profile | Very low — cosmetic |
| `elevated` badge count | 945, 1071 | ORG_MANAGER/SUPER_ADMIN/FINANCE_MANAGER count all pending | **D — display only** | Inflates "my action" counter; approve still dual-gated | Optional: base count on permission | Low — badge only, no action granted |

**Summary:** 1 Class C (export-mask), 2 Class B (scope), 2 Class D (dashboard). No file modified in this phase.

---

## 12. Lockout findings

| Category | Count | Notes |
|---|---:|---|
| Correct denial | 30 | Routes denied match absent ACC permission |
| Missing governance grant (real) | 0 | No production account lost a real assigned function |
| Test account issue | 29 | Dev/test/disposable |
| Inactive account | 0 active-scan | (inactive excluded) |
| Potential lockout (production) | 0 | None in this DB |

No real ORG_MANAGER lost a governance function that was backed by a genuine ACC grant.

---

## 13. Runtime read-only results

`acc-org-manager-runtime-readonly.js`: **40 / 40 PASS**

- Empty ORG_MANAGER → all operational + governance denied (no static fallback)
- Operational perms allowed **only** when explicitly in ACC set
- Governance perms allowed **only** when explicitly in ACC set
- Zero-ACC account → everything denied
- No permission carryover across tenants (dx-marina=43 vs dx-hospitality-group=2)
- Telemetry `ACC_ROLE_FALLBACK_HIT` fired on would-be static-matrix grants (decision remained deny)

---

## 14. Recommended execution batches

**Batch A — Safe governance grants:** *(empty)* — no auto-grant justified in this DB.  
**Batch B — Manual approval required:**
- `amr@ga.com` @ voco — confirm 43-permission assignment intent.
- `amr@ga.com` @ test-org — grant baseline only if promoted to real production org.
- Residual **Class C** `export-mask.service.js` role shortcut — governance decision on platform cost visibility.  

**Batch C — No action:** 28 TEST_ONLY memberships + zero-ACC disposables.

---

## 15. Exact DB rows expected to change later (NOT executed)

Only **if** a governance decision approves a specific grant:
- `ur_user_assignment` (existing active assignment for the user+property), and/or
- `ur_role_permission` rows linking the assignment's role to the approved permission code(s).

No `role_permission` (legacy) writes. No new roles. No membership changes. **Currently: zero rows proposed for change** (all recommendations are NO GRANT / MANUAL REVIEW).

---

## 16. Rollback / evidence plan for any later grant

1. Snapshot current `ur_user_assignment` + `ur_role_permission` for the target user (JSON evidence) before change.
2. Apply single-permission grant via ACC UI/service (idempotent), dry-run first.
3. Bump `permissionVersion` (forces transitional refresh; no global logout).
4. Re-run `acc-org-manager-governance-review.js` + `acc-org-manager-runtime-readonly.js` to confirm exactly the intended delta.
5. Rollback = delete the added `ur_role_permission`/override row and re-bump version; evidence diff retained.

---

## 17. Recommendation per membership

| Group | Recommendation |
|---|---|
| 28 TEST_ONLY | **INACTIVE/TEST** — no grant |
| `amr@ga.com` @ test-org | **MANUAL REVIEW** (baseline dashboard only if productionized) |
| `amr@ga.com` @ voco | **MANUAL REVIEW** (verify existing ACC assignment) |

Per-membership machine-readable recommendations in `ACC_ORG_MANAGER_GOVERNANCE_REVIEW.json`.

---

## Stop-condition triggers encountered

- **Nearly all accounts are Test/Audit** → stopped auto-grant; MANUAL REVIEW only.
- **`export-mask.service.js` Class C** → grants cost visibility by role → flagged for governance decision, **not** changed.
- **Scope role shortcuts (Class B)** → changing them needs ACC assignment backfill first → flagged, not changed.

---

## Final Confirmation

- READ-ONLY REVIEW ONLY ✅
- ZERO DATABASE WRITES ✅
- ZERO ACC GRANTS ✅
- ZERO ROLE CHANGES ✅
- ZERO ASSIGNMENT CHANGES ✅
- ZERO FALLBACK RESTORATION ✅
- ZERO PRODUCTION CODE CHANGES ✅ (only read-only Governance scripts added)
- NO BLIND MATRIX COPY ✅
- ACC REMAINS THE ONLY OPERATIONAL AUTHORITY ✅

**ACC Zero-Legacy is not declared finally closed.** Remaining before closure: (1) governance decision on the 2 MANUAL REVIEW accounts if productionized, (2) governance decision + later fix for `export-mask.service.js` Class C, (3) optional scope role-shortcut migration with assignment backfill. No grant is required to keep current valid ACC users working, and no lockout or privilege escalation was found.
