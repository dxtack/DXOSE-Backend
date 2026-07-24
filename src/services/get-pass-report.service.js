'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const {
    GET_PASS_APPROVAL_STATUSES,
    GET_PASS_OUT_STATUSES,
    GET_PASS_DISPATCH_STATUSES,
} = require('./workflow-pipeline/workflow-pending.definitions');
const { isOverdueReturn, isExpectedReturnToday } = require('./workflow-pipeline/workflow-pipeline-sla.util');
const {
    createPresentationChainCache,
    waitingRoleFromAccStatus,
} = require('./acc-workflow-presentation.service');

const GET_PASS_IN_WORKFLOW_STATUSES = Object.freeze([
    ...GET_PASS_APPROVAL_STATUSES,
    ...GET_PASS_DISPATCH_STATUSES,
    'RECEIVED_AT_DESTINATION',
    'RETURNING',
    'RETURN_RECEIVED_AT_GATE',
]);

const GET_PASS_ACTIVE_STATUSES = Object.freeze([
    ...GET_PASS_IN_WORKFLOW_STATUSES,
    ...GET_PASS_OUT_STATUSES,
]);

const GET_PASS_RETURNED_STATUSES = Object.freeze(['RETURNED', 'CLOSED']);

const SECTION_GROUP_LABELS = Object.freeze({
    OVERDUE: '1 — Requires immediate action',
    OPEN: '2 — Out on loan — on schedule',
    IN_WORKFLOW: '3 — Pending checkout or return processing',
    RETURNED: '4 — Completed in period',
});

const BUCKET_SORT_ORDER = Object.freeze({
    OVERDUE: 1,
    OPEN: 2,
    IN_WORKFLOW: 3,
    RETURNED: 4,
});

const r2 = (n) => Number(Number(n || 0).toFixed(4));
const r2money = (n) => Number(Number(n || 0).toFixed(2));

function resolveOperationalBucket(pass, now = new Date()) {
    const isOut = GET_PASS_OUT_STATUSES.includes(pass.status);
    const overdue = isOut && isOverdueReturn(pass.expectedReturnDate);

    if (GET_PASS_RETURNED_STATUSES.includes(pass.status)) return 'RETURNED';
    if (overdue) return 'OVERDUE';
    if (isOut) return 'OPEN';
    if (GET_PASS_IN_WORKFLOW_STATUSES.includes(pass.status)) return 'IN_WORKFLOW';
    return 'IN_WORKFLOW';
}

function resolveWorkflowVisibility(pass, overdue, dueToday, chain = null) {
    if (GET_PASS_APPROVAL_STATUSES.includes(pass.status)) {
        return {
            workflowStep: 'Approval',
            waitingRole: waitingRoleFromAccStatus(chain, pass.status) || '',
        };
    }
    if (GET_PASS_DISPATCH_STATUSES.includes(pass.status)) {
        return { workflowStep: 'Dispatch / checkout', waitingRole: '' };
    }
    if (GET_PASS_OUT_STATUSES.includes(pass.status)) {
        if (overdue) return { workflowStep: 'Overdue return', waitingRole: '' };
        if (dueToday) return { workflowStep: 'Return due today', waitingRole: '' };
        return { workflowStep: 'Awaiting return', waitingRole: '' };
    }
    if (['RECEIVED_AT_DESTINATION', 'RETURNING', 'RETURN_RECEIVED_AT_GATE'].includes(pass.status)) {
        return {
            workflowStep: 'Return workflow',
            waitingRole: '',
        };
    }
    if (GET_PASS_RETURNED_STATUSES.includes(pass.status)) {
        return { workflowStep: 'Completed', waitingRole: '' };
    }
    return { workflowStep: pass.status || '', waitingRole: '' };
}

function rollupPassLines(pass) {
    const lines = pass.lines || [];
    const isCustodyOut = GET_PASS_OUT_STATUSES.includes(pass.status);
    let qtyOut = 0;
    let qtyReturned = 0;
    let exposureValue = 0;
    const locNames = new Set();

    for (const line of lines) {
        const qty = Number(line.qty || 0);
        const returned = Number(line.qtyReturned || 0);
        const outstanding = Math.max(0, qty - returned);
        qtyOut += qty;
        qtyReturned += returned;
        if (isCustodyOut && outstanding > 0) {
            exposureValue += outstanding * Number(line.unitCost || 0);
        }
        if (line.location?.name) locNames.add(line.location.name);
    }

    return {
        qtyOut: r2(qtyOut),
        qtyReturned: r2(qtyReturned),
        qtyOutstanding: isCustodyOut ? r2(Math.max(0, qtyOut - qtyReturned)) : 0,
        exposureValue: isCustodyOut ? r2money(exposureValue) : 0,
        sourceLocations: [...locNames].sort().join(', '),
    };
}

function resolveReturnedDate(pass) {
    if (pass.closedAt) return pass.closedAt;
    let latest = null;
    for (const line of pass.lines || []) {
        for (const ret of line.returns || []) {
            if (!ret.returnDate) continue;
            const d = new Date(ret.returnDate);
            if (!latest || d > latest) latest = d;
        }
    }
    return latest;
}

async function mapGetPassOperationalRow(pass, now = new Date(), chainCache = null) {
    const isOut = GET_PASS_OUT_STATUSES.includes(pass.status);
    const overdue = isOut && isOverdueReturn(pass.expectedReturnDate);
    const dueToday = isOut && !overdue && isExpectedReturnToday(pass.expectedReturnDate);
    const operationalBucket = resolveOperationalBucket(pass, now);
    const rollups = rollupPassLines(pass);
    let chain = null;
    if (chainCache) {
        chain = pass.accWorkflowVersionId
            ? await chainCache.getChain({ moduleKey: 'GET_PASS', versionId: pass.accWorkflowVersionId })
            : await chainCache.getChain({ moduleKey: 'GET_PASS' });
    }
    const { workflowStep, waitingRole } = resolveWorkflowVisibility(pass, overdue, dueToday, chain);

    let daysOutstanding = null;
    if (pass.checkedOutAt) {
        daysOutstanding = Math.max(
            0,
            Math.floor((now.getTime() - new Date(pass.checkedOutAt).getTime()) / 86400000),
        );
    }
    let daysOverdue = null;
    if (overdue && pass.expectedReturnDate) {
        daysOverdue = Math.max(
            0,
            Math.floor((now.getTime() - new Date(pass.expectedReturnDate).getTime()) / 86400000),
        );
    }

    const returnedAt = resolveReturnedDate(pass);

    return {
        passNo: pass.passNo,
        status: pass.status,
        operationalBucket,
        sectionGroup: SECTION_GROUP_LABELS[operationalBucket] || operationalBucket,
        transferType: pass.transferType || '',
        borrowingEntity: pass.borrowingEntity || '',
        sourceLocations: rollups.sourceLocations,
        qtyOut: rollups.qtyOut,
        qtyReturned: rollups.qtyReturned,
        qtyOutstanding: rollups.qtyOutstanding,
        exposureValue: rollups.exposureValue,
        checkedOutAt: pass.checkedOutAt ? pass.checkedOutAt.toISOString().split('T')[0] : '',
        expectedReturnDate: pass.expectedReturnDate
            ? pass.expectedReturnDate.toISOString().split('T')[0]
            : '',
        daysOutstanding: daysOutstanding != null ? daysOutstanding : '',
        daysOverdue: daysOverdue != null ? daysOverdue : '',
        returnedDate: returnedAt ? returnedAt.toISOString().split('T')[0] : '',
        closedAt: pass.closedAt ? pass.closedAt.toISOString().split('T')[0] : '',
        workflowStep,
        waitingRole,
        createdAt: pass.createdAt.toISOString().split('T')[0],
        _bucketSort: BUCKET_SORT_ORDER[operationalBucket] ?? 99,
    };
}

function sortOperationalRows(rows) {
    return [...rows].sort((a, b) => {
        const bucketDiff = (a._bucketSort ?? 99) - (b._bucketSort ?? 99);
        if (bucketDiff !== 0) return bucketDiff;
        const overdueDiff = Number(b.daysOverdue || 0) - Number(a.daysOverdue || 0);
        if (overdueDiff !== 0) return overdueDiff;
        return Number(b.exposureValue || 0) - Number(a.exposureValue || 0);
    });
}

function stripInternalRowFields(rows) {
    return rows.map(({ _bucketSort, ...row }) => row);
}

async function getPassOperationalRows(tenantId, { start, end, section, lens, cardId }) {
    const now = new Date();
    const effectiveSection =
        section || (cardId === 'overdue-returns' ? 'overdue' : undefined);

    let where;
    if (lens === 'legacy') {
        where = { tenantId, createdAt: { gte: start, lte: end } };
    } else {
        where = {
            tenantId,
            OR: [
                { status: { in: [...GET_PASS_ACTIVE_STATUSES] } },
                {
                    status: { in: [...GET_PASS_RETURNED_STATUSES] },
                    OR: [
                        { closedAt: { gte: start, lte: end } },
                        { closedAt: null, updatedAt: { gte: start, lte: end } },
                    ],
                },
            ],
        };
    }

    const passes = await prisma.getPass.findMany({
        where,
        include: {
            lines: {
                include: {
                    location: { select: { name: true } },
                    returns: { select: { returnDate: true } },
                },
            },
        },
        orderBy: { updatedAt: 'desc' },
        take: 500,
    });

    const chainCache = createPresentationChainCache(tenantId);
    let rows = sortOperationalRows(
        await Promise.all(passes.map((p) => mapGetPassOperationalRow(p, now, chainCache))),
    );

    if (effectiveSection === 'overdue') {
        rows = rows.filter((r) => r.operationalBucket === 'OVERDUE');
    } else if (effectiveSection === 'open') {
        rows = rows.filter((r) => r.operationalBucket === 'OPEN');
    } else if (effectiveSection === 'returned') {
        rows = rows.filter((r) => r.operationalBucket === 'RETURNED');
    } else if (effectiveSection === 'workflow') {
        rows = rows.filter((r) => r.operationalBucket === 'IN_WORKFLOW');
    }

    return stripInternalRowFields(rows);
}

module.exports = {
    getPassOperationalRows,
    mapGetPassOperationalRow,
    SECTION_GROUP_LABELS,
    GET_PASS_ACTIVE_STATUSES,
};
