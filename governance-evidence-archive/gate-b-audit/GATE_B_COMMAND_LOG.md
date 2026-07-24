# Gate B Command Log
Audit timestamp: 2026-06-27T16:23:37Z

## Git baseline
- Branch: master
- SHA: d8ea25d51407370b1e67c42378e3114d127a019e
- Working tree clean: False

## Static smoke commands
### `npm run smoke:governance-static (OSE-backend)`
- Exit code: 0
```
nonical path
OK: inventory count approve uses postingEngine
OK: inventory count submitForApproval resolves ACC workflow chain
OK: inventory count approval steps derive from workflow roleCodes
OK: inventory count service supports FINANCE_APPROVED status
OK: inventory count routes authorize APPROVE_INVENTORY_COUNT
OK: canonical post uses COUNT_SESSION referenceType
OK: postingEngine exposes postInventoryCountSession

All inventory count unification static checks passed.
OK: WAC basis constant
OK: MISSING_WAC basis constant
OK: variance value = qty * unit cost
OK: WAC path is complete
OK: zero cost yields zero value
OK: MISSING_WAC + qty flags incomplete
OK: zero qty is not incomplete valuation

Valuation governance static checks passed.
OK: reversal governance doc covers inventory count
OK: reversal governance doc covers get pass return
OK: breakage void API exists
OK: posted breakage immutability guard
OK: period reopen requires reason
OK: inventory count supports VOID cancel

Reversal governance static checks passed.
OK: month-end checklist exported
OK: checklist includes open counts
OK: integrity routes expose checklist
OK: close period invokes checklist
OK: period guard exists

Period close governance static checks passed.
OK: runIntegrityScan exported
OK: runMonthEndCloseChecklist exported
OK: drift tolerance defined

Integrity monitoring static checks passed.
OK: breakage delegates final post to postingEngine
OK: lost delegates final post to postingEngine
OK: governed breakage/lost sets balanceAfter on internal paths
OK: double-post guard in governed movement
OK: postingEngine exports breakage post
OK: postingEngine exports lost post
OK: auditGoverned facade exists
OK: integrity persistence API
OK: opening balance post uses postingEngine
OK: GRN delegates to postingEngine
OK: GRN post uses governed audit
OK: transfer finance post delegates
OK: getPass has no inline ledger.create
OK: getPass checkout governed

Posting governance enforcement static checks passed.

```
### `npm run smoke:audit-facade (OSE-backend)`
- Exit code: 0
```

> ose-backend@1.0.0 smoke:audit-facade
> node scripts/smoke-audit-facade-static.js

{"pass":true,"auditActionCount":18,"message":"all writes routed through auditWriter facade"}

```
