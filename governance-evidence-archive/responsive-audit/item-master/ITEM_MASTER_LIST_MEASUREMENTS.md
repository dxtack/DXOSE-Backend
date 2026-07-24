# Item Master List (`/items`) — Browser Runtime Measurements (Before / After)

- **Screen:** Item Master List · Route `/items` · Component `ItemsListComponent`
- **Method:** Playwright (chromium), real `getBoundingClientRect()` in-page, 100% browser zoom, read-only minted session (**ZERO DB writes**).
- **Tenant/account (after):** `closeout-audit-hotel-disposable` · `disp-perm-fin@closeout-audit.local` · `FINANCE_MANAGER` (58 permissions).
- **Before source:** `Governance/responsive-audit/pilot/ITEM_MASTER_TRANSFER_RUNTIME_RESULTS.json` (IM-LIST, primary matrix).
- **After source:** `Governance/responsive-audit/item-master/ITEM_MASTER_LIST_RUNTIME_RESULTS.json`.

> Column-count note: the pilot (before) extractor dropped the empty-header image column (counted **8**); the after extractor keeps it as `(blank)` (counts **9**). Rendered columns are **identical** — only the counting rule differs.

## Shell / scroll ownership

| Metric | 1366×768 before | 1366×768 after | 1536×864 before | 1536×864 after | 1920×1080 before | 1920×1080 after |
|---|---|---|---|---|---|---|
| Document page scroll | **yes** | **no** | **yes** | **no** | **yes** | **no** |
| Shell height (px) | 1132.8 | 768 | 1132.8 | 864 | 1132.8 | 1080 |
| Sider height (px) | 1132.8 | 768 | 1132.8 | 864 | 1132.8 | 1080 |
| Sider menu internal scroll | n/a (page scrolled) | **yes** (628→993) | n/a | **yes** | n/a | **yes** |
| Sider footer reachable | via page scroll | **yes** (bottom 767.9) | via page scroll | **yes** | via page scroll | **yes** |
| Vertical scroll owners | 0 (whole page) | 2 (menu + table body) | 0 | 2 | 0 | 1 (menu; body fits) |
| Double data-scroll | page-only | **no** | page-only | **no** | page-only | **no** |

## Registry canvas / card / table

| Metric | 1366×768 before | 1366×768 after | 1536×864 before | 1536×864 after | 1920×1080 before | 1920×1080 after |
|---|---|---|---|---|---|---|
| Content height (px) | 1132.8 | 703 | 1132.8 | 799 | 1132.8 | 1015 |
| Card width (px) | 1049.9 | 1049.9 | 1215.6 | 1215.6 | **1590** | **1590** |
| Card bottom (px) | 1108.8 | 744 | 1108.8 | 840 | 1108.8 | 1056 |
| **Table body height (px)** | **583** | **218** | **583** | **314** | **551** | **530** |
| Table body max-height | 583px | 218px | 583px | 314px | 551px | 530px |
| Table body horizontal scroll | no | no | no | no | no | no |
| Blank area below table (px) | 42 | **1** | 42 | **1** | 33 | **1** |

## Pagination / footer

| Metric | 1366×768 before | 1366×768 after | 1536×864 before | 1536×864 after | 1920×1080 before | 1920×1080 after |
|---|---|---|---|---|---|---|
| Footer visible in viewport | **no** (bottom 1132.8) | **yes** (743) | **no** | **yes** (839) | **no** (1132.8) | **yes** (1055) |
| Pagination visible in viewport | **no** | **yes** (bottom 735) | **no** | **yes** (bottom 831) | **no** (bottom 1099.8) | **yes** (bottom 1047) |

## Table body height monotonicity (grows with viewport)

| Phase | 1366×768 | 1536×864 | 1920×1080 | Monotonic ↑ |
|---|---|---|---|---|
| Before | 583 | 583 | **551** | ❌ (drops at 1920) |
| After | 218 | 314 | **530** | ✅ |

## Columns (identical across all viewports, both phases)

`(image)` · Item name · Category · Supplier · Base unit · Unit price · Total qty · Status · Actions

(The `Opening qty setup` column is conditional on OB `OPEN` status and is not present for this tenant in either phase — consistent before and after. Actions column reachable within the viewport at all three sizes after the fix.)

## Screenshots

`Governance/responsive-audit/item-master/screenshots/`
- `IM-LIST__{1366x768,1536x864,1920x1080}__after__viewport.png` (visible viewport)
- `IM-LIST__{...}__after__fullpage.png` (full document — equal to viewport, proving no page scroll)
- `SMOKE-TR-LIST__1920x1080__after.png`, `SMOKE-DASHBOARD__1920x1080__after.png` (shared-shell regression proof)

Before screenshots: `Governance/responsive-audit/pilot/screenshots/IM-LIST__*.png`.
