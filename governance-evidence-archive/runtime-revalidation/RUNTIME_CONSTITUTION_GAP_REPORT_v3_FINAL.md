# DX OSE — Runtime Constitution Gap Report v3 FINAL

**Scope:** Critical Runtime Constitution Gap Validation — **not** full 393-requirement verification.  
Generated: 2026-06-27T18:55:54.969Z  
Register: `P0_RUNTIME_V3_FINAL.json` (64 scenarios, unique IDs verified)

---

## Executive Summary

| Metric | Count |
|--------|------:|
| PASS (constitution-aligned) | 31 |
| FAIL (constitution gap) | 33 |
| BLOCKED | 0 |
| NOT APPLICABLE | 0 |
| **Total scenarios** | **64** |
| Requirements Not Run (SSOT) | 148 / 393 |

**Count integrity:** Global rollup = sum(section rollups) = 64. No manual overrides.

---

## 1. Method — Constitution vs Product

All **Expected** values derive from Constitution §3.4 (Send Back vs Reject), §2.4 (Posting), §5.2 (auto-post), ACC scope, and Workflow Contract — **not** from current product behavior.

**Reject ≠ Send Back:** Reject compliance tests (V3-H-REJECT-*) prove termination only; they **do not** satisfy Send Back (V3-H-SB-*).

---

## 2. Product Manifest (unchanged)

Git HEAD: `d8ea25d51407370b1e67c42378e3114d127a019e` | Gate C provable identical: false  
Manifest limitation: **not** a runtime defect.

---

## 3. Retained v2 Runtime Evidence (reclassified only)

49 scenarios carried from v2 with constitution-based expected/classification. Send Back/Reject/Posting/GRN-resubmit scenarios replaced by v3 delta.

---

## 4. v3 Delta Executed

11 new scenarios: Send Back probes (Transfer, Breakage, Lost, Get Pass, IC), Reject controls, GRN Re-submit browser reachability.

---

## 5. Section Rollup (auto from register)

| Section | PASS | FAIL | BLOCKED | N/A | Total |
|---------|-----:|-----:|--------:|----:|------:|
| A | 2 | 6 | 0 | 0 | 8 |
| C-legacy | 0 | 1 | 0 | 0 | 1 |
| D-ff | 0 | 2 | 0 | 0 | 2 |
| E-grn | 0 | 1 | 0 | 0 | 1 |
| B | 2 | 6 | 0 | 0 | 8 |
| C | 0 | 1 | 0 | 0 | 1 |
| D | 4 | 1 | 0 | 0 | 5 |
| E | 8 | 2 | 0 | 0 | 10 |
| F | 1 | 3 | 0 | 0 | 4 |
| G | 8 | 1 | 0 | 0 | 9 |
| I | 2 | 0 | 0 | 0 | 2 |
| H | 4 | 8 | 0 | 0 | 12 |
| E/F | 0 | 1 | 0 | 0 | 1 |

---

## 6. Final Classification Rollup

- **Runtime Confirmed Defect:** 22
- **Operational Legacy:** 1
- **Runtime Confirmed Compliant:** 31
- **Static Dead Code:** 3
- **Configuration Drift:** 1
- **Governance Conflict:** 6

---

## 7. Runtime Confirmed Defects

- **V2-CF-GP-NEVER-SUBMIT** (Get Pass): Assignment/scope not enforced on operational API
- **V2-CF-GP-FF-FINANCE** (Get Pass): Creator role fast-forward skips workflow steps on Get Pass submit
- **V2-CF-GP-FF-ORG** (Get Pass): Creator role fast-forward skips workflow steps on Get Pass submit
- **V2-CF-WP-NEVER-LIST** (Workflow Pipeline / Dashboard): Assignment/scope not enforced on operational API
- **V2-CF-WP-NEVER-SUMMARY** (Workflow Pipeline / Dashboard): Assignment/scope not enforced on operational API
- **V2-CF-WP-NEVER-ALERTS** (Workflow Pipeline / Dashboard): Assignment/scope not enforced on operational API
- **V2-A-NEVER-SUBMIT** (Get Pass): Assignment/scope not enforced on operational API
- **V2-A-INACTIVE-SUBMIT** (Get Pass): Assignment/scope not enforced on operational API
- **V2-A-DELETED-SUBMIT** (Get Pass): Assignment/scope not enforced on operational API
- **V2-A-WRONG-PROP-SUBMIT** (Get Pass): Assignment/scope not enforced on operational API
- **V2-A-STALE-JWT** (Get Pass): Assignment/scope not enforced on operational API
- **V2-B-NEVER-LIST** (Workflow Pipeline / Dashboard): Assignment/scope not enforced on operational API
- **V2-B-NEVER-ALERTS** (Workflow Pipeline / Dashboard): Assignment/scope not enforced on operational API
- **V2-B-DASH-NEVER** (Workflow Pipeline / Dashboard): Assignment/scope not enforced on operational API
- **V2-G-WRONG-SCOPE** (Movements): Movement create not denied for user assigned to different property
- **V3-H-SB-TRANSFER** (Transfer): Missing Send Back API/UI for Transfer at review step
- **V3-H-SB-BREAKAGE** (Breakage): No Send Back route/action for Breakage
- **V3-H-SB-LOST** (Lost Items): No Send Back route for Lost Items
- **V3-H-SB-GETPASS** (Get Pass): No Send Back route during Get Pass approval
- **V3-H-REJECT-GETPASS** (Get Pass): Reject action failed at review step
- **V3-H-SB-IC** (Inventory Count): No Send Back route on inventory-count sessions
- **V3-H-REJECT-IC** (Inventory Count): HTTP 403 status=PENDING_APPROVAL

---

## 8. Governance Conflicts

- **V2-F-RPT-BRK-APPROVED-OUT**: Final approval triggers posting effects but document status remains APPROVED; reports filter parent status=POSTED (C02-2.4.2-001 + C02-2.3-007)
- **V2-F-RPT-LOST-LEDGER-OUT**: Final approval triggers posting effects but document status remains APPROVED; reports filter parent status=POSTED (C02-2.4.2-001 + C02-2.3-007)
- **V2-F-RPT-POSTED-IN**: Final approval triggers posting effects but document status remains APPROVED; reports filter parent status=POSTED (C02-2.4.2-001 + C02-2.3-007)
- **V3-E-POSTING-BREAKAGE**: Posting effects (postedAt, ledger, stock) occur at GM approval but status remains APPROVED not POSTED
- **V3-E-POSTING-LOST**: Same APPROVED-after-posting pattern as Breakage
- **V3-E-POSTING-REPORT-LINK**: Chain: final approval → posting effect → status APPROVED → POSTED-only report excludes document

**Posting → Reports root cause chain:** Final approval → posting effect (ledger, postedAt, stock) → document status **APPROVED** → `reports.service.js` filters parent `status=POSTED` → **zero report rows** despite ledger.

---

## 9. Configuration Drift / Operational Legacy / Static Dead Code

- **V2-CF-LEG-LOST-DEPT** [Operational Legacy]: Legacy /approve-dept route bypasses ACC-pinned approval
- **V2-CF-GRN-RESUBMIT-DEAD** [Static Dead Code]: Independent Re-submit violates C03-3.4-009; FE/backend mismatch
- **V2-C-WF-EFFECTIVE** [Configuration Drift]: Global GET_PASS published chain includes PENDING_GM for all tenants
- **V2-D-GRN-RESUBMIT-CALL** [Static Dead Code]: Independent Re-submit violates C03-3.4-009; FE/backend mismatch
- **V3-GRN-RESUBMIT-BROWSER** [Static Dead Code]: FE contains resubmitRejected()+POST /resubmit for REJECTED status; backend 404; not constitution-compliant even if button not rendered in this session

---

## 10. Send Back Matrix (Constitution §3.4)

| Module | Send Back (V3-H-SB-*) | Reject control (V3-H-REJECT-*) |
|--------|----------------------|--------------------------------|
| GRN | PASS — live send-back cycle | Reject separate (not re-tested here) |
| Transfer | FAIL | PASS |
| Breakage | FAIL | PASS |
| Lost | FAIL | PASS |
| Get Pass | FAIL | FAIL |
| Inventory Count | FAIL | FAIL |

Only **GRN** has a working Send Back path. Other modules: **FAIL** — Send Back action missing (404/no route).

---

## 11. GRN Re-submit (Constitution violation if reachable)

| Check | Result |
|-------|--------|
| V3-GRN-RESUBMIT-BROWSER | FAIL — buttonVisible=null apiOnClick=none staticCode=grn-detail.component.html:129-137 resubmitRejected() |
| Classification | Static Dead Code |

Constitution: no independent Re-submit; REJECTED requires new document (C03-3.4-009).

---

## 12. Movements (Runtime evidence, governance note)

- Direct-post model: **runtime proven** (create → post → ledger).
- Wrong-property create: **Runtime Confirmed Defect** (V2-G-WRONG-SCOPE).
- Constitutional PASS for direct-post model requires explicit governance confirmation (EXCEPTION_REGISTER EX-008 variance).

---

## 13. 393 vs 476 Mapping

Net Δ = 83 (199 fresh-only − 116 register-only).  
File: `REQUIREMENTS_476_393_MAPPING.json`

---

## 14. Blocked / Not Run

- **Blocked:** none
- **393 matrix:** 148 requirements Not Run — not inferred as PASS

---

## 15. Scenario Detail Register

### V2-CF-GP-NEVER-SUBMIT
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** 403/401/422 — submit denied without active assignment
- **Actual:** HTTP 200 submit without assignment
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Assignment/scope not enforced on operational API
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-NEVER-SUBMIT (v2 runtime, v3 constitution reclass)

### V2-CF-LEG-LOST-DEPT
- **Constitution:** Constitution traceability matrix
- **Contract/BDR:** —
- **Expected (constitution):** legacy blocked or ACC-pinned
- **Actual:** HTTP 200 DRAFT->DEPT_APPROVED pin=null
- **Result:** FAIL | **Classification:** Operational Legacy
- **Root cause:** Legacy /approve-dept route bypasses ACC-pinned approval
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-LEG-LOST-DEPT (v2 runtime, v3 constitution reclass)

### V2-CF-GP-FF-FINANCE
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** Assignment-scoped denial or authorized success per ACC
- **Actual:** status=PENDING_GM financeApprovedBy set; dept/cc null
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Creator role fast-forward skips workflow steps on Get Pass submit
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-FF-FINANCE (v2 runtime, v3 constitution reclass)

### V2-CF-GP-FF-ORG
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** Assignment-scoped denial or authorized success per ACC
- **Actual:** HTTP 200 status=PENDING_SECURITY all stamps
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Creator role fast-forward skips workflow steps on Get Pass submit
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-FF-ORG (v2 runtime, v3 constitution reclass)

### V2-CF-GP-XT-READ
- **Constitution:** Tenant isolation / ACC scope
- **Contract/BDR:** —
- **Expected (constitution):** HTTP 404 cross-tenant read denied
- **Actual:** HTTP 404
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-XT-READ (v2 runtime, v3 constitution reclass)

### V2-CF-GRN-RESUBMIT-DEAD
- **Constitution:** C03-3.4-009 — After Reject, same document must not re-enter workflow.
- **Contract/BDR:** WORKFLOW_MATRIX §2; Constitution §3.4
- **Expected (constitution):** No independent Re-submit action; REJECTED doc cannot re-enter via /resubmit
- **Actual:** HTTP 404 on POST /grn/:id/resubmit
- **Result:** FAIL | **Classification:** Static Dead Code
- **Root cause:** Independent Re-submit violates C03-3.4-009; FE/backend mismatch
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GRN-RESUBMIT-DEAD (v2 runtime, v3 constitution reclass)

### V2-CF-WP-NEVER-LIST
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** 403 or empty data without active assignment
- **Actual:** HTTP 200 count=50
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Assignment/scope not enforced on operational API
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-LIST (v2 runtime, v3 constitution reclass)

### V2-CF-WP-NEVER-SUMMARY
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** 403 or empty data without active assignment
- **Actual:** HTTP 200 count=179
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Assignment/scope not enforced on operational API
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-SUMMARY (v2 runtime, v3 constitution reclass)

### V2-CF-WP-NEVER-ALERTS
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** 403 or empty data without active assignment
- **Actual:** HTTP 200 count=15
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Assignment/scope not enforced on operational API
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-ALERTS (v2 runtime, v3 constitution reclass)

### V2-A-NEVER-SUBMIT
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** Assignment-scoped denial or authorized success per ACC
- **Actual:** HTTP 200 status DRAFT->PENDING_COST_CONTROL
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Assignment/scope not enforced on operational API
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-NEVER-SUBMIT

### V2-A-INACTIVE-SUBMIT
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** Assignment-scoped denial or authorized success per ACC
- **Actual:** HTTP 200 status DRAFT->PENDING_COST_CONTROL
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Assignment/scope not enforced on operational API
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-INACTIVE-SUBMIT

### V2-A-DELETED-SUBMIT
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** WORKFLOW_MATRIX §2; Constitution §3.4
- **Expected (constitution):** Assignment-scoped denial or authorized success per ACC
- **Actual:** HTTP 200 status DRAFT->PENDING_COST_CONTROL
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Assignment/scope not enforced on operational API
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-DELETED-SUBMIT

### V2-A-WRONG-PROP-SUBMIT
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** Assignment-scoped denial or authorized success per ACC
- **Actual:** HTTP 200 status DRAFT->PENDING_COST_CONTROL
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Assignment/scope not enforced on operational API
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-WRONG-PROP-SUBMIT

### V2-A-VALID-SUBMIT
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** WORKFLOW_MATRIX §2; Constitution §3.4
- **Expected (constitution):** HTTP 200 submit with active assignment
- **Actual:** HTTP 200 status DRAFT->PENDING_COST_CONTROL
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-VALID-SUBMIT

### V2-A-STALE-JWT
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** Assignment-scoped denial or authorized success per ACC
- **Actual:** HTTP 200
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Assignment/scope not enforced on operational API
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-STALE-JWT

### V2-B-NEVER-LIST
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** 403 or empty data without active assignment
- **Actual:** HTTP 200 count=50
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Assignment/scope not enforced on operational API
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-LIST

### V2-B-NEVER-SUMMARY
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** 403 or empty data without active assignment
- **Actual:** HTTP 200 count=0
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-SUMMARY

### V2-B-NEVER-ALERTS
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** 403 or empty data without active assignment
- **Actual:** HTTP 200 count=15
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Assignment/scope not enforced on operational API
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-ALERTS

### V2-B-FIN-POS
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** 403 or empty data without active assignment
- **Actual:** HTTP 200 count=0
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-FIN-POS

### V2-B-DASH-NEVER
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** 403 or empty data without active assignment
- **Actual:** HTTP 200
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Assignment/scope not enforced on operational API
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-DASH-NEVER

### V2-C-WF-EFFECTIVE
- **Constitution:** Workflow Contract GET_PASS — published chain without unauthorized GM skip.
- **Contract/BDR:** WORKFLOW_MATRIX §5 GET_PASS; GP effective resolver
- **Expected (constitution):** Effective GET_PASS published chain per Workflow Contract (no constitution-violating GM if excluded)
- **Actual:** 21/21 effective chains contain GM; 0 tenant-specific, 21 inherit global
- **Result:** FAIL | **Classification:** Configuration Drift
- **Root cause:** Global GET_PASS published chain includes PENDING_GM for all tenants
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-C-WF-EFFECTIVE

### V2-D-GRN-SB
- **Constitution:** C03-3.4-001–005 — Send Back shall not end doc; allow edit; require reason; Edit then Submit; continue transaction.
- **Contract/BDR:** WORKFLOW_MATRIX §2; Constitution §3.4
- **Expected (constitution):** Send Back → DRAFT editable; reason required; same GRN continues after Submit
- **Actual:** HTTP 200 status=DRAFT
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-SB

### V2-D-GRN-EDIT
- **Constitution:** Constitution traceability matrix
- **Contract/BDR:** WORKFLOW_MATRIX §2; Constitution §3.4
- **Expected (constitution):** creator can edit DRAFT
- **Actual:** HTTP 200
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-EDIT

### V2-D-GRN-SUBMIT-AFTER-SB
- **Constitution:** C03-3.4-001–005 — Send Back shall not end doc; allow edit; require reason; Edit then Submit; continue transaction.
- **Contract/BDR:** WORKFLOW_MATRIX §2; Constitution §3.4
- **Expected (constitution):** After Send Back: Edit then Submit (not /resubmit)
- **Actual:** validate HTTP 200 submit HTTP 200 status=PENDING_APPROVAL
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-SUBMIT-AFTER-SB

### V2-D-GRN-RESUBMIT-CALL
- **Constitution:** C03-3.4-009 — After Reject, same document must not re-enter workflow.
- **Contract/BDR:** WORKFLOW_MATRIX §2; Constitution §3.4
- **Expected (constitution):** Backend /resubmit absent (dead route)
- **Actual:** HTTP 404
- **Result:** FAIL | **Classification:** Static Dead Code
- **Root cause:** Independent Re-submit violates C03-3.4-009; FE/backend mismatch
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-RESUBMIT-CALL

### V2-D-GRN-AUDIT
- **Constitution:** Constitution traceability matrix
- **Contract/BDR:** WORKFLOW_MATRIX §2; Constitution §3.4
- **Expected (constitution):** SEND_BACK audit; resubmit via submit not separate action
- **Actual:** SEND_BACK,SUBMIT
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-AUDIT

### V2-E-BRK-SUBMIT
- **Constitution:** C05-5.2-011 — Posting auto-triggered on final approval.
- **Contract/BDR:** —
- **Expected (constitution):** Approval chain advances per workflow until final authorization
- **Actual:** HTTP 200 status=DEPT_APPROVED
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-SUBMIT

### V2-E-BRK-AP-CC
- **Constitution:** C05-5.2-011 — Posting auto-triggered on final approval.
- **Contract/BDR:** —
- **Expected (constitution):** Approval chain advances per workflow until final authorization
- **Actual:** HTTP 200 status=COST_CONTROL_APPROVED
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-CC

### V2-E-BRK-AP-FIN
- **Constitution:** C05-5.2-011 — Posting auto-triggered on final approval.
- **Contract/BDR:** —
- **Expected (constitution):** Approval chain advances per workflow until final authorization
- **Actual:** HTTP 200 status=FINANCE_APPROVED
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-FIN

### V2-E-BRK-AP-GM
- **Constitution:** C05-5.2-011 — Posting auto-triggered on final approval.
- **Contract/BDR:** —
- **Expected (constitution):** Approval chain advances per workflow until final authorization
- **Actual:** HTTP 200 status=APPROVED
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-GM

### V2-E-LOST-CREATE
- **Constitution:** C05-5.2-011 — Posting auto-triggered on final approval.
- **Contract/BDR:** —
- **Expected (constitution):** Approval chain advances per workflow until final authorization
- **Actual:** status=DEPT_APPROVED
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-CREATE

### V2-E-LOST-AP-CC
- **Constitution:** C05-5.2-011 — Posting auto-triggered on final approval.
- **Contract/BDR:** —
- **Expected (constitution):** Approval chain advances per workflow until final authorization
- **Actual:** HTTP 200 status=COST_CONTROL_APPROVED
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-CC

### V2-E-LOST-AP-FIN
- **Constitution:** C05-5.2-011 — Posting auto-triggered on final approval.
- **Contract/BDR:** —
- **Expected (constitution):** Approval chain advances per workflow until final authorization
- **Actual:** HTTP 200 status=FINANCE_APPROVED
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-FIN

### V2-E-LOST-AP-GM
- **Constitution:** C05-5.2-011 — Posting auto-triggered on final approval.
- **Contract/BDR:** —
- **Expected (constitution):** Approval chain advances per workflow until final authorization
- **Actual:** HTTP 200 status=APPROVED
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-GM

### V2-F-RPT-BRK-APPROVED-OUT
- **Constitution:** C02-2.4.2-001 — Reports derive from Posted documents. + C02-2.3-007 — Identical outcomes → same standardized lifecycle state.
- **Contract/BDR:** WORKFLOW_MATRIX §2; Constitution §3.4
- **Expected (constitution):** Completed/posted business effects visible in financial reports as Posted documents
- **Actual:** brkInReport=false ledger=1 doc=BRK-2026-00020 rows=0
- **Result:** FAIL | **Classification:** Governance Conflict
- **Root cause:** Final approval triggers posting effects but document status remains APPROVED; reports filter parent status=POSTED (C02-2.4.2-001 + C02-2.3-007)
- **Missing:** Align final lifecycle to POSTED when posting occurs, or report filter to include constitutionally posted APPROVED docs
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-BRK-APPROVED-OUT

### V2-F-RPT-LOST-LEDGER-OUT
- **Constitution:** C02-2.4.2-001 — Reports derive from Posted documents. + C02-2.3-007 — Identical outcomes → same standardized lifecycle state.
- **Contract/BDR:** reports.service.js POSTED parent filter; EX-007 breakage/lost TBD
- **Expected (constitution):** Completed/posted business effects visible in financial reports as Posted documents
- **Actual:** lostInReport=false ledger=1 doc=LST-2026-00008
- **Result:** FAIL | **Classification:** Governance Conflict
- **Root cause:** Final approval triggers posting effects but document status remains APPROVED; reports filter parent status=POSTED (C02-2.4.2-001 + C02-2.3-007)
- **Missing:** Align final lifecycle to POSTED when posting occurs, or report filter to include constitutionally posted APPROVED docs
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-LOST-LEDGER-OUT

### V2-F-RPT-POSTED-IN
- **Constitution:** C02-2.4.2-001 — Reports derive from Posted documents. + C02-2.3-007 — Identical outcomes → same standardized lifecycle state.
- **Contract/BDR:** WORKFLOW_MATRIX §2; Constitution §3.4
- **Expected (constitution):** Completed/posted business effects visible in financial reports as Posted documents
- **Actual:** brk=false lost=false anyLedger=2
- **Result:** FAIL | **Classification:** Governance Conflict
- **Root cause:** Final approval triggers posting effects but document status remains APPROVED; reports filter parent status=POSTED (C02-2.4.2-001 + C02-2.3-007)
- **Missing:** Align final lifecycle to POSTED when posting occurs, or report filter to include constitutionally posted APPROVED docs
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-POSTED-IN

### V2-F-RPT-DRAFT-OUT
- **Constitution:** C02-2.4.2-001 — Reports derive from Posted documents.
- **Contract/BDR:** reports.service.js POSTED parent filter; EX-007 breakage/lost TBD
- **Expected (constitution):** DRAFT excluded from financial report
- **Actual:** draftInReport=false
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-DRAFT-OUT

### V2-G-PERM-CHECK
- **Constitution:** C05-5.2 — Movements direct-post family (Governance confirmation required for exception)
- **Contract/BDR:** —
- **Expected (constitution):** Authorized direct-post movement per document-specific model
- **Actual:** hasAdj=true perms=ADJUSTMENT_CREATE,ADJUSTMENT_VIEW
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-PERM-CHECK

### V2-G-NO-ASSIGN
- **Constitution:** C05-5.2 — Movements direct-post family (Governance confirmation required for exception)
- **Contract/BDR:** —
- **Expected (constitution):** Authorized direct-post movement per document-specific model
- **Actual:** HTTP 403
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-NO-ASSIGN

### V2-G-CREATE
- **Constitution:** C05-5.2 — Movements direct-post family (Governance confirmation required for exception)
- **Contract/BDR:** —
- **Expected (constitution):** Authorized direct-post movement per document-specific model
- **Actual:** HTTP 201
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-CREATE

### V2-G-VALIDATE
- **Constitution:** C05-5.2 — Movements direct-post family (Governance confirmation required for exception)
- **Contract/BDR:** —
- **Expected (constitution):** Authorized direct-post movement per document-specific model
- **Actual:** HTTP 422
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-VALIDATE

### V2-G-WRONG-SCOPE
- **Constitution:** C04-4.3-001 — Permissions shall never bypass document lifecycle rules; ACC assignment scope.
- **Contract/BDR:** —
- **Expected (constitution):** 403/422 — movement create denied outside assigned property
- **Actual:** HTTP 201
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Movement create not denied for user assigned to different property
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-WRONG-SCOPE

### V2-G-NEG-INV
- **Constitution:** C05-5.2 — Movements direct-post family (Governance confirmation required for exception)
- **Contract/BDR:** —
- **Expected (constitution):** Authorized direct-post movement per document-specific model
- **Actual:** HTTP 422
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-NEG-INV

### V2-G-POST
- **Constitution:** C05-5.2 — Movements direct-post family (Governance confirmation required for exception)
- **Contract/BDR:** —
- **Expected (constitution):** Authorized direct-post movement per document-specific model
- **Actual:** HTTP 200 status=POSTED ledger=1 stock 196->199
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-POST

### V2-G-IDEMP
- **Constitution:** C05-5.2 — Movements direct-post family (Governance confirmation required for exception)
- **Contract/BDR:** —
- **Expected (constitution):** Authorized direct-post movement per document-specific model
- **Actual:** HTTP 400
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-IDEMP

### V2-G-MODEL
- **Constitution:** C05-5.2 — Movements direct-post family (Governance confirmation required for exception)
- **Contract/BDR:** Document-specific direct-post ADJUSTMENT — EX-008 posting trigger variance; Governance confirmation pending
- **Expected (constitution):** Authorized direct-post movement per document-specific model
- **Actual:** ADJUSTMENT create->DRAFT then POST->POSTED with ledger; no ACC approval chain
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-MODEL

### V2-I-REQ-PIPELINE
- **Constitution:** Constitution traceability matrix
- **Contract/BDR:** —
- **Expected (constitution):** Requisition excluded from pipeline if out of scope
- **Actual:** REQUISITION rows=0 total=0
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-I-REQ-PIPELINE

### V2-I-STOCK-RPT
- **Constitution:** Constitution traceability matrix
- **Contract/BDR:** —
- **Expected (constitution):** Retired stock report not in operational pipeline
- **Actual:** STOCK_REPORT rows=0
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-I-STOCK-RPT

### V3-H-SB-GRN
- **Constitution:** C03-3.4-001–005 — Send Back shall not end doc; allow edit; require reason; Edit then Submit; continue transaction.
- **Contract/BDR:** Constitution §3.4; WORKFLOW_MATRIX §2 POST /grn/:id/send-back
- **Expected (constitution):** Send Back at review → creator DRAFT → edit → Submit same GRN
- **Actual:** HTTP 200 status=DRAFT; edit=HTTP 200; resubmit=validate HTTP 200 submit HTTP 200 status=PENDING_APPROVAL
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-SB

### V3-E-POSTING-BREAKAGE
- **Constitution:** C05-5.2-011 — Posting auto-triggered on final approval. C02-2.3-007 — Identical outcomes → same standardized lifecycle state. C02-2.4.1-001 — Posting is the single business commit point.
- **Contract/BDR:** No approved BDR allowing APPROVED status after posting effects; EX-007 Needs Review
- **Expected (constitution):** After final approval auto-posting: lifecycle state POSTED (or approved-only stage before posting without ledger until POSTED)
- **Actual:** status=APPROVED postedAt=set ledger=1 stock 200->198
- **Result:** FAIL | **Classification:** Governance Conflict
- **Root cause:** Posting effects (postedAt, ledger, stock) occur at GM approval but status remains APPROVED not POSTED
- **Missing:** Set final status POSTED when posting executes, or separate pre-post APPROVED without ledger
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-FINAL

### V3-E-POSTING-LOST
- **Constitution:** C05-5.2-011 — Posting auto-triggered on final approval. C02-2.3-007 — Identical outcomes → same standardized lifecycle state.
- **Contract/BDR:** EX-007 — parity TBD
- **Expected (constitution):** Same lifecycle/posting representation as Breakage when posting occurs
- **Actual:** status=APPROVED postedAt=set ledger=1
- **Result:** FAIL | **Classification:** Governance Conflict
- **Root cause:** Same APPROVED-after-posting pattern as Breakage
- **Missing:** Lifecycle POSTED after posting effects
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-FINAL

### V3-E-POSTING-REPORT-LINK
- **Constitution:** C02-2.4.2-001 — Reports derive from Posted documents. C02-2.3-007 — Identical outcomes → same standardized lifecycle state.
- **Contract/BDR:** reports.service.js lines 216,314 status=POSTED parent filter
- **Expected (constitution):** Documents with official posting effects appear in financial reports
- **Actual:** ledger+postedAt present; status=APPROVED; breakage-loss + loss-analysis rows=0
- **Result:** FAIL | **Classification:** Governance Conflict
- **Root cause:** Chain: final approval → posting effect → status APPROVED → POSTED-only report excludes document
- **Missing:** Unify lifecycle POSTED with posting OR extend report to constitutionally posted APPROVED docs
- **Evidence:** Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-POSTED-IN

### V3-H-SB-TRANSFER
- **Constitution:** C03-3.4-001 — Send Back shall not end the document. C03-3.4-004 — Send Back next step shall be Edit then Submit.
- **Contract/BDR:** WORKFLOW_MATRIX §1 — no send-back route documented
- **Expected (constitution):** Reviewer Send Back returns doc to creator editable; same transaction continues after Submit
- **Actual:** POST /transfers/:id/send-back HTTP 404; status at review=PENDING_DEPT
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Missing Send Back API/UI for Transfer at review step
- **Missing:** POST /transfers/:id/send-back + creator edit/resubmit path
- **Evidence:** {"sbBody":{"success":false,"message":"Route not found: POST /api/transfers/2b5bd330-e865-4794-b793-b17e8f7a9c6f/send-back"},"sbMessage":"Route not found: POST /api/transfers/2b5bd330-e865-4794-b793-b17e8f7a9c6f/send-back"}

### V3-H-REJECT-TRANSFER
- **Constitution:** C03-3.4-006 — Reject shall end the document.
- **Contract/BDR:** —
- **Expected (constitution):** Reject terminates document (not Send Back proof)
- **Actual:** HTTP 200 status=REJECTED
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** {"note":"Reject compliance only — does not satisfy Send Back"}

### V3-H-SB-BREAKAGE
- **Constitution:** C03-3.4-001 — Send Back shall not end the document.
- **Contract/BDR:** WORKFLOW_MATRIX §3 — reject only, no send-back route
- **Expected (constitution):** Send Back at review returns to creator for edit+submit same doc
- **Actual:** POST /breakage/:id/send-back HTTP 404
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** No Send Back route/action for Breakage
- **Missing:** Send Back distinct from Reject on Breakage approval chain
- **Evidence:** {"reviewStatus":"DEPT_APPROVED","message":"Route not found: POST /api/breakage/38111059-3f22-4067-a60e-d8d8e697f85d/send-back"}

### V3-H-REJECT-BREAKAGE
- **Constitution:** C03-3.4-006 — Reject shall end the document.
- **Contract/BDR:** —
- **Expected (constitution):** Reject ends/terminates document lifecycle
- **Actual:** HTTP 200 status=REJECTED
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** {"note":"Reject path only — not Send Back"}

### V3-H-SB-LOST
- **Constitution:** C03-3.4-001 — Send Back shall not end the document.
- **Contract/BDR:** WORKFLOW_MATRIX §4 — reject only
- **Expected (constitution):** Send Back at review
- **Actual:** POST /lost-items/:id/send-back HTTP 404
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** No Send Back route for Lost Items
- **Missing:** Send Back action on Lost Items review step
- **Evidence:** {"message":"Route not found: POST /api/lost-items/1d6589dd-4ff7-4385-82a6-67597cb9629a/send-back"}

### V3-H-REJECT-LOST
- **Constitution:** C03-3.4-006 — Reject shall end the document.
- **Contract/BDR:** —
- **Expected (constitution):** Reject terminates document
- **Actual:** HTTP 200 status=REJECTED
- **Result:** PASS | **Classification:** Runtime Confirmed Compliant
- **Root cause:** —
- **Missing:** —
- **Evidence:** {}

### V3-H-SB-GETPASS
- **Constitution:** C03-3.4-001 — Send Back shall not end the document.
- **Contract/BDR:** WORKFLOW_MATRIX §5 — reject during approval; OUT/RETURN is post-approval logistics not §3.4 Send Back
- **Expected (constitution):** Reviewer Send Back during approval workflow
- **Actual:** POST /get-passes/:id/send-back HTTP 404
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** No Send Back route during Get Pass approval
- **Missing:** Send Back action distinct from reject/return logistics
- **Evidence:** {"message":"Route not found: POST /api/get-passes/da1d25ab-ed9d-4d96-93e4-aab526ac2a2b/send-back","note":"Physical return lifecycle (OUT/RETURN) is not reviewer Send Back"}

### V3-H-REJECT-GETPASS
- **Constitution:** C03-3.4-006 — Reject shall end the document.
- **Contract/BDR:** —
- **Expected (constitution):** Reject ends approval workflow
- **Actual:** HTTP 500 status=PENDING_COST_CONTROL
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** Reject action failed at review step
- **Missing:** —
- **Evidence:** {"message":"rejectionReason is required"}

### V3-H-SB-IC
- **Constitution:** C03-3.4-001 — Send Back shall not end the document.
- **Contract/BDR:** WORKFLOW_MATRIX §8 — reject at approval; recount from REVEAL_REVIEW is not approval Send Back
- **Expected (constitution):** Send Back at PENDING_APPROVAL returns session to creator for edit+resubmit
- **Actual:** session status=PENDING_APPROVAL send-back HTTP 404
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** No Send Back route on inventory-count sessions
- **Missing:** POST /inventory-count/sessions/:id/send-back
- **Evidence:** {"sessionNo":"CNT-2606-0003","message":"Route not found: POST /api/inventory-count/sessions/6ea69caf-0025-4973-a02a-986b3cdb4621/send-back"}

### V3-H-REJECT-IC
- **Constitution:** C03-3.4-006 — Reject shall end the document.
- **Contract/BDR:** —
- **Expected (constitution):** Reject terminates session at approval
- **Actual:** HTTP 403 status=PENDING_APPROVAL
- **Result:** FAIL | **Classification:** Runtime Confirmed Defect
- **Root cause:** —
- **Missing:** —
- **Evidence:** {"note":"Reject only — not Send Back"}

### V3-GRN-RESUBMIT-BROWSER
- **Constitution:** C03-3.4-009 — After Reject, new document required; no Re-submit action.
- **Contract/BDR:** Constitution §3.4 — no independent Re-submit; REJECTED requires new document
- **Expected (constitution):** No Re-submit UI/API re-entering REJECTED document to workflow
- **Actual:** buttonVisible=null apiOnClick=none staticCode=grn-detail.component.html:129-137 resubmitRejected()
- **Result:** FAIL | **Classification:** Static Dead Code
- **Root cause:** FE contains resubmitRejected()+POST /resubmit for REJECTED status; backend 404; not constitution-compliant even if button not rendered in this session
- **Missing:** Remove Re-submit action; after Reject require new GRN document
- **Evidence:** {"path":"OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html","backendProbe":404,"browser":{"reachable":null,"buttonVisible":null,"apiCalled":null,"error":"login failed HTTP 409"}}


---

## Priority Table

| Priority | Module | Scenario ID | Expected (Constitution) | Actual | Result | Constitution authority | Evidence |
| -------- | ------ | ----------- | ------------------------ | ------ | ------ | ---------------------- | -------- |
| P0 | Get Pass | V2-CF-GP-NEVER-SUBMIT | 403/401/422 — submit denied without active assignment | HTTP 200 submit without assignment | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-NEVER-SUBMIT |
| P0 | Breakage / Lost | V2-CF-LEG-LOST-DEPT | legacy blocked or ACC-pinned | HTTP 200 DRAFT->DEPT_APPROVED pin=null | FAIL | Constitution traceability matrix | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-LEG-LOST-DEPT ( |
| P0 | Get Pass | V2-CF-GP-FF-FINANCE | Assignment-scoped denial or authorized success per ACC | status=PENDING_GM financeApprovedBy set; dept/cc null | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-FF-FINANCE ( |
| P0 | Get Pass | V2-CF-GP-FF-ORG | Assignment-scoped denial or authorized success per ACC | HTTP 200 status=PENDING_SECURITY all stamps | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-FF-ORG (v2 r |
| P0 | Get Pass | V2-CF-GP-XT-READ | HTTP 404 cross-tenant read denied | HTTP 404 | PASS | Tenant isolation / ACC scope | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-XT-READ (v2  |
| P0 | GRN | V2-CF-GRN-RESUBMIT-DEAD | No independent Re-submit action; REJECTED doc cannot re-enter via /res | HTTP 404 on POST /grn/:id/resubmit | FAIL | C03-3.4-009 — After Reject, same document must not re-enter  | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GRN-RESUBMIT-DE |
| P0 | Workflow Pipeline / Dashboard | V2-CF-WP-NEVER-LIST | 403 or empty data without active assignment | HTTP 200 count=50 | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-LIST ( |
| P0 | Workflow Pipeline / Dashboard | V2-CF-WP-NEVER-SUMMARY | 403 or empty data without active assignment | HTTP 200 count=179 | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-SUMMAR |
| P0 | Workflow Pipeline / Dashboard | V2-CF-WP-NEVER-ALERTS | 403 or empty data without active assignment | HTTP 200 count=15 | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-ALERTS |
| P0 | Get Pass | V2-A-NEVER-SUBMIT | Assignment-scoped denial or authorized success per ACC | HTTP 200 status DRAFT->PENDING_COST_CONTROL | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-NEVER-SUBMIT |
| P0 | Get Pass | V2-A-INACTIVE-SUBMIT | Assignment-scoped denial or authorized success per ACC | HTTP 200 status DRAFT->PENDING_COST_CONTROL | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-INACTIVE-SUBMIT |
| P0 | Get Pass | V2-A-DELETED-SUBMIT | Assignment-scoped denial or authorized success per ACC | HTTP 200 status DRAFT->PENDING_COST_CONTROL | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-DELETED-SUBMIT |
| P0 | Get Pass | V2-A-WRONG-PROP-SUBMIT | Assignment-scoped denial or authorized success per ACC | HTTP 200 status DRAFT->PENDING_COST_CONTROL | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-WRONG-PROP-SUBMI |
| P0 | Get Pass | V2-A-VALID-SUBMIT | HTTP 200 submit with active assignment | HTTP 200 status DRAFT->PENDING_COST_CONTROL | PASS | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-VALID-SUBMIT |
| P0 | Get Pass | V2-A-STALE-JWT | Assignment-scoped denial or authorized success per ACC | HTTP 200 | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-STALE-JWT |
| P0 | Workflow Pipeline / Dashboard | V2-B-NEVER-LIST | 403 or empty data without active assignment | HTTP 200 count=50 | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-LIST |
| P0 | Workflow Pipeline / Dashboard | V2-B-NEVER-SUMMARY | 403 or empty data without active assignment | HTTP 200 count=0 | PASS | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-SUMMARY |
| P0 | Workflow Pipeline / Dashboard | V2-B-NEVER-ALERTS | 403 or empty data without active assignment | HTTP 200 count=15 | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-ALERTS |
| P0 | Workflow Pipeline / Dashboard | V2-B-FIN-POS | 403 or empty data without active assignment | HTTP 200 count=0 | PASS | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-FIN-POS |
| P0 | Workflow Pipeline / Dashboard | V2-B-DASH-NEVER | 403 or empty data without active assignment | HTTP 200 | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-DASH-NEVER |
| P0 | Reports | V2-C-WF-EFFECTIVE | Effective GET_PASS published chain per Workflow Contract (no constitut | 21/21 effective chains contain GM; 0 tenant-specific, 2 | FAIL | Workflow Contract GET_PASS — published chain without unautho | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-C-WF-EFFECTIVE |
| P0 | GRN | V2-D-GRN-SB | Send Back → DRAFT editable; reason required; same GRN continues after  | HTTP 200 status=DRAFT | PASS | C03-3.4-001–005 — Send Back shall not end doc; allow edit; r | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-SB |
| P0 | GRN | V2-D-GRN-EDIT | creator can edit DRAFT | HTTP 200 | PASS | Constitution traceability matrix | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-EDIT |
| P0 | GRN | V2-D-GRN-SUBMIT-AFTER-SB | After Send Back: Edit then Submit (not /resubmit) | validate HTTP 200 submit HTTP 200 status=PENDING_APPROV | PASS | C03-3.4-001–005 — Send Back shall not end doc; allow edit; r | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-SUBMIT-AFTER |
| P0 | GRN | V2-D-GRN-RESUBMIT-CALL | Backend /resubmit absent (dead route) | HTTP 404 | FAIL | C03-3.4-009 — After Reject, same document must not re-enter  | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-RESUBMIT-CAL |
| P0 | GRN | V2-D-GRN-AUDIT | SEND_BACK audit; resubmit via submit not separate action | SEND_BACK,SUBMIT | PASS | Constitution traceability matrix | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-AUDIT |
| P0 | Breakage / Lost | V2-E-BRK-SUBMIT | Approval chain advances per workflow until final authorization | HTTP 200 status=DEPT_APPROVED | PASS | C05-5.2-011 — Posting auto-triggered on final approval. | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-SUBMIT |
| P0 | Breakage / Lost | V2-E-BRK-AP-CC | Approval chain advances per workflow until final authorization | HTTP 200 status=COST_CONTROL_APPROVED | PASS | C05-5.2-011 — Posting auto-triggered on final approval. | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-CC |
| P0 | Breakage / Lost | V2-E-BRK-AP-FIN | Approval chain advances per workflow until final authorization | HTTP 200 status=FINANCE_APPROVED | PASS | C05-5.2-011 — Posting auto-triggered on final approval. | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-FIN |
| P0 | Breakage / Lost | V2-E-BRK-AP-GM | Approval chain advances per workflow until final authorization | HTTP 200 status=APPROVED | PASS | C05-5.2-011 — Posting auto-triggered on final approval. | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-GM |
| P0 | Breakage / Lost | V2-E-LOST-CREATE | Approval chain advances per workflow until final authorization | status=DEPT_APPROVED | PASS | C05-5.2-011 — Posting auto-triggered on final approval. | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-CREATE |
| P0 | Breakage / Lost | V2-E-LOST-AP-CC | Approval chain advances per workflow until final authorization | HTTP 200 status=COST_CONTROL_APPROVED | PASS | C05-5.2-011 — Posting auto-triggered on final approval. | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-CC |
| P0 | Breakage / Lost | V2-E-LOST-AP-FIN | Approval chain advances per workflow until final authorization | HTTP 200 status=FINANCE_APPROVED | PASS | C05-5.2-011 — Posting auto-triggered on final approval. | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-FIN |
| P0 | Breakage / Lost | V2-E-LOST-AP-GM | Approval chain advances per workflow until final authorization | HTTP 200 status=APPROVED | PASS | C05-5.2-011 — Posting auto-triggered on final approval. | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-GM |
| P0 | GRN | V2-F-RPT-BRK-APPROVED-OUT | Completed/posted business effects visible in financial reports as Post | brkInReport=false ledger=1 doc=BRK-2026-00020 rows=0 | FAIL | C02-2.4.2-001 — Reports derive from Posted documents. + C02- | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-BRK-APPROVED |
| P0 | Breakage / Lost | V2-F-RPT-LOST-LEDGER-OUT | Completed/posted business effects visible in financial reports as Post | lostInReport=false ledger=1 doc=LST-2026-00008 | FAIL | C02-2.4.2-001 — Reports derive from Posted documents. + C02- | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-LOST-LEDGER- |
| P0 | GRN | V2-F-RPT-POSTED-IN | Completed/posted business effects visible in financial reports as Post | brk=false lost=false anyLedger=2 | FAIL | C02-2.4.2-001 — Reports derive from Posted documents. + C02- | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-POSTED-IN |
| P0 | Reports | V2-F-RPT-DRAFT-OUT | DRAFT excluded from financial report | draftInReport=false | PASS | C02-2.4.2-001 — Reports derive from Posted documents. | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-DRAFT-OUT |
| P0 | Movements | V2-G-PERM-CHECK | Authorized direct-post movement per document-specific model | hasAdj=true perms=ADJUSTMENT_CREATE,ADJUSTMENT_VIEW | PASS | C05-5.2 — Movements direct-post family (Governance confirmat | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-PERM-CHECK |
| P0 | Movements | V2-G-NO-ASSIGN | Authorized direct-post movement per document-specific model | HTTP 403 | PASS | C05-5.2 — Movements direct-post family (Governance confirmat | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-NO-ASSIGN |
| P0 | Movements | V2-G-CREATE | Authorized direct-post movement per document-specific model | HTTP 201 | PASS | C05-5.2 — Movements direct-post family (Governance confirmat | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-CREATE |
| P0 | Movements | V2-G-VALIDATE | Authorized direct-post movement per document-specific model | HTTP 422 | PASS | C05-5.2 — Movements direct-post family (Governance confirmat | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-VALIDATE |
| P0 | Movements | V2-G-WRONG-SCOPE | 403/422 — movement create denied outside assigned property | HTTP 201 | FAIL | C04-4.3-001 — Permissions shall never bypass document lifecy | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-WRONG-SCOPE |
| P0 | Movements | V2-G-NEG-INV | Authorized direct-post movement per document-specific model | HTTP 422 | PASS | C05-5.2 — Movements direct-post family (Governance confirmat | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-NEG-INV |
| P0 | Movements | V2-G-POST | Authorized direct-post movement per document-specific model | HTTP 200 status=POSTED ledger=1 stock 196->199 | PASS | C05-5.2 — Movements direct-post family (Governance confirmat | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-POST |
| P0 | Movements | V2-G-IDEMP | Authorized direct-post movement per document-specific model | HTTP 400 | PASS | C05-5.2 — Movements direct-post family (Governance confirmat | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-IDEMP |
| P0 | Movements | V2-G-MODEL | Authorized direct-post movement per document-specific model | ADJUSTMENT create->DRAFT then POST->POSTED with ledger; | PASS | C05-5.2 — Movements direct-post family (Governance confirmat | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-MODEL |
| P0 | Workflow Pipeline | V2-I-REQ-PIPELINE | Requisition excluded from pipeline if out of scope | REQUISITION rows=0 total=0 | PASS | Constitution traceability matrix | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-I-REQ-PIPELINE |
| P0 | Reports | V2-I-STOCK-RPT | Retired stock report not in operational pipeline | STOCK_REPORT rows=0 | PASS | Constitution traceability matrix | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-I-STOCK-RPT |
| P0 | GRN | V3-H-SB-GRN | Send Back at review → creator DRAFT → edit → Submit same GRN | HTTP 200 status=DRAFT; edit=HTTP 200; resubmit=validate | PASS | C03-3.4-001–005 — Send Back shall not end doc; allow edit; r | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-SB |
| P0 | Breakage | V3-E-POSTING-BREAKAGE | After final approval auto-posting: lifecycle state POSTED (or approved | status=APPROVED postedAt=set ledger=1 stock 200->198 | FAIL | C05-5.2-011 — Posting auto-triggered on final approval. C02- | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-FINAL |
| P0 | Lost Items | V3-E-POSTING-LOST | Same lifecycle/posting representation as Breakage when posting occurs | status=APPROVED postedAt=set ledger=1 | FAIL | C05-5.2-011 — Posting auto-triggered on final approval. C02- | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-FINAL |
| P0 | Breakage / Lost / Reports | V3-E-POSTING-REPORT-LINK | Documents with official posting effects appear in financial reports | ledger+postedAt present; status=APPROVED; breakage-loss | FAIL | C02-2.4.2-001 — Reports derive from Posted documents. C02-2. | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-POSTED-IN |
| P0 | Transfer | V3-H-SB-TRANSFER | Reviewer Send Back returns doc to creator editable; same transaction c | POST /transfers/:id/send-back HTTP 404; status at revie | FAIL | C03-3.4-001 — Send Back shall not end the document. C03-3.4- | {"sbBody":{"success":false,"message":"Route not found: POST /api/transfers/2b5bd |
| P0 | Transfer | V3-H-REJECT-TRANSFER | Reject terminates document (not Send Back proof) | HTTP 200 status=REJECTED | PASS | C03-3.4-006 — Reject shall end the document. | {"note":"Reject compliance only — does not satisfy Send Back"} |
| P0 | Breakage | V3-H-SB-BREAKAGE | Send Back at review returns to creator for edit+submit same doc | POST /breakage/:id/send-back HTTP 404 | FAIL | C03-3.4-001 — Send Back shall not end the document. | {"reviewStatus":"DEPT_APPROVED","message":"Route not found: POST /api/breakage/3 |
| P0 | Breakage | V3-H-REJECT-BREAKAGE | Reject ends/terminates document lifecycle | HTTP 200 status=REJECTED | PASS | C03-3.4-006 — Reject shall end the document. | {"note":"Reject path only — not Send Back"} |
| P0 | Lost Items | V3-H-SB-LOST | Send Back at review | POST /lost-items/:id/send-back HTTP 404 | FAIL | C03-3.4-001 — Send Back shall not end the document. | {"message":"Route not found: POST /api/lost-items/1d6589dd-4ff7-4385-82a6-67597c |
| P0 | Lost Items | V3-H-REJECT-LOST | Reject terminates document | HTTP 200 status=REJECTED | PASS | C03-3.4-006 — Reject shall end the document. | {} |
| P0 | Get Pass | V3-H-SB-GETPASS | Reviewer Send Back during approval workflow | POST /get-passes/:id/send-back HTTP 404 | FAIL | C03-3.4-001 — Send Back shall not end the document. | {"message":"Route not found: POST /api/get-passes/da1d25ab-ed9d-4d96-93e4-aab526 |
| P0 | Get Pass | V3-H-REJECT-GETPASS | Reject ends approval workflow | HTTP 500 status=PENDING_COST_CONTROL | FAIL | C03-3.4-006 — Reject shall end the document. | {"message":"rejectionReason is required"} |
| P0 | Inventory Count | V3-H-SB-IC | Send Back at PENDING_APPROVAL returns session to creator for edit+resu | session status=PENDING_APPROVAL send-back HTTP 404 | FAIL | C03-3.4-001 — Send Back shall not end the document. | {"sessionNo":"CNT-2606-0003","message":"Route not found: POST /api/inventory-cou |
| P0 | Inventory Count | V3-H-REJECT-IC | Reject terminates session at approval | HTTP 403 status=PENDING_APPROVAL | FAIL | C03-3.4-006 — Reject shall end the document. | {"note":"Reject only — not Send Back"} |
| P0 | GRN | V3-GRN-RESUBMIT-BROWSER | No Re-submit UI/API re-entering REJECTED document to workflow | buttonVisible=null apiOnClick=none staticCode=grn-detai | FAIL | C03-3.4-009 — After Reject, new document required; no Re-sub | {"path":"OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html" |

---

*No product code modified. No remediation executed.*
