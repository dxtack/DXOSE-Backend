# Inventory Count — Phase 1 smoke checklist (stabilization)

**Latest evidence run:** [`INVENTORY_COUNT_PHASE1_SMOKE_RESULTS.md`](INVENTORY_COUNT_PHASE1_SMOKE_RESULTS.md)

Use after deploying backend with staging env vars per `INVENTORY_COUNT_STAGING_DEPLOYMENT_NOTES.md`. Tick when verified.

---

## Preconditions

- [ ] Staging API base URL and valid JWT(s) for roles used below  
- [ ] `BLOCK_LEGACY_STOCK_COUNT_CREATE=1` on staging (for blocking checks)  
- [ ] `LEGACY_STOCK_COUNT_TELEMETRY=1` on staging (for log checks) — optional for minimal smoke if logs are unavailable  

---

## Canonical `/api/inventory-count`

- [ ] **Create session:** `POST /api/inventory-count/sessions` with a valid body (department, locations, etc. per API contract) returns **201** and a session payload — **not** affected by `BLOCK_LEGACY_STOCK_COUNT_CREATE` (that flag applies only to **`POST /api/stock-count`**).  
- [ ] **Period lock at post:** With a closed period covering the session’s **`countDate`** (or **`createdAt`** fallback used in `postInventoryCountSession`), final approve/post path returns period-lock error from `periodGuard.service.js` (e.g. `PERIOD_LOCKED_*`) — confirms posting uses **countDate/createdAt**, not arbitrary wall-clock bypass. *(Use a dedicated test tenant or documented period-close setup.)*  

---

## Legacy `/api/stock-count` — create guard

- [ ] With **`BLOCK_LEGACY_STOCK_COUNT_CREATE` enabled:** `POST /api/stock-count` returns **403** and `error.code` = **`LEGACY_STOCK_COUNT_CREATE_DISABLED`**.  
- [ ] With **`BLOCK_LEGACY_STOCK_COUNT_CREATE` unset/disabled:** same `POST` (valid body + `MANAGE_INVENTORY`) returns **201** — confirms guard is **env-gated** only.  

---

## Legacy `/api/stock-count` — route permissions

- [ ] **`POST .../approve`:** Request without **`VIEW_INVENTORY`** (or equivalent JWT permission) returns **403** `Insufficient permissions` / `required: VIEW_INVENTORY` from `requirePermission` middleware.  
- [ ] **`GET .../evidence`**, **`GET .../evidence/pdf`**, **`GET .../evidence/excel`:** Unauthenticated → **401**; authenticated without inventory view permission → **403**; user with **`VIEW_INVENTORY`** → **200** (for valid session id).  

---

## Telemetry (staging, when enabled)

- [ ] After one legacy route call, application log contains **`legacy_stock_count_api`** with `method`, `path`, `tenantId` (and optional `userId` / `role`).  

---

## Rollback sanity

- [ ] After removing both env vars and restart, legacy `POST /api/stock-count` create succeeds again (if still allowed by product) and telemetry lines stop for new requests.  

---

## Out of scope (do not fail checklist if unchanged)

- Route removal for `/api/stock-count`  
- Schema / migrations  
- Frontend UI  
- Report query logic  
