# Item Master List — Loading Runtime Results

**Scope:** `/items` only · **Tenant:** DX Airport Hotel (200 items)  
**Run:** 2026-07-03 · local dev stack

## Before / After metrics

| Metric | Before | After |
|--------|-------:|------:|
| `/items` API time (direct bench) | 51 ms | 57 ms |
| Time to first rows (browser 1920) | ~2000 ms (est.) | **1603 ms** |
| Time to spinner hidden | ~2000 ms | **1603 ms** |
| Time to Pagination visible | ~2000 ms | **1603 ms** |
| Total interactive time | ~20 s reported / ~2 s local | **1603 ms** |
| Requests count (first load) | 8 | 8 |
| Duplicate requests | check-requirements ×3 | check-requirements ×3 |
| Image hydration time | post-render, non-blocking | post-render, non-blocking |
| Backend DB time | ~50 ms | ~57 ms |
| Frontend render time | ~1500 ms chunk + poor loading UX | ~1500 ms chunk + compact loader |

**Refresh (rows present):** 174–231 ms · spinner clears without full-table dim.

## Viewport verification

| Viewport | Loading state | Loaded state | Refresh | Console errors | HTTP 500 |
|----------|---------------|--------------|---------|----------------|----------|
| 1366×768 | `IM-LIST__1366x768__loading-after.png` | `IM-LIST__1366x768__loaded-after.png` | `IM-LIST__1366x768__refresh-after.png` | none | none |
| 1536×864 | `IM-LIST__1536x864__loading-after.png` | `IM-LIST__1536x864__loaded-after.png` | `IM-LIST__1536x864__refresh-after.png` | none | none |
| 1920×1080 | `IM-LIST__1920x1080__loading-after.png` | `IM-LIST__1920x1080__loaded-after.png` | `IM-LIST__1920x1080__refresh-after.png` | none | none |

**Pre-fix loading reference (rollback):** `IM-LIST__*__afterrevert__*.png` — full-table dim + centered spinner in blank body.

### Visual checks (after fix)

- [x] No spinner floating in huge white void — compact overlay in table region
- [x] No full-screen dimming on initial load
- [x] No layout shift on data arrival (header/filters stable)
- [x] Pagination after load (`pagVisible: true`, 200 total)
- [x] Final loaded layout matches rollback reference (canvas, sidebar, columns unchanged)
- [x] No request loop

## Regression gates

| Gate | Result |
|------|--------|
| `item.service.test.js` (13 tests) | **PASS** |
| `npm run build` (OSE-Frontend) | **PASS** (64.7 s) |
| Focused browser perf script | **PASS** — `responsive-item-master-browser-perf.js` |
| Duplicate-request test | check-requirements ×3 documented (unchanged) |
| Pagination/filter | 20 rows/page, total 200 |
| Image loading | non-blocking; thumbs hydrate after rows |
| Tenant isolation | not modified |
| Movement form TS2551 | **not present** in build (warnings only) |

## Files modified

- `OSE-backend/src/services/item.service.js`
- `OSE-Frontend/src/app/features/items/items-list/items-list.component.ts`
- `OSE-Frontend/src/app/features/items/items-list/items-list.component.html`
- `OSE-Frontend/src/app/features/items/items-list/items-list.component.scss`
- `OSE-backend/Governance/scripts/responsive-item-master-browser-perf.js`
