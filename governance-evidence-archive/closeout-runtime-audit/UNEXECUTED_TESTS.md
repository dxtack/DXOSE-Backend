# Unexecuted / Incomplete Runtime Tests — Round 3

Generated: 2026-06-27

**Count rule:** PASS + FAIL + BLOCKED + NOT_EXECUTED + NOT_APPLICABLE = Total (enforced in harness).

## Remaining harness gaps (non-zero exit)

| Suite | Total | PASS | FAIL | BLOCKED | N/A | Gap |
| ----- | ----: | ---: | ---: | ------: | --: | --- |
| ACC Legacy | 117 | 111 | 0 | 0 | 6 | Complete (6 N/A = stale GP fast-forward) |
| Get Pass Permission | 18 | 10 | 8 | 0 | 0 | 8 FAIL — staging/lifecycle |
| Cross-Tenant | 29 | 24 | 4 | 0 | 1 | 4 FAIL — Get Pass HTTP 500 |
| Workflow Runtime | 5 | 4 | 1 | 0 | 0 | 1 FAIL |
| NO_ASSIGN Investigation | 11 | 6 | 4 | 1 | 0 | Confirmed defects + inactive login blocked |
| Cross-Tenant GP Invest | 3 | 0 | 3 | 0 | 0 | 500 error handling |
| Scope Matrix | 13 | 13 | 0 | 0 | 0 | **Incomplete coverage** (not full Role×Resource grid) |
| GRN / Transfer / IC | partial | — | — | — | — | Not full workflow checklist |

## Count reconciliation (prior confusion resolved)

### ACC Legacy (117)
- Previously reported PASS+FAIL+BLOCKED=114 because **3× NOT_APPLICABLE** (GP fast-forward under STALE workflow) were omitted from narrative.
- Round 3: **111 + 0 + 0 + 0 + 6 = 117**. Six N/A = `GP-FF-*` under `STALE_WORKFLOW_CONFIGURATION` + GM/SUPER create forbidden.

### Cross-Tenant (29)
- Previously PASS+FAIL=28 because **1× NOT_APPLICABLE** (`XT-A-LIST-reports`, HTTP 404 endpoint).
- Round 3: **24 + 4 + 0 + 0 + 1 = 29**.

### Inventory Count (7)
- Seventh scenario: **`IC-FINANCE-APPROVE`** → `NOT_APPLICABLE` (HTTP 403; Finance lacks approve step permission or wrong workflow state).
- **6 PASS + 0 FAIL + 0 BLOCKED + 0 NOT_EXECUTED + 1 N/A = 7**.

## Not executed this round (external / scope)

- Full Get Pass permission matrix (all endpoints × all negative actors).
- Expanded Scope Role×Resource matrix (16 resources × 11 roles).
- Full GRN/Transfer/IC workflow matrices (double-post, send-back, ledger reconciliation).
- Playwright critical paths (no e2e spec directory in repo; playwright dep only).
- Constitution-aligned Get Pass fast-forward (no tenant currently matches approved chain).
