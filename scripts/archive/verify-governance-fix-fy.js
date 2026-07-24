'use strict';

/**
 * FY validation — governance APIs + GRN workflow state.
 * Usage: node scripts/verify-governance-fix-fy.js
 */

require('dotenv').config();

const prisma = require('../src/config/database');
const inventoryHistoryService = require('../src/services/inventory-history.service');
const auditService = require('../src/services/audit.service');
const { DEFAULT_MODULE_CHAINS } = require('../src/services/acc-workflow-default-chains');

let passed = 0;
let failed = 0;

function assert(label, condition) {
    if (condition) {
        console.log(`  ✓ ${label}`);
        passed++;
    } else {
        console.error(`  ✗ FAIL: ${label}`);
        failed++;
    }
}

async function resolveMarina() {
    return prisma.tenant.findFirst({
        where: { OR: [{ slug: 'dx-marina-hotel' }, { name: { contains: 'Marina', mode: 'insensitive' } }] },
        select: { id: true, name: true },
    });
}

async function main() {
    console.log('\nFY Governance + GRN Fix Verification\n');

    const tenant = await resolveMarina();
    if (!tenant) {
        console.error('FAIL: Marina tenant not found');
        process.exit(1);
    }

    const fm = await prisma.tenantMember.findFirst({
        where: { tenantId: tenant.id, role: { code: 'FINANCE_MANAGER' }, isActive: true },
        include: { user: { select: { id: true } }, role: { select: { code: true } } },
    });
    const user = fm
        ? { id: fm.user.id, role: fm.role.code, tenantId: tenant.id }
        : { id: '00000000-0000-4000-8000-000000000002', role: 'FINANCE_MANAGER', tenantId: tenant.id };

    const ih = await inventoryHistoryService.getInventoryHistory(tenant.id, { page: 1, limit: 5 }, user);
    const audit = await auditService.getAuditLog(tenant.id, { page: 1, limit: 5 });
    const ledgerCount = await prisma.inventoryLedger.count({ where: { tenantId: tenant.id } });
    const auditCount = await prisma.auditLog.count({ where: { tenantId: tenant.id } });

    assert(`inventory_history total = ${ledgerCount} (ledger rows)`, ih.total === ledgerCount);
    assert(`audit_log total = ${auditCount}`, audit.total === auditCount);

    const grnSteps = DEFAULT_MODULE_CHAINS.GRN;
    assert('GRN step1 statusKey is PENDING_APPROVAL', grnSteps[0].statusKey === 'PENDING_APPROVAL');
    assert('GRN step2 statusKey is PENDING_FINANCE (not POSTED)', grnSteps[1].statusKey === 'PENDING_FINANCE');

    const falsePosted = await prisma.grnImport.count({
        where: {
            tenantId: tenant.id,
            status: 'POSTED',
            postedBy: null,
            postedAt: null,
            approvalRequest: { status: 'PENDING' },
        },
    });
    assert('no false-POSTED Marina GRNs (postedBy null + approval pending)', falsePosted === 0);

    const grn554 = await prisma.grnImport.findFirst({
        where: { tenantId: tenant.id, grnNumber: '55488888' },
        include: { approvalRequest: { include: { steps: true } } },
    });
    if (grn554) {
        assert('GRN 55488888 status is PENDING_FINANCE', grn554.status === 'PENDING_FINANCE');
        const financeStep = grn554.approvalRequest?.steps?.find((s) => s.stepNumber === 2);
        assert('GRN 55488888 finance step still PENDING', financeStep?.status === 'PENDING');
    }

    const badStepKeys = await prisma.accWorkflowStepDefinition.count({
        where: {
            statusKey: 'POSTED',
            version: { definition: { module: { key: 'GRN' } } },
        },
    });
    assert('no GRN workflow step definitions with statusKey POSTED', badStepKeys === 0);

    const terminalOnIntermediate = await prisma.accWorkflowStepDefinition.findMany({
        where: {
            statusKey: { in: ['POSTED', 'CLOSED', 'APPROVED'] },
        },
        include: {
            version: {
                include: {
                    definition: { include: { module: true } },
                    steps: { select: { id: true }, orderBy: { stepOrder: 'asc' } },
                },
            },
        },
    });
    const misuse = terminalOnIntermediate.filter((s) => {
        const total = s.version?.steps?.length ?? 0;
        return total > 0 && s.stepOrder < total;
    });
    assert(
        'no terminal statusKey on non-final workflow steps (system scan)',
        misuse.length === 0,
    );

    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Result: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
    console.log('FY governance + GRN verification PASS\n');

    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error('SCRIPT ERROR:', e);
    try {
        await prisma.$disconnect();
    } catch (_) {
        /* ignore */
    }
    process.exit(1);
});
