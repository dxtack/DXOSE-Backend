# Get Pass Workflow SSOT — Template v1.1

**Status:** Adopted alongside GRN.  
**Runtime ACC:** Published GET_PASS chain is authoritative for APPROVAL/POSTING steps.  
**Default seed (not the contract):** Dept → Cost Control → Finance → **General Manager** → Security (`PENDING_DEPT` … `PENDING_GM` → `PENDING_SECURITY`).

## Contract columns

Same as GRN Template v1.1: Step Key · Step Type · Source of Truth · Workflow Version · Awaiting Status · Actor Resolution · Required Permission · Visible Action Keys · Endpoint · Next State.

## Action Keys

| Action Key | Label (EN) |
| ---------- | ---------- |
| CREATE | Create |
| SUBMIT | Submit for Approval |
| APPROVE | Approve |
| REJECT | Reject |
| SEND_BACK | Send Back |
| RETURN | Register return |
| CONFIRM_DESTINATION | Confirm destination |
| FORCE_CLOSE | Force-close / settlement |
| VIEW | View |

## Get Pass rows

| Step Key | Step Type | Source of Truth | Awaiting Status | Actor Resolution | Required Permission | Visible Action Keys | Endpoint | Next State / Effect |
| -------- | --------- | --------------- | --------------- | ---------------- | ------------------- | ------------------- | -------- | ------------------- |
| CREATE | PRE_WORKFLOW | Static System Rule | — | Creator role: `DEPT_MANAGER` / `STOREKEEPER` (+ Org/Super) | `GET_PASS_CREATE` | CREATE | `POST /get-passes` | `DRAFT` |
| SUBMIT | PRE_WORKFLOW | Static System Rule | `DRAFT` | Creator (document owner) | `GET_PASS_CREATE` | SUBMIT | `POST /:id/submit` | If creator role = ACC step 1 (`DEPT_MANAGER`): stamp Department + enter step 2 (single motion). Else: first ACC awaiting status (`PENDING_DEPT`) |
| DEPT_APPROVAL | APPROVAL | Published ACC | `PENDING_DEPT` | `ACC.Step(n)` for that status | ACC / `GET_PASS_APPROVE` | APPROVE, REJECT, SEND_BACK | `/approve` · `/reject` · `/send-back` | next ACC status |
| COST_CONTROL_VERIFY | APPROVAL | Published ACC | `PENDING_COST_CONTROL` | `ACC.Step(n)` | ACC / `GET_PASS_APPROVE` | APPROVE, REJECT, SEND_BACK | same | next |
| FINANCE_SIGN | APPROVAL | Published ACC | `PENDING_FINANCE` | `ACC.Step(n)` | ACC / `GET_PASS_APPROVE` | APPROVE, REJECT, SEND_BACK | same | next |
| GM_AUTHORIZE | APPROVAL | Published ACC | `PENDING_GM` | `ACC.Step(n)` | ACC / `GET_PASS_APPROVE_FINAL` | APPROVE, REJECT, SEND_BACK | same | next (`PENDING_SECURITY`) |
| SECURITY_EXIT | POSTING | Published ACC | `PENDING_SECURITY` | `ACC.Step(n)` | ACC / `GET_PASS_APPROVE_FINAL` | APPROVE, REJECT, SEND_BACK | `/approve` (= checkout) | `OUT` / `CLOSED` |
| OUT | ops | Static System Rule | `OUT` | Return operators | `GET_PASS_APPROVE_RETURN` / dest perms | RETURN / CONFIRM_* | return/confirm routes | return lifecycle |
| REJECTED | TERMINAL | Static System Rule | `REJECTED` | — | `GET_PASS_VIEW` | VIEW | — | — |
| CLOSED | TERMINAL | Static System Rule | `CLOSED` | — | `GET_PASS_VIEW` | VIEW | — | — |

### Create actor (hotel policy)

- **Allowed:** `DEPT_MANAGER`, `STOREKEEPER`, plus governance `ORG_MANAGER` / `SUPER_ADMIN`.
- **Not allowed to create:** `FINANCE_MANAGER`, `COST_CONTROL`, `SECURITY` (even if permission is granted by mistake).

Dept Manager may both request (create) and later appear as ACC.Step(1) for *other* documents; dual-gate still requires matching role + permission on each step.

## Terminal / ops behavior

```
TERMINAL (REJECTED, CLOSED): canAct(transition) = false; VIEW only
OUT / return statuses: ops action keys only (not ACC approve keys)
```

## API requirement — `GET /get-passes/:id`

```json
{
  "workflow": {
    "currentStepKey": "DEPT_APPROVAL",
    "stepType": "APPROVAL",
    "sourceOfTruth": "Published ACC",
    "actorResolution": "ACC.Step(1)",
    "requiredPermission": "GET_PASS_APPROVE",
    "requiredRoleCode": "DEPT_MANAGER",
    "allowedActionKeys": ["APPROVE", "REJECT", "SEND_BACK"],
    "workflowVersion": "<versionId-or-null>",
    "currentStepNumber": 1,
    "awaitingStatus": "PENDING_DEPT"
  }
}
```

Frontend prefers `workflow` over hard-coded GM steppers when present.

## Frontend layers

1. `workflow.canAct(stepKey, user)` — permission ∧ ACC role ∧ step  
2. `actionVisibility.canRender(action, document)` — ownership / target-tenant / terminal / security no-bypass

## Known gaps addressed in this wave

1. Approve chrome for wrong role (permission-only).  
2. No `workflow` on detail.  
3. Create open to any `GET_PASS_CREATE` holder (Finance/Security).  
4. Hard-coded 5-step UI including GM when published chain may omit GM (visibility still status-driven; context drives actor).
