'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPORT_DIR, HOTEL_A } = require('./lib/constants');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.resolve(__dirname, '../../../OSE-Frontend');
const GOV_INT_TENANT = HOTEL_A.id;

function runCmd(label, cmd, args, cwd, env = {}) {
  const started = Date.now();
  const res = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const out = (res.stdout || '') + (res.stderr || '');
  const passed = (out.match(/\bpass(ed)?\b/gi) || []).length;
  const failed = (out.match(/\bfail(ed)?\b/gi) || []).length;
  const skipped = (out.match(/\bskip(ped)?\b/gi) || []).length;
  return {
    command: `${cmd} ${args.join(' ')}`,
    label,
    environment: cwd,
    exit: res.status ?? 1,
    passed: res.status === 0 ? 'PASS' : null,
    failed: res.status !== 0 ? 'FAIL' : null,
    skipped,
    durationMs: Date.now() - started,
    exactFailure: res.status !== 0 ? out.split('\n').slice(-15).join('\n') : null,
    outputTail: out.split('\n').slice(-8).join('\n'),
  };
}

function installFrontendLockfileDeps() {
  const feRoot = FRONTEND_ROOT;
  const res = spawnSync('npm', ['install', '--no-audit', '--no-fund'], {
    cwd: feRoot,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    command: 'npm install --no-audit --no-fund',
    label: 'frontend_lockfile_install',
    exit: res.status ?? 1,
    outputTail: ((res.stdout || '') + (res.stderr || '')).split('\n').slice(-8).join('\n'),
  };
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const results = [];
  results.push(installFrontendLockfileDeps());

  results.push(
    runCmd(
      'backend_unit_tests',
      process.execPath,
      ['--test', 'src/**/*.test.js', 'scripts/**/*.test.js'],
      BACKEND_ROOT,
    ),
  );
  results.push(
    runCmd(
      'step_permission_enforcement',
      process.execPath,
      ['--test', 'src/acc-authority/step-permission-enforcement.test.js'],
      BACKEND_ROOT,
    ),
  );
  results.push(
    runCmd('verify_acc_p30', process.execPath, ['scripts/verify-acc-p30-zero-legacy.js'], BACKEND_ROOT),
  );
  results.push(
    runCmd('smoke_governance_static', process.execPath, ['scripts/run-governance-static-smokes.js'], BACKEND_ROOT),
  );
  results.push(
    runCmd(
      'governance_integration',
      process.execPath,
      ['scripts/run-governance-integration.js'],
      BACKEND_ROOT,
      { GOVERNED_INTEGRATION_TENANT_ID: GOV_INT_TENANT },
    ),
  );
  results.push(
    runCmd(
      'reporting_final_regression',
      process.execPath,
      ['scripts/smoke-reporting-final-regression.js'],
      BACKEND_ROOT,
    ),
  );
  results.push(
    runCmd(
      'grn_timeline_db_integration',
      process.execPath,
      ['--test', 'scripts/grn-timeline-db-integration.test.js'],
      BACKEND_ROOT,
    ),
  );
  results.push(
    runCmd(
      'frontend_build',
      process.execPath,
      [path.join(FRONTEND_ROOT, 'node_modules/@angular/cli/bin/ng.js'), 'build'],
      FRONTEND_ROOT,
    ),
  );
  results.push(
    runCmd(
      'frontend_unit_headless',
      process.execPath,
      [
        path.join(FRONTEND_ROOT, 'node_modules/@angular/cli/bin/ng.js'),
        'test',
        '--watch=false',
        '--browsers=ChromeHeadless',
      ],
      FRONTEND_ROOT,
    ),
  );

  fs.writeFileSync(path.join(REPORT_DIR, 'TEST_EXECUTION_RESULTS.json'), JSON.stringify({ executedAt: new Date().toISOString(), results }, null, 2));
  fs.writeFileSync(
    path.join(REPORT_DIR, 'FRONTEND_TEST_RESULTS.json'),
    JSON.stringify({ results: results.filter((r) => /frontend/i.test(r.label)) }, null, 2),
  );
  fs.writeFileSync(
    path.join(REPORT_DIR, 'REPORTING_REGRESSION_RESULTS.json'),
    JSON.stringify({ results: results.filter((r) => /reporting/i.test(r.label)) }, null, 2),
  );
  fs.writeFileSync(
    path.join(REPORT_DIR, 'PLAYWRIGHT_RESULTS.json'),
    JSON.stringify({ note: 'Critical Playwright not configured in closeout harness — add e2e spec path when available', executed: false }, null, 2),
  );

  const md = results
    .map(
      (r) =>
        `| ${r.label} | ${r.environment} | ${r.exit} | ${r.passed || '—'} | ${r.failed || '—'} | ${r.skipped || '—'} | ${(r.exactFailure || '—').replace(/\|/g, '/').slice(0, 120)} |`,
    )
    .join('\n');
  fs.writeFileSync(
    path.join(REPORT_DIR, 'TEST_EXECUTION_RESULTS.md'),
    `# Test Execution Results\n\n| Command | Environment | Exit | Passed | Failed | Skipped | Exact failure |\n|---------|-------------|-----:|--------|--------|---------|---------------|\n${md}\n`,
  );
  console.log('Wrote TEST_EXECUTION_RESULTS');
}

main();
