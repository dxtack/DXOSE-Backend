# Reporting Wave 1A — Enterprise PDF Facade

**Scope:** Presentation only (PDF identity, density, SAR formatting, continuation).  
**Out of scope:** Wave 1B column contracts, Wave 1C UI honesty, business logic.

## Implementation

- New module: `OSE-backend/src/services/pdf/report-document.facade.js`
- `generateReportPDF` → facade chrome + `renderFlatAnalyticsTable` / grouped presenter with `workspaceDensity`
- `generateStockCountEvidencePDF` → `renderLegacyStockCountEvidencePdf` (landscape enterprise)
- `generateStockReportVariancePDF` → builds same row/total values, delegates to `generateReportPDF`

## Smoke

```bash
cd OSE-backend
npm run smoke:reporting-wave1a-pdf
node scripts/uat-wave-c-pdf.js
```

Sample PDFs: `OSE-backend/tmp/wave-1a-pdf/`

## Regenerate Wave 0 inventory (unchanged data layer)

```bash
npm run reporting:wave0-inventory
```
