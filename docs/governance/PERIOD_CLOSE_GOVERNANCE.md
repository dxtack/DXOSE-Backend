# Period Close & Reopen Governance

| Field | Value |
|--------|--------|
| **Constitution** | Chapter 6 — Period Management (D1–D12, approved 2026-07-05) |
| **API** | `/api/period-close` |
| **Guard** | Central Period Guard (`periodGuard.service.js`) |
| **Checklist API** | `GET /api/integrity/month-end-checklist` |

> **Governance alignment note:** This document describes constitutional intent. Product runtime may lag until the dedicated implementation wave. See traceability register for `CONSTITUTIONALLY APPROVED — IMPLEMENTATION PENDING — NOT YET VERIFIED` status.

## Period Registry

Each tenant maintains an explicit **Period Registry** record per calendar month (`month` 1–12). **Implicit open periods are prohibited.** `month = null` (Annual Close) is **prohibited**.

Official states: **OPEN**, **CLOSING**, **CLOSED**. **Archived** is not a registry state — use **SUPERSEDED** on snapshot/report versions.

## Close lifecycle

1. **OPEN → CLOSING** — initiates Close Validation and Close Resolution Workspace (blockers may exist).
2. **CLOSING → CLOSED** — permitted only when **Blockers = 0**; creates new **CURRENT** Snapshot Version from ledger through period end.
3. **Posting block** — Posting Dates in CLOSED periods are prohibited (UI + backend).

### Blocker rule (mandatory)

Close and Re-close require **Blockers = 0**. Environment flags or admin overrides to bypass blockers are **prohibited** (no `MONTH_END_CLOSE_REQUIRE_CLEAN_CHECKLIST` bypass).

| Code (examples) | Severity | Meaning |
|-----------------|----------|---------|
| `OPEN_INVENTORY_COUNT` | BLOCKER | Count session not terminal |
| `PENDING_APPROVALS` | BLOCKER | Approval requests still pending |
| `UNPOSTED_GRN` / movements / transfers | BLOCKER | Pre-posted workflow items |
| `OPEN_GET_PASS` | Conditional | BLOCKER only per §6.13 smart rules — not blanket warning |
| `ZERO_WAC_ON_HAND` | BLOCKER | When WAC integrity affects close |

### December year-end

December uses label **December - Year End Closing** (presentational only). CURRENT December snapshot = year close + January opening basis. No separate annual close.

## Close Resolution Workspace

While **CLOSING**, users with ACC permissions may **Post** or **Delete** pending documents (no prior ledger effect). Authority via ACC codes — **not** role hardcoding.

## Reopen lifecycle

- **Rule:** Latest closed period only; **reverse sequential order**; mandatory **reason** (audit).
- **Effect:** `CLOSED → OPEN`; snapshot versions **preserved** (not deleted).
- **ACC:** `PERIOD_REOPEN_EXECUTE`

## Re-close

After reopen corrections: `OPEN → CLOSING → CLOSED` with **Blockers = 0** at completion. Creates new Snapshot Version; prior version → **SUPERSEDED**. Snapshot from **ledger through period end** via `postingDate` / `assignedPostingPeriod` — not live stock balances.

## Posting Date & Ledger

- Unified Posting Date on all inventory/ledger modules.
- Ledger entries require `postingDate` + `assignedPostingPeriod`; **`createdAt` is not period logic**.
- Default posting date = today; selection only within **OPEN** periods.

## Auto Close (optional)

Same validation/close engine as manual close. On blockers: no auto close, no auto post/delete; in-app + email notification. All attempts audited.

## ACC Permissions (SSOT)

| Code | Purpose |
|------|---------|
| `PERIOD_CLOSE_EXECUTE` | Initiate/execute close |
| `PERIOD_REOPEN_EXECUTE` | Reopen latest closed |
| `PERIOD_RECLOSE_EXECUTE` | Re-close after reopen |
| `PERIOD_CLOSE_RESOLUTION` | Resolution workspace |
| `PERIOD_CLOSE_DOCUMENT_POST` | Post from workspace |
| `PERIOD_CLOSE_DOCUMENT_DELETE` | Delete from workspace |
| `PERIOD_CLOSE_GET_PASS_RESOLVE` | Resolve Get Pass |
| `PERIOD_CLOSE_GET_PASS_CARRY_FORWARD` | Carry forward Get Pass |
| `PERIOD_AUTO_CLOSE_MANAGE` | Auto close settings |

Legacy `PERIOD_CLOSE_MANAGE` to be decomposed at implementation.

## Report versioning

Official reports retain `snapshotVersionId`. After re-close: **CURRENT** / **SUPERSEDED** labels; no silent replacement.

## Historical evidence

Prior BATCH-CH6-11 verification is **SUPERSEDED BY CHAPTER 6 D1–D12 AMENDMENT** — historical reference only.
