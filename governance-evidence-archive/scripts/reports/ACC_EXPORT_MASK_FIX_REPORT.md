# Export Cost Mask ACC Authorization Fix — Final Report

**Date:** 2026-07-03  
**Workstream:** ACC Zero-Legacy (export-mask finding)  
**Mode:** Production code fix + read-only runtime verification (no DB writes, no ACC grants)

---

## Root cause

`userMayViewSensitiveExport` in `export-mask.service.js` granted unmasked cost/financial export fields via **role name**:

```javascript
if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;
```

This violated the ACC contract: role name must not grant sensitive data visibility.

Additionally, the function checked **legacy dot-notation permission codes** (`reports.view_cost`, `inventory.view_cost`, `financial.view`) that **do not exist** in the ACC catalog (`catalog.constitution.js` / `permissions` table). In practice, only the SUPER_ADMIN/ADMIN role shortcut ever unmasked costs; users with legitimate financial roles but ACC `LEDGER_VIEW` were still masked because the wrong codes were checked.

---

## Permission chosen and why

**`LEDGER_VIEW`** (ACC catalog: resource `MOVEMENTS`, action `READ`, name "View Ledger")

| Criterion | Result |
|---|---|
| Exists in ACC catalog | Yes |
| Covers WAC / unit cost / valuation fields | Yes (`wacAtPosting`, `unitCost`, `totalValue`, etc.) |
| Granted to finance/cost roles via ACC | Yes (FINANCE_MANAGER, COST_CONTROL, AUDITOR, STOREKEEPER in `rbac-matrix.constants.js`) |
| Separate from export gate | Yes — `REPORTS_EXPORT` gates export route; `LEDGER_VIEW` gates cost unmasking |
| New permission required | No |

Export route permission remains **`REPORTS_EXPORT`** (unchanged). Users with export but without `LEDGER_VIEW` still export successfully with masked cost columns.

---

## Files modified

| File | Change |
|---|---|
| `OSE-backend/src/platform/export-mask.service.js` | Removed role shortcut + legacy dot-notation checks; ACC-only `hasPermission(user, 'LEDGER_VIEW')` |
| `OSE-backend/src/platform/export-mask.service.test.js` | **New** — 12 focused unit tests |
| `OSE-backend/Governance/scripts/acc-export-mask-runtime.js` | **New** — read-only runtime verification script |

**Not modified (per scope):** `scope.service.js`, `dashboard.service.js`, ORG_MANAGER assignments, routes, PDF/UI, schema.

---

## Role shortcut removed

```diff
- if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;
- user.permissions.includes('reports.view_cost') ||
- user.permissions.includes('inventory.view_cost') ||
- user.permissions.includes('financial.view')
+ return hasPermission(user, EXPORT_COST_VIEW_PERMISSION); // LEDGER_VIEW
```

---

## Runtime scenarios

| # | Scenario | Result |
|---|---|---|
| 1 | Export + `LEDGER_VIEW` | PASS — unmasked (`unitCost=42.5`, `totalValue=100`) |
| 2 | `REPORTS_EXPORT` only | PASS — export path allowed at route; costs masked (`***`) |
| 3 | SUPER_ADMIN without `LEDGER_VIEW` | PASS — denied unmask |
| 4 | ADMIN without `LEDGER_VIEW` | PASS — denied unmask |
| 5 | ORG_MANAGER without `LEDGER_VIEW` | PASS — denied unmask |
| 6 | No permissions | PASS — denied (fail closed) |
| 7 | Tenant A `LEDGER_VIEW` / Tenant B none | PASS — no carryover |
| 8 | Column keys preserved | PASS — only sensitive values masked |
| 9 | No HTTP 500 | PASS |
| 10 | ACC Zero-Legacy matrix regression | PASS — 10/10 |

**Masked vs unmasked evidence:**

```javascript
// REPORTS_EXPORT only → masked
{ item: 'A', qty: 2, unitCost: '***', totalValue: '***' }

// REPORTS_EXPORT + LEDGER_VIEW → unmasked
{ item: 'A', qty: 2, unitCost: 42.5, totalValue: 100 }
```

---

## Test counts

| Suite | Pass | Fail |
|---|---:|---:|
| `export-mask.service.test.js` | 12 | 0 |
| `acc-export-mask-runtime.js` | 14 | 0 |
| `acc-zero-legacy-runtime-matrix.js` | 10 | 0 |
| `npm run test:unit` (full backend) | 332 | 0 |

Frontend: **not touched** — no build required.

---

## Tenant isolation

Masking is evaluated from `user.permissions[]` resolved per session/tenant. Cross-tenant test: same user id with `LEDGER_VIEW` in tenant A and `[]` in tenant B → unmask only in A. **PASS**

---

## ACC assignment / DB changes

**None.** No grants, no role changes, no assignment changes, no schema/migration.

Users who need unmasked export costs must already have (or receive via governance) explicit ACC `LEDGER_VIEW` on their assignment — not role name.

---

## Callers (audit)

| Caller | Usage |
|---|---|
| `report.service.js` → `exportEngineGroupedExcel` | `maskExportRows(rows, options.user)` |
| `report.service.js` → `exportPdf` | `maskExportRows(rows, options.user)` |

Routes gated by `REPORTS_EXPORT`. Sensitive fields: `unitCost`, `unitPrice`, `wacAtPosting`, `totalLoss`, `totalValue`, `value`, `netVarianceValue`.

---

## Confirmations

- ACC controls cost visibility on export (**`LEDGER_VIEW`**) ✅
- No role-based unmasking remains ✅
- No ACC auto-grants ✅
- No scope behavior change ✅
- No schema/migration ✅
- No PDF/UI/format changes ✅
- No rollback/restore ✅
- Runtime evidence from executed scripts (not fabricated) ✅

**ACC Zero-Legacy:** export-mask finding is **closed**. `scope.service.js` role shortcuts remain a **deferred, independent governance topic** (scope-only, not modified).
