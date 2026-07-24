# Tenant Isolation — Test Totals

| Suite | Command | Pass | Fail |
|-------|---------|------|------|
| Backend unit | `npm run test:unit` (OSE-backend) | **332** | 0 |
| Frontend production build | `npm run build` (OSE-Frontend) | **PASS** | — |
| API runtime matrix | `node Governance/scripts/tenant-isolation-api-runtime.js` | **20** | 0 |
| Browser runtime matrix | `node OSE-Frontend/scripts/run-tenant-isolation-browser.js` | **12** | 0 |

Evidence: [API_RUNTIME_EVIDENCE.json](./API_RUNTIME_EVIDENCE.json), [BROWSER_RUNTIME_EVIDENCE.json](./BROWSER_RUNTIME_EVIDENCE.json)
