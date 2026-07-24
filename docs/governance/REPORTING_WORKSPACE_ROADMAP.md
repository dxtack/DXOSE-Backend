# Reporting workspace roadmap — DX OSE

| Field | Value |
|--------|--------|
| **Status** | Planning companion to implemented workspace shell |
| **Date** | 2026-05-14 |

---

## 1. What shipped in the first slice

- Tabbed **reporting workspace** at `/reports` with six domains.  
- Full **catalog** of report names (live vs roadmap) including operational **Breakage / Lost / Get pass & returns** separation.  
- **Search** (client-side).  
- **Favorites** and **Recently used** — UI only (disabled + tooltips).  
- **Child routes** unchanged; **Back to reporting workspace** from any `/reports/...` screen.

---

## 2. Future reports (high-level backlog)

Prioritize by **operational pain** and **reviewer frequency** (not by chart count):

| Priority | Area | Examples |
|----------|------|----------|
| **P0** | Inventory health | Negative stock, critical levels, zero movement (property risk). |
| **P0** | Returns | Overdue returns, returned vs outstanding (gate / security SLA). |
| **P1** | Count analytics | Dedicated variance exports (by location/department/category/counter), accuracy %, timeline. |
| **P1** | Transfers | Transfer aging/delays, inter-location movement rollups. |
| **P2** | Audit packs | Evidence completeness, reconstruction, governance exceptions as **exportable** packs. |
| **P2** | Reviewer workspace | Real queues + SLA metrics backed by APIs (not placeholders). |
| **P3** | Packs | One-click **Month-end inventory pack**, **Variance investigation pack**, etc. |

Each item should reuse the **same domain/subgroup** slots where possible so the workspace UI stays stable.

---

## 3. Rollout priorities

1. **Stabilize navigation** — Users learn domain tabs; no new widgets on `/reports`.  
2. **Wire P0 reports** to existing or minimal APIs — Prefer extending the **report engine** over one-off pages.  
3. **Favorites / recents** — Local storage or user profile API; respect permissions per card.  
4. **Pack generation** — PDF/ZIP bundling from approved sessions + logs (policy + backend).  

---

## 4. Value summary

- **Operational value** — Faster path from “what domain am I in?” to the right export or module; less hunting in unrelated workflows.  
- **Reviewer value** — Clear **attention** and **pack** layers; separation of breakage vs lost vs returns reduces misclassification in reviews.  
- **Governance value** — Audit and compliance reports grouped for **traceability** narratives without mixing them into inventory movement tabs.

---

## 5. Dependencies

- No **new** dependencies for the first slice.  
- Future report rows require **report definitions** in backend/services and optional **permission keys** per card.

---

## 6. Related documents

- `REPORTING_WORKSPACE_ARCHITECTURE.md` — structure, rationale, affected files, rollback.  
- `docs/governance/PHASE2_ENTERPRISE_UX_REVIEW.md` — Phase 2 UX context.  
- `docs/governance/REPORT_TRUTH_CATALOG.md` — keep aligned as new reports go live.
