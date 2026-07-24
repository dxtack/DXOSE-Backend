'use strict';

/**
 * Ensures Inventory Count v3 integration test users on grand-horizon tenant.
 * Usage: node scripts/ensure-inventory-count-test-fixtures.js
 */

const bcrypt = require('bcryptjs');
const prisma = require('../src/config/database');

const TENANT_SLUG = process.env.OSE_TENANT_SLUG || 'grand-horizon';
const PASSWORD = process.env.OSE_TEST_PASSWORD || 'Admin@123';

const FIXTURES = [
    {
        email: 'gm@grandhorizon.com',
        firstName: 'Grand',
        lastName: 'Manager',
        roleCode: 'GENERAL_MANAGER',
        permissions: ['APPROVE_INVENTORY_COUNT'],
    },
    {
        email: 'receiving@grandhorizon.com',
        firstName: 'Receiving',
        lastName: 'Clerk',
        roleCode: 'STOREKEEPER',
        permissions: [
            'STOCK_COUNT_VIEW',
            'STOCK_COUNT_CREATE',
            'STOCK_COUNT_EXECUTE',
            'STOCK_COUNT_CANCEL',
            'STOCK_COUNT_RECOUNT',
            'STOCK_COUNT_SUBMIT',
        ],
    },
];

const STOREKEEPER_COUNT_PERMISSIONS = [
    'BASIC_DATA_VIEW',
    'INVENTORY_VIEW',
    'STOCK_COUNT_VIEW',
    'STOCK_COUNT_CREATE',
    'STOCK_COUNT_EXECUTE',
    'STOCK_COUNT_CANCEL',
    'STOCK_COUNT_RECOUNT',
    'STOCK_COUNT_SUBMIT',
    'VIEW_DASHBOARD',
    'DASHBOARD_VIEW',
];

async function ensureLegacyRolePermissions(roleId, legacyCodes) {
    for (const code of legacyCodes) {
        const perm = await prisma.permission.findFirst({ where: { code } });
        if (!perm) continue;
        await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId, permissionId: perm.id } },
            update: {},
            create: { roleId, permissionId: perm.id },
        });
    }
}

async function ensureUrRolePermissions(roleId, legacyCodes) {
    for (const legacyCode of legacyCodes) {
        const urPerm = await prisma.urPermission.findFirst({ where: { legacyCode } });
        if (!urPerm) continue;
        await prisma.urRolePermission.upsert({
            where: { roleId_permissionId: { roleId, permissionId: urPerm.id } },
            update: {},
            create: { roleId, permissionId: urPerm.id },
        });
    }
}

async function ensureUser({ email, firstName, lastName, roleCode, tenantId, roleId }) {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const user = await prisma.user.upsert({
        where: { email },
        update: { passwordHash, firstName, lastName, isActive: true, permissionVersion: { increment: 1 } },
        create: { email, passwordHash, firstName, lastName, isActive: true },
    });

    await prisma.tenantMember.upsert({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        update: { roleId, isActive: true },
        create: { tenantId, userId: user.id, roleId, isActive: true },
    });

    const assignment = await prisma.urUserAssignment.findFirst({
        where: { userId: user.id, roleId, isActive: true },
    });

    let assignmentId;
    if (assignment) {
        assignmentId = assignment.id;
    } else {
        const created = await prisma.urUserAssignment.create({
            data: { userId: user.id, roleId, isActive: true, notes: 'inventory-count-v3 integration fixture' },
        });
        assignmentId = created.id;
    }

    const propLink = await prisma.urAssignmentProperty.findFirst({
        where: { assignmentId, propertyId: tenantId },
    });
    if (!propLink) {
        await prisma.urAssignmentProperty.create({
            data: { assignmentId, propertyId: tenantId },
        });
    }

    return { userId: user.id, assignmentId, email, roleCode };
}

async function main() {
    const tenant = await prisma.tenant.findFirst({
        where: { slug: TENANT_SLUG },
        select: { id: true, name: true, slug: true },
    });
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_SLUG}`);

    // Use canonical STOREKEEPER — do not recreate retired RECEIVER (P1 #22).
    const storekeeperRole = await prisma.role.findFirst({ where: { code: 'STOREKEEPER', isActive: true } });
    if (!storekeeperRole) throw new Error('STOREKEEPER role missing/inactive');
    await ensureLegacyRolePermissions(storekeeperRole.id, STOREKEEPER_COUNT_PERMISSIONS);
    await ensureUrRolePermissions(storekeeperRole.id, STOREKEEPER_COUNT_PERMISSIONS);

    const gmRole = await prisma.role.findFirst({ where: { code: 'GENERAL_MANAGER' } });
    if (!gmRole) throw new Error('GENERAL_MANAGER role missing');

    const results = [];
    for (const fx of FIXTURES) {
        const roleId = fx.roleCode === 'STOREKEEPER' ? storekeeperRole.id : gmRole.id;
        const row = await ensureUser({ ...fx, tenantId: tenant.id, roleId });
        results.push({ ...row, password: PASSWORD, tenantSlug: TENANT_SLUG });
    }

    // Also reset password for gm-a@closeout-audit.local if present (known GM on tenant)
    const legacyGm = await prisma.user.findFirst({ where: { email: 'gm-a@closeout-audit.local' } });
    if (legacyGm) {
        const passwordHash = await bcrypt.hash(PASSWORD, 10);
        await prisma.user.update({
            where: { id: legacyGm.id },
            data: { passwordHash, permissionVersion: { increment: 1 } },
        });
        results.push({ email: legacyGm.email, userId: legacyGm.id, password: PASSWORD, note: 'password reset' });
    }

    console.log(JSON.stringify({ ok: true, tenant, fixtures: results }, null, 2));
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
