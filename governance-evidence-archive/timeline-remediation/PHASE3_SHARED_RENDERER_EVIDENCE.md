# Phase 3 — Shared Timeline Renderer Evidence

**Date:** 2026-06-26  
**Status:** **PASS** — stopped before Phase 4  
**Scope:** `ReturnsWorkflowTimelineComponent` unified `timelineEntries[]` render path only

---

## Executive Summary

| Area | Result |
|------|--------|
| New `timelineEntries` + `useTimelineEntries` inputs | **DONE** |
| Unified render path (globalOrder, entryType, i18n titles) | **DONE** |
| Legacy paths unchanged | **VERIFIED** (computed + regression tests) |
| Unit / component tests | **20/20 PASS** |
| Frontend build | **PASS** |
| Feature screen migration (GRN Detail, etc.) | **NOT STARTED** (Phase 4+) |

---

## 1. Files changed

```
OSE-Frontend/src/app/shared/components/returns-workflow-timeline/
  returns-workflow-timeline.component.ts    — new inputs + unified computed/helpers
  returns-workflow-timeline.component.html  — unified @else if branch
  returns-workflow-timeline.component.scss  — lifecycle/system/cycle badge styles
  returns-workflow-timeline.component.spec.ts — new renderer + legacy regression tests

OSE-Frontend/src/app/shared/utils/
  timeline-entry-render.util.ts             — sort, dedup by sourceRef, visual variant
  timeline-entry-render.util.spec.ts        — renderer utility tests
  timeline-entry-i18n.util.ts               — timelineEntryDisplayTitle (lifecycle i18n)

OSE-Frontend/public/i18n/
  en.json — TIMELINE.CYCLE, ACTED_BY, REASON, NOTE, IMPACT
  ar.json — parity keys

Governance/timeline-remediation/
  PHASE3_SHARED_RENDERER_EVIDENCE.md        — this document
  FINAL_PHASE2_GATE_EVIDENCE.md             — backfill wording correction (§12)
```

**Not changed (Phase 3 restriction):** GRN/Transfer/Breakage/Lost/Get Pass/Inventory Count detail templates, Backend builders, API payload, Prisma, Register closure.

---

## 2. New render-path behavior

### Inputs

| Input | Type | Default | Purpose |
|-------|------|---------|---------|
| `timelineEntries` | `TimelineEntry[] \| null` | `null` | Unified chronological entries from API |
| `useTimelineEntries` | `boolean` | `false` | Consumer opt-in to new path |

### Selection rule

```
useTimelineEntries === true && timelineEntries !== null
  → unified path ONLY (no presentationSlots / auditEvents / documentContext rendering)

otherwise
  → existing legacy branches unchanged
```

When unified mode is active with `timelineEntries=[]`, component shows `emptyMessageKey` (empty state).

### Rendering

- Single list sorted by `globalOrder` (defensive FE sort; backend remains SSOT)
- Dedup by `sourceRef` + event identity — **not** by `stageKey` alone
- Titles via `displayTitleKey` → i18n (`timelineEntryDisplayTitle`)
- Lifecycle events use `TIMELINE.LIFECYCLE.*` — never raw audit keys (`SEND_BACK`, `GRN_RESUBMIT`, etc.)
- Status badges via `TIMELINE.STATUS.*`
- Optional meta: actor, datetime (timezone display), reason, note, impact, step duration
- Cycle badge (`TIMELINE.CYCLE`) shown when timeline spans multiple cycles
- Visual distinction: lifecycle (orange), system (gray), posting (green), current (blue), completed (green)

### Consumer wiring (Phase 4+)

No feature screen binds `[useTimelineEntries]="true"` yet. Phase 4 will wire GRN Detail first.

**Example (future Phase 4):**

```html
<app-returns-workflow-timeline
  [useTimelineEntries]="true"
  [timelineEntries]="timelinePayload.timelineEntries ?? []"
/>
```

---

## 3. Legacy fallback behavior

All legacy inputs preserved with original names and behavior:

| Input | Unified mode | Legacy mode |
|-------|--------------|-------------|
| `presentationSlots` | Ignored for display | Unchanged |
| `auditEvents` | Ignored for display | Unchanged (appended in presentation mode) |
| `documentContext` | Ignored for display | Unchanged (legacy + highlight) |
| `approvedOnly` | Ignored for display | Unchanged (Approve Modal) |
| `emptyMessageKey` | Used when unified list empty | Used when legacy list empty |

**Approve Modal** continues using `[documentContext]` + `[approvedOnly]="true"` — no template changes in Phase 3.

---

## 4. i18n keys added (Phase 3)

| Key | EN | AR |
|-----|----|----|
| `TIMELINE.CYCLE` | Cycle {{n}} | الدورة {{n}} |
| `TIMELINE.ACTED_BY` | Acted by | بواسطة |
| `TIMELINE.REASON` | Reason | السبب |
| `TIMELINE.NOTE` | Note | ملاحظة |
| `TIMELINE.IMPACT` | Impact | الأثر |

Existing `TIMELINE.STATUS.*`, `TIMELINE.LIFECYCLE.*`, `TIMELINE.STAGE.*` used for titles and statuses.

---

## 5. Test results

### New renderer tests (`timeline-entry-render.util.spec.ts` + component unified describe)

| # | Assertion | Result |
|---|-----------|--------|
| 1 | Entries render in `globalOrder` | PASS |
| 2 | Lifecycle event between cycles at correct order | PASS |
| 3 | Completed step uses past-tense title key | PASS |
| 4 | Current step uses action-noun title key | PASS |
| 5 | Lifecycle title via i18n (no raw key) | PASS |
| 6 | Repeated `stageKey` across cycles not deduped | PASS |
| 7 | Dedup by `sourceRef` only | PASS |
| 8 | Unified mode ignores legacy slots/audit (no duplicate) | PASS |
| 9 | Multi-cycle cycle labels shown | PASS |

### Legacy regression tests (`returns-workflow-timeline.component.spec.ts`)

| # | Assertion | Result |
|---|-----------|--------|
| 1 | `presentationSlots` path computed unchanged | PASS |
| 2 | `auditEvents` path computed unchanged | PASS |
| 3 | `documentContext + approvedOnly` (Approve Modal) unchanged | PASS |
| 4 | Works when `timelineEntries` absent | PASS |
| 5 | Works when `timelineEntries=[]` + legacy slots | PASS |
| 6 | Unified empty array → `hasRows` false | PASS |

```
timeline-entry-render.util.spec.ts           10/10 PASS
returns-workflow-timeline.component.spec.ts  10/10 PASS
Total                                        20/20 PASS
```

### Build

```
npm run build → PASS (dist/OSE)
```

---

## 6. Component harness evidence

No Storybook in repo. **Component spec + DOM assertions** serve as harness for unified path:

- Unified branch renders `.rw-timeline__role` with i18n title (not raw keys)
- Cycle labels render as `Cycle 1`, `Cycle 2`
- Legacy audit rows (`.rw-timeline__item--audit`) absent when unified mode active alongside legacy inputs

Representative fixture (4-cycle with Send Back):

```typescript
[
  { globalOrder: 1, entryType: 'MILESTONE_COMPLETED', displayTitleKey: 'TIMELINE.STAGE.RECEIVED_VALIDATED_COMPLETED', ... },
  { globalOrder: 2, entryType: 'APPROVAL_STEP_COMPLETED', displayTitleKey: 'TIMELINE.STAGE.COST_CONTROL_COMPLETED', cycleNumber: 1, ... },
  { globalOrder: 3, entryType: 'LIFECYCLE_EVENT', lifecycleEventType: 'SEND_BACK', displayTitleKey: 'TIMELINE.LIFECYCLE.SEND_BACK', ... },
  { globalOrder: 4, entryType: 'APPROVAL_STEP_CURRENT', displayTitleKey: 'TIMELINE.STAGE.COST_CONTROL_APPROVAL', cycleNumber: 2, status: 'IN_PROGRESS', ... },
]
```

Rendered order verified in spec: milestone → lifecycle → current step (cycle 2).

---

## 7. Risks before Phase 4

| Risk | Mitigation |
|------|------------|
| No live screen uses unified path yet | Phase 4 GRN Detail migration will be first consumer; manual UAT required |
| TranslatePipe in legacy template tests | Legacy regression uses computed-only assertions; unified path has DOM tests |
| `useTimelineEntries` must be explicitly set | Prevents accidental dual-path display; document in Phase 4 wiring |
| Backend `timelineEntries` populated only for GRN today | Other modules show empty unified list until their builders ship (Phase 5+) |

---

## 12. Backfill documentation correction (from Phase 2)

Clarification for governance readers:

| Metric | Value | Meaning |
|--------|------:|---------|
| **Total GRN_IMPORT ApprovalRequests with `grnImportId` set in DB** | **74** | Cumulative linked rows (includes migration forward SQL + historical data + backfill) |
| **Rows modified by initial Backfill `--apply`** | **1** | Single orphan linked on first gate apply |
| **Rows found by post-apply dry-run** | **0** | Idempotency confirmed |
| **Rows modified by Phase 3 re-run `--apply`** | **0** | No pending orphans |

**Do not interpret** “74 linked” as “last backfill run modified 74 rows.”

---

## Stop line

**Phase 4 (GRN Detail Migration) not started.**  
Awaiting approval of Phase 3 report before wiring `[useTimelineEntries]="true"` on any detail screen.
