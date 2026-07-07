# Item Master + Transfer — Runtime Measurement Matrix

Generated: 2026-07-03T11:07:24.560Z

Frontend: http://127.0.0.1:4200 · API: http://127.0.0.1:4000/api

Tenant: `closeout-audit-hotel-disposable` (CLOSEOUT_RT_AUDIT Disposable Hotel) — child hotel

Account: `disp-perm-fin@closeout-audit.local` · role FINANCE_MANAGER · 58 permissions (read-only minted session)

Viewports (primary, OS scaling 100%, browser zoom 100%): 1366x768, 1536x864, 1920x1080 — CSS pixels via getBoundingClientRect().

Windows 125% represented as a second matrix (CSS viewport = physical/1.25, dpr 1.25): 1093×614, 1229×691, 1536×864.

## App shell (identical on every screen)

| Metric | 1366×768 | 1536×864 | 1920×1080 |
|---|--:|--:|--:|
| Sider width (px) | 250 | 250 | 250 |
| Header height (px) | 65 | 65 | 65 |
| Content available width (px) | 1366 | 1536 | 1920 |
| Shell/content total height (px) | 1132.8 | 1132.8 | 1132.8 |
| Page vertical scroll? | true | true | true |

> Shell height is a constant ~1133px on every viewport because the 25-item sidebar nav (overflow:hidden, min-height:768px) is taller than the viewport and stretches the shell. The document — not the content container — owns vertical scroll on all screens.

## Item Master

| Screen | Viewport | Result | Content avail | Outer card (W×H) | Card max-w | Table body (W×H) | Cols | Rows | sW/cW | Pagination | Scroll owner | Blank below |
|---|---|---|--:|--:|---|--:|--:|--:|--:|---|---|--:|
| Item Master List | 1366x768 | PASS | 1366×1132.8 | 1049.9×644.5 | 100% | 1047.9×582.5 | 8 | 6 | 1048/1048 | — | document | 42 |
| Item Master List | 1536x864 | PASS | 1536×1132.8 | 1215.6×644.5 | 100% | 1213.6×582.5 | 8 | 6 | 1214/1214 | — | document | 42 |
| Item Master List | 1920x1080 | PARTIAL | 1920×1132.8 | 1590×644.5 | 100% | 1588×550.5 | 8 | 5 | 1588/1588 | below-fold | document | 33 |
| Add Item | 1366x768 | PASS | 1366×1132.8 | 1049.9×729 | 100% | — | — | — | — | — | document | — |
| Add Item | 1536x864 | PASS | 1536×1132.8 | 1215.6×729 | 100% | — | — | — | — | — | document | — |
| Add Item | 1920x1080 | PASS | 1920×1132.8 | 1590×729 | 100% | — | — | — | — | — | document | — |
| Edit Item | 1366x768 | PASS | 1366×1175.2 | 1049.9×871.8 | 100% | — | — | — | — | — | document | — |
| Edit Item | 1536x864 | PASS | 1536×1175.2 | 1215.6×871.8 | 100% | — | — | — | — | — | document | — |
| Edit Item | 1920x1080 | PASS | 1920×1175.2 | 1590×871.8 | 100% | — | — | — | — | — | document | — |
| Item Import Upload | 1366x768 | PASS | 1366×1132.8 | 1068×63.3 | none | — | — | — | — | — | document | — |
| Item Import Upload | 1536x864 | PASS | 1536×1132.8 | 1238×63.3 | none | — | — | — | — | — | document | — |
| Item Import Upload | 1920x1080 | PASS | 1920×1132.8 | 1352×63.3 | none | — | — | — | — | — | document | — |
| Item Master List (row modal attempt) | 1366x768 | PASS | 1366×1132.8 | 1049.9×644.5 | 100% | 1047.9×582.5 | 8 | 6 | 1048/1048 | — | document | 42 |
| Item Master List (row modal attempt) | 1536x864 | PASS | 1536×1132.8 | 1215.6×644.5 | 100% | 1213.6×582.5 | 8 | 6 | 1214/1214 | — | document | 42 |
| Item Master List (row modal attempt) | 1920x1080 | PASS | 1920×1132.8 | 1590×644.5 | 100% | 1588×582.5 | 8 | 6 | 1588/1588 | — | document | 42 |

## Transfer

| Screen | Viewport | Result | Content avail | Outer card (W×H) | Card max-w | Table body (W×H) | Cols | Rows | sW/cW | Pagination | Scroll owner | Blank below |
|---|---|---|--:|--:|---|--:|--:|--:|--:|---|---|--:|
| Transfer List | 1366x768 | PARTIAL | 1366×1132.8 | 1049.9×898.8 | 100% | 1047.9×388 | 6 | 11 | 1048/1048 | below-fold | document + table (DOUBLE) | 37 |
| Transfer List | 1536x864 | PARTIAL | 1536×1132.8 | 1215.6×898.8 | 100% | 1213.6×484 | 6 | 11 | 1214/1214 | below-fold | document + table (DOUBLE) | 37 |
| Transfer List | 1920x1080 | PARTIAL | 1920×1132.8 | 1590×898.8 | 100% | 1588×700 | 6 | 11 | 1588/1588 | below-fold | document | 37 |
| Create Transfer | 1366x768 | PASS | 1366×1132.8 | 1068×257.3 | none | — | — | — | — | — | document | — |
| Create Transfer | 1536x864 | PASS | 1536×1132.8 | 1238×257.3 | none | — | — | — | — | — | document | — |
| Create Transfer | 1920x1080 | PASS | 1920×1132.8 | 1352×257.3 | none | — | — | — | — | — | document | — |
| Edit Draft Transfer | 1366x768 | PARTIAL | 1366×1132.8 | 1068×257.3 | none | 1026×57 | 3 | 1 | 1026/1026 | — | document | 503.6 |
| Edit Draft Transfer | 1536x864 | PARTIAL | 1536×1132.8 | 1238×257.3 | none | 1196×57 | 3 | 1 | 1196/1196 | — | document | 503.6 |
| Edit Draft Transfer | 1920x1080 | PARTIAL | 1920×1132.8 | 1352×257.3 | none | 1310×57 | 3 | 1 | 1310/1310 | — | document | 503.6 |
| Transfer Detail (DRAFT) | 1366x768 | PARTIAL | 1366×1132.8 | 691.9×216.9 | none | 674.9×39 | 6 | 1 | 675/675 | — | document | 524.5 |
| Transfer Detail (DRAFT) | 1536x864 | PARTIAL | 1536×1132.8 | 802.4×216.9 | none | 785.4×39 | 6 | 1 | 785/785 | — | document | 524.5 |
| Transfer Detail (DRAFT) | 1920x1080 | PARTIAL | 1920×1132.8 | 1052×216.9 | none | 1035×39 | 6 | 1 | 1035/1035 | — | document | 524.5 |
| Transfer Detail (PENDING_DEPT) | 1366x768 | PARTIAL | 1366×1132.8 | 691.9×216.9 | none | 674.9×39 | 6 | 1 | 675/675 | — | document | 524.5 |
| Transfer Detail (PENDING_DEPT) | 1536x864 | PARTIAL | 1536×1132.8 | 802.4×216.9 | none | 785.4×39 | 6 | 1 | 785/785 | — | document | 524.5 |
| Transfer Detail (PENDING_DEPT) | 1920x1080 | PARTIAL | 1920×1132.8 | 1052×216.9 | none | 1035×39 | 6 | 1 | 1035/1035 | — | document | 524.5 |
| Transfer Detail (PENDING_FINANCE) | 1366x768 | PARTIAL | 1366×1132.8 | 691.9×216.9 | none | 674.9×39 | 6 | 1 | 675/675 | — | document | 524.5 |
| Transfer Detail (PENDING_FINANCE) | 1536x864 | PARTIAL | 1536×1132.8 | 802.4×216.9 | none | 785.4×39 | 6 | 1 | 785/785 | — | document | 524.5 |
| Transfer Detail (PENDING_FINANCE) | 1920x1080 | PARTIAL | 1920×1132.8 | 1052×216.9 | none | 1035×39 | 6 | 1 | 1035/1035 | — | document | 524.5 |
| Transfer Detail (POSTED) | 1366x768 | PARTIAL | 1366×1132.8 | 691.9×216.9 | none | 674.9×39 | 6 | 1 | 675/675 | — | document | 524.5 |
| Transfer Detail (POSTED) | 1536x864 | PARTIAL | 1536×1132.8 | 802.4×216.9 | none | 785.4×39 | 6 | 1 | 785/785 | — | document | 524.5 |
| Transfer Detail (POSTED) | 1920x1080 | PARTIAL | 1920×1132.8 | 1052×216.9 | none | 1035×39 | 6 | 1 | 1035/1035 | — | document | 524.5 |
| Transfer Detail (REJECTED) | 1366x768 | PARTIAL | 1366×1132.8 | 691.9×216.9 | none | 674.9×39 | 6 | 1 | 675/675 | — | document | 466.5 |
| Transfer Detail (REJECTED) | 1536x864 | PARTIAL | 1536×1132.8 | 802.4×216.9 | none | 785.4×39 | 6 | 1 | 785/785 | — | document | 466.5 |
| Transfer Detail (REJECTED) | 1920x1080 | PARTIAL | 1920×1132.8 | 1052×216.9 | none | 1035×39 | 6 | 1 | 1035/1035 | — | document | 466.5 |

## Column inventory (identical across all three viewports — no viewport-based hiding)

- Item Master List (8): Item name, Category, Supplier, Base unit, Unit price, Total qty, Status, Actions
- Transfer List (6): Ref No., From → To, Date, Items, Workflow status, By
- Transfer Detail lines (6): Item, UOM, Req. Qty, Posted Qty, Unit Cost, Total Value

