# Reporting workspace architecture — DX OSE

| Field | Value |
|--------|--------|
| **Status** | Implemented (UI shell + catalog); reporting **engine** unchanged |
| **Date** | 2026-05-14 |
| **Scope** | Angular `OSE-Frontend/src/app/features/reports/` — navigation, grouping, copy, and roadmap placeholders only |

---

## 1. Purpose

Replace the **flat** `/reports` landing (a small grid of engine shortcuts) with a **structured operational review workspace**: six **domains**, **sub-groups**, and **enterprise-density cards** so hotel inventory, count, operational workflows, audit, and reviewer work stay mentally separable as the catalog grows.

This phase does **not** add reporting APIs, new export engines, executive dashboards, charts, or AI blocks.

---

## 2. Multi-level organization

| Level | UI | Notes |
|-------|-----|--------|
| **L1** | `nz-tabs` | Six tabs = six reporting **domains**. |
| **L2** | Subgroup `<h2>` | Lightweight uppercase section headers inside each tab. |
| **L3** | Responsive grid | Compact cards: title, hint, **Live** vs **Roadmap** badge. |
| **L4** | Pack tier | **Reviewer packs** tab uses wider grid + taller cards (`--pack`); same pattern for pack-shaped items in Reviewer workspace where applicable. |

---

## 3. Tab (domain) structure

1. **Inventory control** — Stock position, health, movement analytics, dimensional cuts.  
2. **Inventory count** — Variance, sessions, quality, exceptions (aligned with count lifecycle).  
3. **Operational workflows** — **Breakage**, **Lost**, **Transfers**, **Get pass & returns**, **Workflow exceptions** (explicit separation; see §5).  
4. **Audit & governance** — Activity, approval/posting, compliance, deep investigation.  
5. **Reviewer workspace** — Queues, attention/escalation, SLA/workload, daily review.  
6. **Reviewer packs** — Curated bundles (roadmap generation).

---

## 4. Subgroup structure (by tab)

### Inventory control

- Stock & valuation  
- Inventory health  
- Consumption & movement  
- Inventory dimensions  

### Inventory count

- Variance  
- Count sessions  
- Count quality  
- Count exceptions  

### Operational workflows

- **Breakage** (damage / hotel breakage narrative + engine breakage report)  
- **Lost** (lost accountability — **not** merged with breakage)  
- **Transfers**  
- **Get pass & returns** (temporary moves, returns, outstanding — **not** merged with lost)  
- **Workflow exceptions**  

### Audit & governance

- Audit activity  
- Approval & posting  
- Compliance & violations  
- Governance investigation  

### Reviewer workspace

- Queues  
- Attention & escalation  
- SLA & workload  
- Daily review  

### Reviewer packs

- Month-end packs  
- Governance packs  
- Store audit packs  
- Variance investigation packs  
- Department & property packs  

---

## 5. Operational rationale — Breakage vs Lost vs Returns

| Domain | Operational meaning | Accountability | Reviewer / audit |
|--------|---------------------|------------------|------------------|
| **Breakage** | Physical damage, consumption write-offs tied to **breakage** workflow and engine. | Often department / cost ownership distinct from “missing”. | Reviewer focuses on **approved breakage lines** and trends. |
| **Lost** | **Missing** inventory and lost documents; different approval path and narrative. | May tie to security / compensation patterns. | Investigation pack differs from breakage. |
| **Get pass & returns** | **Temporary** movement and **return SLA**; outstanding vs returned assets. | Gate / security and time-bound accountability. | Audit emphasizes **circulation** and overdue return risk. |

Merging these into one “operational loss” bucket would **blur investigation logic** and **overload reviewers**. The workspace keeps **three visible subgroups** under Operational workflows.

---

## 6. Grouping rationale (short)

- **Inventory control**: separates *what we have and value* (stock/valuation) from *risk signals* (health) and *velocity* (consumption/movement) from *cuts* (department/location/category).  
- **Inventory count**: mirrors session lifecycle — variance analytics vs register state vs quality vs exceptions.  
- **Audit & governance**: separates **read-only trails** (log, history) from **posting/period** controls from **compliance** from **deep reconstruction** narratives.  
- **Reviewer workspace vs packs**: workspace = **daily operational attention**; packs = **period-end or investigation bundles** (larger, fewer cards).

---

## 7. Search, favorites, recently used

- **Search**: Filters cards inside the active tab by translated title, hint, or id (client-side).  
- **Favorites / Recently used**: **Disabled** actions with tooltips — UX placeholder only; **no** persistence or API (future-ready).

---

## 8. Affected files

| Path | Change |
|------|--------|
| `OSE-Frontend/src/app/features/reports/reporting-workspace/reporting-workspace.manifest.ts` | **New** — domain/subgroup/card catalog, routes, `live` / `planned`. |
| `OSE-Frontend/src/app/features/reports/reports-workspace/reports-workspace.component.ts` | **New** — tabs, search, filtering. |
| `OSE-Frontend/src/app/features/reports/reports-workspace/reports-workspace.component.html` | **New** — layout + cards. |
| `OSE-Frontend/src/app/features/reports/reports-workspace/reports-workspace.component.scss` | **New** — enterprise density + pack modifiers. |
| `OSE-Frontend/src/app/features/reports/reports-layout/reports-layout.component.ts` | Workspace visibility + removed old picker model. |
| `OSE-Frontend/src/app/features/reports/reports-layout/reports-layout.component.html` | Embeds workspace; **back** link to `/reports` on child routes. |
| `OSE-Frontend/src/app/features/reports/reports-layout/reports-layout.component.scss` | Picker styles removed/simplified; context bar. |
| `OSE-Frontend/public/i18n/en.json` | `REPORTS.WORKSPACE` (merged via script). |
| `OSE-Frontend/public/i18n/ar.json` | `REPORTS.WORKSPACE` (merged via script). |
| `OSE-Frontend/scripts/merge-reporting-workspace-i18n.mjs` | **New** — regenerates `REPORTS.WORKSPACE` block from script constants. |
| `docs/governance/REPORTING_WORKSPACE_ARCHITECTURE.md` | This file. |
| `docs/governance/REPORTING_WORKSPACE_ROADMAP.md` | Roadmap companion. |
| `docs/governance/PHASE2_ENTERPRISE_UX_REVIEW.md` | Evolution note. |
| `docs/governance/assets/phase2-ux-stabilization/SCREENSHOTS.md` | New checklist rows. |

**Unchanged:** `app.routes.ts` report child routes, report engine components, backend report services.

---

## 9. Rollback

1. Restore `reports-layout.component.{ts,html,scss}` from the commit **before** this change (re-instate tile picker + `showPicker` / Lucide icons).  
2. Remove `reports-workspace/` and `reporting-workspace/` folders.  
3. Remove `REPORTS.WORKSPACE` from `en.json` / `ar.json` (optional; harmless if left).  
4. Remove governance doc updates if undesired.

---

## 10. Screenshot checklist (see also `SCREENSHOTS.md`)

- `/reports` — six tabs + search + Operational tab showing **three** separated operational subgroups.  
- Reviewer **packs** tab — larger pack cards.  
- `/reports/detail` (or any child) — **Reporting workspace** back link + report content.  
- Arabic — workspace tab labels + one operational subgroup.

---

## 11. Before / after

| Before | After |
|--------|--------|
| `/reports` showed a **single grid** of ~7 engine shortcuts. | `/reports` shows **six domain tabs**, subgroups, and **full catalog** (live deep links + roadmap cards). |
| Operational entry points for breakage/returns/lost were not framed as a **review workspace**. | **Breakage**, **Lost**, and **Get pass & returns** are **explicit** subgroups with distinct cards. |
| No search; no place for roadmap report names. | **Search** + **Roadmap** badges + favorites/recents **placeholders**. |

---

## 12. i18n maintenance

To adjust copy for all workspace strings in one place, edit `OSE-Frontend/scripts/merge-reporting-workspace-i18n.mjs` and run:

`node scripts/merge-reporting-workspace-i18n.mjs`

from `OSE-Frontend` (re-writes `REPORTS.WORKSPACE` in both locale files).
