# Finding #27 — Valuation Review open-month regression

| Field | Value |
|--------|--------|
| **Status** | Closed (pilot validated) |
| **Introduced by** | Finding #26 stock/snapshot valuation switch |
| **Fixed** | 2026-06-13 |
| **ADR** | [ADR-002](./decisions/ADR-002-inventory-truth-unification.md) |

## Symptom

Inventory Valuation Review showed **“No inventory found”** for open review month (e.g. June 2026 → `asOfDate=2026-06-30`) while Current Stock, OMC, Detail, and Month-End Summary showed **39,788 qty / SAR 842,845.46**.

## Root cause

Month-end review sends **month-end as-of**. F26 resolver treated that as non-today / non-closed → returned `rows: []` when no matching closed snapshot existed. Ledger replay (pre-F26) had masked this.

## Fix

Truth resolver priority in `inventoryValuation.service.js`:

```text
1. snapshotId
2. today → stock_balances
3. closed month (year + month) → period_snapshot
4. open current month → stock_balances + OPEN_PERIOD_LIVE
5. nearest closed snapshot + warning
6. live stock fallback
7. true empty only
```

## Pilot validation (Phase 2)

```http
GET /api/reports/valuation?asOfDate=2026-06-30
```

| Metric | Result |
|--------|--------|
| Qty | 39,788 |
| Value | SAR 842,845.46 |
| truthSource | STOCK_BALANCE |
| valuationBasis | OPEN_PERIOD_LIVE |
| Matches live stock | Yes |

Script: `OSE-backend/scripts/pilot-valuation-f27.js`

## Closure

Finding #26 and #27 together close the valuation architecture track:

```text
Published truth  = stock_balances / period_snapshot
Ledger replay    = audit only
Open month       = OPEN_PERIOD_LIVE
```
