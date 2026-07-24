# Wave 5 — Transfer Legacy Cleanup Final Verification

| Field | Value |
|--------|--------|
| **Requirement** | SYS-DEC-07 — Transfer Legacy Cleanup |
| **Decision** | Final Approval = Posting; Dispatch/Receive retired |
| **Generated** | 2026-07-05 |
| **Harness** | `node Governance/wave5/wave5-runtime-verification.js` |
| **Evidence JSON** | `Governance/wave5/WAVE5_TRANSFER_LEGACY_CLEANUP_FINAL_VERIFICATION.json` |
| **Gate** | **PASS** (21 PASS · 0 FAIL · 0 BLOCKED) |

---

## 1. Data Audit Results

Script: `Governance/wave5/wave5-data-audit.js` against test DB (`127.0.0.1:5433`).

| Metric | Result |
|--------|--------|
| Total transfers (all tenants) | 6 |
| By status | 6 × `DRAFT` |
| Legacy status rows (`IN_TRANSIT`, `RECEIVED`, `CLOSED`, `SUBMITTED`, `APPROVED`, `PENDING_FINAL`) | **0** |
| `dispatchedAt` populated | 0 |
| `receivedAt` populated | 0 |
| `postedAt` / `POSTED` status | 0 |

No historical legacy documents require migration. Enum values and schema columns (`dispatchedAt`, `receivedBy`, etc.) are **retained** for read-only compatibility if legacy data appears in other environments.

---

## 2. Active vs Historical vs Dead Statuses

| Class | Statuses |
|-------|----------|
| **Active operational (V2)** | `DRAFT`, `PENDING_DEPT`, `PENDING_FINANCE`, `POSTED`, `REJECTED` |
| **Historical read-only (enum retained)** | `SUBMITTED`, `PENDING_FINAL`, `APPROVED`, `IN_TRANSIT`, `RECEIVED`, `CLOSED` |
| **Dead in current DB** | All historical enum values above (0 rows) — safe to treat as display-only if rows appear elsewhere |

User-facing mapper (Wave 2 SSOT): legacy `IN_TRANSIT` → **In Transit**; `RECEIVED`/`CLOSED` → **Posted**.

---

## 3. Routes Removed

| Route | Action |
|-------|--------|
| `POST /transfers/:id/dispatch` | **Removed** from `transfer.routes.js` |
| `POST /transfers/:id/receive` | **Removed** from `transfer.routes.js` |

No redirect, alias, or 410 stub — endpoints are **unavailable**. Controller handlers and service exports deleted.

---

## 4. Frontend Cleanup

| Item | Status |
|------|--------|
| Dispatch / Receive buttons | Already absent from transfer detail |
| `transfer.service.ts` dispatch/receive methods | None |
| Orphan i18n (`CONFIRM_DISPATCH_*`, `CONFIRM_RECEIVE_*`) | **Removed** from `en.json` |
| List filters for `IN_TRANSIT` | Not present in active tabs |
| Historical read-only | `transfer-workflow.helpers.ts` treats legacy statuses as read-only |

---

## 5. Permission Audit

| Permission | Classification |
|------------|----------------|
| `TRANSFER_VIEW` | **Active** — read/list/detail |
| `TRANSFER_CREATE` | **Active** — create, edit draft, submit |
| `TRANSFER_APPROVE` | **Active** — approval chain + finance post |
| `TRANSFER_DISPATCH_RECEIVE` | **Deprecated** — marked in ACC catalog; **no active routes**; historical role grants may exist — **Safe to remove after tenant role-grant audit** |

Pipeline resolver no longer references `TRANSFER_DISPATCH_RECEIVE`. Legacy transfer statuses in pipeline map to `TRANSFER_VIEW`.

---

## 6. Documentation Updated

| Document | Changes |
|----------|---------|
| `docs/governance/WORKFLOW_MATRIX.md` §1 Store transfer | Finance final approval = posting; dispatch/receive retired; active vs historical states |
| `docs/governance/SEMANTIC_GLOSSARY.md` | Posting/approval/receive/in-transit sections aligned to SYS-DEC-07 |

Constitution final documents **not** modified.

---

## 7. Historical Compatibility

- Legacy enum values remain in Prisma (no migration required for current DB).
- Lifecycle mapper provides user-facing labels (no raw enums in UI).
- `isTransferReadOnly()` covers legacy + terminal states.
- Timestamp fields (`dispatchedAt`, `receivedAt`) remain on model for historical rows; V2 finance post sets `receivedAt`/`receivedBy` as audit metadata only (not a receive workflow step).

---

## 8. Posting / Ledger / Stock Runtime Results

Integration harness (live DB):

| Scenario | Result |
|----------|--------|
| Create → no ledger | PASS |
| Submit → no ledger | PASS |
| Dept approve → no ledger | PASS |
| Finance final approve → `POSTED` + ledger (≥2 entries) | PASS |
| Stock: −5 source / +5 dest (single movement) | PASS |
| Double approve blocked; ledger unchanged | PASS |
| Foreign tenant → 404 | PASS |

**Contract proved:** posting occurs **once**, only at **Finance final approval**.

---

## 9. Tests and Build

| Test | Result |
|------|--------|
| `wave1-route-permissions.test.js` (dispatch/receive absent) | PASS |
| `wave5-runtime-verification.js` (21 scenarios) | PASS |
| Wave 5 data audit | PASS |

---

## 10. Files Touched

**Backend:** `transfer.routes.js`, `transfer.controller.js`, `transfer.service.js`, `workflow-step-permissions.js`, `catalog.constitution.js`, `lifecyclePresentation.service.js`, `wave1-route-permissions.test.js`

**Frontend:** `public/i18n/en.json`

**Docs:** `WORKFLOW_MATRIX.md`, `SEMANTIC_GLOSSARY.md`

**Governance:** `Governance/wave5/wave5-data-audit.js`, `wave5-runtime-verification.js`, evidence JSON/MD

---

## 11. Database Changes

**None.** No enum removal, no data migration, no ledger/stock backfill. Schema columns for legacy logistics retained for historical display.

---

## 12. PASS / FAIL / BLOCKED

| Gate | Count |
|------|-------|
| PASS | 21 |
| FAIL | 0 |
| BLOCKED | 0 |
| **Overall** | **PASS** |

---

## 13. Execution Blockers

**None.** No integrations were found calling `/dispatch` or `/receive`. No Amr decision required to proceed.

---

## Re-run

```bash
node Governance/wave5/wave5-data-audit.js
node Governance/wave5/wave5-runtime-verification.js
```
