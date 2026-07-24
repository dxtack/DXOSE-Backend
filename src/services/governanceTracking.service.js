'use strict';

const prisma = require('../config/database');
const settingService = require('./setting.service');

/**
 * Whether month-end governance alerts (e.g. prior-period overdue) apply to this tenant.
 * Fresh / setup tenants stay false until operational life has started.
 */
async function getGovernanceTrackingContext(tenantId) {
    const [obStatus, closedPeriodCount, postedLedgerCount, postedMovementCount] = await Promise.all([
        settingService.getObStatus(tenantId),
        prisma.periodClose.count({
            where: { tenantId, status: 'CLOSED' },
        }),
        prisma.inventoryLedger.count({
            where: { tenantId, affectsValuation: true },
        }),
        prisma.movementDocument.count({
            where: { tenantId, status: 'POSTED' },
        }),
    ]);

    const obFinalized = obStatus === 'FINALIZED';
    const hasClosedPeriod = closedPeriodCount > 0;
    const hasPostedActivity = postedLedgerCount > 0 || postedMovementCount > 0;
    /** Tenant has entered a phase where period close is meaningful (OB finalized or live postings). */
    const hasCloseableOperationalPeriod = obFinalized || hasPostedActivity;

    const governanceTrackingActive =
        obFinalized || hasClosedPeriod || hasPostedActivity || hasCloseableOperationalPeriod;

    return {
        governanceTrackingActive,
        obStatus,
        signals: {
            obFinalized,
            hasClosedPeriod,
            hasPostedActivity,
            hasCloseableOperationalPeriod,
        },
    };
}

module.exports = {
    getGovernanceTrackingContext,
};
