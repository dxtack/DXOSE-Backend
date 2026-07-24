# Guided UAT — Session 02: Stock Balance ↔ Ledger ↔ WAC (non-OB) ↔ OMC Reports

**Phase:** Guided UAT Review Support (no new features / no refactor)  
**Scope:** Stability, Financial Accuracy, Business Logic Validation, Posting Integrity, Edge Cases, Operational Readiness  
**Prerequisites:** Session 01 signed off (OB finalized or locked); tenant with master data; items with BASE unit; at least two **department-scoped** locations for transfer tests.

**Sources of truth (code):**

- `OSE-backend/src/services/posting.service.js` — `postDocument` for RECEIVE, ISSUE, TRANSFER, ADJUSTMENT, COUNT_ADJUSTMENT; paired Ledger + `stock_balances`; auto-lock OB after non-OB post
- `OSE-backend/src/services/periodGuard.service.js` — `checkPeriodLock`, operational gates
- `OSE-backend/src/services/report.service.js` — `generateOMCReport` (OMC v2 per item + location)
- `OSE-backend/src/services/summaryReport.service.js` — Summary Inventory (department / OMC-style **product** report — different aggregation than engine OMC)
- `OSE-backend/src/routes/reports.routes.js` — `/reports/generate`, `/reports/:id/excel`, `/reports/summary-inventory`, valuation
- `OSE-Frontend/src/app/features/reports/services/inventory-reports.service.ts` — UI calls to `/reports/*`

---

## 1. Executive summary for facilitators

| Topic | What to validate |
|--------|------------------|
| **Starting position** | After OB, each `(itemId, locationId)` has `stock_balances.qtyOnHand` and `wacUnitCost` aligned with OB/posting rules from Session 01. |
| **Every posting** | One DB transaction: ledger rows + stock updates; **no** independent stock mutation outside `postDocument` (architectural rule in code). |
| **WAC (non-OB)** | **Receipt path:** weighted average on increment. **Issue/out path:** consumes at **current WAC**, does not change WAC. **Adjustment:** positive adjusts WAC like a receipt mix; negative decreases qty only (WAC unchanged on line decrease branch). |
| **OMC (Engine report)** | Generated report type `OMC` uses **ledger + optional period snapshots** per item/location — formula documented in §4.3. |
| **Two different “summary” concepts** | **`GET /reports/summary-inventory`** (`summaryReport.service.js`) groups by **department × category** and uses **Get Pass lines** for “Gate Pass” column — **not** identical row logic to **`generateOMCReport`**. UAT must test **both** if Pilot uses both screens. |

---

## 2. End-to-end flow after OB

### 2.1 Starting balance

- **Operational truth:** `stock_balances` holds **current qty** and **WAC** per `(tenantId, itemId, locationId)`.
- **Historical truth:** `inventory_ledger` rows (with `affectsValuation: true` where applicable — see `OFFICIAL_LEDGER_WHERE` in report services) support reconciliation and reports.

### 2.2 Movement types → posting branches (`posting.service.js`)

| Movement type | Branch | Stock source | Stock destination | WAC note |
|---------------|--------|----------------|-------------------|----------|
| `RECEIVE`, `RETURN` | Increase (`isIncrease`) | — | `destLoc` | **New WAC** = \((currentQty×currentWac + receiveTotalValue) / (currentQty + qty)\) |
| `ISSUE`, `BREAKAGE`, `LOST`, `LOAN_WRITE_OFF`, … | Decrease (`isDecrease`) | `sourceLocationId` | — | **Outgoing at current `wacUnitCost`**; qty decrement; **WAC unchanged** |
| `TRANSFER` | Decrease **and** Increase | source | dest | Out at source WAC; In at dest uses receipt math → **may change dest WAC** |
| `ADJUSTMENT`, `COUNT_ADJUSTMENT` | Adjustment (`isAdjustment`) | single location | — | Positive: mixed WAC like receipt; Negative: validates stock, decrement qty, **no WAC update on decrease branch** |

### 2.3 Ledger row (each posted line)

- **Decrease:** `qtyOut`, `unitCost` = **current** `stock_balances.wacUnitCost`, `totalValue` = qty × WAC, `balanceAfter` = qty on hand after line.
- **Increase (non-OB):** `qtyIn`, `unitCost` from line/receipt, `totalValue` per line, `balanceAfter` = on hand after receipt.
- **Reference:** `referenceType` MOVEMENT, `referenceId` = document id.

### 2.4 Effect on OMC (Engine report)

- Report generator **`generateOMCReport`** (`report.service.js`) reads **ledger entries in the period** (and opening from snapshot or ledger before `start`).
- Movements are **bucketed** by `movementType` (OB separate from In; `TRANSFER_IN`/`TRANSFER_OUT` tracked; Issue/Breakage/Lost as Out; etc.) — §4.3.

---

## 3. Reconciliation logic

### 3.1 Stock Balance vs Ledger (by item + location)

**Invariant to test in UAT:**

\[
\texttt{stock\_balances.qtyOnHand} \approx \sum(\texttt{qtyIn}) - \sum(\texttt{qtyOut})
\]

over all `inventory_ledger` rows for that `(tenantId, itemId, locationId)` **if** every movement was posted through the engine and no manual DB edits.

- Use **tolerance** only for rounding (e.g. 4 decimals); investigate any mismatch as **critical**.

### 3.2 Ledger running balance

- Field **`balanceAfter`** on each ledger row is the running quantity **after** that line’s effect at that location (as implemented in posting).  
- UAT spot-check: last posted line’s `balanceAfter` vs `stock_balances.qtyOnHand` for same item-location **after same document sequence**.

### 3.3 OMC formula (Engine — `generateOMCReport`)

**Documented in code (report.service.js):**

- **Opening (per item + location):**  
  1) Prefer **period snapshot** from latest `period_close` closed before report `start` date.  
  2) Else **ledger net** between last close and `start`.

- **Within period buckets** (each ledger row in `[start, end]`):  
  - `OPENING_BALANCE` → **obQty / obValue** (separate from “In”)  
  - `RECEIVE`, `RETURN`, `GET_PASS_RETURN` → operational **In**  
  - `TRANSFER_IN` → counted in **In** (+ `tfrInQty`)  
  - `ISSUE`, `BREAKAGE`, `LOST`, `GET_PASS_OUT`, `LOAN_WRITE_OFF` → **Out**  
  - `TRANSFER_OUT` → **Out** (+ `tfrOutQty`)  
  - `ADJUSTMENT`, `COUNT_ADJUSTMENT` → signed **adjQty / adjValue**

- **Closing qty (code):**  
  `closeQty = openQty + obQty + inQty - outQty + adjQty`  
  (where `inQty` already includes transfer-in quantities and `outQty` includes transfer-out — consistent with aggregation loop.)

- **Closing WAC (report display):**  
  `closeWac = (openValue + obValue + inValue) / (openQty + obQty + inQty)` when denominator &gt; 0; else fallback `openWac`.  
  `closingValue = closeQty * closeWac`.

> **Financial sensitivity:** This closing WAC is a **report calculation** blending buckets — validate against business expectation vs raw `stock_balances.wacUnitCost` at period end (may differ slightly by design).

### 3.4 Summary Inventory report vs OMC Engine

| Aspect | `GET /reports/summary-inventory` | Engine `OMC` (`POST /reports/generate` type `OMC`) |
|--------|-----------------------------------|-----------------------------------------------------|
| Grain | Department × category groups | Item × location rows |
| Opening | Snapshot or ledger-derived | Snapshot or ledger-derived |
| “Purchases” | Ledger `RECEIVE` | Part of **In** bucket |
| Outflows | Breakage/Lost + **Get Pass outstanding from `get_pass_lines`** | Ledger movement types incl. GET_PASS_OUT |
| Theoretical | `open + GRN − breakage − pass` | Uses ledger buckets per §4.3 |

**UAT:** Do **not** assume totals match between the two screens without proving the same scope (locations, dates, pass logic).

### 3.5 Valuation screen vs Stock

- **Valuation:** `GET /reports/valuation` — as-of logic in controller/service; typically qty × WAC-style valuation.  
- **Excel:** generated reports use `/reports/:id/excel` — export must be compared to **same** generated JSON (`GET /reports/:id`), not ad-hoc UI rounding.

---

## 4. Database impact (successful non-OB post)

| Table | Typical change |
|-------|----------------|
| `movement_documents` | `status` → POSTED, `postedAt`, `documentNo` |
| `movement_lines` | unchanged structure; source of qty/cost |
| `inventory_ledger` | **Insert** per line |
| `stock_balances` | **Update/upsert** qty; WAC per rules above |
| `tenant_settings` | **`allowOpeningBalance` → LOCKED** if movement ≠ OPENING_BALANCE |
| `audit_log` | `POST` on movement (after transaction commits) |

---

## 5. Test scenarios with expected results

Assume clean item **X** at location **L1**, OB already gave **100 @ 5.00 SAR** unless noted.

### SC-01 — Receive after OB (WAC recalculation)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Post RECEIVE **50 @ 8.00** (total value 400) | Ledger: **qtyIn** 50, **totalValue** 400; stock **L1**: qty **150**, WAC **(500+400)/150 = 6.00** |
| 2 | Spot-check ledger **balanceAfter** last line | **150** |

### SC-02 — Issue after Receive

| Step | Action | Expected |
|------|--------|----------|
| 1 | From SC-01 state, post ISSUE **30** | Out at **6.00** WAC; ledger **qtyOut** 30, **totalValue** 180; stock qty **120**; **WAC still 6.00** |

### SC-03 — Transfer between locations

| Step | Action | Expected |
|------|--------|----------|
| 1 | Transfer **40** from **L1** to **L2** (same item) | **L1:** decrement 40 at L1 WAC; ledger TRANSFER_OUT **40**. **L2:** TRANSFER_IN increases qty; **dest WAC** recalculated from receipt branch (uses line unit cost / total value). |
| 2 | Reconcile both locations | Sum of location qty = prior total qty |

### SC-04 — Adjustment increase / decrease

| Step | Action | Expected |
|------|--------|----------|
| A | Positive ADJUSTMENT **10 @ 7.00** | Qty +10; WAC recomputed like mixed receipt (see posting branch). |
| B | Negative adjustment **5** (if stock ≥ 5) | Qty −5; **decrease branch does not update WAC field** in update() — WAC unchanged at row |

### SC-05 — Negative stock prevention

| Step | Action | Expected |
|------|--------|----------|
| 1 | ISSUE qty **greater than** `qtyOnHand` | Post **fails** with insufficient stock error; **no** partial ledger/stock change (transaction rollback). |

### SC-06 — Backdated movement

| Step | Action | Expected |
|------|--------|----------|
| 1 | Post movement with `documentDate` / ledger stamp falling in **closed** month/year | **422** `PERIOD_LOCKED_*` from `checkPeriodLock`. |

### SC-07 — Closed period blocking

| Step | Action | Expected |
|------|--------|----------|
| 1 | Close period via `POST /period-close/close` for current month | Subsequent posts dated in that month **blocked**. |

### SC-08 — Ledger vs Stock reconciliation

| Step | Action | Expected |
|------|--------|----------|
| 1 | Export or query all ledger rows for item X at L1 | Sum(qtyIn) − Sum(qtyOut) = **stock_balances.qtyOnHand** |
| 2 | Compare last **balanceAfter** | Matches qty on hand after full sequence |

### SC-09 — OMC Engine report validation

| Step | Action | Expected |
|------|--------|----------|
| 1 | Generate report `POST /reports/generate` with `reportType: 'OMC'`, date range covering SC-01–02, **locationId(s)** mandatory per API | Rows include opening, buckets, closing; **closingQty** matches formula in §3.3 for scoped locations |
| 2 | Repeat with snapshot closed before period | Opening uses snapshot where applicable |

### SC-10 — Excel export vs screen

| Step | Action | Expected |
|------|--------|----------|
| 1 | `POST /reports/generate` then `GET /reports/:id` note totals | |
| 2 | `GET /reports/:id/excel` | Totals **match** JSON payload used for export (same report id); if UI shows rounded values, compare to backend JSON not intermediate |

---

## 6. Known risks & financial sensitivities

| ID | Risk | Notes |
|----|------|-------|
| R1 | **Dual definitions of “summary”** | Summary Inventory vs OMC Engine — different columns and Pass logic — mismatched expectations in Pilot. |
| R2 | **OMC closing WAC vs live stock WAC** | Report blends **openValue + obValue + inValue** over **openQty + obQty + inQty** — may differ from terminal `stock_balances.wacUnitCost` if business expects last-cost layer. |
| R3 | **Transfer vs Summary report** | Summary report’s “theoretical” does **not** list internal transfers explicitly like OMC rows — department-level reconciliation may drift if transfers dominate. |
| R4 | **`affectsValuation` filter** | Reports use `OFFICIAL_LEDGER_WHERE` — rows excluded from valuation break reconciliation if any rows exist with `affectsValuation: false`. |
| R5 | **Negative adjustment** | Decrease branch updates qty only — accountants should confirm implied valuation after large negative adjustments. |
| R6 | **Auto-lock OB** | Any non-OB post locks OB settings — known from Session 01; still affects operational sequencing. |
| R7 | **Valuation Excel path** | Prior gap: `GET /reports/valuation/excel` may be missing on backend — validate export path Pilot uses ([M11](../full-system-review/modules/M11-reports.md)). |

---

## 7. Review agenda (90–120 min)

| Time | Topic |
|------|--------|
| 0:00 | Recap Session 01 linkage (starting stock/WAC) |
| 0:15 | Walk through §2.2 movement branches on whiteboard |
| 0:35 | Live/API: SC-01, SC-02, SC-05 |
| 0:55 | SC-03 transfer + SC-08 reconciliation |
| 1:10 | OMC: SC-09 + discuss R1/R2 |
| 1:15 | Export: SC-10 + Sign-off |

---

## 8. Sign-off block

| Question | Yes / No / N/A | Notes |
|----------|----------------|-------|
| Stock Balance qty reconciles to Ledger sums (sample items/locations)? | | |
| WAC verified for Receive / Issue / Transfer (samples)? | | |
| OMC Engine formula understood and spot-checked vs ledger? | | |
| Excel export totals match generated report data for same `id`? | | |
| Closed period guard verified with controlled date? | | |

**Facilitator:** ______________ **Date:** ______________  

---

## 9. Next session (preview)

Session 03 (optional): Deep dive **period snapshots** + month-end close vs **saved stock reports** + audit trail sampling — or proceed to Pilot checklist integration.
