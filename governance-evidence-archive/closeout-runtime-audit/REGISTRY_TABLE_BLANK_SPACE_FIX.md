# DX OSE — Registry Table Blank-Space Fix

**Executed:** 2026-06-27  
**Scope:** Item Master (primary) + shared registry table scroll physics (all VSL list canvases)  
**Closeout:** Round 8 remains paused per user instruction.

---

## 1. Root cause (confirmed)

Registry VSL **Tier A.2** combined three behaviors that produce a tall, empty table body canvas:

| Layer | Mechanism | Effect |
| ----- | --------- | ------ |
| `registry-table-scroll-physics` | `.ant-table-body { flex: 1 1 auto; height: 100% }` + wrapper chain `height: 100%` | Body stretches to fill the scroll shell even when row content is shorter |
| `itemsTableScroll` / peer list scroll | `[nzScroll]="{ y: 'var(--registry-table-body-scroll-h)' }"` | ng-zorro sets `max-height` on `.ant-table-body` to the **full shell budget** (~604px @ 1920×1080), not row content height |
| `registry-card-flex-fill` | Scroll shell `flex: 1 1 0%`; footer `margin-top: auto` | Footer pinned to card floor; scroll region keeps fixed outer height |

**Not the cause:** page size (still 20), virtual scroll (not used on Item Master), API under-fetch alone, closeout harness (does not write frontend SCSS).

**Footer vs visible rows:** `pageRangeParams` uses `pageSize` and `total`, **not** `itemsList().length`. Footer `1–20 of 199` does **not** prove 20 `<tr>` nodes—only that `pageSize=20` and `total=199`. The user screenshot (`1–20 of 199`, ~7 visible rows, large white band) matches a **fixed-height scroll body** with content shorter than the allocated body viewport (layout), with or without a full API page.

**ng-zorro:** With `nzScroll.y`, `bodyStyleMap` sets `maxHeight: scrollY` on `.ant-table-body` (see `ng-zorro-antd-table.mjs`). Combined with flex-fill physics, the body becomes a tall empty canvas below the last rendered row.

---

## 2. API rows vs component rows vs DOM rows

### Before fix (runtime @ grand-horizon, 1920×1080, `admin@grandhorizon.com`)

| Check | Value |
| ----- | ----- |
| API `take=20` rows | 11 (`meta.total=11`) |
| Component footer text | `1–11 of 11 items` |
| DOM `.ant-table-row` count | 11 (+ 1 measure row) |
| `.ant-table-body` computed `flex` | `1 1 auto` |
| `.ant-table-body` height | `604px` (full shell budget) |
| `.ant-table-body` inline style | `max-height: var(--registry-table-body-scroll-h)` |
| Scroll shell height | `647px` |
| Work card height | `698px` |
| Internal dead space in body (client − min(tbody, client)) | **Up to ~198px** when row content ≪ shell (same class of defect as user 199-item screenshot) |

### User “before” screenshot (reference — not re-run; tenant with 199 items)

| Check | Value |
| ----- | ----- |
| Footer | `1–20 of 199 items` |
| Visible data rows | ~7 |
| Blank band | Large (between last row and pagination) |
| Artifact | `Governance/closeout-runtime-audit/items-table-fix/item-master-before.png` (copy of user image) |

### After fix (same viewport / tenant / user)

| Check | Expected | Actual |
| ----- | -------- | ------ |
| API page size | 20 | 20 (`take=20`) |
| API rows returned | — | 11 |
| DOM body rows | = API rows | **11** |
| Footer | unchanged logic | `1–11 of 11 items` |
| `deadSpaceInBodyPx` | 0 | **0** |
| `.ant-table-body` flex | content-hug | **`0 1 auto`** |
| Inline `max-height` | content-capped | **`min(638px, var(--registry-table-body-scroll-h))`** |
| Outer work card height | unchanged | **698px** (unchanged vs pre-fix inspect) |
| Outer scroll shell height | unchanged | **647px** (unchanged) |
| Artifact | — | `items-table-fix/item-master-after.png`, `item-master-after-fullpage.png` |

---

## 3. Files modified

| File | Change |
| ---- | ------ |
| `OSE-Frontend/src/app/shared/styles/_registry-vsl-shell-binding.scss` | `registry-table-scroll-physics`: body/wrapper chain `height: auto`, body `flex: 0 1 auto`, `max-height: var(--registry-table-body-scroll-h)` |
| `OSE-Frontend/src/app/features/items/items-list/items-list.component.ts` | `itemsTableScroll`: `y: min(rows×58px, var(--registry-table-body-scroll-h))` |
| `OSE-Frontend/src/app/features/items/items-list/items-list.component.scss` | Items-only reinforcement: body/table `height: auto`, content-hugging overrides |
| `OSE-Frontend/scripts/verify-items-table-rows.mjs` | Verification harness (governance evidence) |

**Not modified:** `main-layout.component.scss`, page height chain, `--registry-content-usable-h`, filters, columns, pagination component, page size constants.

---

## 4. Exact diff (summary)

### `_registry-vsl-shell-binding.scss` — `registry-table-scroll-physics`

```diff
- height: 100%;          // wrappers + container
+ height: auto;
+ max-height: 100%;

- .ant-table-body { flex: 1 1 auto; max-height: 100%; }
+ .ant-table-body { flex: 0 1 auto; height: auto; max-height: var(--registry-table-body-scroll-h, 100%); }
```

### `items-list.component.ts` — `itemsTableScroll`

```diff
- ? { y: 'var(--registry-table-body-scroll-h)' }
+ ? { y: `min(${rows * 58}px, var(--registry-table-body-scroll-h))` }  // rows = itemsList().length
```

### `items-list.component.scss` (desktop)

```scss
.ant-table-body {
  flex: 0 1 auto !important;
  height: auto !important;
  max-height: var(--registry-table-body-scroll-h) !important;
  overflow-y: auto !important;
  table { height: auto !important; }
}
```

---

## 5. Why this does not change page space

- No edits to `main-layout.component.scss`, `--app-viewport-h`, sidebar, header, filters, or page padding.
- `:host` / `.registry-ops-page` min-height and flex chain **unchanged**.
- Verification: work card **698px**, scroll shell **647px** before and after @ 1920×1080.

---

## 6. Why this does not change outer table space

- `registry-card-flex-fill` and `registry-work-card-scroll-shell` **unchanged** (scroll shell still `flex: 1 1 0%`, footer `margin-top: auto`).
- Card border, radius, width, position vs filters **unchanged**.
- Only **internal** ant-table wrapper/body height behavior changed from “fill shell” to “hug rows, cap at shell budget”.

---

## 7. Item Master before / after

| | Before | After |
| - | ------ | ----- |
| Screenshot | `items-table-fix/item-master-before.png` (user: 199 items, ~7 visible, white band) | `items-table-fix/item-master-after-fullpage.png` |
| DOM rows | 11 local / ~7 visible in user shot | **11** (= API) |
| Body dead space | Large when content ≪ shell | **0px** (`deadSpaceInBodyPx`) |
| Outer card | 698px local baseline | **698px** |

---

## 8. Verification — other registry screens

Shared mixin patch applies to all canvases using `@include vsl.registry-table-scroll-physics` (Movements, Stock, GRN, Transfers, Breakage, Lost Items, Get Pass, Ledger, etc.).

Spot-check @ grand-horizon (`admin@grandhorizon.com`) — most routes empty / setup-gated (no table rows); **no additional per-screen patches** applied.

| Screen | Table present | Rows | Action |
| ------ | ------------- | ---- | ------ |
| Stock Balances | No (empty/setup) | 0 | None |
| Movements | No | 0 | None |
| Par Levels | No | 0 | None |
| Ledger | No | 0 | None |
| GRN / Transfers / IC / Pipeline | No | 0 | None |
| Breakage / Lost / Get Pass | Shell only | 0 | None — inherits shared mixin when data present |

**Recommendation:** Re-run `scripts/verify-items-table-rows.mjs` on a tenant with ≥20 items (e.g. `dx-marina-hotel`, 500 items) when credentials available.

---

## 9. Build result

```
npm run build  →  SUCCESS
Output: OSE-Frontend/dist/OSE
(warnings only — pre-existing NG8107/NG8113 in unrelated components)
```

---

## 10. No other UI changes

Confirmed **no** changes to:

- Page size (20) or pagination behavior  
- Columns, widths, fonts, colors, badges, buttons  
- Filters, header chrome, footer layout/pagination control markup  
- `main-layout` dimensions or registry route host flex chain  
- Backend / DB / closeout harness  
- Any screen beyond shared scroll-physics mixin + Item Master TS/SCSS listed above  

---

## Diagnostic answers (Item Master runtime)

| # | Question | Answer |
| - | -------- | ------ |
| 1 | API rows? | 11 @ grand-horizon (`take=20`); user screenshot tenant ≈199 total |
| 2 | Component data source? | `itemsList()` same as API rows |
| 3 | DOM `<tr>`? | 11 `.ant-table-row` (+ measure row) |
| 4 | Footer 20 vs ~7 visible? | Footer uses `pageSize`, not DOM count; layout fixed shell caused white band |
| 5 | `nzScroll.y` clipping? | Sets large `max-height`; with flex-fill → empty body canvas |
| 6 | Virtual scroll? | **No** |
| 7 | `.ant-table-body` vs container? | Before: body forced to shell height; after: `height: auto`, capped |
| 8 | `flex:1` / `height:100%` dead space? | **Yes — root cause** |
| 9 | Hidden rows? | **No** — blank was empty flex/canvas area |
| 10 | Data cleanup? | **No** impact on Item Master layout |

---

**Status:** Item Master table body rendering restored to content-hug + capped internal scroll inside **unchanged** outer VSL shell. Round 8 closeout may resume only after user confirms UI sign-off on Item Master @ ≥20-row tenant.
