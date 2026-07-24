# Workflow Pipeline — Measurements (Before / After Final)

**Run:** After shell cap + flex-fill fix · `WORKFLOW_PIPELINE_RUNTIME_RESULTS.json`  
**Before:** `WORKFLOW_PIPELINE_RUNTIME_RESULTS_BEFORE.json`

## Primary matrix @ browser zoom 100%, deviceScaleFactor=1

| Metric | 1366×768 before | 1366×768 after | 1536×864 after | 1920×1080 after |
|---|---|---|---|---|
| document.scrollHeight | 1133 | **768** | **864** | **1080** |
| document.clientHeight | 768 | 768 | 864 | 1080 |
| **Page scroll** | yes | **no** | **no** | **no** |
| shell height | 1132.8 | **768** | **864** | **1080** |
| shell max-height | none | **768px** | **864px** | **1080px** |
| canvas height | 1019.8 | **655** | **751** | **967** |
| card height | 741.1 | **376.3** | **472.3** | **688.3** |
| scrollShell height | 311 | **325.3** | **421.3** | **637.3** |
| **table body height** | 264 | **278** | **374** | **590** |
| footer bottom | 1107.8 | **743** | **839** | **1055** |
| footer visible | no | **yes** | **yes** | **yes** |
| pagination visible | no | **yes** | **yes** | **yes** |
| blank below table in card | ~379 | **1** | **1** | **1** |
| blank below canvas | — | **0** | **0** | **0** |
| **doubleScroll** | yes | **no** | **no** | **no** |
| vertical scroll owners | 1 (page) | **2** (menu + table body) | 2 | 1 (menu only @1920) |
| visible rows (no body scroll) | 3 | 3 | 5 | 7 |
| API page=1&limit=20 | yes | yes | yes | yes |
| console errors | 0 | 0 | 0 | 0 |

## Zoom diagnostics (after)

| Zoom | Page scroll | Visible rows |
|---|---|---|
| 90% | **no** | 3 |
| 100% | **no** | 3 |
| 110% | **no** | 3 |
| 125% | **no** | 3 |

## Chrome @1366×768 (after)

| Region | Height (px) |
|---|---|
| Page header | 64 |
| KPI cards | 55.5 |
| Filters | 123 |
| **Above card total** | ~278 |

## Notes

- **Visible rows without scroll:** 3–7 depending on viewport — WFP rows are multi-line (~90px/row). All **20 API rows** reachable via table body scroll.
- **Scroll ownership:** sider menu scroll + table body scroll only — no document scroll (matches Item Master target pattern).
- **Windows OS 125% scaling:** not emulated; see `scalingNote` in JSON.

## Screenshots

`screenshots/after/WFP__{1366x768,1536x864,1920x1080}__viewport.png` (full viewport)  
`screenshots/after/WFP__*__fullpage.png`
