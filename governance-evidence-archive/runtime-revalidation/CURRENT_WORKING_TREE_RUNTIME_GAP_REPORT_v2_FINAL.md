# DX OSE — Current Working Tree Runtime Constitution Gap Report v2 FINAL

Generated: 2026-06-27T18:45:21.858Z  
Session tag: `HEAD_RT_V2`  
Executed: 2026-06-27T18:44:33.674Z  
Git HEAD: `d8ea25d51407370b1e67c42378e3114d127a019e`  
API: http://127.0.0.1:4000/api  
Disposable tenant: `closeout-audit-hotel-disposable`

---

## 1. Product Working-Tree Manifest

| Field | Value |
|-------|-------|
| Git HEAD SHA | `d8ea25d51407370b1e67c42378e3114d127a019e` |
| OSE-Frontend/src files | 577 |
| OSE-backend/src files | 389 |
| Combined aggregate SHA256 | `9097c90c3e04f7a8dfae5c1d04e2be1cb35ac09bc0496f0a56718c20a515c130` |
| Gate C provably identical | false |
| Gate C reason | Only 3 Gate C file SHA256 captured at closure; keyboard-navigation.directive.ts modified post–Gate C browser remediation; full product tree untracked in git — byte-exact tree match not provable. |
| Product trees in git | Untracked (`OSE-Frontend/`, `OSE-backend/`) — HEAD SHA does not prove byte-identical tree |

Full manifest: `Governance/runtime-revalidation/PRODUCT_MANIFEST.json`

**Note:** Manifest byte-identity limitation is **not** counted as a Product Runtime FAIL.

---

## 2. Test Tenant and Fixture Policy

| Policy | Value |
|--------|-------|
| Primary tenant | `closeout-audit-hotel-disposable` (disposable only) |
| User tag | `HEAD_RT_V2` — emails `head-rt-v2-*@head-rt-v2.local` |
| Password | `CloseoutAudit@123` |
| Fixture isolation | Independent GP document per assignment scenario; no document reused across independent scenarios |
| DB assertion | `snapshotAssignment()` before each GP/pipeline/movement test |
| Carried-forward tenant | `grand-horizon` read-only for v1-proven closeout users (pipeline carry-forward only) |
| Gate C | **Not re-run** — closure results accepted |
| Harness safety | `Governance/runtime-revalidation/HARNESS_SAFETY_REVIEW.json` |

---

## 3. Tests Retained from Valid v1 Round (Not Re-executed)

| Scenario ID | Result | Evidence |
|-------------|--------|----------|
| V2-CF-GP-NEVER-SUBMIT | FAIL | HTTP 200 submit without assignment |
| V2-CF-LEG-LOST-DEPT | FAIL | DRAFT→DEPT_APPROVED without ACC pin |
| V2-CF-GP-FF-FINANCE | **FAIL** (corrected from v1 PASS misclassification) | Finance creator skips Dept/CC → PENDING_GM |
| V2-CF-GP-FF-ORG | FAIL | ORG_MANAGER auto-stamps all steps → PENDING_SECURITY |
| V2-CF-GP-XT-READ | PASS | Cross-tenant read HTTP 404 |
| V2-CF-GRN-RESUBMIT-DEAD | PASS | Backend `/resubmit` HTTP 404 |
| V2-CF-WP-NEVER-LIST/SUMMARY/ALERTS | FAIL | grand-horizon never-assigned pipeline leak |

---

## 4. Tests Re-run After Harness v2 Fixes

| Section | Harness fix | Scenarios |
|---------|-------------|-----------|
| A | Independent GP per case + DB assignment snapshot + stale JWT | V2-A-* |
| B | Disposable tenant DB proof before pipeline/dashboard API | V2-B-* |
| C | `resolvePublishedWorkflowChain` runtime resolver | V2-C-WF-EFFECTIVE |
| D | Full GRN send-back → edit → validate → submit (not /resubmit) | V2-D-* |
| E | Submit before approve; full chain to APPROVED+ledger | V2-E-* |
| F | Product-cycle docs; ledger vs report POSTED filter | V2-F-* |
| G | FINANCE_MANAGER with ADJUSTMENT_CREATE; qtyRequested; wrong-property user | V2-G-* |
| H | Transfer body fix; reject with comment+concurrencyVersion | V2-H-* |
| I | Runtime pipeline row filter | V2-I-* |

---

## 5. Final Scenario Register (59 scenarios — each ID once)

| ID | Section | Expected | Actual | Result | Evidence |
|----|---------|----------|--------|--------|----------|
| V2-CF-GP-NEVER-SUBMIT | A | 403/401/422 submit denied | HTTP 200 submit without assignment | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-NEVER-SUBMIT (carry-forward v1) |
| V2-CF-LEG-LOST-DEPT | C-legacy | legacy blocked or ACC-pinned | HTTP 200 DRAFT->DEPT_APPROVED pin=null | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-LEG-LOST-DEPT (carry-forward v1) |
| V2-CF-GP-FF-FINANCE | D-ff | No Dept/CC skip on Finance submit | status=PENDING_GM financeApprovedBy set; dept/cc null | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-FF-FINANCE (carry-forward v1) |
| V2-CF-GP-FF-ORG | D-ff | No auto-complete all steps | HTTP 200 status=PENDING_SECURITY all stamps | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-FF-ORG (carry-forward v1) |
| V2-CF-GP-XT-READ | A | 404 cross-tenant read | HTTP 404 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-XT-READ (carry-forward v1) |
| V2-CF-GRN-RESUBMIT-DEAD | E-grn | Backend /resubmit absent | HTTP 404 on POST /grn/:id/resubmit | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GRN-RESUBMIT-DEAD (carry-forward v1) |
| V2-CF-WP-NEVER-LIST | B | 403 or empty pipeline list | HTTP 200 count=50 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-LIST (carry-forward v1) |
| V2-CF-WP-NEVER-SUMMARY | B | 403 or empty summary | HTTP 200 count=179 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-SUMMARY (carry-forward v1) |
| V2-CF-WP-NEVER-ALERTS | B | 403 or empty alerts | HTTP 200 count=15 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-ALERTS (carry-forward v1) |
| V2-A-NEVER-SUBMIT | A | 403/401/422 no status change | HTTP 200 status DRAFT->PENDING_COST_CONTROL | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-NEVER-SUBMIT |
| V2-A-INACTIVE-SUBMIT | A | 403/401/422 no status change | HTTP 200 status DRAFT->PENDING_COST_CONTROL | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-INACTIVE-SUBMIT |
| V2-A-DELETED-SUBMIT | A | 403/401/422 no status change | HTTP 200 status DRAFT->PENDING_COST_CONTROL | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-DELETED-SUBMIT |
| V2-A-WRONG-PROP-SUBMIT | A | 403/401/422 no status change | HTTP 200 status DRAFT->PENDING_COST_CONTROL | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-WRONG-PROP-SUBMIT |
| V2-A-VALID-SUBMIT | A | 200 submit success | HTTP 200 status DRAFT->PENDING_COST_CONTROL | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-VALID-SUBMIT |
| V2-A-STALE-JWT | A | 403/401/422 after assignment deactivated | HTTP 200 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-STALE-JWT |
| V2-B-NEVER-LIST | B | 403 or empty (no active assignment) | HTTP 200 count=50 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-LIST |
| V2-B-NEVER-SUMMARY | B | 403 or empty (no active assignment) | HTTP 200 count=0 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-SUMMARY |
| V2-B-NEVER-ALERTS | B | 403 or empty (no active assignment) | HTTP 200 count=15 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-ALERTS |
| V2-B-FIN-POS | B | 200 authorized finance list | HTTP 200 count=0 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-FIN-POS |
| V2-B-DASH-NEVER | B | dashboard empty or denied without assignment | HTTP 200 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-DASH-NEVER |
| V2-C-WF-EFFECTIVE | C | Constitution GP chain without GM | 21/21 effective chains contain GM; 0 tenant-specific, 21 inherit global | FAIL | Governance/runtime-revalidation/GP_EFFECTIVE_WORKFLOW_V2.json |
| V2-D-GRN-SB | D | send-back -> DRAFT | HTTP 200 status=DRAFT | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-SB |
| V2-D-GRN-EDIT | D | creator can edit DRAFT | HTTP 200 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-EDIT |
| V2-D-GRN-SUBMIT-AFTER-SB | D | validate+submit after send-back (not /resubmit) | validate HTTP 200 submit HTTP 200 status=PENDING_APPROVAL | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-SUBMIT-AFTER-SB |
| V2-D-GRN-RESUBMIT-CALL | D | /resubmit dead on backend | HTTP 404 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-RESUBMIT-CALL |
| V2-D-GRN-AUDIT | D | SEND_BACK audit; resubmit via submit not separate action | SEND_BACK,SUBMIT | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-AUDIT |
| V2-D-GRN-FE-RESUBMIT | D | Resubmit UI only on REJECTED not DRAFT-after-send-back | Static: grn-detail shows resubmitRejected only when status===REJECTED (lines 129 | PASS | OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html |
| V2-E-BRK-SUBMIT | E | submit enters approval chain | HTTP 200 status=DEPT_APPROVED | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-SUBMIT |
| V2-E-BRK-AP-CC | E | CC approve advances | HTTP 200 status=COST_CONTROL_APPROVED | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-CC |
| V2-E-BRK-AP-FIN | E | FIN approve advances | HTTP 200 status=FINANCE_APPROVED | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-FIN |
| V2-E-BRK-AP-GM | E | GM approve advances | HTTP 200 status=APPROVED | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-GM |
| V2-E-BRK-FINAL | E | Final APPROVED with postedAt + ledger + stock delta | status=APPROVED postedAt=set ledger=1 stock 200->198 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-FINAL |
| V2-E-LOST-CREATE | E | create enters workflow (DEPT_APPROVED) | status=DEPT_APPROVED | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-CREATE |
| V2-E-LOST-AP-CC | E | CC approve | HTTP 200 status=COST_CONTROL_APPROVED | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-CC |
| V2-E-LOST-AP-FIN | E | FIN approve | HTTP 200 status=FINANCE_APPROVED | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-FIN |
| V2-E-LOST-AP-GM | E | GM approve | HTTP 200 status=APPROVED | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-GM |
| V2-E-LOST-FINAL | E | Lost final APPROVED + posting | status=APPROVED postedAt=set ledger=1 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-FINAL |
| V2-E-BRK-LOST-PARITY | E | Breakage and Lost both APPROVED (not POSTED) with posting side-effects | breakage=APPROVED+ledger lost=APPROVED+ledger=1 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-LOST-PARITY |
| V2-F-RPT-BRK-APPROVED-OUT | F | APPROVED breakage with ledger in financial report OR documented POSTED-only filter | brkInReport=false ledger=1 doc=BRK-2026-00020 rows=0 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-BRK-APPROVED-OUT |
| V2-F-RPT-LOST-LEDGER-OUT | F | Lost APPROVED+ledger in loss-analysis if POSTED-only | lostInReport=false ledger=1 doc=LST-2026-00008 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-LOST-LEDGER-OUT |
| V2-F-RPT-POSTED-IN | F | Product-completed doc with ledger appears in financial report | brk=false lost=false anyLedger=2 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-POSTED-IN |
| V2-F-RPT-DRAFT-OUT | F | DRAFT not in financial report | draftInReport=false | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-DRAFT-OUT |
| V2-G-PERM-CHECK | G | FINANCE_MANAGER has ADJUSTMENT_CREATE | hasAdj=true perms=ADJUSTMENT_CREATE,ADJUSTMENT_VIEW | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-PERM-CHECK |
| V2-G-NO-ASSIGN | G | 403 no assignment | HTTP 403 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-NO-ASSIGN |
| V2-G-CREATE | G | 201/200 create adjustment | HTTP 201 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-CREATE |
| V2-G-VALIDATE | G | 422 on zero qty | HTTP 422 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-VALIDATE |
| V2-G-WRONG-SCOPE | G | 403/422 wrong property scope denied | HTTP 201 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-WRONG-SCOPE |
| V2-G-NEG-INV | G | 422 or post guard on negative outbound | HTTP 422 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-NEG-INV |
| V2-G-POST | G | post -> POSTED + ledger + stock | HTTP 200 status=POSTED ledger=1 stock 196->199 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-POST |
| V2-G-IDEMP | G | duplicate post rejected | HTTP 400 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-IDEMP |
| V2-G-MODEL | G | Movements are direct-post documents (create DRAFT then POST) | ADJUSTMENT create->DRAFT then POST->POSTED with ledger; no ACC approval chain | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-MODEL |
| V2-H-GRN | H | GRN send-back live | Covered in V2-D-GRN-SB | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-H-GRN |
| V2-H-TRANSFER-RETURN | H | Transfer reject/return mutates status | HTTP 200 status=REJECTED | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-H-TRANSFER-RETURN |
| V2-H-BRK-REJECT | H | Breakage reject returns to editable state (DRAFT or REJECTED) | HTTP 200 status=REJECTED | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-H-BRK-REJECT |
| V2-H-LOST-REJECT | H | Lost reject returns to editable state | HTTP 200 status=REJECTED | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-H-LOST-REJECT |
| V2-H-GP | H | Get Pass return lifecycle (not send-back label) | No POST /get-passes/:id/send-back; return via OUT/RETURN statuses | NOT APPLICABLE | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-H-GP |
| V2-H-IC | H | Inventory count return/reject path | Not executed — requires IC session in REVIEW; static: void/reject routes exist | BLOCKED | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-H-IC |
| V2-I-REQ-PIPELINE | I | Requisition excluded from pipeline if out of scope | REQUISITION rows=0 total=0 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-I-REQ-PIPELINE |
| V2-I-STOCK-RPT | I | Retired stock report not in operational pipeline | STOCK_REPORT rows=0 | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-I-STOCK-RPT |

---

## 6. Counts (100% from `P0_RUNTIME_V2_RESULTS.json`)

### Global rollup

| PASS | FAIL | BLOCKED | NOT APPLICABLE | Total |
|------|------|---------|----------------|-------|
| 37 | 20 | 1 | 1 | 59 |

### By section

| Section | PASS | FAIL | BLOCKED | N/A | Total |
|---------|------|------|---------|-----|-------|
| A | 2 | 6 | 0 | 0 | 8 |
| C-legacy | 0 | 1 | 0 | 0 | 1 |
| D-ff | 0 | 2 | 0 | 0 | 2 |
| E-grn | 1 | 0 | 0 | 0 | 1 |
| B | 2 | 6 | 0 | 0 | 8 |
| C | 0 | 1 | 0 | 0 | 1 |
| D | 6 | 0 | 0 | 0 | 6 |
| E | 11 | 0 | 0 | 0 | 11 |
| F | 1 | 3 | 0 | 0 | 4 |
| G | 8 | 1 | 0 | 0 | 9 |
| H | 4 | 0 | 1 | 1 | 6 |
| I | 2 | 0 | 0 | 0 | 2 |

### Checklist summary (derived from CHECKLIST_MATRIX_V2.json)

See `Governance/runtime-revalidation/CHECKLIST_MATRIX_V2.json`.

---

## 7. Runtime Confirmed Defects

- **RT-DEF-V2-001** (V2-CF-GP-NEVER-SUBMIT): HTTP 200 submit without assignment — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-NEVER-SUBMIT
- **RT-DEF-V2-002** (V2-CF-LEG-LOST-DEPT): HTTP 200 DRAFT->DEPT_APPROVED pin=null — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-LEG-LOST-DEPT
- **RT-DEF-V2-003** (V2-CF-GP-FF-FINANCE): status=PENDING_GM financeApprovedBy set; dept/cc null — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-FF-FINANCE
- **RT-DEF-V2-004** (V2-CF-GP-FF-ORG): HTTP 200 status=PENDING_SECURITY all stamps — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-FF-ORG
- **RT-DEF-V2-005** (V2-CF-WP-NEVER-LIST): HTTP 200 count=50 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-LIST
- **RT-DEF-V2-006** (V2-CF-WP-NEVER-SUMMARY): HTTP 200 count=179 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-SUMMARY
- **RT-DEF-V2-007** (V2-CF-WP-NEVER-ALERTS): HTTP 200 count=15 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-ALERTS
- **RT-DEF-V2-008** (V2-A-NEVER-SUBMIT): HTTP 200 status DRAFT->PENDING_COST_CONTROL — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-NEVER-SUBMIT
- **RT-DEF-V2-009** (V2-A-INACTIVE-SUBMIT): HTTP 200 status DRAFT->PENDING_COST_CONTROL — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-INACTIVE-SUBMIT
- **RT-DEF-V2-010** (V2-A-DELETED-SUBMIT): HTTP 200 status DRAFT->PENDING_COST_CONTROL — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-DELETED-SUBMIT
- **RT-DEF-V2-011** (V2-A-WRONG-PROP-SUBMIT): HTTP 200 status DRAFT->PENDING_COST_CONTROL — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-WRONG-PROP-SUBMIT
- **RT-DEF-V2-012** (V2-A-STALE-JWT): HTTP 200 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-STALE-JWT
- **RT-DEF-V2-013** (V2-B-NEVER-LIST): HTTP 200 count=50 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-LIST
- **RT-DEF-V2-014** (V2-B-NEVER-ALERTS): HTTP 200 count=15 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-ALERTS
- **RT-DEF-V2-015** (V2-B-DASH-NEVER): HTTP 200 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-DASH-NEVER
- **RT-DEF-V2-016** (V2-C-WF-EFFECTIVE): 21/21 effective chains contain GM; 0 tenant-specific, 21 inherit global — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-C-WF-EFFECTIVE
- **RT-DEF-V2-017** (V2-F-RPT-BRK-APPROVED-OUT): brkInReport=false ledger=1 doc=BRK-2026-00020 rows=0 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-BRK-APPROVED-OUT
- **RT-DEF-V2-018** (V2-F-RPT-LOST-LEDGER-OUT): lostInReport=false ledger=1 doc=LST-2026-00008 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-LOST-LEDGER-OUT
- **RT-DEF-V2-019** (V2-F-RPT-POSTED-IN): brk=false lost=false anyLedger=2 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-POSTED-IN
- **RT-DEF-V2-020** (V2-G-WRONG-SCOPE): HTTP 201 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-WRONG-SCOPE

**Headline defects (product behavior):**

1. **Get Pass submit ignores assignment scope** — never/inactive/deleted/wrong-property/stale-JWT users receive HTTP 200 submit (V2-A-*, V2-CF-GP-NEVER-SUBMIT).
2. **Workflow pipeline/dashboard visible without assignment** — list/alerts/metrics leak on disposable + grand-horizon (V2-B-*, V2-CF-WP-*).
3. **GET_PASS effective published workflow includes GM for 21/21 tenants** — global chain inheritance (V2-C-WF-EFFECTIVE).
4. **Creator role fast-forward on Get Pass submit** — Finance and ORG_MANAGER (V2-CF-GP-FF-*).
5. **Lost Items legacy `/approve-dept`** — mutates without ACC pin (V2-CF-LEG-LOST-DEPT).
6. **Financial reports empty for product-completed Breakage/Lost** — ledger rows exist but parent filter `status=POSTED` while final doc status is `APPROVED` (V2-F-*).
7. **Movement create not denied for wrong-property assignment** (V2-G-WRONG-SCOPE).

---

## 8. Runtime Confirmed Compliant Behavior

- **RT-OK-V2-001** (V2-A-VALID-SUBMIT): HTTP 200 status DRAFT->PENDING_COST_CONTROL — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-VALID-SUBMIT
- **RT-OK-V2-002** (V2-B-NEVER-SUMMARY): HTTP 200 count=0 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-SUMMARY
- **RT-OK-V2-003** (V2-B-FIN-POS): HTTP 200 count=0 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-FIN-POS
- **RT-OK-V2-004** (V2-D-GRN-SB): HTTP 200 status=DRAFT — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-SB
- **RT-OK-V2-005** (V2-D-GRN-EDIT): HTTP 200 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-EDIT
- **RT-OK-V2-006** (V2-D-GRN-SUBMIT-AFTER-SB): validate HTTP 200 submit HTTP 200 status=PENDING_APPROVAL — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-SUBMIT-AFTER-SB
- **RT-OK-V2-007** (V2-D-GRN-RESUBMIT-CALL): HTTP 404 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-RESUBMIT-CALL
- **RT-OK-V2-008** (V2-D-GRN-AUDIT): SEND_BACK,SUBMIT — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-AUDIT
- **RT-OK-V2-009** (V2-D-GRN-FE-RESUBMIT): Static: grn-detail shows resubmitRejected only when status===REJECTED (lines 129 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-FE-RESUBMIT
- **RT-OK-V2-010** (V2-E-BRK-SUBMIT): HTTP 200 status=DEPT_APPROVED — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-SUBMIT
- **RT-OK-V2-011** (V2-E-BRK-AP-CC): HTTP 200 status=COST_CONTROL_APPROVED — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-CC
- **RT-OK-V2-012** (V2-E-BRK-AP-FIN): HTTP 200 status=FINANCE_APPROVED — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-FIN
- **RT-OK-V2-013** (V2-E-BRK-AP-GM): HTTP 200 status=APPROVED — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-GM
- **RT-OK-V2-014** (V2-E-BRK-FINAL): status=APPROVED postedAt=set ledger=1 stock 200->198 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-FINAL
- **RT-OK-V2-015** (V2-E-LOST-CREATE): status=DEPT_APPROVED — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-CREATE
- **RT-OK-V2-016** (V2-E-LOST-AP-CC): HTTP 200 status=COST_CONTROL_APPROVED — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-CC
- **RT-OK-V2-017** (V2-E-LOST-AP-FIN): HTTP 200 status=FINANCE_APPROVED — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-FIN
- **RT-OK-V2-018** (V2-E-LOST-AP-GM): HTTP 200 status=APPROVED — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-GM
- **RT-OK-V2-019** (V2-E-LOST-FINAL): status=APPROVED postedAt=set ledger=1 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-FINAL
- **RT-OK-V2-020** (V2-E-BRK-LOST-PARITY): breakage=APPROVED+ledger lost=APPROVED+ledger=1 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-LOST-PARITY
- **RT-OK-V2-021** (V2-F-RPT-DRAFT-OUT): draftInReport=false — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-DRAFT-OUT
- **RT-OK-V2-022** (V2-G-PERM-CHECK): hasAdj=true perms=ADJUSTMENT_CREATE,ADJUSTMENT_VIEW — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-PERM-CHECK
- **RT-OK-V2-023** (V2-G-NO-ASSIGN): HTTP 403 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-NO-ASSIGN
- **RT-OK-V2-024** (V2-G-CREATE): HTTP 201 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-CREATE
- **RT-OK-V2-025** (V2-G-VALIDATE): HTTP 422 — Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-VALIDATE

**Additional compliant (carried forward):** cross-tenant GP read 404; GRN send-back→validate→submit cycle; GRN backend /resubmit dead; transfer reject return path; lost reject return; movements create/post/idempotency for authorized FINANCE_MANAGER; requisition absent from pipeline.

---

## 9. Configuration Drift

| Drift | Evidence | Result |
|-------|----------|--------|
| GET_PASS global published chain contains `PENDING_GM` | GP_EFFECTIVE_WORKFLOW_V2.json — 21/21 tenants inherit global, 0 tenant-specific overrides | FAIL |
| Global vs tenant-effective | All tenants inherit same versionId `aec08f69-...` | Effective tenant runtime = global drift |

---

## 10. Operational Legacy

| Item | Behavior | Result |
|------|----------|--------|
| Lost `POST /lost-items/:id/approve-dept` | HTTP 200 DRAFT→DEPT_APPROVED, accWorkflowVersionId=null | FAIL (defect) |
| GRN FE `resubmitRejected()` on REJECTED status | Calls dead `/resubmit` — static; send-back path uses Submit | PASS backend dead; static FE legacy on REJECTED path |
| grand-horizon closeout users in pipeline | Carried v1 evidence — not mutated in v2 | FAIL |

---

## 11. Blocked Scenarios

| ID | Reason |
|----|--------|
| V2-H-IC | Not executed — requires IC session in REVIEW; static: void/reject routes exist |

---

## 12. Static Concerns Not Proven Runtime

- GRN FE `resubmitRejected()` still references `/grn/:id/resubmit` for `REJECTED` status (V2-D-GRN-FE-RESUBMIT static PASS on send-back path).
- Inventory Count reject/return — route exists; full REVIEW-session cycle not executed (V2-H-IC BLOCKED).
- 393-requirement matrix — 148 requirements `Not Run` in CONSTITUTION_STATUS_COUNTS SSOT.
- Product manifest / Gate C byte-identity not provable for full untracked trees.

---

## 13. Checklist (Item by Item)

| # | Item | Scenario | Result | Evidence |
|---|------|----------|--------|----------|
| 1 | Product tree identity (manifest) | — | FAIL | Governance/runtime-revalidation/PRODUCT_MANIFEST.json |
| 2 | Gate C API regression (accepted closed — not re-run) | — | PASS | Governance/gate-c-remediation/GATE_C_FINAL_RUNTIME_RESULTS.json |
| 3 | Gate C keyboard / lost status / build (accepted closed) | — | PASS | Governance/gate-c-remediation/ |
| 4 | GP never-assigned submit denied | V2-CF-GP-NEVER-SUBMIT | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-NEVER-SUBMIT |
| 5 | GP assignment scope v2 (independent docs + DB snap) | V2-A-* | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-NEVER-SUBMIT |
| 6 | GP cross-tenant read 404 | V2-CF-GP-XT-READ | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-XT-READ |
| 7 | Workflow pipeline never-assigned scope (disposable DB proof) | V2-B-* | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-LIST |
| 8 | Effective GET_PASS workflow via runtime resolver | V2-C-WF-EFFECTIVE | FAIL | Governance/runtime-revalidation/GP_EFFECTIVE_WORKFLOW_V2.json |
| 9 | Finance creator GP fast-forward (FAIL not PASS) | V2-CF-GP-FF-FINANCE | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-FF-FINANCE |
| 10 | ORG_MANAGER creator GP fast-forward | V2-CF-GP-FF-ORG | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-FF-ORG |
| 11 | Lost legacy /approve-dept | V2-CF-LEG-LOST-DEPT | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-LEG-LOST-DEPT |
| 12 | GRN send-back full cycle (validate+submit) | V2-D-GRN-SUBMIT-AFTER-SB | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-SUBMIT-AFTER-SB |
| 13 | GRN /resubmit backend dead vs FE | V2-CF-GRN-RESUBMIT-DEAD | PASS | OSE-Frontend/src/app/features/grn/services/grn.service.ts:137 |
| 14 | Breakage/Lost full workflow + posting | V2-E-* | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-FINAL |
| 15 | Reports financial visibility for completed docs | V2-F-* | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-POSTED-IN |
| 16 | Movements authorized create/post/idempotency | V2-G-CREATE | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-POST |
| 17 | Movements property scope denial | V2-G-WRONG-SCOPE | FAIL | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-WRONG-SCOPE |
| 18 | Send-back/return cross-module | V2-H-* | BLOCKED | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-H-TRANSFER-RETURN |
| 19 | Requisition excluded from pipeline | V2-I-REQ-PIPELINE | PASS | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-I-REQ-PIPELINE |
| 20 | 393-requirement full matrix runtime closure | REQ-393 | BLOCKED | Governance/closeout-runtime-audit/CONSTITUTION_STATUS_COUNTS.json |

---

## 14. 393 vs 476 Mapping

| Metric | Value |
|--------|-------|
| Fresh register (476) | 476 rows — `Governance/constitution-extraction/CONSTITUTION_FRESH_REGISTER.csv` |
| Implementation SSOT (393) | 393 — `Governance/requirements.json` / traceability matrix |
| Overlap (fresh_id match) | 277 |
| Exclusive to 476 | 199 rows |
| Exclusive to 393 | 116 register entries |
| **Net delta (476−393)** | **83** (= 199 − 116) |

**476-only row types:** {"Descriptive Context":76,"Governance Definition":30,"Out of Scope":23,"Non-implementable extraction row":16,"Duplicate or consolidated into 393 register":48,"Optional":6}

Full row-by-row mapping: `Governance/runtime-revalidation/REQUIREMENTS_476_393_MAPPING.json` (199 fresh-only + 116 register-only rows documented).

**Parser correction:** Prior reconcile script used CSV column `Category` (wrong) → all `Unknown=476`. v2 mapping uses `category_bucket` with verified net delta reconciled to 83.

---

## 15. Evidence Paths

| Artifact | Path |
|----------|------|
| v2 runtime results | `Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json` |
| v2 harness | `Governance/runtime-revalidation/p0-runtime-suite-v2.cjs` |
| v2 helpers | `Governance/runtime-revalidation/lib/v2-helpers.cjs` |
| Effective GP workflow | `Governance/runtime-revalidation/GP_EFFECTIVE_WORKFLOW_V2.json` |
| 393/476 mapping | `Governance/runtime-revalidation/REQUIREMENTS_476_393_MAPPING.json` |
| Checklist v2 | `Governance/runtime-revalidation/CHECKLIST_MATRIX_V2.json` |
| Gate C (reference) | `Governance/gate-c-remediation/GATE_C_FINAL_RUNTIME_RESULTS.json` |

---

## Priority Table (All Scenarios)

| Priority | Module | Scenario ID | Expected | Actual | Result | Constitution authority | Evidence |
| -------- | ------ | ----------- | -------- | ------ | ------ | ---------------------- | -------- |
| P0 | Get Pass | V2-CF-GP-NEVER-SUBMIT | 403/401/422 submit denied | HTTP 200 submit without assignment | FAIL | ACC §4 — assignment-scoped operational permission | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-NEVER-SUBMIT (carry-forward v1) |
| P0 | Lost Items (legacy) | V2-CF-LEG-LOST-DEPT | legacy blocked or ACC-pinned | HTTP 200 DRAFT->DEPT_APPROVED pin=null | FAIL | ACC-pinned unified approval — legacy route must not bypass | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-LEG-LOST-DEPT (carry-forward v1) |
| P0 | Get Pass (creator fast-forward) | V2-CF-GP-FF-FINANCE | No Dept/CC skip on Finance submit | status=PENDING_GM financeApprovedBy set; dept/cc null | FAIL | Get Pass workflow — no creator role fast-forward | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-FF-FINANCE (carry-forward v1) |
| P0 | Get Pass (creator fast-forward) | V2-CF-GP-FF-ORG | No auto-complete all steps | HTTP 200 status=PENDING_SECURITY all stamps | FAIL | Get Pass workflow — no creator role fast-forward | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-FF-ORG (carry-forward v1) |
| P0 | Get Pass | V2-CF-GP-XT-READ | 404 cross-tenant read | HTTP 404 | PASS | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GP-XT-READ (carry-forward v1) |
| P0 | GRN (dead code) | V2-CF-GRN-RESUBMIT-DEAD | Backend /resubmit absent | HTTP 404 on POST /grn/:id/resubmit | PASS | Lifecycle — resubmit via submit not dead route | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-GRN-RESUBMIT-DEAD (carry-forward v1) |
| P0 | Workflow Pipeline / Dashboard | V2-CF-WP-NEVER-LIST | 403 or empty pipeline list | HTTP 200 count=50 | FAIL | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-LIST (carry-forward v1) |
| P0 | Workflow Pipeline / Dashboard | V2-CF-WP-NEVER-SUMMARY | 403 or empty summary | HTTP 200 count=179 | FAIL | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-SUMMARY (carry-forward v1) |
| P0 | Workflow Pipeline / Dashboard | V2-CF-WP-NEVER-ALERTS | 403 or empty alerts | HTTP 200 count=15 | FAIL | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-CF-WP-NEVER-ALERTS (carry-forward v1) |
| P0 | Get Pass | V2-A-NEVER-SUBMIT | 403/401/422 no status change | HTTP 200 status DRAFT->PENDING_COST_CONTROL | FAIL | ACC §4 — assignment-scoped operational permission | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-NEVER-SUBMIT |
| P0 | Get Pass | V2-A-INACTIVE-SUBMIT | 403/401/422 no status change | HTTP 200 status DRAFT->PENDING_COST_CONTROL | FAIL | ACC §4 — assignment-scoped operational permission | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-INACTIVE-SUBMIT |
| P0 | Get Pass | V2-A-DELETED-SUBMIT | 403/401/422 no status change | HTTP 200 status DRAFT->PENDING_COST_CONTROL | FAIL | ACC §4 — assignment-scoped operational permission | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-DELETED-SUBMIT |
| P0 | Get Pass | V2-A-WRONG-PROP-SUBMIT | 403/401/422 no status change | HTTP 200 status DRAFT->PENDING_COST_CONTROL | FAIL | ACC §4 — assignment-scoped operational permission | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-WRONG-PROP-SUBMIT |
| P0 | Get Pass | V2-A-VALID-SUBMIT | 200 submit success | HTTP 200 status DRAFT->PENDING_COST_CONTROL | PASS | ACC §4 — assignment-scoped operational permission | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-VALID-SUBMIT |
| P0 | Get Pass | V2-A-STALE-JWT | 403/401/422 after assignment deactivated | HTTP 200 | FAIL | ACC §4 — assignment-scoped operational permission | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-A-STALE-JWT |
| P0 | Workflow Pipeline / Dashboard | V2-B-NEVER-LIST | 403 or empty (no active assignment) | HTTP 200 count=50 | FAIL | ACC §4 — scope-bound workflow visibility | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-LIST |
| P0 | Workflow Pipeline / Dashboard | V2-B-NEVER-SUMMARY | 403 or empty (no active assignment) | HTTP 200 count=0 | PASS | ACC §4 — scope-bound workflow visibility | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-SUMMARY |
| P0 | Workflow Pipeline / Dashboard | V2-B-NEVER-ALERTS | 403 or empty (no active assignment) | HTTP 200 count=15 | FAIL | ACC §4 — scope-bound workflow visibility | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-NEVER-ALERTS |
| P0 | Workflow Pipeline / Dashboard | V2-B-FIN-POS | 200 authorized finance list | HTTP 200 count=0 | PASS | ACC §4 — scope-bound workflow visibility | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-FIN-POS |
| P0 | Workflow Pipeline / Dashboard | V2-B-DASH-NEVER | dashboard empty or denied without assignment | HTTP 200 | FAIL | ACC §4 — scope-bound workflow visibility | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-B-DASH-NEVER |
| P0 | Workflow Config | V2-C-WF-EFFECTIVE | Constitution GP chain without GM | 21/21 effective chains contain GM; 0 tenant-specific, 21 inh | FAIL | ACC §4 — scope-bound workflow visibility | Governance/runtime-revalidation/GP_EFFECTIVE_WORKFLOW_V2.json |
| P0 | GRN | V2-D-GRN-SB | send-back -> DRAFT | HTTP 200 status=DRAFT | PASS | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-SB |
| P0 | GRN | V2-D-GRN-EDIT | creator can edit DRAFT | HTTP 200 | PASS | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-EDIT |
| P0 | GRN | V2-D-GRN-SUBMIT-AFTER-SB | validate+submit after send-back (not /resubmit) | validate HTTP 200 submit HTTP 200 status=PENDING_APPROVAL | PASS | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-SUBMIT-AFTER-SB |
| P0 | GRN | V2-D-GRN-RESUBMIT-CALL | /resubmit dead on backend | HTTP 404 | PASS | Lifecycle — resubmit via submit not dead route | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-RESUBMIT-CALL |
| P0 | GRN | V2-D-GRN-AUDIT | SEND_BACK audit; resubmit via submit not separate action | SEND_BACK,SUBMIT | PASS | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-D-GRN-AUDIT |
| P0 | GRN | V2-D-GRN-FE-RESUBMIT | Resubmit UI only on REJECTED not DRAFT-after-send-back | Static: grn-detail shows resubmitRejected only when status== | PASS | Breakage/Lost — approval posting parity | OSE-Frontend/src/app/features/grn/grn-detail/grn-detail.component.html |
| P0 | Breakage / Lost | V2-E-BRK-SUBMIT | submit enters approval chain | HTTP 200 status=DEPT_APPROVED | PASS | Breakage/Lost — approval posting parity | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-SUBMIT |
| P0 | Breakage / Lost | V2-E-BRK-AP-CC | CC approve advances | HTTP 200 status=COST_CONTROL_APPROVED | PASS | Breakage/Lost — approval posting parity | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-CC |
| P0 | Breakage / Lost | V2-E-BRK-AP-FIN | FIN approve advances | HTTP 200 status=FINANCE_APPROVED | PASS | Breakage/Lost — approval posting parity | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-FIN |
| P0 | Breakage / Lost | V2-E-BRK-AP-GM | GM approve advances | HTTP 200 status=APPROVED | PASS | Breakage/Lost — approval posting parity | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-AP-GM |
| P0 | Breakage / Lost | V2-E-BRK-FINAL | Final APPROVED with postedAt + ledger + stock delta | status=APPROVED postedAt=set ledger=1 stock 200->198 | PASS | Breakage/Lost — approval posting parity | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-FINAL |
| P0 | Breakage / Lost | V2-E-LOST-CREATE | create enters workflow (DEPT_APPROVED) | status=DEPT_APPROVED | PASS | Breakage/Lost — approval posting parity | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-CREATE |
| P0 | Breakage / Lost | V2-E-LOST-AP-CC | CC approve | HTTP 200 status=COST_CONTROL_APPROVED | PASS | Breakage/Lost — approval posting parity | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-CC |
| P0 | Breakage / Lost | V2-E-LOST-AP-FIN | FIN approve | HTTP 200 status=FINANCE_APPROVED | PASS | Breakage/Lost — approval posting parity | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-FIN |
| P0 | Breakage / Lost | V2-E-LOST-AP-GM | GM approve | HTTP 200 status=APPROVED | PASS | Breakage/Lost — approval posting parity | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-AP-GM |
| P0 | Breakage / Lost | V2-E-LOST-FINAL | Lost final APPROVED + posting | status=APPROVED postedAt=set ledger=1 | PASS | Breakage/Lost — approval posting parity | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-LOST-FINAL |
| P0 | Breakage / Lost | V2-E-BRK-LOST-PARITY | Breakage and Lost both APPROVED (not POSTED) with posting side-effects | breakage=APPROVED+ledger lost=APPROVED+ledger=1 | PASS | Breakage/Lost — approval posting parity | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-E-BRK-LOST-PARITY |
| P0 | Reports | V2-F-RPT-BRK-APPROVED-OUT | APPROVED breakage with ledger in financial report OR documented POSTED-only filter | brkInReport=false ledger=1 doc=BRK-2026-00020 rows=0 | FAIL | Financial reports — posted/completed transactions visible | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-BRK-APPROVED-OUT |
| P0 | Reports | V2-F-RPT-LOST-LEDGER-OUT | Lost APPROVED+ledger in loss-analysis if POSTED-only | lostInReport=false ledger=1 doc=LST-2026-00008 | FAIL | Financial reports — posted/completed transactions visible | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-LOST-LEDGER-OUT |
| P0 | Reports | V2-F-RPT-POSTED-IN | Product-completed doc with ledger appears in financial report | brk=false lost=false anyLedger=2 | FAIL | Financial reports — posted/completed transactions visible | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-POSTED-IN |
| P0 | Reports | V2-F-RPT-DRAFT-OUT | DRAFT not in financial report | draftInReport=false | PASS | Financial reports — posted/completed transactions visible | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-F-RPT-DRAFT-OUT |
| P0 | Movements | V2-G-PERM-CHECK | FINANCE_MANAGER has ADJUSTMENT_CREATE | hasAdj=true perms=ADJUSTMENT_CREATE,ADJUSTMENT_VIEW | PASS | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-PERM-CHECK |
| P0 | Movements | V2-G-NO-ASSIGN | 403 no assignment | HTTP 403 | PASS | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-NO-ASSIGN |
| P0 | Movements | V2-G-CREATE | 201/200 create adjustment | HTTP 201 | PASS | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-CREATE |
| P0 | Movements | V2-G-VALIDATE | 422 on zero qty | HTTP 422 | PASS | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-VALIDATE |
| P0 | Movements | V2-G-WRONG-SCOPE | 403/422 wrong property scope denied | HTTP 201 | FAIL | ACC §4 — property scope on movement create | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-WRONG-SCOPE |
| P0 | Movements | V2-G-NEG-INV | 422 or post guard on negative outbound | HTTP 422 | PASS | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-NEG-INV |
| P0 | Movements | V2-G-POST | post -> POSTED + ledger + stock | HTTP 200 status=POSTED ledger=1 stock 196->199 | PASS | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-POST |
| P0 | Movements | V2-G-IDEMP | duplicate post rejected | HTTP 400 | PASS | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-IDEMP |
| P0 | Movements | V2-G-MODEL | Movements are direct-post documents (create DRAFT then POST) | ADJUSTMENT create->DRAFT then POST->POSTED with ledger; no A | PASS | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-G-MODEL |
| P0 | Send-back / Return | V2-H-GRN | GRN send-back live | Covered in V2-D-GRN-SB | PASS | Document lifecycle — return/reject to creator | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-H-GRN |
| P0 | Send-back / Return | V2-H-TRANSFER-RETURN | Transfer reject/return mutates status | HTTP 200 status=REJECTED | PASS | Document lifecycle — return/reject to creator | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-H-TRANSFER-RETURN |
| P0 | Send-back / Return | V2-H-BRK-REJECT | Breakage reject returns to editable state (DRAFT or REJECTED) | HTTP 200 status=REJECTED | PASS | Document lifecycle — return/reject to creator | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-H-BRK-REJECT |
| P0 | Send-back / Return | V2-H-LOST-REJECT | Lost reject returns to editable state | HTTP 200 status=REJECTED | PASS | Document lifecycle — return/reject to creator | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-H-LOST-REJECT |
| P0 | Send-back / Return | V2-H-GP | Get Pass return lifecycle (not send-back label) | No POST /get-passes/:id/send-back; return via OUT/RETURN sta | NOT APPLICABLE | Document lifecycle — return/reject to creator | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-H-GP |
| P0 | Send-back / Return | V2-H-IC | Inventory count return/reject path | Not executed — requires IC session in REVIEW; static: void/r | BLOCKED | Document lifecycle — return/reject to creator | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-H-IC |
| P0 | Workflow Pipeline (Requisition) | V2-I-REQ-PIPELINE | Requisition excluded from pipeline if out of scope | REQUISITION rows=0 total=0 | PASS | ACC §4 — scope-bound workflow visibility | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-I-REQ-PIPELINE |
| P0 | Workflow Pipeline (Requisition) | V2-I-STOCK-RPT | Retired stock report not in operational pipeline | STOCK_REPORT rows=0 | PASS | Constitution traceability matrix / module workflow contract | Governance/runtime-revalidation/P0_RUNTIME_V2_RESULTS.json#V2-I-STOCK-RPT |

---

*End of report. No remediation executed. No product code modified.*
