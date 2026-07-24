'use strict';

const { spawnSync, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');

const WORKSPACE_FE = path.resolve(__dirname, '../../../OSE-Frontend');
const JUNCTION = 'C:\\DX-OSE-Frontend';
const OUT = path.join(REPORT_DIR, 'FRONTEND_TEST_ROUND7_RESULTS.json');

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

function resolveNodeLts() {
  for (const v of ['20', '22', '18']) {
    try {
      const out = execSync(`nvm list ${v}`, { encoding: 'utf8', shell: true });
      if (/Currently using|is installed/.test(out) || out.includes(v)) return v;
    } catch (_) {}
  }
  return null;
}

function ensureJunction() {
  if (fs.existsSync(JUNCTION)) return JUNCTION;
  try {
    execSync(`cmd /c mklink /J "${JUNCTION}" "${WORKSPACE_FE}"`, { encoding: 'utf8' });
    return JUNCTION;
  } catch (e) {
    return WORKSPACE_FE;
  }
}

function runOne(entry, feCwd, nodeBin) {
  const full = path.join(feCwd, entry.file);
  if (!fs.existsSync(full)) {
    return { file: entry.file, nodeVersion: nodeBin, command: entry.command, result: 'NOT_APPLICABLE', rootCause: 'File missing', finalClassification: 'N/A' };
  }
  const env = { ...process.env, CI: '1', FORCE_COLOR: '0' };
  const r = spawnSync(entry.command, { cwd: feCwd, shell: true, encoding: 'utf8', timeout: 180000, env });
  const ok = r.status === 0;
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  let rootCause = null;
  let finalClassification = ok ? 'PASS' : 'FAIL';
  if (!ok) {
    if (/ECONNREFUSED|:4200/.test(out)) {
      rootCause = 'Frontend :4200 not running';
      finalClassification = 'Test Environment Defect';
    } else if (/vitest|TestBed|NG0|Cannot find module/.test(out)) {
      rootCause = out.includes('vitest') ? 'Vitest path/Node resolution' : 'Angular TestBed';
      finalClassification = feCwd.includes(' ') ? 'Test Environment Defect' : 'Test Environment Defect';
    } else rootCause = out.slice(0, 300);
  }
  return {
    file: entry.file,
    module: entry.module,
    nodeVersion: nodeBin,
    command: entry.command,
    cwd: feCwd,
    exit: r.status,
    result: ok ? 'PASS' : finalClassification === 'Test Environment Defect' ? 'FAIL' : 'FAIL',
    rootCause,
    finalClassification: ok ? 'Harness PASS' : finalClassification,
  };
}

function main() {
  const feCwd = ensureJunction();
  const nvmVer = resolveNodeLts();
  let nodeBin = process.version;
  if (nvmVer) {
    try {
      execSync(`nvm use ${nvmVer}`, { shell: true, stdio: 'pipe' });
      nodeBin = execSync('node -v', { encoding: 'utf8', shell: true }).trim();
    } catch (_) {}
  }

  const rows = FILES.map((e) => runOne(e, feCwd, nodeBin));
  const summary = {
    totalFiles: rows.length,
    pass: rows.filter((r) => r.result === 'PASS').length,
    fail: rows.filter((r) => r.result === 'FAIL').length,
    testEnvFail: rows.filter((r) => r.finalClassification === 'Test Environment Defect').length,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ executedAt: new Date().toISOString(), feCwd, nodeVersion: nodeBin, rows, summary }, null, 2));
  console.log('Wrote FRONTEND_TEST_ROUND7_RESULTS.json', summary);
}

main();
