'use strict';

/** Statuses from the pre–finance-post / logistics workflow (DB enum). */
const LEGACY_TRANSFER_STATUSES = Object.freeze([
    'SUBMITTED',
    'PENDING_FINAL',
    'APPROVED',
    'IN_TRANSIT',
    'RECEIVED',
    'CLOSED',
]);

const V2_ACTIVE_APPROVAL_STATUSES = Object.freeze([
    'PENDING_DEPT',
    'PENDING_COST_CONTROL',
    'PENDING_FINANCE',
    'PENDING_GM',
    'PENDING_APPROVAL',
    'PENDING_SECURITY',
]);

/** API status filters + virtual bucket for list tabs. */
const TRANSFER_LIST_STATUSES = Object.freeze([
    'DRAFT',
    'PENDING_DEPT',
    'PENDING_COST_CONTROL',
    'PENDING_FINANCE',
    'PENDING_GM',
    'PENDING_APPROVAL',
    'PENDING_SECURITY',
    'POSTED',
    'REJECTED',
    'CANCELLED',
    ...LEGACY_TRANSFER_STATUSES,
]);

/** Rejected list tab includes cancelled creator terminations. */
const REJECTED_TAB_STATUSES = Object.freeze(['REJECTED', 'CANCELLED']);

/** Virtual list filter — not a DB enum. */
const AWAITING_POSTING_BUCKET = 'AWAITING_POSTING';

/** Merged in-progress list tab (V2 + legacy awaiting-posting). */
const PENDING_REVIEW_BUCKET = 'PENDING_REVIEW';

const PENDING_REVIEW_V2_STATUSES = Object.freeze([
    'DRAFT',
    'PENDING_DEPT',
    'PENDING_COST_CONTROL',
    'PENDING_FINANCE',
    'PENDING_GM',
    'PENDING_APPROVAL',
    'PENDING_SECURITY',
    'SUBMITTED',
]);

const PENDING_REVIEW_LEGACY_AWAITING_POST_STATUSES = Object.freeze([
    'PENDING_FINAL',
    'APPROVED',
    'IN_TRANSIT',
]);

/** Roles that are not part of the 2-step transfer approval workflow. */
const OBSOLETE_APPROVAL_ROLE_CODES = Object.freeze([
    'ADMIN',
    'SUPER_ADMIN',
    'ADMINISTRATOR',
    'GENERAL_MANAGER',
]);

const DEPT_ROLE_CODES = Object.freeze(['DEPT_MANAGER', 'OUTLET_MANAGER', 'STOREKEEPER']);
const FINANCE_ROLE_CODES = Object.freeze(['FINANCE_MANAGER', 'FINANCE', 'COST_CONTROL']);

const isObsoleteApprovalRole = (code) =>
    code != null && OBSOLETE_APPROVAL_ROLE_CODES.includes(code);

/**
 * Business approval chain only: Department → Finance (no Administrator).
 * @param {Array<{ requiredRole?: { code?: string } | null, status?: string, stepNumber?: number }>} steps
 */
const filterBusinessApprovalSteps = (steps = []) =>
    (steps || []).filter((s) => !isObsoleteApprovalRole(s.requiredRole?.code));

/**
 * @param {string | null | undefined} roleCode
 */
const workflowKeyFromRoleCode = (roleCode) => {
    if (!roleCode || isObsoleteApprovalRole(roleCode)) return 'AWAITING_POSTING';
    if (DEPT_ROLE_CODES.includes(roleCode)) return 'PENDING_DEPT';
    if (FINANCE_ROLE_CODES.includes(roleCode)) return 'PENDING_FINANCE';
    return 'PENDING_DEPT';
};

/**
 * @param {{ status?: string, postedAt?: Date | string | null }} trf
 */
const isTransferPosted = (trf) => {
    if (!trf) return false;
    if (trf.postedAt) return true;
    if (trf.status === 'POSTED') return true;
    if (['RECEIVED', 'CLOSED'].includes(trf.status)) return true;
    return false;
};

/**
 * @param {Array<{ status?: string, requiredRole?: { code?: string } | null }>} businessSteps
 */
const allBusinessStepsApproved = (businessSteps) =>
    businessSteps.length > 0 && businessSteps.every((s) => s.status === 'APPROVED');

/**
 * Single source of truth for workflow + posting display (list & detail).
 */
const resolveTransferDisplayStatus = (trf) => {
    const posted = isTransferPosted(trf);
    const postingStatus = posted ? 'POSTED' : 'NOT_POSTED';

    if (!trf?.status || trf.status === 'DRAFT') {
        return {
            workflowStatusKey: 'DRAFT',
            postingStatus,
            isPosted: posted,
            pendingRoleCode: null,
            badgeVariant: 'pending',
        };
    }

    if (trf.status === 'REJECTED') {
        return {
            workflowStatusKey: 'REJECTED',
            postingStatus,
            isPosted: posted,
            pendingRoleCode: null,
            badgeVariant: 'rejected',
        };
    }

    if (trf.status === 'CANCELLED') {
        return {
            workflowStatusKey: 'CANCELLED',
            postingStatus,
            isPosted: posted,
            pendingRoleCode: null,
            badgeVariant: 'cancelled',
        };
    }

    if (posted) {
        return {
            workflowStatusKey: 'POSTED',
            postingStatus: 'POSTED',
            isPosted: true,
            pendingRoleCode: null,
            badgeVariant: 'success',
        };
    }

    const businessSteps = filterBusinessApprovalSteps(trf.approvalRequest?.steps || []);
    const pendingBusiness = businessSteps.find((s) => s.status === 'PENDING');

    if (pendingBusiness) {
        const pendingRoleCode = pendingBusiness.requiredRole?.code || null;
        return {
            workflowStatusKey: workflowKeyFromRoleCode(pendingRoleCode),
            postingStatus: 'NOT_POSTED',
            isPosted: false,
            pendingRoleCode,
            badgeVariant: 'pending',
        };
    }

    if (allBusinessStepsApproved(businessSteps)) {
        return {
            workflowStatusKey: 'AWAITING_POSTING',
            postingStatus: 'NOT_POSTED',
            isPosted: false,
            pendingRoleCode: null,
            badgeVariant: 'pending',
        };
    }

    if (trf.status === 'IN_TRANSIT') {
        return {
            workflowStatusKey: 'AWAITING_POSTING',
            postingStatus: 'NOT_POSTED',
            isPosted: false,
            pendingRoleCode: null,
            badgeVariant: 'pending',
        };
    }

    if (trf.status === 'PENDING_DEPT' || trf.status === 'SUBMITTED') {
        return {
            workflowStatusKey: 'PENDING_DEPT',
            postingStatus: 'NOT_POSTED',
            isPosted: false,
            pendingRoleCode: 'DEPT_MANAGER',
            badgeVariant: 'pending',
        };
    }

    if (trf.status === 'PENDING_FINANCE') {
        return {
            workflowStatusKey: 'PENDING_FINANCE',
            postingStatus: 'NOT_POSTED',
            isPosted: false,
            pendingRoleCode: 'FINANCE_MANAGER',
            badgeVariant: 'pending',
        };
    }

    if (
        trf.status === 'PENDING_FINAL' ||
        trf.status === 'APPROVED' ||
        trf.status === 'IN_TRANSIT'
    ) {
        return {
            workflowStatusKey: 'AWAITING_POSTING',
            postingStatus: 'NOT_POSTED',
            isPosted: false,
            pendingRoleCode: null,
            badgeVariant: 'pending',
        };
    }

    return {
        workflowStatusKey: 'AWAITING_POSTING',
        postingStatus: 'NOT_POSTED',
        isPosted: false,
        pendingRoleCode: null,
        badgeVariant: 'pending',
    };
};

const sanitizeApprovalRequest = (approvalRequest) => {
    if (!approvalRequest) return approvalRequest;
    const steps = filterBusinessApprovalSteps(approvalRequest.steps || []);
    return {
        ...approvalRequest,
        steps,
        totalSteps: steps.length,
    };
};

/**
 * @param {{ status?: string, approvalRequest?: { totalSteps?: number } | null }} trf
 */
const resolveWorkflowGeneration = (trf) => {
    const rawSteps = trf?.approvalRequest?.steps || [];
    const hadObsoleteAdmin = rawSteps.some((s) => isObsoleteApprovalRole(s.requiredRole?.code));
    if (hadObsoleteAdmin) return 'LEGACY';
    if (trf?.status && LEGACY_TRANSFER_STATUSES.includes(trf.status)) return 'LEGACY';
    return 'V2';
};

/**
 * @param {{ status?: string, approvalRequest?: object | null, postedAt?: Date | string | null }} trf
 */
const isTransferReadOnly = (trf) => {
    if (!trf) return true;
    if (resolveWorkflowGeneration(trf) === 'LEGACY') return true;
    if (trf.status === 'POSTED' || trf.status === 'REJECTED' || trf.status === 'CANCELLED') return true;
    if (['RECEIVED', 'CLOSED'].includes(trf.status)) return true;
    if (isTransferPosted(trf)) return true;
    return false;
};

const {
    mapUserFacingState,
    isSendBackReturned,
} = require('../platform/lifecyclePresentation.service');
const { ROLE_DISPLAY } = require('./workflow-pipeline/workflow-pending.definitions');
const { userDisplayName } = require('../utils/timeline-present.util');

const num = (v) => (v == null ? v : Number(v));

const attachUserFacingState = (trf) => {
    if (!trf) return trf;
    return {
        ...trf,
        userFacingState: mapUserFacingState('TRANSFER', trf.status, { notes: trf.notes }),
    };
};

/**
 * Human-readable role label for list/detail target hints.
 * @param {string | null | undefined} roleCode
 * @param {string | null | undefined} roleName
 */
const pendingRoleDisplayLabel = (roleCode, roleName) => {
    const code = roleCode ? String(roleCode).trim().toUpperCase() : '';
    // Prefer transfer-facing labels; Finance Manager is clearer than pipeline short "Finance".
    if (code === 'FINANCE_MANAGER') return 'Finance Manager';
    if (code && ROLE_DISPLAY[code]) return ROLE_DISPLAY[code];
    const name = roleName ? String(roleName).trim() : '';
    if (name) return name;
    return code || null;
};

/**
 * True when the transfer is Returned / Pending correction (creator desk).
 * @param {{ status?: string, notes?: string | null, approvalRequest?: { currentStep?: number } | null, userFacingState?: string | null }} trf
 */
const isTransferReturnedDocument = (trf) => {
    if (!trf) return false;
    if (String(trf.userFacingState || '') === 'Returned') return true;
    if (isSendBackReturned(trf.status, trf.notes)) return true;
    const status = String(trf.status || '').toUpperCase();
    if (status === 'DRAFT' && trf.approvalRequest && Number(trf.approvalRequest.currentStep) === 0) {
        return true;
    }
    return false;
};

/**
 * List/detail enrichment: who holds the next action.
 * @param {object} trf
 * @param {{ pendingRoleCode?: string | null }} displayStatus
 * @returns {{ pendingRoleLabel: string | null, targetUserLabel: string | null, workflowTargetText: string | null }}
 */
const resolveTransferWorkflowTarget = (trf, displayStatus) => {
    if (!trf) {
        return { pendingRoleLabel: null, targetUserLabel: null, workflowTargetText: null };
    }

    const status = String(trf.status || '').toUpperCase();

    // Terminal documents never show "Waiting for: …".
    if (status === 'POSTED' || status === 'RECEIVED' || status === 'CLOSED') {
        return { pendingRoleLabel: null, targetUserLabel: null, workflowTargetText: null };
    }

    if (status === 'REJECTED' || status === 'CANCELLED') {
        const actorName =
            userDisplayName(trf.rejectedByUser) ||
            userDisplayName(trf.requestedByUser) ||
            'Unknown';
        return {
            pendingRoleLabel: null,
            targetUserLabel: actorName,
            workflowTargetText:
                status === 'CANCELLED'
                    ? `Cancelled by: ${actorName}`
                    : `Rejected by: ${actorName}`,
        };
    }

    if (isTransferReturnedDocument(trf)) {
        const creatorName = userDisplayName(trf.requestedByUser);
        const targetUserLabel = creatorName ? `${creatorName} (Creator)` : 'Creator';
        return {
            pendingRoleLabel: null,
            targetUserLabel,
            workflowTargetText: `Returned to: ${creatorName || 'Creator'}`,
        };
    }

    const pendingRoleCode = displayStatus?.pendingRoleCode || null;
    const pendingStep = filterBusinessApprovalSteps(trf.approvalRequest?.steps || []).find(
        (s) => s.status === 'PENDING',
    );
    const roleName = pendingStep?.requiredRole?.name || null;
    const pendingRoleLabel = pendingRoleDisplayLabel(pendingRoleCode, roleName);

    if (pendingRoleLabel) {
        return {
            pendingRoleLabel,
            targetUserLabel: null,
            workflowTargetText: `Waiting for: ${pendingRoleLabel}`,
        };
    }

    return { pendingRoleLabel: null, targetUserLabel: null, workflowTargetText: null };
};

const attachDisplayStatus = (trf) => {
    if (!trf) return null;
    const displayStatus = resolveTransferDisplayStatus(trf);
    const approvalRequest = sanitizeApprovalRequest(trf.approvalRequest);
    const { buildTransferWorkflowContext } = require('./transferWorkflowContext.util');
    const workflow = buildTransferWorkflowContext({
        ...trf,
        approvalRequest,
        pendingRoleCode: displayStatus.pendingRoleCode,
    });
    const withFacing = attachUserFacingState({
        ...trf,
        approvalRequest,
        displayStatus,
        workflowStatusKey: displayStatus.workflowStatusKey,
        postingStatus: displayStatus.postingStatus,
        isPosted: displayStatus.isPosted,
        pendingRoleCode: displayStatus.pendingRoleCode,
        workflow,
    });
    const target = resolveTransferWorkflowTarget(withFacing, displayStatus);
    return {
        ...withFacing,
        pendingRoleLabel: target.pendingRoleLabel,
        targetUserLabel: target.targetUserLabel,
        workflowTargetText: target.workflowTargetText,
    };
};

const mapTransferDetailResponse = (trf) => {
    if (!trf) return null;
    const workflowGeneration = resolveWorkflowGeneration(trf);
    const readOnly = isTransferReadOnly(trf);
    const base = {
        ...trf,
        workflowGeneration,
        readOnly,
        lines: (trf.lines || []).map((line) => ({
            ...line,
            requestedQty: num(line.requestedQty),
            receivedQty: line.receivedQty != null ? num(line.receivedQty) : null,
            unitCost: num(line.unitCost),
            totalValue: num(line.totalValue),
        })),
    };
    return attachDisplayStatus(base);
};

const mapTransferListRow = (row) => attachDisplayStatus(row);

/**
 * Prisma where clause for list tab "Awaiting Posting".
 * @param {string} tenantId
 */
/** Legacy / pre-post rows: finance path complete, inventory not posted yet. */
const awaitingPostingListWhere = (tenantId) => ({
    tenantId,
    postedAt: null,
    status: { in: [...PENDING_REVIEW_LEGACY_AWAITING_POST_STATUSES] },
});

/**
 * List tab "Pending Review" — in-progress V2 statuses + legacy awaiting-posting rows.
 * Scope / location / date filters are applied by `listTransfers` (unchanged).
 * @param {string} tenantId
 */
const pendingReviewListWhere = (tenantId) => ({
    tenantId,
    OR: [
        { status: { in: [...PENDING_REVIEW_V2_STATUSES] } },
        {
            postedAt: null,
            status: { in: [...PENDING_REVIEW_LEGACY_AWAITING_POST_STATUSES] },
        },
    ],
});

module.exports = {
    LEGACY_TRANSFER_STATUSES,
    V2_ACTIVE_APPROVAL_STATUSES,
    TRANSFER_LIST_STATUSES,
    REJECTED_TAB_STATUSES,
    AWAITING_POSTING_BUCKET,
    PENDING_REVIEW_BUCKET,
    OBSOLETE_APPROVAL_ROLE_CODES,
    filterBusinessApprovalSteps,
    resolveWorkflowGeneration,
    isTransferReadOnly,
    isTransferPosted,
    resolveTransferDisplayStatus,
    resolveTransferWorkflowTarget,
    isTransferReturnedDocument,
    mapTransferDetailResponse,
    mapTransferListRow,
    awaitingPostingListWhere,
    pendingReviewListWhere,
};
