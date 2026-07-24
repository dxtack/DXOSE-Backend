# Chapter 10 — Extensions: WAC Integrity & Integer Quantities

**Status:** Normative (implemented)  
**Effective:** 2026-07-18  
**Extends:** Chapter 10 — Stock & Quantity (§10.1–10.3)  
**Scope:** Platform-wide inventory balances, document quantities, and posting write doors

---

## 10.4 On-hand quantity and WAC integrity

### 10.4.1 Purpose

DX OS&E SHALL keep stock balances financially coherent: a positive on-hand quantity MUST always carry a positive weighted-average unit cost (WAC). Silent creation of `qty > 0` with `WAC ≤ 0` is prohibited.

### 10.4.2 Normative rule

| Condition | Required outcome |
|-----------|------------------|
| `qtyOnHand = 0` | `wacUnitCost = 0` is **always allowed** |
| `qtyOnHand > 0` | `wacUnitCost > 0` is **always required** |

Any posting attempt that would produce `qtyOnHand > 0` with `wacUnitCost ≤ 0` **MUST be rejected at the write point** (HTTP `422`, code `ZERO_WAC_WITH_QTY`). The operation MUST NOT complete silently with a zero or missing cost.

### 10.4.3 No free-of-charge (FOC) / zero-price inbound path

There is **no free-sample / FOC / zero-price inbound path** in this system. Any inbound quantity greater than zero MUST have a strictly positive unit price / unit cost. Blank or zero prices on GRN (or equivalent inbound) lines MUST be rejected at post — not treated as complimentary goods.

### 10.4.4 Implementation reference (non-normative location, normative behavior)

Shared guards (backend):

- `assertNoZeroWacWithQty` — resulting balance must not be `qty > 0` with `WAC ≤ 0`
- `assertPositiveUnitCostForInboundQty` — inbound qty `> 0` requires unit cost / price `> 0`

Module file: `OSE-backend/src/services/stockBalanceWacGuard.service.js`

**Write doors that MUST invoke these guards (or equivalent):**

1. GRN — `postingGovernedGrn.service.js` → `postGrnInTransaction`
2. Movement — `posting.service.js` → `postDocument` (RECEIVE / TRANSFER_IN / ADJUSTMENT+ / OPENING_BALANCE)
3. Inventory Count — `postInventoryCountSession` (create and update stock-balance paths)
4. Get Pass — permanent destination receive; return-good stock increase
5. Transfer — `postTransferInTransaction` (source WAC and destination blend)
6. Legacy — `postStockCount` / `postStockReport`

User-facing rejection messages MUST explain that cost is missing and must be corrected (GRN with valid unit price, or Item Master) before retry.

---

## 10.5 Integer quantities (no fractional stock units)

### 10.5.1 Purpose

DX OS&E is an **Operating Supplies & Equipment** platform. All items are counted in whole units. Fractional quantities (weights, volumes, partial pieces) are **out of product scope**.

### 10.5.2 Normative rule

Every quantity entered or posted on inventory documents and stock balances MUST be an **integer** (whole number). Fractional values MUST be rejected at input and at posting write points.

Applies to (non-exhaustive): GRN received qty, Transfer requested/received qty, Inventory Count counted qty, Movement / Breakage / Lost qty, Get Pass line qty and return disposition qtys, and resulting `qtyOnHand` / ledger qty deltas produced by those posts.

### 10.5.3 Relationship to §10.2 quantity precision

Where older text allowed “quantity precision per platform settings,” **§10.5 supersedes** that allowance for operational inventory quantities: the only permitted precision for stock quantities is **whole numbers**.

### 10.5.4 Unit-of-measure conversion

Inventory document paths currently treat user quantity as base quantity (**identity**): GRN, Transfer, Inventory Count, Get Pass, Breakage, and Lost do **not** multiply by `ItemUnit.conversionRate` at create/update/post today.

`ItemUnit.conversionRate` (Item Master) is nevertheless governed by the same whole-number rule: the rate MUST be a **positive integer** (`conversionRate` is an integer `> 0`). Fractional rates MUST be rejected when saving item units, so that if document paths later enable UOM conversion, a fractional rate cannot reopen a path to fractional base quantities under §10.5.

### 10.5.5 Implementation reference

Shared guard: `assertIntegerQuantity` in `OSE-backend/src/services/integerQuantityGuard.service.js`  
Code: `NON_INTEGER_QUANTITY` (HTTP `422`)

**Write / input doors that MUST invoke the guard:**

1. GRN create/update/post  
2. Transfer create/update/post  
3. Inventory Count count entry + post  
4. Movement / Breakage / Lost create/update/post  
5. Get Pass create/update/checkout/return/post  
6. Legacy stock count / stock report post paths that adjust qty  
7. **Item Master `ItemUnit.conversionRate`** on item create/update / `updateItemUnits` (positive integer only; document posting paths unchanged)

Rejection message MUST be clear to operators, e.g. that quantity (or unit conversion rate) must be a whole number (no decimals).
