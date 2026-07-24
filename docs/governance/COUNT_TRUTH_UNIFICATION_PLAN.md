# COUNT_TRUTH_UNIFICATION_PLAN

**Phase:** Inventory Count Stabilization & Truth Unification (planning and architecture preparation only).  
**Out of scope for this document:** Removing routes, migrating data, rewriting posting engines, merging APIs, or changing frontend UX.

---

## 1. North star

**Single operational truth** for inventory count: workflow, posting, reporting narrative, audit, and reconciliation should all resolve to the same declared semantics. The canonical HTTP workflow is **`/api/inventory-count`** per ADR-001.

---

## 2. Canonical posting flow (target state)

**Today (documented actual):**

| Aspect | Canonical (`postInventoryCountSession`) | Legacy (`postStockCount`) |
|--------|----------------------------------------|---------------------------|
| Trigger | Final approve on inventory-count service path | Final approve in `stockCount.service.js` |
| Variance source | `StockCountLocationQty` — latest round per item×location | `StockCountLine.varianceQty` |
| Location dimension | Per cell `locationId` | Single `session.locationId` for all lines |
| WAC | Current WAC at posting (`CURRENT_WAC_AT_POSTING`) | Uses line `wacUnitCost` snapshot on lines |
| Ledger `referenceType` | `COUNT_SESSION` | `STOCK_COUNT` |
| Period lock date | `new Date()` at post | `session.countDate \|\| session.createdAt` |

**Target truth (governance intent, not yet implemented):**

- One posting entry point per session **type** or **creation source**, with **one** period-lock rule and **one** reference taxonomy for new postings.
- Until implementation: **treat new operational work as inventory-count-only**; legacy posts remain valid historical facts.

---

## 3. Canonical truth source

| Concern | Canonical source |
|---------|------------------|
| Active count workflow state | `StockCountSession` rows progressed via **`/api/inventory-count`** |
| Operational variance before post | `GET /api/inventory-count/sessions/:id/variances` and count sheets |
| Posted adjustments | `inventory_ledger` rows with `movementType = COUNT_ADJUSTMENT` |

**Caveat:** Legacy-created sessions still live in `StockCountSession`; “truth source” for *history* is always **ledger + session row + audit**, not the API label alone.

---

## 4. Canonical report source

| Report / view | Source | Notes |
|---------------|--------|--------|
| Department / summary inventory | `summaryReport.service.js` — `COUNT_ADJUSTMENT` in period | Does not split count API origin; aligns with ledger |
| Session-level variance / “what we will post” | Inventory count session endpoints | See `REPORT_TRUTH_CATALOG.md` — not interchangeable with summary variance without mapping |
| Dashboard “pending inventories” | Count of `StockCountSession` in DRAFT / PENDING_APPROVAL | Model-wide |

Reporting unification direction: **ledger-first** narrative for posted numbers; **session endpoints** for operational intent; explicit labels when scopes differ (department locations vs session scope).

---

## 5. Ledger reference strategy

**Current state:**

- `COUNT_ADJUSTMENT` + `referenceType IN ('STOCK_COUNT','COUNT_SESSION')` + `referenceId = session.id` (and `referenceNo = sessionNo` where populated).

**Normalization plan (future implementation phase):**

1. **Read path** — Reporting and exports that need “count origin” should accept **both** reference types until migration completes.
2. **Write path** — New postings should converge on **`COUNT_SESSION`** (or a single new enum value if schema is extended — decision deferred).
3. **Historical rows** — Optional backfill of `referenceType` from `STOCK_COUNT` → `COUNT_SESSION` only with **frozen** change control, dry-run counts, and reconciliation scripts (not in stabilization-only phase).

---

## 6. `StockCountLine` vs `StockCountLocationQty` strategy

| Model | Legacy relevance | Canonical relevance |
|-------|------------------|---------------------|
| `StockCountLine` | Primary variance carrier for `postStockCount` | May exist for older sessions; not the driver for multi-location enterprise sheet |
| `StockCountLocationQty` | Not used by legacy post | **Primary** for `postInventoryCountSession` |

**Direction:**

- **Canonical operational edits** land on location qty cells for multi-location, multi-round counting.
- **Legacy path** continues to depend on lines until sunset.
- Long-term: either **derive** line-level rollups from cells for compatibility views, or **freeze** new line-only sessions — decision belongs to a later ADR after usage telemetry.

---

## 7. `referenceType` normalization plan

1. **Inventory** — All code sites emitting or filtering `STOCK_COUNT` / `COUNT_SESSION` (see `STOCK_COUNT_DEPENDENCY_MAP.md` and `posting.service.js`).
2. **Semantics** — Publish a one-line product rule: “Posted count adjustments reference the **count session**; legacy label `STOCK_COUNT` is historical.”
3. **Execution** — Schema changes (if any), backfill, and dual-read removal are **explicitly later** gated milestones.

---

## 8. Period lock unification strategy

**Implemented:** `postInventoryCountSession` uses **`session.countDate` (fallback `createdAt`)** for `checkPeriodLock`, matching **`postStockCount`** (`posting.service.js`). Count posting period discipline is now **consistent across both posting engines** for the same `StockCountSession` row.

**Follow-on (governance / UAT):**

1. Confirm finance policy matches “**count month**” semantics everywhere (including non-count postings if different).
2. ~~Update **`SESSION-03-PERIOD-CLOSE-STOCK-REPORTS-AUDIT.md`** narrative if it still states inventory-count used wall-clock post date only.~~ **Done:** §2.3 lists `postInventoryCountSession` and count-date basis.

---

## 9. Approval standardization direction

| Topic | Canonical today | Legacy today |
|-------|-----------------|--------------|
| Route middleware | `authorize('ADMIN', 'FINANCE_MANAGER', 'SUPER_ADMIN')` on approve | **`requirePermission('VIEW_INVENTORY')`** on `approve` + evidence + session reads; step roles still enforced in `stockCount.service.js` |
| Workflow depth | Inventory-count state machine + single finance approval step | Multi-step role approvals in `test-stockcount-evidence.js` pattern |

**Direction:** Align **route-level** guards and **service-level** checks so no approval path is strictly weaker. Preserve **business** approval depth as a product choice — not forced to 1-step if enterprise needs 3-step, but then **inventory-count** should express those steps explicitly rather than hiding them in legacy only.

---

## 10. Integrity checklist (for later implementation gates)

- [ ] No new consumer may call `/api/stock-count` without exception register entry.
- [ ] Ledger export documents both reference types until normalization.
- [ ] Session evidence PDFs reference the same session id as ledger `referenceId`.
- [x] Period close UAT text matches **countDate-based** period guard for inventory-count post (`SESSION-03-PERIOD-CLOSE-STOCK-REPORTS-AUDIT.md` §2.3).

---

## Related

- `docs/governance/decisions/ADR-001-inventory-count-canonical.md`
- `docs/governance/STOCK_COUNT_DEPENDENCY_MAP.md`
- `docs/governance/LEGACY_STOCK_COUNT_SUNSET_PLAN.md`
- `docs/governance/INVENTORY_COUNT_REPORTING_SAFETY_ANALYSIS.md` — line vs cell report consumers  
- `docs/governance/INVENTORY_COUNT_REPORTING_FIX_PLAN.md` — rollout + slice 1 (`getCountVariances`) merged
