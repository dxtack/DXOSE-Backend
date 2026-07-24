> **ARCHIVED — NOT ACTIVE GOVERNANCE.**  
> Implementation status SSOT: `OSE-backend/docs/governance/CONSTITUTION_TRACEABILITY_MATRIX.md`

# Constitution v2.0 Conformance Matrix

**Baseline audit:** Constitution Compliance Audit (pre-execution)  
**Updated:** 2026-06-25 (evidence-driven gap remediation)

Legend: **FC** Fully Compliant · **MC** Mostly Compliant · **PC** Partially Compliant · **NI** Not Implemented · **EX** BDR Exception

| Ch | Title | Pre-Audit | Current | Notes |
|----|-------|-----------|---------|-------|
| 1 | Authority & Hierarchy | MC | **MC** | SSOT is governance documentation; no runtime authority layer required (Ch.1.3) |
| 2 | Document Lifecycle | PC | **PC** | GRN + Transfer + Get Pass + Breakage `userFacingState`; BDR-007 pending |
| 3 | Workflow & Actions | PC | **PC** | GRN button order; other modules retain module-specific action layouts |
| 4 | Operation Permissions | PC | **MC** | ACC SSOT intact |
| 5 | Posting Model | MC | **MC** | Engine unchanged; posting period fields extended to Transfer/Breakage/Get Pass post paths |
| 6 | Period & Posting Date | PC | **MC** | Resolution workspace API + FE rendered; blocked-doc query multi-module |
| 7 | Draft & State Protection | NI | **PC** | GRN guard + constitution draft routes; module draft behavior varies by design |
| 8 | Concurrency | NI | **PC** | GRN + Transfer + Get Pass + Breakage protected mutations; opt-in when version omitted |
| 9 | Document Numbering | PC | **MC** | Unified engine on GRN/Breakage/Transfer/Get Pass (`DocPrefix.GET_PASS_OUT`) |
| 10 | Stock & Quantity | MC | **MC** | Unchanged |
| 11 | Display Currency | NI | **PC** | Tenant API + GRN + Transfer detail monetary fields; reports/dashboards still legacy SAR formatters |
| 12 | Document Header | PC | **PC** | Retained |
| 13 | Document Lines | PC | **PC** | Retained |
| 14 | Attachments | PC | **MC** | Breakage upload guard; GRN draft patch guard |
| 15 | Audit | PC | **MC** | SEND_BACK audited on GRN |
| 16 | Item Images | PC | **PC** | GRN create + item master; operational line grids largely without thumbnails |
| 17 | Keyboard | NI | **PC** | GRN create/detail only |
| 18 | Validation | PC | **PC** | GRN orchestrator hooks only |
| 19 | Errors | PC | **MC** | `errorRegistry` wired to API `errorFamily`; FE classify on 409 |
| 20 | Settings | PC | **PC** | displayCurrency in tenant_settings |
| 21 | Reporting | PC | **PC** | Unchanged |
| 22 | Timeline | PC | **MC** | Unified API: GRN/TRANSFER/BREAKAGE/GET_PASS; GRN FE consumes workflow slots |
| 23 | Lookup | NI | **PC** | SharedLookup on GRN create search only |
| 24 | Workspace & Responsive | PC | **FC** | Desktop SPA (Ch.24.1) |
| 25 | Document Layout | PC | **PC** | Retained |
| 26 | Printing & Export | PC | **PC** | Unchanged |
| 27 | Performance | PC | **PC** | Unchanged |
| 28 | Accessibility | PC | **PC** | Ch.28.5 WCAG program out of scope; governed-form labeling incomplete |
| 29 | Governance | PC | **MC** | Deliverables updated; matrix reflects verified gaps |

---

## Compliance Summary

| Metric | Value |
|--------|-------|
| Chapters Fully Compliant (FC) | 1 (Ch.24) |
| Chapters Mostly Compliant (MC) | 9 |
| Chapters Partially Compliant (PC) | 18 |
| Chapters Not Implemented (NI) | 0 |
| BDR Exceptions | **BDR-007 Under Review** |

**Business UAT:** Blocked until all **Must Complete Before Business UAT** items are closed or reclassified by Product Governance.

---

## BDR Register (Active)

| BDR | Status | Conformance impact |
|-----|--------|-------------------|
| BDR-006 | Active | Period resolution workspace implemented (API + FE) |
| BDR-007 | **Under Review** | Void vs Cancelled label — governance decision required |
| BDR-009 | Active | Item immutability rules unchanged |
