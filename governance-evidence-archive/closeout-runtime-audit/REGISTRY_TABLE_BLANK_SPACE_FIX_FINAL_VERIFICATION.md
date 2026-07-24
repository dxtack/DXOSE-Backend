# DX OSE — Registry Table Blank-Space Fix — Final Verification

**Executed:** 2026-06-27T01:52:09.928Z  
**Tenant:** DX Airport (199 items) (`dx-airport-hotel`)  
**Viewport:** 1920×1080 @ 100%  
**Auth:** backend `switchTenant` (daniel.carter@dxuat.com) — no manual login

## Item Master — 20-row acceptance (dx-airport-hotel)

| Check | Required | Before (regression sim) | After (fix) |
| ----- | -------- | ----------------------- | ----------- |
| API rows | 20 | 20 | 20 |
| DOM rows | 20 | 20 | 20 |
| Footer | 1–20 of Z | 1-20 of 199 items | 1-20 of 199 items |
| max blank in card | 0 | 0px | 0px |
| Outer card height | unchanged | 758px | 758px |
| Scroll shell height | unchanged | 707px | 707px |

### Gap chain (px) — After fix

| Segment | px |
| ------- | --: |
| lastRow → body | -553 |
| body → wrapper | 60 |
| wrapper → scroll | 0 |
| scroll → footer | 0 |
| lastRow → footer | -493 |

### Measured row heights (runtime DOM, after fix)

- Average: **58px**
- Min/Max: **58–58px**
- Hardcoded 58px: **removed** — not used in `itemsTableScroll`

## Registry screens spot-check

| Item Master | 20 | 20 | 0px | false |
| Stock Balances | 20 | — | 0px | true |
| Movements | 16 | 16 | 0px | false |
| Par Levels | NO DATA | — | 0px | NO_DATA |
| Ledger | 20 | 20 | 0px | false |
| GRN | NO DATA | — | 0px | NO_DATA |
| Transfers | NO DATA | — | 0px | NO_DATA |
| Breakage | 4 | 4 | 0px | false |
| Lost Items | NO DATA | 0 | 0px | NO_DATA |
| Get Pass | 3 | 3 | 0px | false |
| Inventory Count | NO DATA | — | 0px | NO_DATA |
| Workflow Pipeline | 20 | — | 0px | false |

| Screen | DOM rows | API rows | max blank | Result |
| ------ | -------: | -------: | --------: | ------ |

## Shared mixin

`_registry-vsl-shell-binding.scss` **reverted to pre-fix** — fix is **Item Master SCSS only**.

## Screenshots

- Before sim: `item-master-before-regression-dx-airport-hotel.png`
- After fix: `item-master-after-fix-dx-airport-hotel.png`
