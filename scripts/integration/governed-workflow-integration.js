'use strict';

/**
 * Optional DB-backed integration: run integrity scan for a tenant when configured.
 * Set GOVERNED_INTEGRATION_TENANT_ID to enable live reconciliation probe.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const tenantId = process.env.GOVERNED_INTEGRATION_TENANT_ID;

async function main() {
    if (!tenantId) {
        console.log('SKIP: GOVERNED_INTEGRATION_TENANT_ID not set — DB integration probe optional');
        process.exit(0);
    }

    const integrityMonitoring = require('../../src/services/integrityMonitoring.service');
    const periodCloseGovernance = require('../../src/services/periodCloseGovernance.service');

    const scan = await integrityMonitoring.runIntegrityScan(tenantId, { stockLedgerSampleSize: 50 });
    const checklist = await periodCloseGovernance.runMonthEndCloseChecklist(tenantId);

    console.log('Integrity scan:', {
        healthy: scan.healthy,
        blockers: scan.summary.blockerCount,
        warnings: scan.summary.warningCount,
    });
    console.log('Month-end checklist:', {
        ready: checklist.ready,
        blockers: checklist.summary.blockerCount,
    });

    if (!scan.healthy) {
        console.error('FAIL: integrity scan has blockers for integration tenant');
        process.exit(1);
    }

    console.log('OK: governed workflow integration probe passed for tenant', tenantId);
    process.exit(0);
}

main().catch((e) => {
    console.error('Integration probe failed:', e.message);
    process.exit(1);
});
