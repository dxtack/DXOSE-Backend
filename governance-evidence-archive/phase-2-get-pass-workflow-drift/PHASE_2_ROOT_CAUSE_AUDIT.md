# Phase 2 — Get Pass Workflow Configuration Drift: Root Cause Audit

Generated: 2026-06-28  
Status: **CLOSED** (`phaseClosed: true`)

## Executive summary

All 20 active properties resolved the global ACC `standard` Get Pass workflow **version 3**, which included an extra **GM (`PENDING_GM`)** step between Finance and Security. The drift originated from **published ACC configuration seeded from defaults**, not from runtime step injection or creator fast-forward logic. Phase 2 published **version 4** (constitution-aligned, 4 steps) and archived version 3. Historical documents remain pinned to version 3.

## Approved standard chain

```
Department → Cost Control → Finance → Security OUT → Return
```

Status keys: `PENDING_DEPT` → `PENDING_COST_CONTROL` → `PENDING_FINANCE` → `PENDING_SECURITY`

## Inventory findings

| Metric | Pre-remediation | Post-remediation |
|--------|-------------------|------------------|
| Active tenants audited | 20 | 20 |
| Tenants constitution-aligned | 0 | 20 |
| Global GET_PASS definitions | 1 (`standard`, tenantId null) | 1 |
| Tenant-scoped GET_PASS overrides | 0 | 0 |
| Published version (runtime) | v3 (5 steps, includes GM) | v4 (4 steps, no GM) |
| Documents pinned to GM version | 24 | 24 (unchanged — historical pins preserved) |
| Approved tenant-specific GM exceptions | **None documented** | — |

Full machine-readable inventory: `PHASE_2_CONFIGURATION_INVENTORY.json`

## Root cause classification

| Suspected source | Finding | Evidence |
|------------------|---------|----------|
| Published ACC configuration | **CONFIRMED — primary cause** | Global `standard` v3 published steps include `PENDING_GM` at stepOrder 4 |
| Tenant pinning | Not applicable | No tenant-scoped definitions; resolution engine picks latest global published when no tenant override |
| Migration/default seeding | **CONFIRMED — origin** | `acc-workflow-default-chains.js` GET_PASS chain included GM step; P9 seed published v3 |
| Runtime code injection | **Ruled out** | `acc-workflow-get-pass.runtime.js` builds chain from pinned ACC steps only; submit enters first step with no role fast-forward |
| Hidden fallback / hardcoded injection | **Partial — non-runtime only** | Timeline UI builders hardcode GM for display; fallback status lists include `PENDING_GM` when chain empty — not used after submit pin |

## Configuration vs runtime behavior

**Before remediation (new documents):**

1. Submit resolves `resolvePublishedWorkflowChain('GET_PASS', tenantId)` → global v3
2. Document pins `accWorkflowVersionId = v3`
3. Approval path: Dept → CC → Finance → **GM** → Security → OUT/CLOSED

**After remediation (new documents):**

1. Submit resolves global v4
2. Approval path: Dept → CC → Finance → Security → OUT/CLOSED (no GM)

**Historical documents (unchanged):**

- 24 documents remain pinned to archived v3
- `resolveGetPassWorkflowContext` loads pinned v3 chain including GM — verified gate scenario 12

## Runtime code review (no defect requiring code change)

| File | Role | GM-related behavior |
|------|------|---------------------|
| `acc-workflow-get-pass.runtime.js` | Approval transitions | Maps `PENDING_GM` stamp fields if present in chain; does not inject steps |
| `workflow-resolution.engine.js` | Tenant/global published resolution | DB-driven only |
| `getPass.service.js` | Submit/approve | Pins version at submit; follows pinned chain |
| `acc-workflow-default-chains.js` | Seed source | **Had GM step — corrected in Phase 2** |

Phase 1 assignment/scope enforcement remains frozen and was not modified.

## Explicit exceptions

No property had a documented, approved tenant-specific GM governance exception. All drift was normalized via ACC version 4 publish.

## Verification evidence

- Remediation actions: `PHASE_2_REMEDIATION_ACTIONS.json`
- Runtime gate: `PHASE_2_RUNTIME_RESULTS.json` — **25/25 scenarios**, 9/9 regression, all checklist items PASS, `phaseClosed: true`
- Send Back / Resubmit completion: scenarios 15–17 PASS; negative scenarios 19–26 PASS
- TEMPORARY return lifecycle: scenario 18 PASS
