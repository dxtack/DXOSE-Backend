# Posting Flow Map — Governed Inventory Impact (Phase C)

| Field | Value |
|--------|--------|
| **Facade** | `OSE-backend/src/services/postingEngine.service.js` |
| **Core engine** | `OSE-backend/src/services/posting.service.js` |
| **Valuation** | `OSE-backend/src/services/valuationGovernance.service.js` |

## Migration order (C1)

| # | Domain | Entry point | Ledger referenceType | Status |
|---|--------|-------------|----------------------|--------|
| 1 | Inventory count (canonical) | `postingEngine.postInventoryCountSession` | `COUNT_SESSION` | **Migrated** |
| 2 | GET_PASS_RETURN breakage/lost | `getPass.service` → movement docs | `MOVEMENT` + approval | Partial (docs created; post via breakage/lost services) |
| 3 | Get Pass transitions | `getPass.service.js` | Mixed `GET_PASS_*` | In-domain |
| 4 | Breakage / Lost internal | `postingEngine.postBreakageMovementInTransaction` / `postLostMovementInTransaction` | `MOVEMENT` | **Migrated (G1)** |
| 5 | GRN post | `postingEngine.postGrnInTransaction` | `GRN` | **Migrated** |
| 6 | Transfer receive | `postingEngine.postTransferReceiveInTransaction` | `TRANSFER` | **Migrated** |
| 7 | Get Pass checkout/return | `postingGovernedGetPass.*` via `postingEngine` | `GET_PASS` / `GET_PASS_RETURN` | **Migrated** |
| 5 | GRN | `grn.service` post | `GRN` / RECEIVE | Distributed |
| 6 | Transfers receive | `transfer.service` | TRANSFER_IN/OUT | Distributed |

## Canonical count posting sequence (Wave 1 — Policy B)

1. `checkPeriodLock(tenantId, countDate|createdAt)`
2. For each latest-round cell with `countedQty` set:
   - `postingAdjustment = countedQty - currentLiveQtyAtPostingTime` (skip if 0)
   - `snapshotVariance = countedQty - bookQty` — **audit/UI only** (stored on cells; not used for stock mutation)
   - `resolveUnitCost` → unit cost + `valuationBasis`
   - `inventoryLedger.create` COUNT_ADJUSTMENT; `balanceAfter = countedQty`
   - `stockBalance` adjusted so final on-hand equals `countedQty`
3. Session → `POSTED`; audit `INVENTORY_COUNT_POSTED`

**Helper:** `OSE-backend/src/services/countPostingPolicy.js`

## Legacy paths (sunset)

| Path | referenceType | Blocked when |
|------|---------------|--------------|
| `/stock-count` approve → `postStockCount` | `STOCK_COUNT` | `BLOCK_LEGACY_STOCK_COUNT_MUTATIONS` |

## Non-negotiables

- Stock balance mutation must pair with ledger row in same transaction (posting.service guard comments).
- No new inventory-impacting code outside posting engine + documented exceptions (get-pass custody).
