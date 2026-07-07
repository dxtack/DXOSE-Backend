/**
 * Month-end close governance (Ch.6.8 / D7 / D8).
 * Blockers=0 required for CLOSED — no environment bypass.
 */
const { PrismaClient } = require('@prisma/client');
const { periodEndInstant, assignedPeriodKey } = require('../platform/postingPeriod.util');
const { getCarriedForwardGetPassIds } = require('../platform/getPassPeriodResolution.util');

const prisma = new PrismaClient();

const TERMINAL_COUNT_STATUSES = ['POSTED', 'VOID', 'REJECTED'];
const ACTIVE_GET_PASS_STATUSES = [
    'OUT',
    'RETURNING',
    'RETURN_RECEIVED_AT_GATE',
    'PARTIALLY_RETURNED',
    'PENDING_SECURITY',
    'APPROVED',
];
const PENDING_MOVEMENT_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'DEPT_APPROVED', 'COST_CONTROL_APPROVED', 'FINANCE_APPROVED'];

/**
 * @typedef {{ code: string, severity: 'BLOCKER'|'WARNING'|'INFO', message: string, count?: number }} GovernanceFinding
 */

function startOfMonth(year, month) {
    return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

/**
 * D8: Get Pass appears as BLOCKER only when rules in §6.13 apply.
 */
function getPassIsBlockerForPeriod(gp, year, month) {
    const periodStart = startOfMonth(year, month);
    const periodEnd = periodEndInstant(year, month);
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

async function runMonthEndCloseChecklist(tenantId, opts = {}) {
    const findings = [];
    const year = opts.year ?? new Date().getFullYear();
    const month = opts.month ?? new Date().getMonth() + 1;

    if (!month || month < 1 || month > 12) {
        throw Object.assign(new Error('Monthly period close requires month 1–12. Annual close is prohibited.'), {
            statusCode: 422,
            code: 'ANNUAL_CLOSE_PROHIBITED',
        });
    }

    const [
        openCountSessions,
        pendingApprovals,
        openGetPasses,
        unpostedGrn,
        openTransfers,
        zeroWacBalances,
        draftMovements,
    ] = await Promise.all([
        prisma.stockCountSession.count({
            where: { tenantId, status: { notIn: TERMINAL_COUNT_STATUSES } },
        }),
        prisma.approvalRequest.count({
            where: { tenantId, status: 'PENDING' },
        }),
        prisma.getPass.findMany({
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
        prisma.grnImport.count({
            where: { tenantId, status: { in: ['DRAFT', 'VALIDATED', 'PENDING_APPROVAL', 'APPROVED'] } },
        }),
        prisma.storeTransfer.count({
            where: { tenantId, status: { notIn: ['POSTED', 'REJECTED', 'DRAFT'] } },
        }),
        prisma.stockBalance.count({
            where: { tenantId, qtyOnHand: { gt: 0 }, wacUnitCost: { lte: 0 } },
        }),
        prisma.movementDocument.count({
            where: { tenantId, status: { in: PENDING_MOVEMENT_STATUSES } },
        }),
    ]);

    if (openCountSessions > 0) {
        findings.push({
            code: 'OPEN_INVENTORY_COUNT',
            severity: 'BLOCKER',
            message: 'Inventory count session(s) not in POSTED/VOID/REJECTED state.',
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

    const blockingGetPasses = openGetPasses.filter((gp) => getPassIsBlockerForPeriod(gp, year, month));
    const carriedForward = await getCarriedForwardGetPassIds(tenantId, assignedPeriodKey(year, month));
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
async function assertCloseBlockersZero(tenantId, opts = {}) {
    const checklist = await runMonthEndCloseChecklist(tenantId, opts);
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
};
