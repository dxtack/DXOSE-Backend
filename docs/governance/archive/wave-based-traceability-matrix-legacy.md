# Constitution Traceability Matrix (Legacy — Archived)

> **ARCHIVED.** Not part of active governance. Superseded by `OSE-backend/docs/governance/CONSTITUTION_TRACEABILITY_MATRIX.md`.

**Plan:** Master Implementation Plan v2.0 Final  
**Updated:** 2026-06-26  

Each row maps implementation changes to Constitution authority.

| Ch | § | BDR | Requirement | Files / Artifacts | Wave |
|----|---|-----|-------------|-------------------|------|
| 2 | 2.3 | — | User-facing lifecycle states | `platform/lifecyclePresentation.service.js`; `grn.service.js` (`userFacingState`) | W1/W2 |
| 2 | 2.7 | — | No Re-submit; Return → Edit → Submit | Removed `resubmitRejectedGrn`; `sendBackGrn`; FE send-back modal; REJECTED read-only | W1 |
| 2 | 2.8 | — | Unified timeline | `platform/documentTimeline.service.js`; `constitution.routes.js` | W2 |
| 3 | 3.4 | — | Send Back vs Reject | `grn.service.js` `sendBackGrn`; `grn.routes.js`; `grn-detail` FE | W1 |
| 3 | 3.5–3.6 | — | Primary action / button order | GRN detail action bar: Send Back secondary to Approve/Reject | W2 |
| 4 | 4.2 | — | Standard operations (Send Back) | ACC unchanged; route uses `GRN_MANAGE` | W2 |
| 6 | 6.4 | — | Posting date & period on post | `postingGovernedGrn.service.js`; schema `postingDate`, `assignedPostingPeriod` | W2 |
| 6 | 6.6 | BDR-006 | Period resolution workspace | `platform/periodResolution.service.js`; `GET /constitution/period-resolution` | W2 |
| 7 | 7.1–7.3 | — | Server draft / save draft | `platform/draftGovernance.service.js`; `POST/PATCH /constitution/grn/draft` | W1 |
| 7 | 7.4 | — | Unsaved-work guard | `core/guards/document-draft-can-deactivate.guard.ts` | W1 |
| 8 | 8.1 | — | Optimistic concurrency | `platform/concurrency.service.js`; schema columns; FE 409 handler | W1 |
| 9 | 9.1 | — | Unified document numbering | `docNumbering.service.js`; GRN/Breakage/Transfer | W1 |
| 9 | 9.2 | — | Supplier invoice vs system number | `supplierInvoiceNumber`; GRN create FE/API | W1 |
| 11 | 11.1 | — | Display currency | `platform/displayCurrency.service.js`; migration seed; FE pipe/service | W1 |
| 14 | 14.3 | — | Attachment mutability (Draft only) | `platform/attachmentGovernance.service.js`; `breakage.service.js` | W2 |
| 17 | 17.1 | — | Shared lookup primitive | `core/services/shared-lookup.service.ts` | W3 |
| 18 | 18.1 | — | Keyboard navigation | `core/directives/keyboard-navigation.directive.ts` | W3 |
| 19 | 19.2 | — | Error code registry | `platform/errorRegistry.js` | W3 |
| 22 | 22.1 | — | Document timeline API | `documentTimeline.service.js`; constitution controller | W2 |
| 23 | 23.1 | — | Validation orchestrator | `core/services/validation-orchestrator.service.ts` | W3 |
| 2 | 2.2 | BDR-007 | Void vs Cancelled label | **Exception — Under Review**; no new Cancelled label shipped | W4 |
