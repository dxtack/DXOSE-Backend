# Inventory Count — Phase 1 smoke results (evidence)

| Field | Value |
|--------|--------|
| **Run date (UTC)** | 2026-05-14 |
| **Operator** | Automated agent + local API |
| **Environment** | **Local development API** against seeded tenant `grand-horizon` (`DATABASE_URL` → `localhost:5433`). **Not** a named remote “staging” URL — see §0. |

---

## 0. Environment disclaimer (staging vs local)

| Target | Used in this run? | Notes |
|--------|-------------------|--------|
| Customer-managed **staging** URL | **No** — not supplied in workspace | Re-run `OSE-backend/scripts/phase1-smoke-http-evidence.js` (or manual checklist in `INVENTORY_COUNT_PHASE1_SMOKE_CHECKLIST.md`) against the real staging base URL after setting `BLOCK_LEGACY_STOCK_COUNT_CREATE=1` and `LEGACY_STOCK_COUNT_TELEMETRY=1` there. |
| **localhost:4000** | **Yes** | Existing dev server **without** blocking env (default). |
| **localhost:4010** | **Yes** | Temporary second Node process with `PORT=4010`, `BLOCK_LEGACY_STOCK_COUNT_CREATE=1`, `LEGACY_STOCK_COUNT_TELEMETRY=1` (staging-equivalent guardrails). Process stopped after run. |

---

## 1. Results table

| ID | Test case | Endpoint / action | Expected | Actual | Pass/Fail | Evidence notes |
|----|-----------|-------------------|----------|--------|-----------|----------------|
| IC-01 | Canonical create session | `POST /api/inventory-count/sessions` (body: `departmentId`, `locationIds`, `blindMode`, `notes`) | **201**, `DRAFT` session | **201**, `CNT-2605-0007`, status `DRAFT` on `:4000`; **201**, `CNT-2605-0009` on `:4010` | **Pass** | JSON from `node scripts/phase1-smoke-http-evidence.js` (default `BASE_URL`). |
| IC-02 | Canonical unaffected by legacy block flag | Same as IC-01 on server with `BLOCK_LEGACY_STOCK_COUNT_CREATE=1` | **201** (block applies only to `POST /api/stock-count`) | **201** on `:4010` | **Pass** | Same script output against `BASE_URL=http://localhost:4010/api`. |
| IC-03 | Full canonical workflow to POSTED | start → sheet → counts → submit → approve | No regression vs prior behavior | **Not executed** (out of minimal script scope) | **N/A** | Recommend full `scripts/smoke-inventory-count-phase1.js` on staging when convenient. |
| PL-01 | Period lock uses countDate / createdAt at post | `postInventoryCountSession` → `checkPeriodLock(tenantId, periodGuardDate)` | Guard date derived from **`session.countDate`** then **`createdAt`** | **Code path verified**; **no live `PERIOD_LOCKED_*` observed** | **Partial** | Implementation: ```603:610:OSE-backend/src/services/posting.service.js```. DB query: **zero** `period_close` rows with `status=CLOSED` for tenant `d7f5e85c-86f9-487d-b17d-708cebcf9ca3` — could not force a closed-period rejection without mutating finance data. |
| LG-01 | Legacy create blocked when env on | `POST /api/stock-count` with admin JWT | **403**, `error.code` = `LEGACY_STOCK_COUNT_CREATE_DISABLED` | **403**, code **`LEGACY_STOCK_COUNT_CREATE_DISABLED`**, message cites `/api/inventory-count/sessions` | **Pass** | Script output @ `http://localhost:4010/api`. |
| LG-02 | Legacy create allowed when env off | `POST /api/stock-count` | **201** when payload valid | **201**, `CNT-2605-0008` | **Pass** | Script output @ `http://localhost:4000/api` (blocking **not** enabled on that process). |
| RB-01 | Legacy evidence without auth | `GET /api/stock-count/:id/evidence` (no `Authorization`) | **401** | **401** | **Pass** | `Invoke-WebRequest` against `:4010` without header. |
| RB-02 | Legacy evidence with auth + view | `GET /api/stock-count/:id/evidence` with admin JWT | **200** for valid session id | **200** | **Pass** | Script step against `:4010`. |
| RB-03 | Approve route requires `VIEW_INVENTORY` | `POST /api/stock-count/:id/approve` without permission | **403** insufficient permission | **Not executed** (no seeded user lacking `VIEW_INVENTORY` / `INVENTORY_VIEW` in local DB) | **N/A** | Route enforces `requirePermission('VIEW_INVENTORY')` in ```20:26:OSE-backend/src/routes/stockCount.routes.js``` — validate on staging with a restricted JWT. |
| RB-04 | pdf / excel legacy require same permission | `GET .../evidence/pdf`, `GET .../evidence/excel` | Same as RB-02 pattern | **Not separately executed** (same middleware stack as evidence GET) | **N/A** | Same `requirePermission('VIEW_INVENTORY')` on routes in `stockCount.routes.js`. |
| TL-01 | Telemetry emits on legacy traffic | With `LEGACY_STOCK_COUNT_TELEMETRY=1`, any `/api/stock-count` request after auth | Winston **info** line JSON `event: legacy_stock_count_api` | **Observed** for `POST /api/stock-count`, `GET /api/stock-count?limit=1`, `GET .../evidence` | **Pass** | Server stdout log (PID 4010): lines show JSON with `method`, `path`, `tenantId`, `userId`, `role` only — **no** request body, counted qty, or notes. |
| TL-02 | Telemetry sensitive fields | — | Only approved correlation fields | **Pass** (fields: `event`, `method`, `path`, `tenantId`, `userId`, `role`) | **Pass** | Same log excerpt; `userId` is an internal UUID — treat per retention/GDPR policy (`INVENTORY_COUNT_STAGING_DEPLOYMENT_NOTES.md` §4). |

---

## 2. Raw evidence excerpts

### 2.1 Staging-equivalent server (`:4010`) — smoke script JSON

```json
{
  "baseUrl": "http://localhost:4010/api",
  "at": "2026-05-14T11:07:02.931Z",
  "steps": [
    { "name": "GET /locations", "status": 200 },
    { "name": "POST /inventory-count/sessions", "status": 201, "sessionNo": "CNT-2605-0009", "responseStatus": "DRAFT" },
    {
      "name": "POST /stock-count (legacy create)",
      "status": 403,
      "blocked": true,
      "code": "LEGACY_STOCK_COUNT_CREATE_DISABLED",
      "message": "Legacy stock-count session creation is disabled. Use POST /api/inventory-count/sessions."
    },
    { "name": "GET /stock-count/:id/evidence (if session exists)", "status": 200, "skipped": false }
  ]
}
```

### 2.2 Telemetry (Winston / server console, port 4010)

```text
{"event":"legacy_stock_count_api","method":"POST","path":"/api/stock-count","tenantId":"d7f5e85c-86f9-487d-b17d-708cebcf9ca3","userId":"f542ddf7-8c50-456e-9e37-6ac701e53c28","role":"ADMIN"}
{"event":"legacy_stock_count_api","method":"GET","path":"/api/stock-count?limit=1","tenantId":"d7f5e85c-86f9-487d-b17d-708cebcf9ca3","userId":"f542ddf7-8c50-456e-9e37-6ac701e53c28","role":"ADMIN"}
{"event":"legacy_stock_count_api","method":"GET","path":"/api/stock-count/e67869c5-bc7a-44ef-bdaa-b6c9cc25a28f/evidence","tenantId":"d7f5e85c-86f9-487d-b17d-708cebcf9ca3","userId":"f542ddf7-8c50-456e-9e37-6ac701e53c28","role":"ADMIN"}
```

### 2.3 Default server (`:4000`) — legacy create not blocked

- `POST /api/stock-count` → **201**, `sessionNo`: `CNT-2605-0008` (confirms guard is env-gated).

---

## 3. Errors / anomalies

| Item | Severity | Detail |
|------|----------|--------|
| PL-01 live period rejection | Low | No closed accounting period in local tenant DB — cannot observe `PERIOD_LOCKED_*` without executing period-close (side effect). |
| RB-03 / RB-04 | Low | No negative JWT for “missing VIEW_INVENTORY” in seed; route contract verified by **source** instead of HTTP. |
| IC-03 | Info | Full multi-step canonical workflow not re-run in this slice. |

---

## 4. Recommended next actions

1. **Run the same checks on named staging:** set env vars per `INVENTORY_COUNT_STAGING_DEPLOYMENT_NOTES.md`, then `BASE_URL=https://<staging-host>/api node scripts/phase1-smoke-http-evidence.js` (or Postman collection).  
2. **Close a test month** in a non-production tenant and re-run **PL-01** to capture a real `PERIOD_LOCKED_*` response on inventory-count approve/post.  
3. **RB-03:** Use a service account JWT **without** inventory view permission and confirm **403** on `POST /api/stock-count/:id/approve`.  
4. **Production:** keep `BLOCK_LEGACY_STOCK_COUNT_CREATE` **unset** until sign-off; telemetry only with secured sinks.

---

## 5. Reproducibility

| Artifact | Purpose |
|----------|---------|
| `OSE-backend/scripts/phase1-smoke-http-evidence.js` | Repeatable HTTP checks (uses Node **fetch**; no axios dependency). |

**Rollback:** stop temporary server; no schema or route changes were made during verification.
