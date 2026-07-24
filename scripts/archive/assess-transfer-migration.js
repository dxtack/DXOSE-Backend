'use strict';

/**
 * Assess in-flight store transfers before / after workflow simplification.
 * Usage:
 *   node scripts/assess-transfer-migration.js
 *   node scripts/assess-transfer-migration.js --tenant <slug>
 *   node scripts/assess-transfer-migration.js --apply-auto-post   # posts APPROVED/IN_TRANSIT without ledger
 */

const prisma = require('../src/config/database');
const postingEngine = require('../src/services/postingEngine.service');
const { checkPeriodLock } = require('../src/services/periodGuard.service');

const LEGACY_OPEN = ['SUBMITTED', 'PENDING_DEPT', 'PENDING_FINANCE', 'PENDING_FINAL', 'APPROVED', 'IN_TRANSIT'];
const NEEDS_RESOLUTION = ['APPROVED', 'IN_TRANSIT', 'SUBMITTED', 'PENDING_DEPT', 'PENDING_FINANCE', 'PENDING_FINAL'];

async function hasLedgerPost(tenantId, transferId) {
    const row = await prisma.inventoryLedger.findFirst({
        where: { tenantId, referenceType: 'TRANSFER', referenceId: transferId, movementType: 'TRANSFER_OUT' },
    });
    return Boolean(row);
}

async function autoPostTransfer(trf, actorUserId) {
    const full = await prisma.storeTransfer.findFirst({
        where: { id: trf.id, tenantId: trf.tenantId },
        include: {
            lines: true,
            sourceLocation: { select: { name: true } },
            destLocation: { select: { name: true } },
        },
    });
    if (!full) return { ok: false, error: 'not found' };
    if (await hasLedgerPost(full.tenantId, full.id)) {
        await prisma.storeTransfer.update({
            where: { id: full.id },
            data: {
                status: 'POSTED',
                postedAt: full.receivedAt || full.closedAt || new Date(),
                postedBy: full.receivedBy || full.approvedBy || actorUserId,
            },
        });
        return { ok: true, action: 'status_only_POSTED' };
    }
    try {
        await checkPeriodLock(full.tenantId, full.transferDate || full.createdAt || new Date());
        await prisma.$transaction(async (tx) => {
            await postingEngine.postTransferInTransaction(tx, full, actorUserId || full.requestedBy);
        });
        return { ok: true, action: 'posted' };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

async function main() {
    const apply = process.argv.includes('--apply-auto-post');
    const tenantSlug = process.argv.includes('--tenant')
        ? process.argv[process.argv.indexOf('--tenant') + 1]
        : null;

    const tenantWhere = tenantSlug ? { slug: tenantSlug } : {};
    const tenants = await prisma.tenant.findMany({ where: tenantWhere, select: { id: true, slug: true, name: true } });

    const report = { tenants: [], totals: { needsResolution: 0, postedMismatch: 0, autoPostOk: 0, autoPostFail: 0 } };

    for (const tenant of tenants) {
        const transfers = await prisma.storeTransfer.findMany({
            where: { tenantId: tenant.id, status: { in: [...LEGACY_OPEN, 'RECEIVED', 'CLOSED', 'APPROVED', 'IN_TRANSIT'] } },
            include: { lines: true },
            orderBy: { transferNo: 'asc' },
        });

        const bucket = {
            tenant: tenant.slug,
            withoutLedger: [],
            withLedgerNotPosted: [],
            autoPostResults: [],
        };

        for (const t of transfers) {
            const posted = await hasLedgerPost(tenant.id, t.id);
            if (posted && t.status !== 'POSTED') {
                bucket.withLedgerNotPosted.push({ transferNo: t.transferNo, status: t.status, id: t.id });
                report.totals.postedMismatch += 1;
                if (apply) {
                    await prisma.storeTransfer.update({
                        where: { id: t.id },
                        data: {
                            status: 'POSTED',
                            postedAt: t.receivedAt || t.closedAt || new Date(),
                            postedBy: t.receivedBy || t.approvedBy,
                        },
                    });
                }
                continue;
            }
            if (!posted && NEEDS_RESOLUTION.includes(t.status)) {
                bucket.withoutLedger.push({
                    transferNo: t.transferNo,
                    status: t.status,
                    id: t.id,
                    lineCount: t.lines.length,
                });
                report.totals.needsResolution += 1;
                if (apply && ['APPROVED', 'IN_TRANSIT'].includes(t.status)) {
                    const admin = await prisma.tenantMember.findFirst({
                        where: { tenantId: tenant.id, role: { code: 'ADMIN' }, isActive: true },
                        select: { userId: true },
                    });
                    const result = await autoPostTransfer(t, admin?.userId);
                    bucket.autoPostResults.push({ transferNo: t.transferNo, ...result });
                    if (result.ok) report.totals.autoPostOk += 1;
                    else report.totals.autoPostFail += 1;
                }
            }
        }

        if (bucket.withoutLedger.length || bucket.withLedgerNotPosted.length || bucket.autoPostResults.length) {
            report.tenants.push(bucket);
        }
    }

    console.log(JSON.stringify(report, null, 2));
    if (!apply && report.totals.needsResolution > 0) {
        console.error(
            '\nRun with --apply-auto-post to post APPROVED/IN_TRANSIT without ledger (uses ADMIN as poster). Review output first.',
        );
        process.exitCode = 1;
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
