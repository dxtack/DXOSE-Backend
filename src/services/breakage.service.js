const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const emailService = require('./email.service');
const { connectRole, normalizeRole } = require('./rbac.service');
const { assertUserHasBreakageLostStepPermission, withWorkflowOverrideAudit, buildWorkflowOverrideAuditFields, appendWorkflowOverrideComment } = require('../acc-authority/step-permission-enforcement');
const {
    resolveScopeContext,
    scopeWhereFor,
    metaFor,
    assertInScope,
    assertLocationInScope,
    isScopeEngineEnabled,
    SCOPE_MODULE,
} = require('./scope/scopeContext');
const { validatePostingDate } = require('./periodGuard.service');
const { formatStructuredMovementNotes } = require('../utils/formatMovementNotes');
const { enrichMovementLinesFinancials } = require('../utils/movementLineFinancial.util');
const { assertLinesHaveStockAtLocation } = require('./location-item-resolution.service');
const { assertIntegerQuantity } = require('./integerQuantityGuard.service');
const { getStorage, isLocalDriver } = require('../config/storage');
const path = require('path');
const crypto = require('crypto');
const { moduleKeyForRequestType } = require('../engines/workflow-resolution.engine');
const {
    resolveMovementWorkflowChain,
    submitStatusFromApproval,
    documentStatusAfterApprovingStep,
    documentStatusForPendingStep,
    inferApprovedStepCountFromDocumentStatus,
} = require('./acc-workflow-movement.runtime');
const {
    resolveWorkflowForDocument,
    resolveWorkflowByVersionId,
    approvalRequestVersionPin,
} = require('./acc-workflow-runtime.service');
const { generateDocNumber, DocPrefix } = require('./docNumbering.service');
const { assertAttachmentMutable } = require('../platform/attachmentGovernance.service');
const { ATTACHMENT_MAX_COUNT_PER_DOCUMENT } = require('../platform/attachmentPolicy.platform');
const { withUserFacingState } = require('../platform/lifecyclePresentation.service');
const { assertConcurrencyVersion, bumpConcurrencyUpdate } = require('../platform/concurrency.service');
const { getDisplayCurrency } = require('../platform/displayCurrency.service');
const { logAction, EntityType } = require('./auditTrail.service');
const { logGovernedEvent } = require('./auditGoverned.service');
const { resolveQtyInBaseUnit, assertClientBaseQtyMatches } = require('./unitConversion.util');
const { assertActiveAssignmentForMutation } = require('./scope/assignment-mutation.guard');
const {
    executeWorkflowSendBackInTx,
    executeCreatorResubmitInTx,
    normalizeReason,
} = require('../platform/workflowSendBack.service');
const { appendSendBackNotes, stripSendBackNotes } = require('../platform/lifecyclePresentation.service');

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BY_APPROVED_STEP = {
    1: 'DEPT_APPROVED',
    2: 'COST_CONTROL_APPROVED',
    3: 'FINANCE_APPROVED',
    4: 'POSTED',
};

/** Stored on approval_steps.accountabilityType for GET_PASS_RETURN workflow approvals. */
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
/** Legacy step comment — no longer written; stripped from timeline when present on old docs. */
const AUTO_APPROVAL_NOTE = 'Auto-approved by system due to high-level authority.';

/**
 * Creates an ACC-pinned approval request for movement documents (breakage/lost).
 *
 * Department step is NOT auto-approved by default.
 * Callers that know the creator holds ACC step 1 may pass `preApproveFirstStep: true`
 * (Breakage/Lost create/submit via attachApprovalAndEnterPipeline).
 * Get-pass return disposition may pass `preApproveFirstStep: true` when the document
 * is already created at `DEPT_APPROVED`.
 *
 * @param {object} opts
 * @param {boolean} [opts.preApproveFirstStep=false]
 */
const createMovementApprovalRequest = async (tx, {
    tenantId,
    documentId,
    createdBy,
    requestType,
    deptApproverUserId,
    firstStepComment,
    /** Pre-approved DEPT_MANAGER step: accountability from get-pass return lines (Workflow History). */
    firstStepAccountabilityType,
    autoApproveAllSteps = false,
    autoApprovedByUserId,
    autoApprovalComment,
    preApproveFirstStep = false,
}) => {
    const now = new Date();
    // Do not store system "auto-approved…" boilerplate on the step (timeline noise).
    const comment =
        typeof firstStepComment === 'string' && firstStepComment.trim()
            ? firstStepComment.trim()
            : null;
    const autoApproveAll = autoApproveAllSteps === true;
    const actingUserId = autoApprovedByUserId || deptApproverUserId;
    const rawAccountability =
        typeof firstStepAccountabilityType === 'string' ? firstStepAccountabilityType.trim() : '';
    const step1Accountability = rawAccountability && GET_PASS_ACCOUNTABILITY.has(rawAccountability)
        ? rawAccountability
        : undefined;

    const moduleKey = moduleKeyForRequestType(requestType) || 'BREAKAGE';
    const chain = await resolveWorkflowForDocument({ moduleKey, tenantId });
    const roleCodes = chain.roleCodes;
    const firstStepPreApproved = !autoApproveAll && preApproveFirstStep === true;
    const initialCurrentStep = autoApproveAll
        ? roleCodes.length
        : firstStepPreApproved
            ? Math.min(2, roleCodes.length)
            : 1;

    const existing = await tx.approvalRequest.findFirst({
        where: { documentId },
        select: { id: true },
    });
    if (existing) {
        return existing;
    }

    await tx.approvalRequest.create({
        data: {
            tenantId,
            requestType,
            status: autoApproveAll ? 'APPROVED' : 'PENDING',
            documentId,
            currentStep: initialCurrentStep,
            totalSteps: roleCodes.length,
            createdBy,
            ...(autoApproveAll ? { resolvedAt: now } : {}),
            ...approvalRequestVersionPin(chain),
            steps: {
                create: roleCodes.map((roleCode, index) => {
                    const stepNumber = index + 1;
                    const isPreApproved = autoApproveAll || (firstStepPreApproved && stepNumber === 1);
                    return {
                        stepNumber,
                        requiredRole: connectRole(roleCode),
                        status: isPreApproved ? 'APPROVED' : 'PENDING',
                        ...(isPreApproved
                            ? {
                                  actedByUser: { connect: { id: actingUserId } },
                                  actedAt: now,
                                  comment: autoApproveAll
                                      ? (typeof autoApprovalComment === 'string' &&
                                        autoApprovalComment.trim()
                                          ? autoApprovalComment.trim()
                                          : null)
                                      : comment,
                                  ...(stepNumber === 1 && step1Accountability
                                      ? { accountabilityType: step1Accountability }
                                      : {}),
                              }
                            : {}),
                    };
                }),
            },
        },
    });

};

const parseSaveAsDraftFlag = (value) => {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        const s = value.trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes';
    }
    return false;
};

/**
 * Attach ACC approval and promote document out of DRAFT into the live pipeline.
 * Single motion: if creator role matches ACC step 1, stamp Department and enter step 2.
 * Otherwise enter step 1 pending (e.g. Storekeeper create → live Dept Manager).
 */
const attachApprovalAndEnterPipeline = async (tx, {
    tenantId,
    documentId,
    userId,
    userRole,
    requestType,
    firstStepAccountabilityType,
}) => {
    const moduleKey = moduleKeyForRequestType(requestType) || 'BREAKAGE';
    const chain = await resolveWorkflowForDocument({ moduleKey, tenantId });
    const firstRole = normalizeRole(chain.roleCodes?.[0] || chain.steps?.[0]?.roleCode);
    const submitterRole = normalizeRole(userRole);
    const preApproveFirstStep =
        Boolean(firstRole) && Boolean(submitterRole) && firstRole === submitterRole;

    await createMovementApprovalRequest(tx, {
        tenantId,
        documentId,
        createdBy: userId,
        requestType,
        deptApproverUserId: userId,
        firstStepAccountabilityType,
        preApproveFirstStep,
    });

    const approval = await tx.approvalRequest.findFirst({
        where: { documentId },
        include: {
            steps: {
                include: { requiredRole: { select: { code: true } } },
            },
        },
    });
    if (!approval) throw err('Approval record not found.', 404);

    const resolvedChain = await resolveMovementWorkflowChain(approval, moduleKey, tenantId);
    const { status: submitStatus, pendingStepNumber } = submitStatusFromApproval(
        resolvedChain,
        approval.steps || [],
    );

    await tx.movementDocument.update({
        where: { id: documentId },
        data: bumpConcurrencyUpdate({ status: submitStatus }),
    });
    await tx.approvalRequest.update({
        where: { id: approval.id },
        data: { currentStep: pendingStepNumber },
    });

    // Mirror Get Pass: immutable SUBMIT (+ Dept APPROVE when step-1 pre-approved)
    // so Workflow Timeline survives Send Back → Creator.
    const entityType = requestType === 'LOST' ? EntityType.LOST : EntityType.BREAKAGE;
    const approvePrefix = requestType === 'LOST' ? 'LOST_APPROVE_STEP' : 'BREAKAGE_APPROVE_STEP';
    await logAction({
        tenantId,
        entityType,
        entityId: documentId,
        action: 'SUBMIT',
        changedBy: userId,
        tx,
    });
    if (preApproveFirstStep) {
        const step1 = (approval.steps || []).find((s) => Number(s.stepNumber) === 1);
        const roleCode =
            step1?.requiredRole?.code || firstRole || '';
        await logAction({
            tenantId,
            entityType,
            entityId: documentId,
            action: 'APPROVE',
            changedBy: userId,
            note: `${approvePrefix}:1:${roleCode}`,
            beforeValue: { step: 1, status: 'DRAFT' },
            afterValue: { step: 1, roleCode, preApprove: true },
            tx,
        });
    }
};

/** Cross-department list + approval-chain payload for these roles (tenant-wide). */
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
 * For approver roles, the workflow tab keeps documents the user has already advanced
 * until the record is fully APPROVED (archive).
 * - COST_CONTROL + tab DEPT_APPROVED → DEPT_APPROVED or COST_CONTROL_APPROVED
 * - FINANCE_MANAGER + tab COST_CONTROL_APPROVED → COST_CONTROL_APPROVED or FINANCE_APPROVED
 * - GENERAL_MANAGER + tab FINANCE_APPROVED → FINANCE_APPROVED only
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

const breakageListInclude = (user) => {
    const role = user?.role ? normalizeRole(user.role) : '';
    const fullApproval = TENANT_WIDE_MOVEMENT_APPROVAL_ROLES.has(role);
    const base = {
        createdByUser: { select: { firstName: true, lastName: true } },
        getPass: { select: { id: true, passNo: true } },
        _count: { select: { lines: true } },
        lines: { select: { qtyInBaseUnit: true, photoKey: true, attachmentUrl: true } },
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

const err = (msg, code = 400) => Object.assign(new Error(msg), { statusCode: code });

const buildBreakagePhotoKey = (tenantId, originalName, documentNo, suffix = '') => {
    const ext = path.extname(originalName || '').toLowerCase() || '.jpg';
    const suffixPart = suffix !== '' && suffix !== undefined ? `-${suffix}` : '';
    if (isLocalDriver()) {
        return `/uploads/attachments/breakage-photo-${documentNo || Date.now()}${suffixPart}${ext}`;
    }
    return `tenants/${tenantId}/breakages/${crypto.randomUUID()}${ext}`;
};

const persistBreakagePhotos = async (photoFiles = [], tenantId, documentNo, user = null) => {
    if (!photoFiles.length) return { photoKey: null, attachmentUrl: null };

    const storage = getStorage();
    const uploadedBy = user
        ? `${user.firstName || ''} ${user.lastName || ''} (${user.role || ''})`.trim()
        : null;
    const attachments = [];

    for (let i = 0; i < photoFiles.length; i += 1) {
        const file = photoFiles[i];
        const keySuffix = i === 0 ? '' : i + 1;
        const key = buildBreakagePhotoKey(tenantId, file.originalname, documentNo, keySuffix);
        await storage.put(key, file.buffer, {
            contentType: file.mimetype,
            originalName: file.originalname,
        });
        attachments.push({
            key,
            url: key,
            originalName: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            uploadedBy,
            uploadedById: user?.id || null,
            uploadedAt: new Date().toISOString(),
        });
    }

    return {
        photoKey: attachments[0].key,
        attachmentUrl: JSON.stringify(attachments),
    };
};

const parseAttachmentJson = (raw) => {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

/**
 * Pre–per-line migration: photos lived on movement_documents. Map onto lines for read/API/UI.
 * Does not mutate DB — enrichment only.
 */
const applyLegacyDocumentPhotosToLines = (doc) => {
    if (!doc?.lines?.length) return doc.lines;

    const linesHaveMedia = doc.lines.some((line) => line.photoKey || line.attachmentUrl);
    if (linesHaveMedia) return doc.lines;

    const docItems = parseAttachmentJson(doc.attachmentUrl);
    if (!doc.photoKey && docItems.length === 0) return doc.lines;

    if (doc.lines.length === 1) {
        const line = doc.lines[0];
        return [{
            ...line,
            photoKey: line.photoKey || doc.photoKey || docItems[0]?.key || docItems[0]?.url || null,
            attachmentUrl: line.attachmentUrl || doc.attachmentUrl || null,
        }];
    }

    if (docItems.length > 1) {
        return doc.lines.map((line, index) => {
            const item = docItems[index];
            if (!item) return line;
            return {
                ...line,
                photoKey: item.key || item.url || null,
                attachmentUrl: JSON.stringify([item]),
            };
        });
    }

    const primaryKey = doc.photoKey || docItems[0]?.key || docItems[0]?.url || null;
    const primaryAttachment = doc.attachmentUrl
        || (docItems[0] ? JSON.stringify([docItems[0]]) : null);

    return doc.lines.map((line, index) => {
        if (index !== 0) return line;
        return {
            ...line,
            photoKey: primaryKey,
            attachmentUrl: primaryAttachment,
        };
    });
};

const countBreakageMediaItems = (doc) => {
    if (!doc || typeof doc !== 'object') return 0;

    const hydratedLines = applyLegacyDocumentPhotosToLines(doc);
    const lineCount = (hydratedLines || []).reduce((sum, line) => {
        if (!line.photoKey && !line.attachmentUrl) return sum;
        const items = parseAttachmentJson(line.attachmentUrl);
        if (items.length > 0) return sum + items.length;
        return sum + (line.photoKey ? 1 : 0);
    }, 0);
    if (lineCount > 0) return lineCount;

    const docItems = parseAttachmentJson(doc.attachmentUrl);
    if (doc.photoKey && !docItems.some((a) => (a.key || a.url) === doc.photoKey)) {
        return 1 + docItems.length;
    }
    if (doc.photoKey || docItems.length > 0) {
        return Math.max(1, docItems.length);
    }
    return 0;
};

const signAttachmentList = async (photoKey, attachmentUrlRaw) => {
    const storage = getStorage();
    const items = parseAttachmentJson(attachmentUrlRaw);
    if (photoKey && !items.some((a) => (a.key || a.url) === photoKey)) {
        items.unshift({ key: photoKey, url: photoKey });
    }
    if (!items.length) return { photoUrl: null, attachments: [] };

    const attachments = await Promise.all(
        items.map(async (a) => {
            const key = a.key || a.url;
            if (!key) return { ...a };
            try {
                const signed = await storage.getSignedUrl(key);
                return { ...a, url: signed };
            } catch {
                return { ...a };
            }
        }),
    );
    const photoUrl = attachments[0]?.url || null;
    return { photoUrl, attachments };
};

const withBreakageMediaUrls = async (doc) => {
    if (!doc || typeof doc !== 'object') return doc;

    const docMedia = await signAttachmentList(doc.photoKey, doc.attachmentUrl);
    const linesForMedia = applyLegacyDocumentPhotosToLines(doc);

    const lines = linesForMedia
        ? await Promise.all(
            linesForMedia.map(async (line) => {
                if (!line.photoKey && !line.attachmentUrl) {
                    return { ...line, photoUrl: null, attachments: [] };
                }
                const lineMedia = await signAttachmentList(line.photoKey, line.attachmentUrl);
                return { ...line, photoUrl: lineMedia.photoUrl, attachments: lineMedia.attachments };
            }),
        )
        : doc.lines;

    return { ...doc, photoUrl: docMedia.photoUrl, attachments: docMedia.attachments, lines };
};

/** @deprecated alias */
const withBreakagePhotoUrl = withBreakageMediaUrls;

const normalizeBreakageLines = (lines = [], linePhotosByIndex = []) => {
    const map = new Map();
    const order = [];

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!line?.locationId) {
            throw err('Each line requires a source location.', 400);
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
        const photos = Array.isArray(linePhotosByIndex[i]) ? linePhotosByIndex[i] : [];

        if (map.has(key)) {
            const prev = map.get(key);
            prev.qty += qty;
            const note = typeof line.notes === 'string' ? line.notes.trim() : '';
            if (note) {
                prev.notes = [prev.notes, note].filter(Boolean).join('; ');
            }
            prev.photos.push(...photos);
        } else {
            map.set(key, {
                itemId: line.itemId,
                locationId: line.locationId,
                qty,
                notes: typeof line.notes === 'string' ? line.notes.trim() || null : null,
                unitCost: line.unitCost,
                totalValue: line.totalValue,
                photos: [...photos],
            });
            order.push(key);
        }
    }

    return order.map((key) => {
        const entry = map.get(key);
        const { photos, ...rest } = entry;
        return { line: rest, photos };
    });
};

// ── Full include for breakage document ───────────────────────────────────────
const BREAKAGE_INCLUDE = {
    createdByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
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

// ── CREATE ────────────────────────────────────────────────────────────────────
const createBreakage = async (data, tenantId, user, linePhotosByIndex = []) => {
    const userId = user?.id;
    const _userRole = user?.role;
    const { isMovementCreateActorRole } = require('./breakageLostWorkflowContext.util');
    if (!isMovementCreateActorRole(_userRole)) {
        throw err(
            'Only Department Manager or Storekeeper (or Org/Super governance) may create breakage documents.',
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
    } = data;

    if (!reason?.trim()) throw err('Reason is required for breakage documents.');
    if (lines.length === 0) throw err('At least one line item is required.');
    if (!suggestedAction || !SUGGESTED_ACTIONS.has(String(suggestedAction).trim().toUpperCase())) {
        throw err('Suggested action is required and must be EMPLOYEE or HOTEL.');
    }

    const keepAsDraft = parseSaveAsDraftFlag(saveAsDraft);

    const normalizedEntries = normalizeBreakageLines(lines, linePhotosByIndex);
    const normalizedLines = normalizedEntries.map((entry) => entry.line);
    const mergedLinePhotos = normalizedEntries.map((entry) => entry.photos);
    const headerSourceLocationId = normalizedLines[0].locationId;

    const normalizedSuggestedAction = String(suggestedAction).trim().toUpperCase();
    assertResponsibleEmployeeOnCreate(normalizedSuggestedAction, responsibleEmployeeName);

    if (user && isScopeEngineEnabled('breakage')) {
        const scope = await resolveScopeContext(user, tenantId, { assignmentOnly: true });
        for (const line of normalizedLines) {
            await assertLocationInScope(line.locationId, tenantId, scope, 'create');
        }
    }

    const locationIds = [...new Set(normalizedLines.map((l) => l.locationId))];
    const foundLocations = await prisma.location.findMany({
        where: { tenantId, id: { in: locationIds } },
        select: { id: true },
    });
    if (foundLocations.length !== locationIds.length) {
        throw err('One or more line locations were not found.', 404);
    }

    // Generate document number via unified engine (Ch.9)
    const effectiveDocumentDate = documentDate ? new Date(documentDate) : new Date();
    const documentNo = await generateDocNumber(tenantId, DocPrefix.BREAKAGE, effectiveDocumentDate);

    const firstStepAccountabilityType =
        typeof accountabilityType === 'string' && accountabilityType.trim()
            ? accountabilityType.trim()
            : typeof accountability === 'string' && accountability.trim()
                ? accountability.trim()
                : undefined;

    const photoRows = mergedLinePhotos;

    return prisma.$transaction(async (tx) => {
        const lineCreates = await Promise.all(
            normalizedLines.map(async (l) => {
                const unitId = l.unitId || l.qtyUnitId || null;
                const resolved = await resolveQtyInBaseUnit({
                    tenantId,
                    itemId: l.itemId,
                    qty: parseFloat(l.qty),
                    unitId,
                    db: tx,
                });
                assertClientBaseQtyMatches(resolved.qtyInBaseUnit, l.qtyInBaseUnit, {
                    itemId: l.itemId,
                    unitId,
                });
                return {
                    itemId: l.itemId,
                    locationId: l.locationId,
                    ...(unitId ? { unitId } : {}),
                    qtyRequested: resolved.qtyDisplay,
                    qtyInBaseUnit: resolved.qtyInBaseUnit,
                    unitCost: parseFloat(l.unitCost) || 0,
                    totalValue: parseFloat(l.totalValue) || 0,
                    notes: l.notes || null,
                };
            }),
        );

        await assertLinesHaveStockAtLocation(
            tx,
            tenantId,
            lineCreates.map((l) => ({
                itemId: l.itemId,
                locationId: l.locationId,
                qty: l.qtyInBaseUnit,
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
                movementType: 'BREAKAGE',
                sourceType: 'INTERNAL',
                status: 'DRAFT',
                sourceLocationId: legacySourceLocationId || headerSourceLocationId,
                reason: reason.trim(),
                notes: notes?.trim() || null,
                photoKey: null,
                attachmentUrl: null,
                suggestedAction: normalizedSuggestedAction,
                responsibleEmployeeName:
                    typeof responsibleEmployeeName === 'string' && responsibleEmployeeName.trim()
                        ? responsibleEmployeeName.trim()
                        : null,
                documentDate: effectiveDocumentDate,
                createdBy: userId,
                lines: {
                    create: lineCreates,
                },
            },
            include: { lines: true },
        });

        const createdLines = normalizedLines.map((nl) => {
            const match = doc.lines.find(
                (cl) => cl.itemId === nl.itemId && cl.locationId === nl.locationId,
            );
            if (!match) throw err('Failed to match created breakage lines.', 500);
            return match;
        });

        for (let i = 0; i < createdLines.length; i += 1) {
            const linePhotos = photoRows[i] || [];
            if (!linePhotos.length) continue;
            const { photoKey, attachmentUrl } = await persistBreakagePhotos(
                linePhotos,
                tenantId,
                `${documentNo}-L${i}`,
                user,
            );
            await tx.movementLine.update({
                where: { id: createdLines[i].id },
                data: { photoKey, attachmentUrl },
            });
        }

        // Save as Draft: document only. Primary create: enter ACC pipeline (single-motion if creator = step 1).
        if (!keepAsDraft) {
            await attachApprovalAndEnterPipeline(tx, {
                tenantId,
                documentId: doc.id,
                userId,
                userRole: user.role,
                requestType: 'BREAKAGE',
                firstStepAccountabilityType,
            });
        }

        const created = await tx.movementDocument.findFirst({ where: { id: doc.id }, include: BREAKAGE_INCLUDE });
        await logAction({
            tenantId,
            entityType: EntityType.BREAKAGE,
            entityId: doc.id,
            action: keepAsDraft ? 'CREATE_DRAFT' : 'CREATE',
            changedBy: userId,
            afterValue: { documentNo, status: created.status, saveAsDraft: keepAsDraft },
        });
        return withBreakageMediaUrls(created);
    });
};

// ── LIST ──────────────────────────────────────────────────────────────────────
const getBreakages = async (tenantId, query = {}, user = null) => {
    const { skip = 0, take = 20, status, search, sourceType, pipeline } = query;
    const sourceFilter =
        sourceType === 'INTERNAL'
            ? { getPassId: null }
            : sourceType === 'GET_PASS_RETURN'
                ? { getPassId: { not: null } }
                : {};

    const role = user?.role ? normalizeRole(user.role) : '';
    const tenantWide = TENANT_WIDE_MOVEMENT_APPROVAL_ROLES.has(role);

    let statusWhere = {};
    if (status) {
        const expanded = buildRolePipelineStageStatusWhere(status, role);
        statusWhere = expanded ?? buildStatusWhere(status);
    } else if (tenantWide && (pipeline === '1' || pipeline === 'true' || pipeline === true)) {
        statusWhere = { status: { in: PIPELINE_NON_FINAL_STATUSES } };
    }

    const scope =
        user && isScopeEngineEnabled('breakage') ? await resolveScopeContext(user, tenantId) : null;
    const scopeWhere = scope
        ? scopeWhereFor(SCOPE_MODULE.BREAKAGE, scope, { userId: user.id })
        : {};

    const baseWhere = {
        tenantId,
        movementType: 'BREAKAGE',
        ...statusWhere,
        ...sourceFilter,
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

    const skipN = Number.parseInt(String(skip), 10) || 0;
    const takeN = Number.parseInt(String(take), 10) || 20;

    const listInclude = breakageListInclude(user);

    const totalUnscopedPromise = scope
        ? prisma.movementDocument.count({ where: baseWhere })
        : Promise.resolve(null);

    const [rawDocuments, total, totalUnscoped] = await Promise.all([
        prisma.movementDocument.findMany({
            where,
            skip: skipN,
            take: takeN,
            orderBy: { createdAt: 'desc' },
            include: listInclude,
        }),
        prisma.movementDocument.count({ where }),
        totalUnscopedPromise,
    ]);

    const documents = await Promise.all(rawDocuments.map(async (d) => {
        const totalQtyDamaged = (d.lines ?? []).reduce(
            (sum, line) => sum + Number(line.qtyInBaseUnit || 0),
            0,
        );
        const mediaCount = countBreakageMediaItems(d);
        const { lines: _lines, ...rest } = d;
        const ar = d.approvalRequests;
        if (!ar) {
            return withUserFacingState(
                'BREAKAGE',
                await withBreakageMediaUrls({ ...rest, totalQtyDamaged, mediaCount, approvalRequests: [] }),
                { notes: d.notes },
            );
        }
        if (ar.steps) {
            return withUserFacingState(
                'BREAKAGE',
                await withBreakageMediaUrls({
                    ...rest,
                    totalQtyDamaged,
                    mediaCount,
                    approvalRequests: [
                        {
                            id: ar.id,
                            status: ar.status,
                            currentStep: ar.currentStep,
                            totalSteps: ar.totalSteps,
                            createdAt: ar.createdAt,
                            steps: ar.steps,
                        },
                    ],
                }),
                { notes: d.notes },
            );
        }
        return withUserFacingState(
            'BREAKAGE',
            await withBreakageMediaUrls({
                ...rest,
                totalQtyDamaged,
                mediaCount,
                approvalRequests: [
                    {
                        id: ar.id,
                        status: ar.status,
                        currentStep: ar.currentStep,
                        totalSteps: ar.totalSteps,
                        createdAt: ar.createdAt,
                    },
                ],
            }),
            { notes: d.notes },
        );
    }));

    const scopeMeta = scope ? metaFor(scope, { total, totalUnscoped, scopeWhere }) : null;
    return { documents, total, ...scopeMeta };
};

/**
 * Legacy half-state heal: approval chain exists but document status stayed DRAFT.
 * Promote status/currentStep from approval steps so submit/approve UIs stay consistent.
 *
 * NEVER run when parked on creator after Send Back (Returned):
 * - notes contain [Send Back], or
 * - approval.currentStep === 0
 * Otherwise getById would instantly promote to PENDING_DEPT and wipe Edit/Resubmit.
 */
const healDraftStatusFromExistingApproval = async (doc, tenantId, moduleKey = 'BREAKAGE', include = BREAKAGE_INCLUDE) => {
    if (!doc || String(doc.status || '').toUpperCase() !== 'DRAFT') return doc;

    const { isSendBackReturned } = require('../platform/lifecyclePresentation.service');
    if (isSendBackReturned(doc.status, doc.notes)) return doc;

    const approval = getApproval(doc);
    if (!approval) return doc;
    if (Number(approval.currentStep) === 0) return doc;

    const chain = await resolveMovementWorkflowChain(approval, moduleKey, tenantId);
    const { status: promoteStatus, pendingStepNumber } = submitStatusFromApproval(
        chain,
        approval.steps || [],
    );
    if (!promoteStatus || String(promoteStatus).toUpperCase() === 'DRAFT') return doc;

    await prisma.movementDocument.update({
        where: { id: doc.id },
        data: bumpConcurrencyUpdate({ status: promoteStatus }),
    });
    await prisma.approvalRequest.update({
        where: { id: approval.id },
        data: { currentStep: pendingStepNumber },
    });

    return prisma.movementDocument.findFirst({
        where: { id: doc.id },
        include,
    });
};

// ── GET BY ID ─────────────────────────────────────────────────────────────────
const getBreakageById = async (id, tenantId, user = null) => {
    let doc = await prisma.movementDocument.findFirst({
        where: { id, tenantId, movementType: 'BREAKAGE' },
        include: BREAKAGE_INCLUDE,
    });
    if (!doc) throw err('Breakage document not found.', 404);
    if (user) {
        const scope = await resolveScopeContext(user, tenantId);
        await assertInScope(SCOPE_MODULE.BREAKAGE, doc, scope, 'read');
    }

    doc = (await healDraftStatusFromExistingApproval(doc, tenantId, 'BREAKAGE', BREAKAGE_INCLUDE)) || doc;

    const enriched = {
        ...doc,
        lines: await enrichMovementLinesFinancials(tenantId, doc.lines),
        approvalRequests: asApprovalRequestsArray(doc),
    };
    const mediaDoc = await withBreakageMediaUrls(enriched);
    const { buildBreakageLostWorkflowContext } = require('./breakageLostWorkflowContext.util');
    let chain = null;
    try {
        const approval = getApproval(enriched);
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
    const workflow = buildBreakageLostWorkflowContext(mediaDoc, 'BREAKAGE', chain);
    const sendBackTargets = (() => {
        const approval = getApproval(enriched);
        if (!approval || !chain) return [];
        return buildBreakageSendBackTargets(mediaDoc, approval, chain);
    })();
    const checkoutStockGate = await buildBreakageCheckoutStockGate({ ...mediaDoc, tenantId });
    return withUserFacingState('BREAKAGE', { ...mediaDoc, workflow, sendBackTargets, checkoutStockGate }, { notes: doc.notes });
};

// ── SUBMIT FOR APPROVAL ───────────────────────────────────────────────────────
const submitBreakage = async (id, tenantId, user, expectedVersion = null) => {
    const userId = user.id;
    await assertActiveAssignmentForMutation(user, tenantId, 'submit');
    const doc = await getBreakageById(id, tenantId, user);
    const { assertDocumentEditableByLifecycle } = require('../platform/lifecyclePresentation.service');
    assertDocumentEditableByLifecycle('BREAKAGE', doc.status, { notes: doc.notes });

    if (doc.status !== 'DRAFT') throw err(`Cannot submit document in ${doc.status} status.`);
    if (doc.lines.length === 0) throw err('Cannot submit empty document.');
    assertConcurrencyVersion(expectedVersion, doc.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.BREAKAGE, entityId: id, changedBy: userId },
    });

    return prisma.$transaction(async (tx) => {
        let approval = getApproval(doc);
        if (!approval) {
            await attachApprovalAndEnterPipeline(tx, {
                tenantId,
                documentId: id,
                userId,
                userRole: user.role,
                requestType: 'BREAKAGE',
            });
            return tx.movementDocument.findFirst({ where: { id }, include: BREAKAGE_INCLUDE });
        }

        const chain = await resolveMovementWorkflowChain(approval, 'BREAKAGE', tenantId);

        // Returned to creator (Get Pass pattern): immutable RESUBMIT audit + reopen step 1.
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
                entityType: EntityType.BREAKAGE,
                entityId: id,
                documentStatusBefore: doc.status,
                documentStatusAfter: enterStatus,
                resubmitNotePrefix: 'BREAKAGE_RESUBMIT',
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
                    entityType: EntityType.BREAKAGE,
                    entityId: id,
                    action: 'APPROVE',
                    changedBy: userId,
                    note: `BREAKAGE_APPROVE_STEP:1:${roleCode}`,
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

            return tx.movementDocument.findFirst({ where: { id }, include: BREAKAGE_INCLUDE });
        }

        const { status: submitStatus, pendingStepNumber } = submitStatusFromApproval(chain, approval.steps || []);

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
            entityType: EntityType.BREAKAGE,
            entityId: id,
            action: 'SUBMIT',
            changedBy: userId,
            tx,
        });

        try {
            const pendingStepIndex = pendingStepNumber - 1;
            const pendingChainStep = chain.steps?.[pendingStepIndex];
            const approvers = await tx.tenantMember.findMany({
                where: {
                    tenantId,
                    role: { code: pendingChainStep?.roleCode },
                    isActive: true,
                    user: { isActive: true },
                },
                select: { user: { select: { email: true } } },
            });

            const submitter = await tx.user.findUnique({ where: { id: userId } });

            for (const app of approvers) {
                await emailService.sendApprovalPendingNotification(approval, submitter, app.user.email);
            }
        } catch (emailErr) {
            console.error('Failed to send approval email:', emailErr);
        }

        return tx.movementDocument.findFirst({ where: { id }, include: BREAKAGE_INCLUDE });
    });
};

// ── Backfill approval request for legacy active documents (ACC compatibility) ──
async function backfillMovementApprovalRequest(doc, tenantId, requestType) {
    const moduleKey = moduleKeyForRequestType(requestType) || 'BREAKAGE';
    const chain = await resolveWorkflowForDocument({ moduleKey, tenantId });
    const approvedCount = inferApprovedStepCountFromDocumentStatus(chain, doc.status);
    const roleCodes = chain.roleCodes || [];
    if (!roleCodes.length) {
        const err = new Error('ACC published workflow is required to backfill approval request.');
        err.statusCode = 422;
        throw err;
    }
    const now = new Date();
    const pendingStep = Math.min(Math.max(approvedCount + 1, 1), roleCodes.length);
    await prisma.approvalRequest.create({
        data: {
            tenantId,
            requestType,
            status: doc.status === 'APPROVED' ? 'APPROVED' : 'PENDING',
            documentId: doc.id,
            currentStep: pendingStep,
            totalSteps: roleCodes.length,
            createdBy: doc.createdBy,
            ...(doc.status === 'APPROVED' ? { resolvedAt: now } : {}),
            ...approvalRequestVersionPin(chain),
            steps: {
                create: roleCodes.map((roleCode, index) => {
                    const stepNumber = index + 1;
                    const isApproved = stepNumber <= approvedCount;
                    return {
                        stepNumber,
                        requiredRole: connectRole(roleCode),
                        status: isApproved ? 'APPROVED' : 'PENDING',
                        ...(isApproved
                            ? {
                                  actedByUser: { connect: { id: doc.createdBy } },
                                  actedAt: now,
                                  comment: 'Backfilled from document status for ACC compatibility',
                              }
                            : {}),
                    };
                }),
            },
        },
    });
}

// ── PROCESS APPROVAL STEP ─────────────────────────────────────────────────────
const processApprovalStep = async (id, tenantId, user, action, comment, accountability, expectedVersion = null) => {
    const userId = user.id;
    const userRole = normalizeRole(user.role);
    await assertActiveAssignmentForMutation(user, tenantId, action === 'REJECT' ? 'reject' : 'approve');
    let doc;
    try {
        doc = await getBreakageById(id, tenantId, user);
    } catch (error) {
        console.error('[BREAKAGE_APPROVAL_ERROR]', {
            breakageId: id,
            currentStatus: null,
            approverRole: userRole,
            action,
            accountability,
            step: 'LOAD',
            error: error?.message,
            stack: error?.stack,
        });
        throw error;
    }

    // ── Lock checks ───────────────────────────────────────────────────────────
    if (doc.status === 'APPROVED')
        throw err('Document is already APPROVED and locked. No further actions allowed.');
    if (doc.status === 'VOID')
        throw err('Document has been voided.');
    if (doc.status === 'REJECTED')
        throw err('Rejected documents are read-only. Create a new document to repeat the operation (Ch.2.7).');
    assertConcurrencyVersion(expectedVersion, doc.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.BREAKAGE, entityId: id, changedBy: user.id },
    });

    let approval = getApproval(doc);
    if (!approval) {
        await backfillMovementApprovalRequest(doc, tenantId, doc.movementType === 'LOST' ? 'LOST' : 'BREAKAGE');
        doc = await getBreakageById(id, tenantId, user);
        approval = getApproval(doc);
    }

    if (!approval) throw err('Approval record not found.', 404);
    const moduleKey = moduleKeyForRequestType(doc.movementType === 'LOST' ? 'LOST' : 'BREAKAGE') || 'BREAKAGE';
    let chain = await resolveMovementWorkflowChain(approval, moduleKey, tenantId);

    // Legacy half-state: DEPT pre-approved while document stayed DRAFT — promote into pipeline
    // before approval actions (no extra concurrency bump; client version still matches).
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
        doc = await getBreakageById(id, tenantId, user);
        approval = getApproval(doc);
        if (!approval) throw err('Approval record not found.', 404);
        chain = await resolveMovementWorkflowChain(approval, moduleKey, tenantId);
    }

    const currentStepNo = approval?.currentStep;
    const step = approval?.steps?.find((s) => s.stepNumber === currentStepNo) ?? null;

    const { assertMovementApprovalActionAllowed } = require('../platform/movementApprovalAction.guard');
    assertMovementApprovalActionAllowed({
        moduleKey: 'BREAKAGE',
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

    // ── Out-of-order guard ────────────────────────────────────────────────────
    if (!step) throw err(`Step ${currentStepNo} not found in approval chain.`, 404);

    const requiredRoleCode = step.requiredRole?.code ?? chainMeta?.roleCode;
    assertUserHasBreakageLostStepPermission(user, 'BREAKAGE', doc.status, requiredRoleCode, {
        ...(chainMeta?.permissionCode ? { stepPermission: chainMeta.permissionCode } : {}),
    });

    // Ensure all previous steps are approved
    const prevSteps = approval.steps.filter(s => s.stepNumber < currentStepNo);
    for (const ps of prevSteps) {
        if (ps.status !== 'APPROVED') throw err(`Step ${ps.stepNumber} must be approved first.`);
    }

    const now = new Date();
    const isFinalApproveAction = action === 'APPROVE' && currentStepNo === approval.totalSteps;

    if (action === 'APPROVE') {
        // Dept Manager onward: hard-block approve when stock cannot cover lines.
        // Final step also hits this path (posting safety net).
        const stockGate = await buildBreakageCheckoutStockGate({ ...doc, tenantId });
        if (stockGate && !stockGate.ok) {
            const names = stockGate.blockers.map((b) => b.itemName).join(', ');
            throw err(`Insufficient stock to approve breakage. Review stock for: ${names}`, 422);
        }
    }

    if (isFinalApproveAction) {
        await validatePostingDate(tenantId, now);
    }

    if (
        action === 'APPROVE'
        && typeof accountability === 'string'
        && GET_PASS_ACCOUNTABILITY.has(accountability)
    ) {
        assertEmployeeDeductionApprovalComment(action, accountability, comment);
    }

    try {
        return await prisma.$transaction(async (tx) => {
            const stepUpdate = {
                status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
                actedBy: userId,
                actedAt: now,
                comment: appendWorkflowOverrideComment(comment?.trim() || null, user, requiredRoleCode),
            };
            if (
                (doc.sourceType === 'GET_PASS_RETURN' || doc.sourceType === 'INTERNAL')
                && action === 'APPROVE'
                && typeof accountability === 'string'
                && GET_PASS_ACCOUNTABILITY.has(accountability)
            ) {
                stepUpdate.accountabilityType = accountability;
            }

            // Update the current step
            await tx.approvalStep.update({
                where: { id: step.id },
                data: stepUpdate,
            });

            if (action === 'REJECT') {
                // Reject: return document to DRAFT, reset approval
                await tx.approvalRequest.update({
                    where: { id: approval.id },
                    data: { status: 'REJECTED', resolvedAt: now },
                });
                // Creator reject Returned (DRAFT + [Send Back] notes) → REJECTED terminal.
                // For approver rejection, also set REJECTED.
                await tx.movementDocument.update({
                    where: { id },
                    data: { status: 'REJECTED' },
                });
            } else {
                // Approve: advance to next step or trigger final posting
                const isLastStep = currentStepNo === approval.totalSteps;
                const nextStatus = documentStatusAfterApprovingStep(chain, currentStepNo);

                if (isLastStep) {
                    // ── Final Approval (GM): finalize + post ledger ───────────────
                    await tx.approvalRequest.update({
                        where: { id: approval.id },
                        data: { status: 'APPROVED', currentStep: currentStepNo, resolvedAt: now },
                    });

                    // Post to ledger (inline to use same tx) — document status must be POSTED with postedAt
                    const period = await _postBreakageInTransaction(tx, doc, tenantId, userId);
                    await tx.movementDocument.update({
                        where: { id },
                        data: bumpConcurrencyUpdate({
                            status: 'POSTED',
                            postedAt: period.postedAt,
                            postingDate: period.postingDate,
                            assignedPostingPeriod: period.assignedPostingPeriod,
                        }),
                    });
                } else {
                    // Advance to next step
                    await tx.approvalRequest.update({
                        where: { id: approval.id },
                        data: { currentStep: currentStepNo + 1 },
                    });
                    await tx.movementDocument.update({
                        where: { id },
                        data: { status: nextStatus },
                    });
                }
            }

            // Audit every step action (approve or reject) so the timeline and
            // Manager Override compliance reporting can reconstruct full history.
            {
                const stepRoleCode = requiredRoleCode || chainMeta?.roleCode || '';
                const overrideMeta = buildWorkflowOverrideAuditFields(user, stepRoleCode);
                await logAction({
                    tenantId,
                    entityType: EntityType.BREAKAGE,
                    entityId: id,
                    action,
                    changedBy: userId,
                    note: `BREAKAGE_${action}_STEP:${currentStepNo}:${stepRoleCode}${
                        overrideMeta ? ` via Manager Override (Step: ${overrideMeta.overriddenStepRole})` : ''
                    }`,
                    beforeValue: { step: currentStepNo, status: doc.status },
                    afterValue: withWorkflowOverrideAudit(
                        { step: currentStepNo, roleCode: stepRoleCode, action },
                        user,
                        stepRoleCode,
                    ),
                    tx,
                });
            }

            return tx.movementDocument.findFirst({ where: { id }, include: BREAKAGE_INCLUDE });
        });
    } catch (error) {
        console.error('[BREAKAGE_APPROVAL_ERROR]', {
            breakageId: id,
            currentStatus: doc?.status,
            approverRole: userRole,
            action,
            accountability,
            step: `APPROVAL_STEP_${currentStepNo}`,
            error: error?.message,
            stack: error?.stack,
            prismaCode: error?.code,
        });
        if (error?.statusCode == null && error?.status != null) {
            error.statusCode = error.status;
        }
        throw error;
    }
};

// ── Internal: post breakage inside transaction ────────────────────────────────
const postingEngine = require('./postingEngine.service');

/** @deprecated Internal — use postingEngine.postBreakageMovementInTransaction */
const _postBreakageInTransaction = (tx, doc, tenantId, userId) =>
    postingEngine.postBreakageMovementInTransaction(tx, doc, tenantId, userId);

const approveBreakageAtLevel = async (id, tenantId, user, _expectedStatus, body = {}, expectedVersion = null) =>
    processApprovalStep(
        id,
        tenantId,
        user,
        'APPROVE',
        body.comment,
        body.accountability,
        expectedVersion ?? body.concurrencyVersion,
    );

const movementStatusForPendingStep = (chain, targetStepNumber) => {
    if (targetStepNumber <= 0) return 'DRAFT';
    return documentStatusForPendingStep(chain, targetStepNumber);
};

/**
 * Build allowed Send Back targets: creator (step 0) + prior approval participants.
 * Mirrors buildGetPassSendBackTargets pattern.
 *
 * When a prior step was acted by the document creator (common: Dept Manager creates
 * and auto-approves step 1), do not list that step separately — Creator covers it.
 */
function buildBreakageSendBackTargets(doc, approval, chain) {
    if (!doc || !approval || !chain) return [];
    const currentStepNo = Number(approval.currentStep);
    if (currentStepNo <= 0) return [];

    const { userDisplayName } = require('../utils/timeline-present.util');
    const creatorId = doc.createdBy || doc.createdByUser?.id || null;
    const targets = [
        {
            stepNumber: 0,
            targetType: 'CREATOR',
            roleCode: null,
            actorName: userDisplayName(doc.createdByUser) || null,
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

/**
 * Preflight stock gate for Breakage/Lost approval.
 * Active from Dept Manager (step 1) through the final posting step.
 * Returned-to-creator (step 0) and fully approved docs → null.
 * Final step still re-validates on APPROVE as posting safety net.
 */
async function buildBreakageCheckoutStockGate(doc) {
    const approval = getApproval(doc);
    if (!approval) return null;
    const current = Number(approval.currentStep);
    const total = Number(approval.totalSteps);
    if (!Number.isFinite(current) || current < 1) return null;
    if (!Number.isFinite(total) || current > total) return null;
    if (String(doc.status || '').toUpperCase() === 'APPROVED') return null;
    if (String(approval.status || '').toUpperCase() === 'APPROVED') return null;

    const lines = doc.lines || [];
    if (!lines.length) return { ok: true, blockers: [] };

    const neededByKey = new Map();
    for (const line of lines) {
        const key = `${line.itemId}::${line.locationId}`;
        neededByKey.set(key, (neededByKey.get(key) || 0) + Number(line.qtyInBaseUnit || 0));
    }

    const blockers = [];
    const tenantId = doc.tenantId;
    const isGetPassReturn = doc.sourceType === 'GET_PASS_RETURN';
    for (const [key, requested] of neededByKey.entries()) {
        const [itemId, locationId] = key.split('::');
        const stock = await prisma.stockBalance.findUnique({
            where: { tenantId_itemId_locationId: { tenantId, itemId, locationId } },
            include: { item: { select: { name: true } } },
        });
        const onHand = stock ? Number(stock.qtyOnHand) : 0;
        const blocked = stock ? Number(stock.qtyBlocked || 0) : 0;
        // GET_PASS_RETURN write-offs are covered by custody block, not free available qty.
        const coverOk = isGetPassReturn
            ? onHand + 1e-9 >= requested && blocked + 1e-9 >= requested
            : onHand - blocked + 1e-9 >= requested;
        if (!stock || !coverOk) {
            blockers.push({
                itemName: stock?.item?.name || itemId,
                available: isGetPassReturn ? blocked : onHand - blocked,
                requested,
            });
        }
    }
    return { ok: blockers.length === 0, blockers };
}

/**
 * Align ApprovalRequest.currentStep and step statuses to match document status.
 * Called before executeWorkflowSendBackInTx so the engine sees a consistent AR.
 */
async function syncBreakageApprovalRequestToDocumentInTx(tx, approval, doc, chain) {
    const status = String(doc.status || '').toUpperCase();
    const { isSendBackReturned } = require('../platform/lifecyclePresentation.service');
    const isReturnedToCreator = isSendBackReturned(doc.status, doc.notes);

    let expectedStep;
    if (status === 'DRAFT' || isReturnedToCreator) {
        expectedStep = 0;
    } else if (status === 'PENDING_DEPT') {
        expectedStep = 1;
    } else {
        expectedStep = inferApprovedStepCountFromDocumentStatus(chain, doc.status) + 1;
        const maxStep = Number(approval.totalSteps) || 1;
        if (expectedStep > maxStep) expectedStep = maxStep;
    }

    const steps = [...(approval.steps || [])].sort((a, b) => a.stepNumber - b.stepNumber);

    const needsHeaderSync =
        Number(approval.currentStep) !== expectedStep ||
        String(approval.status || '').toUpperCase() !== 'PENDING';

    if (needsHeaderSync) {
        await tx.approvalRequest.update({
            where: { id: approval.id },
            data: { currentStep: expectedStep, status: 'PENDING', resolvedAt: null },
        });
    }

    for (const st of steps) {
        const shouldBeApproved = st.stepNumber < expectedStep;
        const currentStepStatus = String(st.status || '').toUpperCase();
        if (shouldBeApproved && currentStepStatus !== 'APPROVED') {
            await tx.approvalStep.update({
                where: { id: st.id },
                data: { status: 'APPROVED' },
            });
        } else if (!shouldBeApproved && currentStepStatus === 'APPROVED' && st.stepNumber >= expectedStep) {
            await tx.approvalStep.update({
                where: { id: st.id },
                data: { status: 'PENDING', actedByUser: { disconnect: true }, actedAt: null },
            });
        }
    }

    return { ...approval, currentStep: expectedStep };
}

const sendBackBreakage = async (id, tenantId, user, reason, expectedVersion = null, targetStepNumber = null) => {
    const trimmedReason = normalizeReason(reason);
    const userId = user.id;
    await assertActiveAssignmentForMutation(user, tenantId, 'send-back');
    let doc = await getBreakageById(id, tenantId, user);
    if (['APPROVED', 'VOID', 'REJECTED'].includes(String(doc.status || '').toUpperCase())) {
        throw err('Send Back is not allowed after terminal status.', 423);
    }
    assertConcurrencyVersion(expectedVersion, doc.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.BREAKAGE, entityId: id, changedBy: userId },
    });

    let approval = getApproval(doc);
    if (!approval) {
        await backfillMovementApprovalRequest(doc, tenantId, doc.movementType === 'LOST' ? 'LOST' : 'BREAKAGE');
        doc = await getBreakageById(id, tenantId, user);
        approval = getApproval(doc);
    }
    if (!approval) throw err('Approval record not found.', 404);

    const moduleKey = moduleKeyForRequestType(doc.movementType === 'LOST' ? 'LOST' : 'BREAKAGE') || 'BREAKAGE';
    const chain = await resolveMovementWorkflowChain(approval, moduleKey, tenantId);
    const currentStepNo = Number(approval.currentStep);
    const step = approval.steps?.find((s) => s.stepNumber === currentStepNo) ?? null;
    if (!step || String(step.status || '').toUpperCase() !== 'PENDING') {
        throw err('No pending approval step found.', 422);
    }
    const sendBackChainStep = chain.steps?.[currentStepNo - 1];
    const requiredRoleCode = step.requiredRole?.code ?? sendBackChainStep?.roleCode;
    assertUserHasBreakageLostStepPermission(user, 'BREAKAGE', doc.status, requiredRoleCode, {
        ...(sendBackChainStep?.permissionCode ? { stepPermission: sendBackChainStep.permissionCode } : {}),
    });

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
    const nextStatus = movementStatusForPendingStep(chain, targetStepNo);

    return prisma.$transaction(async (tx) => {
        const syncedApproval = await syncBreakageApprovalRequestToDocumentInTx(tx, approval, doc, chain);

        const updatePayload = bumpConcurrencyUpdate({
            status: nextStatus,
            ...(toCreator
                ? { notes: appendSendBackNotes(doc.notes, trimmedReason) }
                : {}),
        });
        const guarded = await tx.movementDocument.updateMany({
            where: { id, tenantId, movementType: 'BREAKAGE', status: doc.status },
            data: updatePayload,
        });
        if (guarded.count === 0) {
            throw err('Breakage document changed while sending back.', 409);
        }
        await executeWorkflowSendBackInTx(tx, {
            approvalRequest: { ...syncedApproval, steps: approval.steps },
            sourceStepNumber: currentStepNo,
            forceTargetStepNumber: targetStepNo,
            reason: trimmedReason,
            userId,
            tenantId,
            entityType: EntityType.BREAKAGE,
            entityId: id,
            documentStatusBefore: doc.status,
            documentStatusAfter: nextStatus,
            overrideAudit: buildWorkflowOverrideAuditFields(user, requiredRoleCode),
        });
        return tx.movementDocument.findFirst({ where: { id }, include: BREAKAGE_INCLUDE });
    });
};

/**
 * When DRAFT update replaces all lines, keep prior line photos for matching item+location.
 * Queues allow duplicate item/location pairs without cross-stealing media.
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
 * Update a DRAFT breakage document (header + lines). Creator-only.
 * Allowed when status is DRAFT (including Returned via [Send Back] notes).
 */
const updateBreakage = async (id, tenantId, user, data, expectedVersion = null) => {
    const userId = user.id;
    const { isMovementCreateActorRole } = require('./breakageLostWorkflowContext.util');
    if (!isMovementCreateActorRole(user.role)) {
        throw err('Only Department Manager or Storekeeper may update breakage documents.', 403);
    }
    await assertActiveAssignmentForMutation(user, tenantId, 'update');

    const doc = await getBreakageById(id, tenantId, user);
    const status = String(doc.status || '').toUpperCase();

    if (status !== 'DRAFT') {
        throw err(`Cannot update a breakage document in ${doc.status} status. Only DRAFT documents can be edited.`, 422);
    }

    if (doc.createdBy !== userId) {
        throw err('Only the creator can edit a breakage document.', 403);
    }

    assertConcurrencyVersion(expectedVersion, doc.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.BREAKAGE, entityId: id, changedBy: userId },
    });

    const {
        lines = [],
        reason,
        notes,
        documentDate,
        suggestedAction,
        responsibleEmployeeName,
    } = data;

    if (!reason?.trim()) throw err('Reason is required for breakage documents.');
    if (lines.length === 0) throw err('At least one line item is required.');

    const normalizedEntries = normalizeBreakageLines(lines);
    const normalizedLines = normalizedEntries.map((e) => e.line);

    return prisma.$transaction(async (tx) => {
        await assertLinesHaveStockAtLocation(
            tx,
            tenantId,
            normalizedLines.map((l) => ({ itemId: l.itemId, locationId: l.locationId, qty: l.qty })),
            { requirePositiveOnHand: true, validateQtyAgainstOnHand: true },
        );

        const priorLineMedia = buildLineMediaQueue(doc.lines || []);

        await tx.movementLine.deleteMany({ where: { documentId: id } });

        const headerSourceLocationId = normalizedLines[0].locationId;
        await tx.movementDocument.update({
            where: { id },
            data: bumpConcurrencyUpdate({
                reason: reason.trim(),
                notes: notes?.trim() || null,
                sourceLocationId: headerSourceLocationId,
                ...(documentDate ? { documentDate: new Date(documentDate) } : {}),
                ...(suggestedAction ? { suggestedAction: String(suggestedAction).trim().toUpperCase() } : {}),
                ...(responsibleEmployeeName !== undefined
                    ? { responsibleEmployeeName: typeof responsibleEmployeeName === 'string' && responsibleEmployeeName.trim() ? responsibleEmployeeName.trim() : null }
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
            entityType: EntityType.BREAKAGE,
            entityId: id,
            action: 'UPDATE',
            changedBy: userId,
            afterValue: { reason: reason.trim(), lineCount: normalizedLines.length },
        });

        const updated = await tx.movementDocument.findFirst({ where: { id }, include: BREAKAGE_INCLUDE });
        return withBreakageMediaUrls(updated);
    });
};

/**
 * Creator-reject for Returned (DRAFT + [Send Back] notes) breakage documents.
 * Also handles approver-initiated rejection via the same endpoint
 * (falling through to processApprovalStep if caller holds APPROVE_BREAKAGE).
 */
const rejectBreakage = async (id, tenantId, user, comment, expectedVersion = null) => {
    const userId = user.id;
    if (!comment?.trim()) throw err('Rejection comment is required.', 400);

    const doc = await getBreakageById(id, tenantId, user);
    const { isSendBackReturned: isSBR } = require('../platform/lifecyclePresentation.service');
    const isReturned = isSBR(doc.status, doc.notes);

    if (isReturned && String(doc.status || '').toUpperCase() === 'DRAFT') {
        if (doc.createdBy !== userId) throw err('Only the document creator can reject a returned document.', 403);
        await assertActiveAssignmentForMutation(user, tenantId, 'reject');
        assertConcurrencyVersion(expectedVersion, doc.concurrencyVersion, {
            required: true,
            audit: { tenantId, entityType: EntityType.BREAKAGE, entityId: id, changedBy: userId },
        });
        await prisma.movementDocument.updateMany({
            where: { id, tenantId, movementType: 'BREAKAGE' },
            data: bumpConcurrencyUpdate({ status: 'REJECTED' }),
        });
        await logAction({
            tenantId,
            entityType: EntityType.BREAKAGE,
            entityId: id,
            action: 'REJECT',
            changedBy: userId,
            note: `Creator rejected returned breakage: ${comment.trim()}`,
            beforeValue: { status: doc.status },
            afterValue: { status: 'REJECTED' },
        });
        return prisma.movementDocument.findFirst({ where: { id }, include: BREAKAGE_INCLUDE });
    }

    return processApprovalStep(id, tenantId, user, 'REJECT', comment, undefined, expectedVersion);
};

// ── UPLOAD ATTACHMENT ─────────────────────────────────────────────────────────
const addAttachment = async (id, tenantId, attachmentMeta, user = null) => {
    const doc = await getBreakageById(id, tenantId, user);

    // Lock check — Ch.14 posted/immutable attachments
    assertAttachmentMutable(doc.status);

    // Attachments stored as JSON field on the document
    // We extend the existing JSON array in attachmentUrl field
    // Field: attachmentUrl stores JSON array of attachment objects
    let attachments = [];
    try {
        attachments = doc.attachmentUrl ? JSON.parse(doc.attachmentUrl) : [];
    } catch {
        attachments = [];
    }

    if (attachments.length >= ATTACHMENT_MAX_COUNT_PER_DOCUMENT) {
        throw err(`Maximum ${ATTACHMENT_MAX_COUNT_PER_DOCUMENT} attachments per document.`, 400);
    }

    attachments.push({
        ...attachmentMeta,
        uploadedAt: new Date().toISOString(),
    });

    const updated = await prisma.movementDocument.updateMany({
        where: { id, tenantId, movementType: 'BREAKAGE' },
        data: { attachmentUrl: JSON.stringify(attachments) },
    });
    if (updated.count === 0) {
        throw err('Breakage document not found.', 404);
    }
    const refreshed = await prisma.movementDocument.findFirst({
        where: { id, tenantId },
        include: BREAKAGE_INCLUDE,
    });

    if (user?.id) {
        await logAction({
            tenantId,
            entityType: EntityType.BREAKAGE,
            entityId: id,
            action: 'ATTACHMENT_ADD',
            changedBy: user.id,
            note: `Attachment added: ${attachmentMeta?.originalName || attachmentMeta?.filename || 'file'}`,
            beforeValue: { attachmentCount: attachments.length - 1 },
            afterValue: { attachmentCount: attachments.length },
        });
        await logGovernedEvent({
            tenantId,
            entityType: EntityType.BREAKAGE,
            entityId: id,
            action: 'ATTACHMENT_ADD',
            changedBy: user.id,
            eventType: 'BREAKAGE_ATTACHMENT_ADD',
            note: `Attachment added: ${attachmentMeta?.originalName || attachmentMeta?.filename || 'file'}`,
            afterValue: { attachmentCount: attachments.length },
        });
    }

    return refreshed;
};

// ── EVIDENCE JSON ─────────────────────────────────────────────────────────────
const isImageEvidenceAttachment = (att) => {
    if (!att || typeof att !== 'object') return false;
    const mime = String(att.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) return true;
    const src = String(att.url || att.key || att.filename || '').split('?')[0];
    return /\.(jpe?g|png|webp|gif)$/i.test(src);
};

const buildBreakageEvidenceGalleryAttachments = (doc, docAttachments = []) => {
    const gallery = [];
    const seen = new Set();

    const pushImage = (src, originalName, extra = {}) => {
        const url = src ? String(src).trim() : '';
        if (!url || seen.has(url)) return;
        seen.add(url);
        gallery.push({
            url,
            key: extra.key || url,
            originalName: originalName || 'Evidence photo',
            mimetype: extra.mimetype || 'image/jpeg',
            ...extra,
        });
    };

    for (const att of docAttachments) {
        if (!isImageEvidenceAttachment(att)) continue;
        pushImage(att.url || att.key, att.originalName || att.filename || 'Attachment', att);
    }

    if (doc.photoUrl) {
        pushImage(doc.photoUrl, 'Primary breakage photo', { key: doc.photoKey || doc.photoUrl });
    }

    for (const line of doc.lines || []) {
        const itemName = line.item?.name || 'Item';
        const locName = line.location?.name || '';
        const caption = locName ? `${itemName} — ${locName}` : itemName;

        for (const att of line.attachments || []) {
            if (!isImageEvidenceAttachment(att)) continue;
            pushImage(att.url || att.key, caption, att);
        }

        if (line.photoUrl) {
            pushImage(line.photoUrl, caption, { key: line.photoKey || line.photoUrl });
        }
    }

    return gallery;
};

const getEvidence = async (id, tenantId, user = null) => {
    const doc = await getBreakageById(id, tenantId, user);
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
    });

    // Approval history — same constitutional timeline source as Detail screen
    const approvalRec = getApproval(doc);
    const chainSteps = approvalRec?.accWorkflowVersionId
        ? (await resolveWorkflowByVersionId(approvalRec.accWorkflowVersionId)).steps || []
        : (await resolveWorkflowForDocument({ moduleKey: 'BREAKAGE', tenantId })).steps || [];
    const accChainDef = chainSteps.map((c) => ({
        step: c.stepOrder,
        role: c.roleCode,
        label: c.label,
    }));

    const legacyApprovalHistory = (approvalRec?.steps || []).map((s) => ({
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
        where: { tenantId, entityType: 'BREAKAGE', entityId: id },
        orderBy: { changedAt: 'asc' },
        take: 200,
        include: { changedByUser: { select: { id: true, firstName: true, lastName: true } } },
    });
    const rawTimeline = buildApprovalTimelineRawEntries(approvalRec, {
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
            moduleKey: 'BREAKAGE',
            ensurePostingSlot: false,
            includeMilestones: false,
        });
        approvalChainDefinition = mapped.approvalChainDefinition.length
            ? mapped.approvalChainDefinition
            : accChainDef;
        approvalHistory = mapped.approvalHistory.map((h) => {
            const role = h.role;
            const status = String(h.status || '').toUpperCase();
            const matches = (approvalRec?.steps || []).filter(
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

    // Attachments (document-level JSON + line photos for evidence gallery)
    let attachments = [];
    try {
        attachments = doc.attachmentUrl ? JSON.parse(doc.attachmentUrl) : [];
    } catch { attachments = []; }

    const galleryAttachments = buildBreakageEvidenceGalleryAttachments(doc, attachments);

    // Ledger entries
    const ledgerEntries = await prisma.inventoryLedger.findMany({
        where: { tenantId, referenceId: id },
        include: {
            item: { select: { id: true, name: true, barcode: true } },
            location: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    // Stock impact per line
    const stockImpact = await Promise.all(doc.lines.map(async (line) => {
        const ledger = ledgerEntries.find(e => e.itemId === line.itemId);
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
        const wacUsed = ledger ? parseFloat(ledger.unitCost) : null;
        const qtyAfter = current ? parseFloat(current.qtyOnHand) : null;
        const qtyBefore = qtyAfter !== null ? qtyAfter + qtyDeducted : null;
        const totalLoss = wacUsed !== null ? qtyDeducted * wacUsed : null;

        return {
            itemId: line.item.id,
            itemName: line.item.name,
            barcode: line.item.barcode,
            locationId: line.location.id,
            locationName: line.location.name,
            qtyBefore,
            qtyDeducted,
            qtyAfter,
            wacAtPosting: wacUsed,
            totalLoss,
        };
    }));

    const totalLossValue = stockImpact.reduce((s, i) => s + (i.totalLoss || 0), 0);

    return {
        packMeta: {
            packTitle: 'BREAKAGE REPORT',
            packTitleShort: 'Breakage Report',
            packSubtitle: 'Breakage, approvals, stock impact, and photo evidence',
            reportBasis: 'Breakage operational report and approval trail',
            itemsSectionTitle: 'Broken Items',
            totalLossLabel: 'TOTAL LOSS',
            primaryPhotoCaption: 'Primary breakage photo',
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
            submittedAt: doc.updatedAt, // approximation
            postedAt: doc.postedAt,
            sourceLocation: doc.sourceLocationId,
        },
        lineItems: doc.lines.map(l => ({
            itemId: l.item.id,
            itemName: l.item.name,
            barcode: l.item.barcode,
            qty: parseFloat(l.qtyInBaseUnit),
            notes: formatStructuredMovementNotes(l.notes) ?? l.notes,
        })),
        approvalChainDefinition,
        approvalHistory,
        approvalSummary: {
            currentStep: getApproval(doc)?.currentStep,
            totalSteps: getApproval(doc)?.totalSteps,
            overallStatus: getApproval(doc)?.status,
        },
        attachments: galleryAttachments,
        photoEvidence: {
            photoUrl: doc.photoUrl || null,
            photoKey: doc.photoKey || null,
        },
        ledgerEntries: ledgerEntries.map(e => ({
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

// ── VOID (admin only, only DRAFT/REJECTED) ────────────────────────────────────
const voidBreakage = async (id, tenantId, user, reason = '', expectedVersion = null) => {
    const userId = user.id;
    await assertActiveAssignmentForMutation(user, tenantId, 'void');
    const doc = await getBreakageById(id, tenantId, user);
    const voidReason = String(reason || '').trim();
    if (!voidReason) {
        throw err('Void reason is required.', 400);
    }

    if (doc.status === 'APPROVED')
        throw err('Cannot void an APPROVED document. Approved documents are immutable.');
    if (doc.status === 'VOID')
        throw err('Document is already voided.');
    if (!['DRAFT', 'REJECTED'].includes(doc.status)) {
        throw err(`Cannot void document in status ${doc.status}.`, 422);
    }
    assertConcurrencyVersion(expectedVersion, doc.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.BREAKAGE, entityId: id, changedBy: userId },
    });

    const voidedCount = await prisma.movementDocument.updateMany({
        where: { id, tenantId, movementType: 'BREAKAGE' },
        data: bumpConcurrencyUpdate({
            status: 'VOID',
            voidedAt: new Date(),
            notes: `${doc.notes ? `${doc.notes}\n\n` : ''}Voided: ${voidReason}`,
        }),
    });
    if (voidedCount.count === 0) {
        throw err('Breakage document not found.', 404);
    }
    const voided = await prisma.movementDocument.findFirst({
        where: { id, tenantId },
        include: BREAKAGE_INCLUDE,
    });

    await logAction({
        tenantId,
        entityType: EntityType.BREAKAGE,
        entityId: id,
        action: 'VOID',
        changedBy: userId,
        note: `Breakage voided: ${voidReason}`,
        beforeValue: { status: doc.status },
        afterValue: { status: 'VOID', voidReason },
    });

    return voided;
};

module.exports = {
    createBreakage,
    getBreakages,
    getBreakageById,
    submitBreakage,
    approveBreakageAtLevel,
    processApprovalStep,
    sendBackBreakage,
    updateBreakage,
    rejectBreakage,
    addAttachment,
    getEvidence,
    voidBreakage,
    STATUS_BY_APPROVED_STEP,
    backfillMovementApprovalRequest,
    createMovementApprovalRequest,
    attachApprovalAndEnterPipeline,
    parseSaveAsDraftFlag,
    healDraftStatusFromExistingApproval,
    buildBreakageSendBackTargets,
    buildBreakageCheckoutStockGate,
    syncBreakageApprovalRequestToDocumentInTx,
    persistBreakagePhotos,
};
