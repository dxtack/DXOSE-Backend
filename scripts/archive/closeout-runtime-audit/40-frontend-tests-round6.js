'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

const FE = path.resolve(__dirname, '../../../OSE-Frontend');
const OUT = path.join(REPORT_DIR, 'FRONTEND_TEST_ROUND6_RESULTS.json');

const FILES = [
  { file: 'scripts/verify-grn-create-runtime.mjs', module: 'GRN', type: 'playwright', command: 'node scripts/verify-grn-create-runtime.mjs' },
  { file: 'scripts/verify-grn-detail-timeline-phase4.mjs', module: 'GRN', type: 'playwright', command: 'node scripts/verify-grn-detail-timeline-phase4.mjs' },
  { file: 'scripts/verify-grn-create-excel-layout.mjs', module: 'GRN', type: 'playwright', command: 'node scripts/verify-grn-create-excel-layout.mjs' },
  { file: 'scripts/verify-phase5-detail-timeline.mjs', module: 'Transfer', type: 'playwright', command: 'node scripts/verify-phase5-detail-timeline.mjs' },
  { file: 'scripts/verify-phase6-detail-timeline.mjs', module: 'Breakage/Lost', type: 'playwright', command: 'node scripts/verify-phase6-detail-timeline.mjs' },
  { file: 'scripts/verify-phase7-detail-timeline.mjs', module: 'GetPass', type: 'playwright', command: 'node scripts/verify-phase7-detail-timeline.mjs' },
  { file: 'scripts/measure-inventory-count-workspace-spacing.mjs', module: 'InventoryCount', type: 'measurement', command: 'node scripts/measure-inventory-count-workspace-spacing.mjs' },
  { file: 'scripts/measure-inventory-count-detail-spacing.mjs', module: 'InventoryCount', type: 'measurement', command: 'node scripts/measure-inventory-count-detail-spacing.mjs' },
  { file: 'scripts/capture-acc-overview-screenshot.mjs', module: 'ACC', type: 'screenshot', command: 'node scripts/capture-acc-overview-screenshot.mjs' },
  { file: 'src/app/features/grn/utils/grn-detail-timeline.util.spec.ts', module: 'GRN', type: 'vitest', command: 'npx vitest run src/app/features/grn/utils/grn-detail-timeline.util.spec.ts' },
  { file: 'src/app/shared/utils/timeline-entry-render.util.spec.ts', module: 'Shared', type: 'vitest', command: 'npx vitest run src/app/shared/utils/timeline-entry-render.util.spec.ts' },
  { file: 'src/app/features/get-pass/utils/get-pass-list-display.util.spec.ts', module: 'GetPass', type: 'vitest', command: 'npx vitest run src/app/features/get-pass/utils/get-pass-list-display.util.spec.ts' },
  { file: 'src/app/features/get-pass/utils/get-pass-line-outcome.util.spec.ts', module: 'GetPass', type: 'vitest', command: 'npx vitest run src/app/features/get-pass/utils/get-pass-line-outcome.util.spec.ts' },
  { file: 'src/app/core/directives/has-permission.directive.spec.ts', module: 'Shared', type: 'vitest', command: 'npx vitest run src/app/core/directives/has-permission.directive.spec.ts' },
  { file: 'src/app/features/get-pass/utils/get-pass-return-validation.spec.ts', module: 'GetPass', type: 'vitest', command: 'npx vitest run src/app/features/get-pass/utils/get-pass-return-validation.spec.ts' },
  { file: 'src/app/app.spec.ts', module: 'Shared', type: 'vitest', command: 'npx vitest run src/app/app.spec.ts' },
  { file: 'src/app/features/grn/grn-detail/grn-detail.component.spec.ts', module: 'GRN', type: 'vitest', command: 'npx vitest run src/app/features/grn/grn-detail/grn-detail.component.spec.ts' },
  { file: 'src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.spec.ts', module: 'Shared', type: 'vitest', command: 'npx vitest run src/app/shared/components/returns-workflow-timeline/returns-workflow-timeline.component.spec.ts' },
];

function runOne(entry) {
  const full = path.join(FE, entry.file);
  if (!fs.existsSync(full)) {
    return { ...entry, active: false, result: 'NOT_APPLICABLE', failureRootCause: 'File missing', productTestEnv: 'Environment' };
  }
  const r = spawnSync(entry.command, { cwd: FE, shell: true, encoding: 'utf8', timeout: 120000, env: { ...process.env, CI: '1' } });
  const ok = r.status === 0;
  let failureRootCause = null;
  let productTestEnv = 'Test';
  if (!ok) {
    const out = `${r.stdout}\n${r.stderr}`;
    if (/ECONNREFUSED|4200|frontend/i.test(out)) { failureRootCause = 'Frontend :4200 not reachable'; productTestEnv = 'Environment'; }
    else if (/TestBed|inject|NG0/i.test(out)) { failureRootCause = 'Angular TestBed harness / ng test config'; productTestEnv = 'Test'; }
    else failureRootCause = out.slice(0, 200);
  }
  return {
    file: entry.file,
    active: true,
    obsolete: false,
    module: entry.module,
    command: entry.command,
    exit: r.status,
    result: ok ? 'PASS' : entry.type === 'measurement' && r.status !== 0 ? 'NOT_APPLICABLE' : 'FAIL',
    failureRootCause,
    productTestEnv,
  };
}

function main() {
  const rows = FILES.map(runOne);
  const out = {
    executedAt: new Date().toISOString(),
    nodeVersion: process.version,
    rows,
    summary: {
      totalFiles: rows.length,
      executed: rows.filter((r) => r.exit != null).length,
      pass: rows.filter((r) => r.result === 'PASS').length,
      fail: rows.filter((r) => r.result === 'FAIL').length,
      notRun: rows.filter((r) => r.result === 'NOT_APPLICABLE').length,
    },
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log('Wrote FRONTEND_TEST_ROUND6_RESULTS.json', out.summary);
}

main();
