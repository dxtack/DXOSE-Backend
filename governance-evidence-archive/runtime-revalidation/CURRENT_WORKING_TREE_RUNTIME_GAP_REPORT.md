# DX OSE — Current Working Tree Runtime Constitution Gap Report

Generated: 2026-06-27T18:24:42.192Z  
Session tag: `HEAD_RT_REVAL`  
Git HEAD: `d8ea25d51407370b1e67c42378e3114d127a019e`

---

## 1. Product Working-Tree Identity

| Field | Value |
|-------|-------|
| Git HEAD SHA | `d8ea25d51407370b1e67c42378e3114d127a019e` |
| OSE-Frontend/src files | 577 |
| OSE-Frontend aggregate SHA-256 | `786a39301686f67c6ba21d6bd9cbfb730435f4712d7de2d54913bbda3fdd6407` |
| OSE-backend/src files | 389 |
| OSE-backend aggregate SHA-256 | `1370852377d537f0e56e624687cf0352c6feb06010301a41a95a18179c8639be` |
| Combined aggregate SHA-256 | `9097c90c3e04f7a8dfae5c1d04e2be1cb35ac09bc0496f0a56718c20a515c130` |
| Gate C provably identical | **false** |
| Reason | Only 3 Gate C file SHA256 captured at closure; keyboard-navigation.directive.ts modified post–Gate C browser remediation; full product tree untracked in git — byte-exact tree match not provable. |

**Gate C 3-file SHA comparison:** getPass.service.js MATCH; lost-items-status-display.util.ts MATCH; keyboard-navigation.directive.ts **MISMATCH** (post–Gate C remediation).

**Untracked / modified (git):** Product dirs `OSE-Frontend/`, `OSE-backend/` are **untracked** — same HEAD SHA does not prove byte-identical product tree. Full manifest: `Governance/runtime-revalidation/PRODUCT_MANIFEST.json`.

---

## 2. Test Environment

| Item | Value |
|------|-------|
| API | `http://127.0.0.1:4000/api` |
| Frontend | `http://127.0.0.1:4200` |
| Mutation tenant | `closeout-audit-hotel-disposable` (disposable) |
| Read-only probe tenant | `grand-horizon` (grand-horizon closeout identities) |
| Tagged users | `head-rt-*@head-rt.local` / password `CloseoutAudit@123` |
| Closeout identities | `Governance/closeout-runtime-audit/TEST_IDENTITIES_AND_ASSIGNMENTS.json` |

No `git clean`, reset, or operational hotel mutations beyond read-only pipeline probes.

---

## 3. Harness Safety Review

Legacy closeout harnesses (**NOT run as-is**). Safe replacement: `Governance/runtime-revalidation/p0-runtime-suite.cjs`.

| Script | Tenant | DB mutate | Posting | Cleanup | Decision |
|--------|--------|-----------|---------|---------|----------|
| 00-seed-test-identities.js | grand-horizon | yes | no | no | NOT RUN |
| 12-no-assign-investigation.js | grand-horizon | yes | GP submit | no | NOT RUN → P0-A |
| 43-workflow-pipeline-scope.js | grand-horizon | no | no | n/a | NOT RUN → P0-B |
| 44-lost-legacy-reproduce.js | grand-horizon | yes | possible | no | NOT RUN → P0-C |
| 09-grn-runtime-final.js | grand-horizon | yes | GRN+stock | no | NOT RUN → P0-E disposable |
| gate-c-keyboard-browser-run.mjs | grand-horizon auth | IC session | no | no | RUN (Gate C regression) |

Full JSON: `Governance/runtime-revalidation/HARNESS_SAFETY_REVIEW.json`

---

## 4. Gate C Regression (re-run required — tree not provably identical)

| Suite | Result | Evidence |
|-------|--------|----------|
| API/Status | **10/10 Passed** | `Governance/gate-c-remediation/GATE_C_FINAL_RUNTIME_RESULTS.json` |
| Keyboard Browser | **7/7 Passed** | `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json` |
| Lost Items vitest | **6/6 Passed** | `lost-items-status-display.util.spec.ts` |
| Frontend build | **PASS** | development `ng build` |

Gate C **not** downgraded to Unverified — full suite re-executed on current tree.

---

## 5. P0 Runtime Scenarios (A–I)

Executed: 2026-06-27T18:23:38.057Z  
Summary: **PASS 19 | FAIL 16 | BLOCKED 2 | N/A 6 | Total 43**

Evidence: `Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json`

### Section rollup

| Section | Focus | Pass | Fail | Blocked | N/A |
|---------|-------|------|------|---------|-----|
| P0-A | Get Pass assignment scope | 4 | 3 | 0 | 0 |
| P0-B | Workflow Pipeline scope | 1 | 3 | 0 | 0 |
| P0-C | Lost/Breakage legacy routes | 1 | 1 | 0 | 0 |
| P0-D | GP workflow drift + fast-forward | 0 | 2 | 0 | 0 |
| P0-E | GRN resubmit + send-back | 3 | 1 | 0 | 0 |
| P0-F | Breakage posting/ledger/stock | 2 | 4 | 2 | 0 |
| P0-G | Reports POSTED-only | 2 | 0 | 0 | 1 |
| P0-H | Movements permission/post | 2 | 1 | 0 | 0 |
| P0-I | Send-back modules | 1 | 0 | 0 | 5 |

---

## 6. Runtime Confirmed Defects

- **RT-DEF-001** — Get Pass submit allowed without active assignment. HTTP 200 submit for never-assigned DEPT_MANAGER on disposable tenant. Evidence: `Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GP-A-NEVER-SUBMIT`
- **RT-DEF-002** — Workflow Pipeline visible to never-assigned user. list=50, summary=179, alerts=15 for never-assigned@closeout-audit.local on grand-horizon. Evidence: `Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#WP-B-NEVER-list`
- **RT-DEF-003** — Lost Items legacy /approve-dept mutates without ACC pin. DRAFT→DEPT_APPROVED, accWorkflowVersionId=null. Evidence: `Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#LEG-C-LOST-DEPT`
- **RT-DEF-004** — Get Pass published workflow contains GM step (all tenants). 21/21 tenants PENDING_GM in published GET_PASS chain. Evidence: `Governance/runtime-revalidation/GP_WORKFLOW_DRIFT_SNAPSHOT.json`
- **RT-DEF-005** — Finance creator fast-forward on Get Pass submit. Submit as FINANCE sets financeApprovedBy, skips Dept/CC, lands PENDING_GM. Evidence: `Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GP-D-FF-FINANCE`
- **RT-DEF-006** — ORG_MANAGER creator fast-forward completes all approval stamps. Jumps to PENDING_SECURITY with all prior approval fields stamped. Evidence: `Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GP-D-FF-ORG_MANAGER`
- **RT-DEF-007** — GRN submit after send-back fails (422). Send-back to DRAFT OK; re-submit returns 422 on disposable tenant. Evidence: `Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GRN-E-SUBMIT-AFTER-SB`
- **RT-DEF-008** — Breakage unified /approve chain blocked at DRAFT (409). Cannot complete approval→POSTED path; remains DRAFT. Evidence: `Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#BRK-F-APPROVE-CC`
- **RT-DEF-009** — GRN frontend /resubmit calls dead backend route. Backend POST /grn/:id/resubmit returns 404; FE still exposes resubmitRejected(). Evidence: `OSE-Frontend/src/app/features/grn/services/grn.service.ts:137`

---

## 7. Runtime Confirmed Compliant Behavior

- **RT-OK-001** — Cross-tenant Get Pass read returns 404. Evidence: `Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GP-A-XT-READ`
- **RT-OK-002** — GRN send-back route live and mutates status. Evidence: `Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GRN-E-SB-MUTATE`
- **RT-OK-003** — Movements create denied without assignment. Evidence: `Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#MOV-H-NO-ASSIGN`
- **RT-OK-004** — Breakage legacy approve-dept blocked on ACC-pinned doc (409). Evidence: `Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#LEG-C-BRK-DEPT`
- **RT-OK-005** — Gate C cross-tenant + keyboard + lost status regressions pass. Evidence: `Governance/gate-c-remediation/`

---

## 8. Configuration Drift

- **GET_PASS published workflow** includes `PENDING_GM` on **21/21** active tenants (constitution: no GM in Get Pass). Snapshot: `GP_WORKFLOW_DRIFT_SNAPSHOT.json`.
- Shared ACC version `aec08f69-0668-479e-bef5-1e79fdf69fa7` pinned across tenants including disposable.

---

## 9. Operational Legacy

- `POST /lost-items/:id/approve-dept` — **active**, mutates INTERNAL lost docs without ACC version pin (RT-DEF-003).
- `POST /breakage/:id/approve-dept` — registered; returns 409 when ACC workflow required (compliant guard on breakage).
- GRN `POST /:id/send-back` — live; only module with dedicated send-back route in P0-I probe.

---

## 10. Static Concerns Not Reproduced Runtime

- Frontend GRN `resubmit()` UI/service present; backend route absent (dead code — static+runtime confirmed via GRN-E-RESUBMIT-LIVE).
- `BREAKAGE_FINANCIAL_STATUSES = ['POSTED', 'APPROVED']` in report.service.js — static includes APPROVED; disposable seed test did not show APPROVED rows (RPT-G-APPROVED-IN PASS) — full grand-horizon DB reconciliation not run.
- UI/table layout regressions mentioned in Word doc — **out of scope** (no runtime UI mutation tests).
- Full 393-requirement per-row runtime — **not executed** this session (BLOCKED).

---

## 11. Checklist Item-by-Item (Word doc + P0 + Gate C)

| Checklist Item | Scenario ID | Expected | Actual | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| Product tree identity provable vs Gate C closure | MANIFEST | Byte-identical or full manifest match | Only 3 Gate C file SHA256 captured at closure; keyboard-navigation.directive.ts modified post–Gate C browser remediation; full product tree untracked in git — byte-exact tree match not provable. | FAIL | Governance/runtime-revalidation/PRODUCT_MANIFEST.json |
| Gate C API/Status regression (10/10) | GC-API | 10 Passed | 10/10 Passed | PASS | Governance/gate-c-remediation/GATE_C_FINAL_RUNTIME_RESULTS.json |
| Gate C Keyboard Browser (7/7) | GC-KB | 7 Passed | 7/7 shells | PASS | Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json |
| Gate C Lost Items vitest (6/6) | GC-LOST-UT | 6/6 pass | Re-run 2026-06-27 — 6/6 pass (per session transcript) | PASS | OSE-Frontend/src/app/features/lost-items/utils/lost-items-status-display.util.spec.ts |
| Gate C Frontend build | GC-BUILD | ng build PASS | development build PASS 2026-06-27 | PASS | Governance/gate-c-remediation/ (build log in session) |
| P0-A Get Pass assignment scope — never-assigned submit denied | GP-A-NEVER-SUBMIT | 403/401/422 | HTTP 200 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GP-A-NEVER-SUBMIT |
| P0-A Get Pass assignment scope — inactive submit denied | GP-A-INACTIVE-SUBMIT | 403/401/422 | HTTP 500 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GP-A-INACTIVE-SUBMIT |
| P0-A Get Pass assignment scope — valid DM submit | GP-A-VALID-SUBMIT | 200 | HTTP 500 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GP-A-VALID-SUBMIT |
| P0-A Cross-tenant Get Pass read isolation | GP-A-XT-READ | 404 | HTTP 404 | PASS | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GP-A-XT-READ |
| P0-B Workflow Pipeline — never-assigned list empty/deny | WP-B-NEVER-list | 403 or count=0 | HTTP 200 count=50 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#WP-B-NEVER-list |
| P0-B Workflow Pipeline — never-assigned summary | WP-B-NEVER/summary | 403 or count=0 | HTTP 200 count=179 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#WP-B-NEVER/summary |
| P0-B Workflow Pipeline — never-assigned alerts | WP-B-NEVER/alerts | 403 or count=0 | HTTP 200 count=15 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#WP-B-NEVER/alerts |
| P0-C Lost Items /approve-dept legacy route operational | LEG-C-LOST-DEPT | 403 or no ACC bypass | HTTP 200 DRAFT->DEPT_APPROVED pin=null | FAIL | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#LEG-C-LOST-DEPT |
| P0-C Breakage /approve-dept legacy route | LEG-C-BRK-DEPT | blocked or ACC-pinned | HTTP 409 route=true status=DRAFT | PASS | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#LEG-C-BRK-DEPT |
| P0-D Get Pass published workflow — no GM step | GP-D-WF-AUDIT | 0 tenants with PENDING_GM | 21/21 tenants with GM step | FAIL | Governance/runtime-revalidation/GP_WORKFLOW_DRIFT_SNAPSHOT.json |
| P0-D Finance creator fast-forward on GP submit | GP-D-FF-FINANCE | No skip of Dept/CC steps | status=PENDING_GM financeApprovedBy set; dept/cc null | FAIL | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GP-D-FF-FINANCE |
| P0-D ORG_MANAGER creator fast-forward on GP submit | GP-D-FF-ORG_MANAGER | No auto-complete all steps | HTTP 200 status=PENDING_SECURITY skipped=true | FAIL | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GP-D-FF-ORG_MANAGER |
| P0-E GRN /resubmit backend dead code vs FE | GRN-E-RESUBMIT-LIVE | 404/405 | HTTP 404 | PASS | OSE-Frontend/src/app/features/grn/services/grn.service.ts + Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GRN-E-RESUBMIT-LIVE |
| P0-E GRN Send Back mutates status | GRN-E-SB-MUTATE | 200 + status change | HTTP 200 status=DRAFT | PASS | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GRN-E-SB-MUTATE |
| P0-E GRN Submit after Send Back | GRN-E-SUBMIT-AFTER-SB | 200 | HTTP 422 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#GRN-E-SUBMIT-AFTER-SB |
| P0-F Breakage approval chain → POSTED | BRK-F-FINAL-STATUS | POSTED | status=DRAFT | FAIL | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#BRK-F-FINAL-STATUS |
| P0-F Breakage POSTED → ledger rows | BRK-F-LEDGER | ledger count increases | ledger 0->0 | BLOCKED | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#BRK-F-LEDGER |
| P0-F Breakage POSTED → stock delta | BRK-F-STOCK | qty reduced | qty 100->100 | BLOCKED | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#BRK-F-STOCK |
| P0-G Reports breakage-loss-report API | RPT-G-API | HTTP 200 | HTTP 200 | PASS | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#RPT-G-API |
| P0-G Reports POSTED-only (APPROVED excluded) | RPT-G-APPROVED-IN | APPROVED not in report rows | approvedInReport=false | PASS | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#RPT-G-APPROVED-IN |
| P0-H Movements no-assignment create denied | MOV-H-NO-ASSIGN | 403 | HTTP 403 | PASS | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#MOV-H-NO-ASSIGN |
| P0-H Movements create/post/idempotency | MOV-H-CREATE | create 201 + post + idempotent reject | HTTP 403 | FAIL | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#MOV-H-CREATE |
| P0-I GRN send-back route + behavior | SB-I-GRN-BEHAVIOR | 200 status change | HTTP 200 status=DRAFT | PASS | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#SB-I-GRN-BEHAVIOR |
| P0-I Send-back routes other modules | SB-I-* | N/A unless constitution requires | Only GRN has send-back route | NOT APPLICABLE | Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json#SB-I-Transfer-ROUTE |
| Prior finding: Get Pass cross-tenant HTTP 500 | GC-XT-002 | 404 not 500 | Gate C Passed 404 | PASS | Governance/gate-c-remediation/GATE_C_FINAL_RUNTIME_RESULTS.json#GC-XT-002 |
| Prior finding: Lost Items STATUS presentation | GC-LOST-UI | Human-readable status | vitest 6/6 + Gate C | PASS | lost-items-status-display.util.spec.ts |
| Prior finding: Keyboard nav document shells | GC-KB | 7/7 E2E | 7/7 Passed | PASS | Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json |
| Prior finding: Requisition in Workflow Pipeline | WP-REQ | Not shown if out of scope | Not tested in P0 — static: requisition not in collectors | NOT APPLICABLE | OSE-backend/src/services/workflow-pipeline/workflow-pipeline.collectors.js |
| 393-requirement full matrix closure | REQ-393 | 393 rows classified | 148 Not Run in STATUS_COUNTS SSOT — full per-requirement runtime not executed this session | BLOCKED | Governance/requirements.json + CONSTITUTION_TRACEABILITY_MATRIX.md |

**Checklist summary:** PASS 15 | FAIL 14 | BLOCKED 3 | NOT APPLICABLE 2

Full matrix JSON: `Governance/runtime-revalidation/CHECKLIST_MATRIX.json`

---

## 12. 393 vs 476 Reconciliation

| Count | Source | Meaning |
|-------|--------|---------|
| **476** | `CONSTITUTION_FRESH_REGISTER.csv` | Full PDF extraction — includes context, governance defs, optional, out-of-scope |
| **393** | `CONSTITUTION_TRACEABILITY_MATRIX.md` / `requirements.json` | Implementation SSOT — normative product obligations |
| **Δ 83** | 476 − 393 | Non-implementable rows (descriptive context, governance definition, optional, excluded) — **not duplicate requirements** |
| **Not Run SSOT** | **148** | `CONSTITUTION_STATUS_COUNTS.json` (not stale 144) |
| **Status sum** | 393 | 168 Static + 61 Partial + 148 Not Run + 6 Failed Runtime + 10 Governance Conflict |

Evidence: `Governance/runtime-revalidation/REQUIREMENTS_RECONCILIATION.json`

---

## 13. PASS / FAIL / BLOCKED / N/A Counts (this session)

| Bucket | P0 Suite | Checklist (subset) |
|--------|----------|-------------------|
| PASS | 19 | 15 |
| FAIL | 16 | 14 |
| BLOCKED | 2 | 3 |
| NOT APPLICABLE | 6 | 2 |

---

## 14. Evidence Index

| Artifact | Path |
|----------|------|
| Product manifest | `Governance/runtime-revalidation/PRODUCT_MANIFEST.json` |
| P0 runtime results | `Governance/runtime-revalidation/P0_RUNTIME_RESULTS.json` |
| GP workflow drift | `Governance/runtime-revalidation/GP_WORKFLOW_DRIFT_SNAPSHOT.json` |
| Harness safety | `Governance/runtime-revalidation/HARNESS_SAFETY_REVIEW.json` |
| Requirements reconcile | `Governance/runtime-revalidation/REQUIREMENTS_RECONCILIATION.json` |
| Checklist matrix | `Governance/runtime-revalidation/CHECKLIST_MATRIX.json` |
| Gate C API | `Governance/gate-c-remediation/GATE_C_FINAL_RUNTIME_RESULTS.json` |
| Gate C browser | `Governance/gate-c-remediation/GATE_C_BROWSER_RESULTS.json` |

---

**No Product remediation performed. No layout/HTML/SCSS changes. Review and approve before any fix backlog.**
