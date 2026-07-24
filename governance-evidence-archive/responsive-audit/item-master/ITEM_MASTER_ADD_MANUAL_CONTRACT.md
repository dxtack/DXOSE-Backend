# Item Master — Manual Add Item Card-Only Contract

**Date:** 2026-07-03  
**Route:** `/items/new`  
**Tenant:** `dx-airport-hotel`

## Summary

Manual Add Item now creates an **Item Master card only**. Unit Price, Opening Quantity, Opening Balance banners, and related create payload fields are excluded from the Add path. Edit Item behavior is unchanged.

## Runtime Evidence

Full JSON: `ITEM_MASTER_ADD_MANUAL_CONTRACT_RUNTIME.json`

| Check | Result |
|---|---|
| Unit Price hidden on Add (1366/1536/1920) | PASS |
| Opening Quantity hidden on Add | PASS |
| OB setup banner hidden on Add | PASS |
| UI POST payload excludes `unitPrice` / `openingQuantity` | PASS |
| API card-only create: no stock/ledger/OB lines | PASS |
| `item.unitPrice` default after create | `0` |
| Test item cleanup | PASS |
| Console errors on `/items/new` | 0 |
| `NG01203` unitPrice on Add | None |
| Horizontal overflow | None |
| Frontend build | PASS |
| Excel Import route loads | PASS (200) |
| Item List page size | 50 unchanged |

## Screenshots

- `screenshots/IM-ADD-CONTRACT__1366x768__top.png`
- `screenshots/IM-ADD-CONTRACT__1366x768__bottom-actions.png`
- `screenshots/IM-ADD-CONTRACT__1536x864__top.png`
- `screenshots/IM-ADD-CONTRACT__1536x864__bottom-actions.png`
- `screenshots/IM-ADD-CONTRACT__1920x1080__top.png`
- `screenshots/IM-ADD-CONTRACT__1920x1080__bottom-actions.png`

## Constitution

Added requirements **16.4-01 … 16.7-01** to `Governance/requirements.json` with evidence in `Governance/evidence.json`. Register regenerated via `Governance/build-register.mjs`.
