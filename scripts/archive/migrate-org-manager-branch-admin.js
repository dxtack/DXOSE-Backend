/**
 * Phase B — Convert legacy branch ADMIN memberships to ORG_MANAGER for org managers.
 *
 * For each active branch tenant membership with role ADMIN, when the user is an active
 * ORG_MANAGER on the parent organization, update the branch row to ORG_MANAGER.
 *
 * Usage:
 *   node scripts/migrate-org-manager-branch-admin.js
 *   node scripts/migrate-org-manager-branch-admin.js --dry-run
 */
require('dotenv').config();
const prisma = require('../src/config/database');
const { connectRole, membershipRoleCode } = require('../src/services/rbac.service');

const dryRun = process.argv.includes('--dry-run');

async function main() {
    const branchAdminMemberships = await prisma.tenantMember.findMany({
        where: {
            isActive: true,
            role: { code: 'ADMIN' },
            tenant: { parentId: { not: null } },
        },
        include: {
            user: { select: { id: true, email: true, isActive: true } },
            tenant: { select: { id: true, name: true, slug: true, parentId: true } },
            role: true,
        },
        orderBy: [{ tenant: { slug: 'asc' } }, { user: { email: 'asc' } }],
    });

    console.log(`Found ${branchAdminMemberships.length} active branch ADMIN membership(s).`);
    if (branchAdminMemberships.length === 0) {
        return;
    }

    let converted = 0;
    let skipped = 0;

    for (const membership of branchAdminMemberships) {
        const parentOrgId = membership.tenant?.parentId;
        if (!parentOrgId) {
            skipped += 1;
            continue;
        }

        const parentOm = await prisma.tenantMember.findFirst({
            where: {
                userId: membership.userId,
                tenantId: parentOrgId,
                isActive: true,
                role: { code: 'ORG_MANAGER' },
            },
            select: { id: true },
        });

        if (!parentOm) {
            skipped += 1;
            console.log(
                `  skip ${membership.user.email} @ ${membership.tenant.slug}: no parent ORG_MANAGER`,
            );
            continue;
        }

        console.log(
            `  ${dryRun ? '[dry-run] ' : ''}${membership.user.email} @ ${membership.tenant.slug}: ${membershipRoleCode(membership)} -> ORG_MANAGER`,
        );

        if (!dryRun) {
            await prisma.tenantMember.update({
                where: { id: membership.id },
                data: { role: connectRole('ORG_MANAGER') },
            });
            await prisma.user.update({
                where: { id: membership.userId },
                data: { permissionVersion: { increment: 1 } },
            });
        }

        converted += 1;
    }

    console.log(`\nDone. converted=${converted} skipped=${skipped}${dryRun ? ' (dry-run)' : ''}.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
