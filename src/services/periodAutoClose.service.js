'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const periodCloseService = require('./periodClose.service');
const { runMonthEndCloseChecklist } = require('./periodCloseGovernance.service');
const { toUtcPeriodYearMonth } = require('../utils/report-date-range.util');
const logger = require('../utils/logger');
const { getTenantTimezone } = require('./tenantTimezone.service');
const { tenantDateParts } = require('../utils/tenant-calendar.util');

function parseExecutionMinutes(value) {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
    return match ? Number(match[1]) * 60 + Number(match[2]) : 120;
}

function isAutoCloseDue(settings, now, timezone) {
    const local = tenantDateParts(now, timezone);
    const configuredDay = Math.max(1, Math.min(31, Number(settings.dayOfMonth) || 5));
    const lastDay = new Date(Date.UTC(local.year, local.month, 0)).getUTCDate();
    const effectiveDay = Math.min(configuredDay, lastDay);
    const currentMinutes = local.hour * 60 + local.minute;
    const executionMinutes = parseExecutionMinutes(settings.executionTime);
    return local.day > effectiveDay || (local.day === effectiveDay && currentMinutes >= executionMinutes);
}

/**
 * Attempt auto close for tenants with settings enabled (Ch.6.14 / D10).
 * Closes the previous tenant-local calendar month once the configured local day/time is due.
 */
async function runAutoCloseForTenant(tenantId, now = new Date()) {
    const settings = await prisma.periodAutoCloseSettings.findUnique({ where: { tenantId } });
    if (!settings?.enabled) return { skipped: true, reason: 'disabled' };

    const timezone = await getTenantTimezone(tenantId, prisma);
    if (!isAutoCloseDue(settings, now, timezone)) {
        return { skipped: true, reason: 'not_due', timezone };
    }

    const { year, month } = toUtcPeriodYearMonth(now, timezone);
    const targetYear = month === 1 ? year - 1 : year;
    const targetMonth = month === 1 ? 12 : month - 1;
    const period = await prisma.periodClose.findUnique({
        where: { tenantId_year_month: { tenantId, year: targetYear, month: targetMonth } },
        select: { status: true },
    });
    if (period?.status === 'CLOSED') {
        return { skipped: true, reason: 'already_closed', timezone };
    }

    const checklist = await runMonthEndCloseChecklist(tenantId, { year: targetYear, month: targetMonth });
    if (!checklist.ready) {
        logger.warn('[AutoClose] blocked', { tenantId, blockers: checklist.summary.blockerCount });
        return { closed: false, checklist, timezone };
    }

    try {
        const result = await periodCloseService.closePeriod(
            tenantId,
            { year: targetYear, month: targetMonth, notes: 'Auto close' },
            null,
        );
        return { closed: true, result, timezone };
    } catch (err) {
        logger.error('[AutoClose] failed', { tenantId, message: err.message });
        return { closed: false, error: err.message, timezone };
    }
}

async function runAutoCloseJob(now = new Date()) {
    const tenants = await prisma.periodAutoCloseSettings.findMany({
        where: { enabled: true },
        select: { tenantId: true },
    });
    const results = [];
    for (const t of tenants) {
        results.push({ tenantId: t.tenantId, ...(await runAutoCloseForTenant(t.tenantId, now)) });
    }
    return results;
}

module.exports = {
    runAutoCloseForTenant,
    runAutoCloseJob,
    parseExecutionMinutes,
    isAutoCloseDue,
};
