/**
 * Static smoke: Phase A1 inventory count unification guards.
 */
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

const routes = fs.readFileSync(path.join(root, 'src/routes/stockCount.routes.js'), 'utf8');
assert(
    routes.includes('blockLegacyStockCountMutations'),
    'stockCount.routes uses blockLegacyStockCountMutations middleware',
);
assert(
    routes.includes('legacyStockCountDeprecationHeaders'),
    'stockCount.routes sets legacy deprecation headers on all requests',
);

const blockMw = fs.readFileSync(path.join(root, 'src/middleware/blockLegacyStockCountMutations.js'), 'utf8');
assert(
    blockMw.includes('ALLOW_LEGACY_STOCK_COUNT_MUTATIONS'),
    'legacy block defaults on unless ALLOW_LEGACY_STOCK_COUNT_MUTATIONS',
);
assert(blockMw.includes('isLegacyStockCountBlocked'), 'exports isLegacyStockCountBlocked for service guard');

const invRoutes = fs.readFileSync(path.join(root, 'src/routes/inventoryCount.routes.js'), 'utf8');
assert(invRoutes.includes('/sessions'), 'inventory-count exposes /sessions canonical path');

const invSvc = fs.readFileSync(path.join(root, 'src/services/inventoryCount.service.js'), 'utf8');
assert(invSvc.includes('postingEngine.postInventoryCountSession'), 'inventory count approve uses postingEngine');
assert(
    invSvc.includes("resolveWorkflowForDocument({ moduleKey: 'STOCK_COUNT'"),
    'inventory count submitForApproval resolves ACC workflow chain',
);
assert(
    invSvc.includes('roleCodes.map((roleCode, index)'),
    'inventory count approval steps derive from workflow roleCodes',
);
assert(invSvc.includes("'FINANCE_APPROVED'"), 'inventory count service supports FINANCE_APPROVED status');

const invRoutesGm = fs.readFileSync(path.join(root, 'src/routes/inventoryCount.routes.js'), 'utf8');
assert(
    invRoutesGm.includes("'APPROVE_INVENTORY_COUNT'"),
    'inventory count routes authorize APPROVE_INVENTORY_COUNT',
);

const posting = fs.readFileSync(path.join(root, 'src/services/posting.service.js'), 'utf8');
assert(
    posting.includes("referenceType: 'COUNT_SESSION'"),
    'canonical post uses COUNT_SESSION referenceType',
);

const engine = fs.readFileSync(path.join(root, 'src/services/postingEngine.service.js'), 'utf8');
assert(engine.includes('postInventoryCountSession'), 'postingEngine exposes postInventoryCountSession');

if (failed > 0) {
    console.error(`\n${failed} assertion(s) failed.`);
    process.exit(1);
}
console.log('\nAll inventory count unification static checks passed.');
process.exit(0);
