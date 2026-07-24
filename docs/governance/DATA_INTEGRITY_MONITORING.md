# Data Integrity Monitoring (Phase F3)

| Field | Value |
|--------|--------|
| **Service** | `integrityMonitoring.service.js` |
| **API** | `GET /api/integrity/scan` |
| **Roles** | ADMIN, FINANCE_MANAGER, AUDITOR, COST_CONTROL |

## Scan codes

| Code | Severity | Description |
|------|----------|-------------|
| `STOCK_LEDGER_DRIFT` | BLOCKER | Sampled `qtyOnHand` ≠ net official ledger qty |
| `ORPHAN_GET_PASS_RETURN_DOC` | BLOCKER | `GET_PASS_RETURN` without `getPassId` |
| `WAC_ANOMALY_ZERO_WITH_QTY` | WARNING | On-hand > 0, WAC = 0 |
| `LEDGER_MISSING_BALANCE_AFTER` | WARNING | Official ledger rows missing `balanceAfter` |
| `OPEN_COUNT_SESSION` | INFO | Non-terminal count sessions |
| `DUPLICATE_POSTED_COUNT_SESSION_NO` | BLOCKER | Defensive (unique constraint normally prevents) |

## Usage

### API

```http
GET /api/integrity/scan?sampleSize=200
Authorization: Bearer …
```

Response: `{ healthy, summary, issues[] }`

### Month-end checklist

```http
GET /api/integrity/month-end-checklist?year=2026&month=5
```

### Scheduled jobs (recommended ops)

Run daily per tenant (cron / worker):

```js
const { runIntegrityScan } = require('./services/integrityMonitoring.service');
await runIntegrityScan(tenantId);
```

Persist results to ops dashboard or alert when `healthy === false`.

## Goals

- Detect drift **before** finance discovers in Excel
- Actionable codes with counts and samples
- Traceable via API timestamp `scannedAt`

## Smokes

`scripts/smoke-integrity-monitoring-static.js` (static exports)  
Extend with DB integration smoke when CI has test DB.
