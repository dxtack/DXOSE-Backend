#!/usr/bin/env node
'use strict';

/**
 * Wave 1B — column contract coverage smoke (no DB).
 */
const {
    getReportColumns,
    resolveContractId,
    listContractCoverage,
    INTENTIONALLY_DYNAMIC,
} = require('../src/services/report-column-contracts');

const WAVE1B_LIVE_CARDS = [
    'negative-stock-report',
    'slow-moving-items',
    'dead-stock',
    'critical-stock-levels',
    'zero-movement-items',
    'high-consumption-items',
    'count-sessions-history',
    'open-count-sessions',
    'pending-approval-sessions',
    'variance-by-department',
    'variance-by-location',
    'get-pass-activity',
    'pending-review-queue',
    'period-close-validation',
    'lost-items-register',
    'audit-activity-report',
    'count-variance-report',
    'current-stock-balance',
];

let pass = 0;
let fail = 0;

function ok(msg) {
    pass++;
    console.log(`  PASS  ${msg}`);
}

function bad(msg) {
    fail++;
    console.error(`  FAIL  ${msg}`);
}

console.log('Reporting Wave 1B — column contracts smoke\n');

for (const cardId of WAVE1B_LIVE_CARDS) {
    const cols = getReportColumns(cardId);
    if (!cols?.length) {
        bad(`${cardId}: no column contract`);
        continue;
    }
    const numeric = cols.filter((c) => c.format === 'qty' || c.format === 'sar');
    const misaligned = numeric.filter((c) => c.align !== 'right');
    if (misaligned.length) {
        bad(`${cardId}: numeric columns not right-aligned: ${misaligned.map((c) => c.key).join(', ')}`);
        continue;
    }
    const camelHeaders = cols.filter((c) => /^[a-z]+[A-Z]/.test(c.header));
    if (camelHeaders.length) {
        bad(`${cardId}: camelCase headers: ${camelHeaders.map((c) => c.header).join(', ')}`);
        continue;
    }
    ok(`${cardId} → ${resolveContractId(cardId)} (${cols.length} cols)`);
}

const deptContract = getReportColumns('variance-by-department');
if (deptContract?.[0]?.key !== 'department') {
    bad('variance-by-department: first column must be department');
} else {
    ok('variance-by-department groups by department column');
}

const snapCol = getReportColumns('count-variance-report')?.find((c) => c.key === 'bookQty');
if (!snapCol || snapCol.header !== 'Snapshot qty') {
    bad('count-variance-report: bookQty header must be Snapshot qty');
} else {
    ok('Snapshot qty terminology on bookQty column');
}

const coverage = listContractCoverage();
ok(`explicit contracts: ${coverage.explicit.length}, aliases: ${coverage.aliased.length}`);
ok(`intentionally dynamic (planned): ${INTENTIONALLY_DYNAMIC.size} cards`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
