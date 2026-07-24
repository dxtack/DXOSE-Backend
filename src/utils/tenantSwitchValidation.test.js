const test = require('node:test');
const assert = require('node:assert/strict');
const {
    ensureTenantSwitchable,
    buildSubscriptionExpiredError,
} = require('./tenantSwitchValidation');

test('ensureTenantSwitchable allows active tenant with valid subscription', async () => {
    const db = {
        tenant: {
            findUnique: async ({ where }) => {
                if (where.id === 'hotel-1') {
                    return {
                        id: 'hotel-1',
                        isActive: true,
                        adminStatus: 'ACTIVE',
                        subStatus: 'ACTIVE',
                        licenseEndDate: null,
                        parentId: 'org-1',
                    };
                }
                if (where.id === 'org-1') {
                    return {
                        id: 'org-1',
                        isActive: true,
                        adminStatus: 'ACTIVE',
                        subStatus: 'ACTIVE',
                        licenseEndDate: null,
                    };
                }
                return null;
            },
        },
    };

    await assert.doesNotReject(() => ensureTenantSwitchable('hotel-1', { db }));
});

test('ensureTenantSwitchable rejects expired target before session replace', async () => {
    const db = {
        tenant: {
            findUnique: async ({ where }) => {
                if (where.id === 'hotel-expired') {
                    return {
                        id: 'hotel-expired',
                        isActive: true,
                        adminStatus: 'ACTIVE',
                        subStatus: 'EXPIRED',
                        licenseEndDate: null,
                        parentId: null,
                    };
                }
                return null;
            },
        },
    };

    await assert.rejects(
        () => ensureTenantSwitchable('hotel-expired', { db }),
        (err) => err.code === 'SUBSCRIPTION_EXPIRED' && err.statusCode === 403,
    );
});

test('ensureTenantSwitchable rejects inactive direct membership target', async () => {
    const db = {
        tenant: {
            findUnique: async () => ({
                id: 'hotel-off',
                isActive: false,
                adminStatus: 'ACTIVE',
                subStatus: 'ACTIVE',
                licenseEndDate: null,
                parentId: null,
            }),
        },
    };

    await assert.rejects(
        () => ensureTenantSwitchable('hotel-off', { db }),
        (err) => err.code === 'TENANT_INACTIVE',
    );
});

test('buildSubscriptionExpiredError exposes client code', () => {
    const err = buildSubscriptionExpiredError();
    assert.equal(err.code, 'SUBSCRIPTION_EXPIRED');
    assert.equal(err.statusCode, 403);
});
