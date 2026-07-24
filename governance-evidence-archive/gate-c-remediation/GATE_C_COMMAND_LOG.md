# Gate C — Command Log

| Timestamp (UTC) | Command | Result |
|---|---|---|
| 2026-06-27T17:08:25Z | `node OSE-backend/scripts/gate-c-final-runtime.js` | 6 Passed / 1 Failed (GC-XT-001 scope — used DEPT_MANAGER) |
| 2026-06-27T17:09:10Z | `node OSE-backend/scripts/gate-c-final-runtime.js` (finance user for GC-XT-001) | **7 Passed / 0 Failed** |
| 2026-06-27T17:09:38Z | `node OSE-backend/scripts/gate-b-final-runtime.js` | 5 Passed / 1 Failed (RS-WF-001 pre-existing); RS-XT-001 **Passed 404** |
| 2026-06-27T17:08:30Z | `node --test OSE-backend/src/services/getPass.service.test.js` | Pre-existing mock failures (validatePostingDate) |
| 2026-06-27T17:09:00Z | `npm run build` (OSE-Frontend) | **PASS** → dist/OSE |
| 2026-06-27T17:10:00Z | SHA-256 integrity scan (Gate C changed files + Gate B closeout artifacts) | Closeout artifacts match Gate B integrity |

## Test data created

| Type | ID | Tag | Cleanup |
|---|---|---|---|
| Get Pass | 8b216f5b-01ea-416a-972a-50539362a89b | CLOSEOUT_RT_AUDIT | Retained for audit trace (Gate B regression run) |

No production-like records modified. Dedicated test tenants `grand-horizon` / `dx-airport-hotel` only.
