# Get Pass — State × Impact Matrix (Phase B1)

| Field | Value |
|--------|--------|
| **Status** | Implementation reference — hardening phase |
| **Source service** | `OSE-backend/src/services/getPass.service.js` |
| **Posting facade** | `postingEngine.service.js` (incremental); get-pass stock today in-domain |

## Status glossary

| Status | Meaning |
|--------|---------|
| `DRAFT` | Editable; not issued |
| `PENDING_*` | Approval chain (issuer tenant) |
| `APPROVED` | Approved; not yet checked out |
| `OUT` | Items checked out (issuer) |
| `RECEIVED_AT_DESTINATION` | Target received (internal) |
| `RETURNING` | Reverse shipment started |
| `RETURN_RECEIVED_AT_GATE` | Source security inspected return |
| `PARTIALLY_RETURNED` / `RETURNED` | Qty returned (direct or after dept accept) |
| `CLOSED` | Operational close |
| `REJECTED` | Terminal reject |

## Transition matrix (issuer / internal reversible)

| Transition | API | Stock impact | Ledger | Breakage doc | Lost doc | Approval |
|------------|-----|--------------|--------|--------------|----------|----------|
| Submit / approve chain | `submit`, `approve` | On checkout per transfer type | Checkout entries | — | — | Dept→…→Security |
| Checkout | approval final / security | Reversible: `qtyBlocked↑` only (`qtyOnHand` unchanged). Permanent: `qtyOnHand↓` | Reversible: `GET_PASS_OUT` **custody ledger** (`affectsValuation: false`). Permanent: `ISSUE` (valuation) | — | — | Security |
| Dest. receipt | `confirm-receipt` | Custody at target | Tracking | — | — | Target roles |
| Dest. dept accept | `accept-into-department` | Target dept placement | — | — | — | Target dept |
| Return exit (dest.) | `confirm-return-exit` | Release temp custody | TEMP_RELEASE | — | — | Dest. security |
| Return arrival (source) | `confirm-return-arrival` | Line qty split only | — | **Creates** if damaged/lost | **Creates** if lost | Source security |
| Dept accept return | `accept-return-into-department` | Release blocked; decr. non-good on-hand | RETURN (good, **`affectsValuation: false`** — custody mirror) | **Creates** (skip if exists) | **Creates** (skip if exists) | Source dept mgr |
| Direct return | `POST /:id/return` (`processReturns`) | Blocking: release blocked; non-good decr. on-hand | Blocking good: RETURN (**non-valuation**); permanent good: stock↑ + valuation RETURN | **Creates** | **Creates** | Security/ops |
| Close | `close` | — | — | — | — | Issuer |

## Return classification → operational modules

| Source | `MovementDocument.sourceType` | Breakage list tab | Lost list tab |
|--------|------------------------------|-------------------|---------------|
| Get pass return | `GET_PASS_RETURN` | Returns Breakage | From Returns |

Documents created via `getPassReturnDisposition.util` (`queue` + `flush` per transaction) with `getPassId` set; at most one BREAKAGE and one LOST document per return batch (API transaction). Line dedupe on retry uses `(itemId, locationId)` per movement type. Separate Process Return calls create separate document batches — not merged by `getPassId` alone.

## Accounting timing rules

1. **Gate inspection** records `returnedGoodQty` / `returnedDamagedQty` / `returnedLostQty` on lines; may create breakage/lost **approval documents** (not posted until workflow completes).
2. **Department acceptance** is the **stock posting point** for internal reversible returns (blocked release + good RETURN ledger).
3. **Direct return** (`processReturns`) posts stock + documents for non-internal OUT passes.
4. **Breakage/lost final post** uses movement approval chain; GET_PASS_RETURN may be ledger-only if stock already adjusted upstream (see `breakage.service.js` comments).

## Testing reference

- Transition smokes: `scripts/smoke-get-pass-return-disposition.js` (add/extend)
- Governance static: `scripts/smoke-governance-get-pass-matrix-static.js`
