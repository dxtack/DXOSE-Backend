'use strict';

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { createRunContext } = require('./run-context');
const { ensureCanonicalPermission } = require('./disposable-grn-fixture');
const {
    createMovementAdjustmentFixture,
    cleanupMovementAdjustmentFixture,
} = require('./disposable-movement-adjustment-fixture');

const INTEGRATION_PASSWORD = 'integration-test-password-not-used';

async function grantRolePermissions(prisma, roleId, permissionIds) {
    const existing = await prisma.urRolePermission.findMany({
        where: { roleId, permissionId: { in: permissionIds } },
        select: { permissionId: true },
    });
    const have = new Set(existing.map((r) => r.permissionId));
    const toAdd = permissionIds.filter((id) => !have.has(id));
    if (toAdd.length) {
        await prisma.urRolePermission.createMany({
            data: toAdd.map((permissionId) => ({ roleId, permissionId })),
        });
    }
}

async function setupE2eMovementFixture(outputPath) {
    const runContext = createRunContext();
    const prisma = new PrismaClient();
    try {
        const fixture = await createMovementAdjustmentFixture(prisma, runContext);

        const dashboardPerm = await ensureCanonicalPermission(prisma, 'VIEW_DASHBOARD', fixture.runId);
        const ledgerPerm = await ensureCanonicalPermission(prisma, 'LEDGER_VIEW', fixture.runId);
        const inventoryPerm = await ensureCanonicalPermission(prisma, 'INVENTORY_VIEW', fixture.runId);
        const masterDataPerm = await ensureCanonicalPermission(prisma, 'VIEW_MASTER_DATA', fixture.runId);

        const creatorRole = await prisma.role.findFirst({
            where: { code: fixture.codes.creatorRoleCode },
        });
        const viewerRole = await prisma.role.findFirst({
            where: { code: fixture.codes.viewerRoleCode },
        });

        await grantRolePermissions(prisma, creatorRole.id, [
            dashboardPerm.permission.id,
            ledgerPerm.permission.id,
            inventoryPerm.permission.id,
            masterDataPerm.permission.id,
        ]);
        await grantRolePermissions(prisma, viewerRole.id, [dashboardPerm.permission.id]);

        const creatorEmail = runContext.integrationEmail('adj-creator');
        const viewerEmail = runContext.integrationEmail('adj-viewer');

        const payload = {
            runId: fixture.runId,
            password: INTEGRATION_PASSWORD,
            creator: {
                email: creatorEmail,
                tenantSlug: fixture.codes.tenantSlugA,
                userId: fixture.creatorUser.id,
            },
            viewer: {
                email: viewerEmail,
                tenantSlug: fixture.codes.tenantSlugA,
                userId: fixture.viewerUser.id,
            },
            tenantBViewer: {
                email: runContext.integrationEmail('adj-b-viewer'),
                tenantSlug: fixture.codes.tenantSlugB,
                userId: fixture.tenantBViewer.id,
            },
            itemId: fixture.item.id,
            itemName: fixture.codes.itemName,
            locationId: fixture.location.id,
            locationName: fixture.codes.locName,
            tenantAId: fixture.tenantA.id,
            tenantBId: fixture.tenantB.id,
            _internal: fixture,
        };

        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
        return payload;
    } finally {
        await prisma.$disconnect();
    }
}

async function teardownE2eMovementFixture(fixturePath) {
    if (!fs.existsSync(fixturePath)) return;
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const fixture = raw._internal;
    if (!fixture) return;
    const prisma = new PrismaClient();
    try {
        await cleanupMovementAdjustmentFixture(prisma, fixture);
    } finally {
        await prisma.$disconnect();
        fs.unlinkSync(fixturePath);
    }
}

module.exports = {
    setupE2eMovementFixture,
    teardownE2eMovementFixture,
};
