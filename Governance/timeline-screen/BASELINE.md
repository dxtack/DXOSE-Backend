# Canonical Screen Timeline — Baseline (pre-workstream)

**Date:** 2026-07-03  
**Scope:** Screen-only workflow timeline (no PDF / behavior changes)

## Test baseline

| Suite | Before | After |
|-------|--------|-------|
| Backend unit (`npm run test:unit`) | 310/310 | 317/317 |
| Frontend unit (`npm run test:unit`) | 71/71 | 72/72 |

## Known gaps (screen path)

| Gap | Modules |
|-----|---------|
| GRN Send Back invisible on active PENDING ApprovalRequest | GRN |
| Posted attributed to human users | GRN, Transfer, Breakage, Lost |
| Send Back source/target/round not rendered | All |
| Creator invisible at `currentStep = 0` | Transfer, Breakage, Lost, Count |
| Get Pass used denormalized approver stamps | Get Pass |
| AR i18n timeline title inconsistent | All |
| `VOID` missing from FE lifecycle enum | Frontend |

## Architecture (unchanged)

```
Detail → ConstitutionPlatformService.getTimeline
       → documentTimeline.service.js
       → *Timeline.builder.js
       → timelineEntries[]
       → app-returns-workflow-timeline [useTimelineEntries]=true
```
