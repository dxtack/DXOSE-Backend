'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

const backendRoot = path.join(__dirname, '..', '..');
const localEnvPath = path.join(backendRoot, '.env.test.local');

if (!fs.existsSync(localEnvPath)) {
    console.error('[phase-1-residuals] FAIL: OSE-backend/.env.test.local is missing');
    process.exit(1);
}

dotenv.config({ path: localEnvPath, override: true });
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.OSE_TEST_DATABASE_URL;

const { assertTestDatabaseEnv } = require('./assert-test-database-env');
assertTestDatabaseEnv();

const TEST_TENANT_SLUG_PREFIXES = ['it-', 'e2e-', 'it-grn-'];
const TEST_ROLE_PREFIXES = ['IT_GRN_', 'E2E_', 'IT_GRN_GRANTED_', 'IT_GRN_DENIED_', 'IT_GRN_SCOPE_'];
const TEST_GRN_PREFIXES = ['E2E-GRN-', 'IT-GRN-'];

function testTenantWhere() {
    return {
        OR: [
            ...TEST_TENANT_SLUG_PREFIXES.map((prefix) => ({ slug: { startsWith: prefix } })),
            { name: { startsWith: 'Integration Test ' } },
            { name: { startsWith: 'E2E ' } },
        ],
    };
}

async function countTestTenants(prisma) {
    return prisma.tenant.count({ where: testTenantWhere() });
}

async function countTestUsers(prisma) {
    return prisma.user.count({
        where: {
            OR: [
                { email: { endsWith: '@it.local' } },
                { email: { contains: 'e2e-dual-tenant' } },
                { email: { contains: 'e2e-org-denied' } },
                { email: { contains: 'e2e-grn-view' } },
                { email: { contains: 'it-grn-' } },
            ],
        },
    });
}

async function countTestRoles(prisma) {
    return prisma.role.count({
        where: {
            OR: TEST_ROLE_PREFIXES.map((prefix) => ({ code: { startsWith: prefix } })),
        },
    });
}

async function countTestGrns(prisma) {
    return prisma.grnImport.count({
        where: {
            OR: TEST_GRN_PREFIXES.map((prefix) => ({ grnNumber: { startsWith: prefix } })),
        },
    });
}

async function countTestRefreshTokensForTestUsers(prisma) {
    const testUsers = await prisma.user.findMany({
        where: { email: { endsWith: '@it.local' } },
        select: { id: true },
    });
    if (!testUsers.length) {
        return 0;
    }
    return prisma.refreshToken.count({
        where: { userId: { in: testUsers.map((row) => row.id) } },
    });
}

async function countTestMemberships(prisma) {
    const tenantIds = (await prisma.tenant.findMany({ where: testTenantWhere(), select: { id: true } })).map(
        (row) => row.id,
    );
    if (!tenantIds.length) return 0;
    return prisma.tenantMember.count({ where: { tenantId: { in: tenantIds } } });
}

async function countTestAssignments(prisma) {
    const userIds = (
        await prisma.user.findMany({
            where: {
                OR: [
                    { email: { endsWith: '@it.local' } },
                    { email: { contains: 'e2e-' } },
                    { email: { contains: 'it-grn-' } },
                ],
            },
            select: { id: true },
        })
    ).map((row) => row.id);
    if (!userIds.length) return 0;
    return prisma.urUserAssignment.count({ where: { userId: { in: userIds } } });
}

async function main() {
    const prisma = new PrismaClient();
    const residuals = {};

    try {
        await prisma.user.findFirst({ select: { id: true } });
    } catch (err) {
        if (err.code === 'P2021') {
            console.error(
                '[phase-1-residuals] FAIL: Test database schema is not bootstrapped. Run: cd OSE-backend && npm run test:integration:bootstrap',
            );
            process.exit(1);
        }
        throw err;
    }

    try {
        residuals.tenants = await countTestTenants(prisma);
        residuals.users = await countTestUsers(prisma);
        residuals.memberships = await countTestMemberships(prisma);
        residuals.assignments = await countTestAssignments(prisma);
        residuals.roles = await countTestRoles(prisma);
        residuals.grns = await countTestGrns(prisma);
        residuals.refreshTokens = await countTestRefreshTokensForTestUsers(prisma);

        const e2eRuntime = path.join(backendRoot, '..', 'OSE-Frontend', 'e2e', '.runtime', 'e2e-fixture.json');
        residuals.e2eRuntimeFixtureFile = fs.existsSync(e2eRuntime) ? 1 : 0;

        const offenders = Object.entries(residuals).filter(([, count]) => count > 0);
        if (offenders.length) {
            console.error('[phase-1-residuals] FAIL — residual test data detected:');
            for (const [key, count] of offenders) {
                console.error(`  ${key}: ${count}`);
            }
            process.exit(1);
        }

        console.log('[phase-1-residuals] PASS — zero residual integration/E2E markers in ose_inventory_test');
        process.exit(0);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('[phase-1-residuals] FAIL:', err.message || err);
    process.exit(1);
});
