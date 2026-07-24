'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

const LINKS = path.join(REPORT_DIR, 'CONSTITUTION_REQUIREMENT_TEST_LINKS.json');
const OUT_FAILED = path.join(REPORT_DIR, 'FAILED_RUNTIME_REQUIREMENTS_ROUND7.json');
const OUT_GOV = path.join(REPORT_DIR, 'GOVERNANCE_CONFLICT_REQUIREMENTS_ROUND7.json');
const OUT_PARTIAL = path.join(REPORT_DIR, 'PARTIAL_REQUIREMENTS_ROUND7.json');
const OUT_ZERO = path.join(REPORT_DIR, 'RUNTIME_VERIFIED_COMPLETE_ANALYSIS.json');

const MODULE_MAP = {
  'Get Pass': ['GetPass', 'WorkflowPipeline'],
  GRN: ['GRN'],
  Transfer: ['Transfer'],
  'Inventory Count': ['InventoryCount'],
  Lost: ['Lost'],
  Breakage: ['Breakage'],
  Movement: ['Movement'],
  Auth: ['Auth'],
};

function inferModules(requirement) {
  const t = (requirement || '').toLowerCase();
  if (/get.?pass/.test(t)) return MODULE_MAP['Get Pass'];
  if (/grn|goods receipt/.test(t)) return MODULE_MAP.GRN;
  if (/transfer/.test(t)) return MODULE_MAP.Transfer;
  if (/inventory count|stock count/.test(t)) return MODULE_MAP['Inventory Count'];
  if (/lost/.test(t)) return MODULE_MAP.Lost;
  if (/breakage/.test(t)) return MODULE_MAP.Breakage;
  if (/movement/.test(t)) return MODULE_MAP.Movement;
  if (/auth|login|jwt|assignment/.test(t)) return MODULE_MAP.Auth;
  return ['Unknown'];
}

function testedModules(r) {
  const scenarios = (r.linkedScenarios || []).join(' ').toLowerCase();
  const tested = [];
  if (/gp|get.?pass|get_pass/.test(scenarios)) tested.push('GetPass');
  if (/grn/.test(scenarios)) tested.push('GRN');
  if (/transfer|tr-/.test(scenarios)) tested.push('Transfer');
  if (/ic-|inventory/.test(scenarios)) tested.push('InventoryCount');
  if (/lost/.test(scenarios)) tested.push('Lost');
  if (/breakage/.test(scenarios)) tested.push('Breakage');
  if (/no_assign|workflow.pipeline|jwt/.test(scenarios)) tested.push('WorkflowPipeline');
  if (/movement/.test(scenarios)) tested.push('Movement');
  return [...new Set(tested)];
}

function failedScenario(r) {
  const id = r.requirementId;
  if (id === 'C02-2.7-003') return 'GP-submit-NO_ASSIGN — HTTP 200 without UrUserAssignment';
  if (id === 'C04-4.2-001') return 'Cross-tenant Get Pass foreign/random ID → HTTP 500';
  if (id === 'C07-7.8-002') return 'Workflow pipeline read without assignment — 50 rows';
  if (id === 'C07-7.10-006') return 'Get Pass submit mutation without scope resolver';
  if (id === 'C08-8.5-001') return 'Assignment gate bypass on operational mutation';
  if (id === 'C08-8.6-002') return 'Stale JWT operational read after assignment delete';
  return (r.linkedScenarios || [])[0] || 'Linked runtime FAIL';
}

function failedEvidence(r) {
  const id = r.requirementId;
  const map = {
    'C02-2.7-003': 'GET_PASS_PERMISSION_MATRIX.json, NO_ASSIGN_CROSS_MODULE_MATRIX.json',
    'C04-4.2-001': 'GET_PASS_CROSS_TENANT_EXPANDED.json',
    'C07-7.8-002': 'WORKFLOW_PIPELINE_ASSIGNMENT_SCOPE_MATRIX.json',
    'C07-7.10-006': 'GET_PASS_PERMISSION_MATRIX.json',
    'C08-8.5-001': 'ASSIGNMENT_GATE_ROUTE_INVENTORY_FINAL.csv',
    'C08-8.6-002': 'STALE_FRESH_JWT_ASSIGNMENT_MATRIX.json',
  };
  return map[id] || 'Round 7 runtime matrices';
}

function govConflict(r) {
  const t = (r.requirement || '').toLowerCase();
  if (/gm|general manager/.test(t)) return 'Published GET_PASS workflow includes PENDING_GM step not in constitution chain';
  if (/get.?pass.*workflow|approval chain/.test(t)) return 'Global workflow v3 non-compliant — 20/20 tenants';
  if (/fast.?forward|creator|finance/.test(t)) return 'Finance/ORG_MANAGER creator fast-forward without approved BDR';
  if (/inherit|bootstrap|tenant/.test(t)) return 'New tenants inherit non-compliant GET_PASS template';
  if (/pin|version/.test(t)) return 'Active documents pinned to workflow versions with GM step';
  return 'Runtime configuration conflicts with constitution requirement text';
}

function govEvidence(r) {
  const t = (r.requirement || '').toLowerCase();
  if (/gm|workflow|chain|inherit|pin|tenant/.test(t)) return 'GET_PASS_WORKFLOW_ROLLOUT_AUDIT.json, PUBLISHED_WORKFLOW_VERSIONS.json';
  if (/finance|creator|org/.test(t)) return 'GET_PASS_CREATOR_FAST_FORWARD_AUTHORITY_AUDIT.json, GET_PASS_FINANCE_FAST_FORWARD_MATRIX_FINAL.json';
  return 'CONSTITUTION_REQUIREMENT_TEST_LINKS.json heuristic';
}

function main() {
  const links = JSON.parse(fs.readFileSync(LINKS, 'utf8'));
  const all = links.requirementLinks || [];
  const failed = all.filter((r) => r.finalStatus === 'Failed Runtime');
  const conflicts = all.filter((r) => r.finalStatus === 'Governance Conflict');
  const partial = all.filter((r) => r.finalStatus === 'Partial');
  const runtimeComplete = all.filter((r) => r.finalStatus === 'Runtime Verified Complete');

  const failedTable = failed.map((r) => ({
    requirementId: r.requirementId,
    requirement: r.requirement,
    failedScenario: failedScenario(r),
    runtimeEvidence: failedEvidence(r),
    affectedModules: inferModules(r.requirement),
  }));

  const govTable = conflicts.map((r) => ({
    requirementId: r.requirementId,
    rule: r.requirement,
    conflict: govConflict(r),
    evidence: govEvidence(r),
  }));

  const partialTable = partial.map((r) => {
    const applicable = inferModules(r.requirement);
    const tested = testedModules(r);
    const missing = applicable.filter((m) => !tested.includes(m));
    return {
      requirementId: r.requirementId,
      requirement: r.requirement,
      applicableModules: applicable,
      modulesTested: tested,
      modulesMissing: missing,
      testScenariosMissing: missing.length
        ? missing.map((m) => `${m} E2E not linked to requirement ID`)
        : ['Additional scenarios within tested modules'],
      linkedScenarios: r.linkedScenarios || [],
    };
  });

  const zeroAnalysis = {
    executedAt: new Date().toISOString(),
    runtimeVerifiedCompleteCount: runtimeComplete.length,
    conclusion:
      runtimeComplete.length === 0
        ? 'Generator does not promote any requirement to Runtime Verified Complete — no requirement has full multi-module runtime proof for all applicable modules'
        : 'Some requirements promoted',
    reasons: [
      'Upgrade rule requires all applicable modules tested and PASS — most requirements map to multiple modules but harness links single-module probes only',
      'Partial requirements retain Partial status even when one module PASS (e.g. GRN only) because GetPass/Transfer/IC gaps remain on same ID',
      'Failed Runtime and Governance Conflict IDs block promotion of related requirements',
    ],
    partialCount: partial.length,
    notRunCount: all.filter((r) => r.finalStatus === 'Not Run').length,
    upgradeEligibleNone: partial.filter((p) => p.modulesMissing?.length === 0).length,
  };

  fs.writeFileSync(OUT_FAILED, JSON.stringify({ executedAt: new Date().toISOString(), count: failedTable.length, rows: failedTable }, null, 2));
  fs.writeFileSync(OUT_GOV, JSON.stringify({ executedAt: new Date().toISOString(), count: govTable.length, rows: govTable }, null, 2));
  fs.writeFileSync(OUT_PARTIAL, JSON.stringify({ executedAt: new Date().toISOString(), count: partialTable.length, rows: partialTable }, null, 2));
  fs.writeFileSync(OUT_ZERO, JSON.stringify(zeroAnalysis, null, 2));
  console.log('Wrote constitution Round 7 artifacts', failedTable.length, govTable.length, partialTable.length);
}

main();
