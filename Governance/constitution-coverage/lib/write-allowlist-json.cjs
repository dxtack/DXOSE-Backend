#!/usr/bin/env node
'use strict';

/** Source definitions for V3_SCENARIO_REQUIREMENT_ALLOWLIST.json */

const fs = require('fs');
const path = require('path');

const SCOPE = 'C04-4.3-003';
const LIFECYCLE = 'C04-4.3-001';
const PROP = 'C04-4.4-003';

function e(scenarioId, allowedRequirementIds, whyAllowed, forbiddenExamples, crossCuttingAllowed = false) {
  return { scenarioId, allowedRequirementIds, whyAllowed, forbiddenExamples, crossCuttingAllowed };
}

const scenarios = [
  e('V2-CF-GP-NEVER-SUBMIT', [SCOPE], {
    [SCOPE]: 'Get Pass submit returned HTTP 200 without active ACC assignment — proves Scope gate missing on submit API.',
  }, [LIFECYCLE, 'C05-5.2-011']),
  e('V2-CF-LEG-LOST-DEPT', [], {}, [LIFECYCLE, SCOPE, 'C03-3.3-001'], true),
  e('V2-CF-GP-FF-FINANCE', [LIFECYCLE, 'C03-3.3-001'], {
    [LIFECYCLE]: 'Finance creator submit fast-forwards to PENDING_GM skipping ACC-pinned approval chain steps — lifecycle bypass.',
    'C03-3.3-001': 'Reviewer/creator authority model violated when financeApprovedBy set without dept/cc stamps.',
  }, [SCOPE, 'C05-5.2-011']),
  e('V2-CF-GP-FF-ORG', [LIFECYCLE, 'C03-3.3-001'], {
    [LIFECYCLE]: 'Org creator submit jumps to PENDING_SECURITY with all stamps — skips intermediate workflow steps.',
    'C03-3.3-001': 'Creator role bypasses step-by-step reviewer assignment enforcement.',
  }, [SCOPE, 'C05-5.2-011']),
  e('V2-CF-GP-XT-READ', ['C04-4.2-002', 'C23-23.6-002'], {
    'C04-4.2-002': 'Cross-tenant Get Pass read returned HTTP 404 — tenant isolation on read path.',
    'C23-23.6-002': 'Lookup/tenant boundary PASS for Get Pass module read probe.',
  }, [SCOPE]),
  e('V2-CF-GRN-RESUBMIT-DEAD', ['C02-2.7-002', 'C03-3.4-009'], {
    'C02-2.7-002': 'Independent /resubmit route exists in FE but backend returns 404 — violates Edit-then-Submit after Reject model.',
    'C03-3.4-009': 'REJECTED document must not re-enter workflow via separate resubmit action.',
  }, [LIFECYCLE]),
  e('V2-CF-WP-NEVER-LIST', [SCOPE], {
    [SCOPE]: 'Workflow pipeline list returned HTTP 200 with 50 rows without assignment — Scope gate missing on pipeline list API.',
  }, [LIFECYCLE, 'C07-7.8-002']),
  e('V2-CF-WP-NEVER-SUMMARY', [SCOPE], {
    [SCOPE]: 'Pipeline summary returned HTTP 200 with 179 counts without assignment.',
  }, [LIFECYCLE]),
  e('V2-CF-WP-NEVER-ALERTS', [SCOPE], {
    [SCOPE]: 'Pipeline alerts returned HTTP 200 with 15 items without assignment.',
  }, [LIFECYCLE]),
  e('V2-A-NEVER-SUBMIT', [SCOPE], {
    [SCOPE]: 'Get Pass submit succeeded for user with no assignment record.',
  }, [LIFECYCLE]),
  e('V2-A-INACTIVE-SUBMIT', [SCOPE], {
    [SCOPE]: 'Inactive assignment still allowed submit — Scope/lifecycle gate failure.',
  }, [LIFECYCLE]),
  e('V2-A-DELETED-SUBMIT', [SCOPE], {
    [SCOPE]: 'Submit after deleted assignment still HTTP 200 — assignment Scope not enforced.',
  }, [LIFECYCLE, 'C08-8.6-002']),
  e('V2-A-WRONG-PROP-SUBMIT', [SCOPE, PROP], {
    [SCOPE]: 'Submit allowed outside assigned property scope.',
    [PROP]: 'Wrong-property assignment did not block Get Pass submit.',
  }, [LIFECYCLE]),
  e('V2-A-VALID-SUBMIT', [SCOPE], {
    [SCOPE]: 'Positive control — valid assignment permits submit (DRAFT→PENDING_COST_CONTROL).',
  }, [LIFECYCLE]),
  e('V2-A-STALE-JWT', [SCOPE], {
    [SCOPE]: 'Stale JWT session still permitted submit — session/assignment Scope gate failure.',
  }, [LIFECYCLE, 'C08-8.6-002']),
  e('V2-B-NEVER-LIST', [SCOPE], {
    [SCOPE]: 'Buyer pipeline list exposed 50 rows without assignment.',
  }, [LIFECYCLE]),
  e('V2-B-NEVER-SUMMARY', [SCOPE], {
    [SCOPE]: 'Buyer summary returned empty but HTTP 200 without assignment check proven.',
  }, [LIFECYCLE]),
  e('V2-B-NEVER-ALERTS', [SCOPE], {
    [SCOPE]: 'Buyer alerts returned 15 items without assignment.',
  }, [LIFECYCLE]),
  e('V2-B-FIN-POS', [SCOPE], {
    [SCOPE]: 'Finance positive-position probe — empty result with authorized finance context.',
  }, [LIFECYCLE]),
  e('V2-B-DASH-NEVER', [SCOPE], {
    [SCOPE]: 'Dashboard data returned HTTP 200 without assignment.',
  }, [LIFECYCLE]),
  e('V2-C-WF-EFFECTIVE', [], {}, ['C05-5.2-011', 'C02-2.1-002', 'C02-2.1-003', 'C02-2.3-001'], true),
  e('V2-D-GRN-SB', ['C03-3.4-001', 'C03-3.4-002', 'C03-3.4-003', 'C03-3.4-004', 'C03-3.4-005'], {
    'C03-3.4-001': 'GRN Send Back returned DRAFT — document not ended.',
    'C03-3.4-002': 'Send Back reason captured in GRN Send Back request body before status reset.',
    'C03-3.4-003': 'Creator retains edit authority while document is DRAFT after Send Back.',
    'C03-3.4-004': 'After Send Back document editable at DRAFT; edit HTTP 200 observed.',
    'C03-3.4-005': 'Same GRN transaction continues — Send Back did not spawn new document id.',
  }, [SCOPE]),
  e('V2-D-GRN-EDIT', ['C03-3.4-004', 'C07-7.2-001'], {
    'C03-3.4-004': 'Creator edit on DRAFT after Send Back path — HTTP 200.',
    'C07-7.2-001': 'GRN remains server-recognized draft before submit.',
  }, [SCOPE]),
  e('V2-D-GRN-SUBMIT-AFTER-SB', ['C02-2.7-001', 'C02-2.7-003'], {
    'C02-2.7-001': 'After Return path uses Edit then Submit on same GRN.',
    'C02-2.7-003': 'Submit re-enters workflow after Send Back on GRN.',
  }, [SCOPE]),
  e('V2-D-GRN-RESUBMIT-CALL', ['C02-2.7-002', 'C03-3.4-009'], {
    'C02-2.7-002': 'After Reject path must use Edit-then-Submit not independent /resubmit — backend route absent (404).',
    'C03-3.4-009': 'Backend /resubmit returns 404 — dead route aligns with no Re-submit after Reject.',
  }, [LIFECYCLE]),
  e('V2-D-GRN-AUDIT', ['C22-22.2-001'], {
    'C22-22.2-001': 'SEND_BACK and SUBMIT audit events recorded on GRN Send Back path.',
  }, [SCOPE]),
  e('V2-E-BRK-SUBMIT', ['C05-5.2-011'], {
    'C05-5.2-011': 'Breakage approval chain step advance to DEPT_APPROVED — chain step only, not final posting proof.',
  }, ['C02-2.3-007']),
  e('V2-E-BRK-AP-CC', ['C05-5.2-011'], { 'C05-5.2-011': 'Breakage CC approval step PASS.' }, []),
  e('V2-E-BRK-AP-FIN', ['C05-5.2-011'], { 'C05-5.2-011': 'Breakage Finance approval step PASS.' }, []),
  e('V2-E-BRK-AP-GM', ['C05-5.2-011'], { 'C05-5.2-011': 'Breakage GM final approval step PASS — posting lifecycle separate probe.' }, []),
  e('V2-E-LOST-CREATE', ['C05-5.2-011'], { 'C05-5.2-011': 'Lost Items create reaches DEPT_APPROVED — chain step only.' }, []),
  e('V2-E-LOST-AP-CC', ['C05-5.2-011'], { 'C05-5.2-011': 'Lost CC approval step PASS.' }, []),
  e('V2-E-LOST-AP-FIN', ['C05-5.2-011'], { 'C05-5.2-011': 'Lost Finance approval step PASS.' }, []),
  e('V2-E-LOST-AP-GM', ['C05-5.2-011'], { 'C05-5.2-011': 'Lost GM approval step PASS.' }, []),
  e('V2-F-RPT-BRK-APPROVED-OUT', ['C02-2.4.2-001', 'C02-2.3-007'], {
    'C02-2.4.2-001': 'Approved Breakage with ledger not visible in report — report derives from POSTED filter.',
    'C02-2.3-007': 'APPROVED vs POSTED lifecycle mismatch after posting effects.',
  }, ['C05-5.2-011']),
  e('V2-F-RPT-LOST-LEDGER-OUT', ['C02-2.4.2-001', 'C02-2.3-007'], {
    'C02-2.4.2-001': 'Lost ledger row exists but lost-analysis report rows=0.',
    'C02-2.3-007': 'Document remains APPROVED while posting effects exist — standardized lifecycle state mismatch.',
  }, []),
  e('V2-F-RPT-POSTED-IN', ['C02-2.4.2-001', 'C02-2.3-007'], {
    'C02-2.4.2-001': 'Posted ledger present but parent status APPROVED excludes from POSTED-only reports.',
    'C02-2.3-007': 'APPROVED vs POSTED divergence hides constitutionally posted documents from reports.',
  }, []),
  e('V2-F-RPT-DRAFT-OUT', ['C02-2.4.2-001'], {
    'C02-2.4.2-001': 'DRAFT document excluded from financial report — PASS.',
  }, []),
  e('V2-G-PERM-CHECK', ['C05-5.2-011'], { 'C05-5.2-011': 'Movements ADJUSTMENT permissions present for direct-post family.' }, [SCOPE]),
  e('V2-G-NO-ASSIGN', [SCOPE], { [SCOPE]: 'Movement create denied HTTP 403 without assignment — Scope gate PASS.' }, [LIFECYCLE]),
  e('V2-G-CREATE', ['C05-5.2-011'], { 'C05-5.2-011': 'Authorized movement create HTTP 201.' }, []),
  e('V2-G-VALIDATE', ['C05-5.2-011'], { 'C05-5.2-011': 'Movement validation rejects invalid payload HTTP 422.' }, []),
  e('V2-G-WRONG-SCOPE', [SCOPE, PROP], {
    [SCOPE]: 'Movement create HTTP 201 for user assigned to different property — Scope failure.',
    [PROP]: 'Cross-property movement not denied.',
  }, [LIFECYCLE]),
  e('V2-G-NEG-INV', ['C05-5.2-011'], { 'C05-5.2-011': 'Negative inventory blocked HTTP 422 on movement post path.' }, []),
  e('V2-G-POST', ['C05-5.2-011'], { 'C05-5.2-011': 'Movement POST→POSTED with ledger and stock update.' }, []),
  e('V2-G-IDEMP', ['C05-5.2-011'], { 'C05-5.2-011': 'Duplicate movement post rejected HTTP 400.' }, []),
  e('V2-G-MODEL', ['C05-5.2-011'], { 'C05-5.2-011': 'ADJUSTMENT direct-post model: DRAFT→POSTED without ACC approval chain.' }, []),
  e('V2-I-REQ-PIPELINE', ['C04-4.3-004'], { 'C04-4.3-004': 'Requisition excluded from operational pipeline rows=0.' }, [SCOPE]),
  e('V2-I-STOCK-RPT', ['C04-4.3-004'], { 'C04-4.3-004': 'Retired stock report not in pipeline rows=0.' }, []),
  e('V3-H-SB-GRN', ['C03-3.4-001', 'C03-3.4-002', 'C03-3.4-003', 'C03-3.4-004', 'C03-3.4-005', 'C02-2.7-001', 'C02-2.7-003'], {
    'C03-3.4-001': 'v3 GRN Send Back returns DRAFT — document continues.',
    'C03-3.4-002': 'Send Back reason required in v3 GRN probe before status transition.',
    'C03-3.4-003': 'Creator edit HTTP 200 after Send Back while status=DRAFT.',
    'C03-3.4-004': 'Edit then Submit path exercised — validate+submit after Send Back on same GRN.',
    'C03-3.4-005': 'Same GRN id continues after Send Back and resubmit — transaction not split.',
    'C02-2.7-001': 'After Return workflow path is Edit then Submit on GRN — observed in v3 probe.',
    'C02-2.7-003': 'Submit after Send Back re-enters workflow (PENDING_APPROVAL) on same document.',
  }, [SCOPE]),
  e('V3-E-POSTING-BREAKAGE', ['C05-5.2-011', 'C02-2.3-007'], {
    'C05-5.2-011': 'Auto-posting triggered at GM approval but status remains APPROVED not POSTED.',
    'C02-2.3-007': 'Lifecycle state diverges from posting effects.',
  }, ['C02-2.1-002']),
  e('V3-E-POSTING-LOST', ['C05-5.2-011', 'C02-2.3-007'], {
    'C05-5.2-011': 'Lost Items same APPROVED-after-posting pattern as Breakage.',
    'C02-2.3-007': 'Lifecycle remains APPROVED when postedAt and ledger set — state standardization failure.',
  }, []),
  e('V3-E-POSTING-REPORT-LINK', ['C02-2.4.2-001', 'C02-2.3-007'], {
    'C02-2.4.2-001': 'Ledger+postedAt present but POSTED-only report filter excludes document.',
    'C02-2.3-007': 'Report exclusion caused by APPROVED status vs POSTED lifecycle expectation.',
  }, ['C05-5.2-011']),
  e('V3-H-SB-TRANSFER', ['C03-3.4-001', 'C03-3.4-004', 'C02-2.7-001', 'C02-2.7-003'], {
    'C03-3.4-001': 'Transfer Send Back route HTTP 404 — Send Back not implemented.',
    'C03-3.4-004': 'Cannot test Edit-then-Submit after Return because Send Back route missing.',
    'C02-2.7-001': 'Return path blocked at Transfer — no Send Back to reach Edit-then-Submit.',
    'C02-2.7-003': 'Submit-after-Return not reachable on Transfer due to missing Send Back API.',
  }, [SCOPE]),
  e('V3-H-REJECT-TRANSFER', ['C03-3.4-006', 'C03-3.4-010'], {
    'C03-3.4-006': 'Transfer Reject returns REJECTED — terminates document.',
    'C03-3.4-010': 'Reject terminates business transaction on Transfer.',
  }, ['C03-3.4-007', 'C03-3.4-008']),
  e('V3-H-SB-BREAKAGE', ['C03-3.4-001', 'C03-3.4-004', 'C02-2.7-001'], {
    'C03-3.4-001': 'Breakage Send Back HTTP 404.',
    'C03-3.4-004': 'Edit-then-Submit after Return untestable — Send Back route absent on Breakage.',
    'C02-2.7-001': 'Return workflow path not available on Breakage at review step.',
  }, []),
  e('V3-H-REJECT-BREAKAGE', ['C03-3.4-006', 'C03-3.4-010'], {
    'C03-3.4-006': 'Breakage Reject PASS to REJECTED terminal state.',
    'C03-3.4-010': 'Reject terminates Breakage business transaction — document ended.',
  }, ['C03-3.4-007', 'C03-3.4-008']),
  e('V3-H-SB-LOST', ['C03-3.4-001', 'C03-3.4-004'], {
    'C03-3.4-001': 'Lost Send Back HTTP 404.',
    'C03-3.4-004': 'Edit after Return untestable on Lost Items — Send Back route missing.',
  }, []),
  e('V3-H-REJECT-LOST', ['C03-3.4-006', 'C03-3.4-010'], {
    'C03-3.4-006': 'Lost Reject PASS — document reaches REJECTED terminal state.',
    'C03-3.4-010': 'Reject ends Lost Items business transaction per v3 probe.',
  }, ['C03-3.4-007']),
  e('V3-H-SB-GETPASS', ['C03-3.4-001', 'C03-3.4-004'], {
    'C03-3.4-001': 'Get Pass Send Back HTTP 404 during approval.',
    'C03-3.4-004': 'Edit-then-Submit after Return blocked — no Send Back route on Get Pass approval chain.',
  }, []),
  e('V3-H-REJECT-GETPASS', ['C03-3.4-006', 'C03-3.4-010'], {
    'C03-3.4-006': 'Get Pass Reject failed HTTP 500 — Reject action did not end document.',
    'C03-3.4-010': 'Reject did not terminate workflow — still PENDING_COST_CONTROL.',
  }, ['C03-3.4-007', 'C03-3.4-008']),
  e('V3-H-SB-IC', ['C03-3.4-001', 'C03-3.4-004'], {
    'C03-3.4-001': 'IC session Send Back HTTP 404 at PENDING_APPROVAL.',
    'C03-3.4-004': 'Edit-then-Submit after Return untestable on IC sessions — Send Back route missing.',
  }, []),
  e('V3-H-REJECT-IC', ['C03-3.4-006', 'C03-3.4-010'], {
    'C03-3.4-006': 'IC Reject returned HTTP 403 — Reject execution failed.',
    'C03-3.4-010': 'Session remained PENDING_APPROVAL — transaction not terminated.',
  }, ['C03-3.4-007', 'C03-3.4-008']),
  e('V3-GRN-RESUBMIT-BROWSER', ['C02-2.7-002', 'C03-3.4-009'], {
    'C02-2.7-002': 'Independent Re-submit UI/API on REJECTED GRN violates Edit-then-Submit model for new attempts.',
    'C03-3.4-009': 'FE resubmitRejected() static code exists; backend /resubmit 404 — dead Re-submit path.',
  }, [LIFECYCLE]),
];

const crossCuttingFindings = [
  {
    crossCuttingFindingId: 'V2-C-WF-EFFECTIVE',
    classification: 'Configuration Drift',
    reason: 'No exact 393 requirement expresses effective GET_PASS workflow configuration inheritance across tenants',
    constitutionalAuthority: 'Workflow Contract GET_PASS §5; GP effective resolver — published chain must match contract without unauthorized GM step',
    evidence: 'Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json',
    actual: '21/21 effective chains contain PENDING_GM; 0 tenant-specific overrides; 21 inherit global configuration',
  },
  {
    crossCuttingFindingId: 'V2-CF-LEG-LOST-DEPT',
    classification: 'Operational Legacy',
    reason: 'No exact 393 requirement names legacy /approve-dept route; runtime proves ACC-unpinned approval bypass on Lost Items',
    constitutionalAuthority: 'Constitution §4.3 Action Allowed; ACC-pinned approval chain',
    evidence: 'Governance/runtime-revalidation/P0_RUNTIME_V3_FINAL.json',
    actual: 'HTTP 200 DRAFT→DEPT_APPROVED on legacy /approve-dept with pin=null',
  },
];

const out = {
  version: 'lock-correction-v1',
  generatedAt: new Date().toISOString(),
  description: 'Delivered scenario→requirement allow-list with semantic whyAllowed; v3 baseline frozen',
  scenarios,
  crossCuttingFindings,
};

const target = path.join(__dirname, '../V3_SCENARIO_REQUIREMENT_ALLOWLIST.json');
fs.writeFileSync(target, JSON.stringify(out, null, 2));
console.log('Wrote', target, 'scenarios:', scenarios.length);
