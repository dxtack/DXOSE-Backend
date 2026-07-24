const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

/**
 * Regression: switch-tenant must embed the user's DB permissionVersion in JWT,
 * otherwise the next authenticated request returns 401 PERMISSIONS_STALE.
 */
test('switchTenant JWT carries user permissionVersion from DB', async () => {
    const authService = require('../services/auth.service');
    const prisma = require('../config/database');

    const membership = await prisma.tenantMember.findFirst({
        where: {
            isActive: true,
            user: { isActive: true },
            tenant: { isActive: true },
        },
        include: {
            user: { select: { id: true, permissionVersion: true, email: true } },
            tenant: { select: { slug: true } },
        },
        orderBy: { createdAt: 'asc' },
    });
    assert.ok(membership?.user?.id, 'An active user/tenant membership must exist for switchTenant test');
    assert.ok(membership.tenant?.slug, 'Tenant slug required for switchTenant test');

    const result = await authService.switchTenant({
        userId: membership.user.id,
        tenantSlug: membership.tenant.slug,
        ipAddress: '127.0.0.1',
        userAgent: 'switch-permission-version-test',
    });

    const decoded = jwt.decode(result.accessToken);
    assert.equal(decoded.permissionVersion, membership.user.permissionVersion ?? 0);

    await prisma.$disconnect();
});
