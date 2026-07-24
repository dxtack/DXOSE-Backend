# DX OSE — Reporting Truth Catalog (Initial)

| Field | Value |
|--------|--------|
| **Version** | 1.1 |
| **Created Date** | 2026-05-14 |
| **Updated** | 2026-06-12 (ADR-002 / Finding #26) |
| **Product Owner** | DX OSE Product Leadership *(assign named owner)* |
| **Purpose** | Declare **truth source**, **scope**, and **posting dependency** per report family so reviewers and engineers do not infer definitions ad hoc (`PRODUCT_CONTRACTS.md` Contract 3). |
| **Scope** | Initial catalog grounded in `OSE-backend/src/services/report.service.js`, `summaryReport.service.js`, inventory count services, and stock report controllers—**extend** as new reports ship. |

**Related:** `SEMANTIC_GLOSSARY.md`, `EXCEPTION_REGISTER.md`, `WORKFLOW_MATRIX.md`.

---

## Global primitives (used in multiple reports)

| Primitive | Definition |
|-----------|------------|
| **Official ledger filter** | `inventory_ledger` rows where `affectsValuation === true` (see `OFFICIAL_LEDGER_WHERE` in `report.service.js` / `summaryReport.service.js`). Rows outside this filter are **not** “official” for these reports. |
| **Period snapshot anchor** | Latest `PeriodClose` with `status: 'CLOSED'` and `closedAt` relative to report window—**valuation and OMC** depend on this; string status is a **known exception** (`EXCEPTION_REGISTER.md` EX-003). |
| **Open / unposted documents** | Documents that exist in workflow states **before** ledger posting (e.g. approved-but-unposted GRN, in-transit transfer, draft issue). Unless a row below says otherwise, **default assumption** is: **not included** in ledger-based totals. |

---

## Catalog table (initial)

| Report name (product) | API / entry surface | Truth source | Inclusion rules (scope) | Posting dependency | Open / unposted treatment | Reconciliation notes | Operational interpretation |
|------------------------|---------------------|--------------|---------------------------|---------------------|---------------------------|------------------------|-----------------------------|
| **Inventory valuation (as-of)** | `GET /api/reports/valuation` (+ `…/valuation/excel`) | **ADR-002 resolver** (`inventoryValuation.service.js`): (1) explicit `snapshotId` → snapshot; (2) today → live stock; (3) closed month (`year`+`month`) → snapshot; (4) **open current month** → live stock (`OPEN_PERIOD_LIVE`); (5) nearest closed snapshot + warning; (6) live fallback if stock exists; (7) true empty only. Legacy: `INVENTORY_VALUATION_SOURCE=ledger_replay`. | Tenant + resolved **locations** (active) + optional **departments**, **category**; optional explicit `snapshotId`. | Posted stock mutations (paired ledger). | Unpublished workflows excluded from stock. | Must match **Current Stock Balance** for open month / today. Ledger replay = **audit only**. | “What is inventory **carrying value**?”—**stock / closed snapshot**. |
| **Inventory truth reconciliation (audit)** | `GET /api/integrity/inventory-reconciliation` | Compare **`stock_balances`** vs **`replayOfficialLedgerBalances()`** per item×location; probable cause heuristics. | Finance/Auditor scope filters. | Read-only. | N/A | **Explains drift**; does not publish a competing carrying total. | “Why does stock differ from ledger replay?” |
| **OMC (Opening–Movement–Closing)** | `POST /api/reports/generate` with `reportType: 'OMC'` | **Hybrid:** opening from **last closed snapshot before `startDate`** else ledger fallback; movements = **official ledger** in period; **closing qty** excludes custody `GET_PASS_OUT`; **closing value** = `closingQty × carrying WAC` from snapshot/stock balance (movement blend retained as informational `closeWac`). | Locations derived from department/category selection same as other generated reports. | Movements are **posted ledger** only (`affectsValuation: true`); custody get-pass outs loaded separately for `getPassOutQty` narrative column. | Unposted GRNs, in-transit transfers, draft issues: **not in movement buckets** until they hit ledger. | **Closing qty/value** should align with **Current Stock** / **Valuation** at period end (ADR-002). | “Explain the period **story** for qty/value by bucket”—**flow** narrative; closing matches finance carrying rule. |
| **Summary inventory** | `GET /api/reports/summary-inventory` | **Per `summaryReport.service.js` comments:** opening from **period snapshot** or fallback; GRN via `RECEIVE`; breakage/lost via ledger types; theoretical formula; **variance** = `COUNT_ADJUSTMENT` in period; closing = theoretical + variance. | **Department-owned locations only** (explicit in service header—differs from “all locations” mental model). | Variance bucket requires **posted** count adjustments. | Unposted count sessions: **no** `COUNT_ADJUSTMENT` lines → variance zero vs theoretical. | **Not the same** as inventory-count session variance screen—reconcile by **ledger movementType** and **location scope**. | “Departmental OS&E month narrative”—**control tower** view; label scope on every export. |
| **Summary report (variance style)** | `POST /api/reports/generate` `reportType: 'SUMMARY'` | `generateVarianceReport`: **opening/closing** from **`stock_balances`** at query time + **period ledger** grouped (`movementType`); “physical” column logic inside generator—**not** live count session. | Filtered locations from dept/category mapping in `generateReport`. | Uses **ledger movements** in range for period columns. | Approved-unposted stock events: **missing** from ledger side. | Compare to **OMC** only if **same location set and date window**; opening differs from OMC snapshot opening **by design** unless aligned in a future phase. | “Stock + ledger variance story” for selected ops scope—**not** official count workflow evidence. |
| **Detail report** | `POST /api/reports/generate` `reportType: 'DETAIL'` | Same generator as SUMMARY with `isSummary = false` (`generateVarianceReport`). | Same as SUMMARY row. | Same. | Same. | More granular rows for investigation—**same truth caveats** as SUMMARY. | Line-level investigation for finance. |
| **Inventory count — variance (session)** | `GET /api/inventory-count/sessions/:id/variances` (+ exports on inventory-count / stock-count routes) | **Session lines:** book vs counted, `varianceQty`, value estimate **`CURRENT_WAC_AT_POSTING`** in `inventoryCount.service.js`—tied to **session state** (e.g. reveal rules). | Session tenant + location (+ scoped locations model). | **Pre-post:** variances can exist before `POSTED`; **posting** on session approve (`WORKFLOW_MATRIX.md`). | Shows **intent vs book** until posted; after post, tie-out to **ledger** `COUNT_ADJUSTMENT`. | **Killer module** anchor: this is the **operational** variance truth for the count; **generated SUMMARY variance ≠ this screen** without explicit mapping doc. | “What did we **count** and what will we **post**?”—operational governance. |
| **Breakage report** | `POST /api/reports/generate` `reportType: 'BREAKAGE'` | `generateBreakageReport`: **`movement_documents`** with `movementType IN ('BREAKAGE','LOST','LOAN_WRITE_OFF')`, `status IN ('APPROVED','POSTED')`, dated by **`postedAt`** in range or legacy **`documentDate`** if `postedAt` null. | Location list from `generateReport` resolution (`sourceLocationId`). | Rows can include **`APPROVED`** without enum `POSTED`—align with breakage lifecycle (`TBD-001`). | Draft / rejected / void: excluded by status filter. | Reconcile to **ledger** lines for same window by movement type; note **LOST** rows appear in this report family. | “What loss/breakage docs **fell in** this period filter?”—**not** pure ledger-only if `APPROVED` ≠ posted in your tenant data. |
| **Transfers report** | `POST /api/reports/generate` `reportType: 'TRANSFERS'` | **`store_transfers`** with `status IN ('RECEIVED','CLOSED')` and date by `receivedAt` **or legacy** `transferDate` if `receivedAt` null (`EXCEPTION_REGISTER.md` EX-010). | Locations where source **or** dest in selected set. | **Receive-based posting** in operations; report shows **completed** transfers. | In-transit / approved-not-received: **excluded**. | May disagree with strict “receivedAt only” books until data backfill. | “What actually **moved** between stores in period?” |
| **Aging report** | `POST /api/reports/generate` `reportType: 'AGING'` | **Current `stock_balance`** for qty; **age** from last **`inventory_ledger`** row (`affectsValuation: true`) up to `endDate`; value uses **`item.unitPrice`** in generator (`EXCEPTION_REGISTER.md` EX-009). | Locations + category filter. | Indirect: reflects **posted** history for “last movement date”; qty is **live balance**. | N/A for single doc; balance includes all posting history. | **Do not** compare `value` column to valuation WAC without adjustment—**different basis**. | “What stock is **stale** by last official movement?”—ops lens, not pure finance valuation. |
| **Stock report variance (saved)** | Stock report routes + `generateStockReportVariancePDF` | **Persisted** saved report / location qty variance snapshot used for PDF and historical variance (`stockReport` stack). | Per saved report record. | Depends on **when** report was saved/posted—see service `postSavedStockReportAdjustments` in posting layer. | Historical snapshot may **freeze** variances at save time—**not live book**. | Must tie PDF to **report number** and **saved timestamp**; reconcile to ledger if adjustments were posted from saved report flow. | “What was **submitted for approval** as a stock report package?”—legacy governance path. |
| **Generated report artifact** | `GET /api/reports/:id` (+ `/pdf`, `/excel`) | **Frozen JSON** payload in `GeneratedReport` at generation time. | As per generation request. | **None** (artifact is snapshot). | Reflects **posted** world as of generation instant for ledger-based reports. | Re-run same parameters later may differ—by design; version with `id` + `createdAt`. | “What did the system **say then**?”—audit artifact. |
| **Asset verification (naming TBD)** | **No single enum `reportType`** — see EX-011 | **TBD** — candidate surfaces: Get Pass PDF, asset loan PDF, physical columns in variance/summary reports. | **TBD** | **TBD** | **TBD** | Product must assign **canonical name** and map to API before implementation scaling. | “Did we **physically verify** presence/condition?”—often **non-ledger** unless tied to count or adjustment. |

---

## Posting dependency legend

| Level | Meaning |
|-------|---------|
| **None** | Report does not post stock. |
| **Indirect** | Report reads balances or ages that **reflect** past posting. |
| **Strong** | Report line **requires** posted ledger rows or posted documents (e.g. count adjustment in summary inventory). |

---

## Required next steps (governance, not code)

1. Product assigns **owner** for each “TBD” row in asset verification section.  
2. Add rows for **any** frontend-only report or **dashboard tile** that shows numbers without an API row above.  
3. On every report PR: update this catalog or **explicit waiver** with expiry (`PRODUCT_CONTRACTS.md`).

---

## Version history

| Version | Date | Notes |
|---------|------|------|
| 1.0 | 2026-05-14 | Initial catalog: valuation, OMC, count variance, movement-family reports, aging, saved stock variance, asset verification placeholder |
