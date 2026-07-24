'use strict';

/**
 * Minimal disposable tenant + department fixtures for integration proof tests.
 * Uses caller-provided PrismaClient — never the product singleton.
 */

async function createDisposableTenant(prisma, runContext) {
    return prisma.tenant.create({
        data: {
            name: `Integration Test ${runContext.runId}`,
            slug: runContext.tenantSlug,
            isActive: true,
        },
    });
}

async function createDisposableDepartment(prisma, tenantId, runContext) {
    return prisma.department.create({
        data: {
            tenantId,
            code: 'IT',
            name: `Integration Department ${runContext.runId}`,
            isActive: true,
        },
    });
}

module.exports = {
    createDisposableTenant,
    createDisposableDepartment,
};
