# Inventory Count — Pilot Stabilization Checklist

Final stabilization before **controlled pilot**, **operational UAT**, and **month-end simulation**.

No feature expansion in this phase — stabilization and trust only.

## Automated smokes (run on staging DB)

```bash
cd OSE-backend
npm run smoke:inventory-count-unification
npm run smoke:count-posting-policy-b
npm run smoke:pre-wave2-rbac
npm run smoke:inventory-count-phase1
npm run smoke:inventory-count-excel-roundtrip
# Optional line counts:
COUNT_EXCEL_LINES=20 npm run smoke:inventory-count-excel-roundtrip
COUNT_EXCEL_LINES=50 npm run smoke:inventory-count-excel-roundtrip
```

## 1. Legacy API (`/api/stock-count`)

| Check | Expected |
|-------|----------|
| POST/PUT/PATCH/DELETE `/api/stock-count/*` | **403** `LEGACY_STOCK_COUNT_MUTATIONS_DISABLED` |
| GET list/detail/evidence | **200** (read-only) + `Deprecation: true` header |
| FE navigation | Only **Inventory Count** (`/inventory-count`) — no legacy menus |
| Emergency legacy | Requires `ALLOW_LEGACY_STOCK_COUNT_MUTATIONS=1` (not for pilot) |

## 2. Excel round-trip (manual UAT)

Per location sheet:

1. Export count sheet
2. Edit **Counted Qty** only (5 / 20 / 50+ rows)
3. Upload same file
4. Submit counts → Submit approval → Approve → Post

Verify: metadata (Session, Location, Count date), item code mapping, no duplicate-row errors, print layout.

## 3. Role-based UAT

| Role | Actions |
|------|---------|
| **Storekeeper** | Create, Start, count/save, Excel upload, submit counts |
| **Cost Control** | Reveal review, variance review |
| **Finance** | Approve, post, ledger review |

Verify: workflow strip, pipeline card, dashboard governance hints, permissions after **re-login** (post RBAC migration).

## 4. Policy B live scenario

```text
Start (snapshot) → GRN/issue after snapshot → count → approve → post
```

Verify:

- `qtyOnHand === countedQty` per cell after post
- Ledger `referenceType = COUNT_SESSION`, `postingPolicy=POLICY_B` in notes
- Screen variance = counted − **snapshot**; ledger adjustment = counted − **live at post**

## 5. Month-end simulation

```text
Opening → movements → snapshot → count → approvals → post → period close → next month opening
```

Verify: `countDate` period lock on start/post, closing balances, integrity checklist, dashboard strip, `OPEN_INVENTORY_COUNT` blocker on close if sessions open.

## 6. Reporting consistency (Policy B)

| Report | Note |
|--------|------|
| Session variances | Snapshot-based (`bookQty` field = snapshot qty) |
| Stock / variance reports | Cell-first when count cells exist |
| Movement history | Include `COUNT_SESSION` not only `STOCK_COUNT` |
| Dashboard KPIs | Open count sessions from canonical path |

## 7. Final PDF

POSTED session → download PDF. Verify: ≤2 pages for ~20 lines, workflow timeline, enterprise footer, Snapshot column label.

## Sign-off

- [ ] All automated smokes green on staging
- [ ] Excel round-trip manual (5 / 20 / 50+)
- [ ] Role UAT complete + re-login confirmed
- [ ] Policy B live scenario signed
- [ ] Month-end simulation signed
- [ ] Owner/demo PDF sample archived
