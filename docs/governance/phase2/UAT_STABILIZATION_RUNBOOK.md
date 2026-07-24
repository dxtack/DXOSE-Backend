# UAT + Stabilization Runbook (Phase 1 + Phase 2)

**Status:** ACTIVE — freeze until sign-off  
**Governance:** `docs/governance/rbac-target-matrix/`  
**Phase 2 notes:** `PHASE2_IMPLEMENTATION_NOTES.md`

---

## Freeze rule (until sign-off)

Do **not** start:

- New features
- Cleanup / dead-code removal
- Refactors
- Users scope editor UI

Allowed only:

- Regression fixes
- RBAC fixes
- Scope fixes
- Operational bugs

---

## Automated baseline (run before manual UAT)

From `OSE-backend`:

```bash
npx prisma migrate deploy
node scripts/smoke-scope-engine.js
node scripts/run-governance-static-smokes.js
node scripts/check-role-permissions.js
node scripts/verify-form-scope-lookups.js
node scripts/verify-scope-isolation.js
node scripts/smoke-workflow-pipeline-filters.js
node scripts/smoke-gm-nav-permissions.js
node scripts/verify-general-manager-rbac.js
```

**Expected (2026-05-19):**

| Check | Pass criteria |
|-------|----------------|
| `smoke-scope-engine.js` | All personas OK; HK + F&B dept scope distinct |
| `run-governance-static-smokes.js` | Exit 0 |
| `check-role-permissions.js` | `FINANCE_MANAGER` → `USERS_COMPANY_MANAGE` **false**; `ORG_MANAGER` → **true** |
| DB (post migration) | `FINANCE_MANAGER` has `HOTEL_USERS_MANAGE` |

Restart API after deploy. **All testers must re-login** after role/permission changes (JWT `permissionVersion`).

---

## 1) Finance operational parity (P0)

Login: `finance@…` (tenant hotel context, not org root).

| Module | Actions to verify | Pass |
|--------|-------------------|------|
| Breakage | List not wrongly empty; approve finance step; final post | ☐ |
| Lost | Same as breakage | ☐ |
| Transfers | Create → dept → finance → post | ☐ |
| Inventory Count | Create → count → submit → **approve** (Finance) → posted | ☐ |
| GRN | Create/validate; finance post on `PENDING_FINANCE` | ☐ |
| Ledger | View + export (tenant-wide scope) | ☐ |
| Reports | Generate + export | ☐ |
| Period Close | **Close** period (Finance or ORG) | ☐ |
| Data Integrity | Checklist / scan / reconciliation pages load + API 200 | ☐ |
| Workflow pipeline | Sees actionable items; can act where role matches | ☐ |
| Dashboard | Summary/charts load (not forbidden) | ☐ |

**Must not require ADMIN** for any step above.  
Matrix reference: `6_UAT_FINANCE.csv` (U04–U13).

---

## 2) Scope regression (Phase 1)

Retest after Phase 2 — scope engine logic was **not** changed; guards/permissions were.

### F&B manager (`fb.manager@…`)

| Check | Pass |
|-------|------|
| Breakage list: no HK-only docs | ☐ |
| Lost list: same isolation | ☐ |
| Create breakage: dept dropdown **F&B only** (no Finance / Admin & General) | ☐ |
| Direct URL to out-of-scope doc ID → 403 or empty | ☐ |

### HK manager (`hk.manager@…`)

| Check | Pass |
|-------|------|
| Breakage list: HK docs only (known: 2/3 scoped on Roma-1 fixture) | ☐ |
| Lost list: HK scoped | ☐ |
| Create: HK dept/locations only | ☐ |

### Location-restricted roles (e.g. Storekeeper)

| Check | Pass |
|-------|------|
| Lists respect assigned locations | ☐ |
| Lookups (`/departments`, `/locations`) scoped | ☐ |

### Cross-cutting

| Check | Pass |
|-------|------|
| Exports (reports / ledger) respect scope | ☐ |
| Dashboard widgets not leaking other depts | ☐ |

Scripts: `verify-scope-isolation.js`, `verify-form-scope-lookups.js`, `diagnose-hk-breakage-vs-lost.js` (if HK breakage fails).

---

## 3) Users governance (API + route only — no scope UI)

| Test | Role | Expected | Pass |
|------|------|----------|------|
| Open `/users` | Finance | 200 / page visible | ☐ |
| Open `/users` | Dept Manager | Redirect forbidden / no nav | ☐ |
| `POST /api/users` `{ role: "ADMIN" }` | Finance or ORG | **403** `ROLE_DEPRECATED` | ☐ |
| Create hotel user | Finance | Success; same `tenantId` only | ☐ |
| `GET /api/users/search-existing` | Finance | **403** (ORG only) | ☐ |
| Org user CRUD | ORG_MANAGER | Success; multi-property rules | ☐ |
| Role dropdown | Any assign UI | **No ADMIN** option | ☐ |

---

## 4) JWT / stale permissions

| Step | Expected | Pass |
|------|----------|------|
| Login → note JWT works | Normal API 200 | ☐ |
| Admin changes user role (or run migration bump) | — | ☐ |
| Same browser, old token, API call | **401** `PERMISSIONS_STALE` | ☐ |
| Re-login | Fresh permissions; access matches new role | ☐ |
| Finance after re-login | JWT includes `HOTEL_USERS_MANAGE` | ☐ |

---

## Sign-off gate (required before next phase)

All must be true:

- [ ] Full manual UAT above completed
- [ ] No RBAC regressions (Finance parity, no operational ADMIN dependency)
- [ ] No scope regressions (F&B / HK / location / URL / export / dashboard)
- [ ] Workflow + posting validated on at least one doc per module type
- [ ] Export validation on reports/ledger
- [ ] Regression log reviewed (no open P0/P1)

**Then choose:** Users Scope UI **or** Controlled Cleanup Phase — not before.

---

## Regression log (template)

| ID | Area | Role | Steps | Expected | Actual | Severity | Fix PR |
|----|------|------|-------|----------|--------|----------|--------|
| R-001 | | | | | | P0/P1/P2 | |

---

## Quick API snippets (optional)

```bash
# ADMIN assign blocked (replace TOKEN, TENANT)
curl -s -X POST http://localhost:4000/api/users \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","role":"ADMIN","firstName":"T","lastName":"U","password":"Password1!"}'
# Expect: 403, code ROLE_DEPRECATED
```

---

## Notes

- Legacy `ADMIN` **DB rows** may still login (U15 compat) but must not appear in assign UI or operational bypass paths.
- Super-admin portal is out of hotel operational UAT scope unless testing break-glass GRN (U16).
