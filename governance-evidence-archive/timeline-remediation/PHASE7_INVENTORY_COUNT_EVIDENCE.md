# Phase 7 — Inventory Count Timeline Evidence

**Date:** 2026-06-26  
**Status:** **PASS — Runtime evidence complete**  
**Runtime required scenarios: 0 skipped**

---

## Discovery Summary

| Topic | Finding |
|-------|---------|
| Approval chain | Finance → GM (2 steps via `ApprovalRequest`, `COUNT_ADJUSTMENT`) |
| Session statuses | DRAFT → COUNTING → REVEAL_REVIEW → PENDING_APPROVAL → FINANCE_APPROVED → POSTED / REJECTED |
| Recount | `StockCountLocationQty.roundNo` preserves history; **`startRecount` production API added** (REVEAL_REVIEW → RECOUNTING) |
| Resubmit after reject | **Not supported** — reject is terminal |
| Audit entity | `STOCK_COUNT` (fixed — was incorrectly queried as `INVENTORY_COUNT`) |
| Posting | GM final approve → `postInventoryCountSession` → `COUNT_ADJUSTMENT` ledger |

Recount ≠ Send Back. Multiple rounds stored in count cells; approval is single cycle.

---

## Fixture IDs (Grand Horizon)

| Scenario | Session No | Document ID | Status | Entries |
|----------|------------|-------------|--------|---------|
| active_approval | CNT-2606-0059 | `44402db6-fa68-43e3-b074-6129b5ec6174` | PENDING_APPROVAL | 4 |
| posted | CNT-2606-0060 | `2844bbd4-18e7-4772-83a3-bd72c2f0726b` | POSTED | 5 |
| rejected | CNT-2606-0061 | `dd8d6c7a-8ee2-450b-9d76-41e3a05899d9` | REJECTED | 3 |
| recount_round2 | CNT-2606-0062 | `ad46a308-eebf-477c-9624-e5350e0cf01e` | POSTED | 7 |

Report: `Governance/timeline-remediation/backfill-reports/PHASE7_TIMELINE_FIXTURES.json`

---

## Production Bug Fixed

- `reject()` updated `ApprovalRequest.notes` — field does not exist on schema → removed (reason on step comment + session notes).

---

## Posting Reconciliation (Timeline ↔ Ledger ↔ Stock Balance)

Posted + recount_round2 fixtures:

| Check | Result |
|-------|--------|
| Timeline `POSTING` entry | **PASS** |
| Ledger `COUNT_ADJUSTMENT` rows | **PASS** (1 row each) |
| `balanceAfter` = current `qtyOnHand` | **PASS** |
| Latest round `countedQty` = final balance | **PASS** |
| Mismatches | **0** |

Policy B: posting adjustment = `countedQty − liveQtyAtPosting`.

---

## Test Tally

| Suite | Passed | Skipped | Failed |
|-------|--------|---------|--------|
| `inventoryCountTimeline.builder.test.js` | 4 | 0 | 0 |
| `phase7-timeline-db-integration.test.js` | 6 | **0** | 0 |
| Playwright (4 × 2 viewports) | 8 | **0** | 0 |
| Get Pass regression (Phase 6) | 15 | 0 | 0 |
| GRN + Phase 5 + approval builder | 13 | 0 | 0 |
| Shared renderer | 11 | 0 | 0 |
| `npm run build` | ✓ | — | — |

---

## Files Changed

| File | Change |
|------|--------|
| `OSE-backend/src/platform/timeline/inventoryCountTimeline.builder.js` | **NEW** |
| `OSE-backend/src/platform/documentTimeline.service.js` | Wire builder; `STOCK_COUNT` audit |
| `OSE-backend/src/services/inventoryCount.service.js` | `startRecount`; reject fix |
| `OSE-backend/src/routes/inventoryCount.routes.js` | `POST /recount` |
| `OSE-Frontend/.../inventory-count-detail.*` | Unified `timelineEntries` |
| `OSE-backend/scripts/lib/phase7-inventory-count-fixture.helpers.js` | **NEW** |
| `OSE-backend/scripts/seed-phase7-inventory-count-timeline-fixtures.js` | **NEW** |

Screenshots: `Governance/timeline-remediation/runtime-evidence/phase7/`
