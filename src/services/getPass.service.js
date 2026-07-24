const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/** Canonical 404 for missing or cross-tenant Get Pass reads (Ch.23 tenant boundary). */
const passNotFoundErr = () => Object.assign(new Error('Get Pass not found.'), { status: 404 });

const { generateDocNumber, DocPrefix } = require('./docNumbering.service');
const { logAction, EntityType } = require('./auditTrail.service');
const { logGovernedEvent } = require('./auditGoverned.service');
const postingEngine = require('./postingEngine.service');
const { validatePostingDate } = require('./periodGuard.service');
const { assertIntegerQuantity } = require('./integerQuantityGuard.service');
const { connectRole, normalizeRole } = require('./rbac.service');
const {
    resolveScopeContext,
    scopeWhereFor,
    metaFor,
    assertInScope,
    assertLocationInScope,
    SCOPE_MODULE,
} = require('./scope/scopeContext');
const { assertActiveAssignmentForMutation } = require('./scope/assignment-mutation.guard');
const { createMovementApprovalRequest, persistBreakagePhotos } = require('./breakage.service');
const { withUserFacingState, SEND_BACK_NOTES_MARKER } = require('../platform/lifecyclePresentation.service');
const { assertConcurrencyVersion, bumpConcurrencyUpdate, concurrencyConflictError } = require('../platform/concurrency.service');
const {
    createGetPassReturnDispositionBatch,
    queueGetPassReturnDispositionLine,
    flushGetPassReturnDispositionBatch,
    stripExistingGetPassReturnDispositionsFromBatch,
} = require('./getPassReturnDisposition.util');
const { organizationRootId } = require('./organization.service');
const {
    notifyIncomingInternalGetPass,
    notifySourceTenantAdminsOfPermanentReceipt,
    notifyTenantRoles,
} = require('./systemNotification.service');
const {
    GET_PASS_OUTGOING_OPEN_STATUSES,
    GET_PASS_INCOMING_OPERATIONAL_STATUSES,
    buildGetPassReturnsListWhere,
} = require('./get-pass-workflow-tabs.util');
const {
    assertForceCloseEligible,
    assertSimpleCloseOutstandingZero,
    assertNotPendingForceCloseSettlement,
    assertSettlementSubmitEligible,
    validateSettlementPayload,
    lineOutstandingQty,
    hasOutstandingQty,
} = require('./get-pass-force-close.util');
const {
    assertUserHasGetPassStepPermission,
    assertUserHasPermission,
    userHasPermission,
} = require('../acc-authority/step-permission-enforcement');
const {
  resolveGetPassWorkflowContext,
  resolveStepRole,
  resolveStepPermission,
  getSubmitInitialWorkflowFromContext,
  getApproveTransitionData,
  getPassVersionPin,
} = require('./acc-workflow-get-pass.runtime');
const { resolveWorkflowForDocument, resolveWorkflowByVersionId } = require('./acc-workflow-runtime.service');
const { resolveGetPassPermission } = require('../acc-authority/workflow-step-permissions');
const {
    executeWorkflowSendBackInTx,
    executeCreatorResubmitInTx,
    normalizeReason,
} = require('../platform/workflowSendBack.service');

/**
 * Operational Get Pass lists are tenant-specific only.
 * Org-wide aggregation belongs on dedicated org-level screens (not the operational list).
 */
const resolveOrgWideGetPassListContext = async (_tenantId, _role) => null;

/** Prisma include graph for Get Pass detail (issuer + reader). */
const getPassDetailInclude = {
    department: true,
    tenant: { select: { id: true, name: true, slug: true, email: true, phone: true, address: true } },
    targetTenant: { select: { id: true, name: true, slug: true, email: true } },
    createdByUser: true,
    deptApprover: true,
    costControlApprover: true,
    financeApprover: true,
    gmApprover: true,
    securityApprover: true,
    destinationSecurityApprover: { select: { id: true, firstName: true, lastName: true, email: true } },
    destinationSecurityExitUser: { select: { id: true, firstName: true, lastName: true, email: true } },
    checkoutUser: true,
    closingUser: true,
    receivedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    destinationDeptAccepter: { select: { id: true, firstName: true, lastName: true } },
    lines: {
        include: {
            item: true,
            location: true,
            returns: { include: { registeredByUser: true, securityUser: true } },
        },
    },
};

const findIssuerPass = (tx, id, issuerTenantId) =>
    tx.getPass.findFirst({
        where: { id, tenantId: issuerTenantId },
        include: getPassDetailInclude,
    });

const findReadablePass = (tx, id, viewerTenantId) =>
    tx.getPass.findFirst({
        where: {
            id,
            OR: [{ tenantId: viewerTenantId }, { targetTenantId: viewerTenantId, isInternalTransfer: true }],
        },
        include: getPassDetailInclude,
    });

const DEFAULT_TRANSFERRED_CATEGORY_NAME = 'Transferred Items';

const normalizeComparableName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const resolveTransferredCategoryId = async (tx, { sourceCategoryId, sourceTenantId, targetTenantId, targetDepartmentId }) => {
    if (sourceCategoryId) {
        const sameIdCategory = await tx.category.findFirst({
            where: { id: sourceCategoryId, tenantId: targetTenantId, isActive: true },
            select: { id: true },
        });
        if (sameIdCategory) {
            return sameIdCategory.id;
        }

        const sourceCategory = await tx.category.findFirst({
            where: { id: sourceCategoryId, tenantId: sourceTenantId },
            select: { name: true },
        });

        if (sourceCategory?.name) {
            const normalizedSourceCategoryName = normalizeComparableName(sourceCategory.name);
            const targetCategories = await tx.category.findMany({
                where: { tenantId: targetTenantId, isActive: true },
                select: { id: true, name: true },
            });
            const sameNameCategory = targetCategories.find(
                (category) => normalizeComparableName(category.name) === normalizedSourceCategoryName,
            );
            if (sameNameCategory) {
                return sameNameCategory.id;
            }
        }
    }

    const targetCategories = await tx.category.findMany({
        where: { tenantId: targetTenantId },
        select: { id: true, name: true },
    });
    const fallbackCategory = targetCategories.find(
        (category) => normalizeComparableName(category.name) === normalizeComparableName(DEFAULT_TRANSFERRED_CATEGORY_NAME),
    );
    if (fallbackCategory) {
        return fallbackCategory.id;
    }

    const createdCategory = await tx.category.create({
        data: {
            tenantId: targetTenantId,
            name: DEFAULT_TRANSFERRED_CATEGORY_NAME,
            departmentId: targetDepartmentId || null,
            isActive: true,
        },
        select: { id: true },
    });
    return createdCategory.id;
};

const resolveDestinationItemForPermanentTransfer = async (
    tx,
    { line, sourceTenantId, targetTenantId, targetDepartmentId, targetLocationId },
) => {
    const sourceItem = line.item;
    if (!sourceItem) {
        throw Object.assign(new Error('Transferred line item could not be resolved.'), { statusCode: 400 });
    }

    if (sourceItem.code) {
        const existingByCode = await tx.item.findFirst({
            where: { tenantId: targetTenantId, code: sourceItem.code },
            select: { id: true },
        });
        if (existingByCode) {
            return existingByCode.id;
        }
    }

    const existingByName = await tx.item.findFirst({
        where: { tenantId: targetTenantId, name: sourceItem.name },
        select: { id: true },
    });
    if (existingByName) {
        return existingByName.id;
    }

    const categoryId = await resolveTransferredCategoryId(tx, {
        sourceCategoryId: sourceItem.categoryId,
        sourceTenantId,
        targetTenantId,
        targetDepartmentId,
    });

    const conflictingCode = sourceItem.code
        ? await tx.item.findFirst({
              where: { tenantId: targetTenantId, code: sourceItem.code },
              select: { id: true },
          })
        : null;

    const createdItem = await tx.item.create({
        data: {
            tenantId: targetTenantId,
            name: sourceItem.name,
            description: sourceItem.description || null,
            categoryId,
            barcode: sourceItem.barcode || null,
            unitPrice: sourceItem.unitPrice || 0,
            imageUrl: sourceItem.imageUrl || null,
            isActive: sourceItem.isActive !== false,
            code: conflictingCode ? null : sourceItem.code || null,
            defaultStoreId: targetLocationId,
            departmentId: targetDepartmentId,
            reorderPoint: Number(sourceItem.reorderPoint || 0),
            reorderQty: Number(sourceItem.reorderQty || 0),
        },
        select: { id: true },
    });

    return createdItem.id;
};

/**
 * Issuing hotel only — mutations (update, checkout, returns, …).
 */
const getIssuerGetPassById = async (id, issuerTenantId) => {
    const getPass = await findIssuerPass(prisma, id, issuerTenantId);
    if (!getPass) throw passNotFoundErr();
    return getPass;
};

const getGetPassReverseAuditTrail = async (getPass) => {
    if (!getPass?.id) return null;

    const tenantScope = [getPass.tenantId, getPass.targetTenantId].filter(Boolean);
    const reverseNotes = [
        'GET_PASS_SHIP_BACK',
        'GET_PASS_CONFIRM_RETURN_EXIT',
        'GET_PASS_CONFIRM_RETURN_ARRIVAL',
        'GET_PASS_ACCEPT_RETURN_DEPARTMENT',
    ];
    const logs = await prisma.auditLog.findMany({
        where: {
            entityType: 'GET_PASS',
            entityId: String(getPass.id),
            action: 'UPDATE',
            note: { in: reverseNotes },
            tenantId: { in: tenantScope },
        },
        orderBy: { changedAt: 'desc' },
        include: {
            changedByUser: {
                select: { id: true, firstName: true, lastName: true, email: true },
            },
        },
    });

    const shipBack = logs.find((log) => log.note === 'GET_PASS_SHIP_BACK') || null;
    const confirmExit = logs.find((log) => log.note === 'GET_PASS_CONFIRM_RETURN_EXIT') || null;
    const confirmArrival = logs.find((log) => log.note === 'GET_PASS_CONFIRM_RETURN_ARRIVAL') || null;
    const acceptReturnDepartment = logs.find((log) => log.note === 'GET_PASS_ACCEPT_RETURN_DEPARTMENT') || null;

    return {
        shipBackAt: shipBack?.changedAt ?? null,
        shipBackBy: shipBack?.changedBy ?? null,
        shipBackByUser: shipBack?.changedByUser ?? null,
        confirmReturnExitAt: confirmExit?.changedAt ?? null,
        confirmReturnExitBy: confirmExit?.changedBy ?? null,
        confirmReturnExitByUser: confirmExit?.changedByUser ?? null,
        confirmReturnArrivalAt: confirmArrival?.changedAt ?? null,
        confirmReturnArrivalBy: confirmArrival?.changedBy ?? null,
        confirmReturnArrivalByUser: confirmArrival?.changedByUser ?? null,
        acceptReturnDeptAt: acceptReturnDepartment?.changedAt ?? null,
        acceptReturnDeptBy: acceptReturnDepartment?.changedBy ?? null,
        acceptReturnDeptByUser: acceptReturnDepartment?.changedByUser ?? null,
    };
};

const PENDING_APPROVAL_STATUSES = [
    'PENDING_DEPT',
    'PENDING_COST_CONTROL',
    'PENDING_FINANCE',
    'PENDING_GM',
    'PENDING_SECURITY',
];

const GET_PASS_APPROVAL_STAMP_FIELDS = {
    PENDING_DEPT: { by: 'deptApprovedBy', at: 'deptApprovedAt' },
    PENDING_COST_CONTROL: { by: 'costControlApprovedBy', at: 'costControlApprovedAt' },
    PENDING_FINANCE: { by: 'financeApprovedBy', at: 'financeApprovedAt' },
    PENDING_GM: { by: 'gmApprovedBy', at: 'gmApprovedAt' },
    PENDING_SECURITY: { by: 'securityApprovedBy', at: 'securityApprovedAt' },
};

const APPROVER_RELATION_BY_STATUS = Object.freeze({
    PENDING_DEPT: 'deptApprover',
    PENDING_COST_CONTROL: 'costControlApprover',
    PENDING_FINANCE: 'financeApprover',
    PENDING_GM: 'gmApprover',
    PENDING_SECURITY: 'securityApprover',
});

const getPassPendingStatusesForChain = (chain) => {
    const fromChain = (chain.steps || []).map((s) => String(s.statusKey || '').toUpperCase()).filter(Boolean);
    return fromChain.length ? fromChain : PENDING_APPROVAL_STATUSES;
};

const getPassStatusForPendingStep = (chain, stepNumber) => {
    if (stepNumber <= 0) return 'DRAFT';
    const statuses = getPassPendingStatusesForChain(chain);
    return statuses[stepNumber - 1] || statuses[0] || 'PENDING_DEPT';
};

const getPassCurrentStepFromStatus = (chain, status) => {
    const statuses = getPassPendingStatusesForChain(chain);
    const idx = statuses.findIndex((s) => s === String(status || '').toUpperCase());
    return idx >= 0 ? idx + 1 : 1;
};

const getPassApprovedStampForStep = (getPass, chain, stepNumber) => {
    const statusKey = getPassStatusForPendingStep(chain, stepNumber);
    const fields = GET_PASS_APPROVAL_STAMP_FIELDS[statusKey];
    if (!fields) return null;
    const actedBy = getPass[fields.by] || null;
    const actedAt = getPass[fields.at] || null;
    return actedBy || actedAt ? { actedBy, actedAt } : null;
};

/** Prior workflow actors only: Creator + steps before current (C → A,B ; B → A). */
function buildGetPassSendBackTargets(getPass, chain) {
    if (!getPass || !chain) return [];
    const status = String(getPass.status || '').toUpperCase();
    const pending = getPassPendingStatusesForChain(chain);
    if (!pending.includes(status)) return [];

    const currentStepNo = getPassCurrentStepFromStatus(chain, status);
    if (currentStepNo <= 0) return [];

    const { userDisplayName } = require('../utils/timeline-present.util');
    const creatorId = getPass.createdBy || getPass.createdByUser?.id || null;
    const targets = [
        {
            stepNumber: 0,
            targetType: 'CREATOR',
            roleCode: null,
            statusKey: null,
            actorName: userDisplayName(getPass.createdByUser) || null,
        },
    ];

    const steps = Array.isArray(chain.steps) ? chain.steps : [];
    const roleCodes = chain.roleCodes || steps.map((s) => s.roleCode).filter(Boolean);

    for (let i = 0; i < currentStepNo - 1; i++) {
        const step = steps[i] || {};
        const stepNumber = i + 1;
        const statusKey = String(step.statusKey || pending[i] || '').toUpperCase();
        const stampFields = GET_PASS_APPROVAL_STAMP_FIELDS[statusKey];
        const actedById = stampFields ? getPass[stampFields.by] || null : null;
        // Skip steps the document creator already acted (same rule as Breakage / GRN / Transfer).
        if (creatorId && actedById && String(actedById) === String(creatorId)) {
            continue;
        }
        const roleCode = step.roleCode || roleCodes[i] || null;
        const rel = APPROVER_RELATION_BY_STATUS[statusKey];
        const actorName = rel ? userDisplayName(getPass[rel]) || null : null;
        targets.push({
            stepNumber,
            targetType: 'STEP',
            roleCode: roleCode ? String(roleCode).toUpperCase() : null,
            statusKey: statusKey || null,
            actorName,
        });
    }
    return targets;
}

/** Clear approval stamps from target step onward (or all when Returned to creator). */
function stampClearDataForSendBackTarget(chain, targetStepNo) {
    const data = {};
    const statuses = getPassPendingStatusesForChain(chain);
    for (let i = 0; i < statuses.length; i++) {
        const stepNo = i + 1;
        if (targetStepNo > 0 && stepNo < targetStepNo) continue;
        const fields = GET_PASS_APPROVAL_STAMP_FIELDS[statuses[i]];
        if (!fields) continue;
        data[fields.by] = null;
        data[fields.at] = null;
    }
    return data;
}

async function ensureGetPassApprovalRequestInTx(tx, getPass, tenantId) {
    if (getPass.approvalRequest) return getPass.approvalRequest;

    const existing = await tx.approvalRequest.findFirst({
        where: { getPassId: getPass.id },
        include: {
            steps: {
                orderBy: { stepNumber: 'asc' },
                include: { requiredRole: { select: { code: true } } },
            },
        },
    });
    if (existing) return existing;

    const chain = getPass.accWorkflowVersionId
        ? await resolveWorkflowByVersionId(getPass.accWorkflowVersionId)
        : await resolveWorkflowForDocument({ moduleKey: 'GET_PASS', tenantId });
    const roleCodes = chain.roleCodes || (chain.steps || []).map((s) => s.roleCode).filter(Boolean);
    if (!roleCodes.length) {
        throw Object.assign(new Error('ACC published workflow is required for Get Pass.'), { status: 422 });
    }
    const currentStep = PENDING_APPROVAL_STATUSES.includes(String(getPass.status || '').toUpperCase())
        ? getPassCurrentStepFromStatus(chain, getPass.status)
        : 1;
    const request = await tx.approvalRequest.create({
        data: {
            tenantId,
            requestType: 'GET_PASS',
            status: 'PENDING',
            getPassId: getPass.id,
            currentStep,
            totalSteps: roleCodes.length,
            createdBy: getPass.createdBy,
            // Scalar pin only — matches Breakage/Transfer; nested connect can fail on some clients.
            ...(getPass.accWorkflowVersionId
                ? { accWorkflowVersionId: getPass.accWorkflowVersionId }
                : getPassVersionPin(chain)),
            steps: {
                create: roleCodes.map((roleCode, index) => {
                    const stepNumber = index + 1;
                    const stamp = stepNumber < currentStep ? getPassApprovedStampForStep(getPass, chain, stepNumber) : null;
                    return {
                        stepNumber,
                        requiredRole: connectRole(roleCode),
                        status: stamp ? 'APPROVED' : 'PENDING',
                        ...(stamp?.actedBy ? { actedByUser: { connect: { id: stamp.actedBy } } } : {}),
                        ...(stamp?.actedAt ? { actedAt: stamp.actedAt } : {}),
                    };
                }),
            },
        },
        include: {
            steps: {
                orderBy: { stepNumber: 'asc' },
                include: { requiredRole: { select: { code: true } } },
            },
        },
    });
    if (!getPass.accWorkflowVersionId && chain.versionId) {
        await tx.getPass.update({
            where: { id: getPass.id },
            data: getPassVersionPin(chain),
        });
        request.accWorkflowVersionId = chain.versionId;
    }
    return request;
}

/**
 * Keep ApprovalRequest aligned with Get Pass status/stamps.
 * Stale AR.currentStep was throwing false "modified by another user" on Send Back.
 */
async function syncGetPassApprovalRequestToDocumentInTx(tx, approvalRequest, getPass, chain) {
    const expectedStep = PENDING_APPROVAL_STATUSES.includes(String(getPass.status || '').toUpperCase())
        ? getPassCurrentStepFromStatus(chain, getPass.status)
        : Number(approvalRequest.currentStep) || 1;

    const steps = [...(approvalRequest.steps || [])].sort((a, b) => a.stepNumber - b.stepNumber);
    if (!steps.length) {
        throw Object.assign(new Error('Approval chain has no steps for this Get Pass.'), { status: 422 });
    }
    if (expectedStep < 0 || expectedStep > steps.length) {
        throw Object.assign(new Error('Get Pass approval step is out of range for the pinned workflow.'), {
            status: 422,
        });
    }

    const needsHeaderSync =
        Number(approvalRequest.currentStep) !== expectedStep ||
        String(approvalRequest.status || '').toUpperCase() !== 'PENDING';

    if (needsHeaderSync) {
        await tx.approvalRequest.update({
            where: { id: approvalRequest.id },
            data: { currentStep: expectedStep, status: 'PENDING', resolvedAt: null },
        });
    }

    for (const st of steps) {
        if (st.stepNumber < expectedStep) {
            const stamp = getPassApprovedStampForStep(getPass, chain, st.stepNumber);
            const data = {
                status: 'APPROVED',
                actedAt: stamp?.actedAt || st.actedAt || new Date(),
            };
            if (stamp?.actedBy) {
                data.actedByUser = { connect: { id: stamp.actedBy } };
            } else if (!st.actedBy) {
                data.actedByUser = { disconnect: true };
            }
            await tx.approvalStep.update({ where: { id: st.id }, data });
        } else {
            await tx.approvalStep.update({
                where: { id: st.id },
                data: {
                    status: 'PENDING',
                    actedByUser: { disconnect: true },
                    actedAt: null,
                },
            });
        }
    }

    const refreshed = await tx.approvalRequest.findFirst({
        where: { id: approvalRequest.id },
        include: {
            steps: {
                orderBy: { stepNumber: 'asc' },
                include: { requiredRole: { select: { code: true } } },
            },
        },
    });
    return refreshed || { ...approvalRequest, currentStep: expectedStep, status: 'PENDING' };
}

const buildActOnStatusOptions = (status, getPass, workflowContext, extra = {}) => ({
    ...extra,
    stepRole: resolveStepRole(status, workflowContext),
    stepPermission: resolveStepPermission(status, workflowContext),
});

const assertCanActOnStatus = (status, user, options = {}) => {
    assertUserHasGetPassStepPermission(user, status, options);
};

const REVERSIBLE_TYPES = ['TEMPORARY', 'CATERING', 'OUTSIDE_CATERING'];
const BLOCKING_TRANSFER_TYPES = new Set(REVERSIBLE_TYPES);
const OVERDUE_TRANSFER_TYPES = new Set(['TEMPORARY', 'CATERING', 'OUTSIDE_CATERING']);
const OVERDUE_STATUSES = new Set(['OUT', 'PARTIALLY_RETURNED']);
const RETURN_REQUIRED_TRANSFER_TYPES = new Set(REVERSIBLE_TYPES);

const isOrgWorkflowBypass = (role) => {
    const r = normalizeRole(role);
    return r === 'ORG_MANAGER' || r === 'SUPER_ADMIN';
};

const assertGetPassOperationalPermission = (user, status, options = {}) => {
    const perm = resolveGetPassPermission(status, options.waitingForRole, options);
    assertUserHasPermission(user, perm);
};

const resolveTemporaryDatesForCreate = (data) => {
    let returnDate = data.returnDate ? new Date(data.returnDate) : null;
    let expectedReturnDate = data.expectedReturnDate ? new Date(data.expectedReturnDate) : null;
    if (RETURN_REQUIRED_TRANSFER_TYPES.has(data.transferType)) {
        const effective = returnDate || expectedReturnDate;
        if (data.transferType === 'TEMPORARY') {
            if (!effective) {
                throw Object.assign(new Error('returnDate or expectedReturnDate is required for TEMPORARY transfers.'), {
                    statusCode: 400,
                });
            }
            returnDate = returnDate || effective;
            expectedReturnDate = expectedReturnDate || effective;
        } else {
            if (!expectedReturnDate) {
                throw Object.assign(
                    new Error('expectedReturnDate is required for CATERING and OUTSIDE_CATERING transfers.'),
                    { statusCode: 400 }
                );
            }
            returnDate = null;
        }
    } else {
        returnDate = null;
    }
    return { returnDate, expectedReturnDate };
};

const resolveTemporaryDatesForUpdate = (data, existing) => {
    const transferType = data.transferType !== undefined ? data.transferType : existing.transferType;
    let returnDate =
        data.returnDate !== undefined
            ? (data.returnDate ? new Date(data.returnDate) : null)
            : existing.returnDate;
    let expectedReturnDate =
        data.expectedReturnDate !== undefined
            ? (data.expectedReturnDate ? new Date(data.expectedReturnDate) : null)
            : existing.expectedReturnDate;
    if (RETURN_REQUIRED_TRANSFER_TYPES.has(transferType)) {
        const effective = returnDate || expectedReturnDate;
        if (transferType === 'TEMPORARY') {
            if (!effective) {
                throw Object.assign(new Error('returnDate or expectedReturnDate is required for TEMPORARY transfers.'), {
                    statusCode: 400,
                });
            }
            returnDate = returnDate || effective;
            expectedReturnDate = expectedReturnDate || effective;
        } else {
            if (!expectedReturnDate) {
                throw Object.assign(
                    new Error('expectedReturnDate is required for CATERING and OUTSIDE_CATERING transfers.'),
                    { statusCode: 400 }
                );
            }
            returnDate = null;
        }
    } else {
        returnDate = null;
    }
    return { returnDate, expectedReturnDate };
};

const isBlockingTransferType = (transferType) => postingEngine.isBlockingTransferType(transferType);
const isReversibleTransferType = (transferType) => postingEngine.isReversibleTransferType(transferType);
const createTrackingLedgerEntry = (tx, params) => postingEngine.createTrackingLedgerEntry(tx, params);
const isGetPassOverdue = (getPass, now = new Date()) => {
    if (!getPass?.expectedReturnDate) return false;
    if (!OVERDUE_TRANSFER_TYPES.has(getPass.transferType)) return false;
    if (!OVERDUE_STATUSES.has(getPass.status)) return false;
    return new Date(getPass.expectedReturnDate) < now;
};

const parsePositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
};

const normalizeStatusList = (value, fallback = []) => {
    const rawValues = Array.isArray(value) ? value : value ? [value] : [];
    const normalized = rawValues
        .flatMap((entry) => String(entry || '').split(','))
        .map((entry) => entry.trim())
        .filter(Boolean);

    return normalized.length > 0 ? normalized : fallback;
};

const assertInternalTransferAllowed = async (tx, sourceTenantId, targetTenantId) => {
    if (!targetTenantId || targetTenantId === sourceTenantId) {
        throw Object.assign(new Error('targetTenantId must be a different hotel in your organization.'), {
            statusCode: 400,
        });
    }
    const [source, target] = await Promise.all([
        tx.tenant.findUnique({
            where: { id: sourceTenantId },
            select: { id: true, parentId: true, isActive: true },
        }),
        tx.tenant.findUnique({
            where: { id: targetTenantId },
            select: { id: true, parentId: true, isActive: true },
        }),
    ]);
    if (!source?.isActive) {
        throw Object.assign(new Error('Source tenant is not active.'), { statusCode: 400 });
    }
    if (!target?.isActive) {
        throw Object.assign(new Error('Target hotel not found or inactive.'), { statusCode: 400 });
    }
    if (organizationRootId(source) !== organizationRootId(target)) {
        throw Object.assign(new Error('Target hotel must belong to the same organization.'), { statusCode: 400 });
    }
};

const { assertLinesHaveStockAtLocation } = require('./location-item-resolution.service');
const { buildGetPassWorkflowContext, isGetPassCreateActorRole } = require('./getPassWorkflowContext.util');

const assertGetPassLinesAtSourceLocations = async (tx, tenantId, lines) => {
    if (!Array.isArray(lines) || lines.length === 0) return;
    for (const line of lines) {
        const qty = Number(line.qty);
        if (!line.itemId || !line.locationId || !Number.isFinite(qty) || qty <= 0) {
            throw Object.assign(new Error('Each line requires item, source location, and quantity.'), {
                statusCode: 400,
            });
        }
        assertIntegerQuantity({
            qty,
            field: 'qty',
            message: 'Quantity must be a whole number (integer). Fractional quantities are not allowed.',
            details: { itemId: line.itemId, locationId: line.locationId, qty },
        });
    }

    // Aggregate duplicate item+location rows so creator/submit matches checkout reality.
    const byKey = new Map();
    for (const line of lines) {
        const key = `${line.itemId}::${line.locationId}`;
        const prev = byKey.get(key);
        const qty = Number(line.qty);
        if (prev) {
            prev.qty += qty;
        } else {
            byKey.set(key, {
                itemId: line.itemId,
                locationId: line.locationId,
                qty,
            });
        }
    }

    await assertLinesHaveStockAtLocation(tx, tenantId, [...byKey.values()], {
        requireAvailableQty: true,
    });
};

const createGetPass = async (tenantId, data, user) => {
    const userId = typeof user === 'object' ? user.id : user;
    const userObj = typeof user === 'object' ? user : { id: userId, role: null, tenantId };
    if (!isGetPassCreateActorRole(userObj.role)) {
        throw Object.assign(
            new Error(
                'Only Department Manager or Storekeeper (or Org/Super governance) may create get passes.',
            ),
            { statusCode: 403, status: 403 },
        );
    }

    const GET_PASS_TYPES = new Set(['TEMPORARY', 'CATERING', 'OUTSIDE_CATERING', 'PERMANENT']);
    const transferType = data?.transferType != null ? String(data.transferType).trim().toUpperCase() : '';
    if (!transferType || !GET_PASS_TYPES.has(transferType)) {
        throw Object.assign(
            new Error(
                `transferType is required and must be one of: ${[...GET_PASS_TYPES].join(', ')}.`,
            ),
            { statusCode: 400, status: 400 },
        );
    }
    const borrowingEntity =
        data?.borrowingEntity != null ? String(data.borrowingEntity).trim() : '';
    if (!borrowingEntity) {
        throw Object.assign(new Error('borrowingEntity is required.'), {
            statusCode: 400,
            status: 400,
        });
    }
    // Normalize for downstream create / date rules
    data = { ...data, transferType, borrowingEntity };

    if (!Array.isArray(data.lines) || data.lines.length === 0) {
        throw Object.assign(new Error('At least one line is required.'), {
            statusCode: 400,
            status: 400,
            code: 'GET_PASS_LINES_REQUIRED',
        });
    }

    await assertActiveAssignmentForMutation(userObj, tenantId, 'create');
    const scope = await resolveScopeContext(userObj, tenantId, { assignmentOnly: true });
    for (const line of data.lines) {
        if (line.locationId) {
            await assertLocationInScope(line.locationId, tenantId, scope, 'create');
        }
    }
    return prisma.$transaction(async (tx) => {
        await assertGetPassLinesAtSourceLocations(tx, tenantId, data.lines);
        const isInternalTransfer = Boolean(data.isInternalTransfer);
        let targetTenantId = null;
        if (isInternalTransfer) {
            if (!data.targetTenantId) {
                throw Object.assign(new Error('targetTenantId is required for internal transfers.'), {
                    statusCode: 400,
                });
            }
            await assertInternalTransferAllowed(tx, tenantId, data.targetTenantId);
            targetTenantId = data.targetTenantId;
        }

        const { returnDate, expectedReturnDate } = resolveTemporaryDatesForCreate(data);

        // Allocate pass number only after empty-lines guard (no wasted GP numbers).
        const passNo = await generateDocNumber(tenantId, DocPrefix.GET_PASS_OUT, new Date(), tx);

        const getPass = await tx.getPass.create({
            data: {
                tenantId,
                passNo,
                transferType: data.transferType,
                isInternalTransfer,
                targetTenantId,
                returnDate,
                departmentId: data.departmentId || null,
                borrowingEntity: data.borrowingEntity,
                expectedReturnDate,
                status: 'DRAFT',
                reason: data.reason,
                notes: data.notes,
                createdBy: userId,
                lines: {
                    create: data.lines.map((line) => ({
                        itemId: line.itemId,
                        locationId: line.locationId,
                        qty: Number(line.qty),
                        conditionOut: line.conditionOut,
                        status: 'PENDING',
                    })),
                },
            },
            include: { lines: true },
        });

        if (isInternalTransfer && targetTenantId) {
            const sourceTenant = await tx.tenant.findUnique({
                where: { id: tenantId },
                select: { name: true },
            });
            await notifyIncomingInternalGetPass(tx, {
                targetTenantId,
                getPassId: getPass.id,
                passNo: getPass.passNo,
                sourceTenantName: sourceTenant?.name || 'Hotel',
            });
        }

        await logAction({ tenantId, entityType: EntityType.GET_PASS, entityId: getPass.id, action: 'CREATE', changedBy: userId, afterValue: { passNo: getPass.passNo, status: getPass.status } });
        return getPass;
    });
};

const getGetPasses = async (tenantId, params = {}, user) => {
    const { status, transferType } = params;
    const page = parsePositiveInt(params.page, 1);
    const limit = parsePositiveInt(params.limit, 50);
    const skip = (page - 1) * limit;

    const listContext = user ? await resolveOrgWideGetPassListContext(tenantId, user.role) : null;

    let where;
    if (listContext?.organizationRootId) {
        where = { tenant: { parentId: listContext.organizationRootId } };
    } else {
        where = { tenantId };
    }
    if (status) {
        where.status = status;
    } else {
        where.status = { in: [...GET_PASS_OUTGOING_OPEN_STATUSES] };
    }
    if (transferType) where.transferType = transferType;

    if (user && !listContext?.organizationRootId) {
        const scope = await resolveScopeContext(user, tenantId);
        const scopeWhere = scopeWhereFor(SCOPE_MODULE.GET_PASS, scope);
        where = { AND: [where, scopeWhere] };
    }

    const include = {
        department: true,
        targetTenant: { select: { id: true, name: true, slug: true } },
        createdByUser: { select: { firstName: true, lastName: true } },
    };
    if (listContext?.organizationRootId) {
        include.tenant = { select: { id: true, name: true, slug: true, email: true } };
    }

    const [rows, total] = await Promise.all([
        prisma.getPass.findMany({
            where,
            include,
            orderBy: { createdAt: 'desc' },
            skip,
            take: Number(limit),
        }),
        prisma.getPass.count({ where }),
    ]);

    const now = new Date();
    const data = rows.map((row) =>
        withUserFacingState(
            'GET_PASS',
            { ...row, isOverdue: isGetPassOverdue(row, now) },
            { notes: row.notes },
        ),
    );

    const scopeMeta =
        user && !listContext?.organizationRootId
            ? metaFor(await resolveScopeContext(user, tenantId), { total })
            : null;
    return { data, total, page: Number(page), limit: Number(limit), ...(scopeMeta || {}) };
};

/**
 * Target hotel — operational queue for internal transfers awaiting receipt action.
 * APPROVED (not yet dispatched from source) is excluded until checkout.
 */
const getIncomingGetPasses = async (targetTenantId, params = {}, user) => {
    const page = parsePositiveInt(params.page, 1);
    const limit = parsePositiveInt(params.limit, 50);
    const skip = (page - 1) * limit;

    const listContext = user ? await resolveOrgWideGetPassListContext(targetTenantId, user.role) : null;

    const incomingStatuses = [...GET_PASS_INCOMING_OPERATIONAL_STATUSES];

    let where;
    if (listContext?.organizationRootId) {
        where = {
            isInternalTransfer: true,
            status: { in: incomingStatuses },
            targetTenant: { parentId: listContext.organizationRootId },
        };
    } else {
        where = {
            targetTenantId,
            isInternalTransfer: true,
            status: { in: incomingStatuses },
        };
    }

    const include = {
        tenant: { select: { id: true, name: true, slug: true, email: true } },
        department: true,
        createdByUser: { select: { firstName: true, lastName: true } },
    };
    if (listContext?.organizationRootId) {
        include.targetTenant = { select: { id: true, name: true, slug: true, email: true } };
    }

    const [rows, total] = await Promise.all([
        prisma.getPass.findMany({
            where,
            include,
            orderBy: { updatedAt: 'desc' },
            skip,
            take: Number(limit),
        }),
        prisma.getPass.count({ where }),
    ]);

    const now = new Date();
    const data = rows.map(({ tenant, ...rest }) =>
        withUserFacingState(
            'GET_PASS',
            {
                ...rest,
                sourceTenant: tenant,
                isOverdue: isGetPassOverdue(rest, now),
            },
            { notes: rest.notes },
        ),
    );

    return { data, total, page: Number(page), limit: Number(limit) };
};

/**
 * Any pass with recorded return activity (standard or internal): partial/full/good/damaged/lost.
 */
const getReturningGetPasses = async (sourceTenantId, params = {}, user) => {
    const page = parsePositiveInt(params.page, 1);
    const limit = parsePositiveInt(params.limit, 50);
    const skip = (page - 1) * limit;

    const listContext = user ? await resolveOrgWideGetPassListContext(sourceTenantId, user.role) : null;

    const where = buildGetPassReturnsListWhere(sourceTenantId, listContext);

    const include = {
        tenant: { select: { id: true, name: true, slug: true, email: true } },
        targetTenant: { select: { id: true, name: true, slug: true, email: true } },
        department: true,
        createdByUser: { select: { firstName: true, lastName: true } },
    };

    const [rows, total] = await Promise.all([
        prisma.getPass.findMany({
            where,
            include,
            orderBy: { updatedAt: 'desc' },
            skip,
            take: Number(limit),
        }),
        prisma.getPass.count({ where }),
    ]);

    const now = new Date();
    const data = rows.map((row) =>
        withUserFacingState(
            'GET_PASS',
            { ...row, isOverdue: isGetPassOverdue(row, now) },
            { notes: row.notes },
        ),
    );

    return { data, total, page: Number(page), limit: Number(limit) };
};

const getDiscrepancyClaims = async (tenantId, user) => {
    const listContext = user ? await resolveOrgWideGetPassListContext(tenantId, user.role) : null;
    const where = {
        qtyDiscrepancyAtDestination: { gt: 0 },
        getPass: listContext?.organizationRootId
            ? {
                  tenant: { parentId: listContext.organizationRootId },
              }
            : {
                  OR: [{ tenantId }, { targetTenantId: tenantId }],
              },
    };

    return prisma.getPassLine.findMany({
        where,
        include: {
            item: { select: { id: true, name: true } },
            getPass: {
                select: {
                    id: true,
                    passNo: true,
                    tenant: { select: { id: true, name: true } },
                    targetTenant: { select: { id: true, name: true } },
                },
            },
        },
        orderBy: [{ getPass: { updatedAt: 'desc' } }, { item: { name: 'asc' } }],
    });
};

const checkAndNotifyOverduePasses = async ({ notifyCostControl = false } = {}) => {
    const now = new Date();
    const overduePasses = await prisma.getPass.findMany({
        where: {
            transferType: { in: Array.from(OVERDUE_TRANSFER_TYPES) },
            status: { in: Array.from(OVERDUE_STATUSES) },
            expectedReturnDate: { not: null, lt: now },
        },
        select: {
            id: true,
            passNo: true,
            tenantId: true,
            transferType: true,
            status: true,
            expectedReturnDate: true,
        },
    });

    if (!notifyCostControl || overduePasses.length === 0) {
        return { overdueCount: overduePasses.length, notifiedCount: 0 };
    }

    let notifiedCount = 0;
    await prisma.$transaction(async (tx) => {
        for (const pass of overduePasses) {
            await notifyTenantRoles(tx, pass.tenantId, ['COST_CONTROL'], {
                type: 'GET_PASS_OVERDUE',
                title: 'Overdue gate pass return',
                body: `Gate pass ${pass.passNo} is overdue (expected return ${new Date(pass.expectedReturnDate).toISOString().slice(0, 10)}).`,
                payload: { getPassId: pass.id, passNo: pass.passNo, expectedReturnDate: pass.expectedReturnDate },
            });
            notifiedCount += 1;
        }
    });

    return { overdueCount: overduePasses.length, notifiedCount };
};

/**
 * Destination hotel confirms physical receipt (internal transfers only; prior status must be OUT).
 */
const confirmDestinationReceipt = async (id, targetTenantId, userId, body) => {
    const receivedCondition = typeof body.receivedCondition === 'string' ? body.receivedCondition.trim() : '';
    const receivedNotes = typeof body.notes === 'string' ? body.notes.trim() : '';
    if (!receivedCondition) {
        throw Object.assign(new Error('receivedCondition is required.'), { statusCode: 400 });
    }

    const existing = await prisma.getPass.findFirst({
        where: {
            id,
            targetTenantId,
            isInternalTransfer: true,
            status: 'OUT',
        },
        include: {
            targetTenant: { select: { id: true, name: true, slug: true } },
            lines: true,
        },
    });

    if (!existing) {
        throw Object.assign(
            new Error(
                'Gate pass not found, not an internal transfer to your hotel, or not ready for receipt (must be OUT).'
            ),
            { statusCode: 400 }
        );
    }

    const linesPayload = Array.isArray(body.lines) ? body.lines : [];
    const lineMap = new Map(existing.lines.map((line) => [line.id, line]));
    const receiptRows = [];
    for (const input of linesPayload) {
        const line = lineMap.get(input?.lineId);
        if (!line) {
            throw Object.assign(new Error('Invalid lineId in receipt payload.'), { statusCode: 400 });
        }
        const shippedQty = Number(line.qty);
        const receivedQty = Number(input.receivedQty ?? shippedQty);
        if (!Number.isFinite(receivedQty) || receivedQty < 0 || receivedQty > shippedQty) {
            throw Object.assign(new Error(`Invalid receivedQty for line ${line.id}.`), { statusCode: 400 });
        }
        assertIntegerQuantity({
            qty: receivedQty,
            field: 'receivedQty',
            message: 'Quantity must be a whole number (integer). Fractional quantities are not allowed.',
            details: { lineId: line.id, receivedQty },
        });
        const discrepancyQty = Math.max(0, shippedQty - receivedQty);
        receiptRows.push({
            lineId: line.id,
            itemId: line.itemId,
            locationId: line.locationId,
            shippedQty,
            receivedQty,
            discrepancyQty,
            checkoutUnitCost: Number(line.unitCost || 0),
            condition: typeof input.condition === 'string' ? input.condition.trim() : '',
            discrepancyReason: typeof input.discrepancyReason === 'string' ? input.discrepancyReason.trim() : '',
        });
    }
    if (receiptRows.length === 0) {
        for (const line of existing.lines) {
            const shippedQty = Number(line.qty);
            receiptRows.push({
                lineId: line.id,
                itemId: line.itemId,
                locationId: line.locationId,
                shippedQty,
                receivedQty: shippedQty,
                discrepancyQty: 0,
                checkoutUnitCost: Number(line.unitCost || 0),
                condition: '',
                discrepancyReason: '',
            });
        }
    }

    const receivedAt = new Date();

    await prisma.$transaction(async (tx) => {
        if (existing.transferType === 'PERMANENT') {
            for (const row of receiptRows) {
                if (row.discrepancyQty > 0) {
                    await postingEngine.postPermanentDiscrepancyWriteOff(tx, {
                        tenantId: targetTenantId,
                        itemId: row.itemId,
                        locationId: row.locationId,
                        discrepancyQty: row.discrepancyQty,
                        sourceWac: row.checkoutUnitCost,
                        getPassId: id,
                        getPassLineId: row.lineId,
                        passNo: existing.passNo,
                        userId,
                        notes: row.discrepancyReason,
                    });
                }
            }
        }

        await tx.getPass.update({
            where: { id },
            data: {
                status: 'RECEIVED_AT_DESTINATION',
                receivedById: userId,
                receivedAt,
                receivedCondition,
                receivedNotes: receivedNotes || null,
                destinationSecurityApprovedBy: userId,
                destinationSecurityApprovedAt: receivedAt,
            },
        });
        for (const row of receiptRows) {
            await tx.getPassLine.update({
                where: { id: row.lineId },
                data: {
                    qtyReceivedAtDestination: row.receivedQty,
                    qtyDiscrepancyAtDestination: row.discrepancyQty,
                    receivedCondition: row.condition || null,
                    discrepancyReason: row.discrepancyReason || null,
                },
            });
        }

        if (existing.transferType === 'PERMANENT') {
            await notifySourceTenantAdminsOfPermanentReceipt(tx, existing.tenantId, {
                getPassId: id,
                passNo: existing.passNo,
                targetTenantName: existing.targetTenant?.name,
            });
        }

        await logAction({
            tenantId: existing.tenantId,
            entityType: EntityType.GET_PASS,
            entityId: id,
            action: 'UPDATE',
            changedBy: userId,
            note: 'GET_PASS_CONFIRM_RECEIPT_DESTINATION',
        });
    });

    return getGetPassById(id, targetTenantId);
};

/**
 * Destination hotel: department manager (or org manager) records final acceptance after gate receipt.
 */
const acceptDestinationDepartment = async (id, viewerTenantId, user, payload = {}) => {
    const getPass = await findReadablePass(prisma, id, viewerTenantId);
    if (!getPass) {
        throw Object.assign(new Error('Get Pass not found'), { statusCode: 404 });
    }
    if (!getPass.isInternalTransfer || getPass.targetTenantId !== viewerTenantId) {
        throw Object.assign(new Error('Only the destination property can accept into department.'), {
            statusCode: 403,
        });
    }
    if (getPass.destinationDeptAcceptedAt) {
        throw Object.assign(new Error('Already accepted into department.'), { statusCode: 400 });
    }
    if (!getPass.receivedAt || getPass.status === 'OUT' || getPass.status === 'APPROVED') {
        throw Object.assign(new Error('Gate receipt must be confirmed before department acceptance.'), {
            statusCode: 400,
        });
    }
    if (!['RECEIVED_AT_DESTINATION', 'PARTIALLY_RETURNED', 'RETURNED'].includes(getPass.status)) {
        throw Object.assign(new Error('Invalid status for department acceptance.'), { statusCode: 400 });
    }
    const targetDepartmentId =
        typeof payload.targetDepartmentId === 'string' ? payload.targetDepartmentId.trim() : '';
    const targetLocationId =
        typeof payload.targetLocationId === 'string' ? payload.targetLocationId.trim() : '';
    if (!targetDepartmentId || !targetLocationId) {
        throw Object.assign(new Error('targetDepartmentId and targetLocationId are required.'), {
            statusCode: 400,
        });
    }

    assertGetPassOperationalPermission(user, 'RECEIVED_AT_DESTINATION', {
        isInternalTransfer: true,
    });

    await prisma.$transaction(async (tx) => {
        const targetDepartment = await tx.department.findFirst({
            where: { id: targetDepartmentId, tenantId: viewerTenantId, isActive: true },
            select: { id: true },
        });
        if (!targetDepartment) {
            throw Object.assign(new Error('Invalid targetDepartmentId for destination tenant.'), {
                statusCode: 400,
            });
        }
        const targetLocation = await tx.location.findFirst({
            where: {
                id: targetLocationId,
                tenantId: viewerTenantId,
                isActive: true,
                departmentId: targetDepartmentId,
            },
            select: { id: true },
        });
        if (!targetLocation) {
            throw Object.assign(
                new Error('Invalid targetLocationId. It must belong to the selected department.'),
                { statusCode: 400 },
            );
        }

        const now = new Date();
        // Archive as CLOSED when the internal transfer lifecycle is finished at destination.
        // PERMANENT: no returns — safe to close here for reporting "completed" passes.
        // TEMPORARY: returns are processed at the issuing hotel while status stays OUT / PARTIALLY_RETURNED;
        // closing here would block processReturns, so we only record destinationDeptAccepted* until source closes.
        const closeAsArchived =
            getPass.transferType === 'PERMANENT' ||
            (isBlockingTransferType(getPass.transferType) && getPass.status === 'RETURNED');

        if (getPass.transferType === 'PERMANENT') {
            for (const line of getPass.lines ?? []) {
                const receivedQty = Number(line.qtyReceivedAtDestination ?? line.qty ?? 0);
                if (!Number.isFinite(receivedQty) || receivedQty <= 0) continue;
                const destinationItemId = await resolveDestinationItemForPermanentTransfer(tx, {
                    line,
                    sourceTenantId: getPass.tenantId,
                    targetTenantId: viewerTenantId,
                    targetDepartmentId,
                    targetLocationId,
                });
                // Permanent checkout fixes the shipped unit cost on the line.
                // Do not re-read a later source WAC when destination custody is accepted.
                const sourceWac = Number(line.unitCost || 0);
                await postingEngine.postPermanentDestinationReceiveLine(tx, {
                    tenantId: viewerTenantId,
                    destinationItemId,
                    locationId: targetLocationId,
                    receivedQty,
                    sourceWac,
                    getPassId: id,
                    getPassLineId: line.id,
                    passNo: getPass.passNo,
                    userId: user.id,
                });
            }
        } else if (isReversibleTransferType(getPass.transferType)) {
            for (const line of getPass.lines ?? []) {
                const receivedQty = Number(line.qtyReceivedAtDestination ?? line.qty ?? 0);
                if (!Number.isFinite(receivedQty) || receivedQty <= 0) continue;

                await createTrackingLedgerEntry(tx, {
                    tenantId: viewerTenantId,
                    itemId: line.itemId,
                    locationId: targetLocationId,
                    movementType: 'TEMP_RECEIVE',
                    qtyIn: receivedQty,
                    qtyOut: 0,
                    referenceId: id,
                    getPassLineId: line.id,
                    referenceNo: getPass.passNo,
                    createdBy: user.id,
                    notes: 'Temporary custody received at destination; stock and valuation unchanged.',
                });
            }
        }

        await tx.getPass.update({
            where: { id },
            data: {
                destinationDeptAcceptedAt: now,
                destinationDeptAcceptedBy: user.id,
                destinationDepartmentId: targetDepartmentId,
                destinationLocationId: targetLocationId,
                ...(closeAsArchived
                    ? {
                          status: 'CLOSED',
                          closedBy: user.id,
                          closedAt: now,
                      }
                    : {}),
            },
        });
    });

    await logAction({
        tenantId: viewerTenantId,
        entityType: EntityType.GET_PASS,
        entityId: id,
        action: 'UPDATE',
        changedBy: user.id,
        note: 'GET_PASS_ACCEPT_DESTINATION_DEPARTMENT',
    });

    return getGetPassById(id, viewerTenantId);
};

/**
 * Destination hotel dispatches temporary/catering internal transfer back to source.
 * This starts reverse logistics and notifies source security.
 */
const shipBackGetPass = async (id, viewerTenantId, user) => {
    const getPass = await findReadablePass(prisma, id, viewerTenantId);
    if (!getPass) {
        throw Object.assign(new Error('Get Pass not found'), { statusCode: 404 });
    }
    if (!getPass.isInternalTransfer || getPass.targetTenantId !== viewerTenantId) {
        throw Object.assign(new Error('Only destination hotel can ship this pass back.'), { statusCode: 403 });
    }
    if (!isReversibleTransferType(getPass.transferType)) {
        throw Object.assign(new Error('Ship back is only available for temporary or catering transfers.'), {
            statusCode: 400,
        });
    }
    if (getPass.status !== 'RECEIVED_AT_DESTINATION') {
        throw Object.assign(new Error('Pass must be received at destination before ship back.'), { statusCode: 400 });
    }
    if (!getPass.destinationDeptAcceptedAt) {
        throw Object.assign(new Error('Destination department acceptance is required before ship back.'), {
            statusCode: 400,
        });
    }

    assertGetPassOperationalPermission(user, 'RECEIVED_AT_DESTINATION', {
        isInternalTransfer: true,
    });

    await prisma.$transaction(async (tx) => {
        await tx.getPass.update({
            where: { id },
            data: {
                status: 'RETURNING',
                destinationSecurityExitAt: null,
                destinationSecurityExitBy: null,
            },
        });

        await notifyTenantRoles(tx, getPass.tenantId, ['SECURITY'], {
            type: 'GET_PASS_RETURNING',
            title: 'Incoming return from destination hotel',
            body: `Get pass ${getPass.passNo} was shipped back and is returning to source security.`,
            payload: {
                getPassId: getPass.id,
                passNo: getPass.passNo,
                sourceTenantId: getPass.tenantId,
                targetTenantId: getPass.targetTenantId,
            },
        });
    });

    await logAction({
        tenantId: viewerTenantId,
        entityType: EntityType.GET_PASS,
        entityId: id,
        action: 'UPDATE',
        changedBy: user.id,
        note: 'GET_PASS_SHIP_BACK',
    });

    return getGetPassById(id, viewerTenantId);
};

/**
 * Destination hotel security confirms return shipment physically exited the gate.
 * Status remains RETURNING; source hotel can only confirm arrival after this stamp.
 */
const confirmReturnExit = async (id, destinationTenantId, user) => {
    const getPass = await findReadablePass(prisma, id, destinationTenantId);
    if (!getPass) {
        throw Object.assign(new Error('Get Pass not found'), { statusCode: 404 });
    }
    if (!getPass.isInternalTransfer || getPass.targetTenantId !== destinationTenantId) {
        throw Object.assign(new Error('Only destination hotel can confirm return exit.'), {
            statusCode: 403,
        });
    }
    if (!isReversibleTransferType(getPass.transferType)) {
        throw Object.assign(new Error('Return exit confirmation is only valid for temporary/catering transfers.'), {
            statusCode: 400,
        });
    }
    if (getPass.status !== 'RETURNING') {
        throw Object.assign(new Error('Pass is not currently returning.'), { statusCode: 400 });
    }
    if (getPass.destinationSecurityExitAt) {
        throw Object.assign(new Error('Return exit already confirmed by destination security.'), { statusCode: 400 });
    }

    assertGetPassOperationalPermission(user, 'RETURNING', { isInternalTransfer: true });

    const now = new Date();
    await prisma.$transaction(async (tx) => {
        await tx.getPass.update({
            where: { id },
            data: {
                destinationSecurityExitAt: now,
                destinationSecurityExitBy: user.id,
            },
        });

        for (const line of getPass.lines ?? []) {
            const releasedQty = Number(line.qtyReceivedAtDestination ?? line.qty ?? 0);
            if (!Number.isFinite(releasedQty) || releasedQty <= 0) continue;

            const releaseLocationId = getPass.destinationLocationId || line.locationId;
            await createTrackingLedgerEntry(tx, {
                tenantId: destinationTenantId,
                itemId: line.itemId,
                locationId: releaseLocationId,
                movementType: 'TEMP_RELEASE',
                qtyIn: 0,
                qtyOut: releasedQty,
                referenceId: id,
                getPassLineId: line.id,
                referenceNo: getPass.passNo,
                createdBy: user.id,
                notes: 'Temporary custody released back to source; stock and valuation unchanged.',
            });
        }
    });

    await logAction({
        tenantId: destinationTenantId,
        entityType: EntityType.GET_PASS,
        entityId: id,
        action: 'UPDATE',
        changedBy: user.id,
        note: 'GET_PASS_CONFIRM_RETURN_EXIT',
    });

    return getGetPassById(id, destinationTenantId);
};

/**
 * Source hotel security confirms returned shipment arrival (gate inspection).
 * Updates pass/lines only — no stock or inventory ledger here (posting happens at department acceptance).
 */
const assertIntegerInterhotelReturnQuantities = (lines) => {
    for (const [index, row] of (lines ?? []).entries()) {
        const lineId = row?.lineId || row?.id || null;
        for (const field of ['goodQty', 'damagedQty', 'lostQty']) {
            assertIntegerQuantity({
                qty: row?.[field] ?? 0,
                field,
                message:
                    'Inter-hotel return quantities must be whole numbers (integers). ' +
                    'Fractional quantities are not allowed.',
                details: { lineId, lineIndex: index, field, qty: row?.[field] ?? 0 },
            });
        }
    }
};

const confirmReturnArrival = async (id, sourceTenantId, user, payload = {}) => {
    const getPass = await findIssuerPass(prisma, id, sourceTenantId);
    if (!getPass) {
        throw Object.assign(new Error('Get Pass not found'), { statusCode: 404 });
    }
    if (!getPass.isInternalTransfer) {
        throw Object.assign(new Error('Return arrival confirmation is only valid for internal transfers.'), {
            statusCode: 400,
        });
    }
    if (!isReversibleTransferType(getPass.transferType)) {
        throw Object.assign(new Error('Return arrival confirmation is only valid for temporary/catering transfers.'), {
            statusCode: 400,
        });
    }
    if (getPass.status !== 'RETURNING') {
        throw Object.assign(new Error('Pass is not currently returning.'), { statusCode: 400 });
    }
    if (!getPass.destinationSecurityExitAt) {
        throw Object.assign(
            new Error('Destination security exit confirmation is required before source arrival confirmation.'),
            { statusCode: 400 },
        );
    }

    assertGetPassOperationalPermission(user, 'RETURNING', { isInternalTransfer: true });

    const linesPayload = Array.isArray(payload.lines) ? payload.lines : [];
    if (linesPayload.length === 0) {
        throw Object.assign(new Error('lines are required to confirm return arrival.'), { statusCode: 400 });
    }
    assertIntegerInterhotelReturnQuantities(linesPayload);
    const expectedLineIds = new Set((getPass.lines ?? []).map((line) => line.id));
    const linePayloadMap = new Map();
    for (const row of linesPayload) {
        const rowLineId = row?.lineId || row?.id;
        if (!rowLineId) {
            throw Object.assign(new Error('Each inspection row must include lineId (or id).'), { statusCode: 400 });
        }
        if (!expectedLineIds.has(rowLineId)) {
            throw Object.assign(new Error(`Inspection contains unknown line ${rowLineId}.`), { statusCode: 400 });
        }
        linePayloadMap.set(rowLineId, row);
    }
    if (linePayloadMap.size !== expectedLineIds.size) {
        throw Object.assign(new Error('Inspection must include every line item.'), { statusCode: 400 });
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
        const dispositionBatch = createGetPassReturnDispositionBatch();
        let hasReceivedQty = false;
        for (const line of getPass.lines ?? []) {
            const totalQty = Number(line.qty || 0);
            const alreadyReturned = Number(line.qtyReturned || 0);
            const outstanding = Math.max(0, totalQty - alreadyReturned);
            const linePayload = linePayloadMap.get(line.id);
            if (!linePayload) {
                throw Object.assign(new Error(`Missing inspection row for line ${line.id}.`), { statusCode: 400 });
            }
            const goodQty = Math.max(0, Number(linePayload.goodQty ?? 0));
            const damagedQty = Math.max(0, Number(linePayload.damagedQty ?? 0));
            const lostQty = Math.max(0, Number(linePayload.lostQty ?? 0));
            if (!Number.isFinite(goodQty) || !Number.isFinite(damagedQty) || !Number.isFinite(lostQty)) {
                throw Object.assign(new Error('goodQty, damagedQty, and lostQty must be valid numbers for each line.'), {
                    statusCode: 400,
                });
            }
            const receivedQty = goodQty + damagedQty + lostQty;
            if (receivedQty > outstanding + 1e-9) {
                throw Object.assign(new Error(`Total returned quantity exceeds outstanding quantity for line ${line.id}.`), {
                    statusCode: 400,
                });
            }
            if (receivedQty > 0) hasReceivedQty = true;
            const damagePhotos = Array.isArray(linePayload.damagePhotos)
                ? linePayload.damagePhotos.filter((photo) => typeof photo === 'string' && photo.trim() !== '')
                : [];
            // Temporarily disabled: API no longer requires damage photos when damagedQty > 0.
            // if (damagedQty > 0 && damagePhotos.length === 0) {
            //     throw Object.assign(new Error(`Damage photos are required for damaged quantity on line ${line.id}.`), {
            //         statusCode: 400,
            //     });
            // }

            await tx.getPassLine.update({
                where: { id: line.id },
                data: {
                    qtyReturned: alreadyReturned + receivedQty,
                    returnedGoodQty: Number(line.returnedGoodQty || 0) + goodQty,
                    returnedDamagedQty: Number(line.returnedDamagedQty || 0) + damagedQty,
                    returnedLostQty: Number(line.returnedLostQty || 0) + lostQty,
                    damagePhotos,
                    status: alreadyReturned + receivedQty >= totalQty - 1e-9 ? 'RETURNED' : 'PARTIALLY_RETURNED',
                },
            });

            if (damagedQty > 0 || lostQty > 0) {
                const gateAccountability =
                    linePayload.accountability ||
                    linePayload.damagedAccountability ||
                    linePayload.lostAccountability ||
                    null;
                queueGetPassReturnDispositionLine(dispositionBatch, {
                    line,
                    damagedQty,
                    lostQty,
                    accountability: gateAccountability,
                    managerNotes: null,
                });
            }
        }
        await flushGetPassReturnDispositionBatchInTx(tx, dispositionBatch, {
            tenantId: sourceTenantId,
            getPassId: id,
            passNo: getPass.passNo,
            userId: user.id,
            now,
            firstStepComment: 'Registered at source gate return inspection',
        });
        if (!hasReceivedQty) {
            throw Object.assign(new Error('At least one line must have a positive returned quantity.'), { statusCode: 400 });
        }

        await tx.getPass.update({
            where: { id },
            data: {
                status: 'RETURN_RECEIVED_AT_GATE',
                receivedById: user.id,
                receivedAt: now,
                closedBy: null,
                closedAt: null,
            },
        });
    });

    await logAction({
        tenantId: sourceTenantId,
        entityType: EntityType.GET_PASS,
        entityId: id,
        action: 'UPDATE',
        changedBy: user.id,
        note: 'GET_PASS_CONFIRM_RETURN_ARRIVAL',
    });

    return getGetPassById(id, sourceTenantId);
};

/**
 * Source hotel department accepts inspected return.
 * Sole posting point for reverse logistics: release blocked qty and record the return ledger
 * without changing on-hand for reversible transfers.
 */
const acceptReturnIntoDepartment = async (id, sourceTenantId, user, payload = {}) => {
    const getPass = await findIssuerPass(prisma, id, sourceTenantId);
    if (!getPass) {
        throw Object.assign(new Error('Get Pass not found'), { statusCode: 404 });
    }
    if (!getPass.isInternalTransfer) {
        throw Object.assign(new Error('Return department acceptance is only valid for internal transfers.'), {
            statusCode: 400,
        });
    }
    if (!isReversibleTransferType(getPass.transferType)) {
        throw Object.assign(new Error('Return department acceptance is only valid for temporary/catering transfers.'), {
            statusCode: 400,
        });
    }
    if (getPass.status !== 'RETURN_RECEIVED_AT_GATE') {
        throw Object.assign(new Error('Pass must be received at source gate before department acceptance.'), {
            statusCode: 400,
        });
    }
    assertGetPassOperationalPermission(user, 'RETURN_RECEIVED_AT_GATE', { isInternalTransfer: true });

    const payloadLines = Array.isArray(payload.lines) ? payload.lines : [];
    const managerNotes = typeof payload.managerNotes === 'string' ? payload.managerNotes.trim() : '';
    assertIntegerInterhotelReturnQuantities(payloadLines);
    const payloadByLineId = new Map(payloadLines.map((row) => [row?.lineId, row]));
    const validAccountability = new Set(['EMPLOYEE_DEDUCTION', 'COMPANY_LOSS']);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
        const dispositionBatch = createGetPassReturnDispositionBatch();
        for (const line of getPass.lines ?? []) {
            const linePayload = payloadByLineId.get(line.id);
            if (!linePayload) continue;
            const goodQty = Math.max(0, Number(linePayload.goodQty ?? 0));
            const damagedQty = Math.max(0, Number(linePayload.damagedQty ?? 0));
            const lostQty = Math.max(0, Number(linePayload.lostQty ?? 0));
            if (!Number.isFinite(goodQty) || !Number.isFinite(damagedQty) || !Number.isFinite(lostQty)) {
                throw Object.assign(new Error('goodQty, damagedQty, and lostQty must be valid numbers.'), {
                    statusCode: 400,
                });
            }
            const totalAccepted = goodQty + damagedQty + lostQty;
            if (totalAccepted <= 0) continue;

            const accountability = linePayload.accountability || linePayload.damagedAccountability || linePayload.lostAccountability || null;
            if ((damagedQty > 0 || lostQty > 0) && !validAccountability.has(accountability)) {
                throw Object.assign(new Error(`Accountability is required for damaged/lost quantities on line ${line.id}.`), {
                    statusCode: 400,
                });
            }

            const qtyReceivedAtGate = Number(line.qtyReturned || 0);
            if (totalAccepted > qtyReceivedAtGate + 1e-9) {
                throw Object.assign(new Error(`Accepted quantity exceeds inspected gate quantity for line ${line.id}.`), {
                    statusCode: 400,
                });
            }
            const wac = Number(line.unitCost || 0);

            const stock = await tx.stockBalance.findUnique({
                where: {
                    tenantId_itemId_locationId: {
                        tenantId: sourceTenantId,
                        itemId: line.itemId,
                        locationId: line.locationId,
                    },
                },
            });
            const blocked = stock ? Number(stock.qtyBlocked || 0) : 0;
            if (blocked + 1e-9 < totalAccepted) {
                throw Object.assign(
                    new Error(`Blocked quantity is less than accepted return quantity for line ${line.id}.`),
                    { statusCode: 400 },
                );
            }
            const releaseFromBlocked = goodQty;
            // Good: release blocked → available. Damaged/Lost stay blocked until BRK/LST GM post.
            const stockKey = {
                tenantId_itemId_locationId: {
                    tenantId: sourceTenantId,
                    itemId: line.itemId,
                    locationId: line.locationId,
                },
            };
            if (releaseFromBlocked > 0) {
                if (!stock) {
                    throw Object.assign(new Error(`Stock balance not found for line ${line.id}.`), { statusCode: 400 });
                }
                await postingEngine.releaseBlockedOnReturn(tx, {
                    stockKey,
                    releaseQty: releaseFromBlocked,
                    nonGoodQty: 0,
                });
            }

            if (goodQty > 0) {
                await postingEngine.postReturnGoodLedger(tx, {
                    tenantId: sourceTenantId,
                    itemId: line.itemId,
                    locationId: line.locationId,
                    goodQty,
                    wac,
                    referenceId: line.id,
                    referenceNo: getPass.passNo,
                    userId: user.id,
                    notes: 'Manager accepted good quantity from return inspection (RETURN to available).',
                    affectsValuation: false,
                });
            }

            if (damagedQty > 0 || lostQty > 0) {
                try {
                    queueGetPassReturnDispositionLine(dispositionBatch, {
                        line,
                        damagedQty,
                        lostQty,
                        accountability,
                        managerNotes,
                    });
                    if (damagedQty > 0) {
                        await tx.getPassReturn.create({
                            data: {
                                getPassLineId: line.id,
                                qtyReturned: damagedQty,
                                qtyGood: 0,
                                qtyLost: 0,
                                qtyDamaged: damagedQty,
                                isLost: false,
                                isDamaged: true,
                                notes: `ACCOUNTABILITY:${accountability}${managerNotes ? ` | MANAGER_NOTES:${managerNotes}` : ''}`,
                                registeredBy: user.id,
                            },
                        });
                    }
                    if (lostQty > 0) {
                        await tx.getPassReturn.create({
                            data: {
                                getPassLineId: line.id,
                                qtyReturned: lostQty,
                                qtyGood: 0,
                                qtyLost: lostQty,
                                qtyDamaged: 0,
                                isLost: true,
                                isDamaged: false,
                                notes: `ACCOUNTABILITY:${accountability}${managerNotes ? ` | MANAGER_NOTES:${managerNotes}` : ''}`,
                                registeredBy: user.id,
                            },
                        });
                    }
                } catch (error) {
                    console.error('[getPass.service] acceptReturnIntoDepartment disposition posting failed', {
                        getPassId: id,
                        lineId: line.id,
                        itemId: line.itemId,
                        sourceTenantId,
                        errorMessage: error?.message,
                        errorCode: error?.code,
                        errorMeta: error?.meta,
                        error,
                    });
                    throw error;
                }
            }
        }

        // STATE_MATRIX: Dept accept return Creates (skip if exists) — gate may already
        // have flushed BREAKAGE/LOST for this getPassId; do not create a second pair.
        await stripExistingGetPassReturnDispositionsFromBatch(tx, dispositionBatch, {
            tenantId: sourceTenantId,
            getPassId: id,
        });

        await flushGetPassReturnDispositionBatchInTx(tx, dispositionBatch, {
            tenantId: sourceTenantId,
            getPassId: id,
            passNo: getPass.passNo,
            userId: user.id,
            now,
            firstStepComment: 'Department manager approved via get pass return acceptance',
        });

        await tx.getPass.update({
            where: { id },
            data: {
                status: 'RETURNED',
                closedBy: user.id,
                closedAt: now,
                // P2 #28 — keep creator GetPass.notes intact; manager notes live on return/audit only.
                notes: getPass.notes,
            },
        });
    });

    await logAction({
        tenantId: sourceTenantId,
        entityType: EntityType.GET_PASS,
        entityId: id,
        action: 'UPDATE',
        changedBy: user.id,
        note: managerNotes
            ? `GET_PASS_ACCEPT_RETURN_DEPARTMENT | MANAGER_ACCEPTANCE_NOTES: ${managerNotes}`
            : 'GET_PASS_ACCEPT_RETURN_DEPARTMENT',
    });

    return getGetPassById(id, sourceTenantId);
};

/**
 * Issuer or internal target hotel — read-only API / PDF.
 */
const getGetPassById = async (id, tenantId, user = null) => {
    let getPass = await findReadablePass(prisma, id, tenantId);
    if (!getPass) throw passNotFoundErr();
    if (user) {
        const scope = await resolveScopeContext(user, tenantId);
        await assertInScope(SCOPE_MODULE.GET_PASS, getPass, scope, 'read');
    }

    // Legacy park: Send Back used to land on PENDING_DEPT. Creator desk is Returned/DRAFT only.
    getPass = await healGetPassSendBackParkedAtDept(getPass);

    const reverseAuditTrail = await getGetPassReverseAuditTrail(getPass);
    const checkoutStockGate = await buildGetPassCheckoutStockGate(getPass);

    let chain = null;
    try {
        if (getPass.accWorkflowVersionId) {
            chain = await resolveWorkflowByVersionId(getPass.accWorkflowVersionId);
        } else {
            chain = await resolveWorkflowForDocument({ moduleKey: 'GET_PASS', tenantId: getPass.tenantId });
        }
    } catch {
        chain = null;
    }
    const workflow = buildGetPassWorkflowContext(getPass, chain);
    const sendBackTargets = chain ? buildGetPassSendBackTargets(getPass, chain) : [];

    return withUserFacingState(
        'GET_PASS',
        { ...getPass, reverseAuditTrail, workflow, checkoutStockGate, sendBackTargets },
        { notes: getPass.notes },
    );
};

/** Preflight for Security exit — blockers mean Approve must not run; Send Back to creator instead. */
const buildGetPassCheckoutStockGate = async (getPass) => {
    if (String(getPass?.status || '').toUpperCase() !== 'PENDING_SECURITY') return null;
    const lines = getPass.lines || [];
    if (!lines.length) return { ok: true, blockers: [] };

    const neededByKey = new Map();
    for (const line of lines) {
        const key = `${line.itemId}::${line.locationId}`;
        neededByKey.set(key, (neededByKey.get(key) || 0) + Number(line.qty));
    }

    const blockers = [];
    const tenantId = getPass.tenantId;
    for (const [key, requested] of neededByKey.entries()) {
        const [itemId, locationId] = key.split('::');
        const stock = await prisma.stockBalance.findUnique({
            where: { tenantId_itemId_locationId: { tenantId, itemId, locationId } },
            include: { item: { select: { name: true } } },
        });
        const available = stock ? Number(stock.qtyOnHand) - Number(stock.qtyBlocked || 0) : 0;
        if (!stock || available < requested - 1e-9) {
            blockers.push({
                itemName: stock?.item?.name || itemId,
                available,
                requested,
            });
        }
    }
    return { ok: blockers.length === 0, blockers };
};

/** Strip [Send Back] note lines after creator resubmit so Returned detection stays accurate. */
const stripGetPassSendBackNotes = (notes) => {
    const cleaned = String(notes || '')
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith(SEND_BACK_NOTES_MARKER))
        .join('\n')
        .trim();
    return cleaned || null;
};

/**
 * Heal documents previously sent back onto PENDING_DEPT — move to DRAFT (Returned) for creator edit.
 */
const healGetPassSendBackParkedAtDept = async (getPass) => {
    if (!getPass?.id) return getPass;
    const status = String(getPass.status || '').toUpperCase();
    if (status !== 'PENDING_DEPT') return getPass;
    if (!String(getPass.notes || '').includes(SEND_BACK_NOTES_MARKER)) return getPass;

    await prisma.$transaction(async (tx) => {
        const updated = await tx.getPass.update({
            where: { id: getPass.id },
            data: { status: 'DRAFT' },
        });
        const ar = await tx.approvalRequest.findFirst({
            where: { getPassId: getPass.id },
            select: { id: true },
        });
        if (ar?.id) {
            await tx.approvalRequest.update({
                where: { id: ar.id },
                data: { currentStep: 0, status: 'PENDING' },
            });
        }
        return updated;
    });

    const fresh = await prisma.getPass.findFirst({ where: { id: getPass.id } });
    return fresh ? { ...getPass, ...fresh, status: 'DRAFT' } : { ...getPass, status: 'DRAFT' };
};

const assertGetPassSentBackCreator = (getPass, userId) => {
    if (getPass.createdBy !== userId) {
        throw Object.assign(new Error('Only the document creator may edit or resubmit after Send Back.'), {
            status: 403,
        });
    }
};

const isGetPassSentBackDraft = (getPass) =>
    String(getPass?.status || '').toUpperCase() === 'DRAFT' &&
    String(getPass?.notes || '').includes(SEND_BACK_NOTES_MARKER);

const updateGetPass = async (id, tenantId, data, user, expectedVersion = null) => {
    const userId = user.id;
    const existing = await getIssuerGetPassById(id, tenantId);
    if (isGetPassSentBackDraft(existing)) {
        assertGetPassSentBackCreator(existing, userId);
    } else if (existing.status === 'DRAFT') {
        const { assertDraftEditable } = require('../platform/draftGovernance.service');
        await assertDraftEditable({ doc: existing, family: 'getPass', user });
    }
    const { assertPostingPeriodFieldsImmutable } = require('../platform/postingPeriod.util');
    assertPostingPeriodFieldsImmutable(existing, data);
    const { assertDocumentEditableByLifecycle } = require('../platform/lifecyclePresentation.service');
    assertDocumentEditableByLifecycle('GET_PASS', existing.status, { notes: existing.notes });
    assertConcurrencyVersion(expectedVersion ?? data.concurrencyVersion, existing.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.GET_PASS, entityId: id, changedBy: userId },
    });

    await prisma.$transaction(async (tx) => {
        const isInternalTransfer =
            data.isInternalTransfer !== undefined ? Boolean(data.isInternalTransfer) : existing.isInternalTransfer;
        let targetTenantId = existing.targetTenantId;
        if (isInternalTransfer) {
            const tid = data.targetTenantId !== undefined ? data.targetTenantId : existing.targetTenantId;
            if (!tid) {
                throw Object.assign(new Error('targetTenantId is required for internal transfers.'), {
                    statusCode: 400,
                });
            }
            await assertInternalTransferAllowed(tx, tenantId, tid);
            targetTenantId = tid;
        } else {
            targetTenantId = null;
        }

        const { returnDate, expectedReturnDate } = resolveTemporaryDatesForUpdate(data, existing);

        // Update header
        await tx.getPass.update({
            where: { id },
            data: bumpConcurrencyUpdate({
                transferType: data.transferType,
                isInternalTransfer,
                targetTenantId,
                returnDate,
                departmentId: data.departmentId || null,
                borrowingEntity: data.borrowingEntity,
                expectedReturnDate,
                reason: data.reason,
                notes: data.notes,
            }),
        });

        // Hard replace lines for simplicity if provided
        if (data.lines) {
            await assertGetPassLinesAtSourceLocations(tx, tenantId, data.lines);
            await tx.getPassLine.deleteMany({ where: { getPassId: id } });
            await tx.getPassLine.createMany({
                data: data.lines.map(line => ({
                    getPassId: id,
                    itemId: line.itemId,
                    locationId: line.locationId,
                    qty: Number(line.qty),
                    conditionOut: line.conditionOut,
                    status: 'PENDING'
                }))
            });
        }

        await logAction({ tenantId, entityType: EntityType.GET_PASS, entityId: id, action: 'UPDATE', changedBy: userId });
    });

    return getGetPassById(id, tenantId);
};

const deleteGetPass = async (id, tenantId, userId, expectedVersion = null) => {
    const existing = await prisma.getPass.findFirst({ where: { id, tenantId } });
    if (!existing) throw passNotFoundErr();
    if (existing.status !== 'DRAFT') {
        throw new Error('Can only delete DRAFT Get Passes');
    }
    if (isGetPassSentBackDraft(existing)) {
        throw Object.assign(
            new Error('Returned get passes cannot be deleted. Reject them instead.'),
            { status: 422, statusCode: 422 },
        );
    }
    assertConcurrencyVersion(expectedVersion, existing.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.GET_PASS, entityId: id, changedBy: userId },
    });

    await prisma.getPass.delete({ where: { id } });
    await logAction({ tenantId, entityType: EntityType.GET_PASS, entityId: id, action: 'DELETE', changedBy: userId });
    return true;
};

const submitGetPass = async (id, tenantId, user, expectedVersion = null) => {
    const userId = user.id;
    await assertActiveAssignmentForMutation(user, tenantId, 'submit');
    const getPass = await prisma.getPass.findFirst({
        where: { id, tenantId },
        include: {
            lines: true,
            approvalRequest: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: { requiredRole: { select: { code: true } } },
                    },
                },
            },
        },
    });
    if (!getPass) throw passNotFoundErr();
    const scope = await resolveScopeContext(user, tenantId, { assignmentOnly: true });
    await assertInScope(SCOPE_MODULE.GET_PASS, getPass, scope, 'submit');
    if (getPass.status !== 'DRAFT') throw new Error('Only DRAFT can be submitted');
    const isResubmit = isGetPassSentBackDraft(getPass);
    if (isResubmit) {
        assertGetPassSentBackCreator(getPass, userId);
    }
    assertConcurrencyVersion(expectedVersion, getPass.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.GET_PASS, entityId: id, changedBy: user.id },
    });

    const chain = getPass.accWorkflowVersionId
        ? await resolveWorkflowByVersionId(getPass.accWorkflowVersionId)
        : await resolveWorkflowForDocument({ moduleKey: 'GET_PASS', tenantId });
    const { buildGetPassWorkflowMaps } = require('./acc-workflow-get-pass.runtime');
    const maps = buildGetPassWorkflowMaps(chain.steps);
    const workflow = getSubmitInitialWorkflowFromContext(
        { ...maps, steps: chain.steps },
        user.role,
        userId,
    );

    const reusedApprovalRequest = getPass.approvalRequest && Number(getPass.approvalRequest.currentStep) === 0;
    await prisma.$transaction(async (tx) => {
        await assertGetPassLinesAtSourceLocations(tx, tenantId, getPass.lines);
        if (reusedApprovalRequest) {
            await executeCreatorResubmitInTx(tx, {
                approvalRequest: getPass.approvalRequest,
                userId,
                tenantId,
                entityType: EntityType.GET_PASS,
                entityId: id,
                documentStatusBefore: getPass.status,
                documentStatusAfter: workflow.status,
                resubmitNotePrefix: 'GET_PASS_RESUBMIT',
            });
            // Dept Manager submit auto-stamps step 1 — keep ApprovalRequest on the same live step.
            const livePendingIdx = maps.pendingStatuses.indexOf(String(workflow.status || '').toUpperCase());
            const liveStepNo = livePendingIdx >= 0 ? livePendingIdx + 1 : 1;
            if (liveStepNo > 1) {
                const steps = [...(getPass.approvalRequest.steps || [])].sort(
                    (a, b) => a.stepNumber - b.stepNumber,
                );
                for (const st of steps) {
                    if (st.stepNumber >= liveStepNo) break;
                    await tx.approvalStep.update({
                        where: { id: st.id },
                        data: {
                            status: 'APPROVED',
                            actedByUser: { connect: { id: userId } },
                            actedAt: workflow.deptApprovedAt || workflow.costControlApprovedAt || new Date(),
                        },
                    });
                }
                await tx.approvalRequest.update({
                    where: { id: getPass.approvalRequest.id },
                    data: { currentStep: liveStepNo, status: 'PENDING', resolvedAt: null },
                });
            }
        }
        await tx.getPass.update({
            where: { id },
            data: bumpConcurrencyUpdate({
                ...workflow,
                ...(getPass.accWorkflowVersionId ? {} : getPassVersionPin(chain)),
                ...(isResubmit ? { notes: stripGetPassSendBackNotes(getPass.notes) } : {}),
            }),
        });
        if (!getPass.approvalRequest) {
            await ensureGetPassApprovalRequestInTx(tx, { ...getPass, status: workflow.status }, tenantId);
        }
    });
    if (isResubmit && !reusedApprovalRequest) {
        await logGovernedEvent({
            tenantId,
            entityType: EntityType.GET_PASS,
            entityId: id,
            action: 'SUBMIT',
            changedBy: userId,
            eventType: 'GET_PASS_RESUBMIT',
        });
    } else {
        await logAction({ tenantId, entityType: EntityType.GET_PASS, entityId: id, action: 'SUBMIT', changedBy: userId });
    }
    return getGetPassById(id, tenantId);
};

const checkoutAndStampExitInTx = async (tx, getPass, tenantId, user, linesOut = [], exitAt = new Date()) => {
    const period = await postingEngine.postGetPassCheckoutInTransaction(tx, { getPass, tenantId, user, linesOut });

    const internalToDestination = Boolean(getPass.isInternalTransfer && getPass.targetTenantId);
    const permanentCloseAtSource = getPass.transferType === 'PERMANENT' && !internalToDestination;
    const newStatus = permanentCloseAtSource ? 'CLOSED' : 'OUT';
    await tx.getPass.update({
        where: { id: getPass.id },
        data: {
            status: newStatus,
            checkedOutBy: user.id,
            checkedOutAt: exitAt,
            securityApprovedBy: user.id,
            securityApprovedAt: exitAt,
            closedBy: permanentCloseAtSource ? user.id : null,
            closedAt: permanentCloseAtSource ? exitAt : null,
            postingDate: period.postingDate,
            assignedPostingPeriod: period.assignedPostingPeriod,
        },
    });
};

/**
 * Approval chain:
 * PENDING_DEPT → … → PENDING_GM → PENDING_SECURITY.
 * Security approval now executes exit/stock movement immediately (status OUT or CLOSED).
 */
const approveGetPass = async (id, tenantId, user, expectedVersion = null) => {
    let step = 'LOAD';
    let status;
    try {
        const getPass = await prisma.getPass.findFirst({
            where: { id, tenantId },
            include: {
                approvalRequest: {
                    include: {
                        steps: {
                            orderBy: { stepNumber: 'asc' },
                            include: { requiredRole: { select: { code: true } } },
                        },
                    },
                },
            },
        });
        if (!getPass) throw passNotFoundErr();
        status = getPass.status;
        step = status;
        assertConcurrencyVersion(expectedVersion, getPass.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.GET_PASS, entityId: id, changedBy: user.id },
    });

        const wf = await resolveGetPassWorkflowContext(getPass);
        const pendingStatuses = wf.pendingStatuses.length ? wf.pendingStatuses : PENDING_APPROVAL_STATUSES;
        const securityStatus = pendingStatuses[pendingStatuses.length - 1] || 'PENDING_SECURITY';

        if (!pendingStatuses.includes(getPass.status)) {
            throw Object.assign(new Error('Get Pass is not pending any approval'), { statusCode: 400 });
        }
        assertCanActOnStatus(
            getPass.status,
            user,
            buildActOnStatusOptions(getPass.status, getPass, wf, {
                isInternalTransfer: getPass.isInternalTransfer,
            }),
        );

        if (getPass.status === securityStatus) {
            step = 'PENDING_SECURITY_CHECKOUT';
            await validatePostingDate(tenantId, new Date());
            await prisma.$transaction(async (tx) => {
                const approvalRequest = await ensureGetPassApprovalRequestInTx(tx, getPass, tenantId);
                const currentStepNo = Number(approvalRequest.currentStep);
                const approvalStep = approvalRequest.steps.find((s) => s.stepNumber === currentStepNo);
                if (approvalStep) {
                    await tx.approvalStep.update({
                        where: { id: approvalStep.id },
                        data: {
                            status: 'APPROVED',
                            actedByUser: { connect: { id: user.id } },
                            actedAt: new Date(),
                        },
                    });
                }
                await tx.approvalRequest.update({
                    where: { id: approvalRequest.id },
                    data: { status: 'APPROVED', currentStep: currentStepNo, resolvedAt: new Date() },
                });
                const passWithLines = await tx.getPass.findFirst({
                    where: { id, tenantId, status: securityStatus },
                    include: { lines: { include: { item: true } } },
                });
                if (!passWithLines) {
                    throw Object.assign(new Error('Get Pass is not pending security approval'), {
                        statusCode: 409,
                    });
                }
                await checkoutAndStampExitInTx(tx, passWithLines, tenantId, user, [], new Date());
            });
            step = 'PENDING_SECURITY_AUDIT';
            await logAction({
                tenantId,
                entityType: EntityType.GET_PASS,
                entityId: id,
                action: 'APPROVE',
                changedBy: user.id,
                note: 'GET_PASS_APPROVE_PENDING_SECURITY',
            });
            return getGetPassById(id, tenantId);
        }

        const updateData = getApproveTransitionData(getPass.status, wf, user.id);
        if (!updateData) {
            throw Object.assign(new Error('Get Pass is not pending any approval'), { statusCode: 400 });
        }

        step = `APPROVE_STEP:${getPass.status}`;
        await prisma.$transaction(async (tx) => {
            const approvalRequest = await ensureGetPassApprovalRequestInTx(tx, getPass, tenantId);
            const currentStepNo = Number(approvalRequest.currentStep);
            const approvalStep = approvalRequest.steps.find((s) => s.stepNumber === currentStepNo);
            if (!approvalStep || String(approvalStep.status || '').toUpperCase() !== 'PENDING') {
                throw Object.assign(new Error('No pending approval step found for Get Pass.'), { status: 422 });
            }
            await tx.approvalStep.update({
                where: { id: approvalStep.id },
                data: {
                    status: 'APPROVED',
                    actedByUser: { connect: { id: user.id } },
                    actedAt: new Date(),
                },
            });
            if (currentStepNo >= approvalRequest.totalSteps) {
                await tx.approvalRequest.update({
                    where: { id: approvalRequest.id },
                    data: { status: 'APPROVED', currentStep: currentStepNo, resolvedAt: new Date() },
                });
            } else {
                await tx.approvalRequest.update({
                    where: { id: approvalRequest.id },
                    data: { currentStep: currentStepNo + 1 },
                });
            }
            await tx.getPass.update({ where: { id }, data: updateData });
        });
        await logAction({
            tenantId,
            entityType: EntityType.GET_PASS,
            entityId: id,
            action: 'APPROVE',
            changedBy: user.id,
            note: `GET_PASS_APPROVE_STEP:${getPass.status}`,
        });
        return getGetPassById(id, tenantId);
    } catch (error) {
        console.error('[GET_PASS_APPROVAL_ERROR]', {
            getPassId: id,
            status,
            userId: user?.id,
            step,
            error: error?.message,
            stack: error?.stack,
        });
        if (error?.statusCode == null && error?.status != null) {
            error.statusCode = error.status;
        }
        throw error;
    }
};

const rejectGetPass = async (id, tenantId, user, rejectionReason, expectedVersion = null) => {
    const reason = typeof rejectionReason === 'string' ? rejectionReason.trim() : '';
    if (!reason) throw new Error('rejectionReason is required');

    const getPass = await prisma.getPass.findFirst({ where: { id, tenantId } });
    if (!getPass) throw passNotFoundErr();

    // Returned-to-creator (DRAFT + Send Back marker): creator abandons the pass as REJECTED.
    if (isGetPassSentBackDraft(getPass)) {
        assertGetPassSentBackCreator(getPass, user.id);
        assertConcurrencyVersion(expectedVersion, getPass.concurrencyVersion, {
            required: true,
            audit: { tenantId, entityType: EntityType.GET_PASS, entityId: id, changedBy: user.id },
        });
        const updated = await prisma.getPass.update({
            where: { id },
            data: bumpConcurrencyUpdate({
                status: 'REJECTED',
                rejectionReason: reason,
            }),
        });
        await logAction({
            tenantId,
            entityType: EntityType.GET_PASS,
            entityId: id,
            action: 'REJECT',
            changedBy: user.id,
            note: 'GET_PASS_CREATOR_REJECT_RETURNED',
        });
        return updated;
    }

    const wf = await resolveGetPassWorkflowContext(getPass);
    const pendingStatuses = wf.pendingStatuses.length ? wf.pendingStatuses : PENDING_APPROVAL_STATUSES;
    if (!pendingStatuses.includes(getPass.status)) {
        throw new Error('Get Pass is not pending any approval');
    }
    assertConcurrencyVersion(expectedVersion, getPass.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.GET_PASS, entityId: id, changedBy: user.id },
    });

    assertCanActOnStatus(
        getPass.status,
        user,
        buildActOnStatusOptions(getPass.status, getPass, wf, {
            isInternalTransfer: getPass.isInternalTransfer,
        }),
    );

    const updated = await prisma.getPass.update({
        where: { id },
        data: bumpConcurrencyUpdate({
            status: 'REJECTED',
            rejectionReason: reason,
        }),
    });
    await logAction({ tenantId, entityType: EntityType.GET_PASS, entityId: id, action: 'REJECT', changedBy: user.id });
    return updated;
};

/**
 * Send Back — prior chain targets only (Creator + steps before current).
 * @param {number|null} [targetStepNumber] — 0 = creator; omit = one-step default (step1→creator)
 */
const sendBackGetPass = async (id, tenantId, user, reason, expectedVersion = null, targetStepNumber = null) => {
    const trimmedReason = normalizeReason(reason);

    await assertActiveAssignmentForMutation(user, tenantId, 'send-back');

    const getPass = await prisma.getPass.findFirst({
        where: { id, tenantId },
        include: {
            createdByUser: true,
            deptApprover: true,
            costControlApprover: true,
            financeApprover: true,
            gmApprover: true,
            securityApprover: true,
            approvalRequest: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: { requiredRole: { select: { code: true } } },
                    },
                },
            },
        },
    });
    if (!getPass) throw passNotFoundErr();

    const wf = await resolveGetPassWorkflowContext(getPass);
    const pendingStatuses = wf.pendingStatuses.length ? wf.pendingStatuses : PENDING_APPROVAL_STATUSES;
    if (!pendingStatuses.includes(getPass.status)) {
        throw Object.assign(new Error('Get Pass cannot be sent back from its current status.'), { status: 422 });
    }

    assertConcurrencyVersion(expectedVersion, getPass.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.GET_PASS, entityId: id, changedBy: user.id },
    });

    assertCanActOnStatus(
        getPass.status,
        user,
        buildActOnStatusOptions(getPass.status, getPass, wf, {
            isInternalTransfer: getPass.isInternalTransfer,
        }),
    );

    const chain = getPass.accWorkflowVersionId
        ? await resolveWorkflowByVersionId(getPass.accWorkflowVersionId)
        : await resolveWorkflowForDocument({ moduleKey: 'GET_PASS', tenantId });
    const currentStepNo = getPassCurrentStepFromStatus(chain, getPass.status);
    const allowedTargets = buildGetPassSendBackTargets(getPass, chain);

    let targetStepNo;
    if (targetStepNumber == null || targetStepNumber === '') {
        // Backward-compatible default: one step back; never park on first approval alone.
        targetStepNo = currentStepNo <= 1 ? 0 : currentStepNo - 1;
        if (targetStepNo === 1) targetStepNo = 0;
    } else {
        targetStepNo = Number(targetStepNumber);
        if (!Number.isInteger(targetStepNo) || !allowedTargets.some((t) => t.stepNumber === targetStepNo)) {
            throw Object.assign(new Error('Send Back target must be a prior workflow participant.'), {
                status: 422,
                code: 'GET_PASS_SEND_BACK_INVALID_TARGET',
            });
        }
    }

    const nextStatus = getPassStatusForPendingStep(chain, targetStepNo);
    const toCreator = targetStepNo === 0;
    const notesAppend = toCreator
        ? getPass.notes
            ? `${getPass.notes}\n${SEND_BACK_NOTES_MARKER} ${trimmedReason}`
            : `${SEND_BACK_NOTES_MARKER} ${trimmedReason}`
        : getPass.notes;
    const stampClear = stampClearDataForSendBackTarget(chain, targetStepNo);

    await prisma.$transaction(async (tx) => {
        let approvalRequest = await ensureGetPassApprovalRequestInTx(tx, getPass, tenantId);
        approvalRequest = await syncGetPassApprovalRequestToDocumentInTx(
            tx,
            approvalRequest,
            getPass,
            chain,
        );
        const sourceStepNo = Number(approvalRequest.currentStep);
        const guarded = await tx.getPass.updateMany({
            where: { id, tenantId, status: getPass.status, concurrencyVersion: getPass.concurrencyVersion },
            data: bumpConcurrencyUpdate({
                status: nextStatus,
                rejectionReason: null,
                ...(notesAppend !== getPass.notes ? { notes: notesAppend } : {}),
                ...stampClear,
            }),
        });
        if (guarded.count === 0) {
            throw concurrencyConflictError();
        }
        await executeWorkflowSendBackInTx(tx, {
            approvalRequest,
            sourceStepNumber: sourceStepNo,
            forceTargetStepNumber: targetStepNo,
            reason: trimmedReason,
            userId: user.id,
            tenantId,
            entityType: EntityType.GET_PASS,
            entityId: id,
            documentStatusBefore: getPass.status,
            documentStatusAfter: nextStatus,
        });
    });

    return getGetPassById(id, tenantId);
};


const flushGetPassReturnDispositionBatchInTx = (tx, batch, params) =>
    flushGetPassReturnDispositionBatch(tx, batch, {
        ...params,
        generateDocNumber,
        DocPrefix,
        createMovementApprovalRequest,
        persistBreakagePhotos,
    });

/**
 * Parse return line payload: supports qtyGood + lostQty | damagedQty, or legacy qtyReturned + isLost/isDamaged.
 */
const parseReturnQuantities = (input, remainingQty, itemName) => {
    const n = (v) => Math.max(0, Number(v ?? 0));
    const legacyTotal = n(input.qtyReturned);
    const hasSplit =
        input.qtyGood !== undefined ||
        input.lostQty !== undefined ||
        input.damagedQty !== undefined;

    let qtyGood = 0;
    let qtyLost = 0;
    let qtyDamaged = 0;

    if (hasSplit) {
        qtyGood = n(input.qtyGood);
        qtyLost = n(input.lostQty);
        qtyDamaged = n(input.damagedQty);
    } else {
        if (legacyTotal <= 0) return null;
        const flagLost = Boolean(input.isLost);
        const flagDamaged = Boolean(input.isDamaged) && !flagLost;
        if (flagLost) qtyLost = legacyTotal;
        else if (flagDamaged) qtyDamaged = legacyTotal;
        else qtyGood = legacyTotal;
    }

    const total = qtyGood + qtyLost + qtyDamaged;
    if (total <= 0) return null;
    if (total > remainingQty + 1e-9) {
        throw Object.assign(
            new Error(
                `Good plus lost/damaged quantity exceeds remaining return qty for ${itemName} (max ${remainingQty}).`,
            ),
            { statusCode: 422 },
        );
    }
    for (const [field, qty] of [
        ['qtyGood', qtyGood],
        ['lostQty', qtyLost],
        ['damagedQty', qtyDamaged],
    ]) {
        if (qty > 0) {
            assertIntegerQuantity({
                qty,
                field,
                message: 'Quantity must be a whole number (integer). Fractional quantities are not allowed.',
                details: { itemName, field, qty },
            });
        }
    }
    return { qtyGood, qtyLost, qtyDamaged, total };
};

/**
 * Process incoming returned items for Temporary / Catering passes
 * @param {object} [options]
 * @param {Array<Array>} [options.linePhotosByIndex] — multer files per payload line (Damaged photos → BRK)
 * @param {object} [options.user] — actor for photo upload metadata
 */
const processReturns = async (id, tenantId, userId, linesPayload, notes, options = {}) => {
    const getPass = await getIssuerGetPassById(id, tenantId);
    assertNotPendingForceCloseSettlement(getPass);
    if (getPass.isInternalTransfer === true) {
        throw Object.assign(
            new Error(
                'Process return is not available for inter-hotel transfers. Complete the internal return logistics flow instead (ship back -> gate arrival -> department acceptance).',
            ),
            { statusCode: 400 },
        );
    }
    if (!['OUT', 'PARTIALLY_RETURNED'].includes(getPass.status)) throw new Error('Get Pass is not currently checked out');
    if (getPass.transferType === 'PERMANENT') throw new Error('Cannot return items on a PERMANENT pass');

    await validatePostingDate(tenantId, new Date());

    const linePhotosByIndex = Array.isArray(options.linePhotosByIndex) ? options.linePhotosByIndex : [];
    const actorUser = options.user || null;

    const result = await prisma.$transaction(async (tx) => {
        const now = new Date();
        const dispositionBatch = createGetPassReturnDispositionBatch();
        for (let payloadIndex = 0; payloadIndex < linesPayload.length; payloadIndex += 1) {
            const input = linesPayload[payloadIndex];
            const line = await tx.getPassLine.findFirst({
                where: { id: input.lineId, getPassId: id },
                include: { item: true },
            });
            if (!line) continue;

            const itemName = line.item?.name || 'item';
            const remainingQty = Number(line.qty) - Number(line.qtyReturned);
            const parsed = parseReturnQuantities(input, remainingQty, itemName);
            if (!parsed) continue;

            const { qtyGood, qtyLost, qtyDamaged, total } = parsed;
            const isLost = qtyLost > 0;
            const isDamaged = qtyDamaged > 0;

            const claimedRows = await tx.$queryRaw`
                UPDATE "get_pass_lines"
                SET "qtyReturned" = "qtyReturned" + ${total},
                    "returnedGoodQty" = "returnedGoodQty" + ${qtyGood},
                    "returnedDamagedQty" = "returnedDamagedQty" + ${qtyDamaged},
                    "returnedLostQty" = "returnedLostQty" + ${qtyLost}
                WHERE "id" = ${line.id}::uuid
                  AND "getPassId" = ${id}::uuid
                  AND "qty" - "qtyReturned" >= ${total}
                RETURNING
                    "qty",
                    "qtyReturned",
                    "returnedGoodQty",
                    "returnedDamagedQty",
                    "returnedLostQty"
            `;
            const claimedLine = claimedRows[0];
            if (!claimedLine) {
                throw Object.assign(
                    new Error('Return quantity changed while this request was being processed. Reload and try again.'),
                    { statusCode: 409, code: 'GET_PASS_RETURN_QUANTITY_CHANGED' },
                );
            }

            const returnRecord = await tx.getPassReturn.create({
                data: {
                    getPassLineId: line.id,
                    qtyReturned: total,
                    qtyGood,
                    qtyLost,
                    qtyDamaged,
                    isLost,
                    isDamaged,
                    conditionIn: input.conditionIn,
                    notes: input.notes,
                    registeredBy: userId,
                    securityVerifiedBy: input.securityId || null,
                },
            });

            const wac = Number(line.unitCost);
            const stockKey = {
                tenantId_itemId_locationId: { tenantId, itemId: line.itemId, locationId: line.locationId },
            };

            // Good qty: release custody block → available again (immediate).
            // Damaged/Lost: keep qtyBlocked until BRK/LST GM posts (same as internal write-off gate).
            if (isBlockingTransferType(getPass.transferType) && total > 0) {
                if (qtyGood > 0) {
                    await postingEngine.releaseBlockedOnReturn(tx, {
                        stockKey,
                        releaseQty: qtyGood,
                        nonGoodQty: 0,
                    });
                    await postingEngine.postReturnGoodLedger(tx, {
                        tenantId,
                        itemId: line.itemId,
                        locationId: line.locationId,
                        goodQty: qtyGood,
                        wac,
                        referenceId: returnRecord.id,
                        referenceNo: getPass.passNo,
                        userId,
                        notes: `Get pass return — good qty back to available (${qtyGood}).`,
                        affectsValuation: false,
                    });
                }
            } else if (qtyGood > 0) {
                await postingEngine.postReturnGoodWithStockIncrease(tx, {
                    tenantId,
                    itemId: line.itemId,
                    locationId: line.locationId,
                    qtyGood,
                    wac,
                    referenceId: returnRecord.id,
                    referenceNo: getPass.passNo,
                    userId,
                });
            }

            if (qtyLost > 0 || qtyDamaged > 0) {
                queueGetPassReturnDispositionLine(dispositionBatch, {
                    line,
                    damagedQty: qtyDamaged,
                    lostQty: qtyLost,
                    accountability: input.accountability || input.lostAccountability || input.damagedAccountability,
                    managerNotes: input.notes || notes || null,
                    photoFiles: qtyDamaged > 0 ? linePhotosByIndex[payloadIndex] || [] : [],
                });
            }

            const newReturned = Number(claimedLine.qtyReturned);
            const lineQty = Number(claimedLine.qty);
            let lineStatus = 'PARTIALLY_RETURNED';
            if (newReturned >= lineQty - 1e-9) {
                const agg = await tx.getPassReturn.aggregate({
                    where: { getPassLineId: line.id },
                    _sum: { qtyGood: true, qtyLost: true, qtyDamaged: true },
                });
                const sumG = Number(agg._sum.qtyGood || 0);
                const sumL = Number(agg._sum.qtyLost || 0);
                const sumD = Number(agg._sum.qtyDamaged || 0);
                const allLost = sumL >= lineQty - 1e-9 && sumG < 1e-9 && sumD < 1e-9;
                lineStatus = allLost ? 'LOST' : 'RETURNED';
            }

            await tx.getPassLine.update({
                where: { id: line.id },
                data: {
                    status: lineStatus,
                },
            });
        }

        await flushGetPassReturnDispositionBatchInTx(tx, dispositionBatch, {
            tenantId,
            getPassId: id,
            passNo: getPass.passNo,
            userId,
            now,
            firstStepComment: 'Registered via get pass return',
            user: actorUser,
        });

        const allLines = await tx.getPassLine.findMany({ where: { getPassId: id } });
        const allReturned = allLines.every((l) => Number(l.qtyReturned) >= Number(l.qty));
        const someReturned = allLines.some((l) => Number(l.qtyReturned) > 0);

        let newStatus = getPass.status;
        if (allReturned) newStatus = 'RETURNED';
        else if (someReturned) newStatus = 'PARTIALLY_RETURNED';

        if (newStatus !== getPass.status) {
            await tx.getPass.update({
                where: { id },
                data: { status: newStatus },
            });
        }
        // Return notes stay on audit/evidence — do not append to Get Pass.notes.
        return { newStatus };
    });

    await logAction({
        tenantId,
        entityType: EntityType.GET_PASS,
        entityId: id,
        action: 'UPDATE',
        changedBy: userId,
        note: 'GET_PASS_PROCESS_RETURN',
        afterValue: {
            status: result?.newStatus || null,
            ...(notes && String(notes).trim() ? { returnNotes: String(notes).trim() } : {}),
        },
    });
    return getGetPassById(id, tenantId);
};

/**
 * FC-02 Simple Close — outstanding must be zero; no inventory posting.
 */
const closeGetPass = async (id, tenantId, userId) => {
    const getPass = await getIssuerGetPassById(id, tenantId);
    assertNotPendingForceCloseSettlement(getPass);
    assertForceCloseEligible(getPass, { tenantId });
    assertSimpleCloseOutstandingZero(getPass);

    await prisma.getPass.update({
        where: { id },
        data: {
            status: 'CLOSED',
            closedBy: userId,
            closedAt: new Date(),
            closedVia: 'SIMPLE',
            closeReason: null,
        },
    });

    await logAction({
        tenantId,
        entityType: EntityType.GET_PASS,
        entityId: id,
        action: 'UPDATE',
        changedBy: userId,
        note: 'GET_PASS_CLOSE',
    });
    return getGetPassById(id, tenantId);
};

const parseSettlementPayload = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const lines = Array.isArray(raw.lines) ? raw.lines : [];
    return {
        settlementCycleId: raw.settlementCycleId ?? null,
        closeReason: raw.closeReason ?? null,
        accountability: raw.accountability ?? null,
        lines: lines.map((row) => ({
            lineId: row.lineId,
            disposition: String(row.disposition ?? '').toUpperCase(),
            accountability: row.accountability ?? null,
        })),
    };
};

const assertSettlementBlockedQty = async (tx, getPass, tenantId, settlementLines) => {
    if (!isBlockingTransferType(getPass.transferType)) return;
    for (const row of settlementLines) {
        const line = (getPass.lines ?? []).find((l) => l.id === row.lineId);
        if (!line) continue;
        const outstanding = lineOutstandingQty(line);
        if (outstanding <= 1e-9) continue;
        const stockKey = {
            tenantId_itemId_locationId: { tenantId, itemId: line.itemId, locationId: line.locationId },
        };
        const stock = await tx.stockBalance.findUnique({ where: stockKey });
        const blocked = Number(stock?.qtyBlocked || 0);
        if (blocked + 1e-9 < outstanding) {
            throw Object.assign(new Error('Insufficient blocked quantity for force-close settlement.'), {
                statusCode: 400,
            });
        }
    }
};

/**
 * Apply one settlement line posting — mirrors processReturns for a single full-outstanding disposition.
 */
const applySettlementLinePosting = async (
    tx,
    {
        getPass,
        id,
        tenantId,
        userId,
        line,
        row,
        now,
        closeReason,
        dispositionBatch,
        execution,
    },
) => {
    const outstanding = lineOutstandingQty(line);
    const disposition = row.disposition;
    let qtyGood = 0;
    let qtyLost = 0;
    let qtyDamaged = 0;
    if (disposition === 'GOOD') qtyGood = outstanding;
    else if (disposition === 'DAMAGED') qtyDamaged = outstanding;
    else qtyLost = outstanding;

    const total = outstanding;
    const isLost = qtyLost > 0;
    const isDamaged = qtyDamaged > 0;

    const returnRecord = await tx.getPassReturn.create({
        data: {
            getPassLineId: line.id,
            qtyReturned: total,
            qtyGood,
            qtyLost,
            qtyDamaged,
            isLost,
            isDamaged,
            accountability: row.accountability,
            notes: `Force-close settlement (${disposition})`,
            registeredBy: userId,
        },
    });

    const wac = Number(line.unitCost);
    const stockKey = {
        tenantId_itemId_locationId: { tenantId, itemId: line.itemId, locationId: line.locationId },
    };

    if (isBlockingTransferType(getPass.transferType) && total > 0) {
        // Good only releases custody immediately; Damaged/Lost stay blocked until GM posts BRK/LST.
        if (qtyGood > 0) {
            await postingEngine.releaseBlockedOnReturn(tx, {
                stockKey,
                releaseQty: qtyGood,
                nonGoodQty: 0,
            });
            const effectKey = `${execution.executionKey}|${line.id}|GOOD_RETURN`;
            const ledger = await postingEngine.postReturnGoodLedger(tx, {
                tenantId,
                itemId: line.itemId,
                locationId: line.locationId,
                goodQty: qtyGood,
                wac,
                referenceId: returnRecord.id,
                referenceNo: getPass.passNo,
                userId,
                notes: `Force-close settlement — good qty back to available (${qtyGood}).`,
                affectsValuation: false,
                postingEffectKey: effectKey,
            });
            await tx.postingEffect.create({
                data: {
                    tenantId,
                    executionId: execution.id,
                    effectKey,
                    sourceLineId: line.id,
                    effectType: 'GOOD_RETURN',
                    ledgerId: ledger.id,
                },
            });
        }
    } else if (qtyGood > 0) {
        await postingEngine.postReturnGoodWithStockIncrease(tx, {
            tenantId,
            itemId: line.itemId,
            locationId: line.locationId,
            qtyGood,
            wac,
            referenceId: returnRecord.id,
            referenceNo: getPass.passNo,
            userId,
        });
    }

    if (qtyLost > 0 || qtyDamaged > 0) {
        queueGetPassReturnDispositionLine(dispositionBatch, {
            line,
            damagedQty: qtyDamaged,
            lostQty: qtyLost,
            accountability: row.accountability,
            managerNotes: closeReason || null,
        });
    }

    const newReturned = Number(line.qtyReturned) + total;
    const lineQty = Number(line.qty);
    let lineStatus = 'PARTIALLY_RETURNED';
    if (newReturned >= lineQty - 1e-9) {
        const agg = await tx.getPassReturn.aggregate({
            where: { getPassLineId: line.id },
            _sum: { qtyGood: true, qtyLost: true, qtyDamaged: true },
        });
        const sumG = Number(agg._sum.qtyGood || 0);
        const sumL = Number(agg._sum.qtyLost || 0);
        const sumD = Number(agg._sum.qtyDamaged || 0);
        const allLost = sumL >= lineQty - 1e-9 && sumG < 1e-9 && sumD < 1e-9;
        lineStatus = allLost ? 'LOST' : 'RETURNED';
    }

    await tx.getPassLine.update({
        where: { id: line.id },
        data: {
            qtyReturned: newReturned,
            status: lineStatus,
            returnedGoodQty: { increment: qtyGood },
            returnedDamagedQty: { increment: qtyDamaged },
            returnedLostQty: { increment: qtyLost },
        },
    });
};

const submitForceCloseSettlement = async (id, tenantId, userId, payload) => {
    const getPass = await getIssuerGetPassById(id, tenantId);
    assertSettlementSubmitEligible(getPass, { tenantId });
    const validated = validateSettlementPayload(getPass, payload);

    const settlementCycleId = crypto.randomUUID();
    const submittedAt = new Date();
    const settlementPayload = {
        settlementCycleId,
        closeReason: validated.closeReason,
        accountability: validated.accountability,
        lines: validated.lines.map(({ lineId, disposition, accountability }) => ({
            lineId,
            disposition,
            accountability,
        })),
    };

    await prisma.getPass.update({
        where: { id },
        data: {
            status: 'PENDING_FORCE_CLOSE_SETTLEMENT',
            settlementPriorStatus: getPass.status,
            settlementPayload,
            settlementSubmittedBy: userId,
            settlementSubmittedAt: submittedAt,
            closeReason: validated.closeReason,
            settlementRejectionReason: null,
            settlementRejectedBy: null,
            settlementRejectedAt: null,
            settlementCancelledBy: null,
            settlementCancelledAt: null,
        },
    });

    await logGovernedEvent({
        tenantId,
        entityType: EntityType.GET_PASS,
        entityId: id,
        action: 'UPDATE',
        changedBy: userId,
        eventType: 'GET_PASS_FORCE_CLOSE_SUBMITTED',
        note: JSON.stringify({
            lineCount: validated.lines.length,
            accountability: validated.accountability,
        }),
        afterValue: { status: 'PENDING_FORCE_CLOSE_SETTLEMENT', settlementPayload },
    });

    return getGetPassById(id, tenantId);
};

const approveForceCloseSettlement = async (id, tenantId, userId) => {
    const getPass = await getIssuerGetPassById(id, tenantId);
    if (getPass.status !== 'PENDING_FORCE_CLOSE_SETTLEMENT') {
        throw Object.assign(new Error('No pending force-close settlement to approve.'), { statusCode: 400 });
    }
    const settlement = parseSettlementPayload(getPass.settlementPayload);
    if (!settlement?.lines?.length) {
        throw Object.assign(new Error('Settlement payload is missing or invalid.'), { statusCode: 400 });
    }

    assertForceCloseEligible(
        { ...getPass, status: getPass.settlementPriorStatus || 'OUT' },
        { tenantId },
    );
    if (!hasOutstandingQty(getPass)) {
        throw Object.assign(new Error('No outstanding quantities remain on this pass.'), { statusCode: 400 });
    }

    const now = new Date();
    await validatePostingDate(tenantId, now);
    const settlementCycleId =
        settlement.settlementCycleId ||
        (getPass.settlementSubmittedAt ? new Date(getPass.settlementSubmittedAt).toISOString() : null);
    if (!settlementCycleId) {
        throw Object.assign(
            new Error('Force-close settlement cycle identity is missing. Cancel and resubmit the settlement.'),
            { statusCode: 409, code: 'FORCE_CLOSE_SETTLEMENT_CYCLE_REQUIRED' },
        );
    }
    const executionKey = `v1|GET_PASS_FORCE_CLOSE|${tenantId}|${id}|${settlementCycleId}`;

    await prisma.$transaction(async (tx) => {
        let execution;
        try {
            execution = await tx.postingExecution.create({
                data: {
                    tenantId,
                    executionKey,
                    sourceType: 'GET_PASS_FORCE_CLOSE',
                    sourceId: id,
                    status: 'IN_PROGRESS',
                },
            });
        } catch (error) {
            const target = Array.isArray(error?.meta?.target)
                ? error.meta.target.join(',')
                : String(error?.meta?.target || '');
            if (error?.code === 'P2002' && target.includes('executionKey')) {
                throw Object.assign(
                    new Error('This force-close settlement has already been executed.'),
                    {
                        statusCode: 409,
                        code: 'POSTING_EXECUTION_ALREADY_APPLIED',
                        details: { executionKey },
                    },
                );
            }
            throw error;
        }
        await assertSettlementBlockedQty(tx, getPass, tenantId, settlement.lines);

        const dispositionBatch = createGetPassReturnDispositionBatch();
        for (const row of settlement.lines) {
            const line = await tx.getPassLine.findFirst({
                where: { id: row.lineId, getPassId: id },
                include: { item: true },
            });
            if (!line) {
                throw Object.assign(new Error(`Settlement line ${row.lineId} not found.`), { statusCode: 400 });
            }
            const outstanding = lineOutstandingQty(line);
            if (outstanding <= 1e-9) continue;

            await applySettlementLinePosting(tx, {
                getPass,
                id,
                tenantId,
                userId,
                line,
                row,
                now,
                closeReason: settlement.closeReason,
                dispositionBatch,
                execution,
            });
        }

        await flushGetPassReturnDispositionBatchInTx(tx, dispositionBatch, {
            tenantId,
            getPassId: id,
            passNo: getPass.passNo,
            userId,
            now,
            firstStepComment: 'Registered via force-close settlement',
        });

        await tx.getPass.update({
            where: { id },
            data: {
                status: 'CLOSED',
                closedVia: 'FORCE_SETTLEMENT',
                closedBy: userId,
                closedAt: now,
                settlementApprovedBy: userId,
                settlementApprovedAt: now,
            },
        });
        await tx.postingExecution.update({
            where: { id: execution.id },
            data: { status: 'COMPLETED', completedAt: now },
        });
    });

    await logGovernedEvent({
        tenantId,
        entityType: EntityType.GET_PASS,
        entityId: id,
        action: 'UPDATE',
        changedBy: userId,
        eventType: 'GET_PASS_FORCE_CLOSE_APPROVED',
        note: JSON.stringify({
            lineCount: settlement.lines.length,
            closedVia: 'FORCE_SETTLEMENT',
        }),
        afterValue: { status: 'CLOSED', closedVia: 'FORCE_SETTLEMENT' },
    });

    return getGetPassById(id, tenantId);
};

const rejectForceCloseSettlement = async (id, tenantId, userId, rejectionReason) => {
    const reason = String(rejectionReason ?? '').trim();
    if (!reason) {
        throw Object.assign(new Error('settlementRejectionReason is required.'), { statusCode: 400 });
    }

    const getPass = await getIssuerGetPassById(id, tenantId);
    if (getPass.status !== 'PENDING_FORCE_CLOSE_SETTLEMENT') {
        throw Object.assign(new Error('No pending force-close settlement to reject.'), { statusCode: 400 });
    }

    const priorStatus = getPass.settlementPriorStatus || 'OUT';
    await prisma.getPass.update({
        where: { id },
        data: {
            status: priorStatus,
            settlementRejectionReason: reason,
            settlementRejectedBy: userId,
            settlementRejectedAt: new Date(),
        },
    });

    await logGovernedEvent({
        tenantId,
        entityType: EntityType.GET_PASS,
        entityId: id,
        action: 'UPDATE',
        changedBy: userId,
        eventType: 'GET_PASS_FORCE_CLOSE_REJECTED',
        note: reason,
        afterValue: { status: priorStatus },
    });

    return getGetPassById(id, tenantId);
};

const cancelForceCloseSettlement = async (id, tenantId, userId) => {
    const getPass = await getIssuerGetPassById(id, tenantId);
    if (getPass.status !== 'PENDING_FORCE_CLOSE_SETTLEMENT') {
        throw Object.assign(new Error('No pending force-close settlement to cancel.'), { statusCode: 400 });
    }

    const priorStatus = getPass.settlementPriorStatus || 'OUT';
    await prisma.getPass.update({
        where: { id },
        data: {
            status: priorStatus,
            settlementCancelledBy: userId,
            settlementCancelledAt: new Date(),
        },
    });

    await logGovernedEvent({
        tenantId,
        entityType: EntityType.GET_PASS,
        entityId: id,
        action: 'UPDATE',
        changedBy: userId,
        eventType: 'GET_PASS_FORCE_CLOSE_CANCELLED',
        afterValue: { status: priorStatus },
    });

    return getGetPassById(id, tenantId);
};

module.exports = {
    resolveOrgWideGetPassListContext,
    createGetPass,
    getGetPasses,
    getIncomingGetPasses,
    getReturningGetPasses,
    getDiscrepancyClaims,
    checkAndNotifyOverduePasses,
    getGetPassById,
    confirmDestinationReceipt,
    acceptDestinationDepartment,
    shipBackGetPass,
    confirmReturnExit,
    confirmReturnArrival,
    acceptReturnIntoDepartment,
    updateGetPass,
    deleteGetPass,
    submitGetPass,
    approveGetPass,
    rejectGetPass,
    sendBackGetPass,
    processReturns,
    closeGetPass,
    submitForceCloseSettlement,
    approveForceCloseSettlement,
    rejectForceCloseSettlement,
    cancelForceCloseSettlement,
    assertForceCloseEligible,
};
