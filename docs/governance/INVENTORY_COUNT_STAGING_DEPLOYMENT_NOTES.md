# Inventory Count — Staging deployment & verification (Phase 1)

| Field | Value |
|--------|--------|
| **Purpose** | Controlled stabilization: legacy create guard + optional telemetry **in staging only** |
| **Scope** | Environment configuration, verification, rollback — **no** route removal, schema, data migration, UI, or reporting logic changes |

---

## 1. Environment variables

| Variable | Staging | Production (current guidance) |
|----------|---------|----------------------------------|
| `BLOCK_LEGACY_STOCK_COUNT_CREATE` | Set to `1`, `true`, or `yes` | **Leave unset** (or explicit `0` / `false`) — do **not** block legacy create until product/integration sign-off |
| `LEGACY_STOCK_COUNT_TELEMETRY` | Set to `1`, `true`, or `yes` | **Optional** — enable only if log sinks are access-controlled and retention complies with policy (see §4) |

Reference implementation: `OSE-backend/src/controllers/stockCount.controller.js`, `OSE-backend/src/middleware/legacyStockCountTelemetry.js`, `OSE-backend/src/routes/stockCount.routes.js`.

Example file in repo (tracked): `OSE-backend/.env.staging.example` — copy into staging secrets or merge into staging env; **not** loaded automatically by Node unless your deploy process sources it.

```env
BLOCK_LEGACY_STOCK_COUNT_CREATE=1
LEGACY_STOCK_COUNT_TELEMETRY=1
```

---

## 2. Staging — expected behavior

1. **`POST /api/stock-count`** (legacy create) returns **403** with body containing `error.code` = `LEGACY_STOCK_COUNT_CREATE_DISABLED` and message pointing to **`POST /api/inventory-count/sessions`**.
2. **Every authenticated request** under `/api/stock-count/*` emits a structured log line when telemetry is on (see §5).
3. **Canonical flow unchanged:** `POST /api/inventory-count/sessions` and the rest of the inventory-count API work as before.
4. Legacy **approve** and **evidence** routes still exist but require **`VIEW_INVENTORY`** (JWT / permission matrix); step-level approval remains enforced in `stockCount.service.js`.

---

## 3. Verify legacy create returns 403 (staging)

Prerequisites: valid bearer token with `MANAGE_INVENTORY` (or alias that resolves to inventory manage permission used on legacy create route).

```http
POST /api/stock-count
Content-Type: application/json
Authorization: Bearer <token>

{ "locationId": "<valid-location-uuid>", "notes": "staging guard test" }
```

**Expected (staging, blocking on):** HTTP **403**, JSON includes:

- `error.code`: `LEGACY_STOCK_COUNT_CREATE_DISABLED`
- Reference to canonical path `/api/inventory-count/sessions`

**Expected (production or staging with blocking off):** HTTP **201** (session created) when payload and permissions are valid.

---

## 4. Telemetry — safety and production

**What is logged** (when `LEGACY_STOCK_COUNT_TELEMETRY` is truthy): JSON string via Winston with fields roughly:

- `event`: `legacy_stock_count_api`
- `method`, `path` (URL)
- `tenantId`, `userId`, `role` (from `req.user`)

**Risks:** `userId` and tenant identifiers are **identifiers** suitable for operational correlation; they may be treated as sensitive under GDPR / internal policy. Route paths do not include request bodies (no counted quantities in this log line).

**Production:** Prefer **off** until security/compliance approves sink access and retention. If enabled, route logs only to secured aggregation (e.g. restricted CloudWatch / ELK space), not public channels.

---

## 5. Verify telemetry logs (staging)

1. Deploy with `LEGACY_STOCK_COUNT_TELEMETRY=1`.
2. Issue any authenticated call under `/api/stock-count` (e.g. `GET /api/stock-count` or the blocked `POST` — telemetry middleware runs **after** `authenticate`, before handler; a 403 on create still hits the middleware **after** auth, so a line is emitted for that request).
3. Inspect backend logs (`logs/all.log` if using default file transport from `utils/logger.js`, or container stdout).

**Expected:** At least one line containing `legacy_stock_count_api` and the JSON payload with `method`, `path`, `tenantId`.

---

## 6. Rollback

1. Remove `BLOCK_LEGACY_STOCK_COUNT_CREATE` from staging **or** set to `0` / `false`.
2. Remove `LEGACY_STOCK_COUNT_TELEMETRY` or set to `0` / `false`.
3. Restart the API process so `process.env` reloads.

No database migration or code rollback is required for env-only rollback.

---

## Related

- `STOCK_COUNT_DEPENDENCY_MAP.md` — §12 runtime configuration  
- `LEGACY_STOCK_COUNT_SUNSET_PLAN.md` — deprecation stages  
- `INVENTORY_COUNT_PHASE1_SMOKE_CHECKLIST.md` — verification steps after deploy  
- `INVENTORY_COUNT_PHASE1_SMOKE_RESULTS.md` — evidence log (pass/fail per run)  
