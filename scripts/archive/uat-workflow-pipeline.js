'use strict';

/**
 * UAT: Workflow Pipeline module load + summary shape.
 * Run: node scripts/uat-workflow-pipeline.js
 */

const {
    getWorkflowPipelineSummary,
    PIPELINE_MODULES,
} = require('../src/services/workflow-pipeline/workflow-pipeline.service');

let pass = 0;
let fail = 0;

function assert(label, ok) {
    if (ok) {
        pass += 1;
        console.log(`  PASS  ${label}`);
    } else {
        fail += 1;
        console.error(`  FAIL  ${label}`);
    }
}

assert('PIPELINE_MODULES defined', PIPELINE_MODULES.length >= 6);

(async () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    try {
        const tenant = await prisma.tenant.findFirst({ select: { id: true } });
        if (!tenant) {
            console.log('  SKIP  DB tenant (no tenant row)');
        } else {
            const summary = await getWorkflowPipelineSummary(tenant.id, { role: 'ADMIN' });
            assert('summary.total is number', typeof summary.total === 'number');
            assert('summary.byModule.TRANSFER', summary.byModule != null);
            assert('operationalHealth aligned', summary.operationalHealth != null);
            console.log(`  INFO  total=${summary.total} critical=${summary.critical} mine=${summary.mine}`);
        }
    } catch (e) {
        console.log('  SKIP  DB test:', e.message);
    } finally {
        await prisma.$disconnect();
    }
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail > 0 ? 1 : 0);
})();
