# Phase 2.0 — Slice 2 screenshot checklist

Capture in **staging** or local `ng serve` (same policy as slice 1 — binaries optional in git).

| # | Suggested filename | What to capture |
|---|-------------------|-------------------|
| 1 | `slice2-register-quick-filters.png` | `/inventory-count` with quick filter row; **Pending approval** chip selected (primary). |
| 2 | `slice2-register-row-bands.png` | Register showing ≥2 rows: one **pending approval** (blue band), one **counting** or **variance review** (teal/amber). |
| 3 | `slice2-register-open-primary.png` | Same view as approver user: **Open** is **primary** on pending row, default on others. |
| 4 | `slice2-detail-sticky-toolbar.png` | Session in **COUNTING**, scroll mid sheet: **location/search/Apply** bar still visible at top of card. |
| 5 | `slice2-detail-count-scroll-header.png` | Long sheet: table body scrolls, **header row pinned** (`nzScroll`). |
| 6 | `slice2-detail-variance-scroll.png` | `REVEAL_REVIEW` or `PENDING_APPROVAL`: variance table with scroll + **pagination bar** styling. |
| 7 | `slice2-apply-tooltip.png` | Hover **Apply** showing native tooltip from `APPLY_SEARCH_HINT` (EN and AR). |
| 8 | `slice2-register-table-chrome.png` | Register table: **no** strong vertical column borders — light horizontal row dividers, comfortable cell padding (pilot stabilization vs. heavy grid chrome). |
| 9 | `slice2-quick-filter-url-reload.png` | Click **Counting** (or **Variance review**) quick filter → URL shows `status=COUNTING` or `REVEAL_REVIEW`, table rows match filter; repeat with **department** + optional `queueFocus` cleared. |

**Before (optional):** prior commit without quick filters / sticky toolbar / `nzScroll` for comparison in PR description.

**Design reference (optional):** pilot before/after mock for table + filter density — attach to PR if available outside repo.
