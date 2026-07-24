# DX OSE — Excel Track Closure Record

**Status: CLOSED** (reporting foundation)

Closure date: 2026-05-25 (post Wave 3.6 + cleanup)

---

## Completed waves

| Wave | Scope |
|------|-------|
| **1** | Raw numeric cells |
| **2** | Shared engine hardening |
| **Micro 2.5** | Bounded fill |
| **Micro 2.6** | Header structure fix |
| **Micro 3.3.5** | Global stabilization (widths/dates) |
| **3.1** | Valuation → `generateExcelBuffer` |
| **3.2** | Summary Inventory endpoint |
| **3.3** | LOST / BREAKAGE → `exportEngineGroupedExcel` |
| **3.4** | TRANSFERS |
| **3.5** | OMC (`accentProfile: omc-movement`) |
| **3.6** | DETAIL (`densityProfile: wide`, optional `visibleColumns`) |
| **Closure** | Saved SUMMARY + AGING → shared engine; legacy ExcelJS block removed |

---

## Architecture (final)

| Report / path | Engine |
|---------------|--------|
| Analytics (`/reports/analytics/:type/excel`) | `generateExcelBuffer` |
| Valuation | `generateExcelBuffer` |
| Summary Inventory (`/summary-inventory/excel`) | `generateExcelBuffer` — 17 cols |
| Saved BREAKAGE / LOST / TRANSFERS / OMC / DETAIL | `exportEngineGroupedExcel` |
| Saved SUMMARY (`/:id/excel`) | `generateExcelBuffer` — **8 cols snapshot-faithful** |
| Saved AGING (`/:id/excel`) | `generateExcelBuffer` — `inventory-health-aging` contract |
| Operational (count, stock, GRN, items) | Custom — separate annex |

---

## Reopen criteria

Reopen Excel track **only** for:

1. **Real bug** in a migrated export path
2. **UAT hotel feedback** with reproducible issue
3. **Explicit cleanup ticket** (e.g. operational export migration)

**Not** for: enhancements, redesign, endless polish, PDF/frontend work.

---

## Manual UAT notes (hotels)

- Saved SUMMARY `:id/excel` → 8 cols, shared styling, `=SUM()` on SAR columns
- Full 17-col Summary Inventory → use `/reports/summary-inventory/excel` (not saved `:id`)
- Saved AGING `:id/excel` → analytics-equivalent columns via shared engine
- DETAIL default 20 cols; optional `?visibleColumns=grn,brk`
- OMC movement font colors on lines + subtotals

---

## Smoke baseline

```bash
cd OSE-backend
node scripts/smoke-reporting-final-regression.js
```

Expected: **≥23 pass**. `Golden column width sum` fail = PDF golden, out of scope.

---

## Next product tracks (NOT Excel)

- Reporting Workspace
- Dashboard
- Workflow Pipeline
- PDF identity alignment
- UAT final polish
