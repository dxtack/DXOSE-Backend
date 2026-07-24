# Legacy stock-count evidence alignment (post–slices 1–3)

| Field | Value |
|--------|--------|
| **Goal** | Close the remaining **line-only truth** gap for **`GET /stock-count/:id/evidence`**, PDF, and Excel exports so they **do not silently disagree** with canonical **`StockCountLocationQty`** when counted cells exist. |
| **Constraints** | No UX/dashboard redesign; no `referenceType` normalization; no data migration; **read/export path** only; legacy routes retained; reversible. |

---

## Problem statement

Legacy evidence (`buildEvidenceJSON` and dependents) summarized **`session.lines`** only. Sessions posted via **canonical inventory count** can have **authoritative counts on `StockCountLocationQty`** while **`StockCountLine.countedQty`** is empty or **stale**, causing evidence variance totals and line tables to **under-report** or disagree with ledger-backed truth.

---

## Implemented slice (Phase A — minimal)

| Item | Detail |
|------|--------|
| **New module** | `OSE-backend/src/services/stockCountEvidence.service.js` — **`buildEvidencePack(session, tenantId)`** |
| **Controller** | `stockCount.controller.js` — `getEvidencePack`, `downloadEvidencePdf`, `downloadExcel` call **`buildEvidencePack`**; JSON response omits internal **`excelRows`**; Excel iterates **`excelRows`**. |
| **Philosophy** | Same as slices 1–3: **session has any counted cell** → **cell-first** using **latest `roundNo` per `(itemId, locationId)`**; else **full `StockCountLine`** rows (legacy). |
| **Merge rule** | For each **`StockCountLine`**: if latest counted cells exist for that **`itemId`**, emit **one evidence row per cell** (WAC from the matching line; book/count/variance from cell). If **no** cells for that item, emit **one row from the line** (unchanged legacy). Orphan cells (no line) still emit one row (**WAC 0**). |
| **Labels** | When the cell is at a **non-primary** session location or the item has **multiple** latest cells, the evidence **`item`** label is **`Name @ Location`** so PDF/JSON stay readable without layout changes. |
| **PDF** | **`generateStockCountEvidencePDF`** unchanged — consumes the same **`evidence.lines`** shape produced by the service. |
| **Smoke** | `OSE-backend/scripts/smoke-legacy-evidence-alignment.js` (in-memory **legacy vs canonical** row assertions). |

---

## Rollback

1. Delete **`stockCountEvidence.service.js`**.  
2. Restore **`stockCount.controller.js`** to inline **`buildEvidenceJSON`** using **`session.lines`** only (pre-alignment version).  
3. Restore Excel loop over **`session.lines`** and summary filters on **`session.lines`**.  
4. Remove smoke script reference from governance docs (optional).

No schema or route changes.

---

## Residual risks (honest)

| Risk | Severity | Notes |
|------|----------|--------|
| **WAC / value** | Low–Med | Cell path uses **`StockCountLine.wacUnitCost`** for that item; orphan cell rows use **0** WAC. Matches slice 1 value limitation. |
| **`totalItems` semantics** | Low | Summary **`totalItems`** now follows **evidence row count** (can exceed **`session.lines.length`** when one line fans out to multiple locations). Intentional for reconciliation. |
| **Ledger / evidence** | Low | Ledger section still **`referenceId`**-scoped; **`referenceType`** split not addressed (out of scope). |
| **Multi-round** | Low | Mitigated via **`pickLatestCountedCells`** on `locationQtys`. |

---

## Out of scope (future phases)

- **`referenceType`** diagnostics on evidence ledger block.  
- **Shared helper** extraction (`pickLatestCountedCells` dedupe across 4 files).  
- **HTTP E2E** evidence with real JWT (optional staging checklist).  

---

## Related

- `INVENTORY_COUNT_REPORTING_FIX_PLAN.md`  
- `INVENTORY_COUNT_REPORTING_SAFETY_ANALYSIS.md`  
- `INVENTORY_COUNT_REPORTING_SMOKE_RESULTS.md`
