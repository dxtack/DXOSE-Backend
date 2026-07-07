# Defect Classification — Runtime Closeout (Round 7)

**Updated:** 2026-06-27  
**Policy:** Defects below are confirmed by runtime evidence. None are downgraded without contradicting runtime proof.

---

## Product Runtime Defects

1. **Get Pass Submit succeeds without active UrUserAssignment** — HTTP 200 + status mutation when `UrUserAssignment` is absent/inactive/deleted. Route: `POST /get-passes/:id/submit` uses `requirePermission('GET_PASS_CREATE')` only; service does not call `resolveScopeContext`. Evidence: `GET_PASS_PERMISSION_MATRIX.json` (`GP-submit-NO_ASSIGN`), `NO_ASSIGN_CROSS_MODULE_MATRIX.json`, `GET_PASS_NO_ASSIGN_INVESTIGATION.json`.

2. **Workflow Pipeline returns operational data to users without active assignment** — `GET /workflow-pipeline` (and related pipeline reads) returns HTTP 200 with up to 50 operational rows/document IDs for users with no active property assignment, deleted/inactive assignment, wrong-property assignment, or stale JWT after assignment delete. Evidence: `NO_ASSIGN_READ_SCOPE_FINAL.json`, `WORKFLOW_PIPELINE_ASSIGNMENT_SCOPE_MATRIX.json`, `STALE_FRESH_JWT_ASSIGNMENT_MATRIX.json`.

3. **Get Pass foreign/random/not-found requests return HTTP 500** — Cross-tenant, random UUID, malformed, and deleted ID probes return HTTP **500** with `"Get Pass not found"` instead of 403/404. Evidence: `GET_PASS_CROSS_TENANT_EXPANDED.json`, `GET_PASS_CROSS_TENANT_ACTION_MATRIX.json`, `CROSS_TENANT_GETPASS_INVESTIGATION.json`.

---

## Governance / Constitution Defects

4. **Global/default Get Pass workflow contains unapproved GM step** — Published standard chain includes `PENDING_GM` between Finance and Security. Evidence: `GET_PASS_WORKFLOW_ROLLOUT_AUDIT.json`, `GET_PASS_WORKFLOW_CONFIGURATION_AUDIT.json`.

5. **20/20 tenants use the non-compliant workflow** — All audited tenants resolve to global standard v3 with GM step. Evidence: `GET_PASS_WORKFLOW_ROLLOUT_AUDIT.json`.

6. **New tenants inherit the same non-compliant workflow** — Tenant bootstrap inherits global GET_PASS template. Evidence: `GET_PASS_WORKFLOW_ROLLOUT_AUDIT.json`, `PUBLISHED_WORKFLOW_VERSIONS.json`.

7. **Active documents are pinned to non-compliant versions** — Live Get Pass rows pinned to workflow versions containing `PENDING_GM`. Evidence: `GET_PASS_WORKFLOW_ROLLOUT_AUDIT.json`.

8. **Finance creator fast-forwards to Security and skips Department/Cost Control without BDR** — On constitution-aligned disposable fixture, Finance create → submit → `PENDING_SECURITY` with dept/CC stamps skipped and finance self-stamped. No approved Business Decision Record. Evidence: `GET_PASS_CREATOR_FAST_FORWARD_AUTHORITY_AUDIT.json`, `GET_PASS_FINANCE_FAST_FORWARD_MATRIX_FINAL.json`.

9. **ORG_MANAGER creator fast-forwards similarly without BDR** — ORG_MANAGER submit on constitution fixture jumps to last pending step, stamping skipped steps without approved governance decision. Evidence: `GET_PASS_FINANCE_FAST_FORWARD_MATRIX_FINAL.json`, `GET_PASS_CREATOR_FAST_FORWARD_AUTHORITY_AUDIT.json`.

---

## Operational Legacy

10. **Lost `/approve-dept` mutates INTERNAL document without ACC version pin** — `POST /lost-items/:id/approve-dept` on `INTERNAL` + `DRAFT` + no `ApprovalRequest`, actor `DEPT_MANAGER_FB`, HTTP 200 → `DEPT_APPROVED`, no `accWorkflowVersionId`. Evidence: `LEGACY_ROUTE_CLASSIFICATION.json` (lostDeepDive), `LOST_LEGACY_CHAIN_FINAL.json`.

11. **Frontend still depends on legacy approve endpoint** — Active list/detail screens invoke `approveAtCurrentStep()` routing INTERNAL documents to `/approve-dept`, `/approve-cost`, etc. Evidence: `FRONTEND_LEGACY_DEPENDENCY_MATRIX.json`, `FRONTEND_LEGACY_RUNTIME_CAPTURE.json`.

---

## Evidence index

| Artifact | Defects |
| -------- | ------- |
| `GET_PASS_PERMISSION_MATRIX.json` | 1, 3 |
| `NO_ASSIGN_READ_SCOPE_FINAL.json` | 2 |
| `WORKFLOW_PIPELINE_ASSIGNMENT_SCOPE_MATRIX.json` | 2 |
| `STALE_FRESH_JWT_ASSIGNMENT_MATRIX.json` | 2 |
| `GET_PASS_CROSS_TENANT_EXPANDED.json` | 3 |
| `GET_PASS_WORKFLOW_ROLLOUT_AUDIT.json` | 4–7 |
| `GET_PASS_CREATOR_FAST_FORWARD_AUTHORITY_AUDIT.json` | 8–9 |
| `LEGACY_ROUTE_CLASSIFICATION.json` / `LOST_LEGACY_CHAIN_FINAL.json` | 10 |
| `FRONTEND_LEGACY_*` | 11 |
