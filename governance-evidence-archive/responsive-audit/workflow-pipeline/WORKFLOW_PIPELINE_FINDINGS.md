# Workflow Pipeline — Final Findings

**Status:** NOT CLOSED — pending Amr visual review.

## Files modified

| File | Change |
|---|---|
| `main-layout.component.scss` | Route-scoped shell cap `:host:has(app-workflow-pipeline)` @768+ |
| `workflow-pipeline.component.html` | `#tableScrollShell` ref |
| `workflow-pipeline.component.ts` | `ResizeObserver` + dynamic body max-height |
| `workflow-pipeline-table-scroll.util.ts` | Bootstrap scrollY for paginated data |
| `_workflow-pipeline-command-canvas.scss` | Flex-fill dense layout; nz-spin chain; overflow hidden on scroll shell |

## Root cause (confirmed)

1. **Shell stretch:** `.main-shell` grew to **1133px** (sider natural height) → document scroll + white area below WFP content.
2. **Table body token:** Static `--workbench-table-body-scroll-h` capped body at ~264px while card was 741px → **379px blank** inside card.
3. **Fixed host height:** `height: var(--registry-content-usable-h)` left ~39px unused vs flex parent after partial fix.

## Fix applied

1. **Shell cap (WFP-only):** `.main-shell` + sider → `height/max-height: var(--app-shell-layout-h)`; sider-children flex column for menu scroll.
2. **Flex-fill host:** dense `wfp-command-host` → `height: 100%` filling capped content area.
3. **ResizeObserver:** body `max-height = scrollShell.clientHeight − header` (authoritative).
4. **Scroll shell:** `overflow: hidden` — single data scroll owner = `.ant-table-body`.

## Acceptance criteria

| Criterion | 1366 | 1536 | 1920 |
|---|---|---|---|
| Page scroll = 0 | ✅ | ✅ | ✅ |
| Double scroll = 0 | ✅ | ✅ | ✅ |
| Blank ≤ 2px | ✅ (1) | ✅ | ✅ |
| Footer/pagination visible | ✅ | ✅ | ✅ |
| pageSize / API limit = 20 | ✅ | ✅ | ✅ |
| Console errors = 0 | ✅ | ✅ | ✅ |
| Full build PASS | ✅ | | |
| Other routes untouched | ✅ (route-gated) | | |

## Other routes

Shell cap is gated to `:host:has(app-workflow-pipeline)` only. `/items`, `/dashboard`, transfers, etc. retain prior shell behavior.

## Evidence

```
OSE-backend/Governance/responsive-audit/workflow-pipeline/
  WORKFLOW_PIPELINE_RUNTIME_RESULTS_BEFORE.json
  WORKFLOW_PIPELINE_RUNTIME_RESULTS.json
  WORKFLOW_PIPELINE_MEASUREMENTS.md
  WORKFLOW_PIPELINE_FINDINGS.md
  screenshots/before/ + screenshots/after/
```
