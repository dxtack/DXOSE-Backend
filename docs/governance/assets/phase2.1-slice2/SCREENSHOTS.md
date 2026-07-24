# Phase 2.1 — Slice 2 screenshot checklist (command layer — queue continuity)

Capture in **staging** or local `ng serve` (binaries optional in git; same policy as Phase 2.0).

| # | Suggested filename | What to capture |
|---|-------------------|-----------------|
| 1 | `phase2.1-slice2-dashboard-to-register-queue-focus.png` | Dashboard **Operational queue** → click an **Inventory count** workflow row (e.g. Pending approval) → URL includes `status=…` and **`queueFocus=1`**. |
| 2 | `phase2.1-slice2-register-queue-focus-banner-en.png` | Register shows **Operational queue** info alert + **Open first session in list**; table scrolled into view (smooth scroll acceptable in still). |
| 3 | `phase2.1-slice2-register-queue-focus-banner-ar.png` | Same in **Arabic** (`QUEUE_FOCUS_*` keys). |
| 4 | `phase2.1-slice2-dismiss-queue-focus.png` | After **closing** the alert, `queueFocus` is removed from the URL; banner hidden. |
| 5 | `phase2.1-slice2-detail-back-preserves-queue-focus.png` | From register with `queueFocus=1`, open a session → **Back to register** / breadcrumb link returns with **`queueFocus=1`** still present when it was on the session URL. |
| 6 | `phase2.1-slice2-variance-dashboard-link.png` | Dashboard link to variance review (`REVEAL_REVIEW`) includes **`queueFocus=1`** and lands with the same banner behavior. |

**Regression:** Quick filters and manual status/department changes still load the register; changing filters clears **`queueFocus`** from the address bar.
