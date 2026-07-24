/**
 * Repair legacy org access: ensure ORG_MANAGER users are active ORG_MANAGER on every branch.
 *
 * Usage:
 *   node scripts/repair-org-hotel-access.js rotana
 *   node scripts/repair-org-hotel-access.js rotana amr.seif@dx.com
 */
require('dotenv').config();
const prisma = require('../src/config/database');
const { connectRole, membershipRoleCode } = require('../src/services/rbac.service');
const { findActiveTenantBySlug } = require('../src/utils/tenantSlugResolve');
const { normalizeEmailForLookup } = require('../src/utils/emailNormalize');

const orgSlug = process.argv[2];
const userEmailArg = process.argv[3];

async function main() {
    if (!orgSlug) {
        console.error('Usage: node scripts/repair-org-hotel-access.js <orgSlug> [userEmail]');
        process.exitCode = 1;
        return;
    }

    const org = await findActiveTenantBySlug(prisma, orgSlug);
    if (!org || org.parentId) {
        console.error('Organization not found:', orgSlug);
        process.exitCode = 1;
        return;
    }

    console.log('Organization:', org.name, `(${org.slug})`, org.id);

    let orgManagers = await prisma.tenantMember.findMany({
        where: {
            tenantId: org.id,
            role: { code: 'ORG_MANAGER' },
            isActive: true,
            user: { isActive: true },
        },
        include: { user: { select: { id: true, email: true } } },
    });

    if (userEmailArg) {
        const email = normalizeEmailForLookup(userEmailArg);
        orgManagers = orgManagers.filter((m) => normalizeEmailForLookup(m.user.email) === email);
        if (orgManagers.length === 0) {
            const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
            if (!user) {
                console.error('User not found and is not ORG_MANAGER on this org:', userEmailArg);
                process.exitCode = 1;
                return;
            }
            orgManagers = [{ userId: user.id, user: { id: user.id, email: user.email } }];
            console.log('Will grant ORG_MANAGER on branches for user (not org manager yet):', user.email);
        }
    }

    const branches = await prisma.tenant.findMany({
        where: { parentId: org.id },
        select: { id: true, name: true, slug: true, isActive: true },
        orderBy: { slug: 'asc' },
    });

    console.log('Branches:', branches.length);

    for (const branch of branches) {
        for (const om of orgManagers) {
            const before = await prisma.tenantMember.findUnique({
                where: { tenantId_userId: { tenantId: branch.id, userId: om.userId } },
                include: { role: true },
            });

            await prisma.tenantMember.upsert({
                where: { tenantId_userId: { tenantId: branch.id, userId: om.userId } },
                create: {
                    tenant: { connect: { id: branch.id } },
                    user: { connect: { id: om.userId } },
                    role: connectRole('ORG_MANAGER'),
                    isActive: true,
                },
                update: {
                    role: connectRole('ORG_MANAGER'),
                    isActive: true,
                },
            });

            const after = await prisma.tenantMember.findUnique({
                where: { tenantId_userId: { tenantId: branch.id, userId: om.userId } },
                include: { role: true },
            });
            console.log(
                `  ${branch.slug}: ${om.user.email}`,
                before
                    ? `was ${membershipRoleCode(before)} active=${before.isActive} -> ${membershipRoleCode(after)} active`
                    : `created ${membershipRoleCode(after)}`,
            );
        }
    }

    console.log('\nDone. Users should switch hotels without logout.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
