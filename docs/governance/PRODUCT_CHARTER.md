# DX OSE — Product Charter

| Field | Value |
|--------|--------|
| **Version** | 1.0 |
| **Created Date** | 2026-05-14 |
| **Product Owner** | DX OSE Product Leadership *(assign named owner)* |
| **Purpose** | Establish the official product vision, positioning, and non‑negotiable principles for DX OSE before any further feature expansion. |
| **Scope** | Product direction, identity, and boundaries for **hotels**, **OS&E**, **inventory governance**, **audit workflows**, and **operational accountability**. Excludes ERP expansion (HR, payroll, POS, full accounting ERP, CRM) unless a separate product decision explicitly approves a narrow integration. |

---

## 1. Product vision

**DX OSE** is a **Hotel Operational Governance Platform** that turns OS&E inventory operations into **governed, evidenced, traceable, and reviewable** outcomes—so hotels can run stores and outlets with **accountability**, **audit defensibility**, and **operational closure**, not spreadsheet chaos.

---

## 2. Positioning

| We are | We are not |
|--------|------------|
| A focused **operational governance** layer for hotel OS&E inventory | A generic **ERP** or full finance suite |
| A **workflow + evidence + posting** system for controlled movements | A “store app” that only lists SKUs and quantities |
| A **multi‑tenant SaaS** foundation for hotel groups and properties | A POS, payroll, HR, or CRM replacement |

**One-line positioning (external):**  
*Governed OS&E inventory operations for hotels—approvals, evidence, stock truth, and audit-ready outputs.*

---

## 3. Product identity

- **Category:** Hotel OS&E — **operational governance** & inventory control.  
- **Personality:** Serious, procedural, **reviewer-grade**, hotel-native.  
- **Promise:** Every material movement is **tracked**, **approved where required**, **evidenced where required**, **accountable**, and **reviewable**.

*(Arabic operational note: الهدف “حوكمة تشغيلية” للمخزون والأعمار الافتراضية للمساءلة داخل الفندق—not “برنامج مخزن بسيط”.)*

---

## 4. Strategic direction

1. **Governance first** — unify document lifecycle semantics, posting rules, and reporting truth *before* widening feature surface.  
2. **Accountability by design** — approvals, audit trails, and evidence are part of the **default path**, not optional add-ons.  
3. **Operational closure** — workflows must end in clear states (posted, closed, rejected, voided) with **traceable** outcomes.  
4. **Adoption through field speed** — mobile and low-friction flows are a **phase**, but never at the expense of posting integrity.  
5. **Intelligence as a layer** — signals, SLAs, and anomalies on top of **real workflow events**, not cosmetic “AI.”

---

## 5. Core principles

1. **Trust in numbers** — definitions are explicit; exports match on-screen filters.  
2. **Single philosophy, many documents** — same lifecycle *concepts*; differences are **policy**, not one-off hacks.  
3. **Posting integrity** — stock and ledger changes occur only at **defined** transitions; double-posting is prevented.  
4. **Reviewer-grade outputs** — reports and exports suitable for **finance / audit / dispute** contexts.  
5. **No feature chaos** — if it does not increase trust, accountability, closure speed, or reduce Excel/WhatsApp reliance, it is **de-prioritized**.  
6. **Hotel-native** — language, workflows, and artifacts reflect **hotel operations** (stores, outlets, HOD, finance, security), not abstract retail.

---

## 6. Target market

- **Primary:** Hotels and hotel groups managing **OS&E** inventory across **main stores**, **outlets**, and **departmental** consumption.  
- **Buyers / champions:** Director of Finance, Financial Controller, Head of Operations, Chief Engineer / HODs, Storekeeper leads, Internal Audit.  
- **Geography / scale:** Multi-property SaaS tenants; enterprise readiness is a **direction**, phased in the roadmap.

---

## 7. What we are / what we are not

### What we are

- **Inventory governance** platform (policies, approvals, period discipline).  
- **Audit-grade operational workflows** (especially count → variance → posting → evidence).  
- **Operational traceability** (who did what, when, on which document).  
- **Ledger-aligned** inventory truth (posting services, transfer gate, count posting).  
- **Enterprise operational UX** direction (command center, queues, risk-first)—*phased*.

### What we are not

- **ERP sprawl** (no mandate to own HR, payroll, POS, CRM, or full GL).  
- **Feature factory** without semantic contracts.  
- **Spreadsheet replacement** without governance (Excel export is a **deliverable**, not the source of truth).

---

## 8. Operational philosophy

Operations are modeled as **documents** and **events**: create → validate → approve (as needed) → execute → post/close → evidence pack. The UI and API should reflect **closure** and **next responsible party**, not endless lists.

---

## 9. Accountability philosophy

**Accountability = role + action + time + artifact.**  
Every sensitive transition should answer: *Who approved? Who posted? Who received? What evidence exists? What changed in stock/ledger?*

---

## 10. Reviewer-grade philosophy

A **reviewer** (finance, audit, GM) must be able to answer:

- **What period and scope** does this output cover?  
- **What definition of “truth”** is used (e.g. ledger after post, as-of snapshot)?  
- **Which documents** produced the numbers?  
- **Can I reproduce** the figures from the same filters in Excel/PDF?

---

## 11. Hotel-native philosophy

Workflows, statuses, and evidence reflect **how hotels actually lose control**: breakage, transfers, gate passes, departmental issues, blind counts, period close—not generic retail patterns.

---

## 12. Strategic killer operational module (explicit)

The following is **not** a “stock count screen” feature—it is the **strategic killer operational module** for DX OSE:

> **Inventory Count + Variance + Posting + Evidence + Audit Trail**

Together, this module directly addresses **loss**, **inventory trust**, **accountability**, **operational disputes**, and **audit requirements**. Product and engineering prioritization should treat it as a **platform anchor**, not a peripheral module.

---

## 13. Document control

- This charter is **Version 1.0**. Updates require version bump and change note.  
- Conflicts between this charter and ad-hoc specs: **this charter wins** until formally amended.
