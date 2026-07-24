'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { REPORT_DIR } = require('./lib/constants');

const FE = path.resolve(__dirname, '../../../OSE-Frontend');
const OUT = path.join(REPORT_DIR, 'FRONTEND_TEST_INVENTORY_CLASSIFICATION.json');

const SCRIPTS = [
  { file: 'scripts/verify-grn-create-runtime.mjs', module: 'GRN', purpose: 'GRN create page runtime DOM' },
  { file: 'scripts/verify-grn-detail-timeline-phase4.mjs', module: 'GRN', purpose: 'GRN detail timeline vs API' },
  { file: 'scripts/verify-grn-create-excel-layout.mjs', module: 'GRN', purpose: 'GRN excel layout' },
  { file: 'scripts/verify-phase5-detail-timeline.mjs', module: 'Transfer', purpose: 'Transfer detail timeline' },
  { file: 'scripts/verify-phase6-detail-timeline.mjs', module: 'Breakage/Lost', purpose: 'Returns timeline phase6' },
  { file: 'scripts/verify-phase7-detail-timeline.mjs', module: 'GetPass', purpose: 'Get Pass timeline phase7' },
  { file: 'scripts/measure-inventory-count-workspace-spacing.mjs', module: 'InventoryCount', purpose: 'IC workspace spacing' },
  { file: 'scripts/measure-inventory-count-detail-spacing.mjs', module: 'InventoryCount', purpose: 'IC detail spacing' },
  { file: 'scripts/capture-acc-overview-screenshot.mjs', module: 'ACC', purpose: 'ACC overview screenshot' },
];

const SPECS = [
  'src/app/features/grn/utils/grn-detail-timeline.util.spec.ts',
  'src/app/shared/utils/timeline-entry-render.util.spec.ts',
  'src/app/features/get-pass/utils/get-pass-list-display.util.spec.ts',
  'src/app/features/get-pass/utils/get-pass-line-outcome.util.spec.ts',
  'src/app/core/directives/has-permission.directive.spec.ts',
  'src/app/features/get-pass/utils/get-pass-return-validation.spec.ts',
  'src/app/app.spec.ts',
  'src/app/features/grn/grn-detail/grn-detail.component.spec.ts',
  'src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.spec.ts',
];

function runNode(rel, timeoutMs = 90000) {
  const started = Date.now();
  const res = spawnSync(process.execPath, [path.join(FE, rel)], {
    cwd: FE,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: { ...process.env, OSE_BASE_URL: 'http://127.0.0.1:4200', OSE_API_URL: 'http://127.0.0.1:4000/api' },
  });
  return { exit: res.status ?? 1, durationMs: Date.now() - started, tail: ((res.stdout || '') + (res.stderr || '')).slice(-500) };
}

async function main() {
  const rows = [];
  for (const s of SCRIPTS) {
    const exists = fs.existsSync(path.join(FE, s.file));
    let executed = false;
    let result = 'NOT_RUN';
    let exit = null;
    if (exists && /verify-grn-create|verify-grn-detail-timeline-phase4|verify-phase7/.test(s.file)) {
      const r = runNode(s.file);
      executed = true;
      exit = r.exit;
      result = r.exit === 0 ? 'PASS' : 'FAIL';
    } else if (exists) {
      result = 'NOT_RUN';
    } else {
      result = 'MISSING';
    }
    rows.push({
      file: s.file,
      purpose: s.purpose,
      activeModule: s.module,
      requiresData: true,
      safeToRun: exists,
      executed,
      exit,
      result,
      obsolete: false,
    });
  }
  for (const spec of SPECS) {
    const vitest = spawnSync(process.execPath, [path.join(FE, 'node_modules/vitest/vitest.mjs'), 'run', spec], {
      cwd: FE,
      encoding: 'utf8',
      timeout: 60000,
    });
    rows.push({
      file: spec,
      purpose: 'Unit spec',
      activeModule: spec.includes('get-pass') ? 'GetPass' : spec.includes('grn') ? 'GRN' : 'Shared',
      requiresData: false,
      safeToRun: true,
      executed: true,
      exit: vitest.status ?? 1,
      result: vitest.status === 0 ? 'PASS' : 'FAIL',
      obsolete: false,
    });
  }

  const out = {
    executedAt: new Date().toISOString(),
    nodeVersion: process.version,
    note: 'Playwright scripts require frontend :4200 and backend :4000',
    rows,
    summary: {
      totalFiles: rows.length,
      executed: rows.filter((r) => r.executed).length,
      pass: rows.filter((r) => r.result === 'PASS').length,
      fail: rows.filter((r) => r.result === 'FAIL').length,
      notRun: rows.filter((r) => r.result === 'NOT_RUN').length,
    },
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote FRONTEND_TEST_INVENTORY_CLASSIFICATION.json', out.summary);
}

main();
