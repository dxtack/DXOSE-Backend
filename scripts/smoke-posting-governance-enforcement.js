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

const breakage = fs.readFileSync(path.join(root, 'src/services/breakage.service.js'), 'utf8');
assert(
    breakage.includes('postingEngine.postBreakageMovementInTransaction'),
    'breakage delegates final post to postingEngine',
);

const lost = fs.readFileSync(path.join(root, 'src/services/lostItems.service.js'), 'utf8');
assert(
    lost.includes('postingEngine.postLostMovementInTransaction'),
    'lost delegates final post to postingEngine',
);

const governed = fs.readFileSync(path.join(root, 'src/services/postingGovernedMovement.service.js'), 'utf8');
assert(governed.includes('balanceAfter'), 'governed breakage/lost sets balanceAfter on internal paths');
assert(governed.includes('assertNoDuplicateLedgerPost'), 'double-post guard in governed movement');

const engine = fs.readFileSync(path.join(root, 'src/services/postingEngine.service.js'), 'utf8');
assert(engine.includes('postBreakageMovementInTransaction'), 'postingEngine exports breakage post');
assert(engine.includes('postLostMovementInTransaction'), 'postingEngine exports lost post');

const audit = fs.readFileSync(path.join(root, 'src/services/auditGoverned.service.js'), 'utf8');
assert(audit.includes('logGovernedEvent'), 'auditGoverned facade exists');

const integrity = fs.readFileSync(path.join(root, 'src/services/integrityMonitoring.service.js'), 'utf8');
assert(integrity.includes('runAndPersistIntegrityScan'), 'integrity persistence API');

const setting = fs.readFileSync(path.join(root, 'src/services/setting.service.js'), 'utf8');
assert(setting.includes('postingEngine.postMovementDocument'), 'opening balance post uses postingEngine');

const grn = fs.readFileSync(path.join(root, 'src/services/grn.service.js'), 'utf8');
assert(grn.includes('postingEngine.postGrnInTransaction'), 'GRN delegates to postingEngine');
assert(grn.includes('logGovernedEvent'), 'GRN post uses governed audit');

const transfer = fs.readFileSync(path.join(root, 'src/services/transfer.service.js'), 'utf8');
assert(transfer.includes('postingEngine.postTransferInTransaction'), 'transfer finance post delegates');

const getPass = fs.readFileSync(path.join(root, 'src/services/getPass.service.js'), 'utf8');
assert(!getPass.includes('inventoryLedger.create'), 'getPass has no inline ledger.create');
assert(getPass.includes('postGetPassCheckoutInTransaction'), 'getPass checkout governed');

if (failed) process.exit(1);
console.log('\nPosting governance enforcement static checks passed.');
process.exit(0);
