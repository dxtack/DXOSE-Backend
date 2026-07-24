'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const settingService = require('./setting.service');
const { periodEndInstant, assignedPeriodKey } = require('../platform/postingPeriod.util');
const { toUtcPeriodYearMonth, toUtcStartOfDay } = require('../utils/report-date-range.util');
const { assertOpeningContinuityEvidenceFresh } = require('./periodOpeningContinuity.service');
const { getTenantTimezone } = require('./tenantTimezone.service');

const checkFuturePostingDate = (postingDate, timezone) => {
    const pd = postingDate ? new Date(postingDate) : new Date();
    if (Number.isNaN(pd.getTime())) {
        throw Object.assign(new Error('Invalid posting date.'), { status: 422, code: 'INVALID_POSTING_DATE' });
    }
    const postingDay = toUtcStartOfDay(pd, timezone);
    const today = toUtcStartOfDay(new Date(), timezone);
    if (postingDay > today) {
        throw Object.assign(new Error('Posting date cannot be in the future.'), {
            status: 422,
            code: 'FUTURE_POSTING_DATE',
        });
    }
};

async function getPeriodRegistryRow(tenantId, year, month, db = prisma) {
    return db.periodClose.findUnique({
        where: { tenantId_year_month: { tenantId, year, month } },
    });
}

async function lockPeriodForClose(tx, tenantId, year, month) {
    const rows = await tx.$queryRaw`
        SELECT "id"
        FROM "period_closes"
        WHERE "tenantId" = ${tenantId}::uuid
          AND "year" = ${year}
          AND "month" = ${month}
        FOR UPDATE
    `;
    return rows[0]?.id
        ? tx.periodClose.findUnique({ where: { id: rows[0].id } })
        : null;
}

async function lockPeriodForPosting(tx, tenantId, year, month) {
    const rows = await tx.$queryRaw`
        SELECT "id"
        FROM "period_closes"
        WHERE "tenantId" = ${tenantId}::uuid
          AND "year" = ${year}
          AND "month" = ${month}
        FOR SHARE
    `;
    return rows[0]?.id
        ? tx.periodClose.findUnique({ where: { id: rows[0].id } })
        : null;
}

async function assertPeriodOpenForPosting(tenantId, postingDate, db = prisma, timezone = null) {
    const pd = postingDate ? new Date(postingDate) : new Date();
    const tenantTimezone = timezone || await getTenantTimezone(tenantId, db);
    const { year, month } = toUtcPeriodYearMonth(pd, tenantTimezone);
    const row = await getPeriodRegistryRow(tenantId, year, month, db);
    if (!row) {
        throw Object.assign(
            new Error(`No period registry record for ${assignedPeriodKey(year, month)}. Implicit open periods are prohibited.`),
            { status: 422, code: 'PERIOD_NOT_REGISTERED' },
        );
    }
    if (row.status !== 'OPEN') {
        throw Object.assign(
            new Error(`Posting is prohibited: period ${assignedPeriodKey(year, month)} is ${row.status}.`),
            { status: 422, code: row.status === 'CLOSED' ? 'PERIOD_LOCKED_MONTHLY' : 'PERIOD_NOT_OPEN' },
        );
    }
    await assertOpeningContinuityEvidenceFresh(tenantId, row, db);
    return tenantTimezone;
}

/**
 * Workspace-only posting guard (Ch.6.9). Allows OPEN or CLOSING for the target period.
 * Does not relax validatePostingDate / assertPeriodOpenForPosting for ordinary post paths.
 *
 * @param {{ tenantId: string, year: number, month: number, postingDate: Date|string }} args
 */
async function assertPeriodAllowPostingForResolution({ tenantId, year, month, postingDate }, db = prisma) {
    const y = Number(year);
    const m = Number(month);
    if (!y || !m || m < 1 || m > 12) {
        throw Object.assign(new Error('Resolution posting requires year and month (1–12).'), {
            status: 422,
            statusCode: 422,
            code: 'INVALID_PERIOD',
        });
    }

    const pd = postingDate ? new Date(postingDate) : new Date();
    const timezone = await getTenantTimezone(tenantId, db);
    checkFuturePostingDate(pd, timezone);

    const ym = toUtcPeriodYearMonth(pd, timezone);
    if (ym.year !== y || ym.month !== m) {
        throw Object.assign(
            new Error(
                `Resolution posting date must fall in workspace period ${assignedPeriodKey(y, m)} (got ${assignedPeriodKey(ym.year, ym.month)}).`,
            ),
            { status: 422, statusCode: 422, code: 'RESOLUTION_POSTING_PERIOD_MISMATCH' },
        );
    }

    const row = await getPeriodRegistryRow(tenantId, y, m, db);
    if (!row) {
        throw Object.assign(
            new Error(`No period registry record for ${assignedPeriodKey(y, m)}. Implicit open periods are prohibited.`),
            { status: 422, statusCode: 422, code: 'PERIOD_NOT_REGISTERED' },
        );
    }
    if (row.status === 'CLOSED') {
        throw Object.assign(
            new Error(`Posting is prohibited: period ${assignedPeriodKey(y, m)} is CLOSED.`),
            { status: 422, statusCode: 422, code: 'PERIOD_LOCKED_MONTHLY' },
        );
    }
    if (row.status !== 'OPEN' && row.status !== 'CLOSING') {
        throw Object.assign(
            new Error(`Posting is prohibited: period ${assignedPeriodKey(y, m)} is ${row.status}.`),
            { status: 422, statusCode: 422, code: 'PERIOD_NOT_OPEN' },
        );
    }

    return { postingDate: pd, year: y, month: m, periodStatus: row.status, timezone };
}

const validatePostingDate = async (tenantId, postingDate, db = prisma, timezone = null) => {
    const pd = postingDate ? new Date(postingDate) : new Date();
    const tenantTimezone = timezone || await getTenantTimezone(tenantId, db);
    checkFuturePostingDate(pd, tenantTimezone);
    await assertPeriodOpenForPosting(tenantId, pd, db, tenantTimezone);
    return tenantTimezone;
};

const checkPeriodLock = async (tenantId, transactionDate) => {
    await validatePostingDate(tenantId, transactionDate);
};

/**
 * Earliest period_closes row for the tenant (bootstrap / first registration).
 * Sequential close starts here — not from calendar January.
 */
async function getFirstRegisteredPeriod(tenantId, db = prisma) {
    return db.periodClose.findFirst({
        where: { tenantId },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
        select: { year: true, month: true, status: true },
    });
}

function periodKey(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
}

function compareYearMonth(aYear, aMonth, bYear, bMonth) {
    if (aYear !== bYear) return aYear - bYear;
    return aMonth - bMonth;
}

/**
 * Yields { year, month } for every calendar month in [start, end) (end exclusive).
 */
function* monthsInHalfOpenRange(startYear, startMonth, endYear, endMonth) {
    let y = startYear;
    let m = startMonth;
    while (compareYearMonth(y, m, endYear, endMonth) < 0) {
        yield { year: y, month: m };
        m += 1;
        if (m > 12) {
            m = 1;
            y += 1;
        }
    }
}

/**
 * Close must proceed sequentially from the tenant's first registered period.
 * Example: hotel provisioned with 2026-07 only → July may close without Jan–Jun.
 * Later months (Aug+) still require every prior month from that start to be CLOSED.
 */
const assertSequentialCloseAllowed = async (tenantId, year, month, db = prisma) => {
    if (!month || month < 1 || month > 12) {
        throw Object.assign(new Error('Annual close is prohibited. Use monthly close (month 1–12).'), {
            status: 422,
            code: 'ANNUAL_CLOSE_PROHIBITED',
        });
    }

    const first = await getFirstRegisteredPeriod(tenantId, db);
    if (!first) {
        throw Object.assign(
            new Error(`No period registry record for ${periodKey(year, month)}.`),
            { status: 422, code: 'PERIOD_NOT_REGISTERED' },
        );
    }

    if (compareYearMonth(year, month, first.year, first.month) < 0) {
        throw Object.assign(
            new Error(
                `Cannot close ${periodKey(year, month)}: before first registered period ${periodKey(first.year, first.month)}.`,
            ),
            { status: 422, code: 'PERIOD_CLOSE_NOT_SEQUENTIAL' },
        );
    }

    // Every month in [firstRegistered, target) must exist and be CLOSED.
    for (const { year: py, month: pm } of monthsInHalfOpenRange(
        first.year,
        first.month,
        year,
        month,
    )) {
        const prior = await getPeriodRegistryRow(tenantId, py, pm, db);
        if (!prior || prior.status !== 'CLOSED') {
            throw Object.assign(
                new Error(
                    `Cannot close ${periodKey(year, month)}: ${periodKey(py, pm)} must be closed first.`,
                ),
                { status: 422, code: 'PERIOD_CLOSE_NOT_SEQUENTIAL' },
            );
        }
    }
};

async function assertLatestClosedForReopen(tenantId, periodId, db = prisma) {
    const target = await db.periodClose.findFirst({ where: { id: periodId, tenantId } });
    if (!target) {
        throw Object.assign(new Error('Period not found'), { status: 404 });
    }
    if (target.status !== 'CLOSED') {
        throw Object.assign(new Error('Only a CLOSED period may be reopened.'), { status: 422, code: 'PERIOD_NOT_CLOSED' });
    }
    const latest = await db.periodClose.findFirst({
        where: { tenantId, status: 'CLOSED' },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    if (!latest || latest.id !== target.id) {
        throw Object.assign(
            new Error('Reopen is permitted only for the latest closed period (reverse sequential order).'),
            { status: 422, code: 'PERIOD_REOPEN_NOT_LATEST' },
        );
    }
    return target;
}

const checkOBAllowed = async (tenantId) => {
    const setting = await prisma.tenantSetting.findUnique({
        where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
    });
    if (!setting) return;
    if (setting.value === 'LOCKED') {
        throw Object.assign(
            new Error('Opening Balance is locked after period close. Use Adjustment in an open period.'),
            { status: 422, code: 'OB_LOCKED' },
        );
    }
};

const checkOpeningBalanceAllowed = async (tenantId, transactionDate) => {
    await checkOBAllowed(tenantId);
    await checkPeriodLock(tenantId, transactionDate);
};

const getOBStatus = async (tenantId) => {
    const setting = await prisma.tenantSetting.findUnique({
        where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
    });
    if (!setting || setting.value !== 'LOCKED') {
        return { allowed: true, reason: null };
    }
    return {
        allowed: false,
        reason: setting.reason || 'Locked by system',
        updatedAt: setting.updatedAt || null,
    };
};

const assertOperationalTransactionsAllowed = async (tenantId) => {
    const ob = await settingService.isOpeningBalanceAllowed(tenantId);
    if (ob.allowed) {
        throw Object.assign(new Error('Opening balance must be finalized before starting transactions.'), {
            status: 403,
            statusCode: 403,
            code: 'OPENING_BALANCE_PHASE',
        });
    }
};

module.exports = {
    checkFuturePostingDate,
    validatePostingDate,
    assertSequentialCloseAllowed,
    assertLatestClosedForReopen,
    assertPeriodOpenForPosting,
    assertPeriodAllowPostingForResolution,
    getPeriodRegistryRow,
    getFirstRegisteredPeriod,
    lockPeriodForClose,
    lockPeriodForPosting,
    checkPeriodLock,
    checkOBAllowed,
    checkOpeningBalanceAllowed,
    getOBStatus,
    assertOperationalTransactionsAllowed,
    periodEndInstant,
};
