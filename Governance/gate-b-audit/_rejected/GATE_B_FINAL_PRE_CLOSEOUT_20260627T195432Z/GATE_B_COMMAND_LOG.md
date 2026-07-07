# Gate B FINAL Command Log

```
$ powershell -Command (Test-NetConnection -ComputerName 127.0.0.1 -Port 4000 -WarningAction SilentlyContinue).TcpTestSucceeded
```

```
True

```

```
$ powershell -Command (Test-NetConnection -ComputerName 127.0.0.1 -Port 4200 -WarningAction SilentlyContinue).TcpTestSucceeded
```

```
True

```

```
$ powershell -Command (Test-NetConnection -ComputerName 127.0.0.1 -Port 5433 -WarningAction SilentlyContinue).TcpTestSucceeded
```

```
True

```

```
$ powershell -Command try { (Invoke-WebRequest -Uri 'http://127.0.0.1:4000/api/health' -UseBasicParsing -TimeoutSec 10).StatusCode } catch { $_.Exception.Response.StatusCode.value__ }
```

```
404

```

```
$ powershell -Command try { (Invoke-WebRequest -Uri 'http://127.0.0.1:4200' -UseBasicParsing -TimeoutSec 10).StatusCode } catch { 'unreachable' }
```

```
200

```

```
$ node scripts/gate-b-final-runtime.js  # cwd=c:\DX OS&E\OSE-backend
```

```
Wrote c:\DX OS&E\Governance\gate-b-audit\final\GATE_B_RUNTIME_RESULTS.json { Passed: 4, Failed: 2, Blocked: 0 }

```

```
$ git branch --show-current  # cwd=c:\DX OS&E
```

```
master

```

```
$ git rev-parse HEAD  # cwd=c:\DX OS&E
```

```
d8ea25d51407370b1e67c42378e3114d127a019e

```

```
$ git status --porcelain  # cwd=c:\DX OS&E
```

```
 M Governance/CONSTITUTION_TRACEABILITY_MATRIX.md
 M Governance/build-register.mjs
 M Governance/evidence.json
 M Governance/requirements.json
?? .github/
?? Governance/apply-batch-ch19-28.mjs
?? Governance/apply-batch-no-closure.mjs
?? Governance/apply-ch12-18-remediation.mjs
?? Governance/apply-ch3-5-remediation.mjs
?? Governance/apply-pre-audit.mjs
?? Governance/apply-remediation-ch19-28.mjs
?? Governance/apply-verification.mjs
?? Governance/assign-requirement-ids.mjs
?? Governance/audit-evidence-paths.mjs
?? Governance/batch-no-closure-summary.json
?? Governance/ch19-28-remediation-summary.json
?? Governance/ch6-11-verification-batch.json
?? Governance/closeout-runtime-audit/
?? Governance/constitution-extraction/
?? Governance/extract-requirements.mjs
?? Governance/final-package/
?? Governance/gate-b-audit/
?? Governance/generate-final-report.mjs
?? Governance/import-requirements.mjs
?? Governance/normalize-evidence-paths.mjs
?? Governance/patch-ch7-evidence.mjs
?? Governance/patch-empty-evidence.mjs
?? Governance/pre-audit-corrections.json
?? Governance/remediate-ch6-11.mjs
?? Governance/remediate-ch8.mjs
?? Governance/remediation-queue.json
?? Governance/report-batches.mjs
?? Governance/timeline-remediation/FINAL_PHASE2_GATE_EVIDENCE.md
?? Governance/timeline-remediation/FINAL_TIMELINE_VERIFICATION_MATRIX.md
?? Governance/timeline-remediation/PHASE0_REOPEN_EVIDENCE.md
?? Governance/timeline-remediation/PHASE10_GOVERNANCE_CLOSURE.md
?? Governance/timeline-remediation/PHASE1_CONTRACT_EVIDENCE.md
?? Governance/timeline-remediation/PHASE2_GRN_EVIDENCE.md
?? Governance/timeline-remediation/PHASE3_SHARED_RENDERER_EVIDENCE.md
?? Governance/timeline-remediation/PHASE4_GRN_DETAIL_EVIDENCE.md
?? Governance/timeline-remediation/PHASE5_TRANSFER_BREAKAGE_LOST_EVIDENCE.md
?? Governance/timeline-remediation/PHASE6_GET_PASS_EVIDENCE.md
?? Governance/timeline-remediation/PHASE7_INVENTORY_COUNT_EVIDENCE.md
?? Governance/timeline-remediation/PHASE8_MOVEMENT_WORKFLOW_EVIDENCE.md
?? Governance/timeline-remediation/PHASE9_CROSS_MODULE_REGRESSION.md
?? Governance/timeline-remediation/apply-phase0-reopen.mjs
?? Governance/timeline-remediation/backfill-reports/
?? Governance/timeline-remediation/runtime-evidence/
?? OSE-Frontend/
?? OSE-backend/
?? _preserve/
?? build-errors.txt
?? build-full.txt
?? build-out.txt
?? docs/
?? logs/
?? node_modules/
?? package-lock.json
?? package.json
?? scripts/

```

```
$ git branch --show-current  # cwd=c:\DX OS&E
```

```
master

```

```
$ git rev-parse HEAD  # cwd=c:\DX OS&E
```

```
d8ea25d51407370b1e67c42378e3114d127a019e

```

```
$ git status --porcelain  # cwd=c:\DX OS&E
```

```
 M Governance/CONSTITUTION_TRACEABILITY_MATRIX.md
 M Governance/build-register.mjs
 M Governance/evidence.json
 M Governance/requirements.json
?? .github/
?? Governance/apply-batch-ch19-28.mjs
?? Governance/apply-batch-no-closure.mjs
?? Governance/apply-ch12-18-remediation.mjs
?? Governance/apply-ch3-5-remediation.mjs
?? Governance/apply-pre-audit.mjs
?? Governance/apply-remediation-ch19-28.mjs
?? Governance/apply-verification.mjs
?? Governance/assign-requirement-ids.mjs
?? Governance/audit-evidence-paths.mjs
?? Governance/batch-no-closure-summary.json
?? Governance/ch19-28-remediation-summary.json
?? Governance/ch6-11-verification-batch.json
?? Governance/closeout-runtime-audit/
?? Governance/constitution-extraction/
?? Governance/extract-requirements.mjs
?? Governance/final-package/
?? Governance/gate-b-audit/
?? Governance/generate-final-report.mjs
?? Governance/import-requirements.mjs
?? Governance/normalize-evidence-paths.mjs
?? Governance/patch-ch7-evidence.mjs
?? Governance/patch-empty-evidence.mjs
?? Governance/pre-audit-corrections.json
?? Governance/remediate-ch6-11.mjs
?? Governance/remediate-ch8.mjs
?? Governance/remediation-queue.json
?? Governance/report-batches.mjs
?? Governance/timeline-remediation/FINAL_PHASE2_GATE_EVIDENCE.md
?? Governance/timeline-remediation/FINAL_TIMELINE_VERIFICATION_MATRIX.md
?? Governance/timeline-remediation/PHASE0_REOPEN_EVIDENCE.md
?? Governance/timeline-remediation/PHASE10_GOVERNANCE_CLOSURE.md
?? Governance/timeline-remediation/PHASE1_CONTRACT_EVIDENCE.md
?? Governance/timeline-remediation/PHASE2_GRN_EVIDENCE.md
?? Governance/timeline-remediation/PHASE3_SHARED_RENDERER_EVIDENCE.md
?? Governance/timeline-remediation/PHASE4_GRN_DETAIL_EVIDENCE.md
?? Governance/timeline-remediation/PHASE5_TRANSFER_BREAKAGE_LOST_EVIDENCE.md
?? Governance/timeline-remediation/PHASE6_GET_PASS_EVIDENCE.md
?? Governance/timeline-remediation/PHASE7_INVENTORY_COUNT_EVIDENCE.md
?? Governance/timeline-remediation/PHASE8_MOVEMENT_WORKFLOW_EVIDENCE.md
?? Governance/timeline-remediation/PHASE9_CROSS_MODULE_REGRESSION.md
?? Governance/timeline-remediation/apply-phase0-reopen.mjs
?? Governance/timeline-remediation/backfill-reports/
?? Governance/timeline-remediation/runtime-evidence/
?? OSE-Frontend/
?? OSE-backend/
?? _preserve/
?? build-errors.txt
?? build-full.txt
?? build-out.txt
?? docs/
?? logs/
?? node_modules/
?? package-lock.json
?? package.json
?? scripts/

```