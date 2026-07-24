# Item Master List — Loading Performance Root Cause

**Route:** `/items` · **Component:** `ItemsListComponent`  
**Tenant:** DX Airport Hotel (`dx-airport-hotel`, 200 items listed / 201 rows in DB)  
**Date:** 2026-07-03

## Executive summary

The reported **~20 second** wait was **not reproduced** on local dev against the same tenant. Direct API benchmarks show **`GET /items` completes in ~50–60 ms** (20 rows, `total=200`). Browser first interactive load is **~1.6–2.0 s**, dominated by **Angular lazy-route chunk download/compile** (~1.5 s to `app-items-list` mount), not by the items API or DB.

Two confirmed issues were fixed:

1. **Loading UX defect (primary local symptom):** `nzLoading` on an empty `nzData` table dimmed the full table body and showed a centered spinner inside a large blank region (ResizeObserver min-height), visually resembling a layout bug for the entire wait.
2. **Production performance risk:** `getItems` awaited `attachDisplayImageUrl()` (R2 presign) **per row** before responding. Local airport data has **0 images**, so this did not affect local timings but would block list API when many items carry image keys (e.g. UAT/production).

## Required root-cause checks (evidence)

| # | Check | Result |
|---|--------|--------|
| 1 | Is `/items` most of the 20s? | **No locally** — 57 ms API; ~1.5–2 s browser including chunk load |
| 2 | Heavy Includes/Joins? | **Moderate** — list used full `ITEM_INCLUDE` with `stockBalances.location`; trimmed to `ITEM_LIST_INCLUDE` |
| 3 | N+1 per item? | **No** on list query; opening-balance draft agg is batched |
| 4 | Images signed one-by-one? | **Yes in old list API** — `Promise.all(items.map(attachDisplayImageUrl))`; **removed from list** |
| 5 | Frontend waits for image hydration before rows? | **No** — `hydrateListImageUrls` already post-render; now also deferred via `queueMicrotask` |
| 6 | Lookups sequential? | **No** — categories, departments, locations fire in parallel |
| 7 | Duplicate requests? | **Yes** — `/api/items/check-requirements` ×3 (ObThemeService + ItemsList + reload); ~100 ms each, not 20s driver |
| 8 | Signals/effects reload loop? | **No** — single `loadItems` per init; no request loop observed |
| 9 | Slow separate count? | **No** — `findMany` + `count` in `Promise.all`; count ~same total cost as list |
| 10 | API returns 200 while page needs 20? | **No** — pagination correct: `take=20`, `total=200` |
| 11 | Sort/filter full scan? | **No** — indexed tenant filter + `skip/take` |
| 12 | Loading flag stuck on secondary request? | **No** — `loading` cleared on list response; requirements/lookups independent |
| 13 | Auth/permission refresh in waterfall? | **No** — JWT from localStorage; no refresh storm |
| 14 | Browser vs backend delay? | **Browser-side** — lazy chunk ~1.5s; API <100 ms |
| 15 | Second refresh vs first load? | **Refresh ~170–230 ms** vs **~1.6–2 s** first load (chunk cached) |

## Request waterfall (first load, 1920×1080, after fix)

| ms | Path | Notes |
|----|------|-------|
| 840 | `/api/items/check-requirements` | ObThemeService (NavigationEnd) |
| 1508 | `/api/items/check-requirements` | duplicate |
| 1508 | `/api/categories` | parallel lookup |
| 1509 | `/api/departments` | parallel lookup |
| 1510 | `/api/locations` | parallel lookup |
| 1511 | `/api/items/check-requirements` | ItemsListComponent |
| 1511 | `/api/items` | **20 rows, 29 KB** |
| 1512 | `/api/workflow-pipeline/alerts` | shell sidebar (out of scope) |

**Marks:** `app-items-list-mounted` 1562 ms → `rows-visible-idle` 1603 ms.

## Fixes applied (smallest safe)

### Backend (`item.service.js`)

- Use `ITEM_LIST_INCLUDE` (drops `stockBalances.location` join on list).
- Remove `attachDisplayImageUrl` from paginated `getItems`; detail/import paths unchanged.

### Frontend (`items-list` only)

- `initialLoadPending` — compact top-aligned spinner; suppress empty-state; no `nzLoading` full-table dim on first load.
- `listRefreshing` — `nzLoading` only when rows already exist (filter/page/refresh).
- `queueMicrotask` before `hydrateListImageUrls` so row paint precedes thumb fetches.

**Not changed:** shell/sider, table dimensions, pagination size, columns, filters, business data.

## Why ~20s may still appear elsewhere

Not observed locally. Likely external factors:

- **R2 presign per row** on tenants with many item images (mitigated by backend defer).
- **Cold dev compile** of `items-list` lazy chunk on first navigation after server start.
- **Remote network latency** to API host.
- **Perceived duration** inflated by full-table dim + empty placeholder (UX fix).

## Limitations

- Duplicate `check-requirements` (×3) remains — owned by `ObThemeService` + list; out of items-list-only scope.
- Loading screenshots captured at commit; first paint can be sub-200 ms when chunk is warm.
- Production/UAT with image-heavy catalogs not re-benchmarked in this pass.

## Evidence

- `ITEM_MASTER_LOADING_NETWORK_TRACE.json`
- `ITEM_MASTER_LOADING_BEFORE_AFTER.json`
- `ITEM_MASTER_LOADING_RUNTIME_RESULTS.md`
- Screenshots: `screenshots/IM-LIST__*__loading-after.png`, `*__loaded-after.png`, `*__refresh-after.png`
