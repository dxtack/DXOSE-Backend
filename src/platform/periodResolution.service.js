'use strict';

const { PrismaClient } = require('@prisma/client');
const { getPassIsBlockerForPeriod } = require('../services/periodCloseGovernance.service');
const { getCarriedForwardGetPassIds } = require('./getPassPeriodResolution.util');
const { assignedPeriodKey, monthBounds } = require('./postingPeriod.util');
const { toUtcPeriodYearMonth } = require('../utils/report-date-range.util');
const { getTenantTimezone } = require('../services/tenantTimezone.service');

const prisma = new PrismaClient();

const PENDING_GRN = ['DRAFT', 'VALIDATED', 'PENDING_APPROVAL', 'PENDING_FINANCE', 'APPROVED'];
const PENDING_TRANSFER = ['PENDING_DEPT', 'PENDING_FINANCE', 'APPROVED', 'IN_TRANSIT', 'RECEIVED'];
const PENDING_MOVEMENT = ['DRAFT', 'PENDING_APPROVAL', 'DEPT_APPROVED', 'COST_CONTROL_APPROVED', 'FINANCE_APPROVED', 'APPROVED'];
const ACTIVE_GET_PASS = ['OUT', 'DISPATCHED', 'IN_TRANSIT', 'RETURNING', 'RETURN_RECEIVED_AT_GATE', 'PARTIALLY_RETURNED', 'PENDING_SECURITY', 'APPROVED'];

/**
 * Ch.6.9 — Close resolution workspace pending documents for a closing period.
 * Lists only documents whose dates fall in the target tenant-local month.
 */
async function getPeriodResolutionWorkspace(tenantId, { fiscalYear, fiscalPeriod } = {}) {
    const timezone = await getTenantTimezone(tenantId, prisma);
    const nowPeriod = toUtcPeriodYearMonth(new Date(), timezone);
    const year = Number(fiscalYear) || nowPeriod.year;
    const month = Number(fiscalPeriod) || nowPeriod.month;
    const fromPeriod = assignedPeriodKey(year, month);
    const { start: periodStart, end: periodEnd } = monthBounds(year, month, timezone);
    const carriedForward = await getCarriedForwardGetPassIds(tenantId, fromPeriod);

    const periodRow = await prisma.periodClose.findFirst({
        where: { tenantId, year, month },
    });

    const [grns, transfers, movements, getPasses] = await Promise.all([
        prisma.grnImport.findMany({
            where: {
                tenantId,
                status: { in: PENDING_GRN },
                receivingDate: { gte: periodStart, lte: periodEnd },
            },
            select: {
                id: true,
                grnNumber: true,
                status: true,
                receivingDate: true,
                postingDate: true,
                assignedPostingPeriod: true,
            },
            take: 50,
            orderBy: { receivingDate: 'desc' },
        }),
        prisma.storeTransfer.findMany({
            where: {
                tenantId,
                status: { in: PENDING_TRANSFER },
                postedAt: null,
                transferDate: { gte: periodStart, lte: periodEnd },
            },
            select: {
                id: true,
                transferNo: true,
                status: true,
                transferDate: true,
                postingDate: true,
                assignedPostingPeriod: true,
            },
            take: 50,
            orderBy: { transferDate: 'desc' },
        }),
        prisma.movementDocument.findMany({
            where: {
                tenantId,
                status: { in: PENDING_MOVEMENT },
                postedAt: null,
                documentDate: { gte: periodStart, lte: periodEnd },
            },
            select: {
                id: true,
                documentNo: true,
                movementType: true,
                status: true,
                documentDate: true,
                postingDate: true,
                assignedPostingPeriod: true,
            },
            take: 50,
            orderBy: { documentDate: 'desc' },
        }),
        prisma.getPass.findMany({
            where: { tenantId, status: { in: ACTIVE_GET_PASS } },
            select: {
                id: true,
                passNo: true,
                status: true,
                createdAt: true,
                expectedReturnDate: true,
                returnDate: true,
                checkedOutAt: true,
                postingDate: true,
                assignedPostingPeriod: true,
            },
            take: 50,
            orderBy: { createdAt: 'desc' },
        }),
    ]);

    const blockingGetPasses = getPasses.filter(
        (gp) => !carriedForward.has(gp.id) && getPassIsBlockerForPeriod(gp, year, month, timezone),
    );

    const pendingDocuments = [
        ...grns.map((g) => ({
            module: 'GRN',
            id: g.id,
            documentNumber: g.grnNumber,
            status: g.status,
            documentDate: g.receivingDate,
            postingDate: g.postingDate,
            assignedPostingPeriod: g.assignedPostingPeriod,
            resolutionActions: ['POST', 'DELETE'],
        })),
        ...transfers.map((t) => ({
            module: 'TRANSFER',
            id: t.id,
            documentNumber: t.transferNo,
            status: t.status,
            documentDate: t.transferDate,
            postingDate: t.postingDate,
            assignedPostingPeriod: t.assignedPostingPeriod,
            resolutionActions: ['POST', 'DELETE'],
        })),
        ...movements.map((b) => ({
            module: b.movementType === 'BREAKAGE' ? 'BREAKAGE' : 'MOVEMENT',
            id: b.id,
            documentNumber: b.documentNo,
            status: b.status,
            documentDate: b.documentDate,
            postingDate: b.postingDate,
            assignedPostingPeriod: b.assignedPostingPeriod,
            resolutionActions: ['POST', 'DELETE'],
        })),
        ...blockingGetPasses.map((p) => ({
            module: 'GET_PASS',
            id: p.id,
            documentNumber: p.passNo,
            status: p.status,
            documentDate: p.createdAt,
            postingDate: p.postingDate,
            assignedPostingPeriod: p.assignedPostingPeriod,
            resolutionActions: ['GET_PASS_CARRY_FORWARD'],
        })),
    ];

    return {
        fiscalYear: year,
        fiscalPeriod: month,
        timezone,
        periodStatus: periodRow?.status ?? 'OPEN',
        pendingDocuments,
        blockedDocuments: pendingDocuments,
    };
}

module.exports = { getPeriodResolutionWorkspace };
