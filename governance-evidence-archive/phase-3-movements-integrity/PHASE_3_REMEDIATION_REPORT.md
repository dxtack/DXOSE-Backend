# Phase 3 — Movements Full Integrity: Remediation Report

Generated: 2026-06-28 (Browser verification reopen)  
Formal closure: **CLOSED** (`phaseClosed: true`)

## Browser verification reopen

Prior browser evidence (`phase3-browser-strict-v0`) passed with `draftVisible || postedVisible`, leaving `postedVisible: false` and `historyLinkPresent: false`. That did not satisfy the principal Movement Register path.

**Remediation:** Rebuilt `phase-3-movement-register-browser.cjs` with strict pass criteria — all 12 required steps must pass; no OR shortcut.

## Strict browser flow (all PASS)

| Step | Assertion |
|------|-----------|
| Login | Finance Manager + active in-scope assignment (`p3-browser-fm@phase3-gate.local`) |
| Register | `/movements` loads |
| Create | ADJUSTMENT via UI → HTTP 201 |
| DRAFT | Detail badge `status-draft` before post |
| Open by ID | `/movements/{docId}` |
| Post | Confirm dialog → HTTP 200 on `/post` |
| POSTED | Detail badge `status-posted` after post |
| List | Search `ADJ-2026-00108` → row `status-posted` |
| Ledger UI | `.movement-form__ledger-card` on detail |
| Ledger exact | API `referenceId`, type ADJUSTMENT, qtyIn=3, unitCost=5, totalValue=15 |
| Unauthorized hidden | No post/save/void buttons after post |

Evidence: `PHASE_3_BROWSER_RESULTS.json` (`phase3-browser-strict-v1`, executed 2026-06-28T02:17:46Z)

## Product changes (this reopen)

**None.** Browser-only remediation.

## Prior Phase 3 product remediations (accepted)

- Movement Register read scope (assignment + dept/location filter)
- Breakage/Lost `assertActiveAssignmentForMutation`
- ADJUSTMENT create validation (cross-tenant item, inactive item/location)
- Atomicity rollback tests in `posting.service.test.js`

## Gate totals

| Metric | Result |
|--------|--------|
| Runtime scenarios | 35/35 PASS |
| Regression | 20/20 PASS (includes strict browser) |
| `phaseClosed` | true |

## Constraints honored

- Phase 1 and Phase 2 frozen
- No Phase 4 / Workflow Timeline
- No backend/product changes in browser reopen
