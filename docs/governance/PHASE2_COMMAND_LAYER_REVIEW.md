# Phase 2.1 — Command layer & reviewer workspace (review)

| Field | Value |
|--------|--------|
| **Parent** | `PHASE2_ENTERPRISE_UX_REVIEW.md` |
| **Phase** | **2.1** — Reviewer workspace & operational command surface |
| **Date** | 2026-05-14 |
| **Scope** | **Attention visibility** and **queue-driven navigation** on top of stabilized Inventory Count and dashboard flows — **no** new analytics products, **no** AI, **no** ledger/API redesign. |

---

## 1. Executive summary

Phase 2.0 hygiene established **trust** (naming, blind mode, approval trail clarity, register/detail **context preservation**). Phase 2.1 shifts emphasis to **who must act next** and **what is blocking** — a **command-layer**: compact surfaces that answer “what requires attention now?” without turning the product into a separate BI dashboard.

The **dashboard operational queue** already aggregates **control tower** `workflowHealth` (inventory count stages) with other branch work. The main gap is **reviewer ergonomics**: ordering mixed with unrelated rows, **English-only** queue hints, and **misleading “Due / Age”** copy that implied calendar aging when the API only supplies **counts by stage**.

---

## 2. Strengths (preserve)

1. **Existing data contract** — `GET /dashboard/summary` → `controlTower.workflowHealth[]` with `{ status, count }` is sufficient for **attention counts** without new endpoints in early slices.  
2. **Deep links** — `inventoryCountStatusTarget(status)` already navigates to `/inventory-count?status=…` (aligned with register quick filters from Phase 2.0).  
3. **Priority model** — `critical` / `watch` / `stable` + sort by priority then count is a sound backbone for **urgency**.  
4. **Bilingual foundation** — `DASHBOARD.WORKFLOW_STATUS.*` exists for some keys; inventory count statuses can **reuse** `INVENTORY_COUNT_STATUS` for consistent reviewer language.

---

## 3. Gaps addressed in slice 1 (implementation)

| Gap | Risk | Slice 1 response |
|-----|------|------------------|
| **Workflow rows interleaved** with other queue rows only by global count sort | Reviewer **hunts** for pending approval / variance review | **Reviewer-first sort** for `workflowHealth` rows + **queueRank** tie-break so inventory **approval/review** surfaces before lower-urgency items at the same priority tier. |
| **Raw API status** when i18n key missing | Mixed language / jargon in queue | **`workflowStatusDisplay`** falls back to **`INVENTORY_COUNT_STATUS`** keys. |
| **Hardcoded queue copy** | Training and AR properties see English fragments | **i18n** for operational queue **title**, **column headers**, **footer link**, **notes**, **urgency**, **attention hint** (replacing fake “0–1 days”). |
| **No visual cue** for inventory workflow rows | Scan cost in dense table | Subtle **row accent** class for `workflow-*` keys only. |

---

## 4. Non-goals (Phase 2.1 discipline)

- No **new** “dashboard product” (widgets, charts, drill-down analytics) unless each slice is justified as **navigation + attention** only.  
- No **backend** schema changes for “true aging” until product approves SLA definitions; until then, copy must **not** imply precision we do not compute.  
- No **permission renames** (`STOCK_COUNT_VIEW`) in this track without a dedicated governance decision.

---

## 5. Related documents

| Document | Role |
|----------|------|
| `PHASE2_COMMAND_LAYER_PLAN.md` | Slice roadmap + implementation record |
| `PHASE2_ENTERPRISE_UX_REVIEW.md` | Enterprise UX baseline + Phase 2.1 pointer |
| `PHASE2_UX_HYGIENE_PLAN.md` | Phase 2.0 delivered slices (context preservation) |

---

## 6. Verification

- `npm run build` in `OSE-Frontend`.  
- Manual: with `workflowHealth` containing `PENDING_APPROVAL` and `REVEAL_REVIEW`, confirm **Operational Queue** row order and **EN/AR** labels.  
- Screenshot checklist: `docs/governance/assets/phase2.1-slice1/SCREENSHOTS.md`.
