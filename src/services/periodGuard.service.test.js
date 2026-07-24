'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const servicePath = path.resolve(__dirname, './periodGuard.service.js');

function loadPeriodGuard(prismaImpl = {}) {
    const prismaMock = {
        periodClose: {
            findFirst: async () => null,
            findUnique: async () => null,
            ...prismaImpl.periodClose,
        },
        tenantSetting: {
            findUnique: async () => null,
            ...(prismaImpl.tenantSetting || {}),
        },
        tenant: {
            findUnique: async () => ({ timezone: 'Asia/Riyadh' }),
            ...(prismaImpl.tenant || {}),
        },
    };

    const originalLoad = Module._load;
    Module._load = function patchedLoader(request, parent, isMain) {
        if (request === '@prisma/client') {
            return { PrismaClient: function PrismaClient() { return prismaMock; } };
        }
        if (request === './setting.service') {
            return { isOpeningBalanceAllowed: async () => ({ allowed: false }) };
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    delete require.cache[servicePath];
    const svc = require(servicePath);
    Module._load = originalLoad;
    return svc;
}

test('checkFuturePostingDate rejects tomorrow', () => {
    const { checkFuturePostingDate } = loadPeriodGuard();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    assert.throws(() => checkFuturePostingDate(tomorrow), (err) => err.code === 'FUTURE_POSTING_DATE');
});

test('checkFuturePostingDate allows today', () => {
    const { checkFuturePostingDate } = loadPeriodGuard();
    assert.doesNotThrow(() => checkFuturePostingDate(new Date()));
});

test('checkFuturePostingDate compares tenant-local calendar days', () => {
    const { checkFuturePostingDate } = loadPeriodGuard();
    const realDate = Date;
    const now = new realDate('2026-07-21T21:30:00.000Z');
    global.Date = class extends realDate {
        constructor(value) {
            super(value === undefined ? now : value);
        }
        static now() {
            return now.getTime();
        }
    };
    try {
        assert.doesNotThrow(() =>
            checkFuturePostingDate('2026-07-21T22:15:00.000Z', 'Asia/Riyadh'),
        );
        assert.throws(
            () => checkFuturePostingDate('2026-07-22T21:15:00.000Z', 'Asia/Riyadh'),
            (err) => err.code === 'FUTURE_POSTING_DATE',
        );
    } finally {
        global.Date = realDate;
    }
});

test('assertSequentialCloseAllowed requires prior month closed', async () => {
    const { assertSequentialCloseAllowed } = loadPeriodGuard({
        periodClose: {
            findFirst: async () => ({ year: 2025, month: 1, status: 'OPEN' }),
            findUnique: async ({ where }) => {
                if (where.tenantId_year_month.month === 1) return { status: 'CLOSED' };
                return null;
            },
        },
    });
    await assert.rejects(
        () => assertSequentialCloseAllowed('tenant-1', 2025, 3),
        (err) => err.code === 'PERIOD_CLOSE_NOT_SEQUENTIAL',
    );
});

test('assertSequentialCloseAllowed passes when prior months closed', async () => {
    const { assertSequentialCloseAllowed } = loadPeriodGuard({
        periodClose: {
            findFirst: async () => ({ year: 2025, month: 1, status: 'CLOSED' }),
            findUnique: async () => ({ status: 'CLOSED' }),
        },
    });
    await assert.doesNotThrow(() => assertSequentialCloseAllowed('tenant-1', 2025, 3));
});

test('assertSequentialCloseAllowed allows first registered mid-year month with no priors', async () => {
    const { assertSequentialCloseAllowed } = loadPeriodGuard({
        periodClose: {
            findFirst: async () => ({ year: 2026, month: 7, status: 'OPEN' }),
            findUnique: async () => null,
        },
    });
    await assert.doesNotThrow(() => assertSequentialCloseAllowed('tenant-dx', 2026, 7));
});

test('assertSequentialCloseAllowed still requires previous registered month before next', async () => {
    const { assertSequentialCloseAllowed } = loadPeriodGuard({
        periodClose: {
            findFirst: async () => ({ year: 2026, month: 7, status: 'OPEN' }),
            findUnique: async ({ where }) => {
                const { year, month } = where.tenantId_year_month;
                if (year === 2026 && month === 7) return { status: 'OPEN' };
                return null;
            },
        },
    });
    await assert.rejects(
        () => assertSequentialCloseAllowed('tenant-dx', 2026, 8),
        (err) => err.code === 'PERIOD_CLOSE_NOT_SEQUENTIAL',
    );
});

test('assertSequentialCloseAllowed allows August after July closed from mid-year start', async () => {
    const { assertSequentialCloseAllowed } = loadPeriodGuard({
        periodClose: {
            findFirst: async () => ({ year: 2026, month: 7, status: 'CLOSED' }),
            findUnique: async ({ where }) => {
                const { year, month } = where.tenantId_year_month;
                if (year === 2026 && month === 7) return { status: 'CLOSED' };
                return null;
            },
        },
    });
    await assert.doesNotThrow(() => assertSequentialCloseAllowed('tenant-dx', 2026, 8));
});
