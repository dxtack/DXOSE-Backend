# Phase 2.1 — Command layer plan (reviewer workspace)

| Field | Value |
|--------|--------|
| **Parent** | `PHASE2_COMMAND_LAYER_REVIEW.md` |
| **Goal** | **Operational attention**, **reviewer-first queues**, and **command-surface** evolution in **small slices** — measurable visibility gains without destabilizing workflows. |

---

## 1. Principles

1. **Attention before analytics** — every slice answers “what should a reviewer or operator open next?”  
2. **Reuse contracts** — prefer existing summary APIs (`controlTower`, `workflowHealth`) before proposing new backends.  
3. **Honest copy** — do not label derived fields as “aging” or “SLA” unless the server exposes those semantics.  
4. **Context preservation** — Phase 2.0 **query-param continuity** remains the default for all new navigation targets.

---

## 2. Wave roadmap

| Wave | Theme | Status |
|------|--------|--------|
| **2.1 — Slice 1** | Dashboard **Operational Queue**: reviewer-first **workflowHealth** ordering, **queueRank** tie-break, **i18n** for queue chrome + notes + urgency/due hints, **inventory status** label reuse, subtle **workflow row** accent | **Delivered** (see §3) |
| **2.1 — Slice 2** | **Queue → register continuity**: dashboard links add **`queueFocus=1`**, register **command cue** (dismissible alert + optional “open first row”), **URL + back-link** preservation, **scroll-to-table** on landing; filter / quick-filter changes clear `queueFocus` | **Delivered** (see §4) |
| **2.1 — Slice 3** | **Register attention strip**: count-backed pills inside the session register (pending approval → variance review → rejected → recounting → counting → draft) + **queue-origin** token when `queueFocus` is active; chips **apply the same status filter** as quick filters | **Delivered** (see §5) |
| **2.2+** | Deep links session-id level, materiality copy, autosave (see enterprise roadmap); optional **sidebar** badge later if needed | As per `PHASE2_ENTERPRISE_UX_REVIEW.md` |

---

## 3. Slice 1 — delivered (implementation record)

### 3.1 Operational rationale

- **Inventory count** stages appear in the same table as transfers, GRNs, and breakage — without ordering discipline, **finance approval** and **variance review** can fall below noisier but larger counts.  
- **Attention column** text now reflects **response expectation** (high / medium / low attention) instead of fabricated day ranges.

### 3.2 Reviewer rationale

- **Pending approval** and **variance review** rows surface **earlier** in the operational queue when priorities tie.  
- Labels align with **Inventory Count** terminology via **`INVENTORY_COUNT_STATUS`** fallback.

### 3.3 Affected workflows

| Workflow | Surface |
|----------|---------|
| **Inventory Count** (all stages present in `workflowHealth`) | Dashboard → **Operational Queue** row order, labels, navigation targets (unchanged URLs). |
| **Branch operational health** (transfers, GRNs, breakage, loans) | Same queue; **relative order** may shift when tied with inventory workflow rows — acceptable trade for reviewer-first command intent. |

### 3.4 Affected files

| File | Role |
|------|------|
| `OSE-Frontend/src/app/features/dashboard/dashboard.component.ts` | `queueRank`, sort, `workflowStatusDisplay`, `branchWorkflowPriority`, `branchDueAge`, `dashboardUrgencyLabel`, `branchOperationalNote`, translated queue rows |
| `OSE-Frontend/src/app/features/dashboard/dashboard.component.html` | Operational Queue title, table headers, footer link — `translate` |
| `OSE-Frontend/src/app/features/dashboard/dashboard.component.scss` | `.dashboard-page__table-row--inventory-workflow` accent |
| `OSE-Frontend/public/i18n/en.json` / `ar.json` | New `DASHBOARD.*` keys for slice 1 |

### 3.5 Rollback (slice 1)

Revert the slice 1 PR touching §3.4 files. **No** API or database migrations.

### 3.6 Screenshot checklist

`docs/governance/assets/phase2.1-slice1/SCREENSHOTS.md`

---

## 4. Slice 2 — delivered (implementation record)

### 4.1 Operational rationale

- Dashboard **operational queue** already lands reviewers on the **correct filtered register**; without a **session id** in `workflowHealth`, the next bottleneck is **orientation** (“I am in the command queue context”) and **one less click** to the first actionable row.  
- **`queueFocus`** is an explicit, **honest** signal (not analytics): it only means “navigation originated from the operational queue,” and it clears when the user changes filtering intent.

### 4.2 Reviewer rationale

- **Actionable summary** at top of register reduces **hunting** after a queue click.  
- **Open first session in list** matches server ordering for the active filter (first row = top of current queue).  
- **Back from session detail** can restore **`queueFocus`** so **return paths** stay consistent for multi-step review.

### 4.3 Affected workflows / components

| Workflow | Surface |
|----------|---------|
| **Inventory Count** | Dashboard **inventory count** workflow row links (`inventoryCountStatusTarget`) and **variance** KPI targets (`inventoryCountVarianceTarget`) → `/inventory-count?…&queueFocus=1`. |
| **Register** | `inventory-count-page`: alert, scroll anchor, query subscription, `registerContextQueryParams`, filter URL sync on manual dropdown change. |
| **Session detail** | `inventory-count-detail`: `registerListQueryParams()` preserves `queueFocus` for breadcrumb / back links. |

### 4.4 Affected files

| File | Role |
|------|------|
| `OSE-Frontend/src/app/features/dashboard/dashboard.component.ts` | `queueFocus: '1'` on `inventoryCountStatusTarget` / `inventoryCountVarianceTarget` |
| `OSE-Frontend/src/app/features/inventory-count/inventory-count-page/inventory-count-page.component.ts` | `queueFocus` handling, `registerContextQueryParams`, `onRegisterFilterChange`, scroll-once, open-first |
| `OSE-Frontend/src/app/features/inventory-count/inventory-count-page/inventory-count-page.component.html` | Banner + anchor id; dropdown `ngModelChange` |
| `OSE-Frontend/src/app/features/inventory-count/inventory-count-page/inventory-count-page.component.scss` | `.inventory-queue-focus` width cap |
| `OSE-Frontend/src/app/features/inventory-count/inventory-count-detail/inventory-count-detail.component.ts` | `registerListQueryParams` includes `queueFocus` |
| `OSE-Frontend/public/i18n/en.json` / `ar.json` | `INVENTORY_COUNT_UI.QUEUE_FOCUS_*` |

### 4.5 Rollback (slice 2)

Revert §4.4 files. **No** API or database migrations. Removing `queueFocus` from URLs is backward-compatible (ignored by older builds).

### 4.6 Screenshot checklist

`docs/governance/assets/phase2.1-slice2/SCREENSHOTS.md`

---

## 5. Slice 3 — delivered (implementation record)

### 5.1 Operational rationale

- Dashboard and **`queueFocus`** already orient cross-surface command flow; **day-to-day execution** still happens on the **register**. A **workflow-native** strip keeps attention **co-located with the session table** so operators and reviewers do not depend on disconnected indicators.  
- All numbers are **literal counts** from the **current API list** for the active filters — no SLA, no aging fiction, no notification engine.

### 5.2 Reviewer rationale

- **Pending approval** and **variance review** appear **first** in chip order so reviewer work stays visually primary.  
- **Rejected** sessions surface as an explicit operational blocker count.  
- **Recounting / counting / draft** cover floor and scope-prep work without duplicating a second dashboard.  
- **Queue-linked** token (when `queueFocus` is on) preserves **operational flow memory** from slice 2 without replacing the dismissible queue alert above the card.

### 5.3 Affected workflows / components

| Workflow | Surface |
|----------|---------|
| **Inventory Count — register** | `inventory-count-page`: attention region above the session table; chip clicks reuse **`applyQuickStatus`** (URL + reload path unchanged from slice 2). |

### 5.4 Affected files

| File | Role |
|------|------|
| `OSE-Frontend/src/app/features/inventory-count/inventory-count-page/inventory-count-page.component.ts` | `registerAttentionChips` computed, `attentionChipLabel` |
| `OSE-Frontend/src/app/features/inventory-count/inventory-count-page/inventory-count-page.component.html` | Attention strip markup |
| `OSE-Frontend/src/app/features/inventory-count/inventory-count-page/inventory-count-page.component.scss` | `.inventory-register-attention*` |
| `OSE-Frontend/public/i18n/en.json` / `ar.json` | `INVENTORY_COUNT_UI.REGISTER_ATTENTION_*` |

### 5.5 Rollback (slice 3)

Revert §5.4 files. **No** API or database migrations.

### 5.6 Screenshot checklist

`docs/governance/assets/phase2.1-slice3/SCREENSHOTS.md`
