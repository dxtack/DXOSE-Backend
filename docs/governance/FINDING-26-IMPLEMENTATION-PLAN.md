# Finding #26 — Implementation plan (Agent execution)

| Field | Value |
|--------|--------|
| **Status** | Closed (pilot validated 2026-06-13) |
| **ADR** | [ADR-002](./decisions/ADR-002-inventory-truth-unification.md) (Accepted) |
| **Priority** | Correctness and auditability over preserving legacy report totals |

## Root cause (confirmed)

- Not Inventory Count posting (Policy B is sound).
- Three report engines: stock balances, ledger replay (valuation), OMC movement blend + fallback.
- Primary qty drift: reversible Get Pass — `GET_PASS_OUT` with `affectsValuation: true` while `qtyOnHand` unchanged.
- Secondary value drift: COUNT_ADJUSTMENT replay WAC handling, OMC blended closing WAC.

## Target invariant

```text
Current Stock Balance = Valuation = OMC Closing (qty + carrying value)
```

Ledger replay = audit only (`STOCK_BALANCE ≠ LEDGER_REPLAY` when drift exists).

## Product notes (review incorporated)

### Historical as-of — no movement overlay

Do **not** ship `snapshot + ledger movement overlay` as published valuation. Deterministic rules only (see ADR-002 table).

### Reversible Get Pass lifecycle

Before Sprint B code: simulate full lifecycle (OUT → partial return → damaged → lost → final return → force close) and verify at each stage:

- `qtyOnHand`, `qtyBlocked`, available qty, official ledger net, reconciliation replay

If `GET_PASS_OUT` uses `affectsValuation: false`, good `RETURN` on blocking transfers (no stock increase) likely needs `affectsValuation: false` too.

### Ledger replay philosophy

Replay **explains** numbers; it does **not compete** with stock-backed carrying totals.

---

## Sprint execution order

| Sprint | Deliverables | Status |
|--------|--------------|--------|
| **A** | ADR-002, `ledgerReplay.service.js`, `inventoryTruthReconciliation.service.js`, API | Done |
| **B** | Reversible GP posting + lifecycle tests + OMC closing qty for custody | Done |
| **C** | Valuation → stock / period_snapshot (`INVENTORY_VALUATION_SOURCE`) | Done |
| **D** | OMC closing value = qty × balance WAC | Done |
| **E** | Governance docs + smokes + UAT checklist | Done |

## Finding #27 (regression fix)

Open-month Valuation Review false empty — fixed in `inventoryValuation.service.js`. See [FINDING-27-VALUATION-OPEN-MONTH.md](./FINDING-27-VALUATION-OPEN-MONTH.md).

---

## Sprint A — Foundation

### Files

| File | Purpose |
|------|---------|
| `OSE-backend/src/services/ledgerReplay.service.js` | Extract `replayOfficialLedgerBalances()` from valuation |
| `OSE-backend/src/services/inventoryTruthReconciliation.service.js` | Stock vs replay + probable cause |
| `OSE-backend/src/controllers/integrity.controller.js` | `GET /integrity/inventory-reconciliation` |
| `OSE-backend/src/services/ledgerReplay.service.test.js` | Replay unit tests |
| `OSE-backend/src/services/inventoryTruthReconciliation.service.test.js` | Reconciliation unit tests |

### API

`GET /api/integrity/inventory-reconciliation`

Query: `locationIds`, `departmentIds`, `categoryId`, `asOfDate`, `includeInactive`, `limit`

Response: rows with drift, totals, `healthy`, `purpose: 'AUDIT_RECONCILIATION'`

---

## Sprint B — Reversible Get Pass

| File | Change |
|------|--------|
| `postingGovernedGetPass.service.js` | `affectsValuation: false` on reversible `GET_PASS_OUT`; audit `postReturnGoodLedger` for blocking path |
| `report.service.js` `generateOMCReport` | Exclude non-valuation custody from closing qty (keep narrative columns) |
| `getPassReturnLifecycle.service.test.js` (new) | Full lifecycle simulation |

**Exit:** new checkouts + returns do not create stock vs official-ledger drift.

---

## Sprint C — Valuation source

| Env | Behavior |
|-----|----------|
| `INVENTORY_VALUATION_SOURCE=stock` (target default) | Live stock or period snapshot per ADR-002 |
| `legacy-replay` | Old behavior (diagnostic only) |

Refactor `generateValuationReport`; metadata `truthSource`.

---

## Sprint D — OMC closing value

Replace `closeValue = closeQty * closeWac` (blended) with `closeQty * stockBalMap.wac` (or snapshot WAC at period end).

---

## Sprint E — Governance

Update: `REPORT_TRUTH_CATALOG.md`, `GET_PASS_STATE_MATRIX.md`, `SEMANTIC_GLOSSARY.md`, `PRODUCT_CONTRACTS.md`, Session-02, `POSTING_FLOW_MAP.md`, `PILOT_STABILIZATION_CHECKLIST.md`.

---

## Success metrics (pilot tenant)

| Metric | Target |
|--------|--------|
| \|Current Stock qty − Valuation qty\| | 0 (ε 0.0001) after C |
| \|Current Stock value − Valuation value\| | ≤ SAR 0.01 after C+D |
| OMC closing vs stock | Match at period end after B+D |
| Reconciliation BLOCKER rows | 0 after B (except documented legacy) |

## Out of scope (v1)

- Summary/DETAIL `generateVarianceReport`
- Dashboard KPI tiles
- Rewriting historical ledger rows
- Inventory Count Policy B changes
