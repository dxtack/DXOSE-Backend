# Wave 1 — Count Posting Policy B (COMPLETE)

| Field | Value |
|--------|--------|
| **Status** | Implemented — **STOP here for manual UAT** |
| **Policy** | `postingAdjustment = countedQty - currentLiveQtyAtPostingTime` |
| **Audit variance (UI)** | Unchanged: `snapshotVariance = countedQty - bookQty` |

## Code

- `OSE-backend/src/services/countPostingPolicy.js` — Policy B math + audit note helper
- `OSE-backend/src/services/posting.service.js` — `postInventoryCountSession`, `postStockCount` (legacy)
- `OSE-backend/src/services/inventoryCount.service.js` — fix `startSession` `itemsCount` (`ensured` scope bug)

## Verify

```bash
cd OSE-backend
npm run smoke:count-posting-policy-b
```

## Manual UAT focus

1. Snapshot → GRN/movement → count → post → **on-hand equals counted**
2. Blind count reveal still shows snapshot variance (not posting adjustment)
3. Period close **not** triggered by count post

## Next

**Wave 2** (governance/UX) — do **not** start until Wave 1 UAT is signed off.
