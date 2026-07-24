'use strict';

const { PrismaClient } = require('@prisma/client');
const {
    DEFAULT_TENANT_TIMEZONE,
    assertIanaTimezone,
} = require('../utils/tenant-calendar.util');

const prisma = new PrismaClient();

async function getTenantTimezone(tenantId, db = prisma) {
    if (!tenantId) {
        throw Object.assign(new Error('tenantId is required to resolve the business timezone.'), {
            status: 400,
            code: 'TENANT_REQUIRED',
        });
    }
    const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { timezone: true },
    });
    if (!tenant) {
        throw Object.assign(new Error('Tenant not found.'), { status: 404, code: 'TENANT_NOT_FOUND' });
    }
    return assertIanaTimezone(tenant.timezone || DEFAULT_TENANT_TIMEZONE);
}

module.exports = { getTenantTimezone };
