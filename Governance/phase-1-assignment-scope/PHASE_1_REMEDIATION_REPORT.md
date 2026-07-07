# Phase 1 — Assignment & Scope Remediation Report

Generated: 2026-06-28  
Status: **CLOSED** (`phaseClosed: true`)  
Gate version: **phase1-corrected-v2** (verification reopen completed)

## Verification reopen summary

The initial gate submission (25/25) was rejected: assertions contained false-positive conditions (`total >= 0`, hidden API failures, synthetic 404 for missing fixtures) and did not cover the full approved regression scope. Verification was reopened without starting Phase 2.

Corrected gate enforces:

- Real HTTP status preservation with mandatory 2xx for authorized paths
- Explicit in-scope / out-of-scope seeded fixtures with exact ID/count assertions
- Real foreign-tenant Get Pass fixture (fail if missing — no synthetic 404)
- Cross-property movement denial (foreign tenant location, not same-property different dept)
- Unauthorized movement **post** scenarios (26–29) after valid DRAFT creation
- Full regression suite (15 items including GRN, Transfer, Breakage, Lost, IC, Get Pass create/list/detail, tenant switch, pipeline, movement, backend tests, frontend build)

## Root cause (confirmed)

Permissions from JWT (`requirePermission`) were enforced without requiring an active `urUserAssignment` for the current property. Scope (`resolveUserScope`) was applied inconsistently: reads could use role-based property-wide bypass (`FINANCE_MANAGER`, `ORG_MANAGER`), mutations often skipped scope entirely, workflow pipeline/dashboard aggregated tenant-wide rows, Get Pass submit fast-forwarded creators past approval steps, and movements validated tenant membership only—not assignment location scope. Movement **post** initially lacked an assignment gate (proven by corrected gate scenarios 27/29).

Stale JWT is handled via `permissionVersion` → `401 PERMISSIONS_STALE` in `authenticate.js`.

## Files changed and rationale

| File | Why |
|------|-----|
| `assignment-mutation.guard.js` | Single mutation gate: active assignment covering property; SUPER_ADMIN exempt only |
| `scope.service.js` | `assignmentOnly` option for mutations — no Finance/ORG property-wide bypass when resolving location scope |
| `getPass.service.js` | create/submit: assignment + scoped lines; submit uses assignmentOnly scope |
| `getPass.controller.js` | Pass `req.user` into create |
| `acc-workflow-get-pass.runtime.js` | Submit always enters first pending ACC step |
| `workflow-pipeline.service.js` | No assignment → empty pipeline; scoped collectors; `getScopedPipelineItems` for dashboard detail alignment |
| `workflow-pipeline.collectors.js` | `buildScopeWhere` per module at query time |
| `workflow-pipeline.controller.js` | Alerts endpoint applies query filters (e.g. `module=GET_PASS`) |
| `dashboard.service.js` | Zero operationalHealth when no assignment; department profile aligns with scoped pipeline; overdue loan details from full scoped items (not actionable-only alerts) |
| `movement.service.js` | Assignment gate + assignmentOnly location scope on create |
| `movement.controller.js` | Pass `req.user` into create; **post** calls `assertActiveAssignmentForMutation` (defect proven by gate) |
| `verify-acc-p12-cutover-wave2.js` | Align test with first-step submit |
| `getPass.service.test.js` | Mock assignment guard + concurrencyVersion expectations |
| `phase-1-assignment-scope-gate.cjs` | Corrected verification gate (phase1-corrected-v2) |

## Before / after behavior

| Area | Before | After |
|------|--------|-------|
| Get Pass submit (no assignment) | Could mutate / skip checks | `403`; DRAFT unchanged |
| Get Pass submit (valid assignment) | Sometimes fast-forward by creator role | `200` → `PENDING_DEPT` |
| Stale JWT after assignment change | Partial | `401 PERMISSIONS_STALE` on mutate |
| Pipeline / dashboard (no assignment) | Tenant-wide rows, IDs, counts | Empty / zero operational metrics |
| Pipeline authorized (DEPT_MANAGER) | Could include out-of-scope or polluted counts | Exactly 2 in-scope GET_PASS IDs; summary `byModule.GET_PASS === 2` |
| Dashboard overdue loans (DEPT_MANAGER) | Tenant-wide overdue count/details | Scoped count + details; out-of-scope overdue excluded |
| Movement create (cross-property location) | Allowed or 500 | `404`/`403`; no ledger/stock effect |
| Movement post (no/wrong assignment) | Could post without assignment | `403`/`401`; DRAFT unchanged; no ledger/stock |
| Cross-tenant Get Pass read | Sometimes `500` / leak | `404` with real foreign fixture |

## Runtime scenarios (29/29 PASS)

Disposable tenant: `closeout-audit-hotel-disposable`. Foreign tenant: `dx-airport-hotel`. Full evidence: `PHASE_1_RUNTIME_RESULTS.json`.

| ID | Scenario | Result |
|----|----------|--------|
| 1–4 | Never / inactive / deleted / wrong-property submit | PASS |
| 5 | Stale JWT after deactivate | PASS |
| 6–7 | Valid submit; denied leaves DRAFT | PASS |
| 8 | Cross-tenant read (real foreign fixture) | PASS (404) |
| 9–10 | Finance / ORG_MANAGER no fast-forward | PASS |
| 11–15 | Pipeline list/summary/alerts scope + authorized in-scope only | PASS |
| 16–18 | Dashboard operational scope (counts + details) | PASS |
| 19–25 | Movements assignment/scope/create/post/ledger/duplicate | PASS |
| 26–29 | Movement post denied: deactivate / wrong-property / stale JWT / no assignment | PASS |

**Runtime totals:** 29 pass / 0 fail

## Regression (15/15 PASS)

- GRN authorized list + detail
- Transfer authorized list
- Breakage authorized list
- Lost Items authorized list
- Inventory Count authorized list
- Get Pass authorized create
- Get Pass authorized list
- Get Pass authorized detail
- Tenant switch permission refresh
- Workflow Pipeline authorized summary
- Movement authorized create
- `verify-acc-p12-cutover-wave2.js`
- `movement-adjustment-rbac.test.js`
- `getPass.service.test.js` (16/16)
- Frontend development build

## DB before/after proof (representative)

- **Never-assigned submit:** Get Pass row remains `DRAFT`; no approval stamps.
- **Wrong-property / cross-property movement:** `inventory_ledger` count unchanged; `stock_balances.qtyOnHand` unchanged (gate scenarios 20, 23–24, 26–29).
- **Unauthorized movement post:** Document remains `DRAFT`; ledger and stock unchanged after denied post.
- **Valid movement post:** Document created and posted under assigned Finance user with in-scope location.

## Requirement IDs addressed

- `C04-4.3-003` — Action allowed requires scope + assignment on mutations
- `C04-4.4-003` — Wrong-property denial (assignment / location scope)
- Partial coverage of v3 assignment-scope FAIL scenarios (full 393 matrix not in Phase 1 scope)

## Partial / open (deferred to Phase 2+)

- **Configuration Drift:** GM step presence in Get Pass chain
- **Read-path role bypass:** Pipeline/dashboard for assigned Finance still uses assignment-scoped property-wide reads when assignment has no department rows (by design for assigned oversight roles)
- **Department dashboard non-operational widgets:** Inventory/performance widgets still load department-scoped raw queries; operationalHealth now pipeline-aligned

## Design / workflow confirmation

- No HTML, SCSS, layout, or table changes
- No workflow chain, posting, or report module changes
- No Gate A/B/C artifact changes
- `role-permission-fallback.ts` not modified
- Phase 2 not started

## Gate checklist

All items **PASS** — see `PHASE_1_RUNTIME_RESULTS.json` → `gateChecklist`.
