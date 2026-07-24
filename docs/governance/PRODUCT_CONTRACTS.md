# DX OSE — Product Contracts (Governance)

| Field | Value |
|--------|--------|
| **Version** | 1.0 |
| **Created Date** | 2026-05-14 |
| **Product Owner** | DX OSE Product Leadership *(assign named owner)* |
| **Purpose** | Bind product, UX, reporting, audit, and engineering behavior to a **single set of contracts** so new work cannot ship as isolated implementations. |
| **Scope** | All hotel OS&E operational workflows, reporting, dashboards, mobile ops, intelligence, and PR/feature governance **inside DX OSE**. Does not mandate immediate code refactors; it mandates **compliance for new work** and defines **north-star consolidation** for legacy variance. |

---

## Contract 0 — Strategic gate (meta)

Any **feature**, **workflow change**, or **report** must answer **yes** to at least one:

- Increases **trust in numbers**  
- Increases **accountability**  
- Reduces **operational disputes**  
- Reduces **audit pain**  
- Increases **operational closure speed**  
- Reduces reliance on **Excel / WhatsApp / informal channels**

If **none** → treat as **distraction** by default (defer or reject).

---

## Contract 1 — Canonical workflow architecture

### 1.1 Canonical document model (conceptual)

Every governed operational artifact maps to:

`Document → State → Transition → Actor → Evidence (optional/required) → PostingImpact (when applicable)`

- **Document:** stable identity (number, tenant, type).  
- **State:** from an explicit enum / finite set (no “stringly-typed” lifecycle in new work).  
- **Transition:** named action (submit, approve, reject, post, dispatch, receive, close, void).  
- **Actor:** authenticated user + role context.  
- **PostingImpact:** changes to `stock_balances` / `inventory_ledger` **only** at transitions explicitly defined for that document type.

### 1.2 Canonical workflow rules

1. **No silent posting** — inventory/ledger effects must be tied to a named transition.  
2. **Immutability after closure** — once `POSTED`, `RECEIVED`, `CLOSED`, `VOID` (per document rules), mutations follow **strict** service rules (HTTP 423 / domain errors as today).  
3. **One approval philosophy** — multi-step chains use the same mental model: **current step**, **required role**, **outcome** (approve/reject), **audit**.  
4. **Reduce special cases** — new code should **extend shared patterns**; repeated bespoke logic requires a **governance exception** note.

### 1.3 Known technical debt (non-blocking for v1.0 docs)

The codebase today includes **more than one audit helper pattern** (e.g. `audit.service` vs `auditTrail.service`). **New work** must not add a third pattern; consolidation is a **Phase 1 foundation** objective.

---

## Contract 2 — Unified operational UX philosophy

### 2.1 Layers

1. **Attention layer** — what needs action *now* (queues, risks, SLAs).  
2. **Work layer** — single **document workspace** (summary, timeline, approvals, evidence, impact).  
3. **Reference layer** — tables, history, drill-downs.

### 2.2 Rules

- Prefer **queue-based entry** over hunting inside CRUD lists for operational users.  
- **Same verbs, same meanings** across modules (Submit / Approve / Reject / Post / Close / Void). If semantics differ, **rename** the verb in UI.  
- **Risk-first** presentation for leadership views (exceptions before vanity charts).

*(Arabic note: “شاشة المخزن” ليست المنتج—مساحة الوثيقة + الطابور هي المنتج.)*

---

## Contract 3 — Reporting truth (reporting philosophy)

### 3.1 Reporting truth rules

1. Every report declares **scope** (tenant, locations, departments, categories, date basis).  
2. Every report declares **truth source** (e.g. ledger after post, received transfers only, as-of snapshot).  
3. **On-screen filters = export filters** for the same report definition (Excel/PDF).  
4. **No UI chrome** in print/export paths (global print CSS is a product requirement).  
5. Numbers must be **defensible**: row-level linkage to **document numbers** and/or **ledger references** is the long-term bar for “reviewer-grade.”

### 3.2 Semantic consistency rules

- Glossary terms (`Posting`, `Closed period`, `Variance`, `Received`, `Approved`) are **owned by Product**; engineering must not invent synonyms in customer-facing strings.

---

## Contract 4 — Audit strategy

### 4.1 Audit product promise

Audit answers: **what changed, who changed it, when, on which entity, from what to what (as policy allows).**

### 4.2 Audit strategy rules

1. **Canonical narrative** — one product story for “what happened” even if storage paths evolve.  
2. **Capture policy** — define when `beforeValue`/`afterValue` are full vs summarized (performance & privacy).  
3. **Failure policy** — classify events:  
   - **Best-effort audit** (must not break user flow) vs  
   - **Hard requirement** (posting / period close class events—*target state*; implementation may lag but new work must not move away from it).  
4. **No duplicate semantics** — new audit writes must align with the consolidation plan in Phase 1.

---

## Contract 5 — Dashboard command-center direction

### 5.1 Philosophy

The default landing experience for operational leadership is a **command center**, not a KPI wallpaper.

### 5.2 Ordering of information

1. **Stuck / SLA risk** (approvals, open returns, in-transit aging)  
2. **Operational risk** (large variances, repeat breakage patterns, policy violations)  
3. **Throughput** (documents closed today/week)  
4. **Trends** (secondary)

---

## Contract 6 — Mobile operational direction

### 6.1 Philosophy

Mobile is for **field closure speed**, not feature parity with desktop.

### 6.2 Rules

1. First-class flows: **count entry**, **receive/confirm**, **short-path approvals** (where policy allows).  
2. **Scanning-first** where it increases accuracy and speed.  
3. Success metric: **time-to-close** per document type, not screen count.  
4. **Offline-light** is optional and phased—**low friction online** comes first.

---

## Contract 7 — Operational intelligence roadmap

### 7.1 Philosophy

Intelligence = **rules + signals + work queues** on top of **real workflow events**—not “AI slides.”

### 7.2 Maturity path

- **v0:** stuck approvals, aging documents, simple thresholds  
- **v1:** variance drivers, outlet/department comparisons, SLA dashboards  
- **v2:** anomaly detection (rate/quantity baselines), heatmaps, bottleneck detection  

### 7.3 Rule

Every alert must land in a **documented operational path** (open queue, open investigation pack)—not a toast-only UX.

---

## Feature governance rules

1. **No horizontal ERP expansion** without explicit charter amendment.  
2. **No “random modules”** that do not map to OS&E operational governance.  
3. **No new workflow** without updating `WORKFLOW_MATRIX.md` (or explicit `TBD` with owner + deadline).  
4. **No customer-facing synonym drift** for core states without glossary update.

---

## PR governance rules

Every PR must state:

1. Which **contract(s)** it touches (1–7).  
2. Whether it **introduces** or **removes** special-case logic (justify if introduce).  
3. Impact on **reporting truth** / **posting** / **audit** (**none** is a valid answer).  
4. Screenshots or evidence for **user-visible** behavior changes (where applicable).

**Merge bar for Phase 1:** PRs that expand feature surface without Phase 1 alignment require **explicit waiver** from Product Owner.

---

## Anti-chaos rules (explicit)

- **No isolated implementations** — shared patterns for lifecycle, tables, filters, exports.  
- **No duplicate operational logic** — extract or plan extraction; document temporary duplication with **expiry**.  
- **No semantic drift** — if behavior changes, update glossary + matrix + release note.  
- **No silent changes to posting** — must be visible in tests/smoke notes when touched.

---

## Contract summary table

| # | Contract | One-line guarantee |
|---|----------|--------------------|
| 0 | Strategic gate | Only value-led work ships. |
| 1 | Workflow architecture | Same lifecycle concepts; explicit posting transitions. |
| 2 | Operational UX | Queues + document workspace; risk-first leadership views. |
| 3 | Reporting truth | Declared scope & truth source; exports match UI. |
| 4 | Audit strategy | One narrative; clear capture & failure policies. |
| 5 | Command center | Exceptions & stuck work first. |
| 6 | Mobile ops | Speed-to-close; scanning-first where it counts. |
| 7 | Intelligence | Signals from real workflows; alerts route to work. |
