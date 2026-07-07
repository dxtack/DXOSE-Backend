# DX OSE — Runtime Closeout Evidence — Round 5

Generated: 2026-06-27  
Artifacts: `Governance/closeout-runtime-audit/`  
Harness: `OSE-backend/scripts/closeout-runtime-audit/`

**Round 5 status:** Major investigations expanded; **not Final Closeout**.

---

## Confirmed findings preserved (must not be downgraded)

| ID | Classification | Evidence |
|----|----------------|----------|
| GP-NO-ASSIGN-SUBMIT | Product Runtime Defect | `NO_ASSIGN_CROSS_MODULE_MATRIX.json` — Get Pass submit HTTP 200 + DB mutation without active Ur assignment |
| GP-XT-500 | Product Runtime Error Handling Defect | `GET_PASS_CROSS_TENANT_ACTION_MATRIX.json` — foreign/random IDs return HTTP 500 |
| GP-WF-DRIFT | Governance / Constitution Defect | `GET_PASS_WORKFLOW_ROLLOUT_AUDIT.json` — 20/20 tenants on GM-inclusive chain |
| LOST-LEGACY-DEPT | Operational Legacy | `LEGACY_ROUTE_CLASSIFICATION.json` — `POST /lost-items/:id/approve-dept` on INTERNAL without ACC pin |

---

## 1. Grand Horizon test workflow cleanup

Artifact: **`GET_PASS_TEST_WORKFLOW_CLEANUP_PROOF.json`**

| Check | Result |
|-------|--------|
| Active published before | Global standard v3 (`aec08f69-…`) — unchanged |
| Test version created/deleted | Simulated Round 4 pattern; cleanup executed |
| Documents pinned to test version after | **0** |
| Test definitions remaining on GH | **0** |
| `grand-horizon.parentId` | **null** — unchanged |
| Global template changed | **No** |

Policy enforced: constitution-aligned workflow tests use **`closeout-audit-hotel-disposable` only** with `finally` cleanup.

---

## 2. NO_ASSIGN cross-module matrix (expanded)

Artifact: **`NO_ASSIGN_CROSS_MODULE_MATRIX.json`** — **153 probes** (9 user states × 17 operations)

| Metric | Value |
|--------|------:|
| Fail with mutation | **5** (Get Pass submit primary) |
| Pass denied | 107 |
| Observe read scope | 9 (HTTP 200 with rows — needs ACC policy ruling) |

Each probe now includes: `returnedCount`, `sampleIds`, `tenantIdsInResponse`, `departmentIdsInResponse`, `jwtRole`, `activeAssignments`, `scopeResult`, `accAssignmentPolicyExpected`.

User states added: stale JWT after deactivate/delete, fresh JWT, inactive assignment, view-only auditor.

**Read scope note:** HTTP 200 with operational rows for no-assignment users classified **`OBSERVE_READ_SCOPE`** — not auto-PASS. Empty list → PASS. Mutations without assignment → FAIL.

**Root cause (assignment inventory):** **`ASSIGNMENT_GATE_ROUTE_INVENTORY.csv`** — 103 routes scanned. Get Pass submit: `scopeResolverCalled=yes` in list path, **`emptyAssignmentEnforced=no`** on submit service path → **Runtime confirmed defect**. Breakage/Lost/Transfer create: **Runtime verified safe** (403 SCOPE_VIOLATION).

Blast radius: **not limited to Get Pass** — assignment gate inventory shows multiple **Permission-only** routes; runtime samples confirm create-path scope on several modules but **read paths** may expose data per TenantMember role.

---

## 3. Finance fast-forward on constitution-aligned workflow

Artifact: **`GET_PASS_ALIGNED_WORKFLOW_ACTOR_MATRIX.json`** (disposable hotel, 4-step chain, cleanup in `finally`)

| Actor | Create | Submit | Actual status | Dept/CC stamped | Finance stamped on submit |
|-------|--------|--------|---------------|-----------------|---------------------------|
| DEPT_MANAGER | Yes | Yes | PENDING_COST_CONTROL | Dept yes | No |
| FINANCE | Yes | Yes | **PENDING_SECURITY** | **No / No** | **Yes (self)** |

**Explicit answers:**

1. Finance **is allowed** to create Get Pass (HTTP 201).
2. On constitution fixture, Finance creator **does not** queue at PENDING_DEPT — lands at **PENDING_SECURITY**.
3. **Yes** — `getSubmitInitialWorkflowFromContext(user.role)` fast-forwards by creator role (BDR in code, not ACC text alone).
4. Submit **applies workflow transition** and may stamp skipped steps — not queue-only.
5. **Yes** — Cost Control and Department approval IDs **not stamped** though status advanced past their steps; only Finance stamp recorded.

This is **observed runtime behavior on aligned fixture** — distinct from GM drift defect.

---

## 4. ORG_MANAGER on disposable org — resolved

Artifact: **`DISPOSABLE_ORG_RUNTIME_RESULTS.json`**

| Step | Result |
|------|--------|
| Login org | `closeout-audit-org-disposable` |
| Switch tenant | HTTP **200** → `closeout-audit-hotel-disposable` |
| JWT role | ORG_MANAGER |
| Get Pass create/submit | 201 / 200 → **PENDING_SECURITY** (constitution fixture) |
| Legacy lost approve-dept | HTTP 403 on disposable INTERNAL (ORG lacks APPROVE_LOST) |

**`org_switch_failed` eliminated** for disposable org path. Grand Horizon hierarchy **not used**.

---

## 5. Legacy routes — 0 unclassified

Artifact: **`LEGACY_ROUTE_CLASSIFICATION.json`** — **126 probes**, **0 unclassified**

| Classification | Count |
|----------------|------:|
| Safely blocked (valid + invalid fixtures) | 122 |
| ACC-compatible alias | 3 |
| Active Operational Legacy | **1** |

Lost deep-dive chain included. Breakage series executed separately (not identical to Lost).

Active legacy: **`POST /lost-items/:id/approve-dept`** on INTERNAL — HTTP 200, no ACC pin (unchanged confirmed defect).

---

## 6. Cross-tenant Get Pass — all actions probed

Artifact: **`GET_PASS_CROSS_TENANT_ACTION_MATRIX.json`** — **39 probes** (13 endpoints × 3 cases)

Foreign valid ID: **HTTP 500** on all mutation/read probes tested. Same-tenant control behaves per lifecycle. Defect classification unchanged.

---

## 7. Scope matrix

Artifact: **`ROLE_RESOURCE_SCOPE_MATRIX.json`** — **226 scenarios** (11 roles × 19 resources × list/read/foreign)

Per-resource counts documented in `scenariosPerResource`. Policies declared per resource in matrix header.

---

## 8. Get Pass permission grid (partial expansion)

Artifact: **`GET_PASS_PERMISSION_MATRIX.json`** on disposable tenant — 21 harness scenarios  
**10 PASS / 5 FAIL / 6 BLOCKED**

Confirmed on disposable: **NO_ASSIGN submit → FAIL (mutation)**. Logistics/settlement/close endpoints **not yet matrixed**.

---

## 9. GRN / Transfer / IC (expanded, not full E2E)

| Module | Scenarios | Artifact |
|--------|----------:|----------|
| GRN v2 | 8 | `GRN_RUNTIME_MATRIX.json` — 3 PASS / 5 FAIL (fixture status enums) |
| Transfer v2 | 6 | `TRANSFER_RUNTIME_MATRIX.json` — 6 PASS |
| IC v2 | 7 | `INVENTORY_COUNT_RUNTIME_MATRIX.json` — 7 PASS; IC-FINANCE-APPROVE → PASS negative (403) |

Full posting/WAC/concurrent/double-post paths **not complete**.

---

## 10. Frontend test inventory

Artifact: **`FRONTEND_TEST_INVENTORY_CLASSIFICATION.json`**

| | Count |
|--|------:|
| Files catalogued | 18 |
| Executed | 13 |
| Pass | 8 |
| Fail | 5 |
| Not run | 5 (spacing/measure scripts — no runtime assertion) |

Vitest: 9 spec files attempted. Playwright: GRN create, GRN timeline phase4, Get Pass phase7 executed.

---

## 11. Constitution linkage

Artifacts: **`CONSTITUTION_REQUIREMENT_TEST_LINKS.json`**, **`CONSTITUTION_STATUS_COUNTS.json`**

| Status | Count |
|--------|------:|
| Runtime Verified Complete | **0** |
| Static Verified — appropriate | 168 |
| Partial | 61 |
| Not Run | 148 |
| Failed Runtime | **6** |
| Governance Conflict | **10** |
| **Total** | **393** |

Generator now links scenarios → requirements. **Runtime Verified Complete = 0** because requirements need multi-module proof; Failed/Governance buckets populated from Round 5 evidence.

---

## Open before Final Closeout

- Full Get Pass permission grid (all mutation endpoints × role matrix)
- GRN/Transfer/IC full E2E (posting, WAC, concurrent, ledger proof)
- NO_ASSIGN read-scope **OBSERVE** rows → ACC policy decision
- All 23 Playwright scripts or documented technical block per file
- Stale JWT full matrix on approve/action paths (not just submit)
- Runtime Verified Complete promotion with per-requirement multi-module evidence

---

## Artifact index (Round 5 new/updated)

`GET_PASS_TEST_WORKFLOW_CLEANUP_PROOF.json` · `NO_ASSIGN_CROSS_MODULE_MATRIX.json` · `ASSIGNMENT_GATE_ROUTE_INVENTORY.csv` · `GET_PASS_ALIGNED_WORKFLOW_ACTOR_MATRIX.json` · `DISPOSABLE_ORG_RUNTIME_RESULTS.json` · `LEGACY_ROUTE_CLASSIFICATION.json` · `GET_PASS_CROSS_TENANT_ACTION_MATRIX.json` · `ROLE_RESOURCE_SCOPE_MATRIX.json` · `GET_PASS_PERMISSION_MATRIX.json` · `FRONTEND_TEST_INVENTORY_CLASSIFICATION.json` · `CONSTITUTION_REQUIREMENT_TEST_LINKS.json`
