# Test Execution Results

| Command | Environment | Exit | Passed | Failed | Skipped | Exact failure |
|---------|-------------|-----:|--------|--------|---------|---------------|
| frontend_lockfile_install | undefined | 0 | — | — | — | — |
| backend_unit_tests | C:\DX OS&E\OSE-backend | 1 | — | FAIL | 5 | ✖ postDocument OPENING_BALANCE prefetches stock and skips zero-qty lines (174.7341ms)
  TypeError: validatePostingDate i |
| step_permission_enforcement | C:\DX OS&E\OSE-backend | 0 | PASS | — | 1 | — |
| verify_acc_p30 | C:\DX OS&E\OSE-backend | 0 | PASS | — | — | — |
| smoke_governance_static | C:\DX OS&E\OSE-backend | 0 | PASS | — | — | — |
| governance_integration | C:\DX OS&E\OSE-backend | 1 | — | FAIL | — |      ?   totalQtyLost?: SortOrder,
     ?   totalQtyDamage?: SortOrder,
     ?   wacUnitCost?: SortOrder,
     ?   lastU |
| reporting_final_regression | C:\DX OS&E\OSE-backend | 1 | — | FAIL | — |   PASS  Golden PDF renders (40376 bytes)
  PASS  Stock balance 26 lines PDF page count 2 (no ghost pages)
  PASS  Stock  |
| grn_timeline_db_integration | C:\DX OS&E\OSE-backend | 0 | PASS | — | 4 | — |
| frontend_build | C:\DX OS&E\OSE-Frontend | 0 | PASS | — | — | — |
| frontend_unit_headless | C:\DX OS&E\OSE-Frontend | 1 | — | FAIL | — | Node.js version v25.6.0 detected.
Odd numbered Node.js versions will not enter LTS status and should not be used for pro |
