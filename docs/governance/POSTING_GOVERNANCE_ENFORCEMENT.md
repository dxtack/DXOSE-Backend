# Posting governance enforcement (Phase G)

## Migrated paths (G1)

| Flow | Entry | Notes |
|------|--------|--------|
| Inventory count approve | `postingEngine.postInventoryCountSession` | Canonical `COUNT_SESSION` reference |
| Breakage final approval | `postingEngine.postBreakageMovementInTransaction` | Stock + ledger paired; double-post guard |
| Lost final approval | `postingEngine.postLostMovementInTransaction` | Same |
| Opening balance finalize | `postingEngine.postMovementDocument` | OB drafts via settings |
| GRN post | `postingEngine.postGrnInTransaction` | Stock + ledger + movement mirror |
| Transfer receive | `postingEngine.postTransferReceiveInTransaction` | TRANSFER_OUT/IN paired |
| Get Pass checkout/return | `postingEngine` (governedGetPass) | Checkout, returns, permanent receive |

## Remaining distributed posting (incremental)

| Flow | Current | Target |
|------|---------|--------|
| Generic movements | `posting.service.postDocument` | Already exposed as `postingEngine.postMovementDocument` |
| Transfer dispatch | Status only (no ledger) | N/A — stock moves on receive |
| Get Pass disposition | Movement docs → `postBreakageMovementInTransaction` / `postLostMovementInTransaction` | Already governed on final approval |

## Automated checks (G3)

- `npm run smoke:governance-static` includes `smoke-posting-governance-enforcement.js`
- `npm run test:governance-integration` — delegation + reconciliation contracts (+ optional `GOVERNED_INTEGRATION_TENANT_ID` DB probe)
- Validates delegation, `balanceAfter`, duplicate ledger guard, integrity persistence

## Consistency rules (G2)

Every governed post must:

1. Create official ledger rows with `referenceId` = movement document id
2. Update stock (or cumulative damage/lost for GET_PASS_RETURN) in the same transaction
3. Set `balanceAfter` on internal stock-deduct paths where applicable
4. Respect period lock via existing middleware
5. Be reversible only through documented void/reversal flows (`REVERSAL_RECOVERY_GOVERNANCE.md`)
