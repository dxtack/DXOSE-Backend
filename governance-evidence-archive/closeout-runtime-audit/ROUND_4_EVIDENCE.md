# DX OSE — Runtime Closeout Evidence — Round 4

Generated: 2026-06-27T00:15:00Z  
Harness: `OSE-backend/scripts/closeout-runtime-audit/`  
Artifacts: `Governance/closeout-runtime-audit/`  

**Round 4 status:** Evidence expanded; **not Final Closeout** — scope matrix, full GRN/Transfer/IC e2e grids, complete Get Pass endpoint grid, and constitution requirement linkage remain open.

---

## 1. Hierarchy fixture — rollback verified

| Phase | `grand-horizon.parentId` | Evidence |
|-------|--------------------------|----------|
| Before Round 3 test | `null` (original) | `ORG_HIERARCHY_FIXTURE_ROLLBACK.json` |
| During Round 3 (`00c`) | `dx-hospitality-group` | Contamination |
| After Round 4 rollback (`00d`) | **`null`** | `ORG_HIERARCHY_FIXTURE_EXECUTION_PROOF.json` |

- Rollback **executed in DB** (`rollbackExecuted: true`, `rollbackAction: restored_previousParentId`).
- Post-rollback query: `SELECT id, slug, "parentId" FROM tenants WHERE slug = 'grand-horizon'` → `parentId IS NULL`.
- `00c-org-hierarchy-fixture.js` **removed from `run-all.js`**; never re-run on `grand-horizon`.
- Policy: `00e-disposable-org-fixture.js` creates `closeout-audit-org-disposable` → `closeout-audit-hotel-disposable` only.

**Results invalidated by hierarchy change:** Round 3 ACC ORG legacy paths under modified `grand-horizon.parentId` — not valid for production claims.

---

## 2. NO_ASSIGN — cross-module blast radius

Artifact: `NO_ASSIGN_CROSS_MODULE_MATRIX.json` (45 probes, 5 user states × 9 modules)

| Finding | Detail |
|---------|--------|
| **Confirmed product defect** | **Get Pass submit** — 4/5 no-assignment states: HTTP **200** + DB mutation |
| **Scope works on create** | Breakage, Lost, Transfer, IC create → **403 SCOPE_VIOLATION**, no mutation |
| **Read-only OK** | GRN list, movements, reports, pipeline → 200 with **no mutation** |
| **Blast radius** | **Primary: Get Pass submit path.** Other module creates enforce assignment scope. |

**Root cause:**

| Question | Answer |
|----------|--------|
| JWT without assignment? | Yes — permissions from tenantMember role even when Ur assignment inactive |
| Service must enforce scope? | Yes — empty assignment scope returned but Get Pass submit does not consume it |
| Route uses TenantMember not UrAssignment? | Submit uses requirePermission(GET_PASS_CREATE) only |

---

## 3. Get Pass workflow — system-wide drift

Artifact: `GET_PASS_WORKFLOW_ROLLOUT_AUDIT.json` — 20 tenants, **0** constitution-aligned.

Classification: **System-wide Active Governance Configuration Drift** — all resolve global standard v3 with PENDING_GM; Security follows GM; new tenants inherit same template.

---

## 4. Constitution-aligned Get Pass test

Artifacts: `GET_PASS_CONSTITUTION_ALIGNED_FAST_FORWARD.json`

When tenant-scoped constitution fixture is published and pinned: **no PENDING_GM injection**; DEPT → PENDING_COST_CONTROL; FINANCE creator fast-forward → PENDING_SECURITY without GM stamp. ORG scenario BLOCKED (org_switch_failed — use disposable org). Cleanup: fixture definition deleted after run.

---

## 5. Legacy routes

Artifact: `LEGACY_ROUTE_CLASSIFICATION.json` — 98 probes with per-route classification and whyPass.

One **Active Operational Legacy**: INTERNAL_LOST approve-dept → HTTP 200 without ACC pin.  
ACC N/A fixes: `ACC_NOT_APPLICABLE_RECLASSIFICATION.json`.

---

## 6. Cross-tenant Get Pass errors

Artifact: `GET_PASS_NOT_FOUND_ERROR_CONSISTENCY.json` — foreign ID and random UUID both HTTP 500 "Get Pass not found". **Product Runtime Error Handling Defect**; isolation intact (no leak).

---

## 7–11. Partial matrices

| Area | Round 4 state |
|------|----------------|
| Scope | 13/13 PASS — 3 resources only; full grid not run |
| GP permission | 10 PASS / 8 FAIL — 3 endpoints; see GET_PASS_PERMISSION_FAIL_DETAILS.json |
| GRN / Transfer / IC | 6 / 5 / 7 scenarios — not full e2e checklists |

---

## 12. Frontend

- 9 spec files inventoried; vitest 24/24 on util specs; 2 Playwright scripts PASS.
- `ng test` blocked on Node v25 + missing browser vitest package.
- See `FRONTEND_SPEC_INVENTORY.json`, `PLAYWRIGHT_RESULTS.json`.

---

## 13. Constitution mapping

393 requirements — **Runtime Verified Complete = 0** because generator maps runtime types to Partial only; no requirement-ID linkage from harness artifacts (generator gap, not absence of all runtime proof).

---

## Open before Final Closeout

Full scope matrix; complete GP endpoint grid; GRN/Transfer/IC e2e; stale JWT NO_ASSIGN rows; constitution requirement linkage; ORG GP test on disposable tenant; remaining Playwright scripts.
