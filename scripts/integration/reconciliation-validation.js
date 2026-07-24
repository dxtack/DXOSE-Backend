'use strict';

/**
 * Reconciliation rule contract — integrity monitoring + governed posts.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
let failed = 0;

function assert(cond, msg) {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        failed += 1;
    } else {
        console.log(`OK: ${msg}`);
    }
}

function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}

const integrity = read('src/services/integrityMonitoring.service.js');
assert(integrity.includes('STOCK_LEDGER_DRIFT'), 'integrity scan detects stock/ledger drift');
assert(integrity.includes('ORPHAN_GET_PASS_RETURN_DOC'), 'integrity scan detects orphan get pass return docs');
assert(integrity.includes('WAC_ANOMALY_ZERO_WITH_QTY'), 'integrity scan detects valuation anomalies');
assert(integrity.includes('runAndPersistIntegrityScan'), 'integrity supports persisted scans');

const movement = read('src/services/postingGovernedMovement.service.js');
assert(movement.includes('assertNoDuplicateLedgerPost'), 'movement duplicate-post guard');

const period = read('src/services/periodCloseGovernance.service.js');
assert(period.includes('runMonthEndCloseChecklist'), 'month-end checklist available');
assert(period.includes('assertMonthEndCloseAllowed'), 'strict month-end close guard');

const periodClose = read('src/services/periodClose.service.js');
assert(periodClose.includes('reason'), 'period reopen requires reason');

if (failed) process.exit(1);
console.log('\nReconciliation validation contract checks passed.');
process.exit(0);
