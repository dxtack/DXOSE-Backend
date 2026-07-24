# Reporting — Final Stabilization & Regression Lock

**Date:** 2026-05-20  
**Scope:** Hardening after Wave 1A (PDF facade) + Wave 1B (column contracts) + UX stabilization.  
**Not in scope:** Wave 1C, new features, calculation/query changes.

## Automated regression suite

Run from `OSE-backend`:

```bash
npm run smoke:reporting-final-regression
npm run smoke:reporting-wave1b-contracts
npm run smoke:reporting-wave1a-pdf
node scripts/uat-phase1-reporting.js
```

From `OSE-Frontend`:

```bash
npm run build
```

## Golden reports — validation matrix

| Report | Shell | PDF | Excel | Contract | Grouped export | Notes |
|--------|-------|-----|-------|----------|----------------|-------|
| Current stock balance | Analytics | Yes | Yes | Yes | Yes | OB gate unchanged |
| Summary report | Summary | Print only* | No* | Engine legacy | No | *Exports via print; engine PDF if saved report used |
| Valuation report | Valuation | No* | Yes | Engine | No | *PDF disabled in shell by design |
| OMC report | Engine | Yes | Yes | Yes | Yes | Saved report export |
| Count variance report | Analytics | Yes | Yes | Yes | Yes | Snapshot qty terminology |
| Inventory change history | Analytics | Yes | Yes | Yes | Yes | Ledger contract |
| Transfer history | Engine / Analytics | Yes | Yes | Yes | Yes | Engine + open-transfers |
| Breakage/loss report | Engine | Yes | Yes | Yes | Yes | Grouped when enabled |
| Pending operations | Analytics | Yes | Yes | Yes | No | Flat contract table |
| Period close validation | Analytics | Yes | Yes | Yes | No | Flat contract table |

## PDF / Excel parity (locked)

- Analytics: `exportAnalyticsPdf` and `exportAnalyticsExcel` both call `resolveExportDataset()` with the same `columnDefs`, `footerRow`, and `flatRows`.
- Engine (OMC/BREAKAGE/TRANSFERS): `exportPdf` and `exportExcel` both call `resolveEngineExportRows()`.
- Grouped exports include `rowType`, `groupLevel`, `groupLabel`, line columns, and `GRAND_TOTAL` footer row.
- English headers from contracts (no inferred camelCase on covered cards).

## UX regression (Wave 1B — verify in staging)

- [ ] Filter order: From → To → Location → Department → Category
- [ ] Sticky actions: Generate → Export PDF → Export Excel (fixed footer in sidebar)
- [ ] Exports visible after generate (disabled when no rows)
- [ ] Filter panel scroll independent of action buttons
- [ ] Collapsed filter toggle on narrow viewports

## Arabic / encoding

- [x] `REPORTS.COLS.*` keys synced (EN + AR) for Wave 1B contracts
- [x] Variance band `BAND_BOOK` → snapshot label (AR: لقطة)
- [x] UI uses `SNAPSHOT_QTY` label key for count variance tables
- Excel/PDF export headers remain **English** (enterprise export convention); UI labels are localized.

## PDF presentation (Wave 1A)

- Landscape A4, continuation mini-headers on new pages
- Right-aligned qty/SAR in flat tables
- Financial totals summary block before signatures
- Grouped presenter with subtotal rows in PDF/Excel

## Known limitations (accepted for UAT)

1. **Summary / Valuation shells** — no dual PDF+Excel in filter sidebar (print or Excel-only paths).
2. **Title-mismatch session proxy cards** — presentation stabilized; dataset semantics unchanged until Wave 1C.
3. **Planned governance cards** (workflow-exceptions, etc.) — intentionally dynamic; UI blocked.
4. **Engine SUMMARY/DETAIL/AGING** — legacy column maps for saved reports (not analytics contracts).
5. **Manual staging UAT** — row counts vs production data still required once per golden report.

## Sign-off recommendation

**Reporting phase: READY for broader operational UAT** when:

- All automated smokes above pass in CI/local.
- Staging walkthrough confirms golden table UX (filters + sticky exports) on 3+ reports.
- No P0 export or totals divergence found in staging.

If staging finds export scope mismatch on a specific card, treat as **additional stabilization** (not Wave 1C).
