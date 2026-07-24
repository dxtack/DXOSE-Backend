# DX OSE — Phase Roadmap (Governance)

| Field | Value |
|--------|--------|
| **Version** | 1.0 |
| **Created Date** | 2026-05-14 |
| **Product Owner** | DX OSE Product Leadership *(assign named owner)* |
| **Purpose** | Sequence delivery to avoid **feature chaos** and align engineering with **Hotel Operational Governance Platform** outcomes. |
| **Scope** | Phases 1–4 (+ intelligence maturity) for DX OSE core; excludes ERP modules unless charter is amended. |

---

## Phase overview

| Phase | Name | Primary outcome |
|-------|------|-----------------|
| **1** | Foundation stabilization | One philosophy across workflows; posting & reporting semantics trustworthy |
| **2** | Enterprise operational UX | Command center + queues + accountability visibility |
| **3** | Field operations | Adoption: faster than WhatsApp/paper for core paths |
| **4** | Operational intelligence | Signals, SLAs, anomalies on real workflow data |
| **5** *(see contracts)* | Reviewer-grade reporting & identity | Traceable exports, reconciliation posture |

*Phase 5 is referenced in the product charter direction; execution may overlap Phase 2–4 but **must not** skip Phase 1 gates.*

---

## Phase 1 — Foundation stabilization

### Objectives

- **Workflow consistency** — document lifecycle language and transitions align to Contract 1.  
- **Posting integrity** — no accidental double-post; transitions that post are explicit and tested.  
- **Audit truth** — single narrative; plan consolidation of duplicate audit helpers (**no new third pattern**).  
- **Report semantics** — glossary + “truth source” per report family; exports match filters.  
- **Document lifecycle unification** — product patterns for workspace/timeline (even if UI incrementally catches up).  
- **Period close integrity** — period discipline respected by posting paths.  
- **Reduce special-case logic** — stop growth of bespoke branches; document exceptions with expiry.

### Non-goals

- New customer-facing modules (e.g. POS, HR).  
- Large net-new analytics.  
- Cosmetic-only redesigns without semantic improvement.

### Gates (must pass to exit Phase 1)

1. **Glossary published** — posting, received, closed period, variance, approved (owned terms).  
2. **WORKFLOW_MATRIX** accurate for all **in-scope** document types OR explicitly `TBD` with owner + date.  
3. **Smoke discipline** — critical paths (count post, transfer receive, GRN post, period lock interaction) have repeatable checks.  
4. **No new isolated lifecycle implementations** without ADR-style justification.

### Closure record (stabilized workflow scope)

- **`PHASE1_STABILIZATION_CLOSURE.md`** — authoritative checkpoint: domains, governance layers, residual risks, smoke/rollback philosophy, CI wiring.  
- **CI:** `.github/workflows/governance-smokes.yml` → `OSE-backend` `npm run smoke:governance-static`.  
- **Incremental hardening:** `GOVERNANCE_INCREMENTAL_HARDENING.md`.

### Success criteria

- Stakeholders can explain **when stock/ledger changes** for top workflows without contradictions.  
- Audit story is **credible** to a finance reviewer at “minimum viable defensibility.”  
- Feature PRs cite **which contract** they satisfy.

### Feature restrictions

- **No** horizontal feature expansion.  
- **No** new workflows unless matrix + glossary updated first.

### Operational priorities

Posting correctness, period discipline, transfer gate, count posting.

### Adoption priorities

Secondary in Phase 1 (except fixes that block adoption of Phase 1 flows).

### Intelligence maturity

**v0 only if cheap:** stuck approvals list / aging lists may exist if built on existing data—**no new complex pipelines**.

---

## Phase 2 — Enterprise operational UX

**Baseline UX review (Inventory Count first slice):** `PHASE2_ENTERPRISE_UX_REVIEW.md`.

### Objectives

- **Command center** home (risk/stuck first).  
- **Queues** (approvals, returns, in-transit, count pending approval).  
- **Accountability timelines** on document pages (consistent component story).  
- **Operational alerts** that route to queues (not only toasts).

### Non-goals

- Full mobile parity.  
- Full BI warehouse.

### Gates

- Phase 1 **exit gates** complete.  
- Dashboard IA approved (information order: risk → throughput → trends).

### Success criteria

- A GM/controller can answer “what is broken **today**?” in **one** screen.

### Feature restrictions

- New screens must map to **queue** or **document workspace** patterns.

### Adoption priorities

Power users (controllers, store leads) first.

### Intelligence maturity

**v0–v0.5** — operational lists (stuck, aging) integrated into navigation.

---

## Phase 3 — Field operations

### Objectives

- **Ultra-fast** count entry and receive/confirm paths.  
- **Scanning-first** UX on high-volume lines.  
- **Quick approvals** where policy allows (mobile).  
- **Low friction** — minimum fields to close.

### Non-goals

- Full offline-first ERP replacement.

### Gates

- Phase 2 **minimum** queue stability (no blocking UX regressions on desktop).

### Success criteria

- Measurable **time-to-close** improvement on count & receive paths vs baseline.

### Feature restrictions

- Mobile features must not **bypass** posting/approval rules.

### Adoption priorities

Storekeepers & outlet staff.

### Intelligence maturity

Lightweight field metrics (errors, scan success) — optional.

---

## Phase 4 — Operational intelligence

### Objectives

- **SLA tracking** for approvals.  
- **Aging** and bottleneck detection.  
- **Unusual variances** / repeat offenders (outlet/department/item).  
- **Anomaly detection** (rules first).

### Non-goals

- “AI for AI” demos without operational actions.

### Gates

- Event data clean enough (states/timestamps consistent post Phase 1).

### Success criteria

- Every alert has a **destination workflow** (document created or queue opened).

### Feature restrictions

- Each signal ships with **default threshold** + **owner role**.

### Adoption priorities

Finance + operations leadership.

### Intelligence maturity

**v1–v2** per Contract 7.

---

## Phase 5 — Reviewer-grade reporting & identity (cross-cutting)

### Objectives

- **Reconciliation packs** posture (scope + definitions + traceable rows).  
- **Executive operational reporting** (exceptions & losses narrative).  
- **Unified report identity** (already a direction in the product UI).

### Gates

- Reporting truth glossary complete (Phase 1 dependency).

### Feature restrictions

- No new report type without truth source + export parity statement.

---

## Global rules (all phases)

- **ERP / HR / Payroll / POS / CRM** — out of scope unless charter amended with **product-wise** rationale.  
- **No feature chaos** — strategic gate applies always.  
- **Documentation updates** are part of “done” for workflow changes.

---

## Distraction list (default “no”)

- Net-new modules unrelated to OS&E governance.  
- Deep ERP accounting integrations without a narrow, signed scope.  
- Experimental AI without operational action routing.
