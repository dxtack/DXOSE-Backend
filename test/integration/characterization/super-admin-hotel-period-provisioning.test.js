'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { createTenant, createFullOrganization } = require('../../../src/services/superAdmin.service');

test('every hotel provisioning path explicitly opens and audits the current period', async (t) => {
    const prisma = new PrismaClient();
    const runContext = createRunContext();
    const slugPrefix = `p1-hotel-${runContext.runId}`;
    const emailSuffix = runContext.runId;
    let platformAdminId;

    const assertHotelProvisioned = async (hotel, label) => {
        const now = new Date();
        const period = await prisma.periodClose.findUnique({
            where: {
                tenantId_year_month: {
                    tenantId: hotel.id,
                    year: now.getUTCFullYear(),
                    month: now.getUTCMonth() + 1,
                },
            },
        });
        const audit = period
            ? await prisma.auditLog.findFirst({
                where: {
                    tenantId: hotel.id,
                    entityType: 'PERIOD_CLOSE',
                    entityId: period.id,
                    action: 'CREATE',
                },
            })
            : null;
        const verification = period?.openingVerificationId
            ? await prisma.periodOpeningVerification.findUnique({
                where: { id: period.openingVerificationId },
            })
            : null;
        const [membershipCount, unitCount, setting] = await Promise.all([
            prisma.tenantMember.count({ where: { tenantId: hotel.id, isActive: true } }),
            prisma.unit.count({ where: { tenantId: hotel.id } }),
            prisma.tenantSetting.findUnique({
                where: { tenantId_key: { tenantId: hotel.id, key: 'allowOpeningBalance' } },
            }),
        ]);
        const proof = {
            label,
            parentId: hotel.parentId,
            periodStatus: period?.status ?? null,
            periodAuditAction: audit?.action ?? null,
            periodAuditActor: audit?.changedBy ?? null,
            verificationType: verification?.verificationType ?? null,
            verificationStatus: verification?.status ?? null,
            bootstrapSource: verification?.bootstrapSource ?? null,
            membershipCount,
            unitCount,
            openingBalanceSetting: setting?.value ?? null,
        };
        console.log('[proof] p1-14-hotel-provisioning', JSON.stringify(proof));
        assert.ok(proof.parentId);
        assert.equal(proof.periodStatus, 'OPEN');
        assert.equal(proof.periodAuditAction, 'CREATE');
        assert.equal(proof.periodAuditActor, platformAdminId);
        assert.equal(proof.verificationType, 'BOOTSTRAP');
        assert.equal(proof.verificationStatus, 'PASS');
        assert.equal(proof.bootstrapSource, 'SUPER_ADMIN_PROVISIONING');
        assert.ok(proof.membershipCount >= 1);
        assert.ok(proof.unitCount >= 1);
        assert.equal(proof.openingBalanceSetting, 'LOCKED');
    };

    try {
        const platformAdmin = await prisma.user.create({
            data: {
                email: `platform-admin-${emailSuffix}@it.local`,
                passwordHash: 'integration-test-not-used',
                firstName: 'Platform',
                lastName: 'Admin',
            },
        });
        platformAdminId = platformAdmin.id;

        const parent = await createTenant(
            {
                name: `P1 Parent ${runContext.runId}`,
                slug: `${slugPrefix}-parent`,
                hasBranches: true,
                maxBranches: 5,
                adminUser: {
                    email: `org-manager-${emailSuffix}@it.local`,
                    password: 'Integration-Test-Password-123!',
                    firstName: 'Org',
                    lastName: 'Manager',
                },
            },
            platformAdminId,
            '127.0.0.1',
        );

        await t.test('child hotel with explicit administrator', async () => {
            const hotel = await createTenant(
                {
                    name: `P1 Explicit Hotel ${runContext.runId}`,
                    slug: `${slugPrefix}-explicit`,
                    parentId: parent.id,
                    adminUser: {
                        email: `hotel-admin-${emailSuffix}@it.local`,
                        password: 'Integration-Test-Password-123!',
                        firstName: 'Hotel',
                        lastName: 'Admin',
                    },
                },
                platformAdminId,
                '127.0.0.1',
            );
            await assertHotelProvisioned(hotel, 'createTenant-explicit-admin');
        });

        await t.test('child hotel inheriting organization manager', async () => {
            const hotel = await createTenant(
                {
                    name: `P1 Inherited Hotel ${runContext.runId}`,
                    slug: `${slugPrefix}-inherited`,
                    parentId: parent.id,
                },
                platformAdminId,
                '127.0.0.1',
            );
            await assertHotelProvisioned(hotel, 'createTenant-inherited-manager');
        });

        await t.test('full organization with shared hotel administrator', async () => {
            const created = await createFullOrganization(
                {
                    organization: {
                        name: `P1 Full Shared Org ${runContext.runId}`,
                        slug: `${slugPrefix}-full-shared-org`,
                    },
                    hotel: {
                        name: `P1 Full Shared Hotel ${runContext.runId}`,
                        slug: `${slugPrefix}-full-shared-hotel`,
                    },
                    adminUser: {
                        email: `full-shared-${emailSuffix}@it.local`,
                        password: 'Integration-Test-Password-123!',
                        firstName: 'Full',
                        lastName: 'Shared',
                    },
                },
                platformAdminId,
                '127.0.0.1',
            );
            await assertHotelProvisioned(created.hotel, 'createFullOrganization-shared-admin');
        });

        await t.test('full organization with separate hotel administrator', async () => {
            const created = await createFullOrganization(
                {
                    organization: {
                        name: `P1 Full Separate Org ${runContext.runId}`,
                        slug: `${slugPrefix}-full-separate-org`,
                    },
                    hotel: {
                        name: `P1 Full Separate Hotel ${runContext.runId}`,
                        slug: `${slugPrefix}-full-separate-hotel`,
                        adminUser: {
                            email: `full-hotel-${emailSuffix}@it.local`,
                            password: 'Integration-Test-Password-123!',
                            firstName: 'Full',
                            lastName: 'Hotel',
                        },
                    },
                    adminUser: {
                        email: `full-org-${emailSuffix}@it.local`,
                        password: 'Integration-Test-Password-123!',
                        firstName: 'Full',
                        lastName: 'Organization',
                    },
                },
                platformAdminId,
                '127.0.0.1',
            );
            await assertHotelProvisioned(created.hotel, 'createFullOrganization-separate-admin');
        });
    } finally {
        const tenants = await prisma.tenant.findMany({
            where: { slug: { startsWith: slugPrefix } },
            select: { id: true, parentId: true },
        });
        const tenantIds = tenants.map((row) => row.id);
        const users = await prisma.user.findMany({
            where: { email: { endsWith: `${emailSuffix}@it.local` } },
            select: { id: true },
        });
        const userIds = users.map((row) => row.id);
        if (tenantIds.length > 0) {
            await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.superAdminLog.deleteMany({ where: { targetTenantId: { in: tenantIds } } });
            await prisma.periodClose.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.tenantSetting.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.unit.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.tenantMember.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.tenant.deleteMany({ where: { id: { in: tenantIds }, parentId: { not: null } } });
            await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
        }
        if (platformAdminId) {
            await prisma.superAdminLog.deleteMany({ where: { adminUserId: platformAdminId } });
        }
        if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        await prisma.$disconnect();
    }
});
