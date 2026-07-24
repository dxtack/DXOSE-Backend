'use strict';

const prisma = require('../config/database');
const { generateDocNumber } = require('./docNumbering.service');
const { checkPeriodLock } = require('./periodGuard.service');
const { normalizeRole } = require('./rbac.service');
const { assertUserHasBreakageLostStepPermission } = require('../acc-authority/step-permission-enforcement');
const { withUserFacingState, appendSendBackNotes, stripSendBackNotes } = require('../platform/lifecyclePresentation.service');
const {
    resolveScopeContext,
    scopeWhereFor,
    metaFor,
    assertInScope,
    assertLocationInScope,
    isScopeEngineEnabled,
    SCOPE_MODULE,
} = require('./scope/scopeContext');
const { assertActiveAssignmentForMutation } = require('./scope/assignment-mutation.guard');
const { formatStructuredMovementNotes } = require('../utils/formatMovementNotes');
const { assertLinesHaveStockAtLocation } = require('./location-item-resolution.service');
const { assertIntegerQuantity } = require('./integerQuantityGuard.service');
const { createMovementApprovalRequest, backfillMovementApprovalRequest, attachApprovalAndEnterPipeline, parseSaveAsDraftFlag, healDraftStatusFromExistingApproval } = require('./breakage.service');
const {
    resolveMovementWorkflowChain,
    submitStatusFromApproval,
    documentStatusAfterApprovingStep,
    documentStatusForPendingStep,
} = require('./acc-workflow-movement.runtime');
const {
    resolveWorkflowForDocument,
    resolveWorkflowByVersionId,
} = require('./acc-workflow-runtime.service');
const { moduleKeyForRequestType } = require('../engines/workflow-resolution.engine');
const { assertConcurrencyVersion, bumpConcurrencyUpdate } = require('../platform/concurrency.service');
const { getDisplayCurrency } = require('../platform/displayCurrency.service');
const {
    executeWorkflowSendBackInTx,
    executeCreatorResubmitInTx,
    normalizeReason,
} = require('../platform/workflowSendBack.service');
const { logAction, EntityType } = require('./auditTrail.service');

const TENANT_WIDE_MOVEMENT_APPROVAL_ROLES = new Set([
    'COST_CONTROL',
    'FINANCE_MANAGER',
    'GENERAL_MANAGER',
    'ORG_MANAGER',
    'SUPER_ADMIN',
]);

/** In-flight workflow only (excludes final APPROVED — archive tab uses status=APPROVED). */
const PIPELINE_NON_FINAL_STATUSES = [
    'PENDING_DEPT',
    'DEPT_APPROVED',
    'COST_CONTROL_APPROVED',
    'FINANCE_APPROVED',
];

/**
 * Same as breakage: keep processed-but-not-final documents in the role’s workflow tab.
 */
const buildRolePipelineStageStatusWhere = (statusRaw, userRole) => {
    const raw = typeof statusRaw === 'string' ? statusRaw.trim() : '';
    if (!raw || raw.includes(',')) return null;
    const role = userRole ? normalizeRole(userRole) : '';
    if (role === 'COST_CONTROL' && raw === 'DEPT_APPROVED') {
        return { status: { in: ['DEPT_APPROVED', 'COST_CONTROL_APPROVED'] } };
    }
    if (role === 'FINANCE_MANAGER' && raw === 'COST_CONTROL_APPROVED') {
        return { status: { in: ['COST_CONTROL_APPROVED', 'FINANCE_APPROVED'] } };
    }
    if (role === 'GENERAL_MANAGER' && raw === 'FINANCE_APPROVED') {
        return { status: 'FINANCE_APPROVED' };
    }
    return null;
};

const buildStatusWhere = (statusRaw) => {
    const raw = typeof statusRaw === 'string' ? statusRaw.trim() : '';
    if (!raw) return {};
    if (raw.includes(',')) {
        const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
        return parts.length === 0 ? {} : parts.length === 1 ? { status: parts[0] } : { status: { in: parts } };
    }
    return { status: raw };
};

const lostListInclude = (user) => {
    const role = user?.role ? normalizeRole(user.role) : '';
    const fullApproval = TENANT_WIDE_MOVEMENT_APPROVAL_ROLES.has(role);
    const base = {
        createdByUser: { select: { id: true, firstName: true, lastName: true } },
        getPass: { select: { id: true, passNo: true } },
        lines: {
            select: {
                qtyInBaseUnit: true,
                item: { select: { id: true, name: true, barcode: true } },
            },
        },
        _count: { select: { lines: true } },
    };
    if (fullApproval) {
        return {
            ...base,
            approvalRequests: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: {
                            actedByUser: { select: { id: true, firstName: true, lastName: true } },
                            requiredRole: { select: { id: true, code: true } },
                        },
                    },
                },
            },
        };
    }
    return {
        ...base,
        approvalRequests: {
            select: { id: true, status: true, currentStep: true, totalSteps: true, createdAt: true },
        },
    };
};

const LOST_INCLUDE = {
    createdByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
    getPass: { select: { id: true, passNo: true } },
    lines: {
        include: {
            item: { select: { id: true, name: true, barcode: true } },
            location: {
                select: {
                    id: true,
                    name: true,
                    department: { select: { id: true, name: true } },
                },
            },
        },
    },
    approvalRequests: {
        include: {
            steps: {
                orderBy: { stepNumber: 'asc' },
                include: {
                    actedByUser: { select: { id: true, firstName: true, lastName: true } },
                    requiredRole: { select: { id: true, code: true } },
                },
            },
        },
    },
};

// Prisma 1:1 optional → object; some API paths wrap as [approval].
const { getApproval, asApprovalRequestsArray } = require('./breakageLostWorkflowContext.util');

const err = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

const GET_PASS_ACCOUNTABILITY = new Set([
    'EMPLOYEE_DEDUCTION',
    'COMPANY_LOSS',
    'TARGET_HOTEL_COMPENSATION',
]);
const SUGGESTED_ACTIONS = new Set(['EMPLOYEE', 'HOTEL']);

const assertResponsibleEmployeeOnCreate = (suggestedAction, responsibleEmployeeName) => {
    if (String(suggestedAction).trim().toUpperCase() !== 'EMPLOYEE') return;
    const name = typeof responsibleEmployeeName === 'string' ? responsibleEmployeeName.trim() : '';
    if (!name) {
        throw err('Responsible employee name or ID is required when suggested action is employee deduction.', 400);
    }
};

const assertEmployeeDeductionApprovalComment = (action, accountability, comment) => {
    if (action !== 'APPROVE') return;
    if (accountability !== 'EMPLOYEE_DEDUCTION') return;
    const text = typeof comment === 'string' ? comment.trim() : '';
    if (!text) {
        throw err('Employee name or ID is required when accountability is employee deduction.', 400);
    }
};

const AUTO_APPROVAL_NOTE = 'Auto-approved by system due to high-level authority.';

const listLostItems = async (tenantId, query = {}, user = null) => {
    const skipN = Number.parseInt(String(query.skip ?? 0), 10) || 0;
    const takeN = Math.min(Number.parseInt(String(query.take ?? 20), 10) || 20, 100);
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    const status = typeof query.status === 'string' ? query.status.trim() : '';
    const sourceType = typeof query.sourceType === 'string' ? query.sourceType.trim() : '';
    const pipeline = query.pipeline;

    const role = user?.role ? normalizeRole(user.role) : '';
    const tenantWide = TENANT_WIDE_MOVEMENT_APPROVAL_ROLES.has(role);

    let statusWhere = {};
    if (status) {
        const expanded = buildRolePipelineStageStatusWhere(status, role);
        statusWhere = expanded ?? buildStatusWhere(status);
    } else if (tenantWide && (pipeline === '1' || pipeline === 'true' || pipeline === true)) {
        statusWhere = { status: { in: PIPELINE_NON_FINAL_STATUSES } };
    }

    const scope = user && isScopeEngineEnabled('lost') ? await resolveScopeContext(user, tenantId) : null;
    const scopeWhere = scope ? scopeWhereFor(SCOPE_MODULE.LOST, scope, { userId: user.id }) : {};

    const sourceFilter =
        sourceType === 'INTERNAL'
            ? { getPassId: null }
            : sourceType === 'GET_PASS_RETURN'
              ? { getPassId: { not: null } }
              : {};

    const baseWhere = {
        tenantId,
        movementType: 'LOST',
        ...sourceFilter,
        ...statusWhere,
    };

    const searchClause = search
        ? {
              OR: [
                  { documentNo: { contains: search, mode: 'insensitive' } },
                  { reason: { contains: search, mode: 'insensitive' } },
                  { lines: { some: { item: { name: { contains: search, mode: 'insensitive' } } } } },
                  { lines: { some: { item: { barcode: { contains: search, mode: 'insensitive' } } } } },
              ],
          }
        : null;

    const andParts = [];
    if (scopeWhere && Object.keys(scopeWhere).length) andParts.push(scopeWhere);
    if (searchClause) andParts.push(searchClause);

    const where = { ...baseWhere };
    if (andParts.length === 1) {
        Object.assign(where, andParts[0]);
    } else if (andParts.length > 1) {
        where.AND = andParts;
    }

    const listInclude = lostListInclude(user);

    const totalUnscopedPromise = scope
        ? prisma.movementDocument.count({ where: baseWhere })
        : Promise.resolve(null);

    const [documents, total, totalUnscoped] = await Promise.all([
        prisma.movementDocument.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: skipN,
            take: takeN,
            include: listInclude,
        }),
        prisma.movementDocument.count({ where }),
        totalUnscopedPromise,
    ]);

    const items = documents.map((doc) => {
        const totalQtyLost = doc.lines.reduce((sum, line) => sum + Number(line.qtyInBaseUnit || 0), 0);
        const firstLine = doc.lines[0];
        const ar = doc.approvalRequests;
        let approvalRequests = [];
        if (ar) {
            if (ar.steps) {
                approvalRequests = [
                    {
                        id: ar.id,
                        status: ar.status,
                        currentStep: ar.currentStep,
                        totalSteps: ar.totalSteps,
                        createdAt: ar.createdAt,
                        steps: ar.steps,
                    },
                ];
            } else {
                approvalRequests = [
                    {
                        id: ar.id,
                        status: ar.status,
                        currentStep: ar.currentStep,
                        totalSteps: ar.totalSteps,
                        createdAt: ar.createdAt,
                    },
                ];
            }
        }
        return withUserFacingState('LOST', {
            id: doc.id,
            documentNo: doc.documentNo,
            status: doc.status,
            sourceType: doc.sourceType,
            getPassId: doc.getPassId,
            getPass: doc.getPass,
            reason: doc.reason,
            notes: doc.notes,
            createdAt: doc.createdAt,
            createdByUser: doc.createdByUser,
            itemName: firstLine?.item?.name || '',
            itemBarcode: firstLine?.item?.barcode || null,
            qtyLost: totalQtyLost,
            totalQtyLost,
            approvalRequests,
            _count: doc._count,
        });
    });

    const scopeMeta = scope ? metaFor(scope, { total, totalUnscoped, scopeWhere }) : null;
    return { items, total, ...scopeMeta };
};

const normalizeLostLines = (lines = []) => {
    const map = new Map();
    const order = [];

    for (const line of lines) {
        if (!line?.locationId) {
            throw err('Each line requires a source location.', 400);
        }
        if (!line?.itemId) {
            throw err('Each line requires an item.', 400);
        }
        const qty = parseFloat(line.qty);
        if (!qty || qty <= 0) {
            throw err('Quantity must be positive for each line.', 400);
        }
        assertIntegerQuantity({
            qty,
            field: 'qty',
            message: 'Quantity must be a whole number (integer). Fractional quantities are not allowed.',
            details: { itemId: line.itemId, locationId: line.locationId, qty },
        });
        const key = `${line.locationId}:${line.itemId}`;

        if (map.has(key)) {
            const prev = map.get(key);
            prev.qty += qty;
            const note = typeof line.notes === 'string' ? line.notes.trim() : '';
            if (note) {
                prev.notes = [prev.notes, note].filter(Boolean).join('; ');
            }
        } else {
            map.set(key, {
                itemId: line.itemId,
                locationId: line.locationId,
                qty,
                notes: typeof line.notes === 'string' ? line.notes.trim() || null : null,
                unitCost: line.unitCost,
                totalValue: line.totalValue,
            });
            order.push(key);
        }
    }

    if (order.length === 0) {
        throw err('At least one line is required.');
    }

    return order.map((key) => map.get(key));
};

const createLost = async (tenantId, user, body = {}) => {
    const userId = user?.id;
    const _userRole = user?.role;
    const { isMovementCreateActorRole } = require('./breakageLostWorkflowContext.util');
    if (!isMovementCreateActorRole(_userRole)) {
        throw err(
            'Only Department Manager or Storekeeper (or Org/Super governance) may create lost documents.',
            403,
        );
    }
    await assertActiveAssignmentForMutation(user, tenantId, 'create');
    const {
        lines = [],
        reason,
        notes,
        sourceLocationId: legacySourceLocationId,
        documentDate,
        accountabilityType,
        accountability,
        suggestedAction,
        responsibleEmployeeName,
        saveAsDraft,
    } = body;
    if (!reason?.trim()) throw err('Reason is required.');
    if (!Array.isArray(lines) || lines.length === 0) throw err('At least one line is required.');
    if (!suggestedAction || !SUGGESTED_ACTIONS.has(String(suggestedAction).trim().toUpperCase())) {
        throw err('Suggested action is required and must be EMPLOYEE or HOTEL.');
    }

    const keepAsDraft = parseSaveAsDraftFlag(saveAsDraft);

    const normalizedLines = normalizeLostLines(lines);
    const headerSourceLocationId = normalizedLines[0].locationId;

    const normalizedSuggestedAction = String(suggestedAction).trim().toUpperCase();
    assertResponsibleEmployeeOnCreate(normalizedSuggestedAction, responsibleEmployeeName);

    if (user && isScopeEngineEnabled('lost')) {
        const scope = await resolveScopeContext(user, tenantId, { assignmentOnly: true });
        for (const line of normalizedLines) {
            await assertLocationInScope(line.locationId, tenantId, scope, 'create');
        }
    }

    const locationIds = [...new Set(normalizedLines.map((l) => l.locationId))];
    const foundLocations = await prisma.location.findMany({
        where: { tenantId, id: { in: locationIds } },
    });
    if (foundLocations.length !== locationIds.length) {
        throw err('One or more line locations were not found.', 404);
    }

    const documentNo = await generateDocNumber(tenantId, 'LST', new Date());

    const firstStepAccountabilityType =
        typeof accountabilityType === 'string' && accountabilityType.trim()
            ? accountabilityType.trim()
            : typeof accountability === 'string' && accountability.trim()
                ? accountability.trim()
                : undefined;
    const effectiveDocumentDate = documentDate ? new Date(documentDate) : new Date();

    return prisma.$transaction(async (tx) => {
        await assertLinesHaveStockAtLocation(
            tx,
            tenantId,
            normalizedLines.map((line) => ({
                itemId: line.itemId,
                locationId: line.locationId,
                qty: line.qty,
            })),
            {
                requirePositiveOnHand: true,
                validateQtyAgainstOnHand: true,
            },
        );

        const doc = await tx.movementDocument.create({
            data: {
                tenantId,
                documentNo,
                movementType: 'LOST',
                sourceType: 'INTERNAL',
                status: 'DRAFT',
                sourceLocationId: legacySourceLocationId || headerSourceLocationId,
                reason: reason.trim(),
                notes: notes?.trim() || null,
                suggestedAction: normalizedSuggestedAction,
                responsibleEmployeeName:
                    typeof responsibleEmployeeName === 'string' && responsibleEmployeeName.trim()
                        ? responsibleEmployeeName.trim()
                        : null,
                documentDate: effectiveDocumentDate,
                createdBy: userId,
                lines: {
                    create: normalizedLines.map((line) => ({
                        itemId: line.itemId,
                        locationId: line.locationId,
                        qtyRequested: Number(line.qty),
                        qtyInBaseUnit: Number(line.qty),
                        unitCost: Number(line.unitCost || 0),
                        totalValue: Number(line.totalValue || 0),
                        notes: line.notes,
                    })),
                },
            },
        });

        if (!keepAsDraft) {
            await attachApprovalAndEnterPipeline(tx, {
                tenantId,
                documentId: doc.id,
                userId,
                userRole: user.role,
                requestType: 'LOST',
                firstStepAccountabilityType,
            });
        }

        return tx.movementDocument.findFirst({ where: { id: doc.id }, include: LOST_INCLUDE });
    });
};

const { enrichMovementLinesFinancials } = require('../utils/movementLineFinancial.util');

const getLostById = async (id, tenantId, user = null) => {
    let doc = await prisma.movementDocument.findFirst({
        where: { id, tenantId, movementType: 'LOST' },
        include: LOST_INCLUDE,
    });
    if (!doc) throw err('Lost document not found.', 404);
    if (user) {
        const scope = await resolveScopeContext(user, tenantId);
        await assertInScope(SCOPE_MODULE.LOST, doc, scope, 'read');
    }

    doc = (await healDraftStatusFromExistingApproval(doc, tenantId, 'BREAKAGE', LOST_INCLUDE)) || doc;

    const { buildBreakageLostWorkflowContext } = require('./breakageLostWorkflowContext.util');
    let chain = null;
    try {
        const approval = getApproval(doc);
        if (approval?.accWorkflowVersionId) {
            const { resolveWorkflowByVersionId } = require('./acc-workflow-runtime.service');
            chain = await resolveWorkflowByVersionId(approval.accWorkflowVersionId);
        } else {
            const { resolveWorkflowForDocument } = require('./acc-workflow-runtime.service');
            chain = await resolveWorkflowForDocument({ moduleKey: 'BREAKAGE', tenantId });
        }
    } catch {
        chain = null;
    }
    const payload = {
        ...doc,
        lines: await enrichMovementLinesFinancials(tenantId, doc.lines),
        approvalRequests: asApprovalRequestsArray(doc),
    };
    const workflow = buildBreakageLostWorkflowContext(payload, 'LOST', chain);
    const {
        buildBreakageSendBackTargets,
        buildBreakageCheckoutStockGate,
    } = require('./breakage.service');
    const approval = getApproval(payload);
    const sendBackTargets =
        approval && chain ? buildBreakageSendBackTargets(payload, approval, chain) : [];
    const checkoutStockGate = await buildBreakageCheckoutStockGate({ ...payload, tenantId });
    return withUserFacingState('LOST', {
        ...payload,
        workflow,
        sendBackTargets,
        checkoutStockGate,
    });
};

const postingEngine = require('./postingEngine.service');

const applyStockImpactOnFinalApproval = (tx, doc, userId) =>
    postingEngine.postLostMovementInTransaction(tx, doc, userId);

/**
 * Lost docs with an ApprovalRequest use {@link processLostApprovalStep} via POST /lost/:id/approve.
 * Legacy approve-dept/cost routes removed; docs without approvalRequest are backfilled on first approve.
 */
const approveLostAtLevel = async (id, tenantId, user, _expectedStatus, body = {}) =>
    processLostApprovalStep(
        id,
        tenantId,
        user,
        'APPROVE',
        body.comment,
        body.accountability,
        body.concurrencyVersion ?? null,
    );

/** ACC-pinned approval chain for LOST documents (same module family as breakage). */
const processLostApprovalStep = async (
    id,
    tenantId,
    user,
    action,
    comment,
    accountability,
    expectedVersion = null,
) => {
    const userId = user.id;
    await assertActiveAssignmentForMutation(user, tenantId, action === 'REJECT' ? 'reject' : 'approve');
    let doc = await getLostById(id, tenantId, user);

    if (doc.status === 'APPROVED')
        throw err('Document is already APPROVED and locked. No further actions allowed.');
    if (doc.status === 'VOID')
        throw err('Document has been voided.');
    if (doc.status === 'REJECTED')
        throw err('Rejected documents are read-only. Create a new document to repeat the operation (Ch.2.7).');
    assertConcurrencyVersion(expectedVersion, doc.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.LOST, entityId: id, changedBy: userId },
    });

    let approval = getApproval(doc);
    if (!approval) {
        await backfillMovementApprovalRequest(doc, tenantId, 'LOST');
        doc = await getLostById(id, tenantId, user);
        approval = getApproval(doc);
    }

    if (!approval) {
        throw err('This lost document has no approval request and could not be backfilled.', 404);
    }

    let chain = await resolveMovementWorkflowChain(approval, 'LOST', tenantId);

    if (String(doc.status || '').toUpperCase() === 'DRAFT') {
        const { status: promoteStatus, pendingStepNumber } = submitStatusFromApproval(
            chain,
            approval.steps || [],
        );
        await prisma.movementDocument.update({
            where: { id },
            data: { status: promoteStatus },
        });
        await prisma.approvalRequest.update({
            where: { id: approval.id },
            data: { currentStep: pendingStepNumber },
        });
        doc = await getLostById(id, tenantId, user);
        approval = getApproval(doc);
        if (!approval) {
            throw err('This lost document has no approval request and could not be backfilled.', 404);
        }
        chain = await resolveMovementWorkflowChain(approval, 'LOST', tenantId);
    }

    const currentStepNo = approval.currentStep;
    const step = approval.steps?.find((s) => s.stepNumber === currentStepNo) ?? null;

    const { assertMovementApprovalActionAllowed } = require('../platform/movementApprovalAction.guard');
    assertMovementApprovalActionAllowed({
        moduleKey: 'LOST',
        documentStatus: doc.status,
        approvalRequest: approval,
        action,
        currentStep: step,
    });

    const chainSteps = chain.steps || [];
    const chainMeta = chainSteps[currentStepNo - 1];

    if (!chainMeta && currentStepNo > chainSteps.length) {
        throw err('All approval steps already completed.');
    }

    if (!step) throw err(`Step ${currentStepNo} not found in approval chain.`, 404);

    const requiredRoleCode = step.requiredRole?.code ?? chainMeta?.roleCode;
    assertUserHasBreakageLostStepPermission(user, 'LOST', doc.status, requiredRoleCode);

    const prevSteps = approval.steps.filter((s) => s.stepNumber < currentStepNo);
    for (const ps of prevSteps) {
        if (ps.status !== 'APPROVED') throw err(`Step ${ps.stepNumber} must be approved first.`);
    }

    const now = new Date();
    const isFinalApproveAction = action === 'APPROVE' && currentStepNo === approval.totalSteps;

    if (action === 'APPROVE') {
        // Dept Manager onward: hard-block when stock cannot cover lines (Breakage twin).
        const { buildBreakageCheckoutStockGate } = require('./breakage.service');
        const stockGate = await buildBreakageCheckoutStockGate({ ...doc, tenantId });
        if (stockGate && !stockGate.ok) {
            const names = stockGate.blockers.map((b) => b.itemName).join(', ');
            throw err(`Insufficient stock to approve lost document. Review stock for: ${names}`, 422);
        }
    }

    if (isFinalApproveAction) {
        await checkPeriodLock(tenantId, doc.documentDate || doc.createdAt || now);
    }

    if (
        action === 'APPROVE'
        && typeof accountability === 'string'
        && GET_PASS_ACCOUNTABILITY.has(accountability)
    ) {
        assertEmployeeDeductionApprovalComment(action, accountability, comment);
    }

    return prisma.$transaction(async (tx) => {
        const stepUpdate = {
            status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
            actedBy: userId,
            actedAt: now,
            comment: comment?.trim() || null,
        };
        if (
            (doc.sourceType === 'GET_PASS_RETURN' || doc.sourceType === 'INTERNAL')
            && action === 'APPROVE'
            && typeof accountability === 'string'
            && GET_PASS_ACCOUNTABILITY.has(accountability)
        ) {
            stepUpdate.accountabilityType = accountability;
        }

        await tx.approvalStep.update({
            where: { id: step.id },
            data: stepUpdate,
        });

        if (action === 'REJECT') {
            await tx.approvalRequest.update({
                where: { id: approval.id },
                data: { status: 'REJECTED', resolvedAt: now },
            });
            await tx.movementDocument.update({
                where: { id },
                data: bumpConcurrencyUpdate({ status: 'REJECTED' }),
            });
        } else {
            const isLastStep = currentStepNo === approval.totalSteps;
            const nextStatus = documentStatusAfterApprovingStep(chain, currentStepNo);

            if (isLastStep) {
                await tx.approvalRequest.update({
                    where: { id: approval.id },
                    data: { status: 'APPROVED', currentStep: currentStepNo, resolvedAt: now },
                });

                const posting = await applyStockImpactOnFinalApproval(tx, doc, userId);

                await tx.movementDocument.update({
                    where: { id },
                    data: bumpConcurrencyUpdate({
                        status: 'POSTED',
                        postedAt: posting.postedAt,
                        postingDate: posting.postingDate,
                        assignedPostingPeriod: posting.assignedPostingPeriod,
                    }),
                });
            } else {
                await tx.approvalRequest.update({
                    where: { id: approval.id },
                    data: { currentStep: currentStepNo + 1 },
                });
                await tx.movementDocument.update({
                    where: { id },
                    data: bumpConcurrencyUpdate({ status: nextStatus }),
                });
            }
        }

        if (action === 'APPROVE') {
            const approveRoleCode = requiredRoleCode || chainMeta?.roleCode || '';
            await logAction({
                tenantId,
                entityType: EntityType.LOST,
                entityId: id,
                action: 'APPROVE',
                changedBy: userId,
                note: `LOST_APPROVE_STEP:${currentStepNo}:${approveRoleCode}`,
                beforeValue: { step: currentStepNo, status: doc.status },
                afterValue: { step: currentStepNo, roleCode: approveRoleCode },
                tx,
            });
        }

        return tx.movementDocument.findFirst({ where: { id }, include: LOST_INCLUDE });
    });
};

const lostStatusForPendingStep = (chain, targetStepNumber) => {
    if (targetStepNumber <= 0) return 'DRAFT';
    return documentStatusForPendingStep(chain, targetStepNumber);
};

const sendBackLostItem = async (id, tenantId, user, reason, expectedVersion = null, targetStepNumber = null) => {
    const trimmedReason = normalizeReason(reason);
    const userId = user.id;
    await assertActiveAssignmentForMutation(user, tenantId, 'send-back');
    let doc = await getLostById(id, tenantId, user);
    if (['APPROVED', 'VOID', 'REJECTED'].includes(String(doc.status || '').toUpperCase())) {
        throw err('Send Back is not allowed after terminal status.', 423);
    }
    assertConcurrencyVersion(expectedVersion, doc.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.LOST, entityId: id, changedBy: userId },
    });

    let approval = getApproval(doc);
    if (!approval) {
        await backfillMovementApprovalRequest(doc, tenantId, 'LOST');
        doc = await getLostById(id, tenantId, user);
        approval = getApproval(doc);
    }
    if (!approval) throw err('Approval record not found.', 404);

    const chain = await resolveMovementWorkflowChain(approval, 'LOST', tenantId);
    const currentStepNo = Number(approval.currentStep);
    const step = approval.steps?.find((s) => s.stepNumber === currentStepNo) ?? null;
    if (!step || String(step.status || '').toUpperCase() !== 'PENDING') {
        throw err('No pending approval step found.', 422);
    }
    const requiredRoleCode = step.requiredRole?.code ?? chain.steps?.[currentStepNo - 1]?.roleCode;
    assertUserHasBreakageLostStepPermission(user, 'LOST', doc.status, requiredRoleCode);

    const { buildBreakageSendBackTargets, syncBreakageApprovalRequestToDocumentInTx } = require('./breakage.service');
    const allowedTargets = buildBreakageSendBackTargets(doc, approval, chain);

    let targetStepNo;
    if (targetStepNumber == null || targetStepNumber === '') {
        targetStepNo = currentStepNo <= 1 ? 0 : currentStepNo - 1;
        if (targetStepNo === 1) targetStepNo = 0;
    } else {
        targetStepNo = Number(targetStepNumber);
        if (!Number.isInteger(targetStepNo) || !allowedTargets.some((t) => t.stepNumber === targetStepNo)) {
            throw err('Send Back target must be a prior workflow participant.', 422);
        }
    }

    const toCreator = targetStepNo === 0;
    const nextStatus = lostStatusForPendingStep(chain, targetStepNo);

    return prisma.$transaction(async (tx) => {
        const syncedApproval = await syncBreakageApprovalRequestToDocumentInTx(tx, approval, doc, chain);

        const updatePayload = bumpConcurrencyUpdate({
            status: nextStatus,
            ...(toCreator ? { notes: appendSendBackNotes(doc.notes, trimmedReason) } : {}),
        });
        const guarded = await tx.movementDocument.updateMany({
            where: { id, tenantId, movementType: 'LOST', status: doc.status },
            data: updatePayload,
        });
        if (guarded.count === 0) {
            throw err('Lost document changed while sending back.', 409);
        }
        await executeWorkflowSendBackInTx(tx, {
            approvalRequest: { ...syncedApproval, steps: approval.steps },
            sourceStepNumber: currentStepNo,
            forceTargetStepNumber: targetStepNo,
            reason: trimmedReason,
            userId,
            tenantId,
            entityType: EntityType.LOST,
            entityId: id,
            documentStatusBefore: doc.status,
            documentStatusAfter: nextStatus,
        });
        return tx.movementDocument.findFirst({ where: { id }, include: LOST_INCLUDE });
    });
};

const getEvidence = async (id, tenantId, user = null) => {
    const doc = await getLostById(id, tenantId, user);
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
    });

    const approval = getApproval(doc);
    const chainSteps = approval?.accWorkflowVersionId
        ? (await resolveWorkflowByVersionId(approval.accWorkflowVersionId)).steps || []
        : (await resolveWorkflowForDocument({ moduleKey: 'BREAKAGE', tenantId })).steps || [];
    const accChainDef = chainSteps.map((c) => ({
        step: c.stepOrder,
        role: c.roleCode,
        label: c.label,
    }));

    const legacyApprovalHistory = (approval?.steps || []).map((s) => ({
        stepNumber: s.stepNumber,
        step: s.stepNumber,
        role: s.requiredRole?.code ?? s.requiredRole,
        label: chainSteps.find((c) => c.stepOrder === s.stepNumber)?.label,
        status: s.status,
        actedBy: s.actedByUser
            ? `${s.actedByUser.firstName} ${s.actedByUser.lastName}`
            : null,
        actedByUserId: s.actedBy,
        actedAt: s.actedAt,
        comment: s.comment,
        accountabilityType: s.accountabilityType || null,
    }));

    const { buildApprovalTimelineRawEntries } = require('../platform/timeline/approvalTimeline.builder');
    const { buildTimelineEntries } = require('../platform/timeline/timelineEntry.merge');
    const {
        mapTimelineEntriesToPdfApprovalWorkflow,
        PDF_LIFECYCLE_TYPES,
    } = require('./evidence-pdf-approval-from-timeline.util');

    const auditEvents = await prisma.auditLog.findMany({
        where: { tenantId, entityType: 'LOST', entityId: id },
        orderBy: { changedAt: 'asc' },
        take: 200,
        include: { changedByUser: { select: { id: true, firstName: true, lastName: true } } },
    });
    const rawTimeline = buildApprovalTimelineRawEntries(approval, {
        auditEvents,
        documentStatus: doc.status,
        postedAt: null,
        includePosting: false,
        autoPosted: true,
    });
    const timelineEntries = buildTimelineEntries([rawTimeline]);
    const hasLifecycle = timelineEntries.some(
        (e) =>
            e.entryType === 'LIFECYCLE_EVENT' &&
            PDF_LIFECYCLE_TYPES.has(String(e.lifecycleEventType || '').toUpperCase()),
    );

    let approvalChainDefinition = accChainDef;
    let approvalHistory = legacyApprovalHistory;
    if (hasLifecycle) {
        const mapped = mapTimelineEntriesToPdfApprovalWorkflow(timelineEntries, {
            accChainDef,
            moduleKey: 'LOST',
            ensurePostingSlot: false,
            includeMilestones: false,
        });
        approvalChainDefinition = mapped.approvalChainDefinition.length
            ? mapped.approvalChainDefinition
            : accChainDef;
        approvalHistory = mapped.approvalHistory.map((h) => {
            const role = h.role;
            const status = String(h.status || '').toUpperCase();
            const matches = (approval?.steps || []).filter(
                (s) =>
                    (s.requiredRole?.code ?? s.requiredRole) === role &&
                    String(s.status || '').toUpperCase() === status,
            );
            // Prefer the latest acted step (post–Send Back / final cycle), not the first match.
            const match = matches.length
                ? matches.reduce((best, s) => {
                    const bt = best?.actedAt ? new Date(best.actedAt).getTime() : 0;
                    const st = s?.actedAt ? new Date(s.actedAt).getTime() : 0;
                    return st >= bt ? s : best;
                }, matches[0])
                : null;
            return {
                ...h,
                actedByUserId: match?.actedBy || null,
                accountabilityType: match?.accountabilityType || null,
                comment: match?.comment || h.comment || null,
            };
        });
    }

    const ledgerEntries = await prisma.inventoryLedger.findMany({
        where: { tenantId, referenceId: id },
        include: {
            item: { select: { id: true, name: true, barcode: true } },
            location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    const stockImpact = await Promise.all(
        doc.lines.map(async (line) => {
            const ledger = ledgerEntries.find((e) => e.itemId === line.itemId);
            const current = await prisma.stockBalance.findUnique({
                where: {
                    tenantId_itemId_locationId: {
                        tenantId,
                        itemId: line.itemId,
                        locationId: line.locationId,
                    },
                },
            });

            const qtyDeducted = parseFloat(line.qtyInBaseUnit);
            const wacUsed = ledger ? parseFloat(ledger.unitCost) : parseFloat(line.unitCost) || 0;
            const qtyAfter = current ? parseFloat(current.qtyOnHand) : null;
            const qtyBefore = qtyAfter !== null ? qtyAfter + qtyDeducted : null;
            const unitCost = wacUsed || parseFloat(line.unitCost) || 0;
            const totalLoss = unitCost > 0 ? qtyDeducted * unitCost : parseFloat(line.totalValue) || 0;

            return {
                itemId: line.item?.id,
                itemName: line.item?.name,
                barcode: line.item?.barcode,
                locationId: line.location?.id,
                locationName: line.location?.name,
                qtyBefore,
                qtyDeducted,
                qtyAfter,
                wacAtPosting: unitCost || null,
                totalLoss,
            };
        }),
    );

    const totalLossValue = stockImpact.reduce((s, i) => s + (i.totalLoss || 0), 0);

    return {
        packMeta: {
            packTitle: 'LOST ITEMS REPORT',
            packTitleShort: 'Lost Items Report',
            packSubtitle: 'Lost items, approvals, stock impact, and audit trail',
            reportBasis: 'Lost items operational report and approval trail',
            itemsSectionTitle: 'Lost Items',
            totalLossLabel: 'TOTAL LOSS',
            primaryPhotoCaption: 'Primary lost-items photo',
        },
        header: {
            tenantName: tenant?.name || 'DX OSE',
            documentNo: doc.documentNo,
            status: doc.status,
            reason: doc.reason,
            notes: formatStructuredMovementNotes(doc.notes) ?? doc.notes,
            documentDate: doc.documentDate,
            department:
                (doc.department && String(doc.department).trim())
                || doc.lines?.[0]?.location?.department?.name
                || null,
            suggestedAction: doc.suggestedAction || null,
            responsibleEmployeeName: doc.responsibleEmployeeName || null,
            createdBy: doc.createdByUser
                ? `${doc.createdByUser.firstName} ${doc.createdByUser.lastName}`
                : null,
            preparedBy: doc.createdByUser
                ? `${doc.createdByUser.firstName} ${doc.createdByUser.lastName}`
                : null,
            createdByRole: null,
            createdByEmail: doc.createdByUser?.email,
            createdAt: doc.createdAt,
            submittedAt: doc.updatedAt,
            postedAt: doc.postedAt,
            sourceLocation: doc.sourceLocationId,
        },
        lineItems: doc.lines.map((l) => ({
            itemId: l.item?.id,
            itemName: l.item?.name,
            barcode: l.item?.barcode,
            qty: parseFloat(l.qtyInBaseUnit),
            unitCost: parseFloat(l.unitCost) || 0,
            lineValue: parseFloat(l.totalValue) || 0,
            notes: formatStructuredMovementNotes(l.notes) ?? l.notes,
        })),
        approvalChainDefinition,
        approvalHistory,
        approvalSummary: {
            currentStep: approval?.currentStep,
            totalSteps: approval?.totalSteps,
            overallStatus: approval?.status,
        },
        attachments: [],
        photoEvidence: {
            photoUrl: null,
            photoKey: null,
        },
        ledgerEntries: ledgerEntries.map((e) => ({
            id: e.id,
            itemName: e.item?.name,
            locationName: e.location?.name,
            movementType: e.movementType,
            qtyOut: parseFloat(e.qtyOut),
            unitCost: parseFloat(e.unitCost),
            totalValue: parseFloat(e.totalValue),
            createdAt: e.createdAt,
            referenceNo: e.referenceNo,
        })),
        stockImpactSummary: {
            perItem: stockImpact,
            totalLossValue: parseFloat(totalLossValue.toFixed(4)),
            currency: await getDisplayCurrency(tenantId),
        },
        generatedAt: new Date().toISOString(),
    };
};

// ── SUBMIT FOR APPROVAL (draft → ACC pipeline) ────────────────────────────────
const submitLost = async (id, tenantId, user, expectedVersion = null) => {
    const userId = user.id;
    await assertActiveAssignmentForMutation(user, tenantId, 'submit');
    const doc = await getLostById(id, tenantId, user);
    const { assertDocumentEditableByLifecycle } = require('../platform/lifecyclePresentation.service');
    assertDocumentEditableByLifecycle('LOST', doc.status, { notes: doc.notes });

    if (doc.status !== 'DRAFT') throw err(`Cannot submit document in ${doc.status} status.`);
    if (!doc.lines?.length) throw err('Cannot submit empty document.');
    assertConcurrencyVersion(expectedVersion, doc.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.LOST, entityId: id, changedBy: userId },
    });

    return prisma.$transaction(async (tx) => {
        let approval = getApproval(doc);
        if (!approval) {
            await attachApprovalAndEnterPipeline(tx, {
                tenantId,
                documentId: id,
                userId,
                userRole: user.role,
                requestType: 'LOST',
            });
            return tx.movementDocument.findFirst({ where: { id }, include: LOST_INCLUDE });
        }

        const chain = await resolveMovementWorkflowChain(approval, 'LOST', tenantId);

        if (Number(approval.currentStep) === 0) {
            if (doc.createdBy !== userId) {
                throw err('Only the document creator may resubmit after Send Back.', 403);
            }

            const firstRole = normalizeRole(chain.roleCodes?.[0] || chain.steps?.[0]?.roleCode);
            const submitterRole = normalizeRole(user.role);
            const preApproveFirst =
                Boolean(firstRole) && Boolean(submitterRole) && firstRole === submitterRole;

            let enterStatus = documentStatusForPendingStep(chain, 1);
            let pendingStepNumber = 1;

            await executeCreatorResubmitInTx(tx, {
                approvalRequest: approval,
                userId,
                tenantId,
                entityType: EntityType.LOST,
                entityId: id,
                documentStatusBefore: doc.status,
                documentStatusAfter: enterStatus,
                resubmitNotePrefix: 'LOST_RESUBMIT',
            });

            if (preApproveFirst) {
                const step1 = (approval.steps || []).find((s) => Number(s.stepNumber) === 1);
                const roleCode = step1?.requiredRole?.code || firstRole || '';
                if (step1) {
                    await tx.approvalStep.update({
                        where: { id: step1.id },
                        data: {
                            status: 'APPROVED',
                            actedByUser: { connect: { id: userId } },
                            actedAt: new Date(),
                        },
                    });
                }
                pendingStepNumber = Math.min(2, Number(approval.totalSteps) || 2);
                enterStatus = documentStatusForPendingStep(chain, pendingStepNumber);
                await tx.approvalRequest.update({
                    where: { id: approval.id },
                    data: { currentStep: pendingStepNumber, status: 'PENDING', resolvedAt: null },
                });
                await logAction({
                    tenantId,
                    entityType: EntityType.LOST,
                    entityId: id,
                    action: 'APPROVE',
                    changedBy: userId,
                    note: `LOST_APPROVE_STEP:1:${roleCode}`,
                    beforeValue: { step: 1, status: doc.status },
                    afterValue: { step: 1, roleCode, preApprove: true, resubmit: true },
                    tx,
                });
            }

            await tx.movementDocument.update({
                where: { id },
                data: bumpConcurrencyUpdate({
                    status: enterStatus,
                    notes: stripSendBackNotes(doc.notes),
                }),
            });

            if (!approval.accWorkflowVersionId && chain.versionId) {
                await tx.approvalRequest.update({
                    where: { id: approval.id },
                    data: { accWorkflowVersionId: chain.versionId },
                });
            }

            return tx.movementDocument.findFirst({ where: { id }, include: LOST_INCLUDE });
        }

        const { status: submitStatus, pendingStepNumber } = submitStatusFromApproval(
            chain,
            approval.steps || [],
        );

        const updateData = bumpConcurrencyUpdate({ status: submitStatus });
        if (!approval.accWorkflowVersionId && chain.versionId) {
            await tx.approvalRequest.update({
                where: { id: approval.id },
                data: { accWorkflowVersionId: chain.versionId },
            });
        }

        await tx.movementDocument.update({
            where: { id },
            data: updateData,
        });

        await tx.approvalRequest.update({
            where: { id: approval.id },
            data: { currentStep: pendingStepNumber },
        });

        await logAction({
            tenantId,
            entityType: EntityType.LOST,
            entityId: id,
            action: 'SUBMIT',
            changedBy: userId,
            tx,
        });

        return tx.movementDocument.findFirst({ where: { id }, include: LOST_INCLUDE });
    });
};

/**
 * When DRAFT update replaces all lines, keep prior line photos for matching item+location.
 */
const buildLineMediaQueue = (lines = []) => {
    const map = new Map();
    for (const line of lines) {
        if (!line?.itemId || !line?.locationId) continue;
        const key = `${line.itemId}|${line.locationId}`;
        const bucket = map.get(key) || [];
        bucket.push({
            photoKey: line.photoKey || null,
            attachmentUrl: line.attachmentUrl || null,
        });
        map.set(key, bucket);
    }
    return map;
};

const takeQueuedLineMedia = (queue, itemId, locationId) => {
    const key = `${itemId}|${locationId}`;
    const bucket = queue.get(key);
    if (!bucket?.length) return { photoKey: null, attachmentUrl: null };
    return bucket.shift() || { photoKey: null, attachmentUrl: null };
};

/**
 * Update a DRAFT lost document (header + lines). Creator-only.
 * Allowed when status is DRAFT (including Returned via [Send Back] notes).
 */
const updateLost = async (id, tenantId, user, data, expectedVersion = null) => {
    const userId = user.id;
    const { isMovementCreateActorRole } = require('./breakageLostWorkflowContext.util');
    if (!isMovementCreateActorRole(user.role)) {
        throw err('Only Department Manager or Storekeeper may update lost documents.', 403);
    }
    await assertActiveAssignmentForMutation(user, tenantId, 'update');

    const doc = await getLostById(id, tenantId, user);
    const status = String(doc.status || '').toUpperCase();
    if (status !== 'DRAFT') {
        throw err(`Cannot update a lost document in ${doc.status} status. Only DRAFT documents can be edited.`, 422);
    }
    if (doc.createdBy !== userId) {
        throw err('Only the creator can edit a lost document.', 403);
    }

    assertConcurrencyVersion(expectedVersion, doc.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.LOST, entityId: id, changedBy: userId },
    });

    const {
        lines = [],
        reason,
        notes,
        documentDate,
        suggestedAction,
        responsibleEmployeeName,
    } = data;

    if (!reason?.trim()) throw err('Reason is required.');
    if (!Array.isArray(lines) || lines.length === 0) throw err('At least one line is required.');
    if (suggestedAction && !SUGGESTED_ACTIONS.has(String(suggestedAction).trim().toUpperCase())) {
        throw err('Suggested action must be EMPLOYEE or HOTEL.');
    }

    const normalizedLines = normalizeLostLines(lines);
    const headerSourceLocationId = normalizedLines[0].locationId;
    const normalizedSuggestedAction = suggestedAction
        ? String(suggestedAction).trim().toUpperCase()
        : doc.suggestedAction;
    if (normalizedSuggestedAction === 'EMPLOYEE') {
        assertResponsibleEmployeeOnCreate(
            'EMPLOYEE',
            responsibleEmployeeName !== undefined
                ? responsibleEmployeeName
                : doc.responsibleEmployeeName,
        );
    }

    return prisma.$transaction(async (tx) => {
        await assertLinesHaveStockAtLocation(
            tx,
            tenantId,
            normalizedLines.map((l) => ({ itemId: l.itemId, locationId: l.locationId, qty: l.qty })),
            { requirePositiveOnHand: true, validateQtyAgainstOnHand: true },
        );

        const priorLineMedia = buildLineMediaQueue(doc.lines || []);

        await tx.movementLine.deleteMany({ where: { documentId: id } });

        await tx.movementDocument.update({
            where: { id },
            data: bumpConcurrencyUpdate({
                reason: reason.trim(),
                notes: notes?.trim() || null,
                sourceLocationId: headerSourceLocationId,
                ...(documentDate ? { documentDate: new Date(documentDate) } : {}),
                ...(suggestedAction
                    ? { suggestedAction: String(suggestedAction).trim().toUpperCase() }
                    : {}),
                ...(responsibleEmployeeName !== undefined
                    ? {
                          responsibleEmployeeName:
                              typeof responsibleEmployeeName === 'string' &&
                              responsibleEmployeeName.trim()
                                  ? responsibleEmployeeName.trim()
                                  : null,
                      }
                    : {}),
                lines: {
                    create: normalizedLines.map((l) => {
                        const media = takeQueuedLineMedia(priorLineMedia, l.itemId, l.locationId);
                        return {
                            itemId: l.itemId,
                            locationId: l.locationId,
                            qtyRequested: parseFloat(l.qty),
                            qtyInBaseUnit: parseFloat(l.qty),
                            unitCost: parseFloat(l.unitCost) || 0,
                            totalValue: parseFloat(l.totalValue) || 0,
                            notes: l.notes || null,
                            photoKey: media.photoKey,
                            attachmentUrl: media.attachmentUrl,
                        };
                    }),
                },
            }),
        });

        await logAction({
            tenantId,
            entityType: EntityType.LOST,
            entityId: id,
            action: 'UPDATE',
            changedBy: userId,
            afterValue: { reason: reason.trim(), lineCount: normalizedLines.length },
            tx,
        });

        return tx.movementDocument.findFirst({ where: { id }, include: LOST_INCLUDE });
    });
};

/**
 * Creator-reject for Returned (DRAFT + [Send Back] notes) lost documents.
 * Approver rejection falls through to processLostApprovalStep.
 */
const rejectLost = async (id, tenantId, user, comment, expectedVersion = null) => {
    const userId = user.id;
    if (!comment?.trim()) throw err('Rejection comment is required.', 400);

    const doc = await getLostById(id, tenantId, user);
    const { isSendBackReturned: isSBR } = require('../platform/lifecyclePresentation.service');
    const isReturned = isSBR(doc.status, doc.notes);

    if (isReturned && String(doc.status || '').toUpperCase() === 'DRAFT') {
        if (doc.createdBy !== userId) {
            throw err('Only the document creator can reject a returned document.', 403);
        }
        await assertActiveAssignmentForMutation(user, tenantId, 'reject');
        assertConcurrencyVersion(expectedVersion, doc.concurrencyVersion, {
            required: true,
            audit: { tenantId, entityType: EntityType.LOST, entityId: id, changedBy: userId },
        });
        await prisma.movementDocument.updateMany({
            where: { id, tenantId, movementType: 'LOST' },
            data: bumpConcurrencyUpdate({ status: 'REJECTED' }),
        });
        await logAction({
            tenantId,
            entityType: EntityType.LOST,
            entityId: id,
            action: 'REJECT',
            changedBy: userId,
            note: `Creator rejected returned lost: ${comment.trim()}`,
            beforeValue: { status: doc.status },
            afterValue: { status: 'REJECTED' },
        });
        return prisma.movementDocument.findFirst({ where: { id }, include: LOST_INCLUDE });
    }

    return processLostApprovalStep(id, tenantId, user, 'REJECT', comment, undefined, expectedVersion);
};

module.exports = {
    listLostItems,
    createLost,
    getLostById,
    submitLost,
    approveLostAtLevel,
    processLostApprovalStep,
    sendBackLostItem,
    updateLost,
    rejectLost,
    getEvidence,
};
