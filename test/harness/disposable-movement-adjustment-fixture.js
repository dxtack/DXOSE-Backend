'use strict';

const { hashPassword } = require('../../src/utils/password');
const { ensureCanonicalPermission, issueGrnAccessToken } = require('./disposable-grn-fixture');

const INTEGRATION_PASSWORD = 'integration-test-password-not-used';

async function createRoleWithPermissions(prisma, roleCode, name, permissionIds) {
    const role = await prisma.role.create({
        data: { code: roleCode, name, tenantId: null, isActive: true },
    });
    if (permissionIds.length) {
        await prisma.urRolePermission.createMany({
            data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        });
    }
    return role;
}

async function createUserWithMembership(prisma, { email, tenantId, roleId, firstName }) {
    const user = await prisma.user.create({
        data: {
            email,
            passwordHash: await hashPassword(INTEGRATION_PASSWORD),
            firstName,
            lastName: email.split('@')[0],
            isActive: true,
        },
    });
    await prisma.tenantMember.create({
        data: { tenantId, userId: user.id, roleId, isActive: true },
    });
    return { user };
}

async function createAssignment(prisma, { userId, roleId, tenantId, departmentId = null }) {
    const data = {
        userId,
        roleId,
        isActive: true,
        properties: { create: [{ propertyId: tenantId }] },
    };
    if (departmentId) {
        data.departments = { create: [{ departmentId }] };
    }
    return prisma.urUserAssignment.create({ data });
}

const MOVEMENTS_VIEW = 'MOVEMENTS_VIEW';
const ADJUSTMENT_CREATE = 'ADJUSTMENT_CREATE';

function movementFixtureCodes(runId) {
    return {
        tenantSlugA: `it-adj-a-${runId}`,
        tenantSlugB: `it-adj-b-${runId}`,
        creatorRoleCode: `IT_ADJ_CREATOR_${runId}`,
        viewerRoleCode: `IT_ADJ_VIEWER_${runId}`,
        deptCode: `IT_ADJ_DEPT_${runId}`,
        locName: `IT_ADJ_LOC_${runId}`,
        itemName: `IT_ADJ_ITEM_${runId}`,
    };
}

async function finalizeObForTenant(prisma, tenantId, userId) {
    const snapshot = JSON.stringify({ finalizedAt: new Date().toISOString(), lineCount: 0 });
    await prisma.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
        update: { value: 'LOCKED' },
        create: { tenantId, key: 'allowOpeningBalance', value: 'LOCKED', updatedBy: userId },
    });
    await prisma.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: 'obFinalizeSnapshot' } },
        update: { value: snapshot },
        create: { tenantId, key: 'obFinalizeSnapshot', value: snapshot, updatedBy: userId },
    });
}

async function createMovementAdjustmentFixture(prisma, runContext) {
    const runId = runContext.runId;
    const codes = movementFixtureCodes(runId);

    const permView = await ensureCanonicalPermission(prisma, MOVEMENTS_VIEW, runId);
    const permCreate = await ensureCanonicalPermission(prisma, ADJUSTMENT_CREATE, runId);

    const tenantA = await prisma.tenant.create({
        data: { name: `Adj Tenant A ${runId}`, slug: codes.tenantSlugA, isActive: true },
    });
    const tenantB = await prisma.tenant.create({
        data: { name: `Adj Tenant B ${runId}`, slug: codes.tenantSlugB, isActive: true },
    });

    const creatorRole = await createRoleWithPermissions(prisma, codes.creatorRoleCode, 'Adj Creator', [
        permView.permission.id,
        permCreate.permission.id,
    ]);
    const viewerRole = await createRoleWithPermissions(prisma, codes.viewerRoleCode, 'Adj Viewer', [
        permView.permission.id,
    ]);

    const creatorEmail = runContext.integrationEmail('adj-creator');
    const viewerEmail = runContext.integrationEmail('adj-viewer');

    const { user: creatorUser } = await createUserWithMembership(prisma, {
        email: creatorEmail,
        tenantId: tenantA.id,
        roleId: creatorRole.id,
        firstName: 'AdjCreator',
    });
    const { user: viewerUser } = await createUserWithMembership(prisma, {
        email: viewerEmail,
        tenantId: tenantA.id,
        roleId: viewerRole.id,
        firstName: 'AdjViewer',
    });

    const dept = await prisma.department.create({
        data: { tenantId: tenantA.id, code: codes.deptCode, name: 'Adj Dept', isActive: true },
    });
    const location = await prisma.location.create({
        data: {
            tenantId: tenantA.id,
            departmentId: dept.id,
            name: codes.locName,
            isActive: true,
        },
    });
    const item = await prisma.item.create({
        data: {
            tenantId: tenantA.id,
            name: codes.itemName,
            barcode: `ADJ-${runId}`,
            isActive: true,
            unitPrice: 10,
        },
    });

    await createAssignment(prisma, {
        userId: creatorUser.id,
        roleId: creatorRole.id,
        tenantId: tenantA.id,
        departmentId: dept.id,
    });
    await createAssignment(prisma, {
        userId: viewerUser.id,
        roleId: viewerRole.id,
        tenantId: tenantA.id,
        departmentId: dept.id,
    });

    await finalizeObForTenant(prisma, tenantA.id, creatorUser.id);
    await finalizeObForTenant(prisma, tenantB.id, creatorUser.id);

    await prisma.stockBalance.create({
        data: {
            tenantId: tenantA.id,
            itemId: item.id,
            locationId: location.id,
            qtyOnHand: 100,
            wacUnitCost: 5,
        },
    });

    const creatorToken = await issueGrnAccessToken(creatorUser.id, codes.tenantSlugA);
    const viewerToken = await issueGrnAccessToken(viewerUser.id, codes.tenantSlugA);

    const { user: tenantBViewer } = await createUserWithMembership(prisma, {
        email: runContext.integrationEmail('adj-b-viewer'),
        tenantId: tenantB.id,
        roleId: viewerRole.id,
        firstName: 'AdjBViewer',
    });
    await createAssignment(prisma, {
        userId: tenantBViewer.id,
        roleId: viewerRole.id,
        tenantId: tenantB.id,
    });
    const tenantBViewerToken = await issueGrnAccessToken(tenantBViewer.id, codes.tenantSlugB);

    return {
        runId,
        codes,
        tenantA,
        tenantB,
        creatorUser,
        viewerUser,
        tenantBViewer,
        creatorToken,
        viewerToken,
        tenantBViewerToken,
        dept,
        location,
        item,
    };
}

async function cleanupMovementAdjustmentFixture(prisma, fixture) {
    const { tenantA, tenantB, runId } = fixture;

    for (const tenantId of [tenantA.id, tenantB.id]) {
        await prisma.auditLog.deleteMany({ where: { tenantId } });
        await prisma.inventoryLedger.deleteMany({ where: { tenantId } });
        await prisma.movementLine.deleteMany({
            where: { document: { tenantId } },
        });
        await prisma.movementDocument.deleteMany({ where: { tenantId } });
        await prisma.stockBalance.deleteMany({ where: { tenantId } });
        await prisma.item.deleteMany({ where: { tenantId, name: { contains: runId } } });
        await prisma.location.deleteMany({ where: { tenantId, name: { contains: runId } } });
        await prisma.department.deleteMany({ where: { tenantId, code: { contains: runId } } });
        await prisma.tenantSetting.deleteMany({ where: { tenantId } });
        await prisma.docSequence.deleteMany({ where: { tenantId } });
        await prisma.urUserAssignment.deleteMany({
            where: { properties: { some: { propertyId: tenantId } } },
        });
        await prisma.tenantMember.deleteMany({ where: { tenantId } });
    }

    await prisma.user.deleteMany({
        where: { email: { contains: runId } },
    });
    await prisma.role.deleteMany({
        where: { code: { contains: runId } },
    });
    await prisma.tenant.deleteMany({
        where: { slug: { contains: runId } },
    });
}

module.exports = {
    MOVEMENTS_VIEW,
    ADJUSTMENT_CREATE,
    movementFixtureCodes,
    createMovementAdjustmentFixture,
    cleanupMovementAdjustmentFixture,
};
