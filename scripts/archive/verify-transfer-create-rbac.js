'use strict';

/**
 * Verify TRANSFER_CREATE for DEPT_MANAGER (DB + matrix).
 * Usage:
 *   node scripts/verify-transfer-create-rbac.js
 *   node scripts/verify-transfer-create-rbac.js hassan@example.com
 */

require('dotenv').config();
const prisma = require('../src/config/database');
const { getPermissionsForMembership, getRoleIdByCode } = require('../src/services/rbac.service');
const { getPermissionsForRole } = require('../src/middleware/authorize');

const emailArg = process.argv[2];

async function main() {
    const matrixOk = getPermissionsForRole('DEPT_MANAGER').includes('TRANSFER_CREATE');
    console.log('Matrix DEPT_MANAGER has TRANSFER_CREATE:', matrixOk);

    const perm = await prisma.permission.findUnique({
        where: { code: 'TRANSFER_CREATE' },
        select: { id: true, code: true },
    });
    console.log('Permission row TRANSFER_CREATE:', perm ? perm.id : 'MISSING');

    const role = await prisma.role.findUnique({
        where: { code: 'DEPT_MANAGER' },
        select: { id: true, code: true },
    });
    console.log('Role DEPT_MANAGER:', role ? role.id : 'MISSING');

    if (role && perm) {
        const link = await prisma.rolePermission.findUnique({
            where: {
                roleId_permissionId: { roleId: role.id, permissionId: perm.id },
            },
        });
        console.log('role_permissions link DEPT_MANAGER ↔ TRANSFER_CREATE:', link ? 'OK' : 'MISSING');
    }

    const roleId = await getRoleIdByCode('DEPT_MANAGER');
    const jwtPerms = await getPermissionsForMembership({ roleId, roleCode: 'DEPT_MANAGER' });
    console.log('getPermissionsForMembership(DEPT_MANAGER) count:', jwtPerms.length);
    console.log('includes TRANSFER_CREATE:', jwtPerms.includes('TRANSFER_CREATE'));

    if (emailArg) {
        const user = await prisma.user.findFirst({
            where: { email: { equals: emailArg, mode: 'insensitive' } },
            select: {
                id: true,
                email: true,
                tenantMembers: {
                    where: { isActive: true },
                    select: {
                        tenant: { select: { slug: true, name: true } },
                        role: { select: { code: true, name: true } },
                    },
                },
            },
        });
        if (!user) {
            console.log(`\nUser not found: ${emailArg}`);
        } else {
            console.log(`\nUser ${user.email} (${user.id})`);
            for (const m of user.tenantMembers) {
                const rid = await getRoleIdByCode(m.role.code);
                const perms = await getPermissionsForMembership({
                    roleId: rid,
                    roleCode: m.role.code,
                });
                console.log(
                    `  tenant=${m.tenant.slug} role=${m.role.code} TRANSFER_CREATE=${perms.includes('TRANSFER_CREATE')}`,
                );
            }
        }
    }

    await prisma.$disconnect();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
