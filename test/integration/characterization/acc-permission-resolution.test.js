'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('../../harness/run-context');
const { createMinimalAccCatalog } = require('../../harness/acc-minimal-catalog');
const { createDisposableAccActors } = require('../../harness/disposable-acc-actors');
const { cleanupAccFixture } = require('../../harness/cleanup-acc-fixture');

test('ACC permission resolution — granted and denied via property-scoped assignment', async (t) => {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    let catalog;
    let actors;
    let runtimeSettingIdsBefore = new Set();
    let runtimeSettingsExistedBefore = false;

    try {
        catalog = await createMinimalAccCatalog(prisma, runContext);
        actors = await createDisposableAccActors(prisma, runContext, catalog);

        const settingsBefore = await prisma.accRuntimeSetting.findMany({ select: { id: true } });
        runtimeSettingIdsBefore = new Set(settingsBefore.map((row) => row.id));
        runtimeSettingsExistedBefore = settingsBefore.length > 0;

        const { resolvePermissionsForMembership } = require('../../../src/acc-runtime');

        await t.test('granted user receives run permission from ur_role_permissions', async () => {
            const permissions = await resolvePermissionsForMembership({
                userId: actors.grantedUserId,
                membership: actors.grantedMembership,
                roleId: actors.grantedMembership.roleId,
                roleCode: actors.grantedMembership.role.code,
                tenantId: actors.tenantId,
                tenantSlug: actors.tenantSlug,
            });

            assert.ok(Array.isArray(permissions), 'permissions must be an array');
            assert.ok(
                permissions.includes(catalog.legacyCode),
                `expected granted permissions to include ${catalog.legacyCode}`,
            );
            assert.equal(
                new Set(permissions).size,
                permissions.length,
                'permissions must not contain duplicates',
            );

            const assignment = await prisma.urUserAssignment.findFirst({
                where: {
                    id: actors.grantedAssignmentId,
                    userId: actors.grantedUserId,
                    properties: { some: { propertyId: actors.tenantId } },
                },
            });
            assert.ok(assignment, 'granted assignment must be property-scoped to test tenant');
            assert.ok(
                !assignment.notes || !assignment.notes.startsWith('legacy:'),
                'must not rely on legacy notes assignment path',
            );
        });

        await t.test('denied user does not receive run permission', async () => {
            const permissions = await resolvePermissionsForMembership({
                userId: actors.deniedUserId,
                membership: actors.deniedMembership,
                roleId: actors.deniedMembership.roleId,
                roleCode: actors.deniedMembership.role.code,
                tenantId: actors.tenantId,
                tenantSlug: actors.tenantSlug,
            });

            assert.ok(Array.isArray(permissions), 'permissions must be an array');
            assert.ok(
                !permissions.includes(catalog.legacyCode),
                `denied user must not receive ${catalog.legacyCode}`,
            );

            const deniedMapping = await prisma.urRolePermission.findFirst({
                where: {
                    roleId: catalog.deniedRoleId,
                    permissionId: catalog.permissionId,
                },
            });
            assert.equal(deniedMapping, null, 'denied role must not have ur_role_permission grant');

            const legacyMapping = await prisma.rolePermission.findFirst({
                where: {
                    roleId: catalog.deniedRoleId,
                    permission: { code: catalog.legacyCode },
                },
            });
            assert.equal(legacyMapping, null, 'denied role must not have legacy role_permissions grant');
        });
    } finally {
        try {
            if (catalog && actors) {
                await cleanupAccFixture(prisma, {
                    runContext,
                    catalog,
                    actors,
                    runtimeSettingIdsBefore,
                });
            }
        } finally {
            await prisma.$disconnect();
        }
    }

    t.diagnostic(
        `acc_runtime_settings existed before resolver: ${runtimeSettingsExistedBefore}; side-effect rows cleaned when newly created`,
    );
});
