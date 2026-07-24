# Phase 2.0 — Slice 1 screenshot capture checklist

Add PNG files here when capturing for PR or release notes (optional commit — team policy).

Suggested filenames:

| File | Viewport / route | What to show |
|------|------------------|--------------|
| `01-register-header-before.png` | `/inventory-count` | Legacy: “IC” glyph + disabled “Canonical workflow” (from prior commit or branch) |
| `01-register-header-after.png` | `/inventory-count` | Current: Lucide book icon, no disabled button |
| `02-register-multi-session-after.png` | `/inventory-count` | ≥2 sessions in COUNTING: muted strip + blue hint bar |
| `03-detail-posted-workflow-after.png` | `/inventory-count/:id` (POSTED) | Last strip segment active = Workflow history |
| `04-detail-blind-alert-after.png` | Counting + blind session | Two-line blind alert |
| `05-detail-variance-title-after.png` | REVEAL_REVIEW or PENDING_APPROVAL | Report shell title “Inventory Count Variance Report” |

**How to capture**

1. `npm run start` in `OSE-Frontend`, log in with a user that has `STOCK_COUNT_VIEW`.  
2. Use browser devtools device toolbar if mobile checks are needed.  
3. Crop to relevant chrome; avoid exposing real guest or PII in filenames shared externally.

**Before shots:** use `git show <parent>:path` checkout of HTML/SCSS for historical UI, or capture from release tag prior to slice 1 merge.
