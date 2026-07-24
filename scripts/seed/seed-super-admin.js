/**
 * System initializer — global Role rows + SUPER_ADMIN user.
 *
 * Ensures `connectRole(...)` and tenant/org flows find every role code the API uses.
 * Roles are tenant-agnostic (`tenantId: null`).
 *
 * Usage: node scripts/seed/seed-super-admin.js
 */
const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('../../src/utils/password');
const { PERMISSIONS, getPermissionsForRole } = require('../../src/middleware/authorize');
const { SYSTEM_ROLE_DEFINITIONS } = require('../../src/constants/role-codes.constants');

const prisma = new PrismaClient();

/** Canonical system roles — sourced from role-codes.constants (S4A). */
const SYSTEM_ROLES = SYSTEM_ROLE_DEFINITIONS;

async function seedSystemRoles() {
    console.log('── Seeding system roles (global) ──');
    for (const { code, name } of SYSTEM_ROLES) {
        await prisma.role.upsert({
            where: { code },
            update: { name, isActive: true },
            create: { code, name, tenantId: null, isActive: true },
        });
        console.log(`  ✅ Role ${code}`);
    }
}

/**
 * Canonical permission rows from the static matrix (idempotent).
 */
async function seedPermissions() {
    console.log('\n── Seeding permissions (from PERMISSIONS matrix) ──');
    const keys = Object.keys(PERMISSIONS);
    for (const code of keys) {
        await prisma.permission.upsert({
            where: { code },
            create: { code, name: code },
            update: { name: code },
        });
    }
    console.log(`  ✅ ${keys.length} permission(s) upserted`);
}

/**
 * Role ↔ Permission links aligned with getPermissionsForRole() (idempotent).
 */
async function seedRolePermissions() {
    console.log('\n── Seeding role_permissions (sync: remove stale links) ──');
    let linkCount = 0;
    for (const { code: roleCode } of SYSTEM_ROLES) {
        const role = await prisma.role.findUnique({
            where: { code: roleCode },
            select: { id: true },
        });
        if (!role) {
            throw new Error(`Role not found: ${roleCode}`);
        }
        let permissionRows;
        let permissionCodes;
        if (roleCode === 'ORG_MANAGER') {
            permissionRows = await prisma.permission.findMany({
                select: { id: true, code: true },
            });
            permissionCodes = permissionRows.map((p) => p.code);
        } else {
            permissionCodes = getPermissionsForRole(roleCode);
            permissionRows = await prisma.permission.findMany({
                where: { code: { in: permissionCodes } },
                select: { id: true, code: true },
            });
            if (permissionRows.length !== permissionCodes.length) {
                const found = new Set(permissionRows.map((p) => p.code));
                const missing = permissionCodes.filter((c) => !found.has(c));
                throw new Error(`Permission(s) missing in DB: ${missing.join(', ')}`);
            }
        }
        const allowedIds = permissionRows.map((p) => p.id);

        const removed = await prisma.rolePermission.deleteMany({
            where: {
                roleId: role.id,
                permissionId: { notIn: allowedIds },
            },
        });
        if (removed.count > 0) {
            console.log(`  ↪ ${roleCode}: removed ${removed.count} stale permission link(s)`);
        }

        for (const permCode of permissionCodes) {
            const permission = permissionRows.find((p) => p.code === permCode);
            if (!permission) {
                throw new Error(`Permission not found: ${permCode}`);
            }
            await prisma.rolePermission.upsert({
                where: {
                    roleId_permissionId: {
                        roleId: role.id,
                        permissionId: permission.id,
                    },
                },
                create: {
                    roleId: role.id,
                    permissionId: permission.id,
                },
                update: {},
            });
            linkCount += 1;
        }
    }
    console.log(`  ✅ ${linkCount} role_permission link(s) in sync`);
}

async function main() {
    console.log('── System initializer (roles + SUPER_ADMIN) ──\n');

    await seedSystemRoles();
    await seedPermissions();
    await seedRolePermissions();

    const superAdminRole = await prisma.role.findUnique({
        where: { code: 'SUPER_ADMIN' },
        select: { id: true },
    });
    if (!superAdminRole) {
        throw new Error('SUPER_ADMIN role missing after seedSystemRoles()');
    }

    const email = 'superadmin@ose.cloud';
    const password = 'superadmin@2026';
    const pwHash = await hashPassword(password);

    const user = await prisma.user.upsert({
        where: { email },
        update: {
            passwordHash: pwHash,
            isActive: true,
        },
        create: {
            email,
            passwordHash: pwHash,
            firstName: 'Super',
            lastName: 'Admin',
            isActive: true,
        },
    });
    console.log(`  ✅ User SUPER_ADMIN: ${user.email}`);

    const existingMembership = await prisma.tenantMember.findFirst({
        where: { userId: user.id, tenantId: null },
    });

    if (existingMembership) {
        await prisma.tenantMember.update({
            where: { id: existingMembership.id },
            data: {
                roleId: superAdminRole.id,
                isActive: true,
            },
        });
        console.log('  ✅ Global membership updated');
    } else {
        await prisma.tenantMember.create({
            data: {
                user: { connect: { id: user.id } },
                role: { connect: { id: superAdminRole.id } },
                isActive: true,
            },
        });
        console.log('  ✅ Global membership created');
    }

    console.log('\n── Done. Login as SUPER_ADMIN at /api/auth/login ──');
    console.log(`   email: ${email}`);
    console.log(`   password: ${password}`);
    console.log('   tenantSlug: (optional for super admin)');
}

main()
    .catch((e) => {
        console.error('❌ Error during seeding:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
