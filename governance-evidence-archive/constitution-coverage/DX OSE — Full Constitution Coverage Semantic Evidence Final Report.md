# DX OSE — Full Constitution Coverage Semantic Evidence Final Report

Generated: 2026-06-27T22:53:04.074Z

## Lock correction summary

- Allowlist loaded from delivered JSON only (`V3_SCENARIO_REQUIREMENT_ALLOWLIST.json`); SHA256 recorded in matrix baseline.
- `V2-C-WF-EFFECTIVE` and `V2-CF-LEG-LOST-DEPT` documented as cross-cutting findings (Configuration Drift / Operational Legacy).
- Scope/assignment scenarios mapped to `C04-4.3-003`; wrong-property probes also to `C04-4.4-003`.
- Reject failure scenarios (`V3-H-REJECT-GETPASS`, `V3-H-REJECT-IC`) limited to `C03-3.4-006` and `C03-3.4-010`; `C03-3.4-007`/`008` Partial.
- Governance library artifact requirements `C01-1.2-003`–`009` → Static Verified — Appropriate.
- All supporting evidence includes `proves` + `doesNotProve`; Partial rows use specific scope and `rootCauseGroup`.

## Validation

See `SEMANTIC_EVIDENCE_INTEGRITY_VALIDATION.json` (`passed: true`).

| allowlistSha256 | e8a48edc19a84d14f8bc557ba8adcecad0ea239f4d5165c49832adf4a1566562 |
| allowlistScenarioCount | 64 |
| configurationDriftCount | 1 |
| operationalLegacyCount | 1 |

## Classification counts

| Classification | Count |
|----------------|-------|
| Partial | 362 |
| Static Verified — Appropriate | 15 |
| Failed Runtime | 11 |
| Governance Conflict | 3 |
| Static Dead Code | 2 |

## Cross-cutting findings

### V2-C-WF-EFFECTIVE — Configuration Drift

No exact 393 requirement expresses effective GET_PASS workflow configuration inheritance across tenants

- Authority: Workflow Contract GET_PASS §5; GP effective resolver — published chain must match contract without unauthorized GM step
- Actual: 21/21 effective chains contain PENDING_GM; 0 tenant-specific overrides; 21 inherit global configuration

### V2-CF-LEG-LOST-DEPT — Operational Legacy

No exact 393 requirement names legacy /approve-dept route; runtime proves ACC-unpinned approval bypass on Lost Items

- Authority: Constitution §4.3 Action Allowed; ACC-pinned approval chain
- Actual: HTTP 200 DRAFT→DEPT_APPROVED on legacy /approve-dept with pin=null

## Failed Runtime (11)

- **C02-2.7-001** — V3-H-SB-GRN; V3-H-SB-TRANSFER; V3-H-SB-BREAKAGE; V2-D-GRN-SUBMIT-AFTER-SB — Platform Send Back required; only GRN implemented — Transfer/Breakage/Lost/GetPass/IC return 404 per v3
- **C03-3.3-001** — V2-CF-GP-FF-FINANCE; V2-CF-GP-FF-ORG — 
- **C03-3.4-001** — V3-H-SB-GRN; V3-H-SB-TRANSFER; V3-H-SB-BREAKAGE; V3-H-SB-LOST; V3-H-SB-GETPASS; V3-H-SB-IC; V2-D-GRN-SB — Platform Send Back required; only GRN implemented — Transfer/Breakage/Lost/GetPass/IC return 404 per v3
- **C03-3.4-002** — V3-H-SB-GRN; V2-D-GRN-SB — Platform Send Back required; only GRN implemented — Transfer/Breakage/Lost/GetPass/IC return 404 per v3
- **C03-3.4-003** — V3-H-SB-GRN; V2-D-GRN-SB — Platform Send Back required; only GRN implemented — Transfer/Breakage/Lost/GetPass/IC return 404 per v3
- **C03-3.4-004** — V3-H-SB-GRN; V3-H-SB-TRANSFER; V3-H-SB-BREAKAGE; V3-H-SB-LOST; V3-H-SB-GETPASS; V3-H-SB-IC; V2-D-GRN-SB — Platform Send Back required; only GRN implemented — Transfer/Breakage/Lost/GetPass/IC return 404 per v3
- **C03-3.4-005** — V3-H-SB-GRN; V2-D-GRN-SB — Platform Send Back required; only GRN implemented — Transfer/Breakage/Lost/GetPass/IC return 404 per v3
- **C03-3.4-006** — V3-H-REJECT-TRANSFER; V3-H-REJECT-BREAKAGE; V3-H-REJECT-LOST; V3-H-REJECT-GETPASS; V3-H-REJECT-IC — 
- **C03-3.4-010** — V3-H-REJECT-TRANSFER; V3-H-REJECT-BREAKAGE; V3-H-REJECT-LOST; V3-H-REJECT-GETPASS; V3-H-REJECT-IC — 
- **C04-4.3-001** — V2-CF-GP-FF-FINANCE; V2-CF-GP-FF-ORG — 
- **C04-4.3-003** — V2-CF-GP-NEVER-SUBMIT; V2-CF-WP-NEVER-LIST; V2-CF-WP-NEVER-SUMMARY; V2-CF-WP-NEVER-ALERTS; V2-A-NEVER-SUBMIT; V2-A-INACTIVE-SUBMIT; V2-A-DELETED-SUBMIT; V2-A-WRONG-PROP-SUBMIT; V2-A-VALID-SUBMIT; V2-A-STALE-JWT; V2-B-NEVER-LIST; V2-B-NEVER-SUMMARY; V2-B-NEVER-ALERTS; V2-B-FIN-POS; V2-B-DASH-NEVER; V2-G-NO-ASSIGN; V2-G-WRONG-SCOPE — 

## Governance Conflict (3)

- **C02-2.3-007** — V2-F-RPT-BRK-APPROVED-OUT: brkInReport=false ledger=1 doc=BRK-2026-00020 rows=0 | V2-F-RPT-LOST-LEDGER-OUT: lostInReport=false ledger=1 doc=LST-2026-00008 | V2-F-RPT-POSTED-IN: brk=false lost=false anyLedger=2 | V3-E-POSTING-BREAKAGE: status=APPROVED postedAt=set ledger=1 stock 200->198 | V3-E-POSTING-LOST: status=APPROVED postedAt=set ledger=1 | V3-E-POSTING-REPORT-LINK: ledger+postedAt present; status=APPROVED; breakage-loss + loss-analysis rows=0
- **C02-2.4.2-001** — V2-F-RPT-BRK-APPROVED-OUT: brkInReport=false ledger=1 doc=BRK-2026-00020 rows=0 | V2-F-RPT-LOST-LEDGER-OUT: lostInReport=false ledger=1 doc=LST-2026-00008 | V2-F-RPT-POSTED-IN: brk=false lost=false anyLedger=2 | V3-E-POSTING-REPORT-LINK: ledger+postedAt present; status=APPROVED; breakage-loss + loss-analysis rows=0
- **C05-5.2-011** — V3-E-POSTING-BREAKAGE: status=APPROVED postedAt=set ledger=1 stock 200->198 | V3-E-POSTING-LOST: status=APPROVED postedAt=set ledger=1