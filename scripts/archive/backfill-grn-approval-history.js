#!/usr/bin/env node
'use strict';

/**
 * Backfill grnImportId + cycleNumber on GRN_IMPORT ApprovalRequest rows.
 * Dry-run by default; pass --apply to write inside a transaction.
 *
 * Never auto-links ambiguous records.
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const REPORT_DIR = path.join(__dirname, '../governance-evidence-archive/timeline-remediation/backfill-reports');
const REPORT_FILE = path.join(
    REPORT_DIR,
    APPLY ? 'GRN_APPROVAL_HISTORY_BACKFILL_APPLY.json' : 'GRN_APPROVAL_HISTORY_BACKFILL_DRY_RUN.json',
);

async function buildVerification(tx, row, ar) {
    if (row.method !== 'single_send_back_audit_window' || !ar) return null;
    const sendBack = await tx.auditLog.findFirst({
        where: {
            tenantId: ar.tenantId,
            entityType: 'GRN',
            entityId: row.grnImportId,
            action: 'SEND_BACK',
            changedAt: {
                gte: ar.createdAt,
                lte: new Date((ar.resolvedAt || new Date()).getTime() + 120_000),
            },
        },
        orderBy: { changedAt: 'asc' },
        select: { id: true, changedAt: true },
    });
    return {
        grnId: row.grnImportId,
        approvalRequestId: row.approvalRequestId,
        sendBackAuditId: sendBack?.id ?? null,
        rule: row.method,
        timeDeltaMs:
            sendBack && ar.resolvedAt
                ? Math.abs(new Date(sendBack.changedAt).getTime() - new Date(ar.resolvedAt).getTime())
                : null,
    };
}

async function main() {
    const report = {
        at: new Date().toISOString(),
        mode: APPLY ? 'apply' : 'dry-run',
        linked: [],
        skippedAlreadyLinked: [],
        ambiguous: [],
        unmatched: [],
    };

    const orphans = await prisma.approvalRequest.findMany({
        where: { requestType: 'GRN_IMPORT', grnImportId: null },
        select: { id: true, tenantId: true, status: true, createdAt: true, resolvedAt: true },
        orderBy: { createdAt: 'asc' },
    });

    const orphanById = Object.fromEntries(orphans.map((o) => [o.id, o]));

    for (const ar of orphans) {
        const activeGrn = await prisma.grnImport.findFirst({
            where: { approvalRequestId: ar.id, tenantId: ar.tenantId },
            select: { id: true, grnNumber: true },
        });
        if (activeGrn) {
            report.linked.push({
                approvalRequestId: ar.id,
                grnImportId: activeGrn.id,
                grnNumber: activeGrn.grnNumber,
                method: 'active_pointer',
                patch: { grnImportId: activeGrn.id, cycleNumber: 1 },
            });
            continue;
        }

        const windowStart = ar.createdAt;
        const windowEnd = ar.resolvedAt || new Date();
        const sendBacks = await prisma.auditLog.findMany({
            where: {
                tenantId: ar.tenantId,
                entityType: 'GRN',
                action: 'SEND_BACK',
                changedAt: { gte: windowStart, lte: new Date(windowEnd.getTime() + 120_000) },
            },
            select: { entityId: true, changedAt: true, id: true },
        });
        const candidateGrnIds = [...new Set(sendBacks.map((s) => s.entityId))];

        if (candidateGrnIds.length === 1) {
            const grnId = candidateGrnIds[0];
            const existing = await prisma.approvalRequest.count({
                where: { grnImportId: grnId, requestType: 'GRN_IMPORT' },
            });
            report.linked.push({
                approvalRequestId: ar.id,
                grnImportId: grnId,
                method: 'single_send_back_audit_window',
                patch: { grnImportId: grnId, cycleNumber: existing + 1 },
            });
            continue;
        }

        if (candidateGrnIds.length > 1) {
            report.ambiguous.push({
                approvalRequestId: ar.id,
                reason: 'multiple_grn_send_back_candidates',
                candidateGrnIds,
            });
            continue;
        }

        report.unmatched.push({
            approvalRequestId: ar.id,
            status: ar.status,
            reason: 'no_unambiguous_grn_link',
        });
    }

    for (const row of report.linked) {
        row.dbVerificationPreview = await buildVerification(prisma, row, orphanById[row.approvalRequestId]);
    }

    if (APPLY && report.linked.length) {
        await prisma.$transaction(async (tx) => {
            for (const row of report.linked) {
                row.dbVerification = await buildVerification(tx, row, orphanById[row.approvalRequestId]);
                await tx.approvalRequest.update({ where: { id: row.approvalRequestId }, data: row.patch });
            }
        });
    }

    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

    console.log(`Mode: ${report.mode}`);
    console.log(`Linked: ${report.linked.length}`);
    console.log(`Ambiguous: ${report.ambiguous.length}`);
    console.log(`Unmatched: ${report.unmatched.length}`);
    console.log(`Report: ${REPORT_FILE}`);

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
