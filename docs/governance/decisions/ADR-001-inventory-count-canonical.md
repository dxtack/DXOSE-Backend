# ADR-001: Canonical Inventory Count HTTP surface and operational truth

| Field | Value |
|--------|--------|
| **Status** | Accepted |
| **Date** | 2026-05-14 |
| **Scope** | DX OSE — Inventory Count stabilization phase |
| **Supersedes** | Informal dual-surface practice documented as EX-001 in `EXCEPTION_REGISTER.md` |

## Context

DX OSE persists physical inventory count work on a single relational model centered on `StockCountSession` (Prisma: `stock_count_sessions`), with related `StockCountLine`, `StockCountSessionLocation`, and `StockCountLocationQty` tables. Historically, an HTTP surface was exposed at **`/api/stock-count`** (M10). A newer enterprise workflow was added at **`/api/inventory-count`**, sharing the same session persistence.

Both surfaces can create, progress, and post count sessions. Posting is implemented in two different code paths in `posting.service.js` (`postStockCount` vs `postInventoryCountSession`), with different variance sources, ledger `referenceType` values, approval depth, and route-level authorization patterns. **Period lock date for posting** is now aligned: both paths use **`session.countDate` (fallback `createdAt`)** for `checkPeriodLock` (stabilization change; see `WORKFLOW_MATRIX.md` §8).

The product and governance direction for the **Inventory Count Stabilization & Truth Unification Phase** is **controlled stabilization**: one declared operational truth for workflow, posting, reporting narrative, and audit, without feature expansion or architectural rewrites in this phase.

## Problem

1. **Dual operational truth** — Two APIs can drive the same `StockCountSession` lifecycle with incompatible posting engines and compliance signals (approval steps; variance carrier and ledger `referenceType` still differ). Period **guard date at post** is aligned between engines.
2. **Ledger ambiguity** — `COUNT_ADJUSTMENT` rows can carry `referenceType` **`STOCK_COUNT`** (legacy path) or **`COUNT_SESSION`** (canonical path) for the same conceptual business event (inventory count posting).
3. **Reviewer and audit risk** — Evidence packs, variance screens, and summary reports must be interpreted knowing *which* surface produced adjustments; this violates the platform goal of reviewer-grade, audit-grade traceability.
4. **Integration drift** — External callers or scripts may continue to target `/api/stock-count` while the UI and narrative emphasize `/api/inventory-count`.

## Decision

1. **Canonical HTTP workflow** for inventory count operations is **`/api/inventory-count`** (routes: `OSE-backend/src/routes/inventoryCount.routes.js`).
2. **`/api/stock-count`** is classified as **legacy / compatibility-only / sunset candidate**. It remains mounted during stabilization (`OSE-backend/src/routes/index.js`) but is **not** an equal partner for product truth.
3. **Stabilization scope** for this phase is **documentation, dependency mapping, and execution plans** only — no removal of legacy routes, no report merges, no schema changes, no posting-engine rewrite, and no forced frontend UX changes until later governed stages (see `LEGACY_STOCK_COUNT_SUNSET_PLAN.md`).

## Consequences and risks

| Risk | Mitigation (phase-appropriate) |
|------|-------------------------------|
| Continued production use of legacy API | Dependency map + sunset plan; later: telemetry, gateway policy, and staged deprecation. |
| Historical ledger rows with `STOCK_COUNT` vs `COUNT_SESSION` | Ledger reference strategy in `COUNT_TRUTH_UNIFICATION_PLAN.md`; reporting filters must treat both until normalization is executed in a later phase. |
| Period-lock mismatch between paths | **Mitigated (posting):** both `postStockCount` and `postInventoryCountSession` use **`countDate` / `createdAt`** for `checkPeriodLock`. Residual: other workflows may still use different date bases — see `periodGuard.service.js` per document type. |
| Approval and RBAC asymmetry | `inventory-count` uses `authorize` on approve; legacy `approve` relies on service-level RBAC — tracked for harmonization post-stabilization. |

## Migration strategy (high level)

1. **Inventory** — All in-repo consumers of `/api/stock-count` listed in `STOCK_COUNT_DEPENDENCY_MAP.md` (re-scan before each release).
2. **Operational** — New integrations and internal automation must target **`/api/inventory-count`** only; legacy use is exception-tracked.
3. **Data** — No bulk migration in this phase; sessions created via either API remain valid rows; truth unification addresses *behavior and narrative*, not forced row rewrites, until a governed cutover phase.

## Deprecation strategy (high level)

Staged approach: **isolate → instrument → restrict → remove** when removal conditions are met (`LEGACY_STOCK_COUNT_SUNSET_PLAN.md`). This ADR does not schedule removal dates; it establishes the decision record so later phases can execute without re-debating the default surface.

## Reporting implications

- **Summary inventory** and period narratives that bucket **`COUNT_ADJUSTMENT`** remain correct at movement-type level; they do not distinguish `referenceType` today in a user-visible way in all surfaces. Reviewers reconciling “count UI” vs “summary variance” must follow `REPORT_TRUTH_CATALOG.md` (operational session variance ≠ summary formula without explicit mapping).
- Any future report that filters count-origin adjustments should treat **`STOCK_COUNT`** and **`COUNT_SESSION`** as the same business family until a normalization migration completes.

## Ledger implications

- **Movement type** — Both paths post **`COUNT_ADJUSTMENT`**; stock balances and valuation mechanics align at movement level.
- **Reference discrimination** — Legacy posts tie to **`referenceType: 'STOCK_COUNT'`** and session `locationId` + `StockCountLine` variances; canonical posts use **`referenceType: 'COUNT_SESSION'`** and per-cell `StockCountLocationQty` variances (`posting.service.js`).
- **Audit trail entity type** — Services may still log with `EntityType.STOCK_COUNT` for count-related events; alignment with HTTP naming is a follow-on hygiene item, not mixed into this ADR’s execution.

## Related documents

- `docs/governance/STOCK_COUNT_DEPENDENCY_MAP.md`
- `docs/governance/COUNT_TRUTH_UNIFICATION_PLAN.md`
- `docs/governance/LEGACY_STOCK_COUNT_SUNSET_PLAN.md`
- `docs/governance/EXCEPTION_REGISTER.md` (EX-001)
- `docs/governance/FOUNDATION_GAP_ANALYSIS.md`
- `docs/governance/WORKFLOW_MATRIX.md` §§8–9
- `docs/governance/REPORT_TRUTH_CATALOG.md`
