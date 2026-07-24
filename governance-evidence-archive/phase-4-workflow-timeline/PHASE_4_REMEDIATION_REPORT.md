# Phase 4 Remediation Report — Verification Reopen

**Generated:** 2026-06-28  
**Status:** `phaseClosed: true` (verification reopen)

## Summary

Phase 4 formal closure was rejected because prior gates used skipped/vacuous passes. This reopen replaces opportunistic DB lookups with **deterministic seeded fixtures**, **strict normalized timeline assertions**, and **real browser DOM checks** for Send Back, Resubmit, physical Return, and stamped v3 GM proof.

## Gate corrections

| Prior defect | Remediation |
|---|---|
| `skipped: true` with `pass: true` when fixtures missing | Seed script **must** succeed; gate **FAIL** if any module fixture absent |
| Empty `timelineEntries` accepted | Minimum entry count + exact normalized order vs `PHASE_4_TIMELINE_FIXTURES.json` |
| API response path `data.timelineEntries` | Fixed to `data.data.timelineEntries` |
| Weak Get Pass v3 GM proof | Seed v3-pinned pass with real `gmApprovedAt` + GM actor on disposable tenant |
| Loose browser title OR-check | Require **exact** h2 `Workflow Timeline`; reject WORKFLOW HISTORY eyebrow |
| Loose actor `!ActedBy \|\| By` | Require `hasBy && !hasActedBy` |
| Text-count duplicate events | Count `.rw-timeline__role` labels (title/badge pairs no longer double-count) |

## Product fixes (runtime-proven)

- **Inventory Count `Count submitted / Approved`:** `timeline-entry-i18n.util.ts` maps `COUNT_SUBMITTED` milestone badge to `Completed`.
- **Get Pass physical return / checkout badges:** `RETURN_PROCESSED` → `Returned`, `SECURITY_OUT` → `Checked Out`.
- **Inventory Count card:** Removed `RETURNS_WORKFLOW.WORKFLOW_HISTORY` eyebrow; title key → `Workflow Timeline`.

## Evidence artifacts

| Artifact | Result |
|---|---|
| `PHASE_4_RUNTIME_RESULTS.json` | 36/36 runtime, 5/5 regression, `skippedCount: 0`, `phaseClosed: true` |
| `PHASE_4_BROWSER_RESULTS.json` | 14/14 pass, `skippedCount: 0`, `phaseClosed: true` |
| `PHASE_4_TIMELINE_FIXTURES.json` | GRN, Transfer, Breakage, IC, GP Send Back/Resubmit, GP physical Return, v3 GM |

## Mandatory lifecycle proof

1. **Send Back + Resubmit (Get Pass v4):** API lifecycle counts + browser role-label counts (`Sent Back`×1, `Resubmitted`×1, `Submitted`×1).
2. **Physical Return (TEMPORARY):** `SECURITY_OUT` + `RETURN_PROCESSED` timeline; browser `Checked Out` + `Returned`; no Sent Back/Resubmitted.
3. **Historical v3 GM:** Document pinned to archived v3; `gmApprovedAt` + GM `APPROVAL_STEP_COMPLETED`; Security follows GM.

## Regression

- Timeline builder unit tests (GRN, Get Pass, approval, timelineEntry)
- Frontend production build

Phases 1–3 remain frozen. No ACC workflow definition changes. Phase 5 not started.
