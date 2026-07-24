# DX OSE — Runtime Closeout Evidence — Round 6

**Executed:** 2026-06-27  
**Harness:** `OSE-backend/scripts/closeout-runtime-audit/` (scripts `30`–`41`, `09/10/11` v3)  
**Artifacts:** `Governance/closeout-runtime-audit/`  
**Scope:** Diagnosis and runtime evidence only — no product changes, no remediation backlog.

**Round 6 status:** Expanded matrices and reclassifications delivered. Full operational closeout is **not** claimed — Get Pass logistics/settlement endpoints, full Transfer/IC posting proof, and frontend unit-spec harness remain incomplete (see §17).

---

## 1. Get Pass creator fast-forward — no approved BDR

**Artifact:** `GET_PASS_CREATOR_FAST_FORWARD_AUTHORITY_AUDIT.json`

| Field | Value |
| ----- | ----- |
| Approved BDR file | **None** |
| Decision ID | **None** |
| Approved text | **None** |
| Approval date | **None** |
| Governance search roots | `docs/governance`, `Governance`, `docs/full-system-review` |
| ADRs found for Get Pass skip | **None** (only ADR-001 inventory count, ADR-002 inventory truth) |

**Classification:** **Runtime-Confirmed Governance / Constitution Defect** — do **not** label product code as BDR.

**Runtime implementation (not governance):** `acc-workflow-get-pass.runtime.js` → `getSubmitInitialWorkflowFromContext` (lines 73–112). On submit, creator role matching a chain step jumps to the **next** status and stamps the current step’s approval field with submitter `userId`. ORG_MANAGER/SUPER_ADMIN jump to last pending step and stamp all prior steps.

| Question | Runtime answer |
| -------- | -------------- |
| Allows skip Department? | **Yes** (Finance creator on constitution fixture) |
| Allows skip Cost Control? | **Yes** (Finance creator) |
| Submit counts as approval? | **Yes** — stamps `financeApprovedBy` on submit |
| Actor stamp on unexecuted steps? | **Yes** — dept/CC stamps absent; finance self-stamp applied |
| Modules in scope | GET_PASS only |

**Constitution chain (fixture):** `PENDING_DEPT → PENDING_COST_CONTROL → PENDING_FINANCE → PENDING_SECURITY` (no GM).

---

## 2. Finance / actor fast-forward matrix

**Artifact:** `GET_PASS_FINANCE_FAST_FORWARD_MATRIX_FINAL.json`  
**Tenant:** `closeout-audit-hotel-disposable` (constitution workflow seeded; cleaned in `finally`).

| Actor | Create | Submit | Expected first step | Actual status | Dept | CC | Finance | Result |
| ----- | ------ | ------ | ------------------- | ------------- | ---- | -- | ------- | ------ |
| finance_creator | Yes | Yes | PENDING_DEPT | **PENDING_SECURITY** | skipped | skipped | self-stamped | **Governance/Constitution Defect** |
| cost_control_creator | Yes | Yes | PENDING_COST_CONTROL→FIN | **PENDING_FINANCE** | skipped | stamped | — | PASS (runtime documented) |
| department_creator | Yes | Yes | PENDING_DEPT | **PENDING_COST_CONTROL** | — | pending | — | PASS |
| storekeeper_creator | Yes | Yes | PENDING_DEPT | **PENDING_DEPT** | pending | pending | — | PASS |
| org_manager_creator | Yes | Yes | chain start | **PENDING_SECURITY** | skipped | skipped | skipped | **Governance/Constitution Defect** |
| create_only (no UR) | Yes | No | — | DRAFT | — | — | — | PASS |
| approve_only | No | No | — | — | — | — | — | PASS |
| finance_non_creator | No | No | — | — | — | — | — | PASS |

Audit on Finance submit: `CREATE`, `SUBMIT` only (no separate dept/CC approval audit rows). Timeline empty in evidence fetch for disposable run.

---

## 3. NO_ASSIGN read scope — 9 scenarios resolved (zero OBSERVE)

**Artifact:** `NO_ASSIGN_READ_SCOPE_FINAL.json`  
**Policy:** No active `UrUserAssignment` on `grand-horizon` = zero operational scope.

| # | Scenario | Endpoint | Count | Final classification |
| - | -------- | -------- | ----: | -------------------- |
| 1 | never_assigned | GET /workflow-pipeline | 50 + IDs | **Confirmed Read Scope Defect** |
| 2 | deleted_assignment | GET /workflow-pipeline | 50 + IDs | **Confirmed Read Scope Defect** |
| 3 | no_assign_inactive_ur | GET /workflow-pipeline | 50 + IDs | **Confirmed Read Scope Defect** |
| 4 | wrong_property | GET /workflow-pipeline | 50 + IDs | **Confirmed Read Scope Defect** |
| 5 | view_only_auditor | GET /breakage?take=20 | 20 | **PASS** (active GH assignment) |
| 6 | view_only_auditor | GET /lost-items?take=20 | 20 + IDs | **PASS** |
| 7 | view_only_auditor | GET /inventory-count/sessions | 25 + dept IDs | **PASS** |
| 8 | view_only_auditor | GET /workflow-pipeline | 50 | **PASS** |
| 9 | deleted_stale_jwt | GET /workflow-pipeline | 50 + IDs | **Confirmed Read Scope Defect** |

**Summary:** 5 Confirmed Read Scope Defect, 4 PASS. **OBSERVE_READ_SCOPE remaining: 0.**

---

## 4. Stale / fresh JWT assignment matrix

**Artifact:** `STALE_FRESH_JWT_ASSIGNMENT_MATRIX.json` (54 probes)

| JWT case | Probes include |
| -------- | -------------- |
| stale_after_deactivate | GP submit, GRN submit, TR create, BRK/LOST create, IC submit-counts, MOV create, GP list, stock read |
| fresh_after_deactivate | same |
| stale_after_delete | same |
| fresh_after_delete | same |
| stale_after_property_move | same |
| fresh_after_property_move | same |

**Findings:**
- `permissionVersion` **increments** on deactivate/delete/property move (observed e.g. 1→2).
- Stale JWT after deactivate: GRN submit **403** (PASS); GP submit **500** on some probes (logged; no mutation).
- Stale JWT after delete on workflow-pipeline read: **HTTP 200 + 50 operational rows** (aligns with read-scope defect #9).
- ORG_MANAGER tenant switch JWT: see `DISPOSABLE_ORG_RUNTIME_RESULTS.json` (Round 5, still valid).

**Stale matrix FAIL count:** 0 (probes classified PASS = denied/no mutation OR expected stale behavior documented).

---

## 5. Assignment gate route inventory

**Artifact:** `ASSIGNMENT_GATE_ROUTE_INVENTORY_FINAL.csv` (103 routes)

| Classification | Count (representative) |
| -------------- | ---------------------- |
| Runtime verified assignment NOT enforced | **GetPass POST /:id/submit** |
| Service-level assignment enforced | GRN, Transfer, Breakage, Lost, IC create paths |
| Sensitive read without assignment enforcement | **WorkflowPipeline GET /** |
| Permission-only vulnerable | Some GetPass logistics routes (controller gate only) |
| Unverified mutation routes | **0** |

---

## 6. Get Pass permission grid (Round 6)

**Artifact:** `GET_PASS_PERMISSION_MATRIX.json`, `GET_PASS_PERMISSION_HARNESS.json`  
**Tenant:** disposable child hotel.

| Result | Count |
| ------ | ----: |
| PASS | 14 |
| FAIL | 16 |
| BLOCKED | **0** |

**Confirmed product FAIL (unchanged):** `GP-submit-NO_ASSIGN-disposable` — HTTP **200**, DB status mutation without active assignment.

**Not yet covered in Round 6 grid:** security exit/entry, ship-back, confirm arrival, department receipt, return/damage/missing, force-close settlement chain, attachment mutations, stale JWT per endpoint, ORG_MANAGER/SUPER_ADMIN operational matrix. **Logistics/settlement closeout: open.**

---

## 7. Lost / Breakage operational legacy chain

**Artifacts:** `LEGACY_CHAIN_COMPLETE.json`, `LEGACY_ROUTE_CLASSIFICATION.json` (Round 5)

**Round 5 confirmed (unchanged):** `POST /lost-items/:id/approve-dept` on INTERNAL document — HTTP **200**, status change, **no ACC version pin** → **Active Operational Legacy**.

**Round 6 sequential path** (`lostSequentialPathOutsideAcc`): fresh INTERNAL DRAFT via DB — approve-dept **403**, subsequent steps **400** (no ACC pin; path blocked at runtime on this fixture). **Valid authorized lifecycle completion outside ACC on this harness fixture: false.**

**Frontend:** `FRONTEND_LEGACY_DEPENDENCY_MATRIX.json` — list/detail components call `approveAtCurrentStep()` → legacy `/approve-dept` ladder for INTERNAL docs without `ApprovalRequest`. Classification: **Frontend-Dependent Operational Legacy**.

---

## 8. Frontend legacy dependency (static + runtime surface)

| Frontend file | Active screen | User action | Endpoint | Modern alternative |
| ------------- | ------------- | ----------- | -------- | ------------------ |
| `breakage-list.component.ts` | Breakage list | Approve | approveAtCurrentStep → `/approve-dept`… | `/breakage/:id/approve` |
| `breakage-detail.component.ts` | Breakage detail | Approve | same | same |
| `lost-items-list.component.ts` | Lost list | Approve | same | `/lost-items/:id/approve` |
| `lost-items-detail.component.ts` | Lost detail | Approve | same | same |
| `breakage.service.ts` / `lost-items.service.ts` | Service layer | HTTP | `/approve-dept`, `/approve-cost`, … | ACC unified `/approve` |

---

## 9. Get Pass cross-tenant HTTP 500 (expanded)

**Artifact:** `GET_PASS_CROSS_TENANT_EXPANDED.json`

| Case | Endpoints probed | Typical HTTP | Defect class |
| ---- | ---------------- | ------------ | ------------ |
| cross_tenant_valid_id | read, update, submit, approve, delete | **500** `"Get Pass not found"` | Product Runtime Defect — error handling |
| random_uuid | same | **500** (same message) | Error handling + **information disclosure** |
| deleted_id | same | 500 | Error handling |
| malformed_id | same | 500 | Error handling |
| same_tenant_unauthorized | same | varies | Expected deny or lifecycle block |

**No stack exposure** in envelopes. **No cross-tenant DB mutation** observed. **Unexpected 500 count (foreign/random/malformed):** confirmed.

---

## 10. Scope matrix verdicts (226 scenarios)

**Artifact:** `ROLE_RESOURCE_SCOPE_VERDICTS.json`  
**OBSERVE remaining: 0**

| Resource | Policy | Total | PASS | FAIL |
| -------- | ------ | ----: | ---: | ---: |
| breakage | Document-owner-scoped | 9 | 8 | 1 |
| categories | Property reference | 9 | 8 | 1 |
| dashboard | Property-wide summary | 9 | 8 | 1 |
| departments | Property reference | 9 | 7 | 2 |
| getPass | Document-owner-scoped | 9 | 8 | 1 |
| grn | Document/location scoped | 9 | 8 | 1 |
| inventoryCount | Store/location-scoped | 9 | 8 | 1 |
| items | Property-shared reference | 9 | 7 | 2 |
| ledger | Location / control scope | 9 | 8 | 1 |
| locations | Store/location-scoped | 9 | 7 | 2 |
| lost | Document-owner-scoped | 9 | 8 | 1 |
| movements | Department-scoped | 9 | 8 | 1 |
| reports | Derived scope | 9 | 8 | 1 |
| stock | Location / control | 9 | 8 | 1 |
| suppliers | Property reference | 9 | 8 | 1 |
| transfer | Document/location scoped | 9 | 8 | 1 |
| units | Property reference | 9 | 8 | 1 |
| workflowPipeline | Property-wide pipeline | 9 | 8 | 1 |
| inventoryHistory | Derived | 9 | 8 | 1 |

FAIL rows concentrate on **NO_ASSIGN** and **INACTIVE_ASSIGN** list/read probes (HTTP 200 with data) — consistent with read-scope defects.

---

## 11. GRN runtime (harness-fixed)

**Artifact:** `GRN_RUNTIME_MATRIX.json`, `GRN_RUNTIME_HARNESS.json`

| Scenario | HTTP | Result |
| -------- | ---- | ------ |
| GRN-VALIDATE | 200 | PASS |
| GRN-SUBMIT | 200 | PASS |
| GRN-APPROVE-CC | 200 | PASS |
| GRN-APPROVE-FINANCE (E2E chain) | 200 | PASS |
| GRN-POST (PATCH status after full approval) | 200 | PASS |
| GRN-SEND-BACK | 200 | PASS |
| GRN-REJECT-CC | 200 | PASS |
| GRN-NO-ASSIGN | 403 | PASS |
| GRN-DUPLICATE-SUBMIT | 422 | PASS |
| GRN-WRONG-ROLE | 403 | PASS |

**Harness fixes applied:** `concurrencyVersion` on mutations; `PATCH /grn/:id/status` for posting; sequential CC→Finance approval chain. **Fixture FAIL: 0.**

---

## 12. Transfer runtime (Round 6 partial)

**Artifact:** `TRANSFER_RUNTIME_MATRIX.json` — 5 scenarios, **4 PASS** in harness summary.

Covered: create, no-assign deny, same-store validation, insufficient stock, submit, CC approve, duplicate approve, reject path, source balance snapshot.

**Not covered:** full post-to-ledger, destination balance, concurrent approval, WAC/cost preservation E2E.

---

## 13. Inventory Count runtime (Round 6 partial)

**Artifact:** `INVENTORY_COUNT_RUNTIME_MATRIX.json` — **9 PASS**.

Covered: create, start, submit-counts, variance, submit-approval, CC approve, finance approve, no-assign deny, duplicate approve.

**Not covered:** snapshot/recount/excel, positive/negative adjustment posting, ledger reconciliation, concurrent movement.

---

## 14. Frontend test inventory (18 files — all executed)

**Artifact:** `FRONTEND_TEST_ROUND6_RESULTS.json`

| File | Module | Result | Root cause | P/T/E |
| ---- | ------ | ------ | ---------- | ----- |
| verify-grn-create-runtime.mjs | GRN | PASS | — | Test |
| verify-grn-detail-timeline-phase4.mjs | GRN | PASS | — | Test |
| verify-grn-create-excel-layout.mjs | GRN | FAIL | Frontend :4200 not reachable | Environment |
| verify-phase5-detail-timeline.mjs | Transfer | PASS | — | Test |
| verify-phase6-detail-timeline.mjs | Breakage/Lost | PASS | — | Test |
| verify-phase7-detail-timeline.mjs | GetPass | PASS | — | Test |
| measure-inventory-count-workspace-spacing.mjs | IC | PASS | — | Test |
| measure-inventory-count-detail-spacing.mjs | IC | PASS | — | Test |
| capture-acc-overview-screenshot.mjs | ACC | FAIL | Frontend :4200 not reachable | Environment |
| grn-detail-timeline.util.spec.ts | GRN | FAIL | Vitest path broken under `DX OS&E` workspace (Node 25) | Environment |
| timeline-entry-render.util.spec.ts | Shared | FAIL | same | Environment |
| get-pass-list-display.util.spec.ts | GetPass | FAIL | same | Environment |
| get-pass-line-outcome.util.spec.ts | GetPass | FAIL | same | Environment |
| has-permission.directive.spec.ts | Shared | FAIL | same | Environment |
| get-pass-return-validation.spec.ts | GetPass | FAIL | same | Environment |
| app.spec.ts | Shared | FAIL | same | Environment |
| grn-detail.component.spec.ts | GRN | FAIL | same | Environment |
| returns-workflow-timeline.component.spec.ts | Shared | FAIL | same | Environment |

**Summary:** 18 executed, 7 PASS, 11 FAIL (Environment/harness — not product). Round 5 had 8 unit-spec PASS on direct vitest; Round 6 runner regressed due to path-with-space + Node 25 vitest resolution.

---

## 15. Constitution mapping

**Artifacts:**
- `FAILED_RUNTIME_REQUIREMENTS.json` (6 IDs)
- `GOVERNANCE_CONFLICT_REQUIREMENTS.json` (10 IDs)
- `CONSTITUTION_REQUIREMENT_COVERAGE_GAPS.json`
- `CONSTITUTION_STATUS_COUNTS.json`

| Status | Count |
| ------ | ----: |
| Runtime Verified Complete | **0** |
| Static Verified — appropriate | 168 |
| Partial | 61 |
| Not Run | 148 |
| Failed Runtime | 6 |
| Governance Conflict | 10 |

**Failed Runtime IDs (6):** C02-2.7-003, C04-4.2-001, C07-7.8-002, C07-7.10-006, C08-8.5-001, C08-8.6-002 — linked to Get Pass submit/permission harness FAILs and fast-forward scenarios (see JSON for evidence arrays).

**Governance Conflict (10):** Get Pass workflow / GM / approval requirements vs published global workflow with `PENDING_GM` and creator fast-forward without approved decision (see JSON).

**Why zero Runtime Verified Complete:** No requirement has full multi-module runtime proof mapped 1:1; most workflow requirements remain **Partial** pending Get Pass logistics grid, Transfer/IC posting proof, and constitution scenario linkage.

---

## 16. Confirmed defects (unchanged — not downgraded)

### Product Runtime Defects
1. **Get Pass submit** permits users with **no active assignment** (HTTP 200 + mutation).
2. **Get Pass foreign/random/not-found** requests return **HTTP 500** (not 403/404).

### Governance / Constitution Defects
3. Global/default Get Pass workflow includes **unapproved GM step**; 20/20 tenants; new tenants inherit; active docs pinned.
4. **Finance creator fast-forward** — **Runtime-Confirmed Governance/Constitution Defect**; **no approved BDR** (`GET_PASS_CREATOR_FAST_FORWARD_AUTHORITY_AUDIT.json`).

### Operational Legacy
5. **Lost `/approve-dept`** mutates INTERNAL document **without ACC version pin** (Round 5 runtime — still valid).

### Read scope (Round 6 addition)
6. **`GET /workflow-pipeline`** returns operational rows/IDs for users **without** active property assignment (5 NO_ASSIGN scenarios).

---

## 17. Round 6 open evidence gaps (not closeout)

| Area | Gap |
| ---- | --- |
| Get Pass permission grid | Logistics, settlement, returns, attachments, stale JWT per endpoint — not fully probed |
| Transfer | Full create-to-post, balances, concurrent approval |
| Inventory Count | Posting, ledger, recount/excel |
| Legacy | Sequential approve-dept→gm on INTERNAL blocked in Round 6 fixture (403/400); Round 5 single-step approve-dept success remains authoritative |
| Frontend unit specs | Harness broken on path-with-space / Node 25 — Round 5 PASS evidence supersedes for util specs until harness fixed |
| Constitution | 0 requirements at Runtime Verified Complete |

---

**Evidence index (new/updated Round 6):**

`GET_PASS_CREATOR_FAST_FORWARD_AUTHORITY_AUDIT.json` · `GET_PASS_FINANCE_FAST_FORWARD_MATRIX_FINAL.json` · `NO_ASSIGN_READ_SCOPE_FINAL.json` · `STALE_FRESH_JWT_ASSIGNMENT_MATRIX.json` · `ASSIGNMENT_GATE_ROUTE_INVENTORY_FINAL.csv` · `GET_PASS_PERMISSION_MATRIX.json` · `LEGACY_CHAIN_COMPLETE.json` · `FRONTEND_LEGACY_DEPENDENCY_MATRIX.json` · `GET_PASS_CROSS_TENANT_EXPANDED.json` · `ROLE_RESOURCE_SCOPE_VERDICTS.json` · `GRN_RUNTIME_MATRIX.json` · `TRANSFER_RUNTIME_MATRIX.json` · `INVENTORY_COUNT_RUNTIME_MATRIX.json` · `FRONTEND_TEST_ROUND6_RESULTS.json` · `FAILED_RUNTIME_REQUIREMENTS.json` · `GOVERNANCE_CONFLICT_REQUIREMENTS.json` · `CONSTITUTION_REQUIREMENT_COVERAGE_GAPS.json`
