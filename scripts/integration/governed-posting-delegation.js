'use strict';

/**
 * Integration contract: domain services delegate inventory posts to postingEngine.
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

const grn = read('src/services/grn.service.js');
assert(grn.includes('postingEngine.postGrnInTransaction'), 'GRN post delegates to postingEngine');
assert(!grn.includes('inventoryLedger.create'), 'GRN service has no direct ledger writes');

const transfer = read('src/services/transfer.service.js');
assert(
    transfer.includes('postingEngine.postTransferReceiveInTransaction'),
    'Transfer receive delegates to postingEngine',
);
assert(!transfer.includes('inventoryLedger.create'), 'Transfer service has no direct ledger writes');

const getPass = read('src/services/getPass.service.js');
assert(!getPass.includes('inventoryLedger.create'), 'Get Pass service has no direct ledger writes');
assert(
    getPass.includes('postingEngine.postGetPassCheckoutInTransaction'),
    'Get Pass checkout delegates to postingEngine',
);
assert(getPass.includes('postingEngine.postReturnGoodLedger'), 'Get Pass return uses governed ledger post');
assert(getPass.includes('postingEngine.releaseBlockedOnReturn'), 'Get Pass return uses governed block release');

const engine = read('src/services/postingEngine.service.js');
assert(engine.includes('postGrnInTransaction'), 'postingEngine exports GRN post');
assert(engine.includes('postTransferReceiveInTransaction'), 'postingEngine exports transfer receive');
assert(
    engine.includes('governedGetPass') && engine.includes('...governedGetPass'),
    'postingEngine re-exports governed get pass module',
);

const governedGrn = read('src/services/postingGovernedGrn.service.js');
assert(governedGrn.includes('balanceAfter'), 'GRN governed post sets balanceAfter');
assert(governedGrn.includes('assertNoDuplicateGrnPost'), 'GRN duplicate-post guard');

const governedTransfer = read('src/services/postingGovernedTransfer.service.js');
assert(governedTransfer.includes('balanceAfter'), 'Transfer governed post sets balanceAfter');
assert(governedTransfer.includes('assertNoDuplicateTransferPost'), 'Transfer duplicate-post guard');

const governedGetPass = read('src/services/postingGovernedGetPass.service.js');
assert(governedGetPass.includes('assertNoDuplicateGetPassCheckout'), 'Get Pass checkout duplicate guard');

if (failed) process.exit(1);
console.log('\nGoverned posting delegation integration checks passed.');
process.exit(0);
