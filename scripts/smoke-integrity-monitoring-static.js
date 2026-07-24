'use strict';

const integrityMonitoring = require('../src/services/integrityMonitoring.service');
const periodCloseGovernance = require('../src/services/periodCloseGovernance.service');

let failed = 0;

function assert(cond, msg) {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        failed += 1;
    } else {
        console.log(`OK: ${msg}`);
    }
}

assert(typeof integrityMonitoring.runIntegrityScan === 'function', 'runIntegrityScan exported');
assert(typeof periodCloseGovernance.runMonthEndCloseChecklist === 'function', 'runMonthEndCloseChecklist exported');
assert(integrityMonitoring.DRIFT_TOLERANCE > 0, 'drift tolerance defined');

if (failed) {
    process.exit(1);
}
console.log('\nIntegrity monitoring static checks passed.');
process.exit(0);
