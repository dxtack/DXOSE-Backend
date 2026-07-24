'use strict';

/**
 * Publish STOCK_COUNT ACC workflow v3: Cost Control → Dept → Finance → GM
 * Usage: node scripts/publish-stock-count-workflow-v3.js
 */

const { ensureStockCountWorkflowPublished } = require('../src/services/ensure-stock-count-workflow-published.service');

async function main() {
    const result = await ensureStockCountWorkflowPublished();
    console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
