# Reporting Wave 1B — Column Contracts & Financial Presentation

**Scope:** Presentation normalization only. No query, calculation, or workflow changes.

## Contract families added/updated

| Family | Contract id | Cards (representative) |
|--------|-------------|-------------------------|
| Count variance (detail) | `count-variance-report` | count-variance-report, variance-value-impact, top-variance-items |
| Count variance (summary) | `variance-by-*` | by location, department, category, counter |
| Stock balance | `current-stock-balance` | current-stock-balance, inventory-by-location |
| Inventory health | `negative-stock-report`, `inventory-health-aging`, `critical-stock-levels` | negative stock, slow/dead/zero movement, critical levels |
| Consumption | `high-consumption-items` | high-consumption-items |
| Count sessions | `count-session-report` | session history, open/pending/rejected, reviewer queues |
| Count approval | `count-approval-history` | count-approval-history |
| Ledger | `inventory-change-history` | ledger aliases (posting, adjustments, breakage workflow, …) |
| Transfers | `open-transfers`, `transfer-history` | open transfers, delays, aging, inter-location |
| Get pass | `get-pass-report` | get-pass-activity, open passes, overdue returns, … |
| Governance audit | `audit-activity-report` | audit, user activity, approval, violations |
| Period close | `period-close-report` | period-close-validation, posting-integrity-check |
| Operations queue | `pending-operations-report` | pending actions, daily review, attention |
| Lost items | `lost-items-register` | lost-items-register |

## Presentation fixes

- Numeric columns (`qty`, `sar`, `int`) are **right-aligned** in contracts, UI contract table, and exports.
- **Snapshot qty** / **Counted qty** / **Variance qty** labels enforced; legacy “Book” band label → “Snapshot”.
- **variance-by-department** grouping key corrected (`department` field on variance rows; was `category`).
- PDF/Excel continue to use `getReportColumns()` → same headers/order as API `columns` payload.

## Intentionally dynamic (deferred)

Planned/disabled governance proxies with unstable row shapes:

- `workflow-exceptions`, `workflow-bottlenecks`, `unauthorized-actions-review`, …

## Verification

```bash
cd OSE-backend
node scripts/smoke-reporting-wave1b-contracts.js
npm run smoke:reporting-wave1a-pdf
```

Frontend: `npm run build` in OSE-Frontend.
