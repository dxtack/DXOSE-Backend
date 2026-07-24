'use strict';

/**
 * Remediate GRN workflow statusKey + false-POSTED GRNs (FY Marina).
 * Usage: node scripts/remediate-grn-workflow-status.js
 */

require('dotenv').config();
const prisma = require('../src/config/database');
const { DEFAULT_MODULE_CHAINS } = require('../src/services/acc-workflow-default-chains');

async function fixPublishedGrnWorkflowSteps() {
    const defaultSteps = DEFAULT_MODULE_CHAINS.GRN;
    const grnModule = await prisma.accModule.findUnique({ where: { key: 'GRN' }, select: { id: true } });
    if (!grnModule) return { versions: 0, stepRowsUpdated: 0 };

    const versions = await prisma.accWorkflowVersion.findMany({
        where: {
            status: 'PUBLISHED',
            definition: { moduleId: grnModule.id },
        },
        select: { id: true },
    });

    let updated = 0;
    for (const version of versions) {
        for (const ds of defaultSteps) {
            const result = await prisma.accWorkflowStepDefinition.updateMany({
                where: { versionId: version.id, stepOrder: ds.stepOrder },
                data: { statusKey: ds.statusKey },
            });
            updated += result.count;
        }
    }
    return { versions: versions.length, stepRowsUpdated: updated };
}

async function revertFalsePostedGrns() {
    const candidates = await prisma.grnImport.findMany({
        where: {
            status: 'POSTED',
            postedBy: null,
            postedAt: null,
            approvalRequest: {
                status: 'PENDING',
            },
        },
        select: { id: true, grnNumber: true, tenantId: true, approvalRequestId: true },
    });

    const fixed = [];
    for (const grn of candidates) {
        await prisma.grnImport.update({
            where: { id: grn.id },
            data: { status: 'PENDING_FINANCE', updatedAt: new Date() },
        });
        fixed.push(grn.grnNumber);
    }
    return { count: fixed.length, grnNumbers: fixed };
}

async function main() {
    console.log('\n=== GRN Workflow Remediation ===\n');
    const workflow = await fixPublishedGrnWorkflowSteps();
    console.log(`Published GRN workflow versions: ${workflow.versions}`);
    console.log(`Step statusKey rows updated: ${workflow.stepRowsUpdated}`);

    const grns = await revertFalsePostedGrns();
    console.log(`False-POSTED GRNs reverted to PENDING_FINANCE: ${grns.count}`);
    if (grns.grnNumbers.length) {
        console.log(`  GRNs: ${grns.grnNumbers.join(', ')}`);
    }

    const marina = await prisma.tenant.findFirst({
        where: { slug: 'dx-marina-hotel' },
        select: { id: true },
    });
    if (marina) {
        const grn554 = await prisma.grnImport.findFirst({
            where: { tenantId: marina.id, grnNumber: '55488888' },
            select: { status: true, postedBy: true, postedAt: true },
        });
        console.log(`\nMarina GRN 55488888 after fix: ${JSON.stringify(grn554)}`);
    }

    console.log('\n=== Done ===\n');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
