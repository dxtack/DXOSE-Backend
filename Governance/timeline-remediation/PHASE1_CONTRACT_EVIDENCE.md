# Phase 1 — Timeline Contract + Shared Utilities Evidence

**Date:** 2026-06-26  
**Blocker:** `TIMELINE-UNIFIED-REMEDIATION` (unchanged — closure in Phase 9)  
**Status:** Complete — additive contract only; `timelineEntries[]` empty until Phase 2 builders.

---

## Contract added

### Backend (`OSE-backend/src/platform/timeline/`)

| File | Purpose |
|------|---------|
| `timelineEntry.types.js` | `TimelineEntry` JSDoc + enums |
| `timelineEntry.validation.js` | Row + batch validation |
| `timelineEntry.sort.js` | `assignGlobalOrder()` — tier 0 historical → tier 1 current → tier 2 future |
| `timelineEntry.merge.js` | `buildTimelineEntries()`, dedupe inside `timelineEntries` only |
| `timelineEntry.duration.js` | `enrichTimelineEntriesWithDuration()` |
| `timelineEntry.i18n-keys.js` | `resolveDisplayTitleKey()` — keys only, no hardcoded UI text |
| `timelinePayload.util.js` | `attachTimelineEntries()` — spreads legacy payload, adds `timelineEntries` |

### Frontend

| File | Purpose |
|------|---------|
| `shared/models/timeline-entry.types.ts` | Enums mirroring backend |
| `shared/models/timeline-entry.model.ts` | `TimelineEntry` interface |
| `shared/utils/timeline-entry-i18n.util.ts` | Title + status key resolution |
| `core/services/constitution-platform.service.ts` | `DocumentTimelinePayload.timelineEntries?` |

### API (additive)

All `get*Timeline()` in `documentTimeline.service.js` return:

```json
{
  "documentType": "...",
  "documentId": "...",
  "workflowSlots": [ /* unchanged build path */ ],
  "auditEvents": [ /* unchanged fetch path */ ],
  "timelineEntries": []
}
```

Modules wired: GRN, TRANSFER, BREAKAGE, GET_PASS, LOST, INVENTORY_COUNT, MOVEMENT.

---

## globalOrder sorting rules (implemented)

1. **Tier 0** — completed historical rows + closed-cycle lifecycle (by `actedAt` asc, then cycle, within-cycle weight, stepNumber).
2. **Tier 1** — current step(s) of active cycle (`APPROVAL_STEP_CURRENT`, `MILESTONE_CURRENT`).
3. **Tier 2** — future step(s) of active cycle (`APPROVAL_STEP_FUTURE`).
4. Within-cycle weight: completed steps → lifecycle (Send Back/Reject before Resubmit) → current → future.
5. Active cycle = highest cycle with a current step, else max `cycleNumber`.

---

## Legacy compatibility

**Wording:** Legacy arrays structurally and semantically unchanged.

- `workflowSlots[]` and `auditEvents[]` build/fetch logic in `documentTimeline.service.js` not modified.
- `attachTimelineEntries()` shallow-spreads payload; does not mutate legacy arrays.
- Unit test: `attachTimelineEntries: legacy arrays structurally and semantically unchanged`.

---

## Unit tests

**File:** `OSE-backend/src/platform/timeline/timelineEntry.test.js`

**Command:** `node --test OSE-backend/src/platform/timeline/timelineEntry.test.js`

**Coverage:**

| Test | Result |
|------|--------|
| Deterministic sorting | PASS |
| Merge stability (reverse input → same order) | PASS |
| Duplicate suppression (timelineEntries only) | PASS |
| Lifecycle before current/future on active cycle | PASS |
| 4-cycle fixture (3 Send Back + cycle 4 active) | PASS |
| 10-cycle mandatory fixture | PASS |
| Duration enrichment | PASS |
| Legacy arrays unchanged | PASS |
| Validation before sort | PASS |

**Result:** 10/10 pass.

---

## i18n keys

Added `TIMELINE.*` namespace to `OSE-Frontend/public/i18n/en.json` and `ar.json` (STATUS, LIFECYCLE, STAGE, SYSTEM).

---

## Risks before Phase 2

1. **`timelineEntries[]` is empty** — FE still consumes legacy arrays; no user-visible change until Phase 3 renderer migration.
2. **GRN schema + write paths** — Phase 2 must add `ApprovalRequest.grnImportId`, explicit RESUBMIT audit on `submitForApproval`, and history builder; highest risk area.
3. **Dual-array consumers** — Until Phase 3, shared component behavior unchanged; regression risk deferred to Phase 8 for Movement / Approve Modal.
4. **Backfill** — Existing GRN cycles may lack persisted history; Phase 2 backfill script required before verification closure.

---

## Next: Phase 2

GRN unlimited approval cycles — schema, write paths, RESUBMIT from business transition only, history builder, backfill script.
