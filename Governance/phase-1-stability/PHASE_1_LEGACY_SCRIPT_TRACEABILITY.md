# Phase 1 — Legacy Script Traceability

Generated as part of Phase 1 Batch 3 closure. **No scripts were deleted in Batch 3.**

## Replaced or materially superseded

| Script | Disposition | Permanent test replacement | Missing coverage |
|--------|-------------|---------------------------|------------------|
| `OSE-backend/scripts/verify-fy01-p2-lifecycle.js` | **PARTIALLY SUPERSEDED** | `test/integration/characterization/acc-assignment-lifecycle-permission-version.test.js`, `acc-assignment-reactivate-permission-version.test.js` | Uses product DB + `legacy:` assignment discovery; does not prove HTTP stale-JWT paths or full operational-history matrix |
| `OSE-backend/scripts/verify-fy01-p2-runtime.js` | **PARTIALLY SUPERSEDED** | `acc-permission-resolution.test.js`, `acc-assignment-department-scope.test.js`, lifecycle integration tests | Depends on `superadmin@ose.cloud` and existing assignments; no disposable fixture isolation |
| `OSE-backend/scripts/verify-scope-isolation.js` | **RETAINED — HISTORICAL/DIAGNOSTIC** | `acc-assignment-department-scope.test.js` (ACC scope only); `api-grn-authorization.test.js` Case D (GRN scope) | Fixed UAT tenant UUID + `fb.manager@grandhorizon.com`; movement cross-dept isolation not characterized in Phase 1 harness |
| `OSE-backend/scripts/smoke-fy01-p2-user-rights.js` | **PARTIALLY SUPERSEDED** | Integration ACC/lifecycle suite + `OSE-Frontend/e2e/critical/*.test.js` | Optional Playwright path against live stack; not fail-fast unified; uses product `.env` by default |

## Keep temporarily

- ACC cutover verification scripts (`verify-acc-p12-cutover-wave2.js`, related)
- PDF/reporting smokes and Governance static smokes
- Closeout runtime audit evidence collectors
- UAT diagnostics (`verify-scope-isolation.js`, `diagnose-*`, form-scope scripts)
- Migration remediation scripts

## Safe delete candidates (list only — owner approval required)

| Script | Replacement permanent tests | Missing coverage | Notes |
|--------|----------------------------|------------------|-------|
| None certified in Phase 1 | Full safety suite (`npm run test:safety`) | All four FY01 P2 scripts retain unique UAT/diagnostic paths or partial coverage gaps | **Do not delete** until owner maps each script to green permanent tests with explicit sign-off |

Phase 1 defers full 126-script retirement to post-closure work.
