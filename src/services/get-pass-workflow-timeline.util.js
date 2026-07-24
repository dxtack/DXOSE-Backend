'use strict';

const { ROLE_DISPLAY } = require('./workflow-pipeline/workflow-pending.definitions');
const { userDisplayName, toIso } = require('../utils/timeline-present.util');

const TERMINAL_STATUSES = new Set([
    'APPROVED',
    'OUT',
    'RECEIVED_AT_DESTINATION',
    'RETURNING',
    'RETURN_RECEIVED_AT_GATE',
    'PARTIALLY_RETURNED',
    'RETURNED',
    'PENDING_FORCE_CLOSE_SETTLEMENT',
    'CLOSED',
]);

function workflowActiveIndex(status) {
    switch (status) {
        case 'DRAFT':
        case 'PENDING_DEPT':
            return 0;
        case 'PENDING_COST_CONTROL':
            return 1;
        case 'PENDING_FINANCE':
            return 2;
        case 'PENDING_GM':
            return 3;
        case 'PENDING_SECURITY':
            return 4;
        default:
            return TERMINAL_STATUSES.has(status) ? 5 : 0;
    }
}

function rejectionErrorStepIndex(gp) {
    if (!gp.deptApprovedAt) return 0;
    if (!gp.costControlApprovedAt) return 1;
    if (!gp.financeApprovedAt) return 2;
    if (!gp.gmApprovedAt) return 3;
    if (!gp.securityApprovedAt) return 4;
    return 5;
}

function workflowStepUiStatuses(gp) {
    const status = gp.status;
    if (TERMINAL_STATUSES.has(status)) {
        return ['finish', 'finish', 'finish', 'finish', 'finish', 'finish'];
    }
    if (status === 'REJECTED') {
        const err = rejectionErrorStepIndex(gp);
        return [0, 1, 2, 3, 4, 5].map((i) => {
            if (i < err) return 'finish';
            if (i === err) return 'error';
            return 'wait';
        });
    }
    const cur = workflowActiveIndex(status);
    return [0, 1, 2, 3, 4, 5].map((i) => {
        if (i < cur) return 'finish';
        if (i === cur) return 'process';
        return 'wait';
    });
}

function mapUiToPresentationStatus(ui, hasStamp) {
    if (ui === 'error') return 'REJECTED';
    if (ui === 'process') return 'IN_PROGRESS';
    if (ui === 'finish') return hasStamp ? 'APPROVED' : 'COMPLETED';
    return 'PENDING';
}

function buildApprovalSlot(order, def, ui) {
    return {
        order,
        kind: 'APPROVAL',
        stageTitle: def.stageTitle,
        roleLabel: def.roleLabel || null,
        actorName: userDisplayName(def.approver),
        actedAt: toIso(def.approvedAt),
        status: mapUiToPresentationStatus(ui, Boolean(def.approvedAt)),
    };
}

function buildGetPassWorkflowTimeline(gp) {
    if (!gp) return [];
    const ui = workflowStepUiStatuses(gp);
    const steps = [
        {
            stageTitle: 'Department Review',
            roleLabel: ROLE_DISPLAY.DEPT_MANAGER || 'Department Manager',
            approver: gp.deptApprover,
            approvedAt: gp.deptApprovedAt,
        },
        {
            stageTitle: 'Cost Control Review',
            roleLabel: ROLE_DISPLAY.COST_CONTROL || 'Cost Control',
            approver: gp.costControlApprover,
            approvedAt: gp.costControlApprovedAt,
        },
        {
            stageTitle: 'Finance Review',
            roleLabel: ROLE_DISPLAY.FINANCE_MANAGER || 'Finance',
            approver: gp.financeApprover,
            approvedAt: gp.financeApprovedAt,
        },
        {
            stageTitle: 'General Manager Review',
            roleLabel: ROLE_DISPLAY.GENERAL_MANAGER || 'General Manager',
            approver: gp.gmApprover,
            approvedAt: gp.gmApprovedAt,
        },
        {
            stageTitle: 'Security Review',
            roleLabel: ROLE_DISPLAY.SECURITY || 'Security',
            approver: gp.securityApprover,
            approvedAt: gp.securityApprovedAt,
        },
    ];

    const slots = steps.map((step, idx) => buildApprovalSlot(idx + 1, step, ui[idx] ?? 'wait'));

    const clearedUi = ui[5] ?? 'wait';
    let clearedStatus = 'PENDING';
    if (TERMINAL_STATUSES.has(gp.status)) clearedStatus = 'APPROVED';
    else if (clearedUi === 'error') clearedStatus = 'REJECTED';
    else if (clearedUi === 'process') clearedStatus = 'IN_PROGRESS';
    else if (clearedUi === 'finish') clearedStatus = 'APPROVED';

    slots.push({
        order: 6,
        kind: 'MILESTONE',
        stageTitle: 'Approved Cleared',
        roleLabel: null,
        actorName: null,
        actedAt: toIso(gp.securityApprovedAt),
        status: clearedStatus,
    });

    return slots;
}

module.exports = {
    buildGetPassWorkflowTimeline,
};
