# STOCK_COUNT_DEPENDENCY_MAP

**Purpose:** Inventory of dependencies on the legacy HTTP surface **`/api/stock-count`** (mounted in Express as `/stock-count` under the `/api` prefix).  
**Canonical replacement:** **`/api/inventory-count`**.  
**Last scanned:** 2026-05-14 (repository full-text search under workspace `DX OS&E`).

**Rule:** Re-run the search commands in § [Verification](#verification) before each stabilization milestone or release candidate.

---

## 1. HTTP route registration

| Component | Path / behavior |
|-----------|------------------|
| `OSE-backend/src/routes/index.js` | `router.use('/stock-count', stockCountRoutes)` — **legacy mount** (alongside `/inventory-count`). |

---

## 2. Route definition (all legacy REST verbs)

**File:** `OSE-backend/src/routes/stockCount.routes.js`

| Method | Path (relative to `/api/stock-count`) | Middleware notes |
|--------|----------------------------------------|-------------------|
| `POST` | `/` | `authenticate`, `requirePermission('MANAGE_INVENTORY')` |
| `GET` | `/` | `authenticate`, `requirePermission('VIEW_INVENTORY')` |
| `GET` | `/:id` | same |
| `PUT` | `/:id/lines` | `MANAGE_INVENTORY` |
| `POST` | `/:id/submit` | `MANAGE_INVENTORY` |
| `POST` | `/:id/approve` | **`authenticate` only** — comment: “RBAC handled in service” |
| `POST` | `/:id/void` | `MANAGE_INVENTORY` |
| `GET` | `/:id/evidence` | authenticated (no `requirePermission` on route) |
| `GET` | `/:id/evidence/pdf` | same |
| `GET` | `/:id/evidence/excel` | same |

---

## 3. Controllers and services (direct legacy workflow)

| Layer | File | Role |
|-------|------|------|
| Controller | `OSE-backend/src/controllers/stockCount.controller.js` | CRUD, workflow, evidence PDF (via `pdfService.generateStockCountEvidencePDF`), Excel export |
| Service | `OSE-backend/src/services/stockCount.service.js` | Business logic; on final approval invokes `postingService.postStockCount` |
| Posting | `OSE-backend/src/services/posting.service.js` | `postStockCount` — reads **`StockCountLine`**, uses **`session.locationId`**, `checkPeriodLock(tenantId, session.countDate \|\| session.createdAt)`, writes ledger `referenceType: 'STOCK_COUNT'` |

---

## 4. PDF / exports (legacy-specific generators)

| File | Symbol / usage |
|------|----------------|
| `OSE-backend/src/services/pdf.service.js` | `generateStockCountEvidencePDF` — exported and used by legacy stock count evidence |

*Canonical inventory count* uses `generateInventoryCountWorkflowPDF` from the same service for PDF flows on the inventory-count controller path.

---

## 5. Reports and analytics

| Area | Dependency on `/api/stock-count`? | Notes |
|------|-------------------------------------|--------|
| `OSE-backend/src/services/report.service.js` | **No direct HTTP** | Aggregates ledger; treats `COUNT_ADJUSTMENT` generically |
| `OSE-backend/src/services/summaryReport.service.js` | **No** | Variance from `COUNT_ADJUSTMENT` in period |
| `OSE-backend/src/services/stockReport.controller.js` / reports UI | **No** | Redirect narrative points users to inventory-count (`redirectTo: '/inventory-count'`) — product path, not legacy API |

**Governance cross-reference:** `REPORT_TRUTH_CATALOG.md` notes exports on both inventory-count and stock-count routes for session variance truth — reports at summary level must not be confused with session screens.

---

## 6. Dashboards

| File | Usage |
|------|--------|
| `OSE-backend/src/services/dashboard.service.js` | `prisma.stockCountSession.count({ status in ['DRAFT','PENDING_APPROVAL'] })` — **model-level**, not HTTP; counts pending sessions regardless of which API created them |

**Frontend:** `OSE-Frontend/.../dashboard.component.ts` deep-links to **`/inventory-count`** (canonical UI). No `stock-count` API client strings found in frontend.

---

## 7. Scripts and smoke / integration tests

| Artifact | Dependency |
|----------|------------|
| `OSE-backend/test-stockcount-evidence.js` | **Full legacy path** — `POST/PUT /stock-count`, submit, multi-step approve, evidence JSON + PDF download |
| `OSE-backend/scripts/smoke-inventory-count-phase1.js` | **Canonical** — calls `postInventoryCountSession` directly (service), asserts `referenceType: 'COUNT_SESSION'` |

**Package scripts:** Root and `OSE-backend/package.json` contain **no** npm script names referencing `stock-count` (manual invocation of `test-stockcount-evidence.js` assumed).

---

## 8. Ledger readers, dumps, and RBAC

| File | Relationship |
|------|----------------|
| `OSE-backend/scripts/dump-ledgers.js` | Filters `movementType: 'COUNT_ADJUSTMENT'` — will include **both** `STOCK_COUNT` and `COUNT_SESSION` reference types |
| `OSE-backend/src/middleware/authorize.js` | Permissions `STOCK_COUNT_MANAGE`, `STOCK_COUNT_VIEW`, aliases `MANAGE_COUNT` / `VIEW_COUNT` — **naming legacy**; used by canonical UI routes as well |
| `OSE-backend/scripts/verify-general-manager-rbac.js` | Includes `STOCK_COUNT_VIEW` in role verification list |

---

## 9. Audit and admin UI (semantic, not HTTP)

| File | Relationship |
|------|----------------|
| `OSE-backend/src/services/auditTrail.service.js` | `STOCK_COUNT` entity type code for audit entries |
| `OSE-Frontend/.../inventory-history-page.component.ts` | Filter constant `STOCK_COUNT` for audit entity codes |
| `OSE-Frontend/.../audit-log-page.component.ts` | Same pattern |

These are **domain/audit labels**, not calls to `/api/stock-count`, but they affect **audit narrative** when unifying naming.

---

## 10. Documentation and UAT (knowledge dependencies)

| Path | Mention |
|------|---------|
| `docs/governance/EXCEPTION_REGISTER.md` | EX-001 dual API |
| `docs/governance/FOUNDATION_GAP_ANALYSIS.md` | Detailed behavioral comparison |
| `docs/governance/WORKFLOW_MATRIX.md` | §9 legacy surface |
| `docs/governance/REPORT_TRUTH_CATALOG.md` | Session variance + exports |
| `docs/guided-uat/SESSION-03-PERIOD-CLOSE-STOCK-REPORTS-AUDIT.md` | `postStockCount` in period-lock narrative |
| `docs/full-system-review/SCREEN-REGISTRY.md` | Points to `stockCount.routes.js` for future registry work |

---

## 11. Prisma schema and migrations (persistence, not HTTP)

| Path | Notes |
|------|--------|
| `OSE-backend/prisma/schema.prisma` | `StockCountSession`, `StockCountLine`, `StockCountLocationQty`, … |
| `OSE-backend/prisma/migrations/...` | Table creation / inventory count v1 migration |

Shared persistence is why legacy HTTP remains **compatibility-critical** until sunset conditions are met.

---

## 12. Runtime configuration (stabilization)

| Environment variable | Effect |
|---------------------|--------|
| `BLOCK_LEGACY_STOCK_COUNT_CREATE` | When `1`, `true`, or `yes`, `POST /api/stock-count` returns **403** with `error.code = LEGACY_STOCK_COUNT_CREATE_DISABLED` and points callers to **`POST /api/inventory-count/sessions`**. Default: unset (legacy create allowed). |
| `LEGACY_STOCK_COUNT_TELEMETRY` | When `1`, `true`, or `yes`, each authenticated request under `/api/stock-count` emits a structured **`legacy_stock_count_api`** log line (tenant, user, role, method, path). Default: unset (no extra logs). |

Implemented in: `stockCount.controller.js` (create guard), `middleware/legacyStockCountTelemetry.js`, `routes/stockCount.routes.js`.

---

## 13. External / unknown

| Category | Status |
|----------|--------|
| Mobile apps, partner ETL, reverse proxies | **Not present in repo** — confirm via API gateway logs and tenant integration questionnaires |

---

## Verification (re-run periodically)

From repository root (or backend root):

```text
rg "/stock-count|stock-count" --glob "*.{js,ts,tsx,json,md,yml,yaml}"
rg "stockCountRoutes|stockCount\\.controller|stockCount\\.service" --glob "*.js"
```

Treat any new match as a **dependency delta** and update this map.
