# Inventory Count — Reporting fix plan (controlled stabilization)

| Field | Value |
|--------|--------|
| **Goal** | Remove **silent mismatch** between canonical count data (`StockCountLocationQty`) and legacy line-based report readers (`StockCountLine` / `session.lines`). |
| **Constraints** | Do **not** remove legacy workflows, `StockCountLine`, or UI; do **not** normalize `referenceType`; no historical data migration; **read-path** changes only, with explicit fallbacks. |

---

## Rollout order (by blast radius × trust gain)

| Order | Target | Rationale |
|-------|--------|-----------|
| **1** | `reports.service.js` — **`getCountVariances`** | Single report API; discrete consumers; **highest trust gain** per line of code; easy rollback (revert one function). |
| **2** | `stockReport.service.js` — **`physicalCount` / `physicalVariance`** | Live stock report; broader blast radius; depends on per-location session selection logic. |
| **3** | `report.service.js` — **generated variance physical counts** | OMC / generated variance paths; must stay aligned with (2) where both expose “physical”. |

**Status:** Slice **1** ✅ (`reports.service.js` — `getCountVariances`). Slice **2** ✅ (`stockReport.service.js`). Slice **3** ✅ (`report.service.js` — `generateVarianceReport` physical aggregation).

---

## Slice 1 — `getCountVariances` (implemented)

| Item | Detail |
|------|--------|
| **Affected** | `OSE-backend/src/services/reports.service.js` → `getCountVariances` |
| **Current read path (before)** | `stockCountSession.findMany` → `session.lines` only (`countedQty !== null`). |
| **Target read path** | Prefer **latest round per `(itemId, locationId)`** from **`StockCountLocationQty`** where `countedQty` is set; build one report row per cell (location name from cell). |
| **Fallback** | If a session has **no** counted cells, use **existing line-based** rows (legacy / line-only sessions). |
| **WAC / variance value** | `wacUnitCost` from matching **`StockCountLine`** by `itemId` when present; else **0** (value column 0 — same limitation as before for items without lines). |
| **Location filter** | When `locationId` is passed: `where` includes sessions whose **primary** `locationId` **or** **`scopedLocations`** matches; cell iteration filters to that `locationId`. |
| **Reconciliation risk** | Low–medium: totals may **change** vs previous line-only export for canonical sessions (intended). Consumers comparing to **ledger** should still use `COUNT_ADJUSTMENT`; this report is **operational variance listing**. |
| **Smoke requirements** | **Recorded:** `INVENTORY_COUNT_REPORTING_SMOKE_RESULTS.md` (local run). **Staging:** complete §5 checklist there before slice 2. |
| **Rollback** | Revert `getCountVariances` (and optional `where` clause) to prior line-only implementation; no schema change. |

---

## Slice 2 — `stockReport.service.js` (implemented)

| Item | Detail |
|------|--------|
| **Affected** | `getStockReport` physical block (§6 “PHYSICAL COUNT”) |
| **Previous** | Latest `POSTED` session per **primary** `locationId` only + sum **`stockCountLine.countedQty`** by `itemId` (scoped canonical locations could be missed). |
| **Implemented** | Latest `POSTED` session per report **`locationId`** where session **`locationId`** **or** **`scopedLocations`** matches that store; per location aggregate from **`StockCountLocationQty`** using **latest `roundNo` per `(itemId, locationId)`** (same ordering rule as slice 1). **Session-level** fallback: if the session has **no** counted cells anywhere, use **`StockCountLine`** at **primary `locationId` only** (avoids double-counting the same line when a legacy session appears under multiple scoped rows). |
| **Double-count** | Cells and lines are **not** combined for the same session; cell path preferred whenever the session has any counted `StockCountLocationQty`. |
| **Location scope** | “Respect location filter” = each column in the live report is built from the report’s **department/category location set**; each location independently resolves its latest touching `POSTED` session and then sums cells **at that location** (or primary-only lines in legacy fallback). |
| **Reconciliation risk** | Medium: `physicalCount` / `physicalVariance` can change vs pre–slice‑2 for canonical multi-location or cell-only posted sessions. |
| **Smoke** | `OSE-backend/scripts/smoke-stockReport-physical-reconciliation.js` (read-only + `SMOKE_STOCK_REPORT_PHYSICAL=1` fixtures). |
| **Rollback** | Revert the §6 physical block + helper functions in `stockReport.service.js` only; no schema. |

---

## Slice 3 — `report.service.js` generated variance (implemented)

| Item | Detail |
|------|--------|
| **Affected** | `generateVarianceReport` — §4 physical aggregation (SUMMARY / DETAIL generated reports). |
| **Previous** | `stockCountSession.findMany` with **`locationId: { in: locationIds }`** only (missed scoped-only sessions) + sum **`StockCountLine.countedQty`** per session. |
| **Implemented** | Sessions in **`countDate`** range, **`POSTED`**, where **primary** `locationId` **or** **`scopedLocations`** intersects report `locationIds`. Per session: if **any** `StockCountLocationQty.countedQty` is set → for each **touched** report location, add **latest round** cells per `(itemId, locationId)` into **`physicalCounts[itemId]`**; else **legacy** → sum lines **once** per session (no per-location line duplication). Items restricted to those already in the variance **`itemMap`** (from stock balances). |
| **Double-count** | Cells and lines are **not** combined; line path only when the session has **no** counted cells. Multiple sessions in range still **sum** contributions (unchanged aggregation semantics). |
| **Fallback** | `StockCountLine` rows with `countedQty` when session has no counted cells. |
| **Reconciliation risk** | Medium: `physicalQty` / `varianceQty` / `varianceValue` can shift for canonical scoped or cell-only sessions vs line-only reader. |
| **Smoke** | `OSE-backend/scripts/smoke-generatedVariance-physical-reconciliation.js` (read-only + `SMOKE_GENERATED_VARIANCE_PHYSICAL=1`). **`generateVarianceReport`** is exported for programmatic smoke (no `GeneratedReport` row created in read-only/fixture paths). |
| **Rollback** | Revert §4 block + top-of-file helpers + remove `generateVarianceReport` from `module.exports` if export rollback desired. |

---

## Cross-cutting

| Topic | Approach |
|-------|----------|
| **Shared helper (future)** | Optional extract `pickLatestCountedCells` / session resolution to `inventoryCountReport.helpers.js` — **three** copies now aligned (slices 1–3). |
| **Documentation** | `INVENTORY_COUNT_REPORTING_SAFETY_ANALYSIS.md` and `INVENTORY_COUNT_REPORTING_SMOKE_RESULTS.md` updated for slices **1–3**. |
| **referenceType** | Out of scope until separate ADR/migration. |

---

## Related

- `INVENTORY_COUNT_REPORTING_SAFETY_ANALYSIS.md`  
- `LEGACY_EVIDENCE_ALIGNMENT_PLAN.md` — legacy `/stock-count/:id/evidence` + PDF + Excel cell-first alignment  
- `INVENTORY_COUNT_REPORTING_SMOKE_RESULTS.md` — slices 1–3 + legacy evidence smoke  
- `COUNT_TRUTH_UNIFICATION_PLAN.md`  
- `REPORT_TRUTH_CATALOG.md`
