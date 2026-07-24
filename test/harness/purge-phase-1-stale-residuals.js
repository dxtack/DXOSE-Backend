'use strict';

/**
 * Manual recovery only — NOT invoked by npm run test:safety.
 * Purges stale integration/E2E marker rows from ose_inventory_test after failed cleanups.
 */
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

const backendRoot = path.join(__dirname, '..', '..');
const localEnvPath = path.join(backendRoot, '.env.test.local');

if (!fs.existsSync(localEnvPath)) {
    console.error('[purge-stale-residuals] FAIL: OSE-backend/.env.test.local is missing');
    process.exit(1);
}

dotenv.config({ path: localEnvPath, override: true });
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.OSE_TEST_DATABASE_URL;

const { assertTestDatabaseEnv } = require('./assert-test-database-env');
const { deleteGrnCascade } = require('./grn-id-cleanup');
assertTestDatabaseEnv();

const TEST_TENANT_SLUG_PREFIXES = ['it-', 'e2e-', 'it-grn-'];
const TEST_ROLE_PREFIXES = ['IT_GRN_', 'E2E_', 'IT_GRN_GRANTED_', 'IT_GRN_DENIED_', 'IT_GRN_SCOPE_'];
const TEST_GRN_PREFIXES = ['E2E-GRN-', 'IT-GRN-'];

function tenantWhere() {
    return {
        OR: [
            ...TEST_TENANT_SLUG_PREFIXES.map((prefix) => ({ slug: { startsWith: prefix } })),
            { name: { startsWith: 'Integration Test ' } },
            { name: { startsWith: 'E2E ' } },
        ],
    };
}

function userWhere() {
    return {
        OR: [
            { email: { endsWith: '@it.local' } },
            { email: { contains: 'e2e-' } },
            { email: { contains: 'it-grn-' } },
        ],
    };
}

async function main() {
    const prisma = new PrismaClient();
    try {
        const tenants = await prisma.tenant.findMany({ where: tenantWhere(), select: { id: true } });
        const tenantIds = tenants.map((row) => row.id);
        const users = await prisma.user.findMany({ where: userWhere(), select: { id: true } });
        const userIds = users.map((row) => row.id);
        const grns = await prisma.grnImport.findMany({
            where: { OR: TEST_GRN_PREFIXES.map((prefix) => ({ grnNumber: { startsWith: prefix } })) },
            select: { id: true },
        });
        const grnIds = grns.map((row) => row.id);
        const roles = await prisma.role.findMany({
            where: { OR: TEST_ROLE_PREFIXES.map((prefix) => ({ code: { startsWith: prefix } })) },
            select: { id: true },
        });
        const roleIds = roles.map((row) => row.id);

        await deleteGrnCascade(prisma, grnIds);

        if (tenantIds.length) {
            await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
            await prisma.inventoryLedger.deleteMany({ where: { tenantId: { in: tenantIds } } });
        }

        if (userIds.length) {
            await prisma.auditLog.deleteMany({ where: { changedBy: { in: userIds } } });
            const assignmentIds = (
                await prisma.urUserAssignment.findMany({
                    where: { userId: { in: userIds } },
                    select: { id: true },
                })
            ).map((row) => row.id);
            if (assignmentIds.length) {
                await prisma.urAssignmentDepartment.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
                await prisma.urAssignmentProperty.deleteMany({ where: { assignmentId: { in: assignmentIds } } });
                await prisma.urUserAssignment.deleteMany({ where: { id: { in: assignmentIds } } });
            }
            await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
            await prisma.tenantMember.deleteMany({ where: { userId: { in: userIds } } });
            for (const userId of userIds) {
                await prisma.user.delete({ where: { id: userId } }).catch(() => {});
            }
        }

        if (roleIds.length) {
            await prisma.urRolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
            for (const roleId of roleIds) {
                await prisma.role.delete({ where: { id: roleId } }).catch(() => {});
            }
        }

        for (const tenantId of tenantIds) {
            await prisma.location.deleteMany({ where: { tenantId } });
            await prisma.department.deleteMany({ where: { tenantId } });
            await prisma.tenantMember.deleteMany({ where: { tenantId } });
            await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
        }

        const e2eRuntime = path.join(backendRoot, '..', 'OSE-Frontend', 'e2e', '.runtime', 'e2e-fixture.json');
        if (fs.existsSync(e2eRuntime)) {
            fs.unlinkSync(e2eRuntime);
        }

        console.log(
            `[purge-stale-residuals] Purged tenants=${tenantIds.length} users=${userIds.length} roles=${roleIds.length} grns=${grnIds.length}`,
        );
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('[purge-stale-residuals] FAIL:', err.message || err);
    process.exit(1);
});
