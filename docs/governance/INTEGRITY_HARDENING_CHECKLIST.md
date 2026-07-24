# System Integrity Hardening — Validation Checklist

Use before pilot scale or month-end close sign-off.

## 1. When does stock change?

| Workflow | Trigger | Verified |
|----------|---------|----------|
| GRN post | Finance post action | ☐ |
| Store issue post | Explicit post | ☐ |
| Transfer receive | Receive action | ☐ |
| Inventory count approve | `POST /inventory-count/.../approve` | ☐ |
| Breakage/lost approve (final) | Approval chain complete | ☐ |
| Get pass checkout | Security / approval OUT | ☐ |
| Get pass return (internal) | Dept accept return | ☐ |
| Get pass return (direct) | `POST /get-passes/:id/return` | ☐ |

## 2. When does ledger change?

Same rows — confirm ledger `movementType` + `referenceType` documented in `POSTING_FLOW_MAP.md`.

## 3. Canonical workflows

- ☐ New counts only via `/api/inventory-count`
- ☐ Legacy `/stock-count` mutations return 403 in staging/prod config
- ☐ Variances show `valuationBasis` ≠ silent zero without `MISSING_WAC` label

## 4. Approval vs post

- ☐ Count: approve **posts** (single finance step)
- ☐ GRN: approve ≠ post (explicit post)
- ☐ Transfer: approve ≠ receive

## 5. Reconciliation

- ☐ Sample count session: sum ledger COUNT_ADJUSTMENT = stock delta per item/location
- ☐ `balanceAfter` chain valid for sample lines
- ☐ Period closed → post blocked

## 6. Get Pass returns

- ☐ Lost/damaged at gate → docs in Breakage/Lost **From Returns** tabs
- ☐ No duplicate movement docs on dept re-accept
- ☐ `getPassId` populated on return-sourced documents

## 7. Reversal & recovery (F1)

- ☐ Reversal matrix reviewed with finance (`REVERSAL_RECOVERY_GOVERNANCE.md`)
- ☐ Posted documents cannot be voided in UI without error
- ☐ Period reopen requires documented reason

## 8. Month-end close (F2)

- ☐ `GET /api/integrity/month-end-checklist` reviewed before close
- ☐ `MONTH_END_CLOSE_REQUIRE_CLEAN_CHECKLIST=1` in production (if policy requires)
- ☐ No postings accepted into closed period (spot-check)

## 9. Integrity monitoring (F3)

- ☐ `GET /api/integrity/scan` run weekly (or daily cron)
- ☐ Zero BLOCKER issues before month-end sign-off
- ☐ `STOCK_LEDGER_DRIFT` investigated if present

## 10. Posting consolidation (G)

- ☐ Breakage/lost final post via `postingEngine` (not inline ledger in domain service)
- ☐ Opening balance finalize uses `postingEngine.postMovementDocument`
- ☐ `POSTING_GOVERNANCE_ENFORCEMENT.md` reviewed for remaining GRN/transfer/Get Pass paths

## 11. Audit & traceability (H)

- ☐ Critical events use `logGovernedEvent` envelope where applicable
- ☐ Integrity scan writes governed audit row

## 12. Operational UX (I)

- ☐ Item Master, Stock, Ledger, Movements, Breakage/Lost use `erp-ops-page` / sticky table shell
- ☐ `/integrity` reconciliation dashboard accessible to finance roles

## 13. Integrity automation (J)

- ☐ Daily cron enabled (`DISABLE_INTEGRITY_CRON` unset in prod)
- ☐ `GET /api/integrity/history` shows persisted runs
- ☐ `GET /api/integrity/reconciliation` matches UI dashboard

## 14. Regression

- ☐ `npm run smoke:governance-static` green (includes F1–G3 static smokes)
