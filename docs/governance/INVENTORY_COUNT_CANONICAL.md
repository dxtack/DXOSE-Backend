# Inventory Count — Canonical API (Phase A1)

| Field | Value |
|--------|--------|
| **Status** | Active — System Integrity Hardening |
| **Canonical API** | `/api/inventory-count` |
| **Legacy API** | `/api/stock-count` (read-only when sunset enabled) |

## Canonical lifecycle

| Step | Endpoint | Result status |
|------|----------|----------------|
| Create | `POST /inventory-count/sessions` | `DRAFT` |
| Start | `POST /inventory-count/sessions/:id/start` | `COUNTING` |
| Enter counts | `PUT .../sheets/:locationId/items/:itemId` | `COUNTING` |
| Lock counts | `POST .../submit-counts` | `REVEAL_REVIEW` |
| Recount (variance) | `POST .../recount` | `RECOUNTING` (round++) |
| Reopen after reject | `POST .../recount` (+ reason) | `RECOUNTING` (from `REJECTED`) |
| View variances | `GET .../variances` | `REVEAL_REVIEW`+ |
| Submit approval | `POST .../submit-approval` | `PENDING_APPROVAL` |
| Approve + post | `POST .../approve` | `POSTED` |
| Reject | `POST .../reject` | `REJECTED` |

## Posting (single engine path)

- **Posting function:** `postingEngine.postInventoryCountSession` → `posting.service.postInventoryCountSession`
- **Ledger `referenceType`:** `COUNT_SESSION` only (canonical)
- **Movement type:** `COUNT_ADJUSTMENT`
- **Valuation:** `valuationGovernance.resolveUnitCost` (WAC → last posted GRN → item price → `MISSING_WAC`)
- **Period lock date:** `session.countDate` or `session.createdAt`

## Legacy sunset

When either env is set:

- `BLOCK_LEGACY_STOCK_COUNT_MUTATIONS=1`
- `BLOCK_LEGACY_STOCK_COUNT_CREATE=1`

Then **all non-GET** `/api/stock-count/*` requests return `403 LEGACY_STOCK_COUNT_MUTATIONS_DISABLED`.

GET remains for historical evidence export only.

## Exit condition (A1)

No new count session can be created, updated, submitted, approved, or posted via `/api/stock-count`.

## Presentation timeline (detail + evidence PDF)

Read-only DTO `workflowTimeline` on `GET /inventory-count/sessions/:id` is built by `inventory-count-workflow-presentation.util.js`. Cost Control appears as a **variance review milestone** only — not in `approvalRequest.steps`. GM approval and ledger posting are **separate** audit nodes in the UI and PDF.
