# GRN Workflow SSOT — Template v1.1

**Status:** Adopted reference for GRN (template for Get Pass / Inventory Count / Transfer / Breakage-Lost).  
**Runtime ACC:** Published GRN chain is authoritative for APPROVAL/POSTING steps.  
**Pre-workflow:** Static system rules until a module-level ACC create capability exists.

## Contract columns

| Column | Purpose |
| ------ | ------- |
| Step Key | Stable step identity |
| Step Type | `PRE_WORKFLOW` \| `APPROVAL` \| `POSTING` \| `TERMINAL` |
| Source of Truth | `Static System Rule` \| `Published ACC` |
| Workflow Version | Pinned `accWorkflowVersionId` / published version when known |
| Awaiting Status | Document status while this step is current |
| Actor Resolution | `Creator` \| `ACC.Step(n)` — not a hard-coded role name |
| Required Permission | JWT permission gate |
| Visible Action Keys | Stable action identities (i18n labels separately) |
| Endpoint | Execution route |
| Next State / Effect | Outcome |

## Action Keys

| Action Key | Label (EN) |
| ---------- | ---------- |
| CREATE | Create |
| VALIDATE | Validate |
| SUBMIT | Submit for Approval |
| APPROVE | Approve |
| APPROVE_POST | Approve & Post |
| REJECT | Reject |
| SEND_BACK | Send Back |
| VIEW | View |
| EVIDENCE | Evidence |

## GRN rows

| Step Key | Step Type | Source of Truth | Awaiting Status | Actor Resolution | Required Permission | Visible Action Keys | Endpoint | Next State / Effect |
| -------- | --------- | --------------- | --------------- | ---------------- | ------------------- | ------------------- | -------- | ------------------- |
| CREATE | PRE_WORKFLOW | Static System Rule | — | Creator role: `STOREKEEPER` (+ Org/Super governance) | `GRN_MANAGE` | CREATE | `POST /grn` | `DRAFT` |
| VALIDATE | PRE_WORKFLOW | Static System Rule | `DRAFT` | Creator (document owner) | `GRN_MANAGE` | VALIDATE | `POST /grn/:id/validate` | `VALIDATED` |
| SUBMIT | PRE_WORKFLOW | Static System Rule | `VALIDATED` | Creator (document owner) | `GRN_MANAGE` | SUBMIT | `POST /grn/:id/submit` | `PENDING_APPROVAL` + ACC start |
| COST_REVIEW | APPROVAL | Published ACC | `PENDING_APPROVAL` | `ACC.Step(1)` | ACC step permission (default `GRN_MANAGE`) | APPROVE, REJECT, SEND_BACK | `/approve` · `/reject` · `/send-back` | → step 2 / REJECTED / send-back |
| FINANCE_POST | POSTING | Published ACC | `PENDING_FINANCE` | `ACC.Step(2)` | ACC step permission (default `GRN_MANAGE`) | APPROVE_POST, REJECT, SEND_BACK | same approve routes | → POSTED / REJECTED / send-back |
| POSTED | TERMINAL | Static System Rule | `POSTED` | — | `GRN_VIEW` | VIEW, EVIDENCE | — | no transitions |
| REJECTED | TERMINAL | Static System Rule | `REJECTED` | Creator (resubmit path) | `GRN_MANAGE` | VIEW (+ edit/resubmit when allowed) | `PATCH` / `POST /submit` | returns to SSOT path |

### Seed note (not the contract)

Default published ACC seed: Step(1) `COST_CONTROL`, Step(2) `FINANCE_MANAGER`. Changing ACC updates actor resolution at runtime; SSOT step keys stay fixed.

### Create actor (hotel policy)

- **Allowed create roles:** `STOREKEEPER`, plus governance `ORG_MANAGER` / `SUPER_ADMIN`.
- **Not allowed to create:** `FINANCE_MANAGER` (and other non-creator operational roles), even if they hold `GRN_MANAGE`.

## Terminal behavior

```
Step Type = TERMINAL
workflow.canAct(*) = false for transition actions
actionVisibility: VIEW / EVIDENCE only
```

## API requirement — `GET /grn/:id`

Must include:

```json
{
  "workflow": {
    "currentStepKey": "COST_REVIEW",
    "stepType": "APPROVAL",
    "sourceOfTruth": "Published ACC",
    "actorResolution": "ACC.Step(1)",
    "requiredPermission": "GRN_MANAGE",
    "allowedActionKeys": ["APPROVE", "REJECT", "SEND_BACK"],
    "workflowVersion": "<versionId-or-null>",
    "currentStepNumber": 1
  }
}
```

Frontend renders from `currentStepKey` + `allowedActionKeys`. Do not invent the step from status alone when `workflow` is present.

## Frontend decision layers

1. `workflow.canAct(stepKey, user)` — permission ∧ actor resolution ∧ step match  
2. `actionVisibility.canRender(action, document)` — ownership / read-only / terminal / feature flags  

## Known gaps addressed in this wave

1. Approve shown on `VALIDATED` despite `/approve` requiring pending ACC statuses.  
2. Submit hidden by conflicting reviewer flags.  
3. Role helper unused for button visibility.  
4. FE inferred workflow from status instead of `currentStepKey`.  
5. Finance Manager could create GRNs via broad `GRN_MANAGE`.

## Out of scope (later)

- Split permissions `GRN_CREATE` / `GRN_SUBMIT`
- Separate `POST /finance-approve`
- Get Pass / Inventory Count / Transfer / Breakage SSOT copies
