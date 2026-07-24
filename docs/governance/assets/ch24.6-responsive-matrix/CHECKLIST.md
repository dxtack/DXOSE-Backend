# Ch 24.6 Responsive Test Matrix — Governance QA Checklist

**Constitution:** §24.2–§24.6, §29.3 Definition of Done  
**Baseline viewport:** 1366×768  
**Zoom levels:** 80%, 90%, 100%, 110%, 125%  
**Additional spot-checks:** 1440×768, 1600×900, 1920×1080 @100%; 2K/4K DPI; multi-monitor

## Sign-off record (fill per release)

| Field | Value |
|-------|--------|
| Release / build | |
| Tester | |
| Date | |
| Browser matrix ref | `docs/governance/DX_OSE_ARCHITECTURE_IMPLEMENTATION_GUIDE.md` |

## Route matrix

Mark **Pass / Fail / N-A** at each viewport+zoom. Code fixes only where Fail is observed.

| Route family | 1366@100 | Zoom 80–125 | H-scroll | Titles | Action bar | Primary actions | Modals | Table scroll owner |
|--------------|----------|-------------|----------|--------|------------|-----------------|--------|-------------------|
| Dashboard | | | | | | N/A | | |
| GRN list / create / detail | | | | | | | | |
| Transfer list / create / detail | | | | | | | | |
| Get Pass list / create / detail | | | | | | | | |
| Breakage list / create / detail | | | | | | | | |
| Lost Items / Movement | | | | | | | | |
| Inventory Count | | | | | | | | |
| Items / Master Data | | | | | | | | |
| Reports workspace | | | | | | N/A | | |
| ACC / Admin | | | | | | | | |

## Governance-only requirements (no code unless matrix finds defect)

- C24-24.2-001 — Minimum 1366×768 layout support @100%
- C24-24.3-001 — Zoom 80–125% acceptance
- C24-24.4-002 — Title clipping spot-check
- C24-24.4-003 — Action bar overlap spot-check
- C24-24.4-004 — Create-route primary actions visible
- C24-24.5-001 — Browser matrix in release QA checklist
- C24-24.5-002 — 2K/4K spot-check
- C24-24.5-003 — Multi-monitor/DPI spot-check
- C24-24.6-001 / C24-24.6-002 — Full matrix execution and recorded results

## Code remediation triggers (fix only on observed failure)

- C24-24.4-001 — Page-level horizontal scroll → confine to table/grid owner
- C24-24.4-005 — Modal viewport fit → `nzBodyStyle` / `maxHeight` internal scroll
- C24-24.4-006 — Missing `registry-work-card__scroll` on nz-table surfaces
