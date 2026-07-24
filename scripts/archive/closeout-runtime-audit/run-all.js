'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPORT_DIR } = require('./lib/constants');

const SCRIPTS = [
  '00-seed-test-identities.js',
  '00a-dept-stock-fixtures.js',
  '00b-published-workflow-versions.js',
  '00d-hierarchy-rollback-proof.js',
  '00e-disposable-org-fixture.js',
  '01-discover-environment.js',
  '12-no-assign-investigation.js',
  '12b-get-pass-workflow-config-audit.js',
  '12c-cross-tenant-getpass-investigation.js',
  '13-no-assign-cross-module.js',
  '13b-get-pass-workflow-rollout-audit.js',
  '13d-get-pass-not-found-consistency.js',
  '14-constitution-aligned-gp-workflow.js',
  '02-acc-operational-legacy.js',
  '03-get-pass-permission-matrix.js',
  '04-role-resource-scope.js',
  '05-cross-tenant.js',
  '06-workflow-runtime.js',
  '09-grn-runtime.js',
  '10-transfer-runtime.js',
  '11-inventory-count-runtime.js',
  '08-test-execution.js',
  '07-constitution-mapping.js',
];

const HARNESS_GLOBS = [
  'ACC_OPERATIONAL_LEGACY_HARNESS.json',
  'GET_PASS_PERMISSION_HARNESS.json',
  'ROLE_RESOURCE_SCOPE_HARNESS.json',
  'CROSS_TENANT_HARNESS.json',
  'CROSS_TENANT_GETPASS_HARNESS.json',
  'WORKFLOW_RUNTIME_HARNESS.json',
  'GRN_RUNTIME_HARNESS.json',
  'TRANSFER_RUNTIME_HARNESS.json',
  'INVENTORY_COUNT_RUNTIME_HARNESS.json',
  'NO_ASSIGN_INVESTIGATION_HARNESS.json',
];

function run(script) {
  console.log('\n==========', script, '==========');
  const res = spawnSync(process.execPath, [path.join(__dirname, script)], {
    stdio: 'inherit',
    env: process.env,
  });
  return { script, exit: res.status ?? 1 };
}

function readJson(name) {
  const p = path.join(REPORT_DIR, name);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function aggregateHarness() {
  const summaries = [];
  let harnessFailed = false;
  for (const g of HARNESS_GLOBS) {
    const data = readJson(g);
    if (!data) continue;
    summaries.push(data);
    if (data.harnessExit !== 0) harnessFailed = true;
  }
  return { summaries, harnessFailed };
}

function buildUnexecuted(outcomes, summaries) {
  const lines = [];
  for (const o of outcomes.filter((x) => x.exit !== 0)) {
    lines.push(`- Script **${o.script}** exited ${o.exit} (harness infrastructure — not system PASS)`);
  }
  for (const s of summaries) {
    if (s.counts?.NOT_EXECUTED > 0) lines.push(`- ${s.script}: ${s.counts.NOT_EXECUTED} NOT_EXECUTED scenarios`);
    if (s.counts?.BLOCKED > 0) lines.push(`- ${s.script}: ${s.counts.BLOCKED} BLOCKED scenarios`);
    if (s.counts?.FAIL > 0) lines.push(`- ${s.script}: ${s.counts.FAIL} FAIL scenarios`);
    if (s.missingFixtures?.length) lines.push(`- ${s.script}: missing fixtures ${s.missingFixtures.join(', ')}`);
    if (s.missingIdentities?.length) lines.push(`- ${s.script}: missing identities ${s.missingIdentities.join(', ')}`);
  }
  const md = `# Unexecuted / Incomplete Runtime Tests\n\nGenerated: ${new Date().toISOString()}\n\nExit code 0 means the harness script finished — **not** that the system passed.\n\n${lines.length ? lines.join('\n') : 'All required harness scripts completed; review per-scenario FAIL/BLOCKED in harness JSON files.'}\n`;
  fs.writeFileSync(path.join(REPORT_DIR, 'UNEXECUTED_TESTS.md'), md);
}

function buildDefectClassification() {
  const gp = readJson('GET_PASS_PERMISSION_MATRIX.json');
  const xt = readJson('CROSS_TENANT_RESULTS.json');
  const tests = readJson('TEST_EXECUTION_RESULTS.json');
  const gpff = readJson('GET_PASS_FAST_FORWARD_MATRIX.json');

  const sections = {
    productRuntime: [],
    governance: [],
    testHarness: [],
    testEnvironment: [],
    goldenBaselineDrift: [],
  };

  for (const row of gp?.matrix || []) {
    if (row.result === 'FAIL' && row.note === 'AUTHORIZATION_BYPASS') {
      sections.productRuntime.push({ id: `GP-PERM-${row.endpoint}-${row.userKey}`, evidence: row });
    }
    if (row.result === 'FAIL' && row.note === 'WRONG_LIFECYCLE_NOT_PERMISSION_PROOF') {
      sections.testHarness.push({ id: `GP-PERM-HARNESS-${row.endpoint}`, evidence: row });
    }
    if (row.result === 'FAIL' && row.note === 'UNEXPECTED_500') {
      sections.productRuntime.push({ id: `GP-PERM-500-${row.endpoint}-${row.userKey}`, evidence: row });
    }
  }

  for (const row of xt?.results || []) {
    if (row.leak && String(row.leak).startsWith('P0')) {
      sections.productRuntime.push({ id: `XT-${row.resource}-${row.direction}`, evidence: row });
    }
    if (row.leak === 'UNEXPECTED_500') {
      sections.productRuntime.push({ id: `XT-500-${row.resource}-${row.direction}`, evidence: row });
    }
  }

  for (const row of gpff?.rows || []) {
    if (row.classification === 'CONFIRMED_WORKFLOW_DEFECT_CANDIDATE') {
      sections.governance.push({ id: `GP-FF-${row.userKey}`, evidence: row });
    }
    if (row.environmentStaleWorkflow) {
      sections.testEnvironment.push({ id: `GP-FF-STALE-${row.userKey}`, note: 'STALE_WORKFLOW_CONFIGURATION' });
    }
  }

  for (const t of tests?.results || []) {
    if (t.label === 'reporting_final_regression' && t.exit !== 0) {
      sections.goldenBaselineDrift.push({ id: 'REPORTING-WIDTH', evidence: t.exactFailure });
    }
    if (t.label === 'frontend_unit_headless' && t.exit !== 0 && /browser-playwright/i.test(t.exactFailure || '')) {
      sections.testEnvironment.push({ id: 'FE-VITEST-BROWSER', evidence: t.exactFailure });
    }
    if (t.label === 'backend_unit_tests' && t.exit !== 0) {
      sections.testHarness.push({ id: 'BACKEND-UNIT', evidence: t.exactFailure });
    }
  }

  let md = `# Defect Classification\n\nGenerated: ${new Date().toISOString()}\n\n`;
  for (const [key, title] of [
    ['productRuntime', 'Product Runtime Defects'],
    ['governance', 'Governance / Constitution Defects'],
    ['testHarness', 'Test Harness Defects'],
    ['testEnvironment', 'Test Environment Defects'],
    ['goldenBaselineDrift', 'Expected Golden Baseline Drift'],
  ]) {
    md += `\n## ${title}\n\n`;
    if (!sections[key].length) md += '_None recorded in this run._\n';
    else md += sections[key].map((d) => `- **${d.id}**${d.note ? `: ${d.note}` : ''}`).join('\n') + '\n';
  }
  fs.writeFileSync(path.join(REPORT_DIR, 'DEFECT_CLASSIFICATION.md'), md);
}

function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const outcomes = SCRIPTS.map(run);
  const { summaries, harnessFailed } = aggregateHarness();
  buildUnexecuted(outcomes, summaries);
  buildDefectClassification();

  const scriptFailed = outcomes.some((o) => o.exit !== 0);
  const statusPath = path.join(REPORT_DIR, 'RUN_ALL_SUMMARY.json');
  fs.writeFileSync(
    statusPath,
    JSON.stringify(
      {
        executedAt: new Date().toISOString(),
        scriptOutcomes: outcomes,
        harnessSummaries: summaries,
        harnessExit: scriptFailed || harnessFailed ? 1 : 0,
        note: 'Exit 0 = all scripts finished with no FAIL/BLOCKED/NOT_EXECUTED/missing fixture/identity. Not system PASS.',
      },
      null,
      2,
    ),
  );

  if (scriptFailed || harnessFailed) {
    console.error('\nrun-all: non-zero — see UNEXECUTED_TESTS.md and harness JSON (Exit 0 ≠ system PASS)');
    process.exit(1);
  }
  console.log('\nrun-all: harness completed without FAIL/BLOCKED/NOT_EXECUTED gaps');
}

main();
