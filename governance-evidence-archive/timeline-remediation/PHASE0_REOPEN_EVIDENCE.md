# Phase 0 — Timeline Unified Remediation: Register Reopen Evidence

**Audit date:** 2026-06-26  
**Blocker:** `TIMELINE-UNIFIED-REMEDIATION`  
**Scope:** GRN, Transfer, Breakage, Lost Items, Get Pass, Inventory Count detail timelines; Movement and Approve Modal — regression only.

---

## Evidence-based reopen rule

Requirements reopened **only** where direct code/runtime evidence proves violation.  
**Movement** is **not** reopened on any Requirement — audit-only timeline; no proven single-timeline violation.

---

## Requirements reopened

| Requirement | Affected modules | Direct evidence |
|-------------|------------------|-----------------|
| **C22-22.3-001** | GRN, Transfer, Breakage, Lost Items, Get Pass, Inventory Count | `documentTimeline.service.js` returns `workflowSlots` + `auditEvents` separately; `returns-workflow-timeline.component.html` renders presentation slots then audit rows — not one chronological list |
| **C15-15.5-001** | Same (excl. Movement) | GRN: Send Back audit appears after future pending projection slots; reasons not merged chronologically |
| **C02-2.8-001** | GRN, Get Pass, Inventory Count | `buildGrnWorkflowTimeline()` state projection; Get Pass FE `buildGetPassWorkflowPresentationSlots()`; Inv Count hybrid builder |
| **C02-2.8-002** | GRN, Inventory Count | GRN fixed 3 slots lose prior cycles; Inv Count recount not in timeline |
| **C02-2.8-003** | GRN | `sendBackGrn()` clears `approvedBy`, nulls `approvalRequestId` — prior actors lost in UI |
| **C02-2.8-004** | GRN | Same write path — prior `actedAt` lost in projection |
| **C02-2.8-005** | GRN, Transfer, Breakage, Lost Items, Inventory Count | GRN raw `SEND_BACK` audit label; reject reasons not on presentation slots |
| **C02-2.8-006** | GRN, Transfer, Breakage, Lost Items | `approvalStepsToSlots()` omits `comment` |
| **C02-2.8-007** | GRN, Get Pass | GRN lifecycle as raw audit; Get Pass no constitution timeline / audit integration |
| **C02-2.8-008** | GRN | Duration on projection breaks after Send Back cycle reset |

---

## Movement — regression only (no reopen)

| Item | Status |
|------|--------|
| C22-22.3-001 on Movement | **Not reopened** |
| C15-15.5-001 on Movement | **Not reopened** |
| C02-2.8-* on Movement | **Not reopened** |

Movement detail shows `auditEvents` only via `movement-form.component.ts` — intentional narrow scope. Phase 8 will verify no regression when `timelineEntries[]` is added additively.

---

## Code references (primary)

```
OSE-backend/src/platform/documentTimeline.service.js       — dual payload
OSE-backend/src/services/grn-workflow-presentation.util.js — state projection
OSE-backend/src/services/grn.service.js                    — sendBackGrn state wipe
OSE-Frontend/src/app/shared/components/returns-workflow-timeline/
OSE-Frontend/src/app/features/get-pass/get-pass-detail/get-pass-detail.component.ts
```

---

## Register state change

Applied via `Governance/timeline-remediation/apply-phase0-reopen.mjs`:

- `verificationStatus` → `Needs Audit` (10 requirements)
- `remainingWork` → open remediation text
- `blocker` → `TIMELINE-UNIFIED-REMEDIATION`
- `implemented` → `Partial`
- `preRemediationAudit.passed` → `false` with 2026-06-26 reason
- Failure evidence row appended per requirement

Matrix rebuilt: `node Governance/build-register.mjs`

---

## Next phases

1. **Phase 1** — `timelineEntries[]` contract + shared sort/merge utilities (legacy arrays unchanged)
2. **Phase 2+** — GRN unlimited cycles, per-module migration (per Final Agent Execution Plan)
