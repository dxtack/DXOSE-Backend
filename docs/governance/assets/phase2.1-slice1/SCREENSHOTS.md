# Phase 2.1 — Slice 1 screenshot checklist (command layer)

Capture in **staging** or local `ng serve` (binaries optional in git; same policy as Phase 2.0).

| # | Suggested filename | What to capture |
|---|-------------------|-------------------|
| 1 | `phase2.1-slice1-operational-queue-order.png` | Dashboard **Operational queue** with `workflowHealth` showing **Pending approval** above **Variance review** / counting when counts are similar — reviewer-first ordering. |
| 2 | `phase2.1-slice1-inventory-workflow-accent.png` | Same view highlighting **left border** on rows whose keys are `workflow-*`. |
| 3 | `phase2.1-slice1-attention-column-en.png` | Fourth column header **Attention** (EN) with values **Respond today** / **Review this week** / **Monitor** — not day-range text. |
| 4 | `phase2.1-slice1-attention-column-ar.png` | Same panel in **Arabic** (`QUEUE_ATTENTION_*`, column headers). |
| 5 | `phase2.1-slice1-click-pending-approval.png` | Click **Pending approval** inventory row → lands on `/inventory-count?status=PENDING_APPROVAL` (context preserved from Phase 2.0). |

**Optional:** Organization or analytics-only profiles where `controlTower` is absent — queue section should remain empty or hidden per existing rules (no regression).
