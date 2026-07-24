# Phase 10 — Governance Closure

**Date:** 2026-06-26  
**Remediation batch:** TIMELINE-UNIFIED-REMEDIATION  
**Status:** **CLOSED** (in-scope modules)

---

## 10.1 Requirements Closed (Timeline Batch)

| Requirement | Affected Modules | Closure Reason |
|-------------|------------------|----------------|
| **C22-22.3-001** | GRN, Transfer, Breakage, Lost, Get Pass, IC | Unified `timelineEntries[]` on all migrated detail views; 32 backend + 30 Playwright PASS |
| **C15-15.5-001** | Same + Movement register | Chronological merge in `timelineEntry.merge.js`; GRN multi-cycle + IC recount verified |
| **C02-2.8-001** | GRN, Get Pass, IC | Current state via unified entries; no silent legacy fallback on migrated views |
| **C02-2.8-002** | GRN, IC | Full workflow steps including recount rounds (IC Phase 7) and GRN cycles |
| **C02-2.8-003..008** | In-scope workflow modules | Actor, datetime, reason, comment, system events, duration on unified entries |

**Movement:** Not blanket-closed on C02-2.8 — register uses audit supplement; source modules authoritative (Phase 8 evidence).

**Out of scope (unchanged):** Requisition, Stock Report, Shared Page Layout.

---

## 10.2 Register Rebuild

```bash
node Governance/build-register.mjs
```

See **Final Register Tally** in `FINAL_TIMELINE_VERIFICATION_MATRIX.md`.

---

## 10.3 Legacy Contract

| Consumer | Status |
|----------|--------|
| `workflowSlots` | **Retained** — additive API field; GRN legacy consumers |
| `auditEvents` | **Retained** — Movement register, additive payloads |
| `documentContext + approvedOnly` | **Retained** — Returns Approve Modal (Phase 8 regression PASS) |
| `presentationSlots` | **Retained** — deprecated path in shared renderer |

**Consumer search:** No zero-consumer deletion performed. Deprecated only.

---

## 10.4 Evidence Package Index

| Document | Path |
|----------|------|
| Phase 7 Inventory Count | `PHASE7_INVENTORY_COUNT_EVIDENCE.md` |
| Phase 8 Movement | `PHASE8_MOVEMENT_WORKFLOW_EVIDENCE.md` |
| Phase 9 Regression | `PHASE9_CROSS_MODULE_REGRESSION.md` |
| Final Matrix | `FINAL_TIMELINE_VERIFICATION_MATRIX.md` |
| Fixture reports | `backfill-reports/PHASE5–7_*.json` |
| Runtime screenshots | `runtime-evidence/phase5–7/` |

---

## 10.5 Production Bugs Fixed (Phases 7–8)

1. Inventory Count reject: invalid `ApprovalRequest.notes` field removed.
2. Audit entity `STOCK_COUNT` (was `INVENTORY_COUNT`).
3. Missing `startRecount` API added for round history.
4. Phase 7 posting fixtures: live-qty variance for ledger rows.

---

## 10.6 Known Pre-existing Non-blocking Issues

- Movement list routes governed docs to register view (not source module deep link).
- Angular compiler warnings (NG8107, unused DecimalPipe) — pre-existing.
- Mail provider not configured in dev (warn only).

---

## 10.7 Final Risks

- Re-seed Phase 7 `active_approval` may accumulate duplicates (note-tag reuse).
- Movement unified migration deferred — monitor if constitution audit scope expands to register.
