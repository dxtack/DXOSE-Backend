const prisma = require('../config/database');
const { isTenantSubscriptionExpired } = require('./subscriptionLicense');

const buildSubscriptionExpiredError = () =>
    Object.assign(new Error('Your subscription has expired. Please renew to continue.'), {
        statusCode: 403,
        code: 'SUBSCRIPTION_EXPIRED',
    });

const buildTenantInactiveError = () =>
    Object.assign(new Error('Your tenant account is inactive. Please contact support.'), {
        statusCode: 403,
        code: 'TENANT_INACTIVE',
    });

/**
 * Validates target tenant (and parent org) before issuing a new session on property switch.
 * Does not mutate auth state — safe to call before issueSessionForMembership.
 *
 * @param {object} db - Prisma client
 * @param {string} tenantId
 * @param {{ buildSuspensionError?: (code: string) => Error }} [deps]
 */
const ensureTenantSwitchable = async (tenantId, deps = {}) => {
    if (!tenantId) {
        return;
    }

    const db = deps.db || prisma;
    const buildSuspensionError =
        deps.buildSuspensionError ||
        ((code) =>
            Object.assign(new Error(code), {
                statusCode: 403,
                code,
            }));

    const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: {
            id: true,
            isActive: true,
            adminStatus: true,
            subStatus: true,
            licenseEndDate: true,
            parentId: true,
        },
    });

    if (!tenant || !tenant.isActive) {
        throw buildTenantInactiveError();
    }

    if (tenant.adminStatus === 'SUSPENDED') {
        throw buildSuspensionError('ACCOUNT_SUSPENDED');
    }

    if (isTenantSubscriptionExpired(tenant)) {
        throw buildSubscriptionExpiredError();
    }

    if (!tenant.parentId) {
        return;
    }

    const parent = await db.tenant.findUnique({
        where: { id: tenant.parentId },
        select: {
            id: true,
            isActive: true,
            adminStatus: true,
            subStatus: true,
            licenseEndDate: true,
        },
    });

    if (!parent || !parent.isActive) {
        throw buildTenantInactiveError();
    }

    if (parent.adminStatus === 'SUSPENDED') {
        throw buildSuspensionError('ORGANIZATION_SUSPENDED');
    }

    if (isTenantSubscriptionExpired(parent)) {
        throw buildSubscriptionExpiredError();
    }
};

module.exports = {
    ensureTenantSwitchable,
    buildSubscriptionExpiredError,
    buildTenantInactiveError,
};
