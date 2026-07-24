'use strict';

/**
 * Static check: DEPT_MANAGER excluded from register/GRN nav permissions; operational roles retain them.
 * Run: node scripts/smoke-dept-manager-nav-rbac.js
 */

const { PERMISSIONS, getPermissionsForRole } = require('../src/middleware/authorize');

const DEPT = 'DEPT_MANAGER';
const HIDDEN_FROM_DEPT = [
    'MOVEMENTS_VIEW',
    'LEDGER_VIEW',
    'INVENTORY_HISTORY_VIEW',
    'GRN_VIEW',
];
const DEPT_MUST_HAVE = ['INVENTORY_VIEW', 'TRANSFER_VIEW', 'TRANSFER_CREATE', 'VIEW_DASHBOARD'];

let fail = 0;

for (const key of HIDDEN_FROM_DEPT) {
    const roles = PERMISSIONS[key] || [];
    if (roles.includes(DEPT)) {
        console.error(`FAIL: ${key} still includes DEPT_MANAGER`);
        fail += 1;
    }
}

for (const key of DEPT_MUST_HAVE) {
    const roles = PERMISSIONS[key] || [];
    if (!roles.includes(DEPT)) {
        console.error(`FAIL: ${key} missing DEPT_MANAGER`);
        fail += 1;
    }
}

const deptJwt = getPermissionsForRole(DEPT);
for (const key of HIDDEN_FROM_DEPT) {
    if (deptJwt.includes(key)) {
        console.error(`FAIL: getPermissionsForRole(DEPT_MANAGER) includes ${key}`);
        fail += 1;
    }
}
if (!deptJwt.includes('TRANSFER_CREATE')) {
    console.error('FAIL: DEPT_MANAGER missing TRANSFER_CREATE in static fallback');
    fail += 1;
}

const financeJwt = getPermissionsForRole('FINANCE_MANAGER');
for (const key of ['MOVEMENTS_VIEW', 'LEDGER_VIEW', 'INVENTORY_HISTORY_VIEW', 'GRN_VIEW']) {
    if (!financeJwt.includes(key)) {
        console.error(`FAIL: FINANCE_MANAGER missing ${key} in static fallback`);
        fail += 1;
    }
}

if (fail === 0) {
    console.log('OK: dept manager nav permission matrix (authorize.js static)');
}
process.exit(fail > 0 ? 1 : 0);
