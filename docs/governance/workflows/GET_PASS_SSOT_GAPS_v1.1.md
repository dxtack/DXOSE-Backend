# Get Pass SSOT v1.1 — Gaps log

## Closed in this wave

| Gap | Fix |
| --- | --- |
| No `workflow` on detail | `GET /get-passes/:id` returns `workflow` context |
| Approve UX permission-only | Detail prefers dual-gate via `getPassActionCanRender` + `requiredRoleCode` |
| Finance/Security could create | Create actor: Dept Manager / Storekeeper (+ Org/Super) |
| Submit/Edit any issuer DRAFT viewer | Submit requires Creator + `SUBMIT` action from workflow |
| List New Get Pass any CREATE perm | `isGetPassCreateActor` + route guard |

## Remaining / deferred

| Gap | Notes |
| --- | --- |
| Hard-coded GM stepper UI | Default ACC seed now includes GM before Security; UI prefers `workflow` envelope |
| Post-exit return ops not fully SSOT-driven | RETURN / CONFIRM still use dedicated permission methods |
| ACC `permissionCode` often null on seed steps | Falls back to static status→perm map |
| Approve routes without router `requirePermission` | Service dual-gate remains authoritative |
| Inventory Count / Transfer / Breakage SSOT | Next waves |

## Manual verify

1. Dept Manager / Storekeeper: see New Get Pass → create → Submit  
2. Finance / Cost / Security: no Create  
3. PENDING_DEPT: only Dept Manager sees Approve (not Finance with GET_PASS_APPROVE alone)  
4. PENDING_SECURITY: Security only; no Org bypass on clearance Approve
