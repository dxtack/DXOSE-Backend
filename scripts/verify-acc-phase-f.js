'use strict';

/**
 * ACC Authority Phase F — legacy retirement static verification.
 * Run: node scripts/verify-acc-phase-f.js
 */

const fs = require('fs');
const path = require('path');
const { PERMISSIONS } = require('../src/acc-authority/runtime-permission-matrix');
const { DEPT_MANAGER_STRIPPED_PERMISSIONS, buildRolePermissionMap } = require('../src/acc-authority/base-role-permissions');
const { getPermissionsForRole } = require('../src/middleware/authorize');
const { mergeWithOperationalMatrix } = require('../src/services/rbac.service');
const accRuntime = require('../src/acc-runtime');

let passed = 0;
let failed = 0;

const assert = (label, ok) => {
  if (ok) {
    console.log(`  OK  ${label}`);
    passed += 1;
  } else {
    console.error(`  FAIL  ${label}`);
    failed += 1;
  }
};

console.log('\nACC Phase F — Legacy Retirement Verification\n');

console.log('[1] Constitution-derived runtime matrix');
assert('PERMISSIONS object populated', Object.keys(PERMISSIONS).length >= 60);
assert('TRANSFER_APPROVE includes DEPT_MANAGER', PERMISSIONS.TRANSFER_APPROVE?.includes('DEPT_MANAGER'));
assert('WORKFLOW_PIPELINE_VIEW in matrix', Array.isArray(PERMISSIONS.WORKFLOW_PIPELINE_VIEW));

console.log('\n[2] DEPT_MANAGER policy via grants (not runtime strip only)');
const deptGrants = buildRolePermissionMap().DEPT_MANAGER || [];
assert(
  'DEPT_MANAGER seed excludes MOVEMENTS_VIEW',
  !deptGrants.includes('MOVEMENTS_VIEW'),
);
assert(
  'DEPT_MANAGER seed excludes GRN_VIEW',
  !deptGrants.includes('GRN_VIEW'),
);
for (const code of DEPT_MANAGER_STRIPPED_PERMISSIONS) {
  assert(`stripped ${code} absent from dept grants`, !deptGrants.includes(code));
}
assert(
  'getPermissionsForRole(DEPT_MANAGER) excludes MOVEMENTS_VIEW',
  !getPermissionsForRole('DEPT_MANAGER').includes('MOVEMENTS_VIEW'),
);

console.log('\n[3] mergeWithOperationalMatrix retired (policy filter only)');
const union = mergeWithOperationalMatrix('DEPT_MANAGER', ['TRANSFER_VIEW']);
assert(
  'mergeWithOperationalMatrix no longer unions matrix bundle',
  union.length === 1 && union[0] === 'TRANSFER_VIEW',
);

console.log('\n[4] Phase F feature flags');
assert('accLegacyDualWrite default false', accRuntime.isAccLegacyDualWriteEnabled() === false);
assert(
  'accLegacyDualWrite in status payload',
  accRuntime.getAccFeatureFlagStatus().accLegacyDualWrite === false,
);

console.log('\n[5] Source wiring');
const authorizeSrc = fs.readFileSync(
  path.join(__dirname, '../src/middleware/authorize.js'),
  'utf8',
);
assert('authorize imports runtime-permission-matrix', authorizeSrc.includes('runtime-permission-matrix'));

const seedSrc = fs.readFileSync(
  path.join(__dirname, 'seed-acc-authority-catalog.js'),
  'utf8',
);
assert('seed imports base-role-permissions', seedSrc.includes('base-role-permissions'));

console.log(failed === 0 ? `\nPhase F verification passed (${passed} checks).\n` : `\n${failed} failed.\n`);
process.exit(failed > 0 ? 1 : 0);
