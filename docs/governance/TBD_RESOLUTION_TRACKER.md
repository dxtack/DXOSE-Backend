# DX OSE — TBD / Needs Review Resolution Tracker

| Field | Value |
|--------|--------|
| **Version** | 1.0 |
| **Created Date** | 2026-05-14 |
| **Product Owner** | DX OSE Product Leadership *(assign named owner)* |
| **Purpose** | Enforce **ownership and dates** for every **`TBD` / `Needs Review`** item originating from `WORKFLOW_MATRIX.md` so Phase 1 exit gates cannot pass silently. |
| **Scope** | Matrix-derived items only at v1.0; add new rows when matrix gains new TBDs. |

**Rule:** When resolved, update **this file** and **`WORKFLOW_MATRIX.md`** in the same change (implementation phase—tracked here as intent only).

---

## Tracker columns

| Column | Description |
|--------|-------------|
| **ID** | Stable id (`TBD-00x`). |
| **Blocking severity** | **P0** = blocks trust in posting/audit; **P1** = blocks enterprise sales narrative; **P2** = documentation/UX clarity. |
| **Target date** | Resolution target for **definition** (docs + signed behavior), not necessarily code. |

---

## Active items

| ID | Workflow | Matrix reference | Missing definition | Operational risk | Required clarification | Owner *(assign)* | Target date | Blocking severity |
|----|----------|------------------|--------------------|------------------|-------------------------|------------------|-------------|---------------------|
| **TBD-001** | Breakage (`MovementDocument` BREAKAGE) | §3 Posting trigger “Needs Review”; closure says APPROVED/VOID/REJECTED | Exact **posting moment**; whether **stock vs ledger-only** for any line type; terminal state vs `POSTED` enum usage | Wrong training; SoD gaps; audit finds movement without expected stock | Engineering walkthrough `breakage.service.js` + ledger lines; product signs **customer-facing** explanation | Backend Lead + Product Owner | 2026-05-28 | **P0** |
| **TBD-002** | Lost items (`MovementDocument` LOST) | §4 Posting trigger, evidence, closure **TBD** | Parity with breakage for post timing, attachments, terminal statuses | Inconsistent accountability; legal/finance challenge on lost stock | Same as breakage; document **intentional diffs** if any | Backend Lead + Product Owner | 2026-05-28 | **P0** |
| **TBD-003** | Get pass | §5 Posting trigger **Needs Review** | **State × ledger event** map (each transition) | Silent stock drift; wrong intelligence alerts; cross-hotel disputes | Workshop: `getPass.service.js` + `posting.service.js`; output **decision table** attached to matrix | Get Pass domain owner + Backend Lead | 2026-06-11 | **P0** |
| **TBD-004** | Period close | §11 Posting trigger **TBD** | How `periodGuard.service.js` blocks or allows posting; exact `status` string values in use | Posting into closed period; contradictory valuation snapshot selection | Read all consumers of period guard; document allowed `status` strings; align with `EXCEPTION_REGISTER` EX-003 | Backend Lead | 2026-05-21 | **P0** |
| **TBD-005** | Inventory count (canonical) | §8 Closure: “cancel semantics — confirm in service” | Whether cancel voids lines, reverses draft, audit trail | Stuck sessions; disputed count data | Confirm `inventoryCount.service.js` cancel paths; update matrix + glossary | Backend Lead + Product Owner | 2026-05-21 | **P1** |
| **TBD-006** | Saved stock report (legacy) | §14 Matrix **TBD / Needs Review**; routes “retired” | Active customer path; lifecycle vs `ApprovalRequestType.STOCK_REPORT` | Dead UI; orphan approvals; wrong compliance story | Product lists **supported** customers/tenants; engineering lists **active** routes; deprecation notice | Product Owner + Engineering Lead | 2026-06-04 | **P1** |
| **TBD-007** | Cross-cutting | Matrix “How to read” + §12 Lost & Found | **Frontend-only** workflow nuances (if any) affecting posting interpretation | Field staff use UI path not reflected in matrix | Frontend audit of count/transfer/issue screens vs matrix | Frontend Lead | 2026-06-04 | **P2** |
| **TBD-008** | Report catalog | `REPORT_TRUTH_CATALOG.md` — Asset verification | Canonical report names and APIs | **EX-011** — fragmented “verification” features | Product naming workshop; add catalog rows | Product Owner | 2026-06-11 | **P1** |

---

## Resolved items

| ID | Resolved date | Resolution summary | Updated matrix section |
|----|---------------|--------------------|-------------------------|
| — | — | *None yet* | — |

---

## Process

1. **Weekly** review until all **P0** rows are closed.  
2. Closing a row requires **matrix update** or **explicit waiver** recorded in `EXCEPTION_REGISTER.md` with expiry.  
3. PR template should cite **TBD-ID** when touching related code (implementation phase).

---

## Version history

| Version | Date | Notes |
|---------|------|------|
| 1.0 | 2026-05-14 | Initial tracker seeded from `WORKFLOW_MATRIX.md` v1.0 |
