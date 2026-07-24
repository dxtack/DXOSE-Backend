'use strict';

const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

const LINKS = path.join(REPORT_DIR, 'CONSTITUTION_REQUIREMENT_TEST_LINKS.json');
const MATRIX = path.resolve(__dirname, '../../Governance/CONSTITUTION_TRACEABILITY_MATRIX.md');

function main() {
  const links = JSON.parse(fs.readFileSync(LINKS, 'utf8'));
  const failed = links.requirementLinks.filter((r) => r.finalStatus === 'Failed Runtime');
  const conflicts = links.requirementLinks.filter((r) => r.finalStatus === 'Governance Conflict');
  const partial = links.requirementLinks.filter((r) => r.finalStatus === 'Partial');
  const notRun = links.requirementLinks.filter((r) => r.finalStatus === 'Not Run');
  const runtimeComplete = links.requirementLinks.filter((r) => r.finalStatus === 'Runtime Verified Complete');

  const failedRuntime = {
    executedAt: new Date().toISOString(),
    count: failed.length,
    ids: failed.map((r) => ({
      requirementId: r.requirementId,
      requirement: r.requirement,
      reason: inferFailedReason(r),
      evidence: r.linkedScenarios,
    })),
    scenarioAnchors: [
      { scenarioId: 'GP-submit-NO_ASSIGN-disposable', evidence: 'GET_PASS_PERMISSION_MATRIX.json — HTTP 200 submit without assignment' },
      { scenarioId: 'CROSS_TENANT_GP_500', evidence: 'GET_PASS_CROSS_TENANT_ACTION_MATRIX.json — HTTP 500 on foreign ID' },
      { scenarioId: 'NO_ASSIGN_SUBMIT', evidence: 'NO_ASSIGN_CROSS_MODULE_MATRIX.json — cross-module mutations without assignment' },
    ],
  };

  const governanceConflict = {
    executedAt: new Date().toISOString(),
    count: conflicts.length,
    ids: conflicts.slice(0, 15).map((r) => ({
      requirementId: r.requirementId,
      requirement: r.requirement,
      conflict: inferConflict(r),
    })),
    anchors: [
      { topic: 'Get Pass GM step in global workflow', evidence: 'GET_PASS_WORKFLOW_ROLLOUT_AUDIT.json — 20/20 tenants PENDING_GM' },
      { topic: 'Finance creator fast-forward without BDR', evidence: 'GET_PASS_CREATOR_FAST_FORWARD_AUTHORITY_AUDIT.json' },
    ],
  };

  const coverageGaps = {
    executedAt: new Date().toISOString(),
    runtimeVerifiedCompleteCount: runtimeComplete.length,
    whyZeroRuntimeComplete:
      'No requirement has multi-module runtime proof linked end-to-end; harness marks workflow/permission requirements Partial until full module coverage per requirement ID',
    partialCount: partial.length,
    notRunCount: notRun.length,
    gapsByModule: buildModuleGaps(partial, notRun),
    upgradeBlockers: [
      'Get Pass permission grid incomplete for logistics/settlement endpoints',
      'GRN/Transfer/Inventory Count E2E not mapped 1:1 to constitution requirement IDs',
      'Scope matrix covers list/read only — create/update/workflow actions not in 226 scenarios',
    ],
    requirements: links.requirementLinks.map((r) => ({
      requirementId: r.requirementId,
      finalStatus: r.finalStatus,
      linkedScenarios: r.linkedScenarios,
      upgradeEligible: r.finalStatus === 'Partial' && (r.linkedScenarios?.length || 0) > 0,
    })),
  };

  fs.writeFileSync(path.join(REPORT_DIR, 'FAILED_RUNTIME_REQUIREMENTS.json'), JSON.stringify(failedRuntime, null, 2));
  fs.writeFileSync(path.join(REPORT_DIR, 'GOVERNANCE_CONFLICT_REQUIREMENTS.json'), JSON.stringify(governanceConflict, null, 2));
  fs.writeFileSync(path.join(REPORT_DIR, 'CONSTITUTION_REQUIREMENT_COVERAGE_GAPS.json'), JSON.stringify(coverageGaps, null, 2));
  console.log('Wrote constitution gap artifacts', failed.length, conflicts.length);
}

function inferFailedReason(r) {
  const t = `${r.requirement} ${r.requirementId}`.toLowerCase();
  if (/get.?pass/.test(t) && /submit|assignment|permission/.test(t)) return 'Get Pass submit bypasses assignment gate';
  if (/tenant|isolation|cross/.test(t)) return 'Cross-tenant Get Pass returns HTTP 500';
  return 'Runtime probe FAIL linked heuristically';
}

function inferConflict(r) {
  const t = `${r.requirement}`.toLowerCase();
  if (/workflow|approv|gm/.test(t)) return 'Published workflow includes PENDING_GM vs constitution chain';
  if (/get.?pass/.test(t)) return 'Workflow or fast-forward behavior lacks approved governance decision';
  return 'Governance document vs runtime configuration mismatch';
}

function buildModuleGaps(partial, notRun) {
  const mods = {};
  for (const r of [...partial, ...notRun]) {
    const m = (r.requirement || '').split(' ')[0] || 'unknown';
    mods[m] = (mods[m] || 0) + 1;
  }
  return mods;
}

main();
