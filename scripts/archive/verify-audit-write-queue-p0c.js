'use strict';

const auditWriter = require('../src/services/auditWriter.service');
const auditQueue = require('../src/services/audit-write-queue.service');

/**
 * Update auditWriter.service.js to enqueue on failure, then restore module.
 */
async function main() {
    console.log('\n=== P0-C Audit Retry Queue — Simulation ===\n');

    const prisma = require('../src/config/database');

    const tenant = await prisma.tenant.findFirst({
        where: { OR: [{ slug: 'dx-marina-hotel' }, { name: { contains: 'Marina', mode: 'insensitive' } }] },
        select: { id: true, name: true },
    });
    if (!tenant) {
        console.error('FAIL: DX Marina tenant not found');
        process.exit(1);
    }

    const user = await prisma.user.findFirst({
        where: {
            memberships: { some: { tenantId: tenant.id, isActive: true } },
        },
        select: { id: true, email: true },
    });
    if (!user) {
        console.error('FAIL: no active tenant user found');
        process.exit(1);
    }

    const beforeAudit = await prisma.auditLog.count({ where: { tenantId: tenant.id } });
    const beforeQueue = await prisma.auditWriteQueue.count();

    console.log(`Tenant: ${tenant.name} (${tenant.id})`);
    console.log(`User: ${user.email}`);
    console.log(`audit_log count (before): ${beforeAudit}`);
    console.log(`audit_write_queue count (before): ${beforeQueue}`);

    const bogusUserId = '00000000-0000-4000-8000-000000009999';
    const entityId = `p0c-sim-${Date.now()}`;

    console.log('\n--- Step 1: Enqueue row with invalid changedBy (simulated failure) ---');
    const queued = await auditQueue.enqueueAuditWrite({
        tenantId: tenant.id,
        entityType: 'SETTINGS',
        entityId,
        action: 'UPDATE',
        changedBy: bogusUserId,
        note: 'P0-C simulation — initial failure',
    });
    console.log(`  Queued row id=${queued.id} status=${queued.status}`);

    await prisma.auditWriteQueue.update({
        where: { id: queued.id },
        data: { nextRetryAt: new Date(0) },
    });

    console.log('\n--- Step 2: Run retry worker (expect failure, attempts=1) ---');
    const failResult = await auditQueue.processAuditWriteQueue();
    console.log(`  Worker: picked=${failResult.picked} completed=${failResult.completed} failed=${failResult.failed}`);

    const afterFail = await prisma.auditWriteQueue.findUnique({ where: { id: queued.id } });
    if (!afterFail || afterFail.status !== 'PENDING' || afterFail.attempts !== 1) {
        console.error('FAIL: expected PENDING with attempts=1 after failed retry');
        process.exit(1);
    }
    console.log(`  Row status=${afterFail.status} attempts=${afterFail.attempts} lastError=${afterFail.lastError?.slice(0, 80)}`);

    console.log('\n--- Step 3: Fix changedBy and force immediate retry ---');
    await prisma.auditWriteQueue.update({
        where: { id: queued.id },
        data: { changedBy: user.id, nextRetryAt: new Date(0) },
    });

    const okResult = await auditQueue.processAuditWriteQueue();
    console.log(`  Worker: picked=${okResult.picked} completed=${okResult.completed} failed=${okResult.failed}`);

    const afterOk = await prisma.auditWriteQueue.findUnique({ where: { id: queued.id } });
    const auditRow = await prisma.auditLog.findFirst({
        where: { tenantId: tenant.id, entityId, note: 'P0-C simulation — initial failure' },
    });

    if (!afterOk || afterOk.status !== 'COMPLETED') {
        console.error('FAIL: queue row not COMPLETED');
        process.exit(1);
    }
    if (!auditRow) {
        console.error('FAIL: audit_log row not created after successful retry');
        process.exit(1);
    }

    console.log(`  Row status=${afterOk.status} completedAt=${afterOk.completedAt?.toISOString()}`);
    console.log(`  audit_log id=${auditRow.id} action=${auditRow.action}`);

    console.log('\n--- Step 4: auditWriter enqueue path (direct write failure) ---');
    const origCreate = prisma.auditLog.create.bind(prisma.auditLog);
    prisma.auditLog.create = async () => {
        throw new Error('P0-C simulated primary write failure');
    };

    await auditWriter.writeAuditLog({
        tenantId: tenant.id,
        entityType: 'SETTINGS',
        entityId: `${entityId}-writer`,
        action: 'UPDATE',
        changedBy: user.id,
        note: 'P0-C writer simulation',
    });

    prisma.auditLog.create = origCreate;

    const writerQueue = await prisma.auditWriteQueue.findFirst({
        where: { tenantId: tenant.id, entityId: `${entityId}-writer` },
        orderBy: { createdAt: 'desc' },
    });
    if (!writerQueue || writerQueue.status !== 'PENDING') {
        console.error('FAIL: auditWriter did not enqueue on primary failure');
        process.exit(1);
    }
    console.log(`  Writer queued row id=${writerQueue.id}`);

    await prisma.auditWriteQueue.update({
        where: { id: writerQueue.id },
        data: { nextRetryAt: new Date(0) },
    });
    await auditQueue.processAuditWriteQueue();

    const writerAudit = await prisma.auditLog.findFirst({
        where: { tenantId: tenant.id, entityId: `${entityId}-writer` },
    });
    const writerQueueFinal = await prisma.auditWriteQueue.findUnique({ where: { id: writerQueue.id } });

    if (!writerAudit || writerQueueFinal?.status !== 'COMPLETED') {
        console.error('FAIL: writer path retry did not complete');
        process.exit(1);
    }
    console.log(`  Writer retry COMPLETED, audit_log id=${writerAudit.id}`);

    const afterAudit = await prisma.auditLog.count({ where: { tenantId: tenant.id } });
    console.log(`\naudit_log count (after): ${afterAudit} (+${afterAudit - beforeAudit})`);

    console.log('\n=== P0-C Audit Retry Queue — PASS ===\n');
    await prisma.$disconnect();
}

main().catch(async (e) => {
    console.error('SCRIPT ERROR:', e);
    try {
        await require('../src/config/database').$disconnect();
    } catch (_) {
        /* ignore */
    }
    process.exit(1);
});
