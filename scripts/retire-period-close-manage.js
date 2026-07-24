'use strict';

const path = require('path');
const dotenv = require('dotenv');

const LEGACY_CODE = ['PERIOD', 'CLOSE', 'MANAGE'].join('_');
const REQUIRED_DB = 'ose_inventory_test';

dotenv.config({ path: path.resolve(__dirname, '..', '.env.test.local'), override: true });
const databaseUrl = process.env.OSE_TEST_DATABASE_URL;
if (!databaseUrl) throw new Error('OSE_TEST_DATABASE_URL is required from .env.test.local.');
process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = 'test';

const parsed = new URL(databaseUrl);
const databaseName = parsed.pathname.replace(/^\//, '');
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!localHosts.has(parsed.hostname) || databaseName !== REQUIRED_DB) {
    throw new Error(`Refusing permission cleanup outside local ${REQUIRED_DB}.`);
}

const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run') || !apply;
const confirmation = process.argv.find((arg) => arg.startsWith('--confirm-db='));
if (apply && confirmation !== `--confirm-db=${REQUIRED_DB}`) {
    throw new Error(`Apply requires --confirm-db=${REQUIRED_DB}.`);
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inventory(db) {
    const [legacyPermission, urPermission] = await Promise.all([
        db.permission.findUnique({ where: { code: LEGACY_CODE } }),
        db.urPermission.findUnique({ where: { legacyCode: LEGACY_CODE } }),
    ]);

    const [
        roleGrants,
        urRoleGrants,
        userPermissionOverrides,
        userOverrides,
        userExceptions,
        workflowSteps,
    ] = await Promise.all([
        legacyPermission
            ? db.rolePermission.findMany({ where: { permissionId: legacyPermission.id }, select: { roleId: true } })
            : [],
        urPermission
            ? db.urRolePermission.findMany({ where: { permissionId: urPermission.id }, select: { roleId: true } })
            : [],
        urPermission
            ? db.urUserPermissionOverride.findMany({
                where: { permissionId: urPermission.id },
                select: { id: true, userId: true },
            })
            : [],
        urPermission
            ? db.urUserOverride.findMany({
                where: { permissionId: urPermission.id },
                select: { id: true, userId: true },
            })
            : [],
        urPermission
            ? db.accUserException.findMany({
                where: { permissionId: urPermission.id },
                select: { id: true, userId: true },
            })
            : [],
        urPermission
            ? db.accWorkflowStepDefinition.findMany({
                where: { permissionId: urPermission.id },
                select: { id: true, versionId: true, stepOrder: true },
            })
            : [],
    ]);

    const roleIds = [...new Set([...roleGrants, ...urRoleGrants].map((row) => row.roleId))];
    const [members, assignments] = await Promise.all([
        roleIds.length
            ? db.tenantMember.findMany({ where: { roleId: { in: roleIds } }, select: { userId: true } })
            : [],
        roleIds.length
            ? db.urUserAssignment.findMany({ where: { roleId: { in: roleIds } }, select: { userId: true } })
            : [],
    ]);
    const affectedUserIds = [...new Set([
        ...members,
        ...assignments,
        ...userPermissionOverrides,
        ...userOverrides,
        ...userExceptions,
    ].map((row) => row.userId))];

    return {
        legacyPermission,
        urPermission,
        roleGrants,
        urRoleGrants,
        userPermissionOverrides,
        userOverrides,
        userExceptions,
        workflowSteps,
        affectedUserIds,
    };
}

function summary(state) {
    return {
        database: REQUIRED_DB,
        mode: dryRun ? 'DRY_RUN' : 'APPLY',
        permissionCatalogRows: Number(Boolean(state.legacyPermission)),
        urPermissionCatalogRows: Number(Boolean(state.urPermission)),
        roleGrants: state.roleGrants.length,
        urRoleGrants: state.urRoleGrants.length,
        userPermissionOverrides: state.userPermissionOverrides.length,
        userOverrides: state.userOverrides.length,
        userExceptions: state.userExceptions.length,
        workflowSteps: state.workflowSteps.length,
        affectedUsers: state.affectedUserIds.length,
    };
}

async function main() {
    const dbRows = await prisma.$queryRaw`SELECT current_database() AS name`;
    if (dbRows[0]?.name !== REQUIRED_DB) {
        throw new Error(`Connected database is ${dbRows[0]?.name}; expected ${REQUIRED_DB}.`);
    }

    const before = await inventory(prisma);
    console.log(JSON.stringify({ before: summary(before) }, null, 2));
    if (dryRun) return;
    if (before.workflowSteps.length) {
        throw new Error(`Refusing cleanup: ${before.workflowSteps.length} workflow step(s) still reference ${LEGACY_CODE}.`);
    }

    await prisma.$transaction(async (tx) => {
        if (before.urPermission) {
            const permissionId = before.urPermission.id;
            await tx.accUserException.deleteMany({ where: { permissionId } });
            await tx.urUserOverride.deleteMany({ where: { permissionId } });
            await tx.urUserPermissionOverride.deleteMany({ where: { permissionId } });
            await tx.urRolePermission.deleteMany({ where: { permissionId } });
            await tx.urPermission.delete({ where: { id: permissionId } });
        }
        if (before.legacyPermission) {
            await tx.rolePermission.deleteMany({ where: { permissionId: before.legacyPermission.id } });
            await tx.permission.delete({ where: { id: before.legacyPermission.id } });
        }
        if (before.affectedUserIds.length) {
            await tx.user.updateMany({
                where: { id: { in: before.affectedUserIds } },
                data: { permissionVersion: { increment: 1 } },
            });
        }
    });

    const after = await inventory(prisma);
    const afterSummary = summary(after);
    if (Object.entries(afterSummary).some(([key, value]) => !['database', 'mode'].includes(key) && value !== 0)) {
        throw new Error(`Cleanup verification failed: ${JSON.stringify(afterSummary)}`);
    }
    console.log(JSON.stringify({ after: afterSummary }, null, 2));
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
