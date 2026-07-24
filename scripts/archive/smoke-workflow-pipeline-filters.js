'use strict';

/**
 * Regression: workflow pipeline filter logic (no DB).
 * Run: node scripts/smoke-workflow-pipeline-filters.js
 */

const { applyFilters } = require('../src/services/workflow-pipeline/workflow-pipeline.service');
const { userCanActOnItem } = require('../src/services/workflow-pipeline/workflow-pipeline.collectors');

const fixtures = [
    {
        id: '1',
        module: 'BREAKAGE',
        documentNo: 'BRK-001',
        title: 'Breakage BRK-001',
        status: 'DEPT_APPROVED',
        priority: 'critical',
        overdue: true,
        waitingForRole: 'COST_CONTROL',
        waitingForPermission: 'APPROVE_BREAKAGE',
        meta: { vendor: 'REF-ABC' },
    },
    {
        id: '2',
        module: 'LOST',
        documentNo: 'LST-002',
        title: 'Lost LST-002',
        status: 'FINANCE_APPROVED',
        priority: 'warning',
        overdue: false,
        waitingForRole: 'GENERAL_MANAGER',
        waitingForPermission: 'APPROVE_LOST',
        meta: {},
    },
    {
        id: '3',
        module: 'TRANSFER',
        documentNo: 'TRF-003',
        title: 'Transfer TRF-003',
        status: 'PENDING_FINANCE',
        priority: 'info',
        overdue: false,
        waitingForRole: 'FINANCE_MANAGER',
        waitingForPermission: 'TRANSFER_APPROVE',
        meta: {},
    },
];

let fail = 0;
const assert = (label, ok) => {
    if (ok) console.log(`  OK  ${label}`);
    else {
        console.error(`  FAIL  ${label}`);
        fail += 1;
    }
};

const byPriority = applyFilters(fixtures, { priority: 'critical' }, null);
assert('priority=critical returns 1 row', byPriority.length === 1 && byPriority[0].id === '1');

const byModule = applyFilters(fixtures, { module: 'LOST' }, null);
assert('module=LOST returns 1 row', byModule.length === 1 && byModule[0].id === '2');

const byWaiting = applyFilters(fixtures, { waitingFor: 'FINANCE_MANAGER' }, null);
assert('waitingFor=FINANCE_MANAGER returns 1 row', byWaiting.length === 1 && byWaiting[0].id === '3');

const byOverdue = applyFilters(fixtures, { overdue: '1' }, null);
assert('overdue=1 returns 1 row', byOverdue.length === 1 && byOverdue[0].id === '1');

const bySearch = applyFilters(fixtures, { q: 'REF-ABC' }, null);
assert('search meta reference', bySearch.length === 1 && bySearch[0].id === '1');

const combined = applyFilters(
    fixtures,
    { module: 'BREAKAGE', waitingFor: 'COST_CONTROL', overdue: '1' },
    null,
);
assert('combined AND filters', combined.length === 1 && combined[0].id === '1');

const financeMine = applyFilters(fixtures, { mine: '1' }, { role: 'FINANCE_MANAGER' });
assert(
    'mine=1 finance sees all rows matching granted approve permissions',
    financeMine.length === 3,
);

const financeTransferOnly = applyFilters(fixtures, { mine: '1' }, {
    role: 'FINANCE_MANAGER',
    permissions: ['TRANSFER_APPROVE'],
});
assert(
    'mine=1 JWT permissions narrow actionable rows',
    financeTransferOnly.length === 1 && financeTransferOnly[0].id === '3',
);

const orgMine = applyFilters(fixtures, { mine: '1' }, { role: 'ORG_MANAGER' });
assert(
    'mine=1 org sees rows matching ACC grants (not role bypass)',
    orgMine.length === 3,
);

assert(
    'userCanActOnItem finance on finance row',
    userCanActOnItem(fixtures[2], { role: 'FINANCE_MANAGER' }),
);
assert(
    'userCanActOnItem finance on breakage row (APPROVE_BREAKAGE grant)',
    userCanActOnItem(fixtures[0], { role: 'FINANCE_MANAGER' }),
);
assert(
    'userCanActOnItem storekeeper not on transfer row without grant',
    !userCanActOnItem(fixtures[2], { role: 'STOREKEEPER' }),
);
assert(
    'userCanActOnItem JWT permissions override role',
    userCanActOnItem(fixtures[0], { role: 'STOREKEEPER', permissions: ['APPROVE_BREAKAGE'] }),
);

console.log(fail === 0 ? '\nSmoke workflow-pipeline filters passed.' : `\n${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
