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

test('assertSequentialCloseAllowed requires prior month closed', async () => {
    const { assertSequentialCloseAllowed } = loadPeriodGuard({
        periodClose: {
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
            findUnique: async () => ({ status: 'CLOSED' }),
        },
    });
    await assert.doesNotThrow(() => assertSequentialCloseAllowed('tenant-1', 2025, 3));
});
