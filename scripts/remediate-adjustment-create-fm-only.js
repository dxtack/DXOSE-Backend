'use strict';

/**
 * Remediate ADJUSTMENT_CREATE to FINANCE_MANAGER only (ur_role_permissions + legacy sync).
 * Bumps permissionVersion for affected roles/users so stale JWTs fail closed.
 *
 * Usage: node scripts/remediate-adjustment-create-fm-only.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/config/database');
const { isAccLegacyDualWriteEnabled } = require('../src/acc-runtime/featureFlags');

const FM_ROLE_CODE = 'FINANCE_MANAGER';
const PERM_LEGACY_CODE = 'ADJUSTMENT_CREATE';
const REPORT_PATH = path.join(
    __dirname,
    '../../Governance/timeline-remediation/reports/ADJUSTMENT_CREATE_FM_ONLY_REMEDIATION.json',
);

async function resolveLegacyPermissionId(tx, urPermissionId) {
    const urPerm = await tx.urPermission.findUnique({
        where: { id: urPermissionId },
        select: { legacyCode: true },
    });
    if (!urPerm?.legacyCode) return null;
    const legacy = await tx.permission.findUnique({
        where: { code: urPerm.legacyCode },
        select: { id: true },
    });
    return legacy?.id ?? null;
}

async function syncLegacyForRole(tx, roleId, urPermissionIds) {
    const legacyIds = [];
    for (const urId of urPermissionIds) {
        const legacyId = await resolveLegacyPermissionId(tx, urId);
        if (legacyId) legacyIds.push(legacyId);
    }

    const currentRows = await tx.rolePermission.findMany({
        where: { roleId },
        select: { permissionId: true },
    });
    const currentIds = currentRows.map((r) => r.permissionId);
    const targetSet = new Set(legacyIds);
    const toDelete = currentIds.filter((id) => !targetSet.has(id));
    const currentSet = new Set(currentIds);
    const toInsert = legacyIds.filter((id) => !currentSet.has(id));

    if (toDelete.length > 0) {
        await tx.rolePermission.deleteMany({
            where: { roleId, permissionId: { in: toDelete } },
        });
    }
    if (toInsert.length > 0) {
        await tx.rolePermission.createMany({
            data: toInsert.map((permissionId) => ({ roleId, permissionId })),
            skipDuplicates: true,
        });
    }
    return toDelete.length > 0 || toInsert.length > 0;
}

async function bumpPermissionVersionForRole(roleId) {
    const [members, assignments] = await Promise.all([
        prisma.tenantMember.findMany({
            where: { roleId, isActive: true },
            select: { userId: true },
        }),
        prisma.urUserAssignment.findMany({
            where: { roleId, isActive: true },
            select: { userId: true },
        }),
    ]);
    const userIds = [...new Set([
        ...members.map((m) => m.userId),
        ...assignments.map((a) => a.userId),
    ])];
    if (userIds.length === 0) return 0;
    const result = await prisma.user.updateMany({
        where: { id: { in: userIds } },
        data: { permissionVersion: { increment: 1 } },
    });
    return result.count;
}

async function main() {
    console.log('\n=== ADJUSTMENT_CREATE FM-only remediation ===\n');

    const urPerm = await prisma.urPermission.findUnique({
        where: { legacyCode: PERM_LEGACY_CODE },
        select: { id: true, legacyCode: true },
    });
    if (!urPerm) {
        throw new Error(`ur_permission not found for ${PERM_LEGACY_CODE}`);
    }

    const fmRole = await prisma.role.findUnique({
        where: { code: FM_ROLE_CODE },
        select: { id: true, code: true },
    });
    if (!fmRole) {
        throw new Error(`Role ${FM_ROLE_CODE} not found`);
    }

    const beforeRows = await prisma.urRolePermission.findMany({
        where: { permissionId: urPerm.id },
        include: { role: { select: { code: true } } },
    });

    const nonFmBefore = beforeRows.filter((r) => r.role.code !== FM_ROLE_CODE);
    const removedFromRoles = [];

    for (const row of nonFmBefore) {
        await prisma.$transaction(async (tx) => {
            await tx.urRolePermission.deleteMany({
                where: { roleId: row.roleId, permissionId: urPerm.id },
            });
            if (isAccLegacyDualWriteEnabled()) {
                const remaining = await tx.urRolePermission.findMany({
                    where: { roleId: row.roleId },
                    select: { permissionId: true },
                });
                await syncLegacyForRole(
                    tx,
                    row.roleId,
                    remaining.map((r) => r.permissionId),
                );
            }
        });
        const bumped = await bumpPermissionVersionForRole(row.roleId);
        removedFromRoles.push({
            roleCode: row.role.code,
            roleId: row.roleId,
            usersPermissionVersionBumped: bumped,
        });
        console.log(`Removed ${PERM_LEGACY_CODE} from ${row.role.code} (bumped ${bumped} users)`);
    }

    const fmHas = await prisma.urRolePermission.findFirst({
        where: { roleId: fmRole.id, permissionId: urPerm.id },
    });
    if (!fmHas) {
        await prisma.urRolePermission.create({
            data: { roleId: fmRole.id, permissionId: urPerm.id },
        });
        if (isAccLegacyDualWriteEnabled()) {
            const legacyPerm = await prisma.permission.findUnique({
                where: { code: PERM_LEGACY_CODE },
                select: { id: true },
            });
            if (legacyPerm) {
                await prisma.rolePermission.upsert({
                    where: {
                        roleId_permissionId: { roleId: fmRole.id, permissionId: legacyPerm.id },
                    },
                    update: {},
                    create: { roleId: fmRole.id, permissionId: legacyPerm.id },
                });
            }
        }
        console.log(`Ensured ${PERM_LEGACY_CODE} on ${FM_ROLE_CODE}`);
    }

    const afterRows = await prisma.urRolePermission.findMany({
        where: { permissionId: urPerm.id },
        include: { role: { select: { code: true } } },
    });
    const nonFmAfter = afterRows.filter((r) => r.role.code !== FM_ROLE_CODE);

    const legacyAdjustmentDrafts = await prisma.movementDocument.findMany({
        where: { movementType: 'ADJUSTMENT', status: 'DRAFT' },
        select: {
            id: true,
            documentNo: true,
            tenantId: true,
            createdBy: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
    });

    const report = {
        remediatedAt: new Date().toISOString(),
        permission: PERM_LEGACY_CODE,
        fmOnlyRole: FM_ROLE_CODE,
        beforeGrantCount: beforeRows.length,
        afterGrantCount: afterRows.length,
        removedFromRoles,
        nonFmGrantCountAfter: nonFmAfter.length,
        nonFmRolesAfter: nonFmAfter.map((r) => r.role.code),
        legacyAdjustmentDraftCount: legacyAdjustmentDrafts.length,
        legacyAdjustmentDrafts: legacyAdjustmentDrafts.map((d) => ({
            id: d.id,
            documentNo: d.documentNo,
            tenantId: d.tenantId,
            createdBy: d.createdBy,
            createdAt: d.createdAt,
        })),
        acceptance: {
            nonFmAdjustmentCreateZero: nonFmAfter.length === 0,
        },
    };

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log(`\nAfter remediation: ${afterRows.length} role grant(s)`);
    console.log(`Non-FM grants remaining: ${nonFmAfter.length}`);
    console.log(`Legacy ADJUSTMENT drafts (DRAFT): ${legacyAdjustmentDrafts.length}`);
    console.log(`Report: ${REPORT_PATH}`);
    console.log('\n=== Done ===\n');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
