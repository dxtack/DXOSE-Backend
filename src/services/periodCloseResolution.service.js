'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const {
    getPeriodRegistryRow,
    assertPeriodAllowPostingForResolution,
    lockPeriodForPosting,
} = require('./periodGuard.service');
const { runMonthEndCloseChecklist, getPassIsBlockerForPeriod } = require('./periodCloseGovernance.service');
const { getPeriodResolutionWorkspace } = require('../platform/periodResolution.service');
const postingEngine = require('./postingEngine.service');
const { logAction, EntityType } = require('./auditTrail.service');
const { assignedPeriodKey, resolutionPostingDate } = require('../platform/postingPeriod.util');
const { toUtcPeriodYearMonth } = require('../utils/report-date-range.util');
const { getTenantTimezone } = require('./tenantTimezone.service');

const err = (message, statusCode = 400, code = 'RESOLUTION_ERROR') => {
    const e = new Error(message);
    e.statusCode = statusCode;
    e.code = code;
    return e;
};

async function assertPeriodClosing(tenantId, year, month) {
    const row = await getPeriodRegistryRow(tenantId, year, month);
    if (!row || row.status !== 'CLOSING') {
        throw err('Close resolution actions require the period to be in CLOSING state.', 422, 'PERIOD_NOT_CLOSING');
    }
    return row;
}

async function lockAndAssertResolutionPosting(tx, tenantId, year, month, postingDate) {
    const period = await lockPeriodForPosting(tx, tenantId, year, month);
    if (!period) throw err('Period registry record is required for resolution posting.', 422, 'PERIOD_NOT_REGISTERED');
    await assertPeriodAllowPostingForResolution({ tenantId, year, month, postingDate }, tx);
}

async function assertNoLedgerForDocument(tenantId, module, documentId) {
    const referenceType =
        module === 'GRN'
            ? 'GRN'
            : module === 'TRANSFER'
              ? 'TRANSFER'
              : module === 'BREAKAGE' || module === 'MOVEMENT'
                ? 'MOVEMENT'
                : module === 'GET_PASS'
                  ? 'GET_PASS'
                  : null;
    if (!referenceType) throw err(`Unsupported module: ${module}`, 422, 'UNSUPPORTED_MODULE');

    const existing = await prisma.inventoryLedger.findFirst({
        where: { tenantId, referenceType, referenceId: documentId },
    });
    if (existing) {
        throw err('Document has ledger effects and cannot be deleted from resolution workspace.', 409, 'DOCUMENT_HAS_LEDGER');
    }
}

async function getResolutionWorkspace(tenantId, { year, month }) {
    const y = Number(year);
    const m = Number(month);
    if (!y || !m || m < 1 || m > 12) {
        throw err('Year and month (1–12) are required.', 422, 'INVALID_PERIOD');
    }

    const period = await getPeriodRegistryRow(tenantId, y, m);
    const checklist = await runMonthEndCloseChecklist(tenantId, { year: y, month: m });
    const workspace = await getPeriodResolutionWorkspace(tenantId, { fiscalYear: y, fiscalPeriod: m });

    const closedPeriods = await prisma.periodClose.findMany({
        where: { tenantId, status: 'CLOSED' },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        take: 50,
        select: {
            id: true,
            year: true,
            month: true,
            status: true,
            closedAt: true,
            closedBy: true,
            notes: true,
        },
    });

    return {
        fiscalYear: y,
        fiscalPeriod: m,
        periodStatus: period?.status ?? 'OPEN',
        periodId: period?.id ?? null,
        checklist,
        pendingDocuments: workspace.pendingDocuments,
        closedPeriods,
        allowedActions: {
            post: 'PERIOD_CLOSE_DOCUMENT_POST',
            delete: 'PERIOD_CLOSE_DOCUMENT_DELETE',
            getPassCarryForward: 'PERIOD_CLOSE_GET_PASS_CARRY_FORWARD',
        },
    };
}

async function postResolutionDocument(tenantId, userId, { year, month, module, documentId }) {
    const y = Number(year);
    const m = Number(month);
    await assertPeriodClosing(tenantId, y, m);

    const timezone = await getTenantTimezone(tenantId);
    const postingDate = resolutionPostingDate(y, m, timezone);
    const ym = toUtcPeriodYearMonth(postingDate, timezone);
    if (ym.year !== y || ym.month !== m) {
        throw err(
            `Resolution posting date must fall in workspace period ${assignedPeriodKey(y, m)} (got ${assignedPeriodKey(ym.year, ym.month)}).`,
            422,
            'RESOLUTION_POSTING_PERIOD_MISMATCH',
        );
    }
    await assertPeriodAllowPostingForResolution({
        tenantId,
        year: y,
        month: m,
        postingDate,
    });

    const postOpts = { postingDate, fromResolutionWorkspace: true, timezone };
    const mod = String(module || '').toUpperCase();

    if (mod === 'GRN') {
        const grn = await prisma.grnImport.findFirst({
            where: { id: documentId, tenantId, status: 'APPROVED' },
            include: { lines: true },
        });
        if (!grn) throw err('GRN not found or not in postable state.', 404, 'DOCUMENT_NOT_FOUND');
        await prisma.$transaction(async (tx) => {
            await lockAndAssertResolutionPosting(tx, tenantId, y, m, postingDate);
            await postingEngine.postGrnInTransaction(tx, grn, userId, postOpts);
        });
    } else if (mod === 'TRANSFER') {
        const trf = await prisma.storeTransfer.findFirst({
            where: { id: documentId, tenantId, status: { in: ['APPROVED', 'RECEIVED', 'IN_TRANSIT'] } },
            include: { lines: true, sourceLocation: true, destLocation: true },
        });
        if (!trf) throw err('Transfer not found or not in postable state.', 404, 'DOCUMENT_NOT_FOUND');
        await prisma.$transaction(async (tx) => {
            await lockAndAssertResolutionPosting(tx, tenantId, y, m, postingDate);
            await postingEngine.postTransferInTransaction(tx, trf, userId, [], postOpts);
        });
    } else if (mod === 'BREAKAGE' || mod === 'MOVEMENT') {
        const doc = await prisma.movementDocument.findFirst({
            where: {
                id: documentId,
                tenantId,
                status: { in: ['APPROVED', 'FINANCE_APPROVED', 'DEPT_APPROVED', 'COST_CONTROL_APPROVED'] },
            },
            include: { lines: { include: { item: true } } },
        });
        if (!doc) throw err('Movement not found or not in postable state.', 404, 'DOCUMENT_NOT_FOUND');
        if (doc.movementType === 'BREAKAGE') {
            await prisma.$transaction(async (tx) => {
                await lockAndAssertResolutionPosting(tx, tenantId, y, m, postingDate);
                await postingEngine.postBreakageMovementInTransaction(tx, doc, tenantId, userId, postOpts);
                await tx.movementDocument.update({
                    where: { id: doc.id },
                    data: {
                        status: 'POSTED',
                        postedAt: postingDate,
                        postingDate,
                        assignedPostingPeriod: assignedPeriodKey(y, m),
                    },
                });
            });
        } else if (doc.movementType === 'LOST') {
            await prisma.$transaction(async (tx) => {
                await lockAndAssertResolutionPosting(tx, tenantId, y, m, postingDate);
                await postingEngine.postLostMovementInTransaction(tx, doc, userId, postOpts);
                await tx.movementDocument.update({
                    where: { id: doc.id },
                    data: {
                        status: 'POSTED',
                        postedAt: postingDate,
                        postingDate,
                        assignedPostingPeriod: assignedPeriodKey(y, m),
                    },
                });
            });
        } else {
            await postingEngine.postMovementDocument(documentId, tenantId, userId, prisma, null, postOpts);
        }
    } else {
        throw err(`Post not supported for module ${mod}`, 422, 'UNSUPPORTED_MODULE');
    }

    await logAction({
        tenantId,
        entityType: EntityType.PERIOD_CLOSE,
        entityId: documentId,
        action: 'POST',
        changedBy: userId,
        note: `Resolution workspace post: ${mod} ${documentId} during ${y}/${m} close`,
        afterValue: {
            module: mod,
            documentId,
            year: y,
            month: m,
            postingDate: postingDate.toISOString(),
            assignedPostingPeriod: assignedPeriodKey(y, m),
        },
    });

    return getResolutionWorkspace(tenantId, { year: y, month: m });
}

async function deleteResolutionDocument(tenantId, userId, { year, month, module, documentId, reason }) {
    await assertPeriodClosing(tenantId, year, month);
    const mod = String(module || '').toUpperCase();
    await assertNoLedgerForDocument(tenantId, mod, documentId);

    if (mod === 'GRN') {
        const grn = await prisma.grnImport.findFirst({
            where: { id: documentId, tenantId, status: { notIn: ['POSTED', 'REJECTED'] } },
        });
        if (!grn) throw err('GRN not found or not deletable.', 404, 'DOCUMENT_NOT_FOUND');
        await prisma.grnImport.delete({ where: { id: documentId } });
    } else if (mod === 'TRANSFER') {
        const trf = await prisma.storeTransfer.findFirst({
            where: { id: documentId, tenantId, postedAt: null, status: { notIn: ['POSTED', 'REJECTED'] } },
        });
        if (!trf) throw err('Transfer not found or not deletable.', 404, 'DOCUMENT_NOT_FOUND');
        await prisma.storeTransfer.delete({ where: { id: documentId } });
    } else if (mod === 'BREAKAGE' || mod === 'MOVEMENT') {
        const doc = await prisma.movementDocument.findFirst({
            where: { id: documentId, tenantId, status: { in: ['DRAFT', 'PENDING_APPROVAL'] }, postedAt: null },
        });
        if (!doc) throw err('Movement not found or not deletable (draft only).', 404, 'DOCUMENT_NOT_FOUND');
        await prisma.movementDocument.delete({ where: { id: documentId } });
    } else {
        throw err(`Delete not supported for module ${mod}`, 422, 'UNSUPPORTED_MODULE');
    }

    await logAction({
        tenantId,
        entityType: EntityType.PERIOD_CLOSE,
        entityId: documentId,
        action: 'DELETE',
        changedBy: userId,
        note: `Resolution workspace delete: ${mod} ${documentId}. Reason: ${reason || 'n/a'}`,
        afterValue: { module: mod, documentId, year, month, reason: reason || null },
    });

    return getResolutionWorkspace(tenantId, { year, month });
}

async function carryForwardGetPass(tenantId, userId, { year, month, getPassId, reason }) {
    await assertPeriodClosing(tenantId, year, month);
    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!normalizedReason) {
        throw err('Carry forward reason is required.', 400, 'CARRY_FORWARD_REASON_REQUIRED');
    }

    const gp = await prisma.getPass.findFirst({
        where: { id: getPassId, tenantId },
        select: {
            id: true,
            passNo: true,
            status: true,
            expectedReturnDate: true,
            returnDate: true,
            checkedOutAt: true,
            postingDate: true,
        },
    });
    if (!gp) throw err('Get Pass not found.', 404, 'GET_PASS_NOT_FOUND');
    const timezone = await getTenantTimezone(tenantId);
    if (!getPassIsBlockerForPeriod(gp, year, month, timezone)) {
        throw err('Get Pass is not a blocker for this period.', 422, 'GET_PASS_NOT_BLOCKER');
    }

    const fromPeriod = assignedPeriodKey(year, month);
    const toMonth = month === 12 ? 1 : month + 1;
    const toYear = month === 12 ? year + 1 : year;
    const toPeriod = assignedPeriodKey(toYear, toMonth);

    await logAction({
        tenantId,
        entityType: EntityType.GET_PASS,
        entityId: getPassId,
        action: 'UPDATE',
        changedBy: userId,
        note: `Get Pass carry forward from ${fromPeriod} to ${toPeriod}. Reason: ${normalizedReason}`,
        afterValue: {
            fromPeriod,
            toPeriod,
            reason: normalizedReason,
            passNo: gp.passNo,
            carriedAt: new Date().toISOString(),
        },
    });

    return getResolutionWorkspace(tenantId, { year, month });
}

module.exports = {
    getResolutionWorkspace,
    postResolutionDocument,
    deleteResolutionDocument,
    carryForwardGetPass,
    assertPeriodClosing,
};
