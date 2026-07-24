# LEGACY_STOCK_COUNT_SUNSET_PLAN

**Subject:** HTTP surface **`/api/stock-count`** and its vertical slice (routes → controller → service → `postStockCount`).  
**Canonical replacement:** **`/api/inventory-count`**.  
**ADR:** `docs/governance/decisions/ADR-001-inventory-count-canonical.md`

This plan describes **isolation, compatibility, migration, telemetry, staged deprecation, and removal conditions**. It does **not** authorize code removal by itself; each stage requires explicit phase exit criteria and change control.

---

## 1. Isolation approach

| Layer | Action |
|-------|--------|
| **Documentation** | Mark all new design and UAT to inventory-count only; legacy documented as compatibility (`WORKFLOW_MATRIX.md`, runbooks). |
| **Engineering discipline** | No new features on `stockCount.routes.js` / `stockCount.service.js` unless security-critical or legally required — prefer inventory-count. |
| **Mental model** | Treat `postStockCount` as **frozen** behavior: bugfixes only with regression tests on `test-stockcount-evidence.js` until retirement. |
| **RBAC naming** | Keep `STOCK_COUNT_*` permission codes for now (shared with canonical UI); renaming is **not** isolation-blocking — track as naming-debt. |

---

## 2. Compatibility strategy

| Consumer type | Expectation |
|---------------|-------------|
| **Existing integrations** | Legacy routes remain **binary-compatible** until deprecation stage 3+ |
| **Shared database** | Same `StockCountSession` store — sessions are not partitioned by API; compatibility is **behavioral** (posting path), not row-level |
| **Evidence** | Legacy evidence PDF/Excel remain available for historical audits even after UI de-emphasis |

---

## 3. Migration approach (non-destructive phases)

1. **Discover** — Maintain `STOCK_COUNT_DEPENDENCY_MAP.md` with each release scan.
2. **Redirect behavior (optional, later)** — API gateway 307/308 from selected legacy paths to inventory-count **only** where request shapes are compatible — **high risk**; requires payload mapping ADR.
3. **Client migration** — Move scripts (`test-stockcount-evidence.js` → inventory-count parity test) and external clients to canonical endpoints.
4. **Posting convergence** — Single posting function (future) — **explicitly out of scope** for current stabilization phase.
5. **Removal** — See §6.

---

## 4. Telemetry and logging approach

**Target signals (to implement when instrumentation phase opens):**

| Signal | Purpose |
|--------|---------|
| Counter / gauge: requests per route group `stock-count` vs `inventory-count` | Volume trend for sunset readiness |
| Structured log field `count.api_surface = legacy|canonical` on post | Audit trail of which engine ran |
| Alert on **new** tenant or API token using only legacy paths in a window | Migration prompting |

**Implemented (opt-in):** set environment variable **`LEGACY_STOCK_COUNT_TELEMETRY=1`** (or `true` / `yes`) so each request to `/api/stock-count/*` emits a structured JSON log line with `event: "legacy_stock_count_api"` (see `middleware/legacyStockCountTelemetry.js`). Stage **3** create-blocking: **`BLOCK_LEGACY_STOCK_COUNT_CREATE=1`**.

**Until instrumentation exists:** infer from reverse proxy access logs and integration inventories.

---

## 5. Deprecation stages (proposed)

| Stage | Name | Description |
|-------|------|---------------|
| **0** | **Documented dual** | Current stabilization — ADR + maps + plans (this repo state). |
| **1** | **Announce** | Release notes + internal comms: legacy is compatibility-only; no new adoptions. |
| **2** | **Instrument** | Telemetry from §4 live in non-prod, then prod. |
| **3** | **Restrict** | Feature flag or env to **block new session creation** via legacy (optional); existing sessions still completable — requires product sign-off. |
| **4** | **Read-only legacy** | Allow GET/evidence only; block mutating verbs — only if zero tenants need full legacy workflow. |
| **5** | **Remove** | Drop routes and dead code — only when §6 conditions satisfied. |

Stages may be **skipped or reordered** with governance approval; the table is a default sequencing reference.

---

## 6. Final removal conditions (all should be true)

1. **Telemetry** — Legacy mutating traffic **below agreed threshold** (e.g. zero for N consecutive months) across all production tenants, or explicit written waivers from each remaining consumer.
2. **Test parity** — Canonical inventory-count automated tests cover scenarios currently exercised only by `test-stockcount-evidence.js` (multi-step approval, evidence, ledger assertions).
3. **Ledger / audit** — Strategy for historical `referenceType: STOCK_COUNT` rows documented; reporting and exports verified after route removal in staging.
4. **Security** — No route weaker than canonical on approval/RBAC after any interim hardening.
5. **Governance** — Exception EX-001 resolved or superseded; `EXCEPTION_REGISTER.md` updated; stakeholder sign-off (Finance + Ops + Engineering).

---

## 7. Rollback

If stage 3+ causes production incidents:

- Re-enable legacy creation/posting via flag **without** schema rollback.
- Post-incident review updates this plan’s thresholds and timelines.

---

## Related

- `STOCK_COUNT_DEPENDENCY_MAP.md`
- `COUNT_TRUTH_UNIFICATION_PLAN.md`
- `EXCEPTION_REGISTER.md` — EX-001
