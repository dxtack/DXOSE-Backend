# Inventory Count — Reporting safety analysis (Phase 1)

| Field | Value |
|--------|--------|
| **Scope** | Backend reports … **Code:** slices **1–3** + **legacy evidence alignment** (`stockCountEvidence.service.js`); dashboards unchanged. |
| **Risk driver** | Canonical posting reads **`StockCountLocationQty`**; legacy **`StockCountLine`** can diverge. **Evidence exports** and targeted reports now prefer **cells** when counted cells exist; remaining risk is **non-export** code paths and **client** ledger `referenceType` misuse. |

---

## Summary index

| # | Question | Answer |
|---|----------|--------|
| 1 | Already **canonical-safe**? | **`summaryReport.service.js`** (variance via ledger `COUNT_ADJUSTMENT` only); **`inventoryCount.service.js`** variances/sheets/PDF payload (cell-based); **ledger replay paths** that bucket `COUNT_ADJUSTMENT` without filtering `referenceType` (e.g. movement aggregation in `report.service.js`). |
| 2 | **Legacy-dependent**? | **Evidence pack** (`stockCountEvidence.service.js`): **cell-first** when counted cells exist. **`report.service.js`** variance physical: slice **3**. **`getStockReport`** / **`getCountVariances`**: slices **2** / **1**. |
| 3 | **Silently miss** canonical cell data? | **Addressed** for variance, stock report, generated variance, and **legacy evidence** exports. Residual: bespoke scripts / old PDFs cached offline, not in-repo readers. |
| 4 | **Double-count**? | **Low** in current code: no single report found that **adds** line-based physical **and** cell-based ledger for the same field. Risk is **under**-representation, or comparing a **physical** column to **ledger** that includes both `STOCK_COUNT` and `COUNT_SESSION` origins. |
| 5 | **StockCountLine-only** assumptions? | **Draft legacy `updateLines`** and other non-evidence paths. Evidence + slices **1–3** use **cells when present**. |
| 6 | **Exports at reconciliation risk**? | **Legacy evidence** aligned (Phase A). **Generated variance** slice **3** implemented. |
| 7 | **Ledger readers** `STOCK_COUNT` vs `COUNT_SESSION`? | **`ledger.service.js`** — **no** `referenceType` filter (safe for totals; **cannot** split count origin without an explicit filter). **`stockCount.controller`** evidence loads ledger by `referenceId: session.id` only. **`scripts/dump-ledgers.js`** — `COUNT_ADJUSTMENT` only. |
| 8 | **Dashboard** after sunset? | **`dashboard.service.js`** — `stockCountSession.count` for pending tasks: **model-wide**, not line/cell; **unchanged** by `referenceType`. Risk is **semantic** (“pending count”), not numeric double-count. |

---

## Detailed matrix (report / service)

| Report / service | Entry / route (approx.) | Current truth source | Canonical compatibility | Risk | Reconciliation risk | Legacy dependency | Stabilization approach (analysis-only) | Future migration |
|------------------|---------------------------|----------------------|-------------------------|------|----------------------|--------------------|----------------------------------------|------------------|
| **Inventory count — variances API** | `GET /api/inventory-count/sessions/:id/variances` · `inventoryCount.service.js` | **`StockCountLocationQty`** (+ session state rules) | **Canonical-safe** | Low | Aligns with **posting** engine | None for reads | Keep as declared operational variance; align with `REPORT_TRUTH_CATALOG.md` | None critical |
| **Inventory count — sheets / export / upload** | `inventoryCount.service.js` | **Cells** | **Canonical-safe** | Low | Same as posting path | N/A | UAT: export vs screen | N/A |
| **Inventory count workflow PDF** | `pdf.service.js` `generateInventoryCountWorkflowPDF` | Payload from **canonical** service | **Canonical-safe** | Low | N/A | N/A | Keep | N/A |
| **Summary inventory (departmental)** | `GET /api/reports/summary-inventory` · `summaryReport.service.js` | Ledger **`COUNT_ADJUSTMENT`** in period (no `referenceType` filter) | **Canonical-safe** for **posted** adjustments | Low–Med | Session variance screen ≠ summary formula (already in catalog); **not** line vs cell | None | Glossary + export labels | Optional: sub-bucket by `referenceType` for diagnostics only |
| **OMC / generated movement reports** | `POST /api/reports/generate` · `report.service.js` | Ledger buckets; **`COUNT_ADJUSTMENT`** handled with `ADJUSTMENT` | **Canonical-safe** for ledger totals | Low | Physical column in *other* reports may disagree | N/A | Cross-check `REPORT_TRUTH_CATALOG.md` | N/A |
| **Valuation (as-of)** | `report.service.js` replay | Ledger rows | **Canonical-safe** | Low | N/A | N/A | N/A | N/A |
| **Stock Count Variance report** | `reports.service.js` **`getCountVariances`** · `reports.controller.js` | **`StockCountLocationQty`** (latest round per item×location) when any counted cells exist; else **`StockCountLine`** | **Canonical-safe** (cell-first) | **Low** (residual: WAC from line only) | WAC/value column may be **0** if no matching line for item | **Fallback** to lines | **Implemented** slice 1 (`INVENTORY_COUNT_REPORTING_FIX_PLAN.md` §1) | Optional shared helper dedupe |
| **Generated variance / physical (`report.service`)** | `generateReport` SUMMARY/DETAIL · `report.service.js` `generateVarianceReport` | **`StockCountLocationQty`** (latest round per item×location per touched report location) when session has counted cells; else **`StockCountLine`** once per session | **Canonical-safe** (cell-first) | **Med** | `physicalQty` / variance columns can shift vs pre–slice‑3 for scoped/cell sessions | Line **fallback** | **Implemented** slice 3; smoke `smoke-generatedVariance-physical-reconciliation.js` | Optional shared helper with slices 1–2 |
| **Live stock report (`getStockReport`)** | `stockReport.service.js` | Latest **POSTED** session **touching** each report location (primary **or** scoped); **`StockCountLocationQty`** (latest round per item×location) when session has counted cells; else **`StockCountLine`** at **primary** location only | **Canonical-safe** (cell-first) | **Med** | `physicalCount` / `physicalVariance` can shift vs pre–slice‑2 for scoped/cell-only posted sessions | Line **fallback** | **Implemented** slice 2; smoke `smoke-stockReport-physical-reconciliation.js` | Optional shared helper with slice 3 |
| **Legacy stock count evidence** | `GET /api/stock-count/:id/evidence` · `stockCountEvidence.service.js` **`buildEvidencePack`** | **`StockCountLocationQty`** (latest round) merged with **`StockCountLine`** for WAC / line-only rows; else **lines only** | **Canonical-safe** when counted cells exist | **Med** | WAC from line; orphan cells **WAC 0**; evidence **`totalItems`** = detail row count | Line **fallback** | **`LEGACY_EVIDENCE_ALIGNMENT_PLAN.md`** Phase A | HTTP smoke; dedupe `pickLatest` helper |
| **Ledger API list** | `GET /api/ledger` · `ledger.service.js` | **`inventoryLedger`**; optional `movementType` | **Safe** for including all count posts | Low | Clients filtering **`referenceType = STOCK_COUNT`** only would **drop** `COUNT_SESSION` | Filter misuse (client) | Document: count adjustments = **`COUNT_ADJUSTMENT`** + both reference types until normalization | Optional `referenceType` query parameter (future) |
| **Movement history report** | `reports.service.js` | Ledger / movements | **Safe** if `COUNT_ADJUSTMENT` not excluded | Low | User-defined filters | N/A | Verify export matches filter | N/A |
| **Dashboard pending inventories** | `dashboard.service.js` `stockCountSession.count` | **Session status** | **Compatible** | Low | Counts **sessions**, not line/cell | N/A | None | After legacy route sunset, metric still valid |
| **Admin / scripts** | `scripts/dump-ledgers.js` | `COUNT_ADJUSTMENT` | **Safe** | Low | N/A | N/A | N/A | Optional split by `referenceType` in dump |

---

## Code anchors (for reviewers)

| Topic | Location |
|--------|----------|
| Physical from **cells + line fallback** (generated variance) | ```262:310:OSE-backend/src/services/report.service.js``` (helpers: ```14:26:OSE-backend/src/services/report.service.js```) |
| Physical from **cells + line fallback** (live stock report) | ```212:284:OSE-backend/src/services/stockReport.service.js``` (helpers: ```15:28:OSE-backend/src/services/stockReport.service.js```) |
| Count variance report (**cell-first**) | `getCountVariances` in `OSE-backend/src/services/reports.service.js` |
| Canonical posting from **cells** | ```608:617:OSE-backend/src/services/posting.service.js``` |
| Legacy evidence (**cell-first pack**) | `OSE-backend/src/services/stockCountEvidence.service.js` · `stockCount.controller.js` (`buildEvidencePayload`) |
| Ledger list filters | ```15:49:OSE-backend/src/services/ledger.service.js``` |

---

## Double-count note

No backend report was found that **sums** `StockCountLine` physical **and** `StockCountLocationQty` for the **same** KPI in one pipeline. The dominant failure mode is **omission** or **stale line** data vs **ledger** that already reflects cell-based posting.

---

## Recommended next actions (later phases; not in this doc)

1. **Legacy evidence** cell-first alignment **done** (`LEGACY_EVIDENCE_ALIGNMENT_PLAN.md`). Slices **1–3** complete for targeted reports.  
2. **Single reconciliation chain:** operational truth = **`/inventory-count/.../variances`** + **ledger `COUNT_ADJUSTMENT`**; treat line-only reports as **legacy**.  
3. **Migration (future):** one read-model “**effective counted qty by item×location×session**” preferring cells, falling back to lines for old sessions — then wire reports once.

---

## Related governance

- `REPORT_TRUTH_CATALOG.md`  
- `FOUNDATION_GAP_ANALYSIS.md` §8  
- `COUNT_TRUTH_UNIFICATION_PLAN.md`  
- `docs/governance/decisions/ADR-001-inventory-count-canonical.md`
