# Files Changed — Canonical Screen Timeline (Screen Only)

## Backend

- `src/platform/timeline/timelineEntry.types.js` — Send Back metadata fields on entry contract
- `src/platform/timeline/approvalTimeline.builder.js` — Creator pending entry; default `autoPosted`; exports
- `src/platform/timeline/grnTimeline.builder.js` — Constitutional active PENDING path; AUTO_POSTED_ACTOR
- `src/platform/timeline/getPassTimeline.builder.js` — ApprovalRequest adapter; constitutional audit helpers
- `src/platform/documentTimeline.service.js` — `autoPosted: true`; Get Pass `approvalRequest` include
- `src/platform/timeline/grnTimeline.builder.test.js` — GRN proofs
- `src/platform/timeline/approvalTimeline.builder.test.js` — Creator + Posted proofs
- `src/platform/timeline/getPassTimeline.builder.test.js` — Get Pass adapter proofs

## Frontend

- `src/app/shared/models/timeline-entry.model.ts` — Send Back metadata fields
- `src/app/shared/models/timeline-entry.types.ts` — `VOID` lifecycle type
- `src/app/shared/utils/timeline-entry-i18n.util.ts` — role labels; Send Back meta lines; COUNT_SUBMITTED badge
- `src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.ts` — meta line helper
- `src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.html` — From/To/Round display
- `src/app/shared/utils/timeline-entry-render.util.spec.ts` — i18n Send Back tests
- `public/i18n/en.json` — FROM, TO, CREATOR, ROUND, CREATOR_PENDING_CORRECTION
- `public/i18n/ar.json` — same keys + unified Workflow Timeline title

## Evidence (this folder)

- `BASELINE.md`, `FINAL_MATRIX.md`, `SAMPLE_TIMELINE_ENTRIES.json`
- `GRN_SEND_BACK_PROOF.json`, `CREATOR_CURRENT_STEP_PROOF.json`, `POSTED_ACTOR_PROOF.json`
- `GET_PASS_ADAPTER_PROOF.json`, `TERMINAL_PROJECTION_PROOF.json`
- `TEST_TOTALS.md`, `FILES_CHANGED.md`

## Explicitly NOT changed

PDF, reports, Excel, pipeline, dashboard, Send Back behavior, ApprovalRequest lifecycle, Prisma schema/migrations, DB data, detail screen layout.
