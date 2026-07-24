# Reporting Wave 1B — UX / layout stabilization

**Scope:** Filter standardization and sticky export actions across the reporting workspace.  
**Out of scope:** Business logic, calculations, RBAC, posting, variance math.

## Filter standard (order)

1. From date (or As-of for snapshot reports)
2. To date (period mode only)
3. Location / store / warehouse
4. Department(s)
5. Category

Implemented in `app-report-viewer-shell` and aligned in `app-report-engine`.

## Sticky actions (order)

Inside the filter sidebar, fixed footer section:

1. Generate report
2. Export PDF (when enabled)
3. Export Excel (when enabled)
4. Print (optional, summary report)

Exports remain visible after generation (including empty result sets). Buttons use a stable column layout and do not wrap with report body height.

## API filter passthrough (no calculation changes)

- Analytics: optional `locationIds` query param intersects with department/category-resolved locations.
- Report engine generate: optional `locationIds` in POST body intersects resolved scope.
- Summary inventory: optional `locationIds` narrows location scope used in existing aggregation paths.

## Verification

1. Open analytics card → confirm filter order and sticky actions after generate.
2. Generate with zero rows → export buttons still visible in sidebar (disabled when no data for export handlers).
3. Valuation → location filter in standard slot (no extra filter block).
4. Report engine (Detail/Breakage/etc.) → same filter order; PDF/Excel in sidebar after generate.
