/**
 * Month-end close governance (Ch.6.8 / D7 / D8).
 * Blockers=0 required for CLOSED — no environment bypass.
 * Period-scoped blockers use tenant-local month bounds — no cross-month inheritance.
 */
const { PrismaClient } = require('@prisma/client');
const { assignedPeriodKey, monthBounds } = require('../platform/postingPeriod.util');
const { getCarriedForwardGetPassIds } = require('../platform/getPassPeriodResolution.util');
const { toUtcPeriodYearMonth } = require('../utils/report-date-range.util');
const { getTenantTimezone } = require('./tenantTimezone.service');

const prisma = new PrismaClient();

const TERMINAL_COUNT_STATUSES = ['POSTED', 'VOID', 'CANCELLED', 'REJECTED'];
const ACTIVE_GET_PASS_STATUSES = [
    'OUT',
    'RETURNING',
    'RETURN_RECEIVED_AT_GATE',
    'PARTIALLY_RETURNED',
    'PENDING_SECURITY',
    'APPROVED',
];
const PENDING_MOVEMENT_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'DEPT_APPROVED', 'COST_CONTROL_APPROVED', 'FINANCE_APPROVED'];
const UNPOSTED_GRN_STATUSES = ['DRAFT', 'VALIDATED', 'PENDING_APPROVAL', 'APPROVED'];

/**
 * @typedef {{ code: string, severity: 'BLOCKER'|'WARNING'|'INFO', message: string, count?: number }} GovernanceFinding
 */

function startOfMonth(year, month, timezone) {
    return monthBounds(year, month, timezone).start;
}

/**
 * Pending approvals whose linked document date falls in [periodStart, periodEnd].
 * Orphan / unlinked / undated requests are excluded (no month inheritance).
 */
function pendingApprovalsInPeriodWhere(tenantId, periodStart, periodEnd) {
    const inPeriod = { gte: periodStart, lte: periodEnd };
    return {
        tenantId,
        status: 'PENDING',
        OR: [
            { document: { documentDate: inPeriod } },
            { grnImportActive: { receivingDate: inPeriod } },
            { grnImportHistory: { receivingDate: inPeriod } },
            { storeTransfer: { transferDate: inPeriod } },
            { StockCountSession: { countDate: inPeriod } },
            { StoreRequisition: { requestDate: inPeriod } },
            { SavedStockReport: { dateGenerated: inPeriod } },
            {
                getPass: {
                    OR: [
                        { checkedOutAt: inPeriod },
                        {
                            AND: [{ checkedOutAt: null }, { postingDate: inPeriod }],
                        },
                    ],
                },
            },
        ],
    };
}

/**
 * D8: Get Pass appears as BLOCKER only when rules in §6.13 apply.
 */
function getPassIsBlockerForPeriod(gp, year, month, timezone) {
    const { start: periodStart, end: periodEnd } = monthBounds(year, month, timezone);
    const expected = gp.expectedReturnDate || gp.returnDate;
    const checkout = gp.checkedOutAt || gp.postingDate;

    if (!checkout) return true;

    const checkoutDate = new Date(checkout);
    const expectedDate = expected ? new Date(expected) : null;

    if (expectedDate && expectedDate > periodEnd && checkoutDate < periodStart) {
        return false;
    }
    if (expectedDate && expectedDate > periodEnd) {
        return false;
    }
    if (expectedDate && expectedDate >= periodStart && expectedDate <= periodEnd && expectedDate < new Date()) {
        return true;
    }
    if (!expectedDate) return true;
    if (checkoutDate >= periodStart && checkoutDate <= periodEnd && !['CLOSED', 'RETURNED'].includes(gp.status)) {
        return true;
    }
    return false;
}

async function runMonthEndCloseChecklist(tenantId, opts = {}, db = prisma) {
    const findings = [];
    const timezone = await getTenantTimezone(tenantId, db);
    const nowPeriod = toUtcPeriodYearMonth(new Date(), timezone);
    const year = opts.year ?? nowPeriod.year;
    const month = opts.month ?? nowPeriod.month;

    if (!month || month < 1 || month > 12) {
        throw Object.assign(new Error('Monthly period close requires month 1–12. Annual close is prohibited.'), {
            statusCode: 422,
            code: 'ANNUAL_CLOSE_PROHIBITED',
        });
    }

    const { start: periodStart, end: periodEnd } = monthBounds(year, month, timezone);

    const [
        openCountSessions,
        pendingApprovals,
        openGetPasses,
        unpostedGrn,
        openTransfers,
        zeroWacBalances,
        draftMovements,
    ] = await Promise.all([
        db.stockCountSession.count({
            where: {
                tenantId,
                status: { notIn: TERMINAL_COUNT_STATUSES },
                countDate: { gte: periodStart, lte: periodEnd },
            },
        }),
        db.approvalRequest.count({
            where: pendingApprovalsInPeriodWhere(tenantId, periodStart, periodEnd),
        }),
        db.getPass.findMany({
            where: { tenantId, status: { in: ACTIVE_GET_PASS_STATUSES } },
            select: {
                id: true,
                passNo: true,
                status: true,
                expectedReturnDate: true,
                returnDate: true,
                checkedOutAt: true,
                postingDate: true,
            },
        }),
        db.grnImport.count({
            where: {
                tenantId,
                status: { in: UNPOSTED_GRN_STATUSES },
                receivingDate: { gte: periodStart, lte: periodEnd },
            },
        }),
        db.storeTransfer.count({
            where: {
                tenantId,
                status: { notIn: ['POSTED', 'REJECTED', 'DRAFT'] },
                transferDate: { gte: periodStart, lte: periodEnd },
            },
        }),
        db.stockBalance.count({
            where: { tenantId, qtyOnHand: { gt: 0 }, wacUnitCost: { lte: 0 } },
        }),
        db.movementDocument.count({
            where: {
                tenantId,
                status: { in: PENDING_MOVEMENT_STATUSES },
                documentDate: { gte: periodStart, lte: periodEnd },
            },
        }),
    ]);

    if (openCountSessions > 0) {
        findings.push({
            code: 'OPEN_INVENTORY_COUNT',
            severity: 'BLOCKER',
            message: 'Inventory count session(s) in this period are not in POSTED/VOID/CANCELLED/REJECTED state.',
            count: openCountSessions,
        });
    }
    if (pendingApprovals > 0) {
        findings.push({
            code: 'PENDING_APPROVALS',
            severity: 'BLOCKER',
            message: 'Approval request(s) still pending.',
            count: pendingApprovals,
        });
    }

    const blockingGetPasses = openGetPasses.filter((gp) =>
        getPassIsBlockerForPeriod(gp, year, month, timezone),
    );
    const carriedForward = await getCarriedForwardGetPassIds(tenantId, assignedPeriodKey(year, month), db);
    const unresolvedGetPasses = blockingGetPasses.filter((gp) => !carriedForward.has(gp.id));
    if (unresolvedGetPasses.length > 0) {
        findings.push({
            code: 'GET_PASS_RESOLUTION_REQUIRED',
            severity: 'BLOCKER',
            message: 'Get pass(es) require resolution before close (§6.13).',
            count: unresolvedGetPasses.length,
            sample: unresolvedGetPasses.slice(0, 5).map((g) => ({ id: g.id, passNo: g.passNo, status: g.status })),
        });
    }

    if (unpostedGrn > 0) {
        findings.push({
            code: 'UNPOSTED_GRN',
            severity: 'BLOCKER',
            message: 'GRN import(s) not yet posted.',
            count: unpostedGrn,
        });
    }
    if (openTransfers > 0) {
        findings.push({
            code: 'TRANSFERS_IN_TRANSIT',
            severity: 'BLOCKER',
            message: 'Store transfer(s) not yet posted or rejected.',
            count: openTransfers,
        });
    }
    if (zeroWacBalances > 0) {
        findings.push({
            code: 'ZERO_WAC_ON_HAND',
            severity: 'BLOCKER',
            message: 'Stock balance row(s) with on-hand qty but zero WAC.',
            count: zeroWacBalances,
        });
    }
    if (draftMovements > 0) {
        findings.push({
            code: 'UNPOSTED_MOVEMENTS',
            severity: 'BLOCKER',
            message: 'Movement document(s) in pre-posted workflow state.',
            count: draftMovements,
        });
    }

    const blockers = findings.filter((f) => f.severity === 'BLOCKER');
    const warnings = findings.filter((f) => f.severity === 'WARNING');

    return {
        tenantId,
        timezone,
        period: { year, month },
        evaluatedAt: new Date().toISOString(),
        ready: blockers.length === 0,
        summary: {
            blockerCount: blockers.length,
            warningCount: warnings.length,
            totalFindings: findings.length,
        },
        findings,
    };
}

/**
 * Always enforces blockers=0 for transition to CLOSED (Ch.6.8.3 / D7).
 */
async function assertCloseBlockersZero(tenantId, opts = {}, db = prisma) {
    const checklist = await runMonthEndCloseChecklist(tenantId, opts, db);
    if (!checklist.ready) {
        const err = new Error('Period close blocked: resolve all blockers before completing close.');
        err.statusCode = 422;
        err.code = 'PERIOD_CLOSE_BLOCKERS';
        err.checklist = checklist;
        throw err;
    }
    return checklist;
}

module.exports = {
    runMonthEndCloseChecklist,
    assertCloseBlockersZero,
    getPassIsBlockerForPeriod,
    pendingApprovalsInPeriodWhere,
    startOfMonth,
};
