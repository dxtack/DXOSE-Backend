'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const periodCloseService = require('./periodClose.service');
const { runMonthEndCloseChecklist } = require('./periodCloseGovernance.service');
const logger = require('../utils/logger');

/**
 * Attempt auto close for tenants with settings enabled (Ch.6.14 / D10).
 */
async function runAutoCloseForTenant(tenantId) {
    const settings = await prisma.periodAutoCloseSettings.findUnique({ where: { tenantId } });
    if (!settings?.enabled) return { skipped: true, reason: 'disabled' };

    const now = new Date();
    const targetYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const targetMonth = now.getMonth() === 0 ? 12 : now.getMonth();

    const checklist = await runMonthEndCloseChecklist(tenantId, { year: targetYear, month: targetMonth });
    if (!checklist.ready) {
        logger.warn('[AutoClose] blocked', { tenantId, blockers: checklist.summary.blockerCount });
        return { closed: false, checklist };
    }

    try {
        const result = await periodCloseService.closePeriod(
            tenantId,
            { year: targetYear, month: targetMonth, notes: 'Auto close' },
            null,
        );
        return { closed: true, result };
    } catch (err) {
        logger.error('[AutoClose] failed', { tenantId, message: err.message });
        return { closed: false, error: err.message };
    }
}

async function runAutoCloseJob() {
    const tenants = await prisma.periodAutoCloseSettings.findMany({
        where: { enabled: true },
        select: { tenantId: true },
    });
    const results = [];
    for (const t of tenants) {
        results.push({ tenantId: t.tenantId, ...(await runAutoCloseForTenant(t.tenantId)) });
    }
    return results;
}

module.exports = {
    runAutoCloseForTenant,
    runAutoCloseJob,
};
