# Inventory Count — Reporting smoke results (slices 1–3 + legacy evidence)

| Field | Value |
|--------|--------|
| **Scope** | **Slices 1–3** (see §7–§8) + **Legacy evidence alignment** (§9): `stockCountEvidence.service.js` / evidence JSON, PDF, Excel. |
| **Reporting stabilization** | Slices **1–3** + **legacy evidence** (`StockCountLocationQty` first, `StockCountLine` fallback) per governance plans. |
| **Run date (UTC)** | 2026-05-14 |
| **Environment** | Local DB (`DATABASE_URL` → **Grand Horizon Hotel**), scripts under `OSE-backend/scripts/`. |

---

## 0. Controlled fixture evidence (G2 / G3 / multi-round)

**Purpose:** Seed data did not include a pure legacy-only session, a true multi-location counted session, or DB rows with multiple counted rounds for the same `(sessionId, itemId, locationId)`. To close slice‑1 reconciliation without changing production seeds or report code, the script supports **opt‑in disposable sessions** (create → assert → delete).

**Command (local/staging only — never against production):**

```bash
cd OSE-backend && SMOKE_REPORTING_FIXTURES=1 node scripts/smoke-getCountVariances-reconciliation.js
```

**Windows PowerShell:**

```powershell
cd OSE-backend; $env:SMOKE_REPORTING_FIXTURES = "1"; node scripts/smoke-getCountVariances-reconciliation.js
```

**Behavior:** Creates three `StockCountSession` rows under the first active tenant (with `StockCountLine` / `StockCountLocationQty` / `StockCountSessionLocation` as required), runs `getCountVariances` inside the usual 14‑month date window, prints JSON evidence, then **deletes** those sessions (cascade). **No** prisma seed files are modified.

### 0.1 Captured run (2026-05-14, Grand Horizon Hotel)

| Gate | Scenario | Session ID (ephemeral) | Session no. | Expected vs actual | Location filter | Pass |
|------|-----------|-------------------------|---------------|---------------------|------------------|------|
| **G2** | Legacy-only: lines with `countedQty`, **no** counted `StockCountLocationQty` | `66ae2456-263e-4aba-99a5-f4a1ea244402` | `SMOKE-G2-mp5et8ky` | Rows **1** / **1**; counted **12** / **12**; `locationName` **Engineering Store** (session primary `location`, line path) | N/A | **Pass** |
| **G3** | Multi-location canonical: counted cells in **Engineering Store** + **F&B Store**; scoped to both | `2bb03769-60db-464d-a3ee-8c543d890f97` | `SMOKE-G3-mp5et8ky` | Unfiltered rows **2** / **2**; names **Engineering Store**, **F&B Store** (match `cell.location.name`) | `locationId` = `c031c268-194d-4211-beb8-0910da8f131d` (F&B Store) → **1** row, `locationName` **F&B Store**, `countedQty` **8** | **Pass** |
| **G4** | Multiple rounds, same item/location | `ed3b9b99-f4b1-48ed-bcc6-c7d2d35c94ac` | `SMOKE-G4-mp5et8ky` | DB **2** counted rounds; report rows **1** / **1**; `countedQty` **99** (round 2, not 10) | N/A | **Pass** |

**Reconciliation notes**

- **G2:** Confirms the **legacy branch** (`session.lines` with `countedQty !== null`) runs when `pickLatestCountedCells` returns **no** counted cells for the session.
- **G3:** Confirms **one row per latest counted `(itemId, locationId)`**, names from **`StockCountLocationQty.location`**, and **`locationId` filter** restricts to the scoped location via `where.OR` + cell filter in `pickLatestCountedCells`.
- **G4:** Confirms **no duplicate rows** for two rounds; quantity matches **highest `roundNo`** with `countedQty` set.

**Ephemeral IDs:** Rows above were **removed** after the script finished. Re-run fixture mode to obtain new UUIDs; `sessionNo` prefix remains `SMOKE-G2|G3|G4-` + timestamp token.

**Overall fixture result:** `overallPass`: **true** (script exit code **0**).

---

## 1. Goals vs outcomes

| # | Verification goal | Result | Pass / N/A / Fail |
|---|---------------------|--------|-------------------|
| G1 | Canonical sessions (**`StockCountLocationQty`**) appear in Count Variances | Fixture **`CNT-2605-0006`**: **1** report row; **`locationName`** = **Engineering Store** (cell location); counts from cell (`countedQty` 150, `varianceQty` 150). **`canonicalRowCountMatch`:** `true`. | **Pass** |
| G2 | Legacy sessions (**`StockCountLine`** fallback) still work | **No** long-lived seed session in window; **Pass** via **§0 fixture** (legacy-only session, then deleted). | **Pass** (fixture) |
| G3 | Multi-location: rows, filter, location names | **No** multi-loc seed in window; **Pass** via **§0 fixture** (two counted locations + filter). | **Pass** (fixture) |
| G4 | Latest-round: no duplicate `(item,location)` rows | Seed DB: **0** SQL groups with multiple counted rounds; **Pass** via **§0 fixture** (two rounds → one row, latest qty). | **Pass** (seed vacuous + fixture) |
| G5 | WAC / variance value stability | Sample row: **`wacUnitCost`: 0**, **`varianceValue`: 0** when line WAC missing; aggregate **`totalVarianceValue`** can be **0** with non-zero qty variance — **known**. | **Pass** (expected) |

---

## 2. Scenario table (structured)

| ID | Test scenario | Session type | Location setup | Expected | Actual | Pass/Fail | Reconciliation notes |
|----|----------------|--------------|------------------|----------|--------|------------|----------------------|
| S1 | Canonical cell row surfaces | Canonical (`CNT-2605-0006`) | Single counted cell at **Engineering Store** | ≥1 row; `locationName` from cell | **1** row; `Engineering Store`; book 0 / counted 150 / var 150 | **Pass** | Qty trust from cells |
| S2 | Legacy line fallback | Fixture `SMOKE-G2-*` (§0) | Primary **Engineering Store** | **1** line row, no cells | **1** row; counted **12**; name from session `location` | **Pass** | Fixture-only until a permanent legacy tenant exists on staging |
| S3 | `locationId` filter + scoped session | Fixture `SMOKE-G3-*` (§0) | Scoped **Engineering Store** + **F&B Store** | **2** rows unfiltered; **1** row filtered to F&B | Matches | **Pass** | Filter + `cell.location` names aligned |
| S4 | Multi-round dedup | Fixture `SMOKE-G4-*` (§0) | Rounds 1 and 2 same cell | **1** row; latest `countedQty` **99** | Matches | **Pass** | Aligns with `pickLatestCountedCells` |
| S5 | HTTP parity (optional) | Same as S1 | `GET /api/reports/variance?...` | JSON row count matches service | **Not executed** | **Pending** | Optional staging check |

---

## 3. Raw script output (evidence)

### 3.1 Read-only probe (default)

```json
{
  "mode": "read_only",
  "hint": "Set SMOKE_REPORTING_FIXTURES=1 to create temporary sessions proving G2 legacy-only, G3 multi-location, G4 multi-round (then delete).",
  "tenant": "Grand Horizon Hotel",
  "dateRange": { "dateFrom": "2025-03-14", "dateTo": "2026-05-14" },
  "fixtures": {
    "canonicalSessionNo": "CNT-2605-0006",
    "legacySessionNo": null,
    "multiSessionNo": "CNT-2605-0006",
    "multiDistinctCountedLocations": 1,
    "filterLocationIdUsed": null,
    "sessionsWithMultiRoundSameCell": 0
  },
  "canonicalRowCount": 1,
  "cellLatestDistinctCount": 1,
  "canonicalRowCountMatch": true,
  "legacyRowCount": 0
}
```

### 3.2 Fixture mode (`SMOKE_REPORTING_FIXTURES=1`)

See **§0.1** for the structured table. Full JSON from the passing run included `g2_legacyOnly`, `g3_multiLocation`, `g4_multiRound`, and `overallPass: true`.

---

## 4. Reconciliation interpretation

1. **Qty trust (canonical):** For **`CNT-2605-0006`**, report row count **matches** latest distinct counted cells.  
2. **Legacy trust:** Fixture **G2** proves line-only sessions still produce rows when no counted cells exist.  
3. **Multi-location + filter:** Fixture **G3** proves row cardinality, `locationName` from the cell’s location, and `locationId` query narrowing.  
4. **Latest round:** Fixture **G4** proves a single effective row per `(itemId, locationId)` with quantities from the **latest** round.  
5. **Value trust:** When lines lack WAC for cell-only items, **`varianceValue`** may be **0** — not a slice‑1 regression; finance should use sessions with line WAC populated if value control is required.

---

## 5. Staging checklist (optional hardening)

- [x] **Legacy fallback:** covered by **fixture mode** locally; repeat on staging if policy requires evidence on tenant clone data.  
- [x] **Multi-location:** covered by **fixture mode** locally.  
- [x] **Multi-round:** covered by **fixture mode** locally.  
- [ ] **WAC:** session where lines exist for same items as cells → `wacUnitCost` > 0 where expected (still useful on staging).

**Commands:**

```bash
cd OSE-backend && node scripts/smoke-getCountVariances-reconciliation.js
cd OSE-backend && SMOKE_REPORTING_FIXTURES=1 node scripts/smoke-getCountVariances-reconciliation.js
cd OSE-backend && node scripts/smoke-stockReport-physical-reconciliation.js
cd OSE-backend && SMOKE_STOCK_REPORT_PHYSICAL=1 node scripts/smoke-stockReport-physical-reconciliation.js
cd OSE-backend && node scripts/smoke-generatedVariance-physical-reconciliation.js
cd OSE-backend && SMOKE_GENERATED_VARIANCE_PHYSICAL=1 node scripts/smoke-generatedVariance-physical-reconciliation.js
cd OSE-backend && node scripts/smoke-legacy-evidence-alignment.js
```

---

## 6. Rollback

- **Slice 1:** Revert **`getCountVariances`** + helpers + scoped **`where.OR`** in `reports.service.js`; no migration.  
- **Slice 2:** Revert the **§6 physical count** block and **`pickLatestCountedCells` / `sessionHasAnyCountedCells`** in `stockReport.service.js` only.  
- **Slice 3:** Revert **`generateVarianceReport`** §4 physical block + helpers at top of `report.service.js`; remove **`generateVarianceReport`** from **`module.exports`** if rolling back the smoke export surface.  
- **Legacy evidence:** Revert **`stockCount.controller.js`** to inline line-only **`buildEvidenceJSON`** + Excel loop on **`session.lines`**; remove **`stockCountEvidence.service.js`**. See **`LEGACY_EVIDENCE_ALIGNMENT_PLAN.md`**.

---

## 7. Slice 2 — Live stock report (`physicalCount` / `physicalVariance`)

| Field | Value |
|--------|--------|
| **Script** | `OSE-backend/scripts/smoke-stockReport-physical-reconciliation.js` |
| **Read-only** | `node scripts/smoke-stockReport-physical-reconciliation.js` — samples items with non-null `physicalCount` for a department that has catalog items. |
| **Fixtures** | `SMOKE_STOCK_REPORT_PHYSICAL=1` — two phases (legacy line-only session, then canonical cell session with multi-round); sessions use `postedAt` in the far future so they win “latest POSTED” for the test locations; rows are deleted after assertions. |

**Local fixture result (2026-05-14):** `overallPass: true` — legacy phase `physicalCount` **42** from `StockCountLine`; canonical phase latest round **77** for item 0 and cell count **55** for item 1; `physicalVariance` matches `physicalCount - totalQty` for checked rows. When the tenant has **two locations in one department**, the script also exercises **scoped** multi-location data (`multiLocationDept: true`).

**Commands:**

```bash
cd OSE-backend && node scripts/smoke-stockReport-physical-reconciliation.js
cd OSE-backend && SMOKE_STOCK_REPORT_PHYSICAL=1 node scripts/smoke-stockReport-physical-reconciliation.js
```

---

## 8. Slice 3 — Generated variance (`generateVarianceReport` / `physicalQty`)

| Field | Value |
|--------|--------|
| **Script** | `OSE-backend/scripts/smoke-generatedVariance-physical-reconciliation.js` |
| **Read-only** | Calls **`generateVarianceReport`** (no `GeneratedReport` DB row) for current calendar year; prints sample rows with `physicalQty`, `closingQty`, `varianceQty`. |
| **Fixtures** | `SMOKE_GENERATED_VARIANCE_PHYSICAL=1` — `countDate` in **2099** window; legacy line phase then canonical cell phase; sessions deleted after assertions. |

**Local fixture result (2026-05-14):** `overallPass: true` — legacy `physicalQty` **42** from `StockCountLine`; canonical latest round **77** (and **55** for a second item when two distinct balance items exist in the department).

**Commands:**

```bash
cd OSE-backend && node scripts/smoke-generatedVariance-physical-reconciliation.js
cd OSE-backend && SMOKE_GENERATED_VARIANCE_PHYSICAL=1 node scripts/smoke-generatedVariance-physical-reconciliation.js
```

---

## 9. Legacy evidence alignment (`/stock-count/:id/evidence`, PDF, Excel)

| Field | Value |
|--------|--------|
| **Plan** | `docs/governance/LEGACY_EVIDENCE_ALIGNMENT_PLAN.md` |
| **Implementation** | `OSE-backend/src/services/stockCountEvidence.service.js` — **`buildEvidencePack`**; `stockCount.controller.js` wires JSON/PDF/Excel. |
| **Smoke** | `OSE-backend/scripts/smoke-legacy-evidence-alignment.js` — in-memory **legacy vs canonical** row assertions (no DB). |

**Local run (2026-05-14):** exit **0** — legacy path keeps **line** `countedQty`; canonical path uses **latest cell** (**77**) not stale line (**1**).

**Commands:**

```bash
cd OSE-backend && node scripts/smoke-legacy-evidence-alignment.js
```

---

## Related

- `INVENTORY_COUNT_REPORTING_FIX_PLAN.md`  
- `INVENTORY_COUNT_REPORTING_SAFETY_ANALYSIS.md`  
- `INVENTORY_COUNT_PHASE1_SMOKE_RESULTS.md` (HTTP / env discipline — different scope)
