# Reversal & Recovery Governance (Phase F1)

| Field | Value |
|--------|--------|
| **Status** | Active policy — implementation incremental |
| **Principle** | Never silently delete operational/accounting history |

## Global rules

1. **No hard deletes** of posted inventory or ledger rows in normal operations.
2. **VOID / REJECT** preserve document and audit trail; they do not remove ledger unless a governed reversal movement is posted.
3. **Posted documents are immutable** — recovery requires explicit reversal/adjustment path, not edit-in-place.
4. Every reversal must log `auditTrail` with actor, reason, and reference to source document.

## Module matrix

| Module | Reversible? | Who | Stock impact | Ledger impact | Approval | Audit | Reference linkage |
|--------|-------------|-----|--------------|---------------|----------|-------|-------------------|
| **Inventory Count (canonical)** | Cancel draft only (`VOID` before post) | Storekeeper / dept | None until post | None until post | Finance approves post | `COUNT_APPROVE`, `POST` | `COUNT_SESSION` |
| **Inventory Count posted** | No in-place reverse | — | — | — | New count/adjustment in open period | Required | New `COUNT_SESSION` offsets variance |
| **GRN** | Reject before post; void draft | Finance / admin | None until post | On `post` only | GRN approval chain | `POST`, `REJECT` | `GRN` reference |
| **GRN posted** | No delete | — | — | — | Adjustment movement | Required | `MOVEMENT` / adjustment doc |
| **Transfer** | Reject in workflow; void in-transit rules | Dept / finance | On receive | On receive | Multi-step | Full chain | `TRANSFER_*` |
| **Breakage** | `VOID` DRAFT/REJECTED only | Admin | On final post only | On final post | 4-step chain | `voidBreakage` | `MOVEMENT` |
| **Breakage posted (APPROVED)** | Not voidable | — | — | — | Compensating adjustment | Required | New doc references reason |
| **Lost** | Same as breakage | Admin / chain | On final approval | On final approval | 4-step / legacy routes | Same | `MOVEMENT` LOST |
| **Get Pass** | `REJECT` in approval; return flows | Security / dept | Per state matrix | Per transition | Mixed | `GET_PASS_*` notes | `getPassId` on return docs |
| **Manual adjustment** | VOID draft only | Admin | On post | On post | Per movement | `POST` / `VOID` | `MOVEMENT` |

## GET_PASS_RETURN documents

- Created by `createGetPassReturnDispositionDocs` with `sourceType: GET_PASS_RETURN` and `getPassId`.
- **Not voidable** after approval posting without governed compensating movement.
- Integrity scan flags `ORPHAN_GET_PASS_RETURN_DOC` when `getPassId` is null.

## Planned reversal engine (future code)

Compensating postings should route through `postingEngine` with:

- `movementType` = `ADJUSTMENT` or mirrored `COUNT_ADJUSTMENT`
- `referenceType` = `REVERSAL_OF`
- `referenceId` = original document/ledger id
- Paired stock + ledger in one transaction

## Validation scenarios (smoke / UAT)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Void draft breakage | Status VOID; no ledger |
| 2 | Void approved breakage | Rejected with error |
| 3 | Cancel draft count session | VOID; no post |
| 4 | Reopen period without reason | 400 `PERIOD_REOPEN_REASON_REQUIRED` |
| 5 | Post into closed period | 422 period lock |

See `scripts/smoke-reversal-governance-static.js`.
