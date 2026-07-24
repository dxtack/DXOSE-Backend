# Reporting Workspace — Wave 0 Executive Summary

**Generated:** 2026-05-20  
**Regenerate:** `cd OSE-backend && npm run reporting:wave0-inventory`

**Artifacts:**

| File | Purpose |
|------|---------|
| `REPORTING_WAVE0_INVENTORY.md` | Full markdown table (104 cards) |
| `REPORTING_WAVE0_INVENTORY.json` | Machine-readable matrix |
| `REPORTING_WAVE1_SCOPE_RECOMMENDATION.json` | Wave 1 scope seed list |

**Guardrails honored:** No business logic, workflow, or UI changes in Wave 0.

---

## 1. Inventory statistics

| Metric | Count |
|--------|------:|
| **Total workspace cards** | 104 |
| Live analytics | 61 |
| Live engine / engine-alias | 15 |
| Live title-mismatch (session proxy) | 9 |
| Live legacy analytics handler | 7 |
| Live governance audit-log proxy (backend; 4 live in UI) | 4+ |
| **Planned (UI disabled)** | 9 |
| **Pack hubs** | 12 |
| **Engine route aliases** | 12 |
| Explicit / alias column contract | 31 |
| **Dynamic column contract** | 65 |
| NOT_IMPLEMENTED handler | 0 |

### Render path buckets

| Render path | Cards (approx.) |
|-------------|-----------------|
| `analytics-report` (generic table) | 65+ |
| `analytics-report` + dedicated family view | 20+ |
| `report-engine` / summary / valuation | 15 |
| `reporting-pack` (link hub) | 12 |

### PDF export buckets

| PDF path | Cards |
|----------|------:|
| `generateReportPDF` ← `exportAnalyticsPdf` | 92 |
| `generateReportPDF` ← `report.service.exportPdf` (engine) | 12 |
| Pack — no bundle PDF | 12 |

### Separate operational PDFs (not workspace cards)

| Generator | Module |
|-----------|--------|
| `inventory-count-pdf.renderer.js` | Inventory Count Evidence PDF (**CLOSED** — audit shell v2.1) |
| `evidence-pack-pdf.js` | GRN, Transfer, Breakage, Lost |
| `generateStockCountEvidencePDF` | Legacy `/api/stock-count` evidence |
| `generateStockReportVariancePDF` | Legacy saved stock report |
| `get-pass-pdf.renderer.js` | Get Pass Evidence PDF (**CLOSED** — audit shell v2.1) |
| `generateInventoryCountWorkflowPDF` | Delegates to `inventory-count-pdf.renderer.js` (compat) |

---

## 2. Repeated issues summary

### PDF / print identity (HIGH)

1. **Four PDF stacks** — `generateReportPDF` (workspace), evidence packs (enterprise), count final PDF (enterprise), legacy inline (stock count evidence + stock report variance).
2. **Header/footer split** — `drawReportBanner` vs `drawEvidencePackHeader`; inconsistent margins and row heights (10–18px).
3. **Continuation** — Grouped families have mini-headers; flat/dynamic exports often do not.
4. **Signatures on all analytics PDFs** — Heavy for operational list reports (T3 should be lighter).

### Financial readability (HIGH)

1. **65 cards** use **dynamic columns** → PDF loses `format: sar|qty` alignment.
2. **SAR** — `fmtSar` in workspace path vs `toFixed(2)` in legacy PDFs.
3. **Totals panel** — Only when `computeTotals` + contract footer align; many session lists have no financial totals strip.

### Data / card truth (HIGH)

1. **9 cards** share `countSessionRows` regardless of title (blind review, recount, cycle performance, etc.).
2. **12 engine aliases** — Same route, different card title (summary, detail, breakage, valuation, …).
3. **9 governance cards** — UI **planned**; others still **audit-log proxy** when enabled in backend.
4. **variance-by-department** — Groups on `category` field, not department (labeling risk).

### UX / workspace (MEDIUM)

1. **104 live/planned cards** — High discovery cost; hints mostly generic.
2. **Packs** — Curated links only; not an audit deliverable ZIP/PDF.
3. **Reviewer vs ops overlap** — Queues/attention duplicated across domains.

### Executive readability (MEDIUM)

1. **Strong:** Count variance family (bands, grouping, dedicated view, contract).
2. **Weak:** Session/status lists, generic analytics, engine screens without workspace KPI strip.

---

## 3. Recommended Wave 1 scope (await approval before Agent)

**Do not start Wave 1 until this inventory is reviewed.**

### Wave 1A — PDF framework (no data changes) — **HIGH**

- Introduce `report-document.facade.js` (or equivalent) and route **all** `generateReportPDF` calls through enterprise header/footer/tokens.
- Delegate **legacy** `generateStockCountEvidencePDF` + `generateStockReportVariancePDF` to T1/T2 templates (read-only output parity check).
- Standardize: margins 36/24/36, row height 10–11, `fmtSar`/`fmtQty` only.

**Acceptance:** `uat-wave-c-pdf.js` extended + 5 golden PDFs unchanged row counts.

### Wave 1B — Column contracts (presentation only) — **HIGH**

Priority contract families for **65 dynamic** live cards:

1. **count-session** (all `countSessionRows` cards) — sessionNo, countDate, status, location, department, blind, postedAt  
2. **stock-health** — negative, slow, dead, critical, zero-movement  
3. **consumption** — high-consumption, stock-movement (align with ledger contract)  
4. **get-pass** — activity, open, overdue, returned-vs-outstanding  
5. **reviewer-queue** — status-filtered session lists  
6. Fix **variance-by-department** group key + band label “Snapshot” not “Book”

**Acceptance:** Every **live** analytics card has `getReportColumns(cardId) !== null`.

### Wave 1C — Card honesty (labels / badges only) — **MEDIUM**

- Mark engine-alias cards in UI hint (“Same as Summary report”).
- Rename or badge **title-mismatch** cards (“Session list — filter: …”).
- Keep **planned** governance cards disabled until Wave D handlers.

### Out of scope for Wave 1

- New reports, new handlers, workflow changes, pack ZIP export, FE redesign.

### Hotel-critical golden set (manual UAT after Wave 1)

`current-stock-balance`, `count-variance-report`, `summary-report`, `valuation-report`, `omc-report`, `inventory-change-history`, `period-close-validation`, `breakage-loss-report`, `transfer-history`, `audit-activity-report`.

---

## Approval checklist

- [ ] Inventory reviewed (`REPORTING_WAVE0_INVENTORY.md`)
- [ ] Wave 1A PDF scope approved
- [ ] Wave 1B contract priority approved
- [ ] Wave 1C labeling scope approved (optional same sprint)
