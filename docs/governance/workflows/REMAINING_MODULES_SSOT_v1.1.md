# Remaining modules Workflow SSOT — Template v1.1

Covers **Inventory Count**, **Transfer**, **Breakage**, **Lost** (completed after GRN + Get Pass).

## Shared principles

| Column | Rule |
| ------ | ---- |
| Source of Truth | Pre-workflow = Static; approval = Published ACC |
| Actor Resolution | `Creator` or `ACC.Step(n)` — not hard-coded role in buttons |
| Create | Module-specific create-actor roles ∧ permission |
| Detail API | `workflow` envelope on get-by-id |
| Terminal | VIEW only |

## Create actors (hotel policy)

| Module | Allowed create roles | Permission |
| ------ | -------------------- | ---------- |
| Inventory Count | Storekeeper, Cost Control (+ Org/Super; Receiver aliases) | `STOCK_COUNT_MANAGE` |
| Transfer | Dept Manager, Storekeeper (+ Org/Super) | `TRANSFER_CREATE` |
| Breakage | Dept Manager, Storekeeper (+ Org/Super) | `BREAKAGE_CREATE` |
| Lost | Dept Manager, Storekeeper (+ Org/Super) | `BREAKAGE_CREATE` / `CREATE_LOST` |

Finance / Security / Cost (except Count prepare) **must not** create documents outside their creator policy.

## Inventory Count ACC (seed)

`COST_CONTROL` → `DEPT_MANAGER` → `FINANCE_MANAGER` → `GENERAL_MANAGER`

Pre-workflow: DRAFT → COUNTING → REVEAL_REVIEW → submit into ACC.

## Transfer ACC (seed)

`DEPT_MANAGER` → `FINANCE_MANAGER` (finance posts)

## Breakage / Lost ACC (shared module BREAKAGE)

`DEPT_MANAGER` → `COST_CONTROL` → `FINANCE_MANAGER` → `GENERAL_MANAGER`

### Create / Draft (GRN-aligned + single-motion for step-1 creator)

| CTA | Behavior |
| --- | -------- |
| **Save as Draft** | Explicit only → `DRAFT`, no approval chain |
| **Create** | Create + attach Published ACC. If creator role = ACC step 1 (`DEPT_MANAGER`): stamp Department and enter step 2 (Cost). Else enter step 1 (`PENDING_DEPT`) for a live Dept actor. |

Get Pass return disposition may still pass `preApproveFirstStep: true` when the document is already past department (created at `DEPT_APPROVED`).

### Status while awaiting actors

| Pending ACC step | Document status |
| ---------------- | ---------------- |
| Step 1 (`DEPT_MANAGER`) | `PENDING_DEPT` |
| Step 2 (`COST_CONTROL`) | `DEPT_APPROVED` |
| Step 3 (`FINANCE_MANAGER`) | `COST_CONTROL_APPROVED` |
| Step 4 (`GENERAL_MANAGER`) | `FINANCE_APPROVED` |

## Gaps closed this wave

- `workflow` on Count / Transfer / Breakage / Lost detail responses  
- Create actor locks on BE + list Create chrome for all four  
- Count prepare actor requires role ∧ `STOCK_COUNT_MANAGE`

## Remaining (non-blocking)

- Optional route canActivate guards for Transfer/Breakage/Lost forms (list + BE already gate)  
- Seed permission matrix may still grant Finance CREATE until ACC rights are trimmed  
- Breakage/Lost detail Approve prefers `allowedActionKeys` ∧ ACC step role (dual-gate retained)
