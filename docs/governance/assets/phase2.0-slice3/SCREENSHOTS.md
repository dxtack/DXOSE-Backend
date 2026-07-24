# Phase 2.0 — Slice 3 screenshot checklist

Capture in **staging** or local `ng serve` (same policy as slices 1–2 — binaries optional in git).

| # | Suggested filename | What to capture |
|---|-------------------|-------------------|
| 1 | `slice3-register-breadcrumb-i18n.png` | Register header: **Inventory** crumb is a link; title/subtitle from **`INVENTORY_COUNT_PAGE`** (EN and AR). |
| 2 | `slice3-register-filters-preserved-url.png` | Apply **department + status** (or quick filter); table URL shows `status` / `departmentId`; **Open** a session — address bar still carries those params on detail. |
| 3 | `slice3-detail-back-restores-queue.png` | From step 2, click **Back to register** — register reloads with **same filters** as before. |
| 4 | `slice3-detail-session-overview.png` | Session detail: **Session overview** eyebrow + strip + summary grid; breadcrumb **Inventory / Inventory Count / Session**. |
| 5 | `slice3-detail-timeline-i18n.png` | Approval trail: column headers + **translated status badges** (`Submitted`, `Pending`, etc. in current locale). |
| 6 | `slice3-detail-count-sheet-i18n.png` | Count sheet block: translated labels, **Hidden** placeholder, pagination line from **`PAGINATION_DETAIL`**. |
| 7 | `slice3-detail-variance-kpi-i18n.png` | Variance report shell: KPI row labels + hints in **EN and AR**. |

**Before (optional):** prior commit without query preservation on `Open` / **Back** for PR narrative.
