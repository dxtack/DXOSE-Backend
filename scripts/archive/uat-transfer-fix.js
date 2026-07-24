'use strict';

/**
 * UAT: TRANSFER_VIEW permission + transfer-history column contract + grouping totals.
 * Run: node scripts/uat-transfer-fix.js
 */

const { PERMISSIONS, getPermissionsForRole } = require('../src/middleware/authorize');
const { getReportColumns } = require('../src/services/report-column-contracts');
const { getGroupingSpec } = require('../src/services/report-family-registry');
const { buildGroupedReport } = require('../src/services/report-grouping.engine');

let pass = 0;
let fail = 0;

function assert(label, ok) {
    if (ok) {
        pass += 1;
        console.log(`  PASS  ${label}`);
    } else {
        fail += 1;
        console.error(`  FAIL  ${label}`);
    }
}

assert('TRANSFER_VIEW in matrix', Boolean(PERMISSIONS.TRANSFER_VIEW));
assert('STOREKEEPER has TRANSFER_VIEW', getPermissionsForRole('STOREKEEPER').includes('TRANSFER_VIEW'));
assert('AUDITOR has TRANSFER_VIEW', getPermissionsForRole('AUDITOR').includes('TRANSFER_VIEW'));
assert('DEPT_MANAGER has TRANSFER_CREATE', getPermissionsForRole('DEPT_MANAGER').includes('TRANSFER_CREATE'));
assert('STOREKEEPER has TRANSFER_CREATE', getPermissionsForRole('STOREKEEPER').includes('TRANSFER_CREATE'));

const cols = getReportColumns('transfer-history');
assert('transfer-history columns exist', Array.isArray(cols) && cols.length >= 8);
assert('transfer-history has receivedAt', cols.some((c) => c.key === 'receivedAt'));
assert('transfer-history has itemName', cols.some((c) => c.key === 'itemName'));

const spec = getGroupingSpec('transfer-history');
assert('transfer-history grouping subtotals', spec.subtotalKeys.includes('qty') && spec.subtotalKeys.includes('value'));

const sampleRows = [
    {
        transferNo: 'TR-001',
        documentKey: 'TR-001',
        itemName: 'Towel',
        qty: 10,
        value: 50,
        receivedAt: '2026-05-01',
        fromLocation: 'Main',
        toLocation: 'Kitchen',
        status: 'RECEIVED',
        transferDate: '2026-05-01',
    },
    {
        transferNo: 'TR-001',
        documentKey: 'TR-001',
        itemName: 'Soap',
        qty: 5,
        value: 25,
        receivedAt: '2026-05-01',
        fromLocation: 'Main',
        toLocation: 'Kitchen',
        status: 'RECEIVED',
        transferDate: '2026-05-01',
    },
];
const grouped = buildGroupedReport(sampleRows, spec, 'transfers');
assert('grouped tree has one transfer', grouped.tree.length === 1);
assert('grouped grandTotals qty', grouped.grandTotals.qty === 15);
assert('grouped grandTotals value', grouped.grandTotals.value === 75);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
