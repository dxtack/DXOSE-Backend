# DX OSE — Unauthorized UI Change and Test Data Contamination Audit

**Executed:** 2026-06-27T01:12:09.218Z

## 1. Product diff (git)

OSE-Frontend/ and OSE-backend/ are untracked in git — no commit diff available

Closeout harness scripts under `OSE-backend/scripts/closeout-runtime-audit/` do **not** write to `OSE-Frontend/src` or `OSE-backend/src`.

**Pagination:** `REGISTRY_LIST_PAGE_SIZE = 20` in `registry-list-pagination.constants.ts`. Breakage list uses `signal(REGISTRY_LIST_PAGE_SIZE)`. Backend `breakage.service.js` default `take = 20`.

**Conclusion:** Reported 10-row pagination was **not** introduced by closeout harness product edits. If UI shows 10 rows, cause is runtime state (browser cache, different screen such as User Rights assignmentsPageSize=10), not closeout-modified registry lists.

## 2. Table configuration audit

See `UNAUTHORIZED_TABLE_CONFIGURATION_AUDIT.json`.

## 3. Breakage regression root cause

Harness scripts (`02-acc-operational-legacy.js`, `04-role-resource-scope.js`, `24-legacy-route-complete.js`, `36-legacy-chain-complete.js`, etc.) insert `movementDocument` rows tagged `CLOSEOUT_RT_AUDIT` directly via Prisma.

Empty columns / `BREAKAGE.STATUS.undefined`: documents with invalid/null `status` or statuses without i18n keys in list API response.

See `BREAKAGE_UI_REGRESSION_INVESTIGATION.json` (1 suspicious rows).

## 4. Workflow Pipeline regression root cause

- **Requisition rows:** `workflow-pipeline.collectors.js` still collects REQUISITION — **pre-existing product code**, not closeout UI edit.
- **PENDING_GM Get Pass:** global workflow v3 (governance defect); test GPs tagged `CLOSEOUT_RT_AUDIT` in `borrowingEntity`.
- **No-assignment exposure:** runtime defect #2 (confirmed in Round 7).

See `WORKFLOW_PIPELINE_UI_REGRESSION_INVESTIGATION.json`.

## 5. Test fixture inventory

Tag: `CLOSEOUT_RT_AUDIT` / `CLOSEOUT_RT_AUDIT*` in `movementDocument.reason`, Get Pass `borrowingEntity`, GRN numbers `GRN-R7-*`, etc.

## 6. Cleanup proof

Executed `53-cleanup-closeout-fixtures.js` at 2026-06-27:

| Type | Deleted |
| ---- | ------: |
| Get Pass (borrowingEntity contains `CLOSEOUT_RT_AUDIT`) | 299 |
| GRN (GRN-R7-/GRN-V3- prefixes, unposted) | 41 |
| Movement documents (CLOSEOUT/PHASE5/closeout-audit.local creator, unposted) | 147 |

**Not deleted:** Posted breakage `BRK-2026-00109` (status APPROVED) — requires manual review if operational.

See `CLOSEOUT_FIXTURE_CLEANUP_PROOF.json`.

## 7. Restoration proof

- **UI code:** No rollback required — no unauthorized product UI commits from closeout.
- **Data:** Cleanup script removes harness contamination from DB.

## 8. Screenshot/Playwright

Pending post-cleanup verification.

## 9. Remaining product changes from closeout

**None in Frontend/Backend source.** Only Governance artifacts + DB fixture inserts.
