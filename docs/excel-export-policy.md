# DX OSE — Excel Export Policy

Governance for **reporting** Excel exports under `/api/reports/**`.

Operational exports (inventory count, stock report, GRN import, item import) are **out of scope** — they may use custom ExcelJS/SheetJS paths.

---

## Mandatory rules

1. **All new reporting Excel exports** must use `excel.service.generateExcelBuffer` — no custom ExcelJS workbooks in reporting code.
2. **Data pipeline:** `resolveExportDataset(payload, columnDefs, footerRow, { formatCells: false })`.
3. **Column definitions** from `report-column-contracts.js` or dedicated export constants (e.g. `SUMMARY_EXPORT_COLUMNS`, `SUMMARY_SAVED_EXPORT_COLUMNS`).
4. **Numeric cells:** raw `number` in row data — never pre-formatted SAR strings on the Excel path.
5. **Formatting:** delegated to `assignCellValue` + `numFmt`:
   - `sar` → `"SAR "#,##0.00`
   - `qty` → `#,##0.00`
   - `int` → `#,##0`
6. **Dates:** ISO/`Date` → `parseExcelDate` → Excel serial + `dd/mm/yyyy` (or datetime when applicable).
7. **Grouping contract:** `rowType` ∈ `{LINE, GROUP_HEADER, GROUP_SUBTOTAL, GRAND_TOTAL}` — styling metadata not in the columns array.
8. **Metadata header:** title → generated timestamp + user → filter line → spacer → column headers (engine standard).
9. **Width:** `resolveColumnWidth` minimum + content measure + `getWidthCap(col, densityProfile)` — no unbounded expansion.
10. **Saved grouped reports** → `exportEngineGroupedExcel` adapter; flat saved reports → direct `generateExcelBuffer`.

---

## Presentation profiles

### `accentProfile`

| Rule | Detail |
|------|--------|
| Purpose | Semantic **font color** on movement numeric columns — presentation only |
| Current | `omc-movement` — OMC saved/grouped exports only |
| Forbidden | DETAIL, BREAKAGE, LOST, TRANSFERS, Valuation, Summary |
| New profiles | Require product sign-off + engine hook in `resolveMovementSemanticRole` |

### `densityProfile`

| Profile | When | Width caps (sar / text / default) |
|---------|------|-----------------------------------|
| default | Standard reports | 18 / 28 / 22 |
| `wide` | DETAIL 20-column exports | 20 / 30 / 24 |

Adjusts width caps only — no calculation or format changes.

---

## DETAIL column visibility

| Case | Behavior |
|------|----------|
| No `visibleColumns` query | All 20 columns (Excel default) |
| `?visibleColumns=grn,brk,pass,theor` | `filterDetailColumnDefs` — same groups as PDF |

**Do not** default Excel to PDF's 12-column view.

Valid groups: `grn`, `brk`, `pass`, `theor`.

---

## Saved report endpoints

| Endpoint | Notes |
|----------|-------|
| `GET /reports/:id/excel` | Saved snapshot re-export — snapshot-faithful columns |
| `GET /reports/summary-inventory/excel` | Live Summary Inventory — 17 columns from `getSummaryReport` |
| Saved SUMMARY `:id/excel` | 8 columns from snapshot — not regenerated live |

---

## PR checklist

- [ ] Uses `generateExcelBuffer`?
- [ ] `formatCells: false` on export dataset?
- [ ] Column contract defined (not inline ad-hoc in controller)?
- [ ] `npm run smoke:reporting-final-regression` — ≥23 pass?

PDF golden width failures are out of scope for Excel PRs.

---

## Operational exports annex

Count sheets, stock pivot, GRN template/import, consumption (SheetJS): **may** remain custom.

Evaluate shared engine first for new flat tabular operational exports; use custom layout only when non-tabular or roundtrip-specific.
