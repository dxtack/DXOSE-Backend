# Phase 1 — Assignment & Scope Root Cause Audit

Generated: 2026-06-27

## Root cause (consolidated)

Permissions are resolved at JWT auth (`resolveSession` → `req.user.permissions`) **without requiring an active `urUserAssignment` for the current property**. Data scope (`resolveUserScope`) is resolved **ad hoc per service** and is **skipped on mutations**. Several roles receive **automatic tenant-wide scope** (`ORG_MANAGER`, `PROPERTY_WIDE_OVERSIGHT_ROLES`) without assignment validation. Get Pass submit additionally **fast-forwards** workflow via `getSubmitInitialWorkflowFromContext` for `ORG_MANAGER`/`SUPER_ADMIN` and creators whose role appears in the workflow chain.

**Stale authorization** is partially handled: `authenticate.js` rejects JWT when `permissionVersion` drifts (401 `PERMISSIONS_STALE`). Assignment deactivation increments `permissionVersion`; stale tokens must not mutate.

## Root causes (enumerated)

| # | Cause | Evidence |
|---|--------|----------|
| RC-1 | Permission gate ≠ assignment gate | `requirePermission` checks JWT only; no `urUserAssignment` on submit |
| RC-2 | Mutations skip scope resolver | `submitGetPass`, `createMovementDraft`, pipeline collectors — no `assertInScope` / `assertLocationInScope` |
| RC-3 | Tenant-wide aggregators | `workflow-pipeline.service.js` `loadAllItems(tenantId)` — no `buildScopeWhere` |
| RC-4 | Role-based scope bypass | `scope.service.js` `GOVERNANCE_TENANT_WIDE_ROLES`, `PROPERTY_WIDE_OVERSIGHT_ROLES` without assignment |
| RC-5 | Get Pass submit fast-forward | `acc-workflow-get-pass.runtime.js` `getSubmitInitialWorkflowFromContext` |
| RC-6 | Movements validate tenant only | `movement.service.js` location exists in tenant, not in assignment scope |

## Affected files

| File | Issue |
|------|--------|
| `OSE-backend/src/services/scope/assignment-mutation.guard.js` | **NEW** shared mutation/read assignment gate |
| `OSE-backend/src/services/getPass.service.js` | Submit/create missing assignment + scope |
| `OSE-backend/src/services/acc-workflow-get-pass.runtime.js` | Creator/ORG fast-forward on submit |
| `OSE-backend/src/services/workflow-pipeline/workflow-pipeline.service.js` | No scope on collect |
| `OSE-backend/src/services/workflow-pipeline/workflow-pipeline.collectors.js` | Tenant-only Prisma queries |
| `OSE-backend/src/services/movement.service.js` | No location scope on create |
| `OSE-backend/src/controllers/movement.controller.js` | Pass `req.user` for scope |

## Affected routes / services

- `POST /api/get-passes/:id/submit`, `POST /api/get-passes`
- `GET /api/workflow-pipeline`, `/summary`, `/alerts`
- `GET /api/dashboard/summary` (via pipeline alignment)
- `POST /api/movements`, `POST /api/movements/:id/post`

## Shared components impact

- `resolveUserScope` / `buildScopeWhere` — reused for pipeline collectors
- `assertActiveAssignmentForMutation` — new shared gate for all Phase 1 mutations
- `authenticate.js` — unchanged (permissionVersion stale already 401)
- `role-permission-fallback.ts` — **not touched**

## Smallest remediation plan

1. Add `assertActiveAssignmentForMutation(user, tenantId)` — active `urUserAssignment` covering property; **no role bypass** (except `SUPER_ADMIN` platform).
2. Get Pass submit/create: assignment gate + `assertInScope(GET_PASS)` before status change.
3. Remove submit fast-forward in `getSubmitInitialWorkflowFromContext` — always first pending step.
4. Pipeline: resolve scope; empty assignment → zero items; else merge `buildScopeWhere` per module in collectors.
5. Movements: assignment gate + `assertLocationInScope` on header/lines before create.

## Regression risk

| Area | Risk | Mitigation |
|------|------|------------|
| Authorized DEPT_MANAGER submit | Low | Positive control in gate |
| ORG_MANAGER org switch | Medium | Assignment must exist per property |
| Finance property-wide reads | Low | Assignment gate on mutations only; reads use scope filter |
| GRN/Transfer flows | Low | No changes to those services in Phase 1 |
| Pipeline empty for valid users | Medium | Property-wide assignment with empty dept rows → tenant-wide within property |

## Requirement IDs addressed (Phase 1 scope)

- `C04-4.3-003` — Action Allowed = Permission + Workflow + Lifecycle + Business Rules + **Scope**
- `C04-4.4-003` — Property scope (wrong-property scenarios)
- Partial improvement on assignment-related v3 FAIL scenarios (not closing full 393 matrix)
