'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const settingService = require('./setting.service');
const { periodEndInstant, assignedPeriodKey } = require('../platform/postingPeriod.util');

const startOfCalendarDay = (value) => {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
};

const checkFuturePostingDate = (postingDate) => {
    const pd = postingDate ? new Date(postingDate) : new Date();
    if (Number.isNaN(pd.getTime())) {
        throw Object.assign(new Error('Invalid posting date.'), { status: 422, code: 'INVALID_POSTING_DATE' });
    }
    const postingDay = startOfCalendarDay(pd);
    const today = startOfCalendarDay(new Date());
    if (postingDay > today) {
        throw Object.assign(new Error('Posting date cannot be in the future.'), {
            status: 422,
            code: 'FUTURE_POSTING_DATE',
        });
    }
};

async function getPeriodRegistryRow(tenantId, year, month) {
    return prisma.periodClose.findUnique({
        where: { tenantId_year_month: { tenantId, year, month } },
    });
}

async function assertPeriodOpenForPosting(tenantId, postingDate) {
    const pd = postingDate ? new Date(postingDate) : new Date();
    const year = pd.getFullYear();
    const month = pd.getMonth() + 1;
    const row = await getPeriodRegistryRow(tenantId, year, month);
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
}

const validatePostingDate = async (tenantId, postingDate) => {
    const pd = postingDate ? new Date(postingDate) : new Date();
    checkFuturePostingDate(pd);
    await assertPeriodOpenForPosting(tenantId, pd);
};

const checkPeriodLock = async (tenantId, transactionDate) => {
    await validatePostingDate(tenantId, transactionDate);
};

const assertSequentialCloseAllowed = async (tenantId, year, month) => {
    if (!month || month < 1 || month > 12) {
        throw Object.assign(new Error('Annual close is prohibited. Use monthly close (month 1–12).'), {
            status: 422,
            code: 'ANNUAL_CLOSE_PROHIBITED',
        });
    }
    for (let m = 1; m < month; m += 1) {
        const prior = await getPeriodRegistryRow(tenantId, year, m);
        if (!prior || prior.status !== 'CLOSED') {
            throw Object.assign(
                new Error(`Cannot close ${year}/${String(month).padStart(2, '0')}: month ${m} must be closed first.`),
                { status: 422, code: 'PERIOD_CLOSE_NOT_SEQUENTIAL' },
            );
        }
    }
    if (month === 1) {
        const decPrior = await getPeriodRegistryRow(tenantId, year - 1, 12);
        if (decPrior && decPrior.status !== 'CLOSED') {
            throw Object.assign(
                new Error(`Cannot close ${year}/01: December ${year - 1} must be closed first.`),
                { status: 422, code: 'PERIOD_CLOSE_NOT_SEQUENTIAL' },
            );
        }
    }
};

async function assertLatestClosedForReopen(tenantId, periodId) {
    const target = await prisma.periodClose.findFirst({ where: { id: periodId, tenantId } });
    if (!target) {
        throw Object.assign(new Error('Period not found'), { status: 404 });
    }
    if (target.status !== 'CLOSED') {
        throw Object.assign(new Error('Only a CLOSED period may be reopened.'), { status: 422, code: 'PERIOD_NOT_CLOSED' });
    }
    const latest = await prisma.periodClose.findFirst({
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
    getPeriodRegistryRow,
    checkPeriodLock,
    checkOBAllowed,
    checkOpeningBalanceAllowed,
    getOBStatus,
    assertOperationalTransactionsAllowed,
    periodEndInstant,
};
