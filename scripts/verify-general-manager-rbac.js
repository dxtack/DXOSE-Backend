/**
 * Verifies GENERAL_MANAGER has executive permissions only (menu + approval detail access).
 * Run: node scripts/verify-general-manager-rbac.js
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const REQUIRED = [
    'VIEW_DASHBOARD',
    'DASHBOARD_VIEW',
    'REPORTS_VIEW',
    'REPORTS_EXPORT',
    'APPROVE_BREAKAGE',
    'APPROVE_LOST',
    'APPROVE_INVENTORY_COUNT',
    'GET_PASS_APPROVE_FINAL',
    'AUDIT_LOG_VIEW',
];

const FORBIDDEN = [
    'INVENTORY_VIEW',
    'BASIC_DATA_VIEW',
    'GRN_VIEW',
    'STOCK_COUNT_VIEW',
    'TRANSFER_VIEW',
    'GET_PASS_VIEW',
    'LOST_ITEMS_VIEW',
    'BREAKAGE_VIEW',
    'READ_BREAKAGE',
    'READ_LOST',
    'PERIOD_CLOSE_MANAGE',
    'INTEGRITY_VIEW',
];

async function main() {
    const role = await prisma.role.findUnique({
        where: { code: 'GENERAL_MANAGER' },
        include: {
            rolePermissions: {
                include: { permission: { select: { code: true } } },
            },
        },
    });

    if (!role) {
        console.error('❌ Role GENERAL_MANAGER not found.');
        process.exit(1);
    }

    const codes = new Set(role.rolePermissions.map((rp) => rp.permission.code));
    const missing = REQUIRED.filter((c) => !codes.has(c));
    const leaked = FORBIDDEN.filter((c) => codes.has(c));

    if (missing.length > 0) {
        console.error('❌ GENERAL_MANAGER missing:', missing.join(', '));
        process.exit(1);
    }
    if (leaked.length > 0) {
        console.error('❌ GENERAL_MANAGER must not have:', leaked.join(', '));
        process.exit(1);
    }

    console.log('✅ GENERAL_MANAGER executive RBAC OK');
    console.log('   Required:', REQUIRED.join(', '));
}

main()
    .catch((e) => {
        console.error('❌', e.message);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
