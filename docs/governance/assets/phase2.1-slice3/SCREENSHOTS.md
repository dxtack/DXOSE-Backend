# Phase 2.1 — Slice 3 screenshot checklist (register attention strip)

Capture in **staging** or local `ng serve` (binaries optional in git; same policy as Phase 2.0).

| # | Suggested filename | What to capture |
|---|-------------------|-----------------|
| 1 | `phase2.1-slice3-attention-strip-mixed.png` | Register **Session register** card: **Attention** row with **multiple chips** (e.g. pending approval + variance review + counting) reflecting **real counts** in the table. |
| 2 | `phase2.1-slice3-attention-chip-active.png` | Click a chip → **quick filter** / URL **`status`** aligns; that chip shows **active** (pressed) styling. |
| 3 | `phase2.1-slice3-queue-origin-token.png` | Land with **`queueFocus=1`** (from dashboard) → strip shows **Linked from operational queue** token **and** count chips when applicable. |
| 4 | `phase2.1-slice3-attention-strip-ar.png` | Same strip in **Arabic** (`REGISTER_ATTENTION_*`). |
| 5 | `phase2.1-slice3-rejected-chip.png` | At least one **Rejected** session in the filtered list → **Rejected · N** chip visible (operational blocker visibility). |
| 6 | `phase2.1-slice3-strip-hidden-posted-only.png` | Filter or dataset where **only posted/void** sessions appear → **Attention** strip **hidden** (no fabricated attention). |

**Regression:** Slice 2 **queue focus** alert, **scroll-to-table**, and **back-link** `queueFocus` behavior unchanged.
