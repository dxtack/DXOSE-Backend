# Phase 2 — UX stabilization screenshot checklist (integrated regression)

Use after **Phase 2.0 (slices 1–3)** and **Phase 2.1 command layer (slices 1–3)** are present. Capture in **staging** or local `ng serve`. Binaries optional in git (same policy as prior phase checklists).

| # | Suggested filename | What to capture |
|---|-------------------|-----------------|
| 1 | `phase2-stabilization-dashboard-queue-full.png` | Dashboard **Operational queue** — inventory workflow rows, **attention** column (honest hints), **reviewer-first** row order when comparable counts exist. |
| 2 | `phase2-stabilization-dashboard-to-register-pending.png` | Click **Pending approval** inventory row → `/inventory-count?status=PENDING_APPROVAL&queueFocus=1` (or equivalent) + **queue alert** + **attention strip** + table. |
| 3 | `phase2-stabilization-register-attention-mixed.png` | Register with **multiple** attention chips visible (mixed statuses in data) + quick filters row — **density** sanity (no overlapping chrome). |
| 4 | `phase2-stabilization-detail-variance-approval.png` | Session in **REVEAL_REVIEW** or **PENDING_APPROVAL** — variance / approver region + **Approval & posting trail** + **workflow strip**. |
| 5 | `phase2-stabilization-back-continuity.png` | From detail, **Back to register** / breadcrumb — restored **`status`**, **`departmentId`**, optional **`queueFocus`** per test case. |
| 6 | `phase2-stabilization-rtl-register.png` | **Arabic** locale: register header, **attention strip**, quick filters, queue alert (if shown) — RTL layout readability. |
| 7 | `phase2-stabilization-multi-session-hint.png` | Property data with **≥2** active workflow sessions — **multi-session workflow hint** visible; strip **does not** claim a single active step. |
| 8 | `phase2-stabilization-register-table-chrome.png` | Register session table: **no** vertical column grid lines; subtle horizontal row separation (regression vs. heavy blue column borders). |
| 9 | `phase2-reporting-workspace-tabs-en.png` | `/reports` — **Reporting workspace** header + **six domain tabs** + search row + first tab grid (English). |
| 10 | `phase2-reporting-workspace-operational-split.png` | **Operational workflows** tab — verify **Breakage**, **Lost**, and **Get pass & returns** appear as **three separate** subgroup headers with distinct cards. |
| 11 | `phase2-reporting-workspace-packs-ar.png` | **Reviewer packs** tab — larger pack-style cards + **Arabic** tab labels / subgroup readability (RTL). |
| 12 | `phase2-reporting-workspace-child-back-link.png` | Open e.g. `/reports/detail` — **Reporting workspace** back link above content + report engine still usable. |

**Cross-reference:** `phase2.0-slice2` rows 8–9 (quick-filter URL + table chrome); per-slice evidence in `phase2.0-slice*/SCREENSHOTS.md` and `phase2.1-slice*/SCREENSHOTS.md`. **Reporting workspace:** `docs/governance/REPORTING_WORKSPACE_ARCHITECTURE.md`.
