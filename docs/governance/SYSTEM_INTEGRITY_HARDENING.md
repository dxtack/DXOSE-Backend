# System Integrity Hardening — Phase Charter

| Field | Value |
|--------|--------|
| **Status** | In progress |
| **Scope** | Stabilization only — no feature expansion |

## Objective

Transition DX OSE from feature-rich operational prototype to a **governed operational ERP** with accounting confidence.

## Workstreams

| ID | Focus | Doc | Exit signal |
|----|--------|-----|-------------|
| A1 | Inventory count unification | `INVENTORY_COUNT_CANONICAL.md` | Legacy mutations 403 |
| A2 | Count posting integrity | `POSTING_FLOW_MAP.md` | Smokes green |
| A3 | WAC / valuation governance | `valuationGovernance.service.js` | No silent zero without `MISSING_WAC` |
| B1–B3 | Get Pass hardening | `GET_PASS_STATE_MATRIX.md` | Matrix + return docs linked |
| C1–C2 | Posting facade + smokes | `postingEngine.service.js` | Incremental migration |
| D | Audit / semantics / enums | `PRODUCT_CONTRACTS.md`, `enums.ts` | Single audit path (planned) |
| E | Operational UX | Component-level | ERP scroll/dropdown parity |
| **F1** | Reversal / recovery | `REVERSAL_RECOVERY_GOVERNANCE.md` | Matrix + void immutability rules |
| **F2** | Period close / reopen | `PERIOD_CLOSE_GOVERNANCE.md` | Checklist API + reopen reason |
| **F3** | Integrity monitoring | `DATA_INTEGRITY_MONITORING.md` | `GET /integrity/scan` |
| **G1** | Posting migration breakage/lost | `postingGovernedMovement.service.js` | Via postingEngine |
| **G3** | Enforcement smokes | `smoke-posting-governance-enforcement.js` | CI static |
| **H1** | Audit envelope | `auditGoverned.service.js` | logGovernedEvent |
| **J1** | Integrity cron | `integrityScheduler.service.js` | Daily 06:00 |
| **I1** | ERP table UX | `_erp-operational-layout.scss` | Breakage/Lost/Stock |

## Validation

`INTEGRITY_HARDENING_CHECKLIST.md`

## Non-goals

- New modules (POS, HR, etc.)
- Reporting workspace expansion
- Cosmetic-only PRs
