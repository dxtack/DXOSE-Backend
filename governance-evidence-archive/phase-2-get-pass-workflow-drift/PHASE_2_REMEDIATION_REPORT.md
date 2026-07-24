# Phase 2 — Get Pass Workflow Configuration Drift: Remediation Report

Generated: 2026-06-28  
Product remediation: **ACCEPTED**  
Formal closure: **CLOSED** (`phaseClosed: true`)

## Objective

Remediate Get Pass workflow configuration drift so every active property uses a constitution-aligned published ACC workflow: **Department → Cost Control → Finance → Security**, without the extra GM step; complete Send Back and Resubmit lifecycle per verification addendum.

## Remediation approach (ACC versioning rules)

| Rule | Compliance |
|------|------------|
| Do not edit published version in place | v3 archived; v4 created as new PUBLISHED |
| Publish corrected version through ACC model | New `acc_workflow_version` v4 + step definitions |
| Pin properties to correct version | Global publish — all tenants resolve v4 via engine (no tenant override existed) |
| Preserve historical versions | v1–v3 archived, not deleted |
| Do not migrate in-flight/historical documents | 24 documents remain on v3 pin |
| No tenant step changes without approval | No tenant-scoped definitions modified |

## Changes made

### Configuration seed (future environments)

**`OSE-backend/src/services/acc-workflow-default-chains.js`**

- Removed GET_PASS step 4 (`GENERAL_MANAGER` / `PENDING_GM`)
- Security is now step 4 (`PENDING_SECURITY`)

### Live database remediation

**Script:** `phase-2-remediate-get-pass-workflow.cjs`

| Action | Detail |
|--------|--------|
| Archived | Global `standard` GET_PASS v3 (`aec08f69-…`) |
| Published | Global `standard` GET_PASS v4 (`01a06d7c-…`) |
| Steps | DEPT_MANAGER → COST_CONTROL → FINANCE_MANAGER → SECURITY |

### Send Back and Resubmit (completion)

| Component | Change |
|-----------|--------|
| `getPass.service.js` | `sendBackGetPass` — returns to `DRAFT`, clears approval stamps, preserves `accWorkflowVersionId`, appends `[Send Back]` reason to notes, logs `GET_PASS_SEND_BACK` |
| `getPass.service.js` | `submitGetPass` resubmit — uses pinned workflow via `resolveWorkflowByVersionId`, restarts at `PENDING_DEPT`, logs `GET_PASS_RESUBMIT`, creator-only after Send Back |
| Route / controller | `POST /api/get-passes/:id/send-back` |
| Timeline | Sent Back and Resubmitted lifecycle entries in `getPassTimeline.builder.js` |
| Lifecycle UX | GET_PASS `Returned` user-facing state when DRAFT + Send Back marker |
| Frontend | Send Back button/dialog on get-pass detail; `sendBack()` API client |

## Before / after

| Area | Before | After |
|------|--------|-------|
| New Get Pass submit status | `PENDING_DEPT` (unchanged) | `PENDING_DEPT` |
| After Finance approval | `PENDING_GM` | `PENDING_SECURITY` |
| Published step count | 5 | 4 |
| Tenants with drift | 20 / 20 | 0 / 20 |
| Historical doc pins | 24 on v3 | 24 on v3 (preserved) |
| Get Pass Send Back | HTTP 404 (not implemented) | HTTP 2xx; DRAFT editable state |
| Resubmit after Send Back | Not available | `PENDING_DEPT`; pinned v4 retained |

## Final gate (phase2-gp-workflow-v2-addendum)

Evidence: `PHASE_2_RUNTIME_RESULTS.json`  
Executed: 2026-06-28T01:26:58Z

### Runtime (25 PASS / 0 FAIL)

| # | Scenario | Result |
|---|----------|--------|
| 1–9 | Core chain + fast-forward guards | PASS |
| 11–14 | Version resolution, historical pins, cross-tenant, reject | PASS |
| 15 | Send Back from Cost Control | PASS — `DRAFT`, v4 pin retained, stamps cleared, no ledger/stock |
| 16 | Send Back from Finance | PASS — same assertions |
| 17 | Resubmit after Send Back | PASS — edit + resubmit → `PENDING_DEPT`, no self-stamps |
| 18 | Complete TEMPORARY return lifecycle | PASS |
| 19–26 | Send Back / resubmit negative scenarios | PASS — no mutation on denied attempts |

### Negative scenarios (19–26)

- Wrong role, creator Send Back, missing reason, stale concurrency, no assignment, wrong-property user, terminal DRAFT Send Back, unauthorized edit/resubmit — all blocked with no document/ledger/stock mutation.

### Regression (9/9 PASS)

Get Pass CRUD/workflow, TEMPORARY OUT/RETURNED, pipeline, dashboard, tenant switch, historical v3 resolution, backend unit tests, frontend development build.

## Constraints honored

- Phase 1 files/evidence not modified
- ACC v4 configuration not re-modified after remediation
- 24 historical v3 documents not migrated
- Gate A / B / C not reopened
- `role-permission-fallback.ts` not touched
- Other module workflows unchanged
- Phase 3+ not started

## Gate checklist

All items in `PHASE_2_RUNTIME_RESULTS.json` → `gateChecklist` are **true**.  
**`phaseClosed: true`**
