'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const emailService = require('./email.service');
const postingEngine = require('./postingEngine.service');
const { logAction, EntityType } = require('./auditTrail.service');
const logger = require('../utils/logger');
const { logGovernedEvent } = require('./auditGoverned.service');
const {
    createStoreTransferApprovalRequest,
    processStoreTransferApproval,
    transferStatusForActiveStep,
} = require('./approvalChain.service');
const {
    executeWorkflowSendBackInTx,
    executeCreatorResubmitInTx,
    normalizeReason,
} = require('../platform/workflowSendBack.service');
const { appendSendBackNotes, isSendBackReturned } = require('../platform/lifecyclePresentation.service');
const { assertUserHasTransferStepPermission } = require('../acc-authority/step-permission-enforcement');
const { normalizeRole } = require('./rbac.service');
const { resolveWorkflowForDocument } = require('./acc-workflow-runtime.service');
const { userDisplayName } = require('../utils/timeline-present.util');
const {
    AWAITING_POSTING_BUCKET,
    PENDING_REVIEW_BUCKET,
    awaitingPostingListWhere,
    pendingReviewListWhere,
    mapTransferDetailResponse,
    mapTransferListRow,
    TRANSFER_LIST_STATUSES,
} = require('./transferWorkflow.util');

const ALLOWED_TRANSFER_WORKFLOW_BUCKETS = new Set([
    AWAITING_POSTING_BUCKET,
    PENDING_REVIEW_BUCKET,
]);
const { assertIntegerQuantity } = require('./integerQuantityGuard.service');
const {
    resolveScopeContext,
    scopeWhereFor,
    metaFor,
    assertInScope,
    assertLocationInScope,
    SCOPE_MODULE,
} = require('./scope/scopeContext');
const { assertConcurrencyVersion, bumpConcurrencyUpdate } = require('../platform/concurrency.service');

/** Destination may be outside the requester's department; must exist and be active in tenant. */
const assertTransferDestinationActive = async (destLocationId, tenantId) => {
    const loc = await prisma.location.findFirst({
        where: { id: destLocationId, tenantId, isActive: true },
        select: { id: true },
    });
    if (!loc) {
        throw Object.assign(new Error('Destination location not found or inactive'), { status: 400 });
    }
};

const TERMINAL_STATUSES = ['POSTED', 'REJECTED'];
const PENDING_APPROVAL_STATUSES = ['PENDING_DEPT', 'PENDING_FINANCE'];

// ─── Auto-number ──────────────────────────────────────────────────────────────

const { generateDocNumber, DocPrefix } = require('./docNumbering.service');

const generateTransferNo = async (tenantId, transferDate = new Date()) => {
    return generateDocNumber(tenantId, DocPrefix.TRANSFER, transferDate);
};

// ─── Guards ───────────────────────────────────────────────────────────────────

const findTransfer = async (id, tenantId, user = null) => {
    const trf = await prisma.storeTransfer.findFirst({
        where: { id, tenantId },
        include: {
            lines: {
                include: {
                    item: { select: { name: true, barcode: true } },
                },
            },
            sourceLocation: { select: { name: true, departmentId: true } },
            destLocation: { select: { name: true, departmentId: true } },
            requestedByUser: { select: { firstName: true, lastName: true } },
            approvalRequest: {
                include: {
                    steps: {
                        orderBy: { stepNumber: 'asc' },
                        include: {
                            requiredRole: { select: { code: true, name: true } },
                            actedByUser: { select: { firstName: true, lastName: true } },
                        },
                    },
                },
            },
        },
    });
    if (!trf) throw Object.assign(new Error('Transfer not found'), { status: 404 });
    if (user) {
        const scope = await resolveScopeContext(user, tenantId);
        await assertInScope(SCOPE_MODULE.TRANSFER, trf, scope, 'read');
    }
    return trf;
};

const assertStatus = (trf, ...allowed) => {
    if (!allowed.includes(trf.status))
        throw Object.assign(
            new Error(`Transfer must be in ${allowed.join(' or ')} status, currently ${trf.status}`),
            { status: 422 },
        );
};

const { assertLinesHaveStockAtLocation } = require('./location-item-resolution.service');

/** Ensure each line has StockBalance at source and sufficient on-hand qty. */
const assertTransferLinesAtSource = async (tenantId, sourceLocationId, lines) => {
    if (!lines?.length) {
        throw Object.assign(new Error('At least one line is required'), { status: 400 });
    }
    for (const l of lines) {
        assertIntegerQuantity({
            qty: l.requestedQty,
            field: 'requestedQty',
            message: 'Quantity must be a whole number (integer). Fractional quantities are not allowed.',
            details: { itemId: l.itemId, requestedQty: Number(l.requestedQty) },
        });
    }
    const normalized = lines.map((l) => ({
        itemId: l.itemId,
        locationId: sourceLocationId,
        qty: l.requestedQty,
        requestedQty: l.requestedQty,
    }));
    await assertLinesHaveStockAtLocation(prisma, tenantId, normalized, {
        defaultLocationId: sourceLocationId,
        requirePositiveOnHand: true,
        validateQtyAgainstOnHand: true,
    });
};

/**
 * Send Back targets: Creator (step 0) + prior participants.
 * Skip STEP rows acted by the document creator (covered by Creator target).
 */
const buildTransferSendBackTargets = (trf, approval) => {
    if (!trf || !approval) return [];
    const currentStepNo = Number(approval.currentStep);
    if (currentStepNo <= 0) return [];

    const creatorId = trf.requestedBy || null;
    const targets = [
        {
            stepNumber: 0,
            targetType: 'CREATOR',
            roleCode: null,
            actorName: userDisplayName(trf.requestedByUser) || null,
        },
    ];

    const steps = Array.isArray(approval.steps)
        ? [...approval.steps].sort((a, b) => a.stepNumber - b.stepNumber)
        : [];

    for (const st of steps) {
        if (st.stepNumber >= currentStepNo) break;
        const actedById = st.actedBy || st.actedByUser?.id || null;
        if (creatorId && actedById && String(actedById) === String(creatorId)) {
            continue;
        }
        const roleCode = st.requiredRole?.code || st.requiredRole || null;
        targets.push({
            stepNumber: st.stepNumber,
            targetType: 'STEP',
            roleCode,
            actorName: userDisplayName(st.actedByUser) || null,
        });
    }

    return targets;
};

/**
 * Stock gate from Dept Manager (step 1) through final Finance post.
 * Source location is the transfer header location.
 */
const buildTransferCheckoutStockGate = async (trf) => {
    const approval = trf?.approvalRequest;
    if (!approval) return null;
    const current = Number(approval.currentStep);
    const total = Number(approval.totalSteps);
    if (!Number.isFinite(current) || current < 1) return null;
    if (!Number.isFinite(total) || current > total) return null;
    const status = String(trf.status || '').toUpperCase();
    if (status === 'POSTED' || status === 'REJECTED') return null;
    if (!PENDING_APPROVAL_STATUSES.includes(status)) return null;

    const sourceLocationId = trf.sourceLocationId;
    const lines = trf.lines || [];
    if (!sourceLocationId || !lines.length) return { ok: true, blockers: [] };

    const neededByItem = new Map();
    for (const line of lines) {
        const itemId = line.itemId;
        if (!itemId) continue;
        neededByItem.set(itemId, (neededByItem.get(itemId) || 0) + Number(line.requestedQty || 0));
    }

    const blockers = [];
    const tenantId = trf.tenantId;
    for (const [itemId, requested] of neededByItem.entries()) {
        const stock = await prisma.stockBalance.findUnique({
            where: {
                tenantId_itemId_locationId: { tenantId, itemId, locationId: sourceLocationId },
            },
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

const assertLocked = (trf) => {
    if (trf.status !== 'DRAFT') {
        const message =
            trf.status === 'REJECTED'
                ? 'Rejected transfers are read-only. Create a new transfer to repeat the operation (Ch.2.7).'
                : `Transfer is locked (status: ${trf.status}) and cannot be modified`;
        throw Object.assign(new Error(message), { status: 423 });
    }
};

const transferIncludeCore = {
    sourceLocation: { select: { name: true } },
    destLocation: { select: { name: true } },
    requestedByUser: { select: { firstName: true, lastName: true } },
    approvedByUser: { select: { firstName: true, lastName: true } },
    receivedByUser: { select: { firstName: true, lastName: true } },
    rejectedByUser: { select: { firstName: true, lastName: true } },
    lines: {
        include: {
            item: { select: { name: true, barcode: true } },
            uom: { select: { abbreviation: true } },
        },
    },
    approvalRequest: {
        include: {
            steps: {
                orderBy: { stepNumber: 'asc' },
                include: {
                    requiredRole: { select: { code: true, name: true } },
                    actedByUser: { select: { firstName: true, lastName: true } },
                },
            },
        },
    },
};

/** Full detail include (requires postedBy/postedAt migration). */
const transferInclude = {
    ...transferIncludeCore,
    postedByUser: { select: { firstName: true, lastName: true } },
};

/** Fallback when postedBy columns are not yet migrated. */
const transferIncludeWithoutPostedBy = { ...transferIncludeCore };

/** Last-resort detail load (lines without item/uom joins). */
const transferIncludeMinimal = {
    sourceLocation: { select: { name: true } },
    destLocation: { select: { name: true } },
    requestedByUser: { select: { firstName: true, lastName: true } },
    approvedByUser: { select: { firstName: true, lastName: true } },
    receivedByUser: { select: { firstName: true, lastName: true } },
    rejectedByUser: { select: { firstName: true, lastName: true } },
    lines: true,
    approvalRequest: {
        include: {
            steps: {
                orderBy: { stepNumber: 'asc' },
                include: { requiredRole: { select: { code: true, name: true } } },
            },
        },
    },
};

// ─── CRUD ─────────────────────────────────────────────────────────────────────

const createTransfer = async ({
    tenantId,
    userId,
    user = null,
    sourceLocationId,
    destLocationId,
    transferDate,
    requiredBy,
    reason,
    notes,
    lines = [],
    /**
     * Create always enters the approval pipeline (PENDING_DEPT / PENDING_FINANCE).
     * Opt out only for rare governance/test paths that still need a DRAFT row.
     * Accepts legacy aliases: submitImmediately=false | keepAsDraft=true.
     */
    submitImmediately = true,
    keepAsDraft = false,
}) => {
    if (user) {
        const { isTransferCreateActorRole } = require('./transferWorkflowContext.util');
        if (!isTransferCreateActorRole(user.role)) {
            throw Object.assign(
                new Error(
                    'Only Department Manager or Storekeeper (or Org/Super governance) may create transfers.',
                ),
                { status: 403 },
            );
        }
    }
    if (!sourceLocationId) throw Object.assign(new Error('sourceLocationId is required'), { status: 400 });
    if (!destLocationId) throw Object.assign(new Error('destLocationId is required'), { status: 400 });
    if (sourceLocationId === destLocationId)
        throw Object.assign(new Error('Source and destination must be different locations'), { status: 400 });
    if (lines.length === 0) throw Object.assign(new Error('At least one line is required'), { status: 400 });

    // Approval-path validation: every line must be complete before workflow entry.
    for (const [idx, l] of lines.entries()) {
        if (!l?.itemId) {
            throw Object.assign(new Error(`lines[${idx}].itemId is required`), { status: 400 });
        }
        if (!l?.uomId) {
            throw Object.assign(new Error(`lines[${idx}].uomId is required`), { status: 400 });
        }
        if (l.requestedQty == null || l.requestedQty === '') {
            throw Object.assign(new Error(`lines[${idx}].requestedQty is required`), { status: 400 });
        }
    }

    if (user) {
        const scope = await resolveScopeContext(user, tenantId);
        await assertLocationInScope(sourceLocationId, tenantId, scope, 'create');
    }
    await assertTransferDestinationActive(destLocationId, tenantId);

    await assertTransferLinesAtSource(tenantId, sourceLocationId, lines);

    const transferNo = await generateTransferNo(tenantId);

    const created = await prisma.storeTransfer.create({
        data: {
            tenantId,
            transferNo,
            sourceLocationId,
            destLocationId,
            requestedBy: userId,
            transferDate: transferDate ? new Date(transferDate) : new Date(),
            requiredBy: requiredBy ? new Date(requiredBy) : null,
            reason,
            notes,
            lines: {
                create: lines.map((l) => ({
                    itemId: l.itemId,
                    uomId: l.uomId,
                    requestedQty: l.requestedQty,
                    notes: l.notes,
                })),
            },
        },
        include: { lines: true },
    });

    await logAction({
        tenantId,
        entityType: EntityType.TRANSFER,
        entityId: created.id,
        action: 'CREATE',
        changedBy: userId,
        note: `STORE_TRANSFER_CREATE transferNo=${created.transferNo}`,
        afterValue: { transferNo: created.transferNo, status: created.status },
    });

    const optOutSubmit =
        keepAsDraft === true ||
        keepAsDraft === 'true' ||
        keepAsDraft === 1 ||
        keepAsDraft === '1' ||
        submitImmediately === false ||
        submitImmediately === 'false' ||
        submitImmediately === 0 ||
        submitImmediately === '0';

    if (optOutSubmit) {
        return created;
    }

    if (!user) {
        throw Object.assign(
            new Error('Creating a transfer for approval requires an authenticated user.'),
            { status: 400 },
        );
    }
    try {
        // Enter PENDING_DEPT / PENDING_FINANCE in the same request — no DRAFT landing state.
        return await submitTransfer(created.id, tenantId, user, created.concurrencyVersion ?? 0);
    } catch (submitErr) {
        // All-or-nothing: remove orphan DRAFT if workflow entry fails.
        await prisma.storeTransfer
            .delete({ where: { id: created.id, tenantId } })
            .catch(() => {});
        throw submitErr;
    }
};

const updateTransfer = async (id, tenantId, { sourceLocationId, destLocationId, requiredBy, reason, notes, lines, concurrencyVersion, postingDate, assignedPostingPeriod }, user = null, expectedVersion = null) => {
    const trf = await findTransfer(id, tenantId, user);
    if (user && trf.status === 'DRAFT') {
        const { assertDraftEditable } = require('../platform/draftGovernance.service');
        await assertDraftEditable({ doc: trf, family: 'transfer', user });
    }
    const { assertPostingPeriodFieldsImmutable } = require('../platform/postingPeriod.util');
    assertPostingPeriodFieldsImmutable(trf, { postingDate, assignedPostingPeriod });
    const { assertDocumentEditableByLifecycle } = require('../platform/lifecyclePresentation.service');
    assertDocumentEditableByLifecycle('TRANSFER', trf.status, { notes: trf.notes });
    assertLocked(trf);
    assertStatus(trf, 'DRAFT');
    assertConcurrencyVersion(
        expectedVersion ?? concurrencyVersion,
        trf.concurrencyVersion,
        { required: true, audit: { tenantId, entityType: EntityType.TRANSFER, entityId: id, changedBy: user?.id ?? trf.requestedBy } },
    );

    const effectiveSource = sourceLocationId ?? trf.sourceLocationId;
    if (lines?.length) {
        await assertTransferLinesAtSource(tenantId, effectiveSource, lines);
    }

    return prisma.$transaction(async (tx) => {
        await tx.storeTransfer.update({
            where: { id, tenantId },
            data: bumpConcurrencyUpdate({
                sourceLocationId,
                destLocationId,
                requiredBy: requiredBy ? new Date(requiredBy) : undefined,
                reason,
                notes,
                updatedAt: new Date(),
            }),
        });
        if (lines) {
            await tx.storeTransferLine.deleteMany({ where: { transferId: id } });
            if (lines.length === 0) throw Object.assign(new Error('At least one line is required'), { status: 400 });
            await tx.storeTransferLine.createMany({
                data: lines.map((l) => ({
                    transferId: id,
                    itemId: l.itemId,
                    uomId: l.uomId,
                    requestedQty: l.requestedQty,
                    notes: l.notes,
                })),
            });
        }
        return tx.storeTransfer.findFirst({ where: { id, tenantId }, include: { lines: true } });
    });
};

const deleteTransfer = async (id, tenantId, user = null, expectedVersion = null) => {
    const trf = await findTransfer(id, tenantId, user);
    assertStatus(trf, 'DRAFT');
    assertConcurrencyVersion(expectedVersion, trf.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.TRANSFER, entityId: id, changedBy: user?.id ?? trf.requestedBy },
    });
    await prisma.storeTransfer.delete({ where: { id, tenantId } });
};

// ─── State Machine ────────────────────────────────────────────────────────────

const submitTransfer = async (id, tenantId, user, expectedVersion = null) => {
    const userId = user.id;
    const trf = await prisma.storeTransfer.findFirst({
        where: { id, tenantId },
        include: transferInclude,
    });
    if (!trf) throw Object.assign(new Error('Transfer not found'), { status: 404 });
    if (user) {
        const scope = await resolveScopeContext(user, tenantId);
        await assertInScope(SCOPE_MODULE.TRANSFER, trf, scope, 'read');
    }
    assertStatus(trf, 'DRAFT');
    assertConcurrencyVersion(expectedVersion, trf.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.TRANSFER, entityId: id, changedBy: userId },
    });

    if (trf.approvalRequest && Number(trf.approvalRequest.currentStep) === 0) {
        if (trf.requestedBy !== userId) {
            throw Object.assign(new Error('Only the document creator may resubmit after Send Back.'), { status: 403 });
        }
        const chain = await resolveWorkflowForDocument({ moduleKey: 'TRANSFER', tenantId });
        const firstRole = normalizeRole(chain.roleCodes?.[0]);
        const submitterRole = normalizeRole(user.role);
        const preApproveFirst =
            Boolean(firstRole) && Boolean(submitterRole) && firstRole === submitterRole;
        const enterStatus = preApproveFirst ? 'PENDING_FINANCE' : 'PENDING_DEPT';

        await prisma.$transaction(async (tx) => {
            await executeCreatorResubmitInTx(tx, {
                approvalRequest: trf.approvalRequest,
                userId,
                tenantId,
                entityType: EntityType.TRANSFER,
                entityId: id,
                documentStatusBefore: trf.status,
                documentStatusAfter: enterStatus,
                resubmitNotePrefix: 'STORE_TRANSFER_RESUBMIT',
            });
            if (preApproveFirst) {
                const step1 = trf.approvalRequest.steps?.find((s) => Number(s.stepNumber) === 1);
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
                await tx.approvalRequest.update({
                    where: { id: trf.approvalRequest.id },
                    data: { currentStep: 2, status: 'PENDING' },
                });
            }
            await tx.storeTransfer.update({
                where: { id, tenantId },
                data: bumpConcurrencyUpdate({ status: enterStatus, updatedAt: new Date() }),
            });
        });
        return getTransfer(id, tenantId, user);
    }

    let enterStatus = 'PENDING_DEPT';
    const updatedTrf = await prisma.$transaction(async (tx) => {
        const created = await createStoreTransferApprovalRequest(tx, {
            tenantId,
            transferId: id,
            createdBy: userId,
            userRole: user.role,
        });
        enterStatus = created.enterStatus;
        await tx.storeTransfer.update({
            where: { id, tenantId },
            data: bumpConcurrencyUpdate({ status: enterStatus, updatedAt: new Date() }),
        });
        return tx.storeTransfer.findFirst({
            where: { id, tenantId },
            include: {
                lines: true,
                sourceLocation: { select: { name: true } },
                destLocation: { select: { name: true } },
            },
        });
    });

    try {
        const notifyRole = enterStatus === 'PENDING_FINANCE' ? 'FINANCE_MANAGER' : 'DEPT_MANAGER';
        const approvers = await prisma.tenantMember.findMany({
            where: {
                tenantId,
                role: { code: { in: [notifyRole] } },
                isActive: true,
                user: { isActive: true },
            },
            select: { user: { select: { email: true } } },
        });
        const submitter = await prisma.user.findUnique({ where: { id: trf.requestedBy } });

        const pseudoApproval = {
            type: 'TRANSFER',
            createdAt: updatedTrf.createdAt,
            notes: `Transfer Number: ${updatedTrf.transferNo}`,
        };
        for (const app of approvers) {
            await emailService.sendApprovalPendingNotification(pseudoApproval, submitter, app.user.email);
        }
    } catch (err) {
        console.error('Failed to send transfer approval email:', err);
    }

    await logAction({
        tenantId,
        entityType: EntityType.TRANSFER,
        entityId: id,
        action: 'SUBMIT',
        changedBy: userId,
        note: `STORE_TRANSFER_SUBMIT transferNo=${updatedTrf.transferNo}`,
        afterValue: { transferNo: updatedTrf.transferNo, status: updatedTrf.status },
    });

    // Full detail (status + approvalRequest + userFacingState) for create/submit callers.
    return getTransfer(id, tenantId, user);
};

const approveTransfer = async (id, tenantId, user, expectedVersion = null) => {
    const userId = user.id;
    const userRole = user.role;
    const trf = await findTransfer(id, tenantId, user);
    assertStatus(trf, ...PENDING_APPROVAL_STATUSES);
    assertConcurrencyVersion(expectedVersion, trf.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.TRANSFER, entityId: id, changedBy: userId },
    });

    // Dept Manager onward: hard-block when source stock cannot cover lines.
    const stockGate = await buildTransferCheckoutStockGate({ ...trf, tenantId });
    if (stockGate && !stockGate.ok) {
        const names = stockGate.blockers.map((b) => b.itemName).join(', ');
        throw Object.assign(
            new Error(`Insufficient stock to approve transfer. Review stock for: ${names}`),
            { status: 422 },
        );
    }

    let posted = false;

    const result = await prisma.$transaction(async (tx) => {
        const outcome = await processStoreTransferApproval({
            tx,
            transferId: id,
            tenantId,
            userId,
            user,
            action: 'APPROVE',
            comment: null,
        });

        if (outcome.needsPosting) {
            await postingEngine.postTransferInTransaction(tx, outcome.transfer, userId);
            posted = true;
        }

        return tx.storeTransfer.findFirst({
            where: { id, tenantId },
            include: transferInclude,
        });
    });

    await logAction({
        tenantId,
        entityType: EntityType.TRANSFER,
        entityId: id,
        action: posted ? 'POST' : 'APPROVE',
        changedBy: userId,
        note: posted
            ? `STORE_TRANSFER_POSTED transferNo=${result.transferNo}`
            : `STORE_TRANSFER_APPROVE_STEP transferNo=${result.transferNo} status=${result.status}`,
        afterValue: { transferNo: result.transferNo, status: result.status },
    });

    if (posted) {
        await logGovernedEvent({
            tenantId,
            entityType: EntityType.TRANSFER,
            entityId: id,
            action: 'POST',
            changedBy: userId,
            eventType: 'STORE_TRANSFER_POSTED',
            note: `STORE_TRANSFER_POSTED transferNo=${result.transferNo}`,
            afterValue: { transferNo: result.transferNo, status: 'POSTED', referenceType: 'TRANSFER' },
        });
    }

    return result;
};

const sendBackTransfer = async (id, tenantId, user, reason, expectedVersion = null, targetStepNumber = null) => {
    const trimmedReason = normalizeReason(reason);
    const userId = user.id;
    const trf = await findTransfer(id, tenantId, user);
    assertStatus(trf, ...PENDING_APPROVAL_STATUSES);
    assertConcurrencyVersion(expectedVersion, trf.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.TRANSFER, entityId: id, changedBy: userId },
    });
    const approval = trf.approvalRequest;
    if (!approval) {
        throw Object.assign(new Error('No approval workflow found for this transfer.'), { status: 404 });
    }
    const currentStepNo = Number(approval.currentStep);
    const step = approval.steps.find((s) => s.stepNumber === currentStepNo);
    if (!step || step.status !== 'PENDING') {
        throw Object.assign(new Error('No pending approval step for this transfer.'), { status: 422 });
    }
    assertUserHasTransferStepPermission(user, trf.status, step.requiredRole?.code);

    const allowedTargets = buildTransferSendBackTargets(trf, approval);
    let targetStepNo;
    if (targetStepNumber == null || targetStepNumber === '') {
        targetStepNo = currentStepNo <= 1 ? 0 : currentStepNo - 1;
    } else {
        targetStepNo = Number(targetStepNumber);
        if (!Number.isInteger(targetStepNo) || !allowedTargets.some((t) => t.stepNumber === targetStepNo)) {
            throw Object.assign(new Error('Send Back target must be a prior workflow participant.'), {
                status: 422,
            });
        }
    }

    const nextStatus = targetStepNo === 0 ? 'DRAFT' : transferStatusForActiveStep(targetStepNo);
    const result = await prisma.$transaction(async (tx) => {
        const updateData = bumpConcurrencyUpdate({
            status: nextStatus,
            updatedAt: new Date(),
            ...(nextStatus === 'DRAFT'
                ? { notes: appendSendBackNotes(trf.notes, trimmedReason) }
                : {}),
        });
        const guarded = await tx.storeTransfer.updateMany({
            where: { id, tenantId, status: trf.status },
            data: updateData,
        });
        if (guarded.count === 0) {
            throw Object.assign(new Error('Transfer changed while sending back.'), {
                status: 409,
                code: 'TRANSFER_SEND_BACK_CONFLICT',
            });
        }
        await executeWorkflowSendBackInTx(tx, {
            approvalRequest: approval,
            sourceStepNumber: currentStepNo,
            forceTargetStepNumber: targetStepNo,
            reason: trimmedReason,
            userId,
            tenantId,
            entityType: EntityType.TRANSFER,
            entityId: id,
            documentStatusBefore: trf.status,
            documentStatusAfter: nextStatus,
        });
        return tx.storeTransfer.findFirst({ where: { id, tenantId }, include: transferInclude });
    });
    return result;
};

const rejectTransfer = async (id, tenantId, user, reason, expectedVersion = null) => {
    if (!reason) throw Object.assign(new Error('Rejection reason required'), { status: 400 });
    const userId = user.id;
    const trf = await findTransfer(id, tenantId, user);

    // Creator reject Returned (DRAFT + [Send Back] notes / currentStep 0).
    const isReturned =
        isSendBackReturned(trf.status, trf.notes) ||
        (String(trf.status || '').toUpperCase() === 'DRAFT' &&
            Number(trf.approvalRequest?.currentStep) === 0);
    if (isReturned && String(trf.status || '').toUpperCase() === 'DRAFT') {
        if (trf.requestedBy !== userId) {
            throw Object.assign(new Error('Only the document creator can reject a returned transfer.'), {
                status: 403,
            });
        }
        assertConcurrencyVersion(expectedVersion, trf.concurrencyVersion, {
            required: true,
            audit: { tenantId, entityType: EntityType.TRANSFER, entityId: id, changedBy: userId },
        });
        await prisma.storeTransfer.updateMany({
            where: { id, tenantId, status: 'DRAFT' },
            data: bumpConcurrencyUpdate({
                status: 'REJECTED',
                rejectedBy: userId,
                rejectionReason: reason,
                updatedAt: new Date(),
            }),
        });
        await logAction({
            tenantId,
            entityType: EntityType.TRANSFER,
            entityId: id,
            action: 'REJECT',
            changedBy: userId,
            note: `Creator rejected returned transfer: ${reason}`,
            beforeValue: { status: trf.status },
            afterValue: { status: 'REJECTED' },
        });
        return prisma.storeTransfer.findFirst({ where: { id, tenantId }, include: transferInclude });
    }

    assertStatus(trf, ...PENDING_APPROVAL_STATUSES);
    assertConcurrencyVersion(expectedVersion, trf.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.TRANSFER, entityId: id, changedBy: userId },
    });
    const outcome = await processStoreTransferApproval({
        transferId: id,
        tenantId,
        userId,
        user,
        action: 'REJECT',
        comment: reason,
    });
    const result = outcome.transfer;
    await logAction({
        tenantId,
        entityType: EntityType.TRANSFER,
        entityId: id,
        action: 'REJECT',
        changedBy: userId,
        note: `STORE_TRANSFER_REJECT transferNo=${result.transferNo}`,
        afterValue: { transferNo: result.transferNo, status: result.status },
    });
    return result;
};

// ─── Queries ─────────────────────────────────────────────────────────────────

const listTransfers = async (
    tenantId,
    {
        status,
        workflowBucket,
        sourceLocationId,
        destLocationId,
        dateFrom,
        dateTo,
        page = 1,
        limit = 20,
    } = {},
    user = null,
) => {
    const scope = user ? await resolveScopeContext(user, tenantId) : null;
    const scopeWhere = scope ? scopeWhereFor(SCOPE_MODULE.TRANSFER, scope) : {};

    if (scope && !scope.isTenantWide) {
        if (sourceLocationId && !scope.allowedLocationIds.includes(sourceLocationId)) {
            const deptOk =
                scope.profile === 'DEPARTMENT' &&
                scope.departmentId &&
                (await prisma.location.findFirst({
                    where: { id: sourceLocationId, tenantId, departmentId: scope.departmentId },
                    select: { id: true },
                }));
            if (!deptOk) throw createScopeError('Source location filter outside your scope.', 400);
        }
        if (destLocationId && !scope.allowedLocationIds.includes(destLocationId)) {
            const deptOk =
                scope.profile === 'DEPARTMENT' &&
                scope.departmentId &&
                (await prisma.location.findFirst({
                    where: { id: destLocationId, tenantId, departmentId: scope.departmentId },
                    select: { id: true },
                }));
            if (!deptOk) throw createScopeError('Destination location filter outside your scope.', 400);
        }
    }
    const dateRange =
        dateFrom || dateTo
            ? {
                  transferDate: {
                      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                      ...(dateTo ? { lte: new Date(dateTo) } : {}),
                  },
              }
            : {};

    let statusFilter;
    const bucket = workflowBucket ? String(workflowBucket).trim().toUpperCase() : null;

    if (bucket && !ALLOWED_TRANSFER_WORKFLOW_BUCKETS.has(bucket)) {
        throw Object.assign(
            new Error(
                `Invalid workflowBucket "${workflowBucket}". Allowed: ${[...ALLOWED_TRANSFER_WORKFLOW_BUCKETS].join(', ')}`,
            ),
            { status: 400 },
        );
    }

    if (status) {
        const normalized = String(status).trim().toUpperCase();
        if (!TRANSFER_LIST_STATUSES.includes(normalized)) {
            throw Object.assign(
                new Error(
                    `Invalid status filter "${status}". Allowed: ${TRANSFER_LIST_STATUSES.join(', ')}`,
                ),
                { status: 400 },
            );
        }
        statusFilter = normalized;
    }

    const listLocationDateFilters = {
        ...(sourceLocationId ? { sourceLocationId } : {}),
        ...(destLocationId ? { destLocationId } : {}),
        ...dateRange,
    };

    let where;
    if (bucket === AWAITING_POSTING_BUCKET) {
        where = {
            ...awaitingPostingListWhere(tenantId),
            ...scopeWhere,
            ...listLocationDateFilters,
        };
    } else if (bucket === PENDING_REVIEW_BUCKET) {
        where = {
            ...pendingReviewListWhere(tenantId),
            ...scopeWhere,
            ...listLocationDateFilters,
        };
    } else {
        where = {
            tenantId,
            ...scopeWhere,
            ...(statusFilter ? { status: statusFilter } : {}),
            ...listLocationDateFilters,
        };
    }
    try {
        const [total, data] = await Promise.all([
            prisma.storeTransfer.count({ where }),
            prisma.storeTransfer.findMany({
                where,
                include: {
                    sourceLocation: { select: { name: true } },
                    destLocation: { select: { name: true } },
                    requestedByUser: { select: { firstName: true, lastName: true } },
                    _count: { select: { lines: true } },
                    approvalRequest: {
                        select: {
                            currentStep: true,
                            totalSteps: true,
                            status: true,
                            steps: {
                                orderBy: { stepNumber: 'asc' },
                                select: {
                                    stepNumber: true,
                                    status: true,
                                    requiredRole: { select: { code: true } },
                                },
                            },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
        ]);
        const scopeMeta = scope ? metaFor(scope, { total }) : null;
        return { total, page, limit, data: data.map(mapTransferListRow), ...scopeMeta };
    } catch (err) {
        logger.error('[Transfer] listTransfers failed', {
            tenantId,
            status: statusFilter ?? status,
            code: err.code,
            message: err.message,
        });
        const msg = String(err.message || '');
        if (
            err.code === 'P2023' ||
            msg.includes('enum') ||
            msg.includes('TransferStatus') ||
            msg.includes('invalid input value for enum')
        ) {
            throw Object.assign(
                new Error(
                    'Transfer list failed: database status values are out of sync with the application. Run pending Prisma migrations (POSTED / finance-post workflow).',
                ),
                { status: 500 },
            );
        }
        throw err;
    }
};

const getTransfer = async (id, tenantId, user = null) => {
    if (user) {
        await findTransfer(id, tenantId, user);
    }
    let trf = null;
    try {
        trf = await prisma.storeTransfer.findFirst({
            where: { id, tenantId },
            include: transferInclude,
        });
    } catch (err) {
        logger.warn('[Transfer] getTransfer full include failed; retrying without postedByUser', {
            transferId: id,
            tenantId,
            code: err.code,
            message: err.message,
        });
        try {
            trf = await prisma.storeTransfer.findFirst({
                where: { id, tenantId },
                include: transferIncludeWithoutPostedBy,
            });
        } catch (err2) {
            logger.warn('[Transfer] getTransfer fallback include failed; using minimal include', {
                transferId: id,
                tenantId,
                code: err2.code,
                message: err2.message,
            });
            trf = await prisma.storeTransfer.findFirst({
                where: { id, tenantId },
                include: transferIncludeMinimal,
            });
        }
    }
    if (!trf) throw Object.assign(new Error('Transfer not found'), { status: 404 });
    const mapped = mapTransferDetailResponse(trf);
    const approval = mapped.approvalRequest;
    const sendBackTargets =
        approval && PENDING_APPROVAL_STATUSES.includes(String(mapped.status || '').toUpperCase())
            ? buildTransferSendBackTargets(mapped, approval)
            : [];
    const checkoutStockGate = await buildTransferCheckoutStockGate({ ...mapped, tenantId });
    return {
        ...mapped,
        sendBackTargets,
        checkoutStockGate,
    };
};

module.exports = {
    createTransfer,
    updateTransfer,
    deleteTransfer,
    submitTransfer,
    approveTransfer,
    rejectTransfer,
    sendBackTransfer,
    listTransfers,
    getTransfer,
    getEvidence: (id, tenantId, user) =>
        require('./transferEvidence.service').getTransferEvidence(id, tenantId, user),
};
