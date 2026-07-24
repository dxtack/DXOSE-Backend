# Phase 2 — Enterprise operational UX review (Inventory Count first slice)

| Field | Value |
|--------|--------|
| **Status** | Baseline review — **Phase 2 entry**; **stabilization accepted** (`PHASE2_UX_STABILIZATION_REVIEW.md`). **Pilot execution & operational observation** — capture notes in `PILOT_OPERATIONAL_FEEDBACK.md`; **defer** major UX expansion until pilot readout. |
| **Date** | 2026-05-14 |
| **Product direction** | **Hotel Operational Governance Platform** — OS&E, operational inventory, audit-grade workflows, accountability, reviewer-grade control (not generic ERP/HR/CRM). |
| **Scope of this document** | **Inventory Count UX & workflow experience** as the first Phase 2 vertical; references current Angular implementation under `OSE-Frontend/src/app/features/inventory-count/`. |

**Prerequisites:** Phase 1 stabilization closure (`PHASE1_STABILIZATION_CLOSURE.md`), audit facade (`AUDIT_FACADE_*`), reporting truth catalogs.

---

## 1. Executive summary

The canonical **Inventory Count** experience is already **operationally coherent**: scoped sessions, snapshot discipline, location-aware count sheets, blind mode, variance review framed in a **reviewer-grade report shell**, approval actions, and an in-page **approval/posting trail**. The **dashboard** exposes inventory-count workflow health with **deep links** into the session register (`status` query params, and **`queueFocus`** when the link originates from the operational queue — Phase 2.1 slice 2). The **register** adds a **workflow-native attention strip** (Phase 2.1 slice 3) so operational counts stay visible beside the session table.

Gaps are less about “missing screens” and more about **enterprise orchestration**: cross-property queues, i18n/visual identity consistency, **field-velocity** on large sheets, and a **command-center** narrative that unifies “my work” with “property work” without fragmenting navigation. Phase 2 should **amplify clarity and accountability**, not add parallel workflows.

---

## 2. Current screen flow (as implemented)

| Step | Route / behavior |
|------|------------------|
| **Register** | `/inventory-count` — session table, status/department filters (query params supported from dashboard links, including optional **`queueFocus`** from the operational queue), **register attention strip** (count-backed workflow chips inside the register card), create-scope panel, workflow strip, actions per row (Open, Start, Cancel draft, PDF when posted). |
| **Session detail** | `/inventory-count/:id` — status-driven header actions; workflow strip; summary cards (primary location, current approver, round, snapshot, posted time, scope); **approval timeline** table; conditional blocks for count sheet, variance review, management notes, approver reject/approve, posting result. |
| **Legacy entry** | `/stock-report` → redirect to **`/inventory-count`** (intentional retirement of duplicate count entry). |

**Navigation:** Dedicated sidebar section `NAV.INVENTORY_COUNT` with a single link to the register (`navigation.service.ts`). Permission gate: `STOCK_COUNT_VIEW` (name legacy; UX copy correctly says “Inventory Count”).

---

## 3. Strengths (keep and build on)

1. **Workflow literacy** — Repeated **workflow strip** (list + detail) orients users to Count → Review → Approve → Recount → Audit framing; aligns with hotel ops mental model of staged control.  
2. **Scoped operational truth** — Create flow encodes department, optional category, **multi-location scope**, **blind mode**, and notes before snapshot — matches governance expectations for controlled counts.  
3. **Reviewer-grade variance surface** — `REVEAL_REVIEW` / `PENDING_APPROVAL` uses `app-report-identity-shell` with explicit variance columns, WAC disclaimer, and structured metadata — strong foundation for **finance / reviewer** trust.  
4. **Accountability visibility** — Approval trail grid (step, role, actor, time, status) surfaces **who did what** without leaving the session.  
5. **Floor pragmatism** — Location selector (including **All scoped locations**), item search, **Only missing** toggle, pagination (50 lines), export/upload — supports real hotel back-of-house execution.  
6. **Blind count integrity** — `nz-alert` when blind mode is on; sheet shows **Hidden** for book qty and variance during count — correct behavioral signal.  
7. **Command-center seed** — Dashboard **operational queue** rows include inventory-count **workflow health** counts with **navigation targets** that pre-filter the register by `status` (and variance-related targets use `REVEAL_REVIEW`). **Phase 2.1** adds **`queueFocus`** continuity and a **register attention strip** so command intent survives inside the workflow workspace.  
8. **Posting closure** — Posted state shows posting cards + PDF path from register — supports audit pack export narrative.

---

## 4. UX weaknesses

| Area | Observation | **Phase 2.0 slice 1** |
|------|----------------|------------------------|
| **Copy & localization** | Large portions of inventory count UI used **hardcoded English** while other areas used `translate` — bilingual ops risk. | **Improved through slice 3:** register + detail surfaces, statuses, timeline badges, count sheet, variance KPIs, posting/approval blocks, and most toasts use **`INVENTORY_COUNT_PAGE`**, **`INVENTORY_COUNT_DETAIL`**, and **`INVENTORY_COUNT_STATUS`** (EN + AR). Residual literals may exist in ancillary flows outside this slice. |
| **Visual identity** | List header used placeholder **“IC”** — weak **enterprise brand** cohesion. | **Resolved:** **Lucide `BookOpen`** in header tile. |
| **Dead / muted affordances** | “Canonical workflow” button was **disabled** — read as unfinished. | **Resolved:** **Removed.** |
| **Workflow strip semantics** | On the **register**, active strip step was **inferred from one session** — with **multiple concurrent sessions**, the strip could mislead. | **Resolved:** **no active step** when >1 in-flight session + **hint** (`INVENTORY_COUNT_UI.MULTI_SESSION_WORKFLOW_HINT`). |
| **Permission naming vs UX** | Route permission `STOCK_COUNT_VIEW` vs product language “Inventory Count” — documentation/training burden. | **Unchanged** (no permission key rename in this slice). |
| **“Audit trail” wording** | Strip/section said **Audit trail** while the block is **approval workflow** — collision with global **Audit Log**. | **Resolved:** strip uses **Workflow history**; section uses **Approval & posting trail** + subtitle clarifying it is **not** the global Audit Log. |

---

## 5. Workflow friction

1. **Line-by-line save** — Count sheet saves on **blur / Enter / Save** per row; large locations imply **high interaction cost** and risk of lost edits if users navigate away without saving (browser-level, not autosave batch). **Unchanged** (slice 3+ candidate: batch/autosave design).  
2. **Pagination vs throughput** — Page size 50 is reasonable for DOM health; **high-SKU** locations still require many **Next** cycles — friction for big stores without scanner-led batch flows. **Partial (slice 2):** scroll regions + **clearer pagination bar** + **sticky count headers** within `nzScroll` improve scan continuity; throughput ceiling unchanged.  
3. **Apply vs implicit search** — Search requires **Apply** (or Enter) — correct for server load but easy to forget on busy floors. **Partial (slice 2):** **tooltip hint** on Apply (`INVENTORY_COUNT_UI.APPLY_SEARCH_HINT`).  
4. **Multi-session operators** — Register is strong; switching between two active sessions still relies on **manual row open** — no “pinned” or “recent sessions” strip. **Unchanged.**  
5. **Approver queue** — Approver lands on **filtered register** from dashboard but still must **find the session row**. **Partial (Phase 2.0 slice 2):** **quick filter → Pending approval**, **row priority band**, **primary Open** for approvers reduce hunt time. **Partial (Phase 2.1 slice 2):** **`queueFocus=1`** from dashboard operational links shows a **compact command cue**, **scroll-to-table**, **open first session in list**, and **detail → register** can restore `queueFocus`; **no** dashboard row → `sessionId` deep link yet (API/UX later). **Partial (Phase 2.1 slice 3):** **register attention strip** surfaces **count-backed** workflow chips (and queue-origin token) **above the session table** for faster orientation.

---

## 6. Enterprise UX gaps

| Gap | Why it matters for hotels |
|-----|---------------------------|
| **No role-optimized landing** | Counting staff, department heads, and financial reviewers have different **first screens**; today everyone meets the same register layout first. |
| **Limited density options** | No **compact / comfortable** density toggle on sheets; long shifts favor compact tables and sticky column headers. **Partial (slice 2):** sticky **count toolbar** + **table `nzScroll`** with pinned headers on count + variance; no global density toggle yet. |
| **Reviewer pack export timing** | PDF from register for **POSTED** is clear; **pre-post** reviewer may want a **read-only variance pack** (policy decision — may be export-only UX without backend change). |
| **Variance drill-down** | Variance table is **flat** — no drill to movement/ledger context from a line (would stay governance-safe if read-only links). |
| **Cross-workflow context** | Session detail is **excellent within count** but isolated from **transfers / GRN / period** context that reviewers mentally correlate — command-center could summarize **without** redesigning workflows. |

---

## 7. Operational bottlenecks

1. **Throughput under high SKU count** — Pagination + manual save = **time-to-complete** risk during night-count windows.  
2. **Concurrent property operations** — Org managers with multiple properties depend on **tenant context**; inventory count UI is **single-tenant per session** (correct) but **queue** insight at org level is dashboard-dependent.  
3. **Training load** — Mixed **i18n keys vs literal English** increases documentation effort for hotel trainers. **Reduced for Inventory Count (slice 3):** register + detail primary paths are keyed; trainers should still verify AR hospitality phrasing in UAT.

---

## 8. Reviewer pain points

1. **WAC / valuation disclaimer** is present — good; reviewers still need **confidence cues** (e.g. materiality threshold hints, count date vs posting date) — can be **copy + layout** without new analytics engines.  
2. **Reject vs approve** — Reject reason field exists; ensure **confirmation friction** and **audit narrative** remain obvious (already aligned with backend audit discipline).  
3. ~~**Naming**: Variance block title “Stock Count Variance Report” vs **Inventory Count**~~ — **Addressed in Phase 2.0 slice 1** (renamed + i18n). ~~Other English literals on register/detail~~ — **Largely addressed in slice 3** (`INVENTORY_COUNT_PAGE` / `INVENTORY_COUNT_DETAIL`). Spot-check ancillary strings in future passes.
4. **Timeline vs ledger** — Reviewers may want a **one-click** path to **global audit log** filtered by `sessionNo` / entity — navigation enhancement, not workflow rewrite.

---

## 9. Command-center opportunities (hotel-aligned)

These **respect** Phase 1 truth: they are **visibility and navigation** layers, not new posting engines.

1. **Unify “my inventory count actions”** — Dashboard already lists workflow health; extend with **“awaiting my approval”** count that deep-links to `PENDING_APPROVAL` filtered register **and** highlights sessions where `currentApprover` matches user (requires API field exposure if not already present in list payload).  
2. **Session-centric deep links** — Queue rows could carry `sessionId` in query (`/inventory-count?id=`) when API supports mapping from aggregate health → session ids, reducing **hunt friction**.  
3. **Property morning brief** — Read-only card: counts in **COUNTING**, **REVEAL_REVIEW**, **PENDING_APPROVAL** with SLA-style **age** (time since snapshot) — operational intelligence **without** building a separate analytics product if sourced from existing timestamps.  
4. **Sidebar density** — Keep **Inventory Count** prominent for roles with `STOCK_COUNT_VIEW`; optional badge when `workflowHealth` counts > 0 remains a **later** enhancement now that the **register attention strip** (Phase 2.1 slice 3) covers workflow-native attention.  
5. **Mobile / tablet** — Sticky toolbar for count sheet (location + search + only missing) for **floor tablet** use — hotel reality. **Partial (slice 2):** **sticky count toolbar** implemented on session detail desktop scroll context; dedicated mobile layout still future work.

---

## 10. Hotel-operation-specific improvements

1. **Shift handoff** — Surface **last counted by / at** more prominently in sheet (already per line) + optional **“handoff note”** visible at top during COUNTING (uses existing notes or small extension).  
2. **Blind count training** — Short **inline help** (collapsible) explaining blind mode for **night audit** teams — reduces wrong-mode incidents.  
3. **Location naming** — Ensure location + department labels survive **truncation** (`max-w` on register) — tooltips are partially present; verify **full scope** on hover everywhere.  
4. **Multi-language ops** — Prioritize **i18n keys** for inventory count templates to match **property locale** expectations.  
5. **Department head lens** — Default **department filter** from user’s primary department when role implies it — reduces noise for large hotels.

---

## 11. Recommended UX evolution roadmap (Phase 2 — incremental)

| Wave | Focus | Outcome |
|------|--------|---------|
| **2.0 — Hygiene & trust** | i18n for inventory count; remove or explain disabled controls; align “Stock Count” vs “Inventory Count” copy in variance shell; rename nav permission in admin UI only (not route key if risky). | **Slice 1 + 2 + 3 delivered** for Inventory Count UX (`PHASE2_UX_HYGIENE_PLAN.md` §3, §10, §11). Further waves focus on **field velocity** and navigation depth. |
| **2.1 — Command layer & reviewer workspace** | Dashboard **operational queue** attention ordering, honest **attention** column, inventory workflow row cue; **slice 2:** **`queueFocus`** register continuity; **slice 3:** **register attention strip** (`PHASE2_COMMAND_LAYER_PLAN.md`). | **Slice 1–3 delivered**; optional **sidebar** badge deferred to later roadmap if still needed. |
| **2.1b — Field velocity** | Autosave / batch save design; further keyboard flow; optional compact density toggle. | **Partial overlap:** Phase 2.0 delivered sticky toolbar, Apply hint, scroll headers — primary work remains **save-model** + backend contract. |
| **2.2 — Reviewer deep links** | Dashboard queue → **session detail** when API exposes session ids; optional audit log query links; reviewer PDF/read-only pack policy. | **Reviewer-grade** throughput. |
| **2.3 — Command center** | Badges on nav; “my approvals” inventory slice; morning brief card using existing health API. | **Operational visibility** without new modules. |
| **2.4 — Visual identity** | Replace placeholder marks; align cards/tables with design system tokens used elsewhere. | **Enterprise visual consistency**. |

Each wave should ship with **small verification** (UX checklist + smoke where applicable); **no** backend architecture aggression unless a gap is explicitly approved.

---

## 12. Final goal alignment

DX OSE can evolve toward a **hotel-focused enterprise operational governance platform** by:

- Preserving **trusted operational truth** from Phase 1 (posting, audit, reporting semantics).  
- Layering **operational clarity** (queues, deep links, role-first entry).  
- Strengthening **accountability** (timeline, approver identity, export discipline).  
- Maturing **reviewer-grade** surfaces (variance shell, disclaimers, consistent naming).  
- Growing **command visibility** from the **dashboard and nav** outward — without fragmenting into a generic ERP.

---

## 13. Phase 2.0 hygiene & Phase 2.1 command layer — implemented & roadmap

**Phase 2.0 plan:** `PHASE2_UX_HYGIENE_PLAN.md`  
**Phase 2.1 plan:** `PHASE2_COMMAND_LAYER_PLAN.md`  
**Screenshot checklists:** `docs/governance/assets/phase2.0-slice1/SCREENSHOTS.md`, `docs/governance/assets/phase2.0-slice2/SCREENSHOTS.md`, `docs/governance/assets/phase2.0-slice3/SCREENSHOTS.md`, `docs/governance/assets/phase2.1-slice1/SCREENSHOTS.md`, `docs/governance/assets/phase2.1-slice2/SCREENSHOTS.md`, `docs/governance/assets/phase2.1-slice3/SCREENSHOTS.md`, `docs/governance/assets/phase2-ux-stabilization/SCREENSHOTS.md`

### Implemented (slice 1)

- Variance report **title/subtitle** (Inventory Count wording + i18n); report shell **tenant** line uses **`NAV.INVENTORY_COUNT`**.  
- **Workflow history** vs global **Audit Log** — naming + **Approval & posting trail** copy for reviewers.  
- Register **multi-session** strip: **no misleading highlight** + **operational hint** when several sessions are active.  
- Detail **POSTED**: strip highlights **workflow history** (not “Approve & post”).  
- **Blind mode** guidance: **title + description** (EN/AR).  
- **Removed** disabled “Canonical workflow”; **replaced** “IC” with **Lucide book** icon.  
- **Light density** pass (spacing / padding on register + detail).

### Implemented (slice 2)

- Register **quick filters** (All / Counting / Recounting / Variance review / Pending approval) + **URL `status` sync**.  
- Register **row priority** visual bands (approval / review / floor work).  
- **Primary “Open”** for approvers on **Pending approval** rows (`canApprove()` aligned with detail).  
- Detail **sticky count toolbar**; count sheet + variance **`nzScroll`** with pinned headers; **pagination bar** emphasis; **Apply** tooltip (i18n).  
- Variance table **slightly larger** numeric body text.

### Implemented (slice 3)

- **Query continuity:** opening a session (**Open**, **Create**, **Start**) carries current register **`status`** + **`departmentId`** query params; **Back to register** and breadcrumb link restore the **same filtered queue**.  
- **Session overview** region: eyebrow + workflow strip + summary cards grouped for **scan hierarchy**.  
- **Breadcrumbs:** linked **Inventory** parent; linked **Inventory Count** register when returning from detail.  
- **i18n:** `INVENTORY_COUNT_STATUS`, `INVENTORY_COUNT_PAGE`, `INVENTORY_COUNT_DETAIL` — register + detail operational copy, timeline **badge translations**, variance KPI labels, confirmations/toasts on main paths (EN + AR).

### Implemented (Phase 2.1 — slice 1, command layer)

- Dashboard **Operational queue**: **reviewer-first** sort for `workflowHealth` (pending approval → rejected → variance review → …); **`queueRank`** tie-break so inventory **approval/review** competes fairly with other **critical** rows.  
- **Elevated priority** for **`REVEAL_REVIEW`** to **critical** (with **pending approval** / **rejected**) so reviewer-blocking stages surface earlier.  
- **Honest attention column** — replaces misleading day-range text with **respond / review / monitor** hints (`DASHBOARD.QUEUE_ATTENTION_*`).  
- **i18n** for queue **title**, **headers**, **footer link**, **notes**, **urgency** labels; inventory stage labels reuse **`INVENTORY_COUNT_STATUS`** when present.  
- Subtle **`workflow-*` row accent** (left border) for inventory count rows in the queue table.

### Implemented (Phase 2.1 — slice 2, command layer)

- Dashboard **inventory count** operational targets append **`queueFocus=1`** (workflow status rows + variance **`REVEAL_REVIEW`** links) — explicit **command-queue origin** without implying analytics.  
- Register: **dismissible info alert** (`INVENTORY_COUNT_UI.QUEUE_FOCUS_*`) + **Open first session in list**; **one-time smooth scroll** to the session table anchor on landing.  
- **Filter continuity:** manual status/department changes **sync to URL** and **clear `queueFocus`**; quick filters clear `queueFocus`.  
- **Session detail → register:** `registerListQueryParams()` preserves **`queueFocus`** when returning via breadcrumb / back link.  
- **Open / Create / Start** navigation continues to merge **`queueFocus`** when the cue is active.

### Implemented (Phase 2.1 — slice 3, command layer)

- **Register attention strip** inside the **Session register** card (above the table): **count-only** pills for **pending approval**, **variance review**, **rejected**, **recounting**, **counting**, and **draft** — derived from the **current filtered** session list.  
- Chips **apply the corresponding `status` filter** (same contract as quick filters / URL query) for fast reviewer navigation.  
- **Queue-linked** non-interactive token when **`queueFocus`** is active — reinforces operational flow memory **without** replacing the slice‑2 dismissible alert.  
- Strip **omits** when there are **no attention-stage sessions** and **no** queue link — avoids noise when the view is e.g. posted-only.

### Next-wave priorities (remaining friction)

| Priority | Item |
|----------|------|
| **P1** | **Autosave / batch save** design for count lines (**field velocity** — backend contract sensitive). |
| **P2** | **Dashboard → session detail** deep link when API exposes session ids on queue rows. |
| **P2** | **Optional sidebar** inventory-count badge (only if register + dashboard attention still leave a gap — no notification system). |
| **P2** | **Morning-brief** style counts on dashboard (**2.3**), scoped to existing APIs. |
| **P2** | Reviewer **materiality / date** cues (copy-only). |
| **P2** | **Department-default** filter from role (safe server or client rule); optional admin label for `STOCK_COUNT_VIEW`. |
| **P2** | Residual **non–inventory-count** English in adjacent dashboard panels; optional **copy audit** pass. |
| **P3** | **Mobile** layout pass; **pinned / recent sessions** strip. |

---

## 14. Related documents

| Document | Role |
|----------|------|
| `PHASE1_STABILIZATION_CLOSURE.md` | Stabilization lock — do not regress |
| `PHASE_ROADMAP.md` | Phase 2 product chapter context |
| `PHASE2_UX_HYGIENE_PLAN.md` | Phase 2.0 hygiene — slices 1–3 + roadmap (`§3`, `§10`, `§11`) |
| `REPORT_TRUTH_CATALOG.md` / count truth docs | Semantic guardrails for copy and numbers |
| `PHASE2_COMMAND_LAYER_REVIEW.md` | Phase 2.1 command-layer — attention & reviewer workspace (review) |
| `PHASE2_COMMAND_LAYER_PLAN.md` | Phase 2.1 slice roadmap + delivered slice records (1–3) |
| `PHASE2_UX_STABILIZATION_REVIEW.md` | Post–2.1 coherence / trust / pilot gate — walkthroughs, risks, rollback philosophy |
| `PILOT_OPERATIONAL_FEEDBACK.md` | **Living log** — pilot walkthroughs, friction, reviewer/operator feedback, command-layer observation, adoption notes |
| `AUDIT_EVENT_CATALOG.md` | Audit language consistency for future “open audit log” links |

---

## 15. Code anchors (for engineering handoff)

| Area | Path |
|------|------|
| Routes | `OSE-Frontend/src/app/app.routes.ts` (`inventory-count`, `stock-report` redirect) |
| Register UI | `OSE-Frontend/src/app/features/inventory-count/inventory-count-page/` |
| Session detail | `OSE-Frontend/src/app/features/inventory-count/inventory-count-detail/` |
| API client | `OSE-Frontend/src/app/features/inventory-count/services/inventory-count.service.ts` |
| Sidebar | `OSE-Frontend/src/app/core/services/navigation.service.ts` (Inventory Count section) |
| Dashboard queues | `OSE-Frontend/src/app/features/dashboard/dashboard.component.ts` / `.html` / `.scss` (`branchOperationalQueueRows`, `sortedWorkflowHealthForCommandLayer`, `inventoryWorkflowQueueRank`, `inventoryCountStatusTarget`) |

---

## 16. Command-layer evolution (Phase 2.1) — maturity snapshot

Phase **2.1** completes a **bounded** command layer on top of Phase **2.0** context preservation:

- **Slice 1 — Dashboard:** reviewer-first **operational queue** ordering, **honest attention** language, inventory workflow row cue, shared **Inventory Count** i18n for stages.  
- **Slice 2 — Flow memory:** **`queueFocus`** from dashboard into the register, dismissible orientation, **scroll-to-table**, **open first row**, and **detail → register** continuity.  
- **Slice 3 — Workflow-native attention:** **Register attention strip** (payload-derived counts + filter chips + queue-origin token) **inside** the session workspace — not a notification system.

**Maturity assessment:** appropriate for **stabilization and pilot** (see `PHASE2_UX_STABILIZATION_REVIEW.md`). Further command-center ideas (**sidebar badge**, **morning brief**, **session deep links**) should ship **one lever at a time** after pilot readout to avoid **attention fatigue**.

---

## 17. Phase 2 UX stabilization (findings & next-phase readiness)

**Canonical document:** `PHASE2_UX_STABILIZATION_REVIEW.md`  
**Integrated regression screenshots:** `docs/governance/assets/phase2-ux-stabilization/SCREENSHOTS.md`

### Stabilization findings (summary)

- **Coherence:** Dashboard queue semantics, register filters, attention strip, and detail workflow language **align**; multi-session ambiguity is **disclosed** rather than hidden.  
- **Trust:** Attention signals stay **honest** (no fabricated SLA/aging on the queue; register chips are **counts of visible sessions**).  
- **Reviewer clarity:** Approver and variance paths are **shorter** than pre–Phase 2 baseline but **session-level deep links** remain the largest remaining “hunt” gap.  
- **Overload risk:** Current command density is **acceptable**; risk is **future bundling** of multiple new attention surfaces without consolidation.

### Command-layer maturity

| Criterion | State |
|-----------|--------|
| **Attention routing** | Mature for pilot — dashboard + register cooperate |
| **Operational honesty** | Mature — qualitative / count-backed only |
| **Navigation continuity** | Mature — query params + `queueFocus` return paths |
| **Field velocity / mobile** | **Not** mature — explicit next-wave engineering |

### Next-phase readiness

**Current mode:** **Pilot execution & observation** — populate `PILOT_OPERATIONAL_FEEDBACK.md` and maintain regression screenshot packs before scoping new build waves.

**Proceed to engineering prioritization** (e.g. **P1 field velocity** or a **single P2** command enhancement) **only after** pilot §10 summary in `PILOT_OPERATIONAL_FEEDBACK.md` is completed or **formally waived** with recorded rationale.

**Defer:** stacking **multiple** new command widgets (badge + brief + strip variants) in one release without UX gate.

---

## 18. Pilot execution & operational observation mode

**Stabilization review:** accepted. DX OSE is **pilot-ready** for controlled operational evaluation in real hotel contexts.

**Primary objective:** validate **real operational behavior**, **reviewer comfort**, **workflow clarity**, **operational usefulness**, and **command-layer sanity** — not to expand UX surface area during the pilot window.

**Do first**

1. Pilot walkthroughs (see `PHASE2_UX_STABILIZATION_REVIEW.md` §11).  
2. Reviewer and operator observation (hunting, approval comfort, count-session usability).  
3. Operational friction capture in **`PILOT_OPERATIONAL_FEEDBACK.md`**.  
4. Screenshot / regression packs per `docs/governance/assets/phase2-ux-stabilization/SCREENSHOTS.md` and slice checklists.  
5. Real workflow validation (multi-session, shift handoff, bilingual where applicable).

**Do not (during pilot observation)**

- Executive dashboards, AI, analytics overload.  
- Redesign of stabilized workflows or **stacking** new command widgets.  
- Feature churn without measured observation.

**After pilot:** triage **`PILOT_OPERATIONAL_FEEDBACK.md`** §10 summary; then consider **P1 field velocity** (autosave / batch / handheld ergonomics) **or** a **single** P2 command enhancement — **only** if pilot priorities confirm it.

---

## 19. Reporting workspace evolution (2026-05-14)

The **`/reports`** area is no longer a single flat picker of engine shortcuts. It is structured as a **multi-domain reporting workspace** (tabs: inventory control, inventory count, operational workflows, audit & governance, reviewer workspace, reviewer packs) with **subgroups** and **compact cards**. Live entries deep-link to existing report routes or operational modules; roadmap entries are explicitly labeled **Roadmap** (no backend/reporting engine expansion in that slice).

**Operational clarity:** under **Operational workflows**, **Breakage**, **Lost**, and **Get pass & returns** are **separate subgroups** so accountability, reviewer flow, and audit narratives are not collapsed into one generic “loss” bucket.

**Future-ready UX:** search is active; **Favorites** and **Recently used** appear as **disabled** controls with tooltips until persistence is specified.

**Documentation:** `REPORTING_WORKSPACE_ARCHITECTURE.md`, `REPORTING_WORKSPACE_ROADMAP.md`, and additional screenshot rows in `docs/governance/assets/phase2-ux-stabilization/SCREENSHOTS.md`.
