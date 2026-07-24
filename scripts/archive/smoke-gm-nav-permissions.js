'use strict';

/**
 * Static check: GENERAL_MANAGER absent from operational PERMISSIONS rows in authorize.js.
 * Run: node scripts/smoke-gm-nav-permissions.js
 */

const { PERMISSIONS } = require('../src/middleware/authorize');

const GM = 'GENERAL_MANAGER';
const OPERATIONAL = [
    'BASIC_DATA_VIEW',
    'INVENTORY_VIEW',
    'TRANSFER_VIEW',
    'GRN_VIEW',
    'STOCK_COUNT_VIEW',
    'GET_PASS_VIEW',
    'LOST_ITEMS_VIEW',
    'BREAKAGE_VIEW',
    'READ_BREAKAGE',
    'READ_LOST',
    'PERIOD_CLOSE_MANAGE',
    'INTEGRITY_VIEW',
];

let fail = 0;
for (const key of OPERATIONAL) {
    const roles = PERMISSIONS[key] || [];
    if (roles.includes(GM)) {
        console.error(`FAIL: ${key} still includes GENERAL_MANAGER`);
        fail += 1;
    }
}

const MUST_HAVE = ['APPROVE_BREAKAGE', 'APPROVE_LOST', 'VIEW_DASHBOARD', 'REPORTS_VIEW'];
for (const key of MUST_HAVE) {
    const roles = PERMISSIONS[key] || [];
    if (!roles.includes(GM)) {
        console.error(`FAIL: ${key} missing GENERAL_MANAGER`);
        fail += 1;
    }
}

if (fail === 0) {
    console.log('OK: GM nav permission matrix (authorize.js static)');
}
process.exit(fail > 0 ? 1 : 0);
