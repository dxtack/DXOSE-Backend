# Phase 2.0 — UX hygiene & operational identity (plan)

| Field | Value |
|--------|--------|
| **Parent** | `PHASE2_ENTERPRISE_UX_REVIEW.md` |
| **Goal** | Operational clarity, workflow readability, enterprise consistency, reviewer usability — **without** destabilizing workflows or backend contracts. |
| **Method** | Incremental **waves**; each wave is revert-friendly and scoped. |

---

## 1. Principles

1. **Operational first** — every change must answer “does this reduce friction or ambiguity for counting, review, or approval?”  
2. **No feature chaos** — no new modules, no AI/analytics, no ledger or API redesign in this track.  
3. **Naming truth** — UI language must match **Inventory Count** as the canonical workflow; avoid “stock count” product confusion where users see it.  
4. **Reviewer trust** — distinguish **session workflow history** from the global **Audit Log** in copy.  
5. **Density with readability** — tighter spacing only where it preserves scanability.

---

## 2. Wave roadmap (overview)

| Wave | Theme | Status |
|------|--------|--------|
| **2.0 — Slice 1** | Naming, workflow strip truth, blind guidance, variance report title, density nudge, operational icon | **Delivered** (see §3) |
| **2.0 — Slice 2** | Queue quick filters, register row priority, approver **Open** affordance, sticky count toolbar, scrollable count/variance tables, pagination emphasis, Apply hint | **Delivered** (see §10) |
| **2.0 — Slice 3** | Workflow continuity (query-param preservation); breadcrumbs; session overview grouping; inventory-count **i18n completion** (register + detail + shared statuses) | **Delivered** (see §11) |
| **2.1** | Field velocity (autosave / batch save design, keyboard nudges beyond Apply hint) | Planned |
| **2.2** | Reviewer deep links from dashboard rows → session detail | Planned (may need API) |
| **2.3** | Command-surface badges / morning brief | Planned |

---

## 3. Slice 1 — delivered (implementation record)

### 3.1 Naming & terminology

| Before | After |
|--------|--------|
| Variance shell title **“Stock Count Variance Report”** | **`INVENTORY_COUNT_UI.VARIANCE_REPORT_TITLE`** — “Inventory Count Variance Report” (EN) / localized AR |
| Generic “Inventory Count” string in report shell tenant line | **`NAV.INVENTORY_COUNT` \| translate** |
| “Audit trail” on session workflow strip / section (collision with global Audit Log) | **“Workflow history”** (`RETURNS_WORKFLOW.WORKFLOW_HISTORY`) + section title **`INVENTORY_COUNT_UI.APPROVAL_TRAIL_*`** clarifying it is not the global Audit Log |

### 3.2 Operational identity

| Before | After |
|--------|--------|
| Header mark **“IC”** | **Lucide `BookOpen`** in branded tile (aligned with nav icon language) |
| Disabled **“Canonical workflow”** button | **Removed** (dead affordance) |

### 3.3 Workflow strip (register — multi-session)

| Issue | Change |
|--------|--------|
| Strip highlighted a step derived from **one** arbitrary active session when **several** sessions were in flight | **`workflowRegisterActiveKey`** computed: highlights only when **at most one** session is in `COUNTING` / `RECOUNTING` / `REVEAL_REVIEW` / `PENDING_APPROVAL`; otherwise **no** step is active |
| Operator confusion | **`INVENTORY_COUNT_UI.MULTI_SESSION_WORKFLOW_HINT`** shown under the strip when ambiguous |

### 3.4 Workflow strip (detail — single session)

| Issue | Change |
|--------|--------|
| **POSTED** highlighted “Approve & post” | **`workflowActiveKey`**: `POSTED` → **`audit`** / workflow history step (terminal state semantics) |

### 3.5 Blind-count UX

| Before | After |
|--------|--------|
| Single-line `nz-alert` message | **Title + description** via `INVENTORY_COUNT_UI.BLIND_MODE_TITLE` / `BLIND_MODE_DESC` (EN + AR) |

### 3.6 Enterprise density (light touch)

- Page + detail: vertical rhythm **`space-y-4` → `space-y-3`**.  
- Cards / workflow strip / summary grid: slightly **reduced padding/gaps** (SCSS only).

### 3.7 Affected files

| File | Role |
|------|------|
| `OSE-Frontend/src/app/features/inventory-count/inventory-count-page/inventory-count-page.component.ts` | `computed` strip logic, Lucide icon, imports |
| `.../inventory-count-page.component.html` | Icon, removed button, strip binding, hint |
| `.../inventory-count-page.component.scss` | Icon layout, hint style, compact padding |
| `.../inventory-count-detail/inventory-count-detail.component.ts` | `workflowActiveKey` POSTED → audit; `TranslatePipe` |
| `.../inventory-count-detail.component.html` | Translated strings, blind alert, variance shell, strip label |
| `.../inventory-count-detail.component.scss` | Compact spacing |
| `OSE-Frontend/public/i18n/en.json` | `INVENTORY_COUNT_UI` block |
| `OSE-Frontend/public/i18n/ar.json` | Same keys (Arabic copy) |

---

## 4. Screenshots (before / after)

**Repository policy:** Binary screenshots are **not** committed in this slice to avoid binary churn in git; capture in **staging** or local `ng serve` and attach to PR / Confluence.

**Capture guide:** `docs/governance/assets/phase2.0-slice1/SCREENSHOTS.md`  
**Slice 2:** `docs/governance/assets/phase2.0-slice2/SCREENSHOTS.md`  
**Slice 3:** `docs/governance/assets/phase2.0-slice3/SCREENSHOTS.md`

**Minimum set:**

1. **Register — header** — before: “IC” + disabled Canonical button; after: book icon, primary actions only.  
2. **Register — multi-session** — two sessions in COUNTING: before: misleading active strip; after: no active step + hint.  
3. **Detail — posted** — before: Approve step lit; after: Workflow history step lit.  
4. **Detail — blind mode** — before: single-line alert; after: title + description.  
5. **Detail — variance** — before: “Stock Count…” title; after: “Inventory Count Variance Report”.

---

## 5. Operational rationale (slice 1)

- **Counters and supervisors** see a clearer **state model** on the register when multiple properties or departments run parallel counts.  
- **Blind mode** reduces anxiety about “missing numbers” by explaining **what is hidden and when it appears**.  
- **Removing “IC”** aligns the surface with **enterprise inventory** vocabulary.

---

## 6. Reviewer rationale (slice 1)

- **Variance report title** matches **Inventory Count** governance language — reviewer packs and training stay consistent.  
- **Approval & posting trail** copy states explicitly this is **not** the global **Audit Log** — reduces wrong-screen audits.

---

## 7. Rollback notes

1. Revert the single PR (or revert commits) touching the files listed in §3.7.  
2. **No** backend or Prisma changes — rollback is **frontend-only**.  
3. If translations are undesirable in hotfix, revert `en.json` / `ar.json` `INVENTORY_COUNT_UI` block and template `translate` pipes (restore literals).

---

## 8. Verification

- `npm run build` in `OSE-Frontend` (passes after slice 1 and slice 2).  
- Manual: switch EN/AR and confirm `INVENTORY_COUNT_UI` and workflow history strings.  
- Slice 2: exercise quick filters (URL `status` updates), scroll long count sheet (toolbar stays visible), variance table body scroll with header pinned.  
- Slice 3: open session from **filtered register**, confirm **URL carries `status` / `departmentId`**, use **Back to register** and confirm filters **restore**; EN/AR pass on register + detail headings, timeline, count sheet, variance, posting, approval blocks.

---

## 9. Related

- `PHASE2_ENTERPRISE_UX_REVIEW.md` — baseline review; §13 tracks slice status vs remaining roadmap.  
- `GOVERNANCE_INCREMENTAL_HARDENING.md` — naming discipline alignment.  
- `PHASE_ROADMAP.md` — Phase 2 objectives.

---

## 10. Slice 2 — delivered (implementation record)

### 10.1 Queue visibility & navigation (register)

| Change | Rationale |
|--------|-----------|
| **Quick filter** chip row (`INVENTORY_COUNT_UI.QUICK_FILTER_*`) | One click to **Pending approval**, **Variance review**, **Counting**, etc.; updates `status` query param for shareable links. |
| **Row priority styling** (`inventory-register-row--approval|review|floor`) | At-a-glance **operational priority** when scanning many sessions. |
| **Primary “Open”** when `PENDING_APPROVAL` and user `canApprove()` | Matches detail affordance — reviewers spot their queue faster. |

### 10.2 Count velocity & large-session usability (detail)

| Change | Rationale |
|--------|-----------|
| **Sticky count toolbar** (`.inventory-count-toolbar-sticky`) | Location / search / only-missing / Apply stay visible while scrolling long sheets. |
| **`nzScroll`** on count sheet (`400px`) and variance table (`460px`) | Ant Design **sticky header** inside scroll body — fewer lost column headers on large SKU sets. |
| **Pagination bar** (`.inventory-pagination--bar`) | Stronger **page X of Y** band for floor teams paging through lines. |
| **Apply button `title`** (`INVENTORY_COUNT_UI.APPLY_SEARCH_HINT`) | Reduces “why didn’t search run?” friction (Enter still works). |

### 10.3 Reviewer ergonomics

| Change | Rationale |
|--------|-----------|
| **Variance table body font** (`0.84rem` in `.inventory-variance-table-shell`) | Slightly easier numeric scan without changing data density. |

### 10.4 Affected files (slice 2)

| File | Role |
|------|------|
| `inventory-count-page.component.ts` | `AuthService`, `applyQuickStatus`, row/Open helpers |
| `inventory-count-page.component.html` | Quick filters, `tr` classes, dynamic Open `nzType` |
| `inventory-count-page.component.scss` | Quick filter strip, row band styles |
| `inventory-count-detail.component.ts` | `countSheetTableScroll`, `varianceTableScroll` |
| `inventory-count-detail.component.html` | Sticky toolbar wrap, `nzScroll`, pagination class, Apply `title` |
| `inventory-count-detail.component.scss` | Sticky toolbar, pagination bar, variance cell font |
| `public/i18n/en.json` / `ar.json` | `INVENTORY_COUNT_UI` quick filter + Apply hint keys |

### 10.5 Screenshots (slice 2)

Checklist: `docs/governance/assets/phase2.0-slice2/SCREENSHOTS.md`

### 10.6 Operational rationale (slice 2)

Controllers and store leads can **jump to approval queues** without opening the status dropdown; **visual bands** reduce mis-picks when multiple departments run counts in parallel.

### 10.7 Reviewer rationale (slice 2)

Finance approvers see **which row to open** immediately; variance review stays **column-aligned** while scrolling long lists.

### 10.8 Rollback (slice 2)

Revert slice 2 commits (files in §10.4). No API or permission key changes — `canApprove()` mirrors existing detail rules (`ADMIN`, `FINANCE_MANAGER`, `SUPER_ADMIN`).

---

## 11. Slice 3 — delivered (implementation record)

### 11.1 Workflow continuity & context retention

| Change | Rationale |
|--------|-----------|
| **`registerContextQueryParams()`** on register — `openSession`, `createSession`, and `startSession` navigate to `/inventory-count/:id` **with** current `status` + `departmentId` query params when set | Deep links and **return paths** keep the **same queue lens** (less repetitive filter setup). |
| **`registerListQueryParams()`** on detail — **Back** link and breadcrumb middle segment use `[routerLink]` + `[queryParams]` | **Return-to-register** restores prior **quick-filter / dropdown** context from the URL. |
| Invalid `:id` navigation to register also merges **preserved** query params | Avoids dropping context on edge navigations. |

### 11.2 Enterprise readability & reviewer orientation

| Change | Rationale |
|--------|-----------|
| **`inventory-session-overview`** wrapper + **`SESSION_OVERVIEW`** eyebrow around workflow strip + summary grid | Clear **hierarchy**: “where am I in the session” before audit trail and downstream blocks. |
| **Breadcrumbs** — register: `NAV.INVENTORY` (link) → `NAV.INVENTORY_COUNT`; detail: same + session crumb | **Wayfinding** aligned with inventory parent and **register queue**. |
| Light SCSS for breadcrumb links + overview panel | **Continuity** without visual noise. |

### 11.3 i18n completion (inventory count)

| Namespace | Role |
|-----------|------|
| **`INVENTORY_COUNT_STATUS`** | Shared **session status** labels (register options, badges, metadata). |
| **`INVENTORY_COUNT_PAGE`** | Register: headers, workflow strip keys, toolbar summaries, table, create panel, confirmations, toasts, empty states. |
| **`INVENTORY_COUNT_DETAIL`** | Detail: chrome, workflow strip, summary cards, audit grid headers/data-labels, count sheet, variance shell helpers, posting / approval blocks, timeline titles + **translated badge text** (`displayStatus`), KPI labels, footer note, most **NzMessage** / confirm strings. |

### 11.4 Affected files (slice 3)

| File | Role |
|------|------|
| `inventory-count-page.component.ts` | `TranslateService`, `registerContextQueryParams`, translated messages, `workflowSteps.labelKey`, `statusLabel` / filter labels via i18n |
| `inventory-count-page.component.html` | Breadcrumb links, translated copy, empty-state branching (filtered vs empty tenant) |
| `inventory-count-page.component.scss` | Breadcrumb link hover |
| `inventory-count-detail.component.ts` | `TranslateService`, `registerListQueryParams`, timeline `displayStatus`, metadata/summary/footer i18n, messages |
| `inventory-count-detail.component.html` | Overview wrapper, breadcrumbs, back link w/ query params, translated sections |
| `inventory-count-detail.component.scss` | Overview + breadcrumb layout |
| `public/i18n/en.json` / `ar.json` | `INVENTORY_COUNT_STATUS`, `INVENTORY_COUNT_PAGE`, `INVENTORY_COUNT_DETAIL` |

### 11.5 Screenshots (slice 3)

Checklist: `docs/governance/assets/phase2.0-slice3/SCREENSHOTS.md`

### 11.6 Operational rationale (slice 3)

Operators and approvers **return to the same filtered register** after opening a session, reducing **context loss** during long shifts and property-wide count windows.

### 11.7 Reviewer rationale (slice 3)

Bilingual **operational vocabulary** is consistent across register and detail; **approval timeline** badges and **variance KPI** labels read cleanly in **EN and AR**, lowering cognitive load for finance review.

### 11.8 Rollback (slice 3)

Revert slice 3 commits (files in §11.4). No API changes — **frontend + i18n only**. To hotfix language only, revert `INVENTORY_COUNT_PAGE` / `INVENTORY_COUNT_DETAIL` / `INVENTORY_COUNT_STATUS` blocks and template bindings.
