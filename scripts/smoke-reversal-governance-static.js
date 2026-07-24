'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;

function assert(cond, msg) {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        failed += 1;
    } else {
        console.log(`OK: ${msg}`);
    }
}

const doc = fs.readFileSync(
    path.join(root, '..', 'docs', 'governance', 'REVERSAL_RECOVERY_GOVERNANCE.md'),
    'utf8',
);
assert(doc.includes('Inventory Count'), 'reversal governance doc covers inventory count');
assert(doc.includes('GET_PASS_RETURN'), 'reversal governance doc covers get pass return');

const breakage = fs.readFileSync(path.join(root, 'src', 'services', 'breakage.service.js'), 'utf8');
assert(breakage.includes('voidBreakage'), 'breakage void API exists');
assert(breakage.includes('Approved documents are immutable'), 'posted breakage immutability guard');

const periodClose = fs.readFileSync(path.join(root, 'src', 'services', 'periodClose.service.js'), 'utf8');
assert(periodClose.includes('PERIOD_REOPEN_REASON_REQUIRED'), 'period reopen requires reason');

const invCount = fs.readFileSync(path.join(root, 'src', 'services', 'inventoryCount.service.js'), 'utf8');
assert(invCount.includes("status: 'VOID'"), 'inventory count supports VOID cancel');

if (failed) {
    console.error(`\n${failed} failed.`);
    process.exit(1);
}
console.log('\nReversal governance static checks passed.');
process.exit(0);
