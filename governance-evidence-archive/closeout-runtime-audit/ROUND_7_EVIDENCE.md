# DX OSE — Runtime Closeout Evidence — Round 7

**Executed:** 2026-06-27  
**Harness:** `OSE-backend/scripts/closeout-runtime-audit/run-round7.js`  
**Artifacts:** `Governance/closeout-runtime-audit/`  
**API:** `http://127.0.0.1:4000/api` (live)  
**Tenant:** `grand-horizon` (Hotel A) unless noted  

Round 7 closes several Round 6 gaps (JWT contradiction, pipeline blast radius, GP grid execution, constitution per-ID tables). **Closeout is not complete** — gaps listed in §15 remain open. No product changes were made in this round.

---

## 1. Confirmed defect register

All 11 defects from Round 6 remain recorded in `DEFECT_CLASSIFICATION.md`. None were downgraded.

| # | Class | Defect | Round 7 evidence |
| - | ----- | ------ | ---------------- |
| 1 | Product | Get Pass submit without active UrUserAssignment | `GET_PASS_PERMISSION_MATRIX.json` — `submit` / `NO_ASSIGN` → HTTP **200**, DRAFT→PENDING_COST_CONTROL |
| 2 | Product | Workflow Pipeline operational read without assignment | `WORKFLOW_PIPELINE_ASSIGNMENT_SCOPE_MATRIX.json`, `STALE_FRESH_JWT_ASSIGNMENT_MATRIX.json` |
| 3 | Product | Get Pass foreign/random/not-found → HTTP 500 | Prior rounds (`GET_PASS_CROSS_TENANT_EXPANDED.json`) — not re-run in R7 |
| 4–7 | Governance | Global GP workflow GM step / 20/20 tenants / inheritance / pinned docs | Prior rounds — not re-run in R7 |
| 8–9 | Governance | Finance / ORG_MANAGER creator fast-forward without BDR | Prior rounds — not re-run in R7 |
| 10 | Operational legacy | Lost `/approve-dept` without ACC pin | **Round 5:** `LEGACY_ROUTE_CLASSIFICATION.json` lostDeepDive[0] HTTP 200. **Round 7:** sequential repro blocked HTTP 403 scope read gate — see §7 |
| 11 | Frontend legacy | Active screens depend on legacy approve ladder | `FRONTEND_LEGACY_DEPENDENCY_MATRIX.json`, `FRONTEND_LEGACY_RUNTIME_CAPTURE.json` |

---

## 2. Stale / Fresh JWT assignment matrix

**Policy (Round 7):** Any scenario producing data exposure or unauthorized mutation = **FAIL**.  
**Artifact:** `STALE_FRESH_JWT_ASSIGNMENT_MATRIX.json`  
**Totals:** 80 probes — **72 PASS**, **8 FAIL** (Round 6 contradiction resolved: stale pipeline exposure now FAIL where applicable).

### FAIL summary (8)

| Scenario | Expected | Actual | HTTP | Returned rows | Mutation | Final verdict |
| -------- | -------- | ------ | ---: | ------------: | -------- | ------------- |
| fresh_after_deactivate \| WORKFLOW_PIPELINE_READ | 403 or empty | HTTP 200 + rows | 200 | 50 | no | **FAIL** |
| fresh_after_deactivate \| GP_SUBMIT | 403 or no mutation | HTTP 200 submit | 200 | 0 | yes | **FAIL** |
| fresh_after_delete \| WORKFLOW_PIPELINE_READ | 403 or empty | HTTP 200 + rows | 200 | 50 | no | **FAIL** |
| fresh_after_delete \| GP_SUBMIT | 403 or no mutation | HTTP 200 submit | 200 | 0 | yes | **FAIL** |
| stale_after_property_move \| WORKFLOW_PIPELINE_READ | 403 or empty | HTTP 200 + rows | 200 | 50 | no | **FAIL** |
| stale_after_property_move \| GP_SUBMIT | 403 or no mutation | HTTP 200 submit | 200 | 0 | yes | **FAIL** |
| fresh_after_property_move \| WORKFLOW_PIPELINE_READ | 403 or empty | HTTP 200 + rows | 200 | 50 | no | **FAIL** |
| fresh_after_property_move \| GP_SUBMIT | 403 or no mutation | HTTP 200 submit | 200 | 0 | yes | **FAIL** |

Stale-after-deactivate/delete probes on mutations correctly return **401** (PASS). Full 80-row table: `summaryTable` in artifact.

---

## 3. Get Pass permission grid (Round 7)

**Artifact:** `GET_PASS_PERMISSION_MATRIX.json`  
**Tenant:** `grand-horizon` (fresh draft per probe)

| Metric | Count |
| ------ | ----: |
| Total probes | 139 |
| PASS | 70 |
| FAIL | 69 |
| BLOCKED | 0 |
| NOT_EXECUTED | 0 |

**Active endpoints probed (20):** create, update, submit, approve_dept, approve_cc, approve_finance, reject_cc, reject_finance, security_exit, ship_back, confirm_return_arrival, confirm_return_exit, accept_return_dept, return_damage, force_close, settlement_submit/approve/reject/cancel, delete.

**Not yet in grid (Round 7 gap):** security_entry, department_receipt, missing_return, cancel_pass, close_pass, attachment upload/delete/download authorization.

**Confirmed product signal (unchanged):** `NO_ASSIGN` + `submit` → HTTP 200 + status mutation.

**Additional product HTTP 500 surfaces in grid:** create (`.map` on undefined), update (`draftGovernance.service` invalid `User.tenantId` Prisma query).

---

## 4. Get Pass FAIL classification

**Artifact:** `GET_PASS_PERMISSION_FAIL_DETAILS_FINAL.json`  
**Total FAIL rows:** 69 — each row classified (not a count-only summary).

| Classification | Count |
| -------------- | ----: |
| Confirmed Product Defect | 7 |
| Harness Defect fixed in Round 7 | 62 |

**Confirmed Product Defect rows include:**

| ID pattern | Endpoint | HTTP | Mutation | Notes |
| ---------- | -------- | ---: | -------- | ----- |
| GP-FAIL-create-* | create | 500 | no | Handler throws `Cannot read properties of undefined (reading 'map')` |
| GP-FAIL-update-* | update | 500 | no | `draftGovernance.service` — unknown Prisma field `tenantId` on User |
| GP-FAIL-submit-NO_ASSIGN | submit | 200 | yes | Defect #1 — submit without assignment |

Remaining 62 FAIL rows are lifecycle mis-staging (logistics/settlement fixtures at wrong status), wrong-step expects, or duplicate-action probes — classified **Harness Defect fixed in Round 7** with per-row `resolution` in artifact. **Not all are re-run PASS yet** — grid still reports FAIL until fixture staging is corrected per endpoint.

---

## 5. Assignment gate route inventory

**Artifacts:** `ASSIGNMENT_GATE_ROUTE_INVENTORY_FINAL.csv`, `ASSIGNMENT_GATE_EVIDENCE_SUMMARY.json`

| Evidence type | Read routes | Mutation routes |
| ------------- | ----------: | --------------: |
| HTTP_RUNTIME | 3 | 4 |
| SERVICE_RUNTIME | 13 | 44 |
| STATIC_ONLY | 29 | **10** |

**Round 7 target not met:** 10 active mutation routes remain `STATIC_ONLY` (unverified at HTTP).  
Sensitive read routes: workflow pipeline scope probed in `WORKFLOW_PIPELINE_ASSIGNMENT_SCOPE_MATRIX.json`; reference-data GET routes largely STATIC_ONLY.

---

## 6. Workflow pipeline assignment scope

**Artifact:** `WORKFLOW_PIPELINE_ASSIGNMENT_SCOPE_MATRIX.json`  
**Probes:** 77 — **45 FAIL**, **32 PASS**

### Blast radius (confirmed)

| Dimension | Finding |
| --------- | ------- |
| Scope | Whole property (Grand Horizon operational documents) |
| Cross-tenant | No tenant IDs from other tenants in responses |
| Cross-department | Module mix (GET_PASS, GRN, INVENTORY_COUNT) — not isolated to assignee department |
| Data depth | Detail fields + IDs (not IDs-only) |
| Row volume | Up to **50** rows / `totalMeta=50` for never-assigned, deleted/inactive assignment, fresh JWT after deactivate/delete, property-move cases |

Example: `never_assigned|list` → HTTP 200, `returnedCount=50`, modules `[GET_PASS, INVENTORY_COUNT, GRN]`.

Filters/search/pagination/module/status/property/department/deep-link/count probes included in artifact rows.

---

## 7. Lost legacy chain

**Artifact:** `LOST_LEGACY_CHAIN_FINAL.json`

| Run | Route | Fixture | Actor | HTTP | Status after | ACC pin |
| --- | ----- | ------- | ----- | ---: | ------------ | ------- |
| Round 5 | POST `/lost-items/:id/approve-dept` | INTERNAL, DRAFT, no ApprovalRequest | DEPT_MANAGER_FB | **200** | DEPT_APPROVED | none |
| Round 6 sequential | same | same shape | wrong actor alignment | 403 | DRAFT | — |
| Round 7 sequential | same | same as R5 script | DEPT_MANAGER_FB + APPROVE_LOST | **403** | DRAFT | — |

**Round 7 403 message:** `Action "read" denied: document outside your department/location scope.`  
**Cause:** `getLostById` → `assertInScope(SCOPE_MODULE.LOST, …, 'read')` blocks before legacy approve path executes. Round 5 artifact (`LEGACY_ROUTE_CLASSIFICATION.json`) predates this read gate behavior or assignment scope alignment differed at capture time.

**Classification:** Defect **#10** retained from Round 5 runtime proof. Round 7 = **fixture/runtime divergence documented**, not result dropped. Sequential chain on same document did **not** complete in Round 7 (`finalClassification`: Safely blocked — chain did not start).

---

## 8. Frontend legacy dependency — runtime

**Static:** `FRONTEND_LEGACY_DEPENDENCY_MATRIX.json` — 22 rows, classification **Frontend-Dependent Operational Legacy** on breakage/lost list/detail + shared approve modal (`approveAtCurrentStep` → `/approve-dept`, `/approve-cost`, …).

**Runtime capture:** `FRONTEND_LEGACY_RUNTIME_CAPTURE.json`

| Screen | Button | Component/service | Endpoint called | Runtime request captured | Modern ACC endpoint available? |
| ------ | ------ | ----------------- | --------------- | ------------------------ | ------------------------------ |
| Lost items detail | Approve | `lost-items-detail.component.ts` | `/approve-dept` | Static path confirmed; no authenticated click captured in R7 session | POST `/lost-items/:id/approve` (ACC ApprovalRequest) |
| Breakage detail | Approve | `breakage-detail.component.ts` | `/approve-dept` | Same | POST `/breakage/:id/approve` |
| Shared approve modal | Approve | `returns-workflow-approve-modal` | legacy ladder | Same | ACC unified approve |

FE login shell reachable at `:4200`; legacy HTTP not captured without logged-in INTERNAL document workflow action.

---

## 9. Role / resource scope matrix

**Artifact:** `ROLE_RESOURCE_SCOPE_VERDICTS.json`, `ROLE_RESOURCE_SCOPE_FAILS.json`  
**Scenarios:** 226 — **OBSERVE = 0**

### Summary by resource

| Resource | Policy | Total | PASS | FAIL | BLOCKED | N/A |
| -------- | ------ | ----: | ---: | ---: | ------: | --: |
| breakage | Document-owner-scoped | 9 | 8 | 1 | 0 | 0 |
| categories | Property reference | 9 | 8 | 1 | 0 | 0 |
| dashboard | Property-wide summary | 9 | 8 | 1 | 0 | 0 |
| departments | Property reference | 27 | 26 | 1 | 0 | 0 |
| getPass | Document-owner-scoped | 9 | 8 | 1 | 0 | 0 |
| grn | Document-owner-scoped | 9 | 8 | 1 | 0 | 0 |
| inventoryCount | Document-owner-scoped | 9 | 8 | 1 | 0 | 0 |
| items | Property-shared reference | 27 | 23 | 4 | 0 | 0 |
| ledger | Location-scoped | 9 | 8 | 1 | 0 | 0 |
| locations | Property reference | 9 | 8 | 1 | 0 | 0 |
| lost | Document-owner-scoped | 9 | 8 | 1 | 0 | 0 |
| movements | Document-owner-scoped | 9 | 8 | 1 | 0 | 0 |
| stockBalances | Location-scoped | 9 | 8 | 1 | 0 | 0 |
| suppliers | Property reference | 9 | 8 | 1 | 0 | 0 |
| transfers | Document-owner-scoped | 9 | 8 | 1 | 0 | 0 |
| units | Property reference | 9 | 8 | 1 | 0 | 0 |
| workflowPipeline | Property-wide inbox | 9 | 8 | 1 | 0 | 0 |
| **Totals** | | **226** | **212** | **14** | **0** | **0** |

### FAIL detail (14 rows)

| Resource | Operation | Role | Expected scope | Actual | HTTP | Defect |
| -------- | --------- | ---- | -------------- | ------ | ---: | ------ |
| items | list | NO_ASSIGN | Property reference | count=11 | 200 | Reference data exposed without assignment |
| items | read_own_id | NO_ASSIGN | Property reference | ALLOWED | 200 | Same |
| items | read_foreign_dept_id | NO_ASSIGN | Property reference | ALLOWED_CROSS | 200 | Cross-dept item readable |
| items | read_random_id | NO_ASSIGN | Property reference | ALLOWED | 200 | Same |
| workflowPipeline | list | NO_ASSIGN | Property inbox | count=50 | 200 | Defect #2 |
| *(+ 9 resources × NO_ASSIGN list)* | list | NO_ASSIGN | *policy-specific* | operational rows | 200 | Pipeline-style exposure per resource |

Full 14 rows: `ROLE_RESOURCE_SCOPE_FAILS.json`.

---

## 10. GRN runtime matrix

**Artifact:** `GRN_RUNTIME_MATRIX_FINAL.json`

| Checklist coverage | |
| ------------------ | - |
| Covered (11) | Create, Validate, Submit, CC approval, Send Back, Reject, Finance approval, Posting probe, Duplicate submit, No assignment, Wrong role |
| Missing (15) | Edit, Resubmit, Duplicate approve/posting, No permission, Inactive assignment, Other property, Out of scope, Stale JWT, Concurrent approval, Timeline, Audit, Ledger RECEIVE, Stock delta proof, WAC |

**Not full E2E:** posting scenario returned HTTP 422 (document already POSTED in chain) — stock/ledger/WAC not proven in this artifact.

---

## 11. Transfer runtime matrix

**Artifact:** `TRANSFER_RUNTIME_MATRIX_FINAL.json`

| Covered (3) | No assignment (403), Same store (4xx), Insufficient stock (4xx) |
| Missing (19) | Create through posting E2E, reject path completion, balance deltas, audit/timeline, duplicate/concurrent, stale JWT, wrong property, etc. |

Create/submit/approve chain did not complete in Round 7 run (transfer ID path did not advance — partial harness).

---

## 12. Inventory count runtime matrix

**Artifact:** `INVENTORY_COUNT_RUNTIME_MATRIX_FINAL.json`  
**Session:** `dca4dcc2-5818-4fab-8b99-f7dccf2e68e0`

| Covered (8) | Session create, Snapshot/start, Count, Submit counts, Variance, Approval steps, Duplicate posting deny, No assignment |
| Missing (13) | Recount, +/- adjustment proof, concurrent movement, wrong role, inactive/wrong property/out of scope, timeline, audit, ledger posting, balance reconciliation |

Post endpoint not exercised successfully in R7 artifact.

---

## 13. Frontend test environment (18 files)

**Artifact:** `FRONTEND_TEST_ROUND7_RESULTS.json`  
**Path:** junction `C:\DX-OSE-Frontend` → workspace (no `&` in path)  
**Node:** v25.6.0 (nvm LTS not available on host — **Round 7 target not met**)

| File | Node | Command | Result | Root cause | Final classification |
| ---- | ---- | ------- | ------ | ---------- | -------------------- |
| verify-grn-create-runtime.mjs | v25.6.0 | node … | PASS | — | Harness PASS |
| verify-grn-detail-timeline-phase4.mjs | v25.6.0 | node … | PASS | — | Harness PASS |
| verify-grn-create-excel-layout.mjs | v25.6.0 | node … | FAIL | Playwright tab click timeout | Test / UI timing |
| verify-phase5-detail-timeline.mjs | v25.6.0 | node … | PASS | — | Harness PASS |
| verify-phase6-detail-timeline.mjs | v25.6.0 | node … | PASS | — | Harness PASS |
| verify-phase7-detail-timeline.mjs | v25.6.0 | node … | PASS | — | Harness PASS |
| measure-inventory-count-workspace-spacing.mjs | v25.6.0 | node … | PASS | — | Harness PASS |
| measure-inventory-count-detail-spacing.mjs | v25.6.0 | node … | PASS | — | Harness PASS |
| capture-acc-overview-screenshot.mjs | v25.6.0 | node … | FAIL | `#acc-overview-kpi-title` not visible | FE/ACC screen not loaded |
| grn-detail-timeline.util.spec.ts | v25.6.0 | vitest | PASS | — | Harness PASS |
| timeline-entry-render.util.spec.ts | v25.6.0 | vitest | PASS | — | Harness PASS |
| get-pass-list-display.util.spec.ts | v25.6.0 | vitest | PASS | — | Harness PASS |
| get-pass-line-outcome.util.spec.ts | v25.6.0 | vitest | PASS | — | Harness PASS |
| has-permission.directive.spec.ts | v25.6.0 | vitest | FAIL | 0 tests / import failure | Vitest environment |
| get-pass-return-validation.spec.ts | v25.6.0 | vitest | PASS | — | Harness PASS |
| app.spec.ts | v25.6.0 | vitest | FAIL | JIT compilation / 0 tests | Vitest environment |
| grn-detail.component.spec.ts | v25.6.0 | vitest | FAIL | TestBed | Test Environment Defect |
| returns-workflow-timeline.component.spec.ts | v25.6.0 | vitest | FAIL | 0 tests | Vitest environment |

**Summary:** 12 PASS / 6 FAIL (improved from Round 6: 7 PASS / 11 FAIL). Vitest component specs still fail under Node 25 + vitest 4 without `ng test` harness.

---

## 14. Constitution requirement linkage

### Failed runtime (6) — `FAILED_RUNTIME_REQUIREMENTS_ROUND7.json`

| Requirement ID | Requirement (abbrev.) | Failed scenario | Runtime evidence | Affected modules |
| -------------- | --------------------- | --------------- | ---------------- | ---------------- |
| C02-2.7-003 | Submit enters workflow | GP-submit-NO_ASSIGN HTTP 200 | GET_PASS_PERMISSION_MATRIX.json | GetPass |
| C04-4.2-001 | Evidence package permissions | Cross-tenant GP HTTP 500 | GET_PASS_CROSS_TENANT_EXPANDED.json | GetPass |
| C07-7.8-002 | Restored docs revalidated | Pipeline 50 rows no assignment | WORKFLOW_PIPELINE_ASSIGNMENT_SCOPE_MATRIX.json | WorkflowPipeline |
| C07-7.10-006 | Save/submit clean state | GP submit without scope resolver | GET_PASS_PERMISSION_MATRIX.json | GetPass |
| C08-8.5-001 | Assignment gate | Mutation without assignment | ASSIGNMENT_GATE_*, module matrices | Auth, modules |
| C08-8.6-002 | Stale JWT | Fresh JWT still reads/submits after assignment loss | STALE_FRESH_JWT_ASSIGNMENT_MATRIX.json | Auth, WorkflowPipeline, GetPass |

### Governance conflict (10) — `GOVERNANCE_CONFLICT_REQUIREMENTS_ROUND7.json`

Per-ID rows for all 10 IDs (GM workflow step, tenant inheritance, fast-forward authority, etc.) with evidence pointers to `GET_PASS_WORKFLOW_ROLLOUT_AUDIT.json`, `GET_PASS_CREATOR_FAST_FORWARD_AUTHORITY_AUDIT.json`, `GET_PASS_FINANCE_FAST_FORWARD_MATRIX_FINAL.json`.

### Partial (61) — `PARTIAL_REQUIREMENTS_ROUND7.json`

Each row lists applicable modules, modules tested, modules missing, and missing scenario classes.

### Runtime Verified Complete = 0 — `RUNTIME_VERIFIED_COMPLETE_ANALYSIS.json`

**Conclusion:** Generator does **not** promote any requirement to Runtime Verified Complete. No requirement has PASS runtime proof across **all** applicable modules; single-module PASS leaves status Partial. This is generator behavior #1, not silent completion.

---

## 15. Round 7 open gaps (closeout not complete)

| Area | Status |
| ---- | ------ |
| Get Pass grid | 69 FAIL rows; attachment/security_entry/close_pass endpoints absent; logistics fixture staging incomplete |
| Assignment gate | 10 STATIC_ONLY mutation routes |
| GRN / Transfer / IC | Checklist items missing (§10–12) |
| Lost legacy | Round 7 did not reproduce Round 5 HTTP 200; defect retained from Round 5 |
| Frontend tests | 6 FAIL; Node LTS not applied (nvm unavailable) |
| GP FAIL harness | 62 rows classified harness — not all re-run to PASS |
| Constitution | 0 Runtime Verified Complete |

---

## Artifact index (Round 7 new/updated)

| File | § |
| ---- | - |
| `DEFECT_CLASSIFICATION.md` | 1 |
| `STALE_FRESH_JWT_ASSIGNMENT_MATRIX.json` | 2 |
| `GET_PASS_PERMISSION_MATRIX.json` | 3 |
| `GET_PASS_PERMISSION_FAIL_DETAILS_FINAL.json` | 4 |
| `ASSIGNMENT_GATE_ROUTE_INVENTORY_FINAL.csv` | 5 |
| `WORKFLOW_PIPELINE_ASSIGNMENT_SCOPE_MATRIX.json` | 6 |
| `LOST_LEGACY_CHAIN_FINAL.json` | 7 |
| `FRONTEND_LEGACY_RUNTIME_CAPTURE.json` | 8 |
| `ROLE_RESOURCE_SCOPE_VERDICTS.json` / `ROLE_RESOURCE_SCOPE_FAILS.json` | 9 |
| `GRN_RUNTIME_MATRIX_FINAL.json` | 10 |
| `TRANSFER_RUNTIME_MATRIX_FINAL.json` | 11 |
| `INVENTORY_COUNT_RUNTIME_MATRIX_FINAL.json` | 12 |
| `FRONTEND_TEST_ROUND7_RESULTS.json` | 13 |
| `FAILED_RUNTIME_REQUIREMENTS_ROUND7.json` | 14 |
| `GOVERNANCE_CONFLICT_REQUIREMENTS_ROUND7.json` | 14 |
| `PARTIAL_REQUIREMENTS_ROUND7.json` | 14 |
| `RUNTIME_VERIFIED_COMPLETE_ANALYSIS.json` | 14 |
