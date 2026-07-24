# GRN SSOT v1.1 — Gaps log (post-implementation wave)

## Closed in this wave

| Gap | Fix |
| --- | --- |
| Approve shown on `VALIDATED` | Detail uses `workflow.allowedActionKeys`; VALIDATED → `SUBMIT` only |
| Submit hidden by conflicting `GRN_MANAGE` reviewer flags | Submit when `canRender(SUBMIT)` = Creator + workflow context |
| FE inferred step from status | `GET /grn/:id` returns `workflow.currentStepKey` |
| Finance could create GRN | Create actor gate: Storekeeper (+ Org/Super); BE + list button + route guard |
| Helper unused for buttons | `workflowCanAct` + `actionVisibilityCanRender` wired in detail |

## Remaining / deferred

| Gap | Notes |
| --- | --- |
| Split `GRN_CREATE` / `GRN_SUBMIT` permissions | Out of scope; still `GRN_MANAGE` + role/actor |
| Separate `/finance-approve` endpoint | Shared `/approve` + step key `FINANCE_POST` |
| Get Pass / Count / Transfer / Breakage SSOT copies | Next waves |
| ACC-driven create actor (not static Storekeeper) | When Builder supports module create capability |
| Legacy VALIDATED rows created by Finance before gate | Existing docs keep owner; new creates blocked |
| FE unit test runner path issues on Windows `&` in repo path | Backend `grnWorkflowContext.util.test.js` passes |

## Manual verify checklist

1. Storekeeper: New GRN visible → create → Validate → Submit  
2. Cost Control: Approve only on `PENDING_APPROVAL`  
3. Finance Manager: No New GRN; Approve & Post only on `PENDING_FINANCE`  
4. Opening VALIDATED as Finance: no Approve button (no 422 from UI)
