# DX OSE Constitution — Amendment: Stock WAC Integrity & Integer Quantities

**Status:** Normative (implemented 2026-07-18)  
**Chapter:** [CH10 — WAC & Integer Qty extensions](chapters/CH10-STOCK-WAC-AND-INTEGER-QTY.md)  
**Hotel verification:** `ph-hotel-mrpfyehb` (see `e2e-uat-results/ZERO_WAC_WITH_QTY_GUARD_VERIFY.md`, integer-qty verify artifact)

---

## Summary

| Addition | Type | File |
|----------|------|------|
| **§10.4** — On-hand qty ⟹ WAC > 0; no FOC inbound | Chapter 10 extension | [chapters/CH10-STOCK-WAC-AND-INTEGER-QTY.md](chapters/CH10-STOCK-WAC-AND-INTEGER-QTY.md) |
| **§10.5** — Integer quantities only (OS&E count units) | Chapter 10 extension | same |

### Normative rules (short form)

1. **`qtyOnHand = 0` → `WAC = 0` allowed; `qtyOnHand > 0` → `WAC > 0` required.** Reject at write if violated.
2. **No FOC / free-sample / zero-price inbound** — inbound qty > 0 requires positive unit cost/price.
3. **All operational quantities are whole numbers** — fractional qty rejected at input and post.
4. **`ItemUnit.conversionRate` must be a positive integer** on Item Master save (§10.5.4). Document paths still use identity qty today (no conversion multiply).

### Implementation

| Concern | Module |
|---------|--------|
| WAC guards | `src/services/stockBalanceWacGuard.service.js` |
| Integer qty guard | `src/services/integerQuantityGuard.service.js` |

Doors: GRN, Movement, Inventory Count, Get Pass, Transfer, Legacy count/report (+ Breakage/Lost create paths for integer qty).
