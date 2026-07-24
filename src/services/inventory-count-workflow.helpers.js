'use strict';

const prisma = require('../config/database');
const { normalizeRole, connectRole } = require('./rbac.service');
const { hasPermission } = require('../middleware/authorize');
const { assertUserHasCountStepPermission } = require('../acc-authority/step-permission-enforcement');
const {
    resolveScopeContext,
} = require('./scope/scopeContext');
const { isScopeTenantWide: scopeTenantWide } = require('./scope/scope.service');
const {
    countStatusForPendingStep,
    resolveCountWorkflowChain,
} = require('./acc-workflow-count.runtime');
const {
    resolveWorkflowForDocument,
    resolveWorkflowByVersionId,
    approvalRequestVersionPin,
} = require('./acc-workflow-runtime.service');

const ROLE_STOREKEEPER = 'STOREKEEPER';
const ROLE_RECEIVING = 'RECEIVING';
const ROLE_COST_CONTROL = 'COST_CONTROL';
const ROLE_DEPT_MANAGER = 'DEPT_MANAGER';
const ROLE_FINANCE_MANAGER = 'FINANCE_MANAGER';
const ROLE_GENERAL_MANAGER = 'GENERAL_MANAGER';

const OPERATIONAL_STATUSES = Object.freeze(['DRAFT', 'COUNTING', 'RECOUNTING', 'REVEAL_REVIEW']);
const CANCELLABLE_STATUSES = Object.freeze(['DRAFT', 'COUNTING', 'RECOUNTING']);

const COUNT_APPROVAL_ACTIVE_STATUSES = Object.freeze([
    'PENDING_COST_CONTROL',
    'PENDING_DEPT',
    'PENDING_FINANCE',
    'PENDING_GM',
    'PENDING_APPROVAL',
    'DEPT_APPROVED',
    'COST_CONTROL_APPROVED',
    'FINANCE_APPROVED',
]);

const SEND_BACK_BY_ACTOR_ROLE = Object.freeze({
    [ROLE_DEPT_MANAGER]: { mode: 'OPERATIONAL', returnStatus: 'REVEAL_REVIEW', fromStep: 2 },
    [ROLE_FINANCE_MANAGER]: { mode: 'APPROVAL', returnStatus: 'PENDING_DEPT', rewindToStep: 2 },
    [ROLE_GENERAL_MANAGER]: { mode: 'APPROVAL', returnStatus: 'PENDING_FINANCE', rewindToStep: 3 },
});

function bizError(statusCode, code, message, details = []) {
    return { isBizError: true, statusCode, code, message, details };
}

function isCountPrepareRole(role) {
    const r = normalizeRole(role);
    return (
        r === ROLE_STOREKEEPER ||
        r === ROLE_RECEIVING ||
        r === ROLE_COST_CONTROL
    );
}

function isCountExecuteRole(role) {
    // Count entry is permission-gated (STOCK_COUNT_EXECUTE); prepare actors may enter counts.
    const { isInventoryCountCreateActorRole } = require('./inventoryCountWorkflowContext.util');
    return isInventoryCountCreateActorRole(role);
}

function assertCountPrepareActor(user) {
    const { isInventoryCountCreateActorRole } = require('./inventoryCountWorkflowContext.util');
    if (!hasPermission(user, 'STOCK_COUNT_CREATE')) {
        throw bizError(
            403,
            'COUNT_PREPARE_ROLE_REQUIRED',
            'STOCK_COUNT_CREATE permission required to create or prepare count sessions.',
        );
    }
    if (!isInventoryCountCreateActorRole(user?.role)) {
        throw bizError(
            403,
            'COUNT_CREATE_ACTOR_REQUIRED',
            'Only Storekeeper or Cost Control (or Org/Super governance) may create count sessions.',
        );
    }
}

function assertCountCancelActor(user) {
    const { isInventoryCountCreateActorRole } = require('./inventoryCountWorkflowContext.util');
    if (!hasPermission(user, 'STOCK_COUNT_CANCEL')) {
        throw bizError(
            403,
            'COUNT_CANCEL_PERM_REQUIRED',
            'STOCK_COUNT_CANCEL permission required to cancel count sessions.',
        );
    }
    if (!isInventoryCountCreateActorRole(user?.role)) {
        throw bizError(
            403,
            'COUNT_CREATE_ACTOR_REQUIRED',
            'Only Storekeeper or Cost Control (or Org/Super governance) may cancel count sessions.',
        );
    }
}

/**
 * Count entry (sheet qty / submit-counts / upload):
 * STOCK_COUNT_EXECUTE — not APPROVE_INVENTORY_COUNT.
 * Approval endpoints use assertCanActOnApprovalStep → APPROVE_INVENTORY_COUNT separately.
 */
function assertCountExecuteActor(user) {
    if (!hasPermission(user, 'STOCK_COUNT_EXECUTE')) {
        throw bizError(
            403,
            'COUNT_EXECUTE_PERM_REQUIRED',
            'STOCK_COUNT_EXECUTE permission required to enter or submit counts.',
        );
    }
}

function assertCountRecountActor(user) {
    if (!hasPermission(user, 'STOCK_COUNT_RECOUNT')) {
        throw bizError(
            403,
            'COUNT_RECOUNT_PERM_REQUIRED',
            'STOCK_COUNT_RECOUNT permission required to start a recount.',
        );
    }
}

function assertCountSubmitActor(user) {
    if (!hasPermission(user, 'STOCK_COUNT_SUBMIT')) {
        throw bizError(
            403,
            'COUNT_SUBMIT_PERM_REQUIRED',
            'STOCK_COUNT_SUBMIT permission required to submit counts for approval.',
        );
    }
}

function pendingApprovalStep(approvalRequest) {
    if (!approvalRequest?.steps?.length) return null;
    const cur = Number(approvalRequest.currentStep);
    if (Number.isFinite(cur) && cur > 0) {
        const atPointer = approvalRequest.steps.find(
            (step) => step.stepNumber === cur && step.status === 'PENDING',
        );
        if (atPointer) return atPointer;
    }
    const pending = approvalRequest.steps.filter((step) => step.status === 'PENDING');
    if (!pending.length) return null;
    if (pending.length === 1) return pending[0];
    return pending.sort((a, b) => a.stepNumber - b.stepNumber)[0];
}

function assertCanActOnApprovalStep(step, user, sessionStatus) {
    if (!step) {
        throw bizError(403, 'COUNT_SESSION_APPROVAL_ROLE_MISMATCH', 'Approval step has no required role.');
    }
    const required = step?.requiredRole?.code || '';
    assertUserHasCountStepPermission(user, sessionStatus, required || null);
    return { required };
}

async function assertDepartmentManagerSessionScope(user, tenantId, session) {
    const role = normalizeRole(user?.role);
    if (role !== ROLE_DEPT_MANAGER) return;

    if (!session?.departmentId) {
        throw bizError(403, 'COUNT_DEPT_SCOPE_REQUIRED', 'Count session has no department scope.');
    }

    const scope = await resolveScopeContext(user, tenantId);
    if (scopeTenantWide(scope)) {
        throw bizError(
            403,
            'COUNT_DEPT_MANAGER_SCOPE_MISMATCH',
            'Department Manager must be assigned to the session department to approve this count.',
        );
    }

    if (scope.departmentId && scope.departmentId === session.departmentId) return;

    const assignment = await prisma.urUserAssignment.findFirst({
        where: {
            userId: user.id,
            isActive: true,
            role: { code: ROLE_DEPT_MANAGER },
            departments: { some: { departmentId: session.departmentId } },
            properties: { some: { propertyId: tenantId } },
        },
        select: { id: true },
    });
    if (assignment) return;

    throw bizError(
        403,
        'COUNT_DEPT_MANAGER_SCOPE_MISMATCH',
        'Department Manager approval is limited to the session department.',
    );
}

async function resolvePinnedVersionId(session, tenantId) {
    if (session?.approvalRequest?.accWorkflowVersionId) {
        return session.approvalRequest.accWorkflowVersionId;
    }
    const tenant = String(tenantId || '').trim();
    const sessionId = String(session?.id || '').trim();
    const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
    if (!isUuid(tenant) || !isUuid(sessionId)) {
        return null;
    }
    const historical = await prisma.approvalRequest.findFirst({
        where: {
            tenantId,
            requestType: 'COUNT_ADJUSTMENT',
            StockCountSession: { id: session.id },
        },
        orderBy: { createdAt: 'desc' },
        select: { accWorkflowVersionId: true },
    });
    if (historical?.accWorkflowVersionId) return historical.accWorkflowVersionId;
    const chain = await resolveWorkflowForDocument({ moduleKey: 'STOCK_COUNT', tenantId });
    return chain.versionId;
}

async function resolveChainForSession(session, tenantId) {
    const pinnedId = await resolvePinnedVersionId(session, tenantId);
    if (pinnedId) return resolveWorkflowByVersionId(pinnedId);
    if (session?.approvalRequest) return resolveCountWorkflowChain(session.approvalRequest, tenantId);
    return resolveWorkflowForDocument({ moduleKey: 'STOCK_COUNT', tenantId });
}

function buildApprovalStepCreates(roleCodes, { autoApproveStepNumbers = [], autoApprovedBy = null, now = new Date() } = {}) {
    return roleCodes.map((roleCode, index) => {
        const stepNumber = index + 1;
        const isApproved = autoApproveStepNumbers.includes(stepNumber);
        return {
            stepNumber,
            requiredRole: connectRole(roleCode),
            status: isApproved ? 'APPROVED' : 'PENDING',
            ...(isApproved
                ? {
                      actedByUser: { connect: { id: autoApprovedBy } },
                      actedAt: now,
                      comment: 'Cost Control count certification on submit',
                  }
                : {}),
        };
    });
}

function sendBackPlanForActor(roleCode) {
    const plan = SEND_BACK_BY_ACTOR_ROLE[normalizeRole(roleCode)];
    if (!plan) {
        throw bizError(422, 'COUNT_SEND_BACK_NOT_ALLOWED', 'Send Back is not allowed from this approval step.');
    }
    return plan;
}

module.exports = {
    ROLE_STOREKEEPER,
    ROLE_RECEIVING,
    ROLE_COST_CONTROL,
    ROLE_DEPT_MANAGER,
    ROLE_FINANCE_MANAGER,
    ROLE_GENERAL_MANAGER,
    OPERATIONAL_STATUSES,
    CANCELLABLE_STATUSES,
    COUNT_APPROVAL_ACTIVE_STATUSES,
    SEND_BACK_BY_ACTOR_ROLE,
    bizError,
    isCountPrepareRole,
    isCountExecuteRole,
    assertCountPrepareActor,
    assertCountCancelActor,
    assertCountExecuteActor,
    assertCountRecountActor,
    assertCountSubmitActor,
    pendingApprovalStep,
    assertCanActOnApprovalStep,
    assertDepartmentManagerSessionScope,
    resolvePinnedVersionId,
    resolveChainForSession,
    buildApprovalStepCreates,
    sendBackPlanForActor,
    countStatusForPendingStep,
    approvalRequestVersionPin,
};
