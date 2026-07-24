# Tenant Isolation Matrix (Phase 1 Audit)

Audit method: direct file read (`Read` by path). Search tools are filtered in this workspace.

| Module | List | Detail | Create FK validation | Mutations tenantId in where | Timeline | Attachments | Foreign ID | ORG_MANAGER operational |
|--------|------|--------|---------------------|----------------------------|----------|-------------|------------|-------------------------|
| Item Master | PASS (`tenantId` in `getItems`) | PASS | PASS (`assertDepartmentInTenant`, category/store checks) | PASS pattern | N/A | N/A | 404 | tenant-scoped |
| Categories | PASS (master-data pattern) | PASS | PASS | PASS | N/A | N/A | 404 | tenant-scoped |
| Departments | PASS | PASS | PASS | PASS | N/A | N/A | 404 | tenant-scoped |
| Stores/Locations | PASS | PASS | PASS (`assertLocationInScope`) | PASS | N/A | N/A | 404 | tenant-scoped |
| Stock Balances | PASS (`locationId` + tenant) | PASS | N/A | PASS | N/A | N/A | 404 | scope engine |
| Movements | PASS | PASS | PASS | PARTIAL→hardened movement modules | N/A | PARTIAL | 404 | scope engine |
| Par Levels | PASS | PASS | PASS | PASS | N/A | N/A | 404 | scope engine |
| Ledger/History | PASS | PASS | N/A | PASS | N/A | N/A | 404 | scope engine |
| GRN | PASS | PASS | PASS | PARTIAL→enrichment+hardening | PASS | PASS | 404 | governance POST only |
| Transfer | PASS | PASS | PASS | **HARDENED** (`id,tenantId` updates/delete) | PASS | N/A | 404 | scope tenant-wide |
| Breakage | PASS | PASS | PASS | PARTIAL (accepted) | PASS | PARTIAL | 404 | role constant |
| Lost Items | PASS | PASS | PASS | PARTIAL (accepted) | PASS | — | 404 | role constant |
| Inventory Count | PASS | PASS | PASS | PARTIAL (accepted) | PASS | — | 404 | scope tenant-wide |
| Get Pass | **PASS** (operational tenant-only after fix) | PASS (`findReadablePass`) | PASS | PASS issuer mutations | **PASS** (readable OR) | — | 404 | **no org-wide list** |
| Workflow Pipeline | PASS | PASS | N/A | N/A | N/A | N/A | 404 | tenant alerts |
| Users/Assignments | PASS | PASS | PASS | PASS | N/A | N/A | 404 | tenant-scoped |
| Audit Log | PASS | PASS | N/A | N/A | N/A | N/A | 404 | tenant-scoped |
| Property Reports | PASS | PASS | N/A | clamp filters | N/A | export scoped | 404 | org screens only |

## Org-level authorized surfaces

- Organization Dashboard / Reports (explicit org screens) — **ORG_LEVEL_AUTHORIZED**
- Get Pass operational list — **tenant-specific only** (org-wide disabled in this workstream)
- Internal transfer target detail/timeline — **readable OR** on target tenant (API runtime PASS)

## PARTIAL (accepted) — Breakage / Lost Items / Inventory Count

Mutations inside approval transactions sometimes use `update({ id })` after a tenant-scoped locked read rather than `updateMany({ id, tenantId })`. Send-back paths use guarded `updateMany` + `tenantId`. API runtime foreign-ID matrix shows 404/403 at read boundaries; no direct foreign-ID mutation path demonstrated. See [FINAL_REPORT.md](./FINAL_REPORT.md) §6.
