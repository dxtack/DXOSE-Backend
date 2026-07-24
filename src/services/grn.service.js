'use strict';
const { PrismaClient } = require('@prisma/client');
const ExcelJS = require('exceljs');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const prisma = new PrismaClient();
const emailService = require('./email.service');
const { normalizeRole } = require('./rbac.service');
const { hasPermission } = require('../middleware/authorize');
const { assertUserHasGrnManage } = require('../acc-authority/step-permission-enforcement');
const {
    resolveWorkflowForDocument,
    resolveWorkflowByVersionId,
} = require('./acc-workflow-runtime.service');
const {
    assertAwaitingStatusKey,
} = require('./acc-workflow-status-key-guard.service');
const { createAccApprovalRequestInTx } = require('./acc-approval-request.util');
const { assertDualGateApproval } = require('../acc-authority/step-permission-enforcement');
const { getStorage } = require('../config/storage');
const postingEngine = require('./postingEngine.service');
const { logGovernedEvent, EntityType } = require('./auditGoverned.service');
const { buildGrnWorkflowTimeline } = require('./grn-workflow-presentation.util');
const { buildGrnWorkflowContext } = require('./grnWorkflowContext.util');
const { enrichTimelineSlotsWithDuration } = require('../platform/timelineDuration.util');
const { mapUserFacingState, appendSendBackNotes, isSendBackReturned } = require('../platform/lifecyclePresentation.service');
const { generateDocNumber, DocPrefix } = require('./docNumbering.service');
const { assertConcurrencyVersion, bumpConcurrencyUpdate } = require('../platform/concurrency.service');
const {
    executeWorkflowSendBackInTx,
    executeCreatorResubmitInTx,
    normalizeReason,
} = require('../platform/workflowSendBack.service');
const { userDisplayName } = require('../utils/timeline-present.util');
const {
    assertIntegerQuantity,
    isIntegerQuantity,
} = require('./integerQuantityGuard.service');
const {
    resolveScopeContext,
    scopeWhereFor,
    metaFor,
    assertInScope,
    SCOPE_MODULE,
} = require('./scope/scopeContext');
// ─── Helpers ─────────────────────────────────────────────────────────────────
const assertStatus = async (grnId, tenantId, expected) => {
    const grn = await prisma.grnImport.findFirst({ where: { id: grnId, tenantId } });
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });
    if (grn.status !== expected)
        throw Object.assign(
            new Error(`GRN must be in ${expected} status, currently ${grn.status}`),
            { status: 422 }
        );
    return grn;
};

// ─── Create GRN ──────────────────────────────────────────────────────────────

/**
 * Create a new GRN with validated items from the Item Master.
 * Items and supplier must already exist — no mapping needed.
 *
 * @param {object} opts
 * @param {string} opts.supplierId      — must exist in suppliers table
 * @param {string} opts.locationId      — destination warehouse
 * @param {string} opts.supplierInvoiceNumber — supplier invoice / external reference (Ch.9)
 * @param {string} [opts.grnNumber] — deprecated alias for supplierInvoiceNumber
 * @param {Date}   opts.receivingDate
 * @param {string} opts.invoiceUrl      — mandatory invoice file path
 * @param {string} [opts.notes]
 * @param {Array}  opts.lines           — [{ itemId, uomId, orderedQty, receivedQty, unitPrice, notes? }]
 * @param {string} opts.tenantId
 * @param {string} opts.userId
 * @param {string} opts.creatorRole — JWT role code (normalized). Persists as DRAFT; HTTP create controller may auto-submit.
 */
const createGrn = async ({
    supplierId, locationId, grnNumber, supplierInvoiceNumber, receivingDate,
    invoiceUrl, notes, lines, tenantId, userId, creatorRole,
}) => {
    const externalInvoice = (supplierInvoiceNumber || grnNumber || '').trim();
    if (!externalInvoice) {
        throw Object.assign(new Error('Supplier invoice number is required.'), { status: 400 });
    }

    const systemGrnNumber = await generateDocNumber(tenantId, DocPrefix.RECEIVE, receivingDate || new Date());
    // ── Validate supplier ──
    const supplier = await prisma.supplier.findFirst({
        where: { id: supplierId, tenantId },
    });
    if (!supplier)
        throw Object.assign(new Error('Supplier not found. Make sure the supplier exists in the system first.'), { status: 404 });

    // ── Validate location ──
    const location = await prisma.location.findFirst({
        where: { id: locationId, tenantId },
    });
    if (!location)
        throw Object.assign(new Error('Warehouse/Location not found.'), { status: 404 });

    // ── Duplicate system number guard (engine uniqueness) ──
    const existing = await prisma.grnImport.findUnique({
        where: { tenantId_grnNumber: { tenantId, grnNumber: systemGrnNumber } },
    });
    if (existing)
        throw Object.assign(new Error(`System GRN number collision "${systemGrnNumber}". Retry.`), { status: 409 });

    // ── Validate all items exist ──
    if (!lines || lines.length === 0)
        throw Object.assign(new Error('At least one line item is required.'), { status: 400 });

    const itemIds = [...new Set(lines.map(l => l.itemId))];
    const foundItems = await prisma.item.findMany({
        where: { id: { in: itemIds }, tenantId },
        include: { itemUnits: { include: { unit: true } } },
    });
    const foundItemIds = new Set(foundItems.map(i => i.id));
    const missingIds = itemIds.filter(id => !foundItemIds.has(id));
    if (missingIds.length > 0)
        throw Object.assign(
            new Error(`${missingIds.length} item(s) not found in Item Master. Add them first.`),
            { status: 422, details: missingIds }
        );

    // ── Validate each line qty ──
    const invalidLines = lines.filter(l => Number(l.receivedQty) <= 0);
    if (invalidLines.length > 0)
        throw Object.assign(new Error('All received quantities must be greater than zero.'), { status: 400 });
    for (const l of lines) {
        assertIntegerQuantity({
            qty: l.receivedQty,
            field: 'receivedQty',
            message: 'Quantity must be a whole number (integer). Fractional quantities are not allowed.',
            details: { itemId: l.itemId, receivedQty: Number(l.receivedQty) },
        });
    }

    // ── Build item lookup for display ──
    const itemMap = Object.fromEntries(foundItems.map(i => [i.id, i]));

    // ── P12: ACC published GRN workflow required (cutover module) ──
    await resolveWorkflowForDocument({ moduleKey: 'GRN', tenantId });

    // ── Create GRN as Draft (HTTP create may auto-submit — storekeeper submit-once UX) ──
    const grn = await prisma.grnImport.create({
        data: {
            tenantId,
            grnNumber: systemGrnNumber,
            supplierInvoiceNumber: externalInvoice,
            vendorId: supplierId,
            vendorNameSnapshot: supplier.name,
            locationId,
            receivingDate: receivingDate ? new Date(receivingDate) : new Date(),
            pdfAttachmentUrl: invoiceUrl,
            notes: notes || null,
            status: 'DRAFT',
            approvedBy: null,
            approvedAt: null,
            importedBy: userId,
            lines: {
                create: lines.map(l => {
                    const received = Number(l.receivedQty);
                    const orderedRaw = l.orderedQty;
                    const ordered =
                        orderedRaw != null && orderedRaw !== ''
                            ? Number(orderedRaw)
                            : received;
                    return {
                    futurelogItemCode: itemMap[l.itemId]?.barcode || l.itemId,
                    futurelogDescription: itemMap[l.itemId]?.name || '',
                    futurelogUom: l.uomId,  // store uomId here for now
                    orderedQty: Number.isFinite(ordered) ? ordered : received,
                    receivedQty: received,
                    unitPrice: Number(l.unitPrice) || 0,
                    internalItemId: l.itemId,
                    internalUomId: l.uomId,
                    conversionFactor: 1,
                    qtyInBaseUnit: received,
                    isMapped: true,  // always true — items pre-validated
                    // notes per line stored in futurelogDescription + custom notes if exists
                    };
                }),
            },
        },
        include: {
            lines: true,
            vendor: { select: { name: true } },
            location: { select: { name: true } },
        },
    });

    await logGovernedEvent({
        tenantId,
        entityType: EntityType.GRN,
        entityId: grn.id,
        action: 'CREATE',
        changedBy: userId,
        eventType: 'GRN_CREATE',
        note: `GRN created with system number ${systemGrnNumber}`,
        afterValue: { grnNumber: systemGrnNumber, status: grn.status },
    });

    if (invoiceUrl) {
        await logGovernedEvent({
            tenantId,
            entityType: EntityType.GRN,
            entityId: grn.id,
            action: 'ATTACHMENT_ADD',
            changedBy: userId,
            eventType: 'GRN_INVOICE_ATTACHMENT',
            note: 'Supplier invoice attachment added at create',
            afterValue: { pdfAttachmentUrl: invoiceUrl },
        });
    }

    return grn;
};

async function _loadGrnWithApproval(grnId, tenantId) {
    const grn = await prisma.grnImport.findFirst({
        where: { id: grnId, tenantId },
        include: {
            importedByUser: { select: { firstName: true, lastName: true } },
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
            lines: true,
        },
    });
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });
    return grn;
}

/**
 * Send Back targets: Creator (step 0) + prior participants.
 * Skip STEP rows acted by the document creator.
 */
function buildGrnSendBackTargets(grn, approval) {
    if (!grn || !approval) return [];
    const currentStepNo = Number(approval.currentStep);
    if (currentStepNo <= 0) return [];

    const creatorId = grn.importedBy || null;
    const targets = [
        {
            stepNumber: 0,
            targetType: 'CREATOR',
            roleCode: null,
            actorName: userDisplayName(grn.importedByUser) || null,
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
}

/** Lock GRN row and compute next cycle inside the same transaction (race-safe). */
async function _resolveNextGrnCycleNumber(tx, grnId) {
    await tx.$executeRaw`SELECT id FROM grn_imports WHERE id = ${grnId}::uuid FOR UPDATE`;
    const agg = await tx.approvalRequest.aggregate({
        where: { grnImportId: grnId, requestType: 'GRN_IMPORT' },
        _max: { cycleNumber: true },
    });
    return (agg._max.cycleNumber || 0) + 1;
}

async function _createGrnApprovalRequestInTx(tx, { tenantId, grnId, userId, chain, cycleNumber }) {
    try {
        return await createAccApprovalRequestInTx(tx, {
            tenantId,
            requestType: 'GRN_IMPORT',
            createdBy: userId,
            chain,
            currentStep: 1,
            extraData: { grnImportId: grnId, cycleNumber },
        });
    } catch (err) {
        if (err?.code === 'P2002') {
            throw Object.assign(new Error('Approval cycle already exists for this GRN. Reload and retry.'), {
                status: 409,
                code: 'GRN_CYCLE_CONFLICT',
            });
        }
        throw err;
    }
}

async function _resolveGrnChain(grn, tenantId) {
    if (grn.accWorkflowVersionId) {
        return resolveWorkflowByVersionId(grn.accWorkflowVersionId);
    }
    return resolveWorkflowForDocument({ moduleKey: 'GRN', tenantId });
}

function _statusForGrnStep(chain, stepNumber) {
    const step = chain.steps?.[stepNumber - 1];
    if (step?.statusKey) return step.statusKey;
    const defaults = ['PENDING_APPROVAL', 'PENDING_FINANCE'];
    return defaults[stepNumber - 1] || 'PENDING_APPROVAL';
}

/** Status while awaiting step `stepNumber` — shared guard rejects terminal statusKey before final posting. */
function _statusForGrnAwaitingStep(chain, stepNumber) {
    const key = _statusForGrnStep(chain, stepNumber);
    return assertAwaitingStatusKey(key, { moduleKey: 'GRN', stepNumber });
}

function _assertGrnDualGate(user, approval, chain) {
    const step = approval.steps.find((s) => s.stepNumber === approval.currentStep);
    if (!step) throw Object.assign(new Error('No pending approval step'), { status: 422 });
    const chainStep = chain.steps?.find((s) => s.stepOrder === approval.currentStep);
    const roleCode = step.requiredRole?.code;
    const perm = chainStep?.permissionCode || 'GRN_MANAGE';
    assertDualGateApproval(user, roleCode, perm);
}

async function _ensureGrnApprovalStarted(grn, tenantId, userId) {
    if (grn.approvalRequestId) return _loadGrnWithApproval(grn.id, tenantId);
    throw Object.assign(
        new Error('GRN must be submitted for approval before workflow actions.'),
        { status: 422, code: 'GRN_NOT_SUBMITTED' },
    );
}

async function _advanceGrnApprovalStep(grnId, tenantId, user, comment, expectedVersion = null) {
    let grn = await _loadGrnWithApproval(grnId, tenantId);
    assertConcurrencyVersion(expectedVersion, grn.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.GRN, entityId: grnId, changedBy: user.id },
    });
    if (!grn.approvalRequest) {
        grn = await _ensureGrnApprovalStarted(grn, tenantId, user.id);
    }
    const approval = grn.approvalRequest;
    const chain = await _resolveGrnChain(grn, tenantId);
    const step = approval.steps.find((s) => s.stepNumber === approval.currentStep);
    if (!step || step.status !== 'PENDING') {
        throw Object.assign(new Error('No pending approval step'), { status: 422 });
    }
    _assertGrnDualGate(user, approval, chain);

    const isFinal = approval.currentStep >= approval.totalSteps;
    const now = new Date();

    if (isFinal) {
        if (!grn.lines?.length) {
            throw Object.assign(new Error('GRN has no lines to post'), { status: 422 });
        }
        await prisma.$transaction(async (tx) => {
            await tx.approvalStep.update({
                where: { id: step.id },
                data: { status: 'APPROVED', actedBy: user.id, actedAt: now, comment: comment || null },
            });
            await tx.approvalRequest.update({
                where: { id: approval.id },
                data: { status: 'APPROVED', resolvedAt: now, currentStep: approval.currentStep },
            });
            const freshGrn = await tx.grnImport.findFirst({
                where: { id: grnId, tenantId },
                include: { lines: true },
            });
            await postingEngine.postGrnInTransaction(tx, freshGrn, user.id);
        });
        await logGovernedEvent({
            tenantId,
            entityType: EntityType.GRN,
            entityId: grnId,
            action: 'POST',
            changedBy: user.id,
            eventType: 'GRN_POST',
            note: `Finance approved and posted GRN ${grn.grnNumber} via ACC workflow`,
            afterValue: { grnNumber: grn.grnNumber, status: 'POSTED' },
        });
    } else {
        const nextStatus = _statusForGrnAwaitingStep(chain, approval.currentStep + 1);
        await prisma.$transaction(async (tx) => {
            await tx.approvalStep.update({
                where: { id: step.id },
                data: { status: 'APPROVED', actedBy: user.id, actedAt: now, comment: comment || null },
            });
            await tx.approvalRequest.update({
                where: { id: approval.id },
                data: { currentStep: approval.currentStep + 1 },
            });
            await tx.grnImport.update({
                where: { id: grnId },
                data: {
                    status: nextStatus,
                    approvedBy: user.id,
                    approvedAt: now,
                    rejectionReason: null,
                    rejectedBy: null,
                    isEditedAfterRejection: false,
                    updatedAt: now,
                },
            });
        });
    }
    return getGrn(grnId, tenantId);
}

async function _rejectGrnApproval(grnId, tenantId, user, reason, expectedVersion = null) {
    let grn = await _loadGrnWithApproval(grnId, tenantId);
    assertConcurrencyVersion(expectedVersion, grn.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.GRN, entityId: grnId, changedBy: user.id },
    });
    if (!grn.approvalRequest) {
        grn = await _ensureGrnApprovalStarted(grn, tenantId, user.id);
    }
    const approval = grn.approvalRequest;
    const chain = await _resolveGrnChain(grn, tenantId);
    const step = approval.steps.find((s) => s.stepNumber === approval.currentStep);
    if (step) _assertGrnDualGate(user, approval, chain);

    const now = new Date();
    await prisma.$transaction(async (tx) => {
        if (step) {
            await tx.approvalStep.update({
                where: { id: step.id },
                data: { status: 'REJECTED', actedBy: user.id, actedAt: now, comment: reason },
            });
        }
        await tx.approvalRequest.update({
            where: { id: approval.id },
            data: { status: 'REJECTED', resolvedAt: now },
        });
        await tx.grnImport.update({
            where: { id: grnId },
            data: bumpConcurrencyUpdate({
                status: 'REJECTED',
                rejectedBy: user.id,
                rejectionReason: reason,
                approvedBy: null,
                approvedAt: null,
                isEditedAfterRejection: false,
                lastEditedBy: null,
                updatedAt: now,
            }),
        });
    });
    return getGrn(grnId, tenantId);
}

// ─── State Machine ────────────────────────────────────────────────────────────

/**
 * Validate: supplier resolved, invoice attached, all lines mapped.
 * With new design all lines are always mapped on creation, so this is fast.
 */
const validateGrn = async (grnId, tenantId) => {
    const grn = await prisma.grnImport.findFirst({
        where: { id: grnId, tenantId },
        include: { lines: true },
    });
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });

    const LOCKED = ['VALIDATED', 'PENDING_APPROVAL', 'PENDING_FINANCE', 'APPROVED', 'POSTED', 'REJECTED'];
    if (LOCKED.includes(grn.status))
        throw Object.assign(
            new Error(`GRN is in ${grn.status} status and cannot be re-validated.`),
            { status: 422 }
        );

    const errors = [];
    if (!grn.vendorId) errors.push('Supplier is not set.');
    if (!grn.pdfAttachmentUrl) errors.push('Invoice attachment is required before validation.');
    const unmapped = grn.lines.filter(l => !l.isMapped);
    if (unmapped.length > 0) errors.push(`${unmapped.length} line(s) missing item mapping.`);

    if (errors.length > 0)
        throw Object.assign(new Error(errors.join(' | ')), { status: 422, details: errors });

    return prisma.grnImport.update({
        where: { id: grnId },
        data: { status: 'VALIDATED', updatedAt: new Date() },
    });
};

const submitForApproval = async (grnId, tenantId, userId, expectedVersion = null) => {
    const grn = await prisma.grnImport.findFirst({ where: { id: grnId, tenantId } });
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });

    const chain = await resolveWorkflowForDocument({ moduleKey: 'GRN', tenantId });
    const firstStatus = _statusForGrnAwaitingStep(chain, 1);

    let previousCycleNumber = 0;
    let nextCycleNumber = 1;
    let isResubmit = false;
    let reusedApprovalRequest = false;

    await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM grn_imports WHERE id = ${grnId}::uuid FOR UPDATE`;
        const fresh = await tx.grnImport.findFirst({
            where: { id: grnId, tenantId },
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
        if (!fresh) throw Object.assign(new Error('GRN not found'), { status: 404 });
        const isCreatorResubmit = fresh.approvalRequest && Number(fresh.approvalRequest.currentStep) === 0;
        if (isCreatorResubmit && fresh.importedBy !== userId) {
            throw Object.assign(new Error('Only the GRN creator may resubmit after Send Back.'), { status: 403 });
        }
        if (!isCreatorResubmit && !['VALIDATED', 'DRAFT'].includes(fresh.status)) {
            throw Object.assign(
                new Error(`GRN must be DRAFT or VALIDATED to submit. Current status: ${fresh.status}`),
                { status: 422 },
            );
        }
        if (!isCreatorResubmit && fresh.status === 'DRAFT') {
            const draftErrors = [];
            if (!fresh.vendorId) draftErrors.push('Supplier is not set.');
            if (!fresh.pdfAttachmentUrl) draftErrors.push('Invoice attachment is required before submit.');
            if (!fresh.lines?.length) draftErrors.push('At least one line item is required.');
            if (draftErrors.length) {
                throw Object.assign(new Error(draftErrors.join(' | ')), { status: 422, details: draftErrors });
            }
        }
        assertConcurrencyVersion(expectedVersion, fresh.concurrencyVersion, {
            required: true,
            audit: { tenantId, entityType: EntityType.GRN, entityId: grnId, changedBy: userId },
        });

        if (isCreatorResubmit) {
            const pinnedChain = await _resolveGrnChain(fresh, tenantId);
            const pinnedFirstStatus = _statusForGrnAwaitingStep(pinnedChain, 1);
            await executeCreatorResubmitInTx(tx, {
                approvalRequest: fresh.approvalRequest,
                userId,
                tenantId,
                entityType: EntityType.GRN,
                entityId: grnId,
                documentStatusBefore: fresh.status,
                documentStatusAfter: pinnedFirstStatus,
                resubmitNotePrefix: 'GRN_RESUBMIT',
            });
            await tx.grnImport.update({
                where: { id: grnId },
                data: bumpConcurrencyUpdate({
                    status: pinnedFirstStatus,
                    updatedAt: new Date(),
                }),
            });
            nextCycleNumber = fresh.approvalRequest.cycleNumber || 1;
            previousCycleNumber = nextCycleNumber;
            isResubmit = true;
            reusedApprovalRequest = true;
            return;
        }

        nextCycleNumber = await _resolveNextGrnCycleNumber(tx, grnId);
        previousCycleNumber = nextCycleNumber - 1;
        isResubmit = previousCycleNumber > 0;

        const ar = await _createGrnApprovalRequestInTx(tx, {
            tenantId,
            grnId,
            userId,
            chain,
            cycleNumber: nextCycleNumber,
        });
        await tx.grnImport.update({
            where: { id: grnId },
            data: bumpConcurrencyUpdate({
                status: firstStatus,
                approvalRequestId: ar.id,
                accWorkflowVersionId: chain.versionId,
                updatedAt: new Date(),
            }),
        });
    });

    if (isResubmit && !reusedApprovalRequest) {
        await logGovernedEvent({
            tenantId,
            entityType: EntityType.GRN,
            entityId: grnId,
            action: 'SUBMIT',
            changedBy: userId,
            eventType: 'GRN_RESUBMIT',
            afterValue: { previousCycleNumber, newCycleNumber: nextCycleNumber },
        });
    }

    try {
        const firstRole = chain.steps?.[0]?.roleCode;
        if (firstRole) {
            const approvers = await prisma.tenantMember.findMany({
                where: {
                    tenantId,
                    role: { code: firstRole },
                    isActive: true,
                    user: { isActive: true },
                },
                select: { user: { select: { email: true } } },
            });
            const submitter = await prisma.user.findUnique({ where: { id: userId } });
            const grn = await prisma.grnImport.findFirst({ where: { id: grnId, tenantId } });
            const pseudoApproval = { type: 'GRN', createdAt: grn?.createdAt, notes: `GRN Number: ${grn?.grnNumber}` };
            for (const app of approvers) {
                await emailService.sendApprovalPendingNotification(pseudoApproval, submitter, app.user.email);
            }
        }
    } catch (err) {
        console.error('Failed to send GRN approval email', err);
    }
    return getGrn(grnId, tenantId);
};

const approveGrn = async (grnId, tenantId, user, comment, expectedVersion = null) => {
    const grn = await _loadGrnWithApproval(grnId, tenantId);
    const pending = ['PENDING_APPROVAL', 'PENDING_FINANCE'];
    if (!pending.includes(grn.status)) {
        throw Object.assign(
            new Error(`GRN must be pending approval. Current status: ${grn.status}`),
            { status: 422 },
        );
    }
    return _advanceGrnApprovalStep(grnId, tenantId, user, comment, expectedVersion);
};

const rejectGrn = async (grnId, tenantId, user, reason, expectedVersion = null) => {
    const r = (reason || '').trim();
    if (!r) throw Object.assign(new Error('Rejection reason is required.'), { status: 400 });

    const grn = await prisma.grnImport.findFirst({
        where: { id: grnId, tenantId },
        include: {
            approvalRequest: { select: { currentStep: true } },
        },
    });
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });

    const isReturned =
        isSendBackReturned(grn.status, grn.notes) ||
        (String(grn.status || '').toUpperCase() === 'DRAFT' &&
            Number(grn.approvalRequest?.currentStep) === 0);

    if (isReturned && String(grn.status || '').toUpperCase() === 'DRAFT') {
        if (grn.importedBy !== user.id) {
            throw Object.assign(new Error('Only the GRN creator can reject a returned document.'), {
                status: 403,
            });
        }
        assertConcurrencyVersion(expectedVersion, grn.concurrencyVersion, {
            required: true,
            audit: { tenantId, entityType: EntityType.GRN, entityId: grnId, changedBy: user.id },
        });
        await prisma.grnImport.updateMany({
            where: { id: grnId, tenantId, status: 'DRAFT' },
            data: bumpConcurrencyUpdate({
                status: 'REJECTED',
                rejectedBy: user.id,
                rejectionReason: r,
                updatedAt: new Date(),
            }),
        });
        await logGovernedEvent({
            tenantId,
            entityType: EntityType.GRN,
            entityId: grnId,
            action: 'REJECT',
            changedBy: user.id,
            eventType: 'GRN_CREATOR_REJECT_RETURNED',
            note: `Creator rejected returned GRN: ${r}`,
            beforeValue: { status: grn.status },
            afterValue: { status: 'REJECTED' },
        });
        return getGrn(grnId, tenantId);
    }

    if (!['PENDING_APPROVAL', 'VALIDATED', 'PENDING_FINANCE'].includes(grn.status)) {
        throw Object.assign(new Error('GRN cannot be rejected in its current state'), { status: 422 });
    }
    return _rejectGrnApproval(grnId, tenantId, user, r, expectedVersion);
};

/**
 * Ch.3.4 Send Back — return to prior participant or creator.
 */
const sendBackGrn = async (grnId, tenantId, user, reason, expectedVersion, targetStepNumber = null) => {
    const trimmedReason = normalizeReason(reason);
    const grn = await _loadGrnWithApproval(grnId, tenantId);
    const sendBackFrom = new Set(['VALIDATED', 'PENDING_APPROVAL', 'PENDING_FINANCE']);
    if (!sendBackFrom.has(grn.status)) {
        throw Object.assign(new Error('GRN cannot be sent back from its current status.'), { status: 422 });
    }
    if (!grn.approvalRequest) {
        throw Object.assign(new Error('GRN has no active approval request.'), { status: 404 });
    }
    const chain = await _resolveGrnChain(grn, tenantId);
    _assertGrnDualGate(user, grn.approvalRequest, chain);
    assertConcurrencyVersion(expectedVersion, grn.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.GRN, entityId: grnId, changedBy: user.id },
    });
    const currentStepNo = Number(grn.approvalRequest.currentStep);
    const allowedTargets = buildGrnSendBackTargets(grn, grn.approvalRequest);

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

    const nextStatus = targetStepNo === 0 ? 'DRAFT' : _statusForGrnAwaitingStep(chain, targetStepNo);

    await prisma.$transaction(async (tx) => {
        await tx.grnImport.update({
            where: { id: grnId },
            data: bumpConcurrencyUpdate({
                status: nextStatus,
                ...(targetStepNo === 0
                    ? { notes: appendSendBackNotes(grn.notes, trimmedReason) }
                    : {}),
            }),
        });
        await executeWorkflowSendBackInTx(tx, {
            approvalRequest: grn.approvalRequest,
            sourceStepNumber: currentStepNo,
            forceTargetStepNumber: targetStepNo,
            reason: trimmedReason,
            userId: user.id,
            tenantId,
            entityType: EntityType.GRN,
            entityId: grnId,
            documentStatusBefore: grn.status,
            documentStatusAfter: nextStatus,
        });
    });

    return getGrn(grnId, tenantId);
};

const normalizePatchStatus = (status) => {
    const s = String(status || '').toUpperCase();
    if (s === 'APPROVED') return 'PENDING_FINANCE';
    return s;
};

/** Governed status transitions — ACC dual gate + GRN_MANAGE permission. */
const updateStatus = async (grnId, tenantId, status, reason, userId, user, expectedVersion = null) => {
    const grn = await prisma.grnImport.findFirst({
        where: { id: grnId, tenantId },
        include: { lines: true },
    });
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });

    const target = normalizePatchStatus(status);

    if (!['PENDING_FINANCE', 'POSTED', 'REJECTED'].includes(target)) {
        throw Object.assign(
            new Error('Invalid target status. Use PENDING_FINANCE, POSTED, or REJECTED.'),
            { status: 400 },
        );
    }

    if (target === 'REJECTED') {
        const r = (reason || '').trim();
        if (!r) throw Object.assign(new Error('Rejection reason is required.'), { status: 400 });
        return _rejectGrnApproval(grnId, tenantId, user, r, expectedVersion);
    }

    if (target === 'PENDING_FINANCE') {
        if (grn.status !== 'VALIDATED' && grn.status !== 'PENDING_APPROVAL') {
            throw Object.assign(
                new Error(`GRN must be VALIDATED for Cost Control review. Current status: ${grn.status}`),
                { status: 422 },
            );
        }
        return _advanceGrnApprovalStep(grnId, tenantId, user, reason, expectedVersion);
    }

    if (grn.status !== 'PENDING_FINANCE') {
        throw Object.assign(
            new Error(`GRN must be awaiting Finance approval. Current status: ${grn.status}`),
            { status: 422 },
        );
    }
    return _advanceGrnApprovalStep(grnId, tenantId, user, reason, expectedVersion);
};

// ─── Post GRN (Atomic) ───────────────────────────────────────────────────────

/** @deprecated Manual post removed — use POST /grn/:id/approve (Finance approval auto-posts). */
const postGrn = async () => {
    throw Object.assign(
        new Error(
            'Manual GRN posting is disabled. Finance must approve via POST /grn/:id/approve.',
        ),
        { status: 410 },
    );
};

// ─── Queries ─────────────────────────────────────────────────────────────────

/** List filter only: comma-separated statuses → `{ status: { in } }` (see breakage `buildStatusWhere`). */
const buildGrnStatusWhere = (statusRaw) => {
    const raw = typeof statusRaw === 'string' ? statusRaw.trim() : '';
    if (!raw) return {};
    if (raw.includes(',')) {
        const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
        return parts.length === 0
            ? {}
            : parts.length === 1
              ? { status: parts[0] }
              : { status: { in: parts } };
    }
    return { status: raw };
};

/** GRN.locationId is non-null — drop invalid `{ locationId: null }` branches from shared scopeWhere. */
const normalizeGrnListScopeWhere = (scopeWhere) => {
    if (!scopeWhere?.OR || !Array.isArray(scopeWhere.OR)) return scopeWhere;
    const clauses = scopeWhere.OR.filter((clause) => {
        if (!clause || !Object.prototype.hasOwnProperty.call(clause, 'locationId')) return true;
        if (clause.locationId === null) return false;
        if (clause.locationId?.equals === null) return false;
        return true;
    });
    if (clauses.length === 0) return { locationId: { in: [] } };
    if (clauses.length === 1) return clauses[0];
    return { OR: clauses };
};

const listGrns = async (tenantId, { status, page = 1, limit = 20 } = {}, user = null) => {
    const scope = user ? await resolveScopeContext(user, tenantId) : null;
    const scopeWhere = scope
        ? normalizeGrnListScopeWhere(scopeWhereFor(SCOPE_MODULE.GRN, scope))
        : {};
    // Operational register only: hide empty technical DRAFTs (continuity session shells).
    // Real create always has ≥1 line; empty DRAFT rows are continuity artifacts.
    const excludeEmptyContinuityDrafts = {
        NOT: {
            AND: [{ status: 'DRAFT' }, { lines: { none: {} } }],
        },
    };
    const where = {
        tenantId,
        ...scopeWhere,
        ...buildGrnStatusWhere(status),
        ...excludeEmptyContinuityDrafts,
    };
    const [total, data] = await Promise.all([
        prisma.grnImport.count({ where }),
        prisma.grnImport.findMany({
            where,
            include: {
                vendor: { select: { name: true } },
                location: { select: { name: true } },
                importedByUser: { select: { firstName: true, lastName: true } },
                rejectedByUser: { select: { firstName: true, lastName: true } },
                _count: { select: { lines: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        }),
    ]);
    const scopeMeta = scope ? metaFor(scope, { total }) : null;
    const enriched = data.map((row) => ({
        ...row,
        userFacingState: mapUserFacingState('GRN', row.status, { notes: row.notes }),
    }));
    return { total, page, limit, data: enriched, ...scopeMeta };
};

const getGrn = async (grnId, tenantId, user = null) => {
    const grn = await prisma.grnImport.findFirst({
        where: { id: grnId, tenantId },
        include: {
            vendor: { select: { name: true } },
            location: { select: { name: true } },
            importedByUser: { select: { firstName: true, lastName: true } },
            approvedByUser: { select: { firstName: true, lastName: true } },
            postedByUser: { select: { firstName: true, lastName: true } },
            rejectedByUser: { select: { firstName: true, lastName: true } },
            lastEditedByUser: { select: { firstName: true, lastName: true } },
            lines: true,
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
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });
    if (user) {
        const scope = await resolveScopeContext(user, tenantId);
        await assertInScope(SCOPE_MODULE.GRN, grn, scope, 'read');
    }

    // Enrich lines with item and UOM names via separate queries
    if (grn.lines.length > 0) {
        const itemIds = [...new Set(grn.lines.map(l => l.internalItemId).filter(Boolean))];
        const uomIds = [...new Set(grn.lines.map(l => l.internalUomId).filter(Boolean))];
        const [items, units] = await Promise.all([
            itemIds.length
                ? prisma.item.findMany({
                      where: { id: { in: itemIds }, tenantId },
                      select: { id: true, name: true, barcode: true },
                  })
                : [],
            uomIds.length
                ? prisma.unit.findMany({
                      where: { id: { in: uomIds }, tenantId },
                      select: { id: true, name: true, abbreviation: true },
                  })
                : [],
        ]);
        const itemMap = Object.fromEntries(items.map(i => [i.id, i]));
        const uomMap = Object.fromEntries(units.map(u => [u.id, u]));
        grn.lines = grn.lines.map(l => ({
            ...l,
            item: itemMap[l.internalItemId] || null,
            uom: uomMap[l.internalUomId] || null,
        }));
    }

    let pdfAttachmentDisplayUrl = null;
    if (grn.pdfAttachmentUrl) {
        try {
            const storage = getStorage();
            pdfAttachmentDisplayUrl = await storage.getSignedUrl(grn.pdfAttachmentUrl);
        } catch {
            pdfAttachmentDisplayUrl = null;
        }
    }

    const workflowTimeline = enrichTimelineSlotsWithDuration(buildGrnWorkflowTimeline(grn));

    let chain = null;
    try {
        chain = await _resolveGrnChain(grn, tenantId);
    } catch {
        chain = null;
    }
    const workflow = buildGrnWorkflowContext(grn, chain);
    const sendBackTargets =
        grn.approvalRequest &&
        ['VALIDATED', 'PENDING_APPROVAL', 'PENDING_FINANCE'].includes(String(grn.status || '').toUpperCase())
            ? buildGrnSendBackTargets(grn, grn.approvalRequest)
            : [];

    return {
        ...grn,
        userFacingState: mapUserFacingState('GRN', grn.status, { notes: grn.notes }),
        pdfAttachmentDisplayUrl,
        workflowTimeline,
        workflow,
        sendBackTargets,
    };
};

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * PATCH /api/grn/:id — optional `notes` only (Ch.2.7: rejected/posted documents are read-only).
 */
const updateGrn = async (grnId, tenantId, body = {}, userId, expectedVersion) => {
    const {
        notes,
        lines,
        supplierId,
        locationId,
        receivingDate,
        supplierInvoiceNumber,
        grnNumber,
    } = body;
    const hasLines = lines !== undefined;
    const hasNotes = notes !== undefined;
    const hasHeader =
        supplierId !== undefined ||
        locationId !== undefined ||
        receivingDate !== undefined ||
        supplierInvoiceNumber !== undefined ||
        grnNumber !== undefined;

    if (!hasLines && !hasNotes && !hasHeader)
        throw Object.assign(new Error('No updates provided.'), { status: 400 });

    const grn = await prisma.grnImport.findFirst({
        where: { id: grnId, tenantId },
        include: { lines: true },
    });
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });

    const { assertPostingPeriodFieldsImmutable } = require('../platform/postingPeriod.util');
    assertPostingPeriodFieldsImmutable(grn, body);

    if (grn.status === 'REJECTED') {
        throw Object.assign(
            new Error('Rejected GRNs are read-only. Create a new GRN to repeat the operation (Ch.2.7).'),
            { status: 422 },
        );
    }

    if (grn.status === 'POSTED')
        throw Object.assign(new Error('GRN is POSTED and is fully read-only.'), { status: 423 });

    if (grn.status !== 'DRAFT') {
        if (hasLines) {
            throw Object.assign(
                new Error('Line items cannot be changed after draft submission.'),
                { status: 422 },
            );
        }
        if (hasHeader) {
            throw Object.assign(
                new Error('Header fields cannot be changed after draft submission.'),
                { status: 422 },
            );
        }
    }

    const { assertDocumentEditableByLifecycle } = require('../platform/lifecyclePresentation.service');
    assertDocumentEditableByLifecycle('GRN', grn.status, { notes: grn.notes });

    assertConcurrencyVersion(expectedVersion, grn.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.GRN, entityId: grnId, changedBy: userId },
    });

    if (grn.status === 'DRAFT' && hasLines) {
        if (!Array.isArray(lines) || lines.length === 0) {
            throw Object.assign(new Error('At least one line item is required.'), { status: 400 });
        }
        const itemIds = [...new Set(lines.map((l) => l.itemId))];
        const foundItems = await prisma.item.findMany({
            where: { id: { in: itemIds }, tenantId },
        });
        const foundItemIds = new Set(foundItems.map((i) => i.id));
        const missingIds = itemIds.filter((id) => !foundItemIds.has(id));
        if (missingIds.length) {
            throw Object.assign(
                new Error(`${missingIds.length} item(s) not found in Item Master.`),
                { status: 422, details: missingIds },
            );
        }
        const invalidLines = lines.filter((l) => Number(l.receivedQty) <= 0);
        if (invalidLines.length) {
            throw Object.assign(new Error('All received quantities must be greater than zero.'), { status: 400 });
        }
        for (const l of lines) {
            assertIntegerQuantity({
                qty: l.receivedQty,
                field: 'receivedQty',
                message: 'Quantity must be a whole number (integer). Fractional quantities are not allowed.',
                details: { itemId: l.itemId, receivedQty: Number(l.receivedQty) },
            });
        }
        const itemMap = Object.fromEntries(foundItems.map((i) => [i.id, i]));
        await prisma.$transaction(async (tx) => {
            await tx.grnLine.deleteMany({ where: { grnImportId: grnId } });
            await tx.grnImport.update({
                where: { id: grnId },
                data: bumpConcurrencyUpdate({
                    ...(hasNotes ? { notes } : {}),
                    ...(supplierId ? { vendorId: supplierId } : {}),
                    ...(locationId ? { locationId } : {}),
                    ...(receivingDate ? { receivingDate: new Date(receivingDate) } : {}),
                    ...(supplierInvoiceNumber || grnNumber
                        ? { supplierInvoiceNumber: (supplierInvoiceNumber || grnNumber || '').trim() }
                        : {}),
                    updatedAt: new Date(),
                }),
            });
            await tx.grnLine.createMany({
                data: lines.map((l) => {
                    const received = Number(l.receivedQty);
                    const orderedRaw = l.orderedQty;
                    const ordered =
                        orderedRaw != null && orderedRaw !== '' ? Number(orderedRaw) : received;
                    return {
                        grnImportId: grnId,
                        futurelogItemCode: itemMap[l.itemId]?.barcode || l.itemId,
                        futurelogDescription: itemMap[l.itemId]?.name || '',
                        futurelogUom: l.uomId,
                        orderedQty: Number.isFinite(ordered) ? ordered : received,
                        receivedQty: received,
                        unitPrice: Number(l.unitPrice) || 0,
                        internalItemId: l.itemId,
                        internalUomId: l.uomId,
                        conversionFactor: 1,
                        qtyInBaseUnit: received,
                        isMapped: true,
                    };
                }),
            });
        });
        return getGrn(grnId, tenantId);
    }

    const supplier = supplierId
        ? await prisma.supplier.findFirst({ where: { id: supplierId, tenantId } })
        : null;

    await prisma.grnImport.update({
        where: { id: grnId },
        data: bumpConcurrencyUpdate({
            ...(hasNotes ? { notes } : {}),
            ...(supplierId ? { vendorId: supplierId, vendorNameSnapshot: supplier?.name || grn.vendorNameSnapshot } : {}),
            ...(locationId ? { locationId } : {}),
            ...(receivingDate ? { receivingDate: new Date(receivingDate) } : {}),
            ...(supplierInvoiceNumber || grnNumber
                ? { supplierInvoiceNumber: (supplierInvoiceNumber || grnNumber || '').trim() }
                : {}),
            updatedAt: new Date(),
        }),
    });
    return getGrn(grnId, tenantId);
};

const deleteGrn = async (grnId, tenantId, userId = null, expectedVersion = null) => {
    const grn = await prisma.grnImport.findFirst({ where: { id: grnId, tenantId } });
    if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });

    if (grn.status !== 'DRAFT')
        throw Object.assign(
            new Error(`Only DRAFT GRNs can be deleted. Current status: ${grn.status}`),
            { status: 423 }
        );

    assertConcurrencyVersion(expectedVersion, grn.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.GRN, entityId: grnId, changedBy: userId ?? grn.importedBy },
    });

    await prisma.grnImport.delete({ where: { id: grnId } });
};

// ─── Excel Template ───────────────────────────────────────────────────────────

/**
 * Generate a GRN Excel template with sample data.
 * Columns: Item Barcode | Item Name (ref) | Qty* | Unit Price
 */
const generateGrnTemplate = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('GRN Template');

    ws.columns = [
        { header: 'Item Barcode *', key: 'barcode', width: 22 },
        { header: 'Item Name (ref)', key: 'itemName', width: 30 },
        { header: 'Qty *', key: 'receivedQty', width: 14 },
        { header: 'Unit Price', key: 'unitPrice', width: 14 },
    ];

    // Style header row
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    // Sample rows
    ws.addRow({ barcode: 'ITEM-001', itemName: 'Example Item 1', receivedQty: 10, unitPrice: 25.00 });
    ws.addRow({ barcode: 'ITEM-002', itemName: 'Example Item 2', receivedQty: 4, unitPrice: 12.50 });

    // Instructions sheet
    const info = wb.addWorksheet('Instructions');
    info.getColumn(1).width = 70;
    info.addRow(['GRN Import Template — Instructions']).font = { bold: true, size: 13 };
    info.addRow(['']);
    info.addRow(['1. Item Barcode is REQUIRED and must match an existing item in the system.']);
    info.addRow(['2. Qty is REQUIRED and must be greater than 0.']);
    info.addRow(['3. Item Name column is for your reference — it is NOT used during import.']);
    info.addRow(['4. Leave Unit Price empty if not applicable.']);
    info.addRow(['5. Do NOT change column headers or add/remove columns.']);
    info.addRow(['6. After upload, any rows with invalid barcodes will be shown as errors and skipped.']);

    return wb;
};

// ─── Excel Preview ────────────────────────────────────────────────────────────

/**
 * Parse uploaded GRN Excel, validate each row against Item Master.
 * When locationId is provided, rows must also resolve in RECEIVING catalog for that warehouse.
 */
const previewGrnExcel = async (fileBufferOrPath, tenantId, locationId = null) => {
    const wb = new ExcelJS.Workbook();
    try {
        if (Buffer.isBuffer(fileBufferOrPath)) {
            await wb.xlsx.load(fileBufferOrPath);
        } else {
            await wb.xlsx.readFile(fileBufferOrPath);
        }
    } catch {
        throw Object.assign(new Error('Failed to read Excel file. Make sure it is a valid .xlsx or .xls file.'), { status: 400 });
    }

    const ws = wb.worksheets[0];
    if (!ws) throw Object.assign(new Error('Excel file is empty.'), { status: 400 });

    // Read header row to find columns
    const headerRow = ws.getRow(1);
    const colMap = {};
    headerRow.eachCell((cell, colNum) => {
        const h = (cell.value || '').toString().toLowerCase().trim();
        if (h.includes('barcode')) colMap.barcode = colNum;
        if (h.includes('name') || h.includes('item name')) colMap.itemName = colNum;
        if (h.includes('ordered')) colMap.orderedQty = colNum;
        if (h.includes('received')) colMap.receivedQty = colNum;
        if (h.includes('price')) colMap.unitPrice = colNum;
    });

    // "Qty" column (new template) — avoid matching "ordered qty"
    if (!colMap.receivedQty) {
        headerRow.eachCell((cell, colNum) => {
            const h = (cell.value || '').toString().toLowerCase().trim();
            const isQty = /\bqty\b/.test(h) || h === 'quantity' || h.endsWith(' qty') || h.startsWith('qty ');
            if (isQty && !h.includes('ordered')) colMap.receivedQty = colNum;
        });
    }

    if (!colMap.barcode && !colMap.itemName) throw Object.assign(new Error('"Item Barcode" or "Item Name" column not found. Use the provided template.'), { status: 400 });
    if (!colMap.receivedQty) throw Object.assign(new Error('"Qty" or "Received Qty" column not found. Use the provided template.'), { status: 400 });

    // Collect rows — accept rows with barcode OR item name
    const rawRows = [];
    ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return; // skip header
        const barcode = colMap.barcode ? (row.getCell(colMap.barcode).value || '').toString().trim() : '';
        const nameVal = colMap.itemName ? (row.getCell(colMap.itemName).value || '').toString().trim() : '';
        // Skip rows that have neither barcode nor name
        if (!barcode && !nameVal) return;
        const rcvCell = row.getCell(colMap.receivedQty);
        if (!rcvCell.value && rcvCell.value !== 0) return; // skip fully empty rows
        const explicitOrdered = colMap.orderedQty
            ? Number(row.getCell(colMap.orderedQty).value)
            : NaN;
        const rcvNum = Number(rcvCell.value);
        rawRows.push({
            rowNum,
            barcode: barcode || null,
            itemName: nameVal || null,
            orderedQty: Number.isFinite(explicitOrdered) ? explicitOrdered : rcvNum,
            receivedQty: rcvCell.value,
            unitPrice: Number(colMap.unitPrice ? row.getCell(colMap.unitPrice).value : 0) || 0,
        });
    });

    if (rawRows.length === 0) throw Object.assign(new Error('No data rows found in the file. Make sure the rows have Item Barcode or Item Name filled in.'), { status: 400 });
    if (rawRows.length > 500) throw Object.assign(new Error('Too many rows. Maximum 500 rows per import.'), { status: 400 });

    let allowedItemIds = null;
    if (locationId) {
        const location = await prisma.location.findFirst({
            where: { id: locationId, tenantId },
        });
        if (!location) {
            throw Object.assign(new Error('Warehouse/Location not found.'), { status: 404 });
        }
        const locationItemResolution = require('./location-item-resolution.service');
        const { items: locItems } = await locationItemResolution.resolveItemsForLocation(
            tenantId,
            locationId,
            {
                mode: locationItemResolution.MODES.RECEIVING,
                includeZeroOnHand: 'true',
            },
        );
        allowedItemIds = new Set(locItems.map((i) => i.id));
    }

    // Resolve barcodes → items (primary), then fallback to name (case-insensitive)
    const barcodes = [...new Set(rawRows.map(r => r.barcode).filter(Boolean))];
    const names = [...new Set(rawRows.map(r => r.itemName).filter(Boolean))];
    const items = await prisma.item.findMany({
        where: {
            tenantId,
            OR: [
                ...(barcodes.length ? [{ barcode: { in: barcodes } }] : []),
                ...(names.length ? [{ name: { in: names, mode: 'insensitive' } }] : []),
            ]
        },
        include: { itemUnits: { where: { unitType: 'BASE' }, include: { unit: true } } },
    });
    const itemByBarcode = Object.fromEntries(items.filter(i => i.barcode).map(i => [i.barcode.toLowerCase(), i]));
    const itemByName = Object.fromEntries(items.map(i => [i.name.toLowerCase(), i]));

    const rows = [];
    let valid = 0;
    let invalid = 0;

    for (const raw of rawRows) {
        const errors = [];
        // lookup by barcode first, then name
        const item = (raw.barcode ? itemByBarcode[raw.barcode.toLowerCase()] : null)
            || (raw.itemName ? itemByName[raw.itemName.toLowerCase()] : null);
        const rcvQty = Number(raw.receivedQty);

        if (!item) errors.push(`Item "${raw.barcode || raw.itemName}" not found in Item Master.`);
        if (item && allowedItemIds && !allowedItemIds.has(item.id)) {
            errors.push(`Item "${item.name}" is not available at the selected warehouse.`);
        }
        if (!rcvQty || rcvQty <= 0) errors.push('Qty must be greater than 0.');
        else if (!isIntegerQuantity(rcvQty)) {
            errors.push('Quantity must be a whole number (integer). Fractional quantities are not allowed.');
        }

        const baseUnit = item?.itemUnits?.[0];
        const ok = errors.length === 0;
        if (ok) valid++; else invalid++;

        rows.push({
            rowNum: raw.rowNum,
            barcode: raw.barcode || item?.barcode || '—',
            itemName: item?.name || raw.itemName || '—',
            itemId: item?.id || null,
            uomId: baseUnit?.unitId || null,
            uomName: baseUnit?.unit?.abbreviation || baseUnit?.unit?.name || '',
            imageUrl: item?.imageUrl || null,
            orderedQty: raw.orderedQty,
            receivedQty: rcvQty,
            unitPrice: raw.unitPrice,
            status: ok ? 'VALID' : 'ERROR',
            errors,
        });
    }

    return { total: rawRows.length, valid, invalid, rows };
};

// ─── PDF Smart Extraction Helpers ──────────────────────────────────────────

// Lines that are definitely NOT item lines
const PDF_SKIP_RE = /^\s*(total|sub.?total|vat|tax|discount|invoice|date|due|payment|page|po|attention|bill to|ship to|from|to|dear|ref|item|qty|quantity|unit|price|amount|gross|net|balance|terms|thank|regards|generated|prepared|authorized)\b/i;

const NOISE_WORDS = new Set(['the', 'and', 'for', 'pcs', 'box', 'ctn', 'doz', 'each', 'ea', 'pc', 'set', 'roll', 'bag', 'btl', 'bottle', 'pack', 'case', 'nos', 'no', 'piece', 'pieces']);

// Normalize text for fuzzy comparison
const normPdf = (str) => (str || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// % of pattern words found in text
const fuzzyPdfScore = (text, pattern) => {
    const tWords = new Set(normPdf(text).split(' ').filter(w => w.length > 2 && !NOISE_WORDS.has(w)));
    const pWords = normPdf(pattern).split(' ').filter(w => w.length > 2 && !NOISE_WORDS.has(w));
    if (!pWords.length || !tWords.size) return 0;
    const matched = pWords.filter(w => [...tWords].some(t => t === w || t.includes(w) || w.includes(t)));
    return Math.round((matched.length / pWords.length) * 100);
};

// ─── PDF Preview (Smart Multi-Strategy) ─────────────────────────────────────

/**
 * Smart PDF invoice parser.
 * Extracts item-like lines (description + qty) and matches them to Item Master
 * using: exact barcode → fuzzy name (>=60%) → UNMAPPED (needs manual mapping).
 */
const previewGrnPdf = async (fileBufferOrPath, tenantId) => {
    // ── Step 1: Extract raw text ─────────────────────────────────────────────
    let pdfText = '';
    try {
        const buffer = Buffer.isBuffer(fileBufferOrPath)
            ? fileBufferOrPath
            : fs.readFileSync(fileBufferOrPath);
        const data = await pdfParse(buffer, { max: 0 });
        pdfText = data.text || '';
    } catch (err) {
        console.warn('[GRN PDF] pdf-parse failed:', err.message);
        return {
            total: 0, valid: 0, suggested: 0, unmapped: 0, invalid: 0, rows: [],
            warning: 'Could not extract text from this PDF. It may be a scanned image or encrypted. Use Import Excel instead.',
        };
    }

    if (!pdfText.trim()) {
        return {
            total: 0, valid: 0, suggested: 0, unmapped: 0, invalid: 0, rows: [],
            warning: 'No readable text found in this PDF. It may be a scanned/image PDF. Use Import Excel instead.',
        };
    }

    // ── Step 2: Detect candidate item lines ──────────────────────────────────
    const textLines = pdfText.split(/\n/);
    const candidates = [];

    textLines.forEach((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line || line.length < 5) return;
        if (PDF_SKIP_RE.test(line)) return;
        if (!/\d/.test(line)) return; // must contain a number

        // Pattern: [description text] [number=qty] [optional unit text] [optional number=price]
        const m = /^(.{3,80?})\s+(\d[\d,]*(?:\.\d+)?)\s*([A-Za-z]{2,5})?\s*([\d,]+(?:\.\d+)?)?\s*([\d,]+(?:\.\d+)?)?$/.exec(line);
        if (!m) {
            // Fallback: text before first standalone number block
            const fb = /^([A-Za-z][^\d]{2,60})\s+(\d[\d,.]+)(?:\s+([\d,.]+))?/.exec(line);
            if (!fb) return;
            const qty = parseFloat(fb[2].replace(',', '.'));
            if (!qty || qty <= 0 || qty > 99999) return;
            candidates.push({ rowNum: idx + 1, rawLine: line, description: fb[1].trim(), qty, unit: null, unitPrice: fb[3] ? parseFloat(fb[3].replace(',', '.')) : 0 });
            return;
        }

        const desc = m[1].trim();
        const qty = parseFloat(m[2].replace(',', '.'));
        if (!qty || qty <= 0 || qty > 99999) return;
        if (desc.length < 3) return;

        let unit = null;
        let price = 0;
        if (m[3] && isNaN(Number(m[3]))) {
            unit = m[3];
            price = m[4] ? parseFloat(m[4].replace(',', '.')) : 0;
        } else {
            price = m[3] ? parseFloat(m[3].replace(',', '.')) : 0;
        }

        candidates.push({ rowNum: idx + 1, rawLine: line, description: desc, qty, unit, unitPrice: price || 0 });
    });

    if (candidates.length === 0) {
        return {
            total: 0, valid: 0, suggested: 0, unmapped: 0, invalid: 0, rows: [],
            warning: 'Could not detect any item lines in this PDF. Make sure it contains a structured item list with quantities.',
        };
    }

    // ── Step 3: Load all tenant items for matching ───────────────────────────
    const allItems = await prisma.item.findMany({
        where: { tenantId, isActive: true },
        include: { itemUnits: { where: { unitType: 'BASE' }, include: { unit: true } } },
        take: 3000,
    });
    const itemByBarcode = {};
    allItems.forEach(i => { if (i.barcode) itemByBarcode[i.barcode.toLowerCase()] = i; });

    // ── Step 4: Match each candidate ─────────────────────────────────────────
    const usedItemIds = new Set();
    const rows = [];
    let valid = 0, suggested = 0, unmapped = 0;

    for (const cand of candidates) {
        const descLower = cand.description.toLowerCase();

        // Strategy A: Exact barcode match (whole description or first token)
        let matchedItem = itemByBarcode[descLower];
        if (!matchedItem) {
            const firstToken = cand.description.split(/\s+/)[0].toLowerCase();
            matchedItem = itemByBarcode[firstToken];
        }

        let confidence = matchedItem ? 100 : 0;
        let status = 'UNMAPPED';

        // Strategy B: Fuzzy name match
        if (!matchedItem) {
            let bestScore = 0;
            let bestItem = null;
            for (const item of allItems) {
                const score = fuzzyPdfScore(cand.description, item.name);
                if (score > bestScore) { bestScore = score; bestItem = item; }
            }
            if (bestScore >= 60) {
                matchedItem = bestItem;
                confidence = bestScore;
                status = 'SUGGESTED';
            }
        } else {
            status = 'VALID';
        }

        // Merge duplicates (same item mapped from different PDF lines → sum qty)
        if (matchedItem && usedItemIds.has(matchedItem.id)) {
            const existingRow = rows.find(r => r.itemId === matchedItem.id);
            if (existingRow) { existingRow.receivedQty += cand.qty; continue; }
        }
        if (matchedItem) usedItemIds.add(matchedItem.id);

        const baseUnit = matchedItem?.itemUnits?.[0];
        const errors = [];

        if (!matchedItem) {
            status = 'UNMAPPED';
            errors.push('No matching item found in Item Master — please map manually.');
            unmapped++;
        } else if (status === 'SUGGESTED') {
            errors.push(`Auto-matched with ${confidence}% confidence — please verify.`);
            suggested++;
        } else {
            valid++;
        }

        rows.push({
            rowNum: cand.rowNum,
            extractedText: cand.description,
            extractedQty: cand.qty,
            extractedUnit: cand.unit,
            extractedPrice: cand.unitPrice,
            barcode: matchedItem?.barcode || null,
            itemName: matchedItem?.name || null,
            itemId: matchedItem?.id || null,
            uomId: baseUnit?.unitId || null,
            uomName: baseUnit?.unit?.abbreviation || null,
            orderedQty: 0,
            receivedQty: cand.qty,
            unitPrice: cand.unitPrice,
            status,
            confidence,
            errors,
        });
    }

    return { total: rows.length, valid, suggested, unmapped, invalid: 0, rows };
};

module.exports = {
    createGrn,
    validateGrn,
    submitForApproval,
    approveGrn,
    rejectGrn,
    updateStatus,
    postGrn,
    listGrns,
    getGrn,
    getEvidence: (id, tenantId, user) =>
        require('./grnEvidence.service').getGrnEvidence(id, tenantId, user),
    updateGrn,
    sendBackGrn,
    deleteGrn,
    generateGrnTemplate,
    previewGrnExcel,
    previewGrnPdf,
};
