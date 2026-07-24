# Phase 2 — Enterprise Reporting Experience & Governance

**Status:** IN PROGRESS (Wave A + B1–B4 done)  
**Prerequisite:** Phase 1 CLOSED (integrity, WAC, totals, PDF foundation)

## Vision

Transform reports from **operational-grade** to **audit-defensible Hotel ERP reporting** — purpose-built views, real governance data, unified PDF, executive insight.

## Report Families

| Family | Hierarchy | Shell |
|--------|-----------|-------|
| Count Variance | Session → Location → Item | Analytics |
| Stock Balance | Department → Location → Item | Analytics |
| Ledger | Date → Document → Lines | Analytics |
| Breakage / Loss | Document → Category → Items | Engine |
| OMC | Category → Item (bands) | Engine / Summary |
| Transfers | Transfer → Lines | Engine / Analytics |
| Governance | Module → Document → Events | Analytics (Wave D) |

## Architecture Layers

```
Workspace Cards → report-family-registry → handlers → grouping.engine
                              ↓
                    report-orchestrator (enrich payload)
                              ↓
              { rows, totals, tree, flatRows, family, variant }
                              ↓
         Dedicated Family Views (FE) + generateReportPDF (BE)
```

### Wave A (current)

- [x] `report-family-registry.js`
- [x] `report-grouping.engine.js`
- [x] `report-orchestrator.service.js`
- [x] Analytics API returns `tree`, `flatRows`, `family`
- [x] Governance audit-log proxy cards → `planned` in workspace
- [x] Frontend `report-family.registry.ts`
- [x] `GroupedTableComponent` (foundation)
- [x] `ReportViewerShell` extraction (Wave A.2) — analytics wired

### Wave B — P0 dedicated views

- [x] B1 Count Variance hierarchy UI  
- [x] B2 Stock Balance hierarchy UI  
- [x] B3 Ledger hierarchy UI  
- [x] B4 Transfers (analytics: open-transfers, delays, aging)  
- [x] B5 Breakage / Loss (engine: Document → Category → Items, KPI band, grouped export)  
- [ ] B6 OMC  

### Wave C — PDF enterprise

Unified templates, bilingual, logo, dynamic signatures, grouped PDF sections.

### Wave D — Governance suite

Replace `auditLogRows` proxy with `report-governance.service.js` + rules engine.

### Wave E — Executive layer + packs

KPI bands, material variances, audit packs on real families.

## Reuse from Phase 1

- `report-format.util` (FE/BE)
- `report-analytics-totals`, `report-column-contracts`
- `generateReportPDF`, Count Variance / Stock Balance tables
- `ReportIdentityShell`, workspace registry routing

## Rebuild

- Governance handlers (audit log proxy)
- Generic analytics table for P0 families
- Browser-only print for official exports

## UAT per report (Phase 2)

Screen = Excel = PDF, totals reconciliation, grouping collapse, pagination, no auto-query, performance &lt; 5s target for 2k lines.

## Sign-off criteria

Phase 2 closes when: 6 P0 families have dedicated views, governance MVP (4+ reports), unified PDF for P0, documented UAT per family.

See conversation plan for full stakeholder matrix and risk register.
