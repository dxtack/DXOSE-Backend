const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const settingService = require('./setting.service');
const { assertMovementRegisterMutable } = require('./movementRegisterGuard.service');
const { withUserFacingState } = require('../platform/lifecyclePresentation.service');
const { generateDocNumber, prefixFromMovementType } = require('./docNumbering.service');
const { assertConcurrencyVersion, bumpConcurrencyUpdate } = require('../platform/concurrency.service');
const { EntityType } = require('./auditTrail.service');
const { assertCreateDraftOrigin, assertDirectApiCreateType } = require('./movementDirectAdjustment.guard');
const {
    resolveScopeContext,
    assertLocationInScope,
    scopeWhereFor,
    assertInScope,
    isScopeEngineEnabled,
    SCOPE_MODULE,
} = require('./scope/scopeContext');
const {
    assertActiveAssignmentForMutation,
    hasActiveAssignmentForProperty,
} = require('./scope/assignment-mutation.guard');
const { createScopeError } = require('../utils/scopeError');
const { normalizeRole } = require('./rbac.service');
const { logAction } = require('./auditTrail.service');
const {
    signedQtyForAdjustment,
    resolveLineAdjustmentDirection,
    directionFromSignedQty,
    displayQtyFromSigned,
    adjustmentDocumentAuditSnapshot,
} = require('../utils/adjustmentDirection.util');
const { resolveQtyInBaseUnit, assertClientBaseQtyMatches } = require('./unitConversion.util');
const { runIdempotentAdjustmentCreate } = require('./adjustmentCreateIdempotency.service');

function assertPositiveLineQty(qty, label = 'Line quantity') {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
        throw Object.assign(new Error(`${label} must be greater than zero.`), { statusCode: 422 });
    }
    return n;
}

/**
 * Create a new draft movement document (internal — no create idempotency wrapper).
 * @param {object} data
 * @param {string} tenantId
 * @param {string} userId
 * @param {import('@prisma/client').Prisma.TransactionClient | import('@prisma/client').PrismaClient} [db]
 * @param {{ origin: 'DIRECT_API' | 'INTERNAL', clientRequestKey?: string }} options — required; fail-closed (no default)
 */
const createMovementDraftImpl = async (data, tenantId, userId, db = prisma, options, user = null) => {
    const origin = assertCreateDraftOrigin(options);
    const userObj = user || { id: userId, role: null, tenantId };
    await assertActiveAssignmentForMutation(userObj, tenantId, 'create');
    const scope = await resolveScopeContext(userObj, tenantId, { assignmentOnly: true });

    if (origin === 'DIRECT_API') {
        assertDirectApiCreateType(data.movementType);
        data.movementType = 'ADJUSTMENT';
        if (!Array.isArray(data.lines) || data.lines.length === 0) {
            throw Object.assign(new Error('At least one line item is required.'), { statusCode: 400 });
        }
    }

    // ── Phase 4 MANDATORY GUARD: No manual RECEIVE without a valid GRN ──────
    // Every RECEIVE movement MUST reference an approved GRN.
    // This is a strict control requirement — no exceptions.
    if (data.movementType === 'RECEIVE') {
        if (!data.grnImportId) {
            const err = new Error('Direct RECEIVE movements are not allowed. All stock receipts must go through an approved GRN.');
            err.statusCode = 403;
            throw err;
        }
        const grn = await db.grnImport.findFirst({
            where: { id: data.grnImportId, tenantId },
        });
        if (!grn) {
            const err = new Error('Referenced GRN not found.');
            err.statusCode = 404;
            throw err;
        }
        if (grn.status !== 'APPROVED') {
            const err = new Error(`Referenced GRN must be in APPROVED status. Current status: ${grn.status}`);
            err.statusCode = 403;
            throw err;
        }
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Retired module guard: manual ISSUE movements are no longer supported ──
    if (data.movementType === 'ISSUE') {
        const err = new Error('Direct ISSUE movements are not allowed. Store Requisitions and Issues have been retired.');
        err.statusCode = 403;
        throw err;
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Phase 6 MANDATORY GUARD: No manual TRANSFER_OUT / TRANSFER_IN ─────────
    if (data.movementType === 'TRANSFER_OUT') {
        const err = new Error(
            'Direct TRANSFER_OUT movements are not allowed. Transfers post via Finance approval on /api/transfers/:id/approve.',
        );
        err.statusCode = 403;
        throw err;
    }
    if (data.movementType === 'TRANSFER_IN') {
        const err = new Error(
            'Direct TRANSFER_IN movements are not allowed. Transfers post via Finance approval on /api/transfers/:id/approve.',
        );
        err.statusCode = 403;
        throw err;
    }
    // ────────────────────────────────────────────────────────────────────────

    const refDate = data.documentDate ? new Date(data.documentDate) : new Date();
    const documentNo = await generateDocNumber(
        tenantId,
        prefixFromMovementType(data.movementType),
        refDate,
        db,
    );


    // Sanitize optional UUID fields — convert empty strings to null
    const sanitizeUuid = (val) => (val && val.trim() !== '' ? val : null);
    data.sourceLocationId = sanitizeUuid(data.sourceLocationId);
    data.destLocationId = sanitizeUuid(data.destLocationId);
    data.supplierId = sanitizeUuid(data.supplierId);

    // Validate locations if provided
    if (data.sourceLocationId) {
        const source = await db.location.findFirst({ where: { id: data.sourceLocationId, tenantId } });
        if (!source) throw Object.assign(new Error('Source location not found'), { statusCode: 404 });
        if (!source.isActive) throw Object.assign(new Error('Source location is inactive.'), { statusCode: 422 });
        await assertLocationInScope(data.sourceLocationId, tenantId, scope, 'create');
    }

    if (data.destLocationId) {
        const dest = await db.location.findFirst({ where: { id: data.destLocationId, tenantId } });
        if (!dest) throw Object.assign(new Error('Destination location not found'), { statusCode: 404 });
        if (!dest.isActive) throw Object.assign(new Error('Destination location is inactive.'), { statusCode: 422 });
        await assertLocationInScope(data.destLocationId, tenantId, scope, 'create');
    }

    // Determine the default location for lines from the header
    const defaultLocationId = data.destLocationId || data.sourceLocationId || null;

    /** OPENING_BALANCE drafts: line `unitCost` / `totalValue` follow catalog `unitPrice` (single source). */
    let obCatalogPrices = null;
    if (data.movementType === 'OPENING_BALANCE' && data.lines?.length > 0) {
        const itemIds = [...new Set(data.lines.map((l) => l.itemId).filter(Boolean))];
        if (itemIds.length > 0) {
            const items = await db.item.findMany({
                where: { id: { in: itemIds }, tenantId },
                select: { id: true, unitPrice: true },
            });
            obCatalogPrices = new Map(items.map((it) => [it.id, Number(it.unitPrice ?? 0)]));
        }
    }

    // Validate line locations and items before nested create
    if (data.lines?.length > 0) {
        const lineItemIds = [...new Set(data.lines.map((l) => l.itemId).filter(Boolean))];
        if (lineItemIds.length > 0) {
            const items = await db.item.findMany({
                where: { id: { in: lineItemIds }, tenantId },
                select: { id: true, isActive: true },
            });
            if (items.length !== lineItemIds.length) {
                throw Object.assign(
                    new Error('One or more items were not found for this property.'),
                    { statusCode: 404 },
                );
            }
            if (items.some((it) => !it.isActive)) {
                throw Object.assign(
                    new Error('Inactive items cannot be used on movement documents.'),
                    { statusCode: 422 },
                );
            }
        }

        const lineLocIds = [
            ...new Set(
                data.lines
                    .map((line) =>
                        line.locationId && line.locationId.trim() !== ''
                            ? line.locationId
                            : data.destLocationId || data.sourceLocationId || null,
                    )
                    .filter(Boolean),
            ),
        ];
        if (lineLocIds.length > 0) {
            const locRows = await db.location.findMany({
                where: { id: { in: lineLocIds }, tenantId },
                select: { id: true, isActive: true },
            });
            if (locRows.length !== lineLocIds.length) {
                throw Object.assign(new Error('One or more line locations were not found.'), { statusCode: 404 });
            }
            if (locRows.some((loc) => !loc.isActive)) {
                throw Object.assign(new Error('Inactive locations cannot be used on movement documents.'), {
                    statusCode: 422,
                });
            }
        }

        for (const line of data.lines) {
            const lineLocationId =
                line.locationId && line.locationId.trim() !== ''
                    ? line.locationId
                    : data.destLocationId || data.sourceLocationId || null;
            if (!lineLocationId) {
                throw Object.assign(
                    new Error('A location is required. Please select a location on the document header.'),
                    { statusCode: 400 },
                );
            }
            await assertLocationInScope(lineLocationId, tenantId, scope, 'create');
        }
    }

    // Build line items for nested create (P2 #31 — apply approved unit conversion when unitId set)
    let linesCreate;
    if (data.lines && data.lines.length > 0) {
        const createdLines = await Promise.all(
            data.lines.map(async (line) => {
                const lineLocationId = (line.locationId && line.locationId.trim() !== '')
                    ? line.locationId
                    : defaultLocationId;

                if (!lineLocationId) {
                    throw Object.assign(
                        new Error('A location is required. Please select a location on the document header.'),
                        { statusCode: 400 }
                    );
                }

                const qtyInput =
                    line.qtyRequested !== undefined && line.qtyRequested !== null
                        ? line.qtyRequested
                        : line.quantity;
                const unitId = line.unitId || line.qtyUnitId || null;
                if (line.qtyUnitId && !line.unitId) {
                    // Accept legacy alias but resolve through the same approved ItemUnit path.
                }
                let qtyInBaseUnit;
                let qtyDisplay;
                if (data.movementType === 'ADJUSTMENT') {
                    const direction = resolveLineAdjustmentDirection(data, line);
                    const absInput = Math.abs(parseFloat(qtyInput) || 0);
                    const resolved = await resolveQtyInBaseUnit({
                        tenantId,
                        itemId: line.itemId,
                        qty: absInput,
                        unitId,
                        db: prisma,
                    });
                    assertClientBaseQtyMatches(resolved.qtyInBaseUnit, line.qtyInBaseUnit, {
                        itemId: line.itemId,
                        unitId,
                    });
                    qtyInBaseUnit = signedQtyForAdjustment(resolved.qtyInBaseUnit, direction);
                    qtyDisplay = displayQtyFromSigned(qtyInBaseUnit);
                } else {
                    const positive = assertPositiveLineQty(parseFloat(qtyInput) || 0);
                    const resolved = await resolveQtyInBaseUnit({
                        tenantId,
                        itemId: line.itemId,
                        qty: positive,
                        unitId,
                        db: prisma,
                    });
                    assertClientBaseQtyMatches(resolved.qtyInBaseUnit, line.qtyInBaseUnit, {
                        itemId: line.itemId,
                        unitId,
                    });
                    qtyDisplay = resolved.qtyDisplay;
                    qtyInBaseUnit = resolved.qtyInBaseUnit;
                }
                let unitCost = parseFloat(line.unitCost) || 0;
                let totalValue = parseFloat(line.totalValue) || 0;
                if (data.movementType === 'OPENING_BALANCE' && obCatalogPrices) {
                    const cat = obCatalogPrices.get(line.itemId);
                    if (cat !== undefined && cat > 0) {
                        unitCost = cat;
                        totalValue = qtyDisplay * unitCost;
                    }
                } else if (data.movementType === 'ADJUSTMENT' && !(totalValue > 0) && unitCost > 0) {
                    totalValue = qtyDisplay * unitCost;
                }

                return {
                    item: { connect: { id: line.itemId } },
                    location: { connect: { id: lineLocationId } },
                    ...(unitId ? { unit: { connect: { id: unitId } } } : {}),
                    qtyRequested: qtyDisplay,
                    qtyInBaseUnit,
                    unitCost,
                    totalValue,
                    notes: line.notes || null
                };
            }),
        );
        linesCreate = { create: createdLines };
    }

    // Remove lines and other non-Prisma fields from the root data
    const { lines, referenceNumber, adjustmentDirection, clientRequestKey: _crk, ...headerData } = data;

    const documentData = {
        ...headerData,
        documentNo,
        documentDate: new Date(data.documentDate || new Date()),
        status: 'DRAFT',
        createdBy: userId,
        tenantId,
        ...(linesCreate && { lines: linesCreate })
    };

    const created = await db.movementDocument.create({
        data: documentData,
        include: {
            lines: { include: { item: { select: { name: true, barcode: true } }, location: { select: { name: true } } } },
            createdByUser: { select: { firstName: true, lastName: true } }
        }
    });

    if (data.movementType === 'ADJUSTMENT') {
        await logAction({
            tenantId,
            entityType: EntityType.MOVEMENT,
            entityId: created.id,
            action: 'CREATE',
            changedBy: userId,
            note: `ADJUSTMENT draft created (${created.documentNo})`,
            afterValue: adjustmentDocumentAuditSnapshot(created),
        });
    }

    return created;
};

/**
 * Create draft with optional in-process idempotency for direct API adjustments.
 */
const createMovementDraft = async (data, tenantId, userId, db = prisma, options, user = null) => {
    const origin = assertCreateDraftOrigin(options);
    const movementType = String(data?.movementType ?? 'ADJUSTMENT').trim().toUpperCase();
    const clientRequestKey = options?.clientRequestKey;

    if (origin === 'DIRECT_API' && movementType === 'ADJUSTMENT' && clientRequestKey) {
        const outcome = await runIdempotentAdjustmentCreate(
            tenantId,
            userId,
            clientRequestKey,
            () => createMovementDraftImpl(data, tenantId, userId, db, options, user),
        );
        if (outcome.replay && outcome.documentId) {
            return getMovementById(outcome.documentId, tenantId, user);
        }
        return outcome.document;
    }

    return createMovementDraftImpl(data, tenantId, userId, db, options, user);
};

/**
 * Get movement documents (List)
 */
const getMovements = async (tenantId, query, user = null) => {
    const obStatus = await settingService.getObStatus(tenantId);
    if (obStatus !== 'FINALIZED') {
        return {
            documents: [],
            total: 0,
            status: 'SETUP_IN_PROGRESS',
            obStatus,
        };
    }

    if (user) {
        const role = normalizeRole(user.role);
        if (role !== 'SUPER_ADMIN') {
            const hasAssignment = await hasActiveAssignmentForProperty(user, tenantId);
            if (!hasAssignment) {
                return { documents: [], total: 0 };
            }
        }
    }

    const { skip = 0, take = 10, status, movementType, search, sourceType } = query;

    const sourceFilter =
        sourceType === 'INTERNAL'
            ? { getPassId: null }
            : sourceType === 'GET_PASS_RETURN'
                ? { getPassId: { not: null } }
                : {};

    const scope =
        user && isScopeEngineEnabled('movement')
            ? await resolveScopeContext(user, tenantId, { assignmentOnly: true })
            : null;
    const scopeWhere = scope
        ? scopeWhereFor(SCOPE_MODULE.MOVEMENT, scope, { userId: user.id })
        : {};

    const baseWhere = {
        tenantId,
        ...(status && { status }),
        ...(movementType && { movementType }),
        ...sourceFilter,
    };

    const searchClause = search
        ? {
            OR: [
                { documentNo: { contains: search, mode: 'insensitive' } },
                { department: { contains: search, mode: 'insensitive' } },
                { notes: { contains: search, mode: 'insensitive' } },
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

    const [documents, total] = await Promise.all([
        prisma.movementDocument.findMany({
            where,
            skip: parseInt(skip),
            take: parseInt(take),
            orderBy: { documentDate: 'desc' },
            include: {
                createdByUser: { select: { firstName: true, lastName: true } },
                getPass: { select: { id: true, passNo: true } },
                lines: { take: 1, select: { qtyInBaseUnit: true } },
                _count: { select: { lines: true } },
            },
        }),
        prisma.movementDocument.count({ where }),
    ]);

    return {
        documents: documents.map((doc) => {
            const faced = withUserFacingState('MOVEMENT', doc);
            if (String(doc.movementType).toUpperCase() === 'ADJUSTMENT' && doc.lines?.length) {
                faced.adjustmentDirection = directionFromSignedQty(doc.lines[0].qtyInBaseUnit);
            }
            return faced;
        }),
        total,
    };
};

/**
 * Get specific movement document details
 */
const getMovementById = async (id, tenantId, user = null) => {
    const obStatus = await settingService.getObStatus(tenantId);
    if (obStatus !== 'FINALIZED') {
        const error = new Error('Stock movements are unavailable while opening balance setup is in progress.');
        error.statusCode = 409;
        error.code = 'SETUP_IN_PROGRESS';
        error.details = { obStatus };
        throw error;
    }

    if (user) {
        const role = normalizeRole(user.role);
        if (role !== 'SUPER_ADMIN') {
            const hasAssignment = await hasActiveAssignmentForProperty(user, tenantId);
            if (!hasAssignment) {
                throw createScopeError('Active assignment required to view movement documents.', 403);
            }
        }
    }

    const document = await prisma.movementDocument.findFirst({
        where: { id, tenantId },
        include: {
            lines: {
                include: {
                    item: { select: { name: true, barcode: true, unitPrice: true } },
                    location: { select: { name: true } },
                },
            },
            createdByUser: { select: { firstName: true, lastName: true } },
        },
    });

    if (!document) {
        const error = new Error('Movement document not found');
        error.statusCode = 404;
        throw error;
    }

    if (user) {
        const scope = await resolveScopeContext(user, tenantId, { assignmentOnly: true });
        await assertInScope(SCOPE_MODULE.MOVEMENT, document, scope, 'read');
    }

    const faced = withUserFacingState('MOVEMENT', document);
    if (String(document.movementType).toUpperCase() === 'ADJUSTMENT' && document.lines?.length) {
        faced.adjustmentDirection = directionFromSignedQty(document.lines[0].qtyInBaseUnit);
    }
    return faced;
};

/**
 * Update a DRAFT movement document
 */
const updateMovementDraft = async (id, data, tenantId, userId = null, expectedVersion = null) => {
    const document = await getMovementById(id, tenantId);
    const beforeAudit =
        document.movementType === 'ADJUSTMENT' ? adjustmentDocumentAuditSnapshot(document) : null;

    assertMovementRegisterMutable(document, 'update');
    const { assertDocumentEditableByLifecycle } = require('../platform/lifecyclePresentation.service');
    assertDocumentEditableByLifecycle('MOVEMENT', document.status, { notes: document.notes });

    if (document.status !== 'DRAFT' && document.status !== 'REJECTED') {
        const error = new Error(`Cannot update document in ${document.status} status`);
        error.statusCode = 400;
        throw error;
    }
    assertConcurrencyVersion(expectedVersion, document.concurrencyVersion, {
        required: true,
        audit: { tenantId, entityType: EntityType.MOVEMENT, entityId: id, changedBy: userId ?? document.createdBy },
    });

    // Handling full replacement of lines if provided
    if (data.lines) {
        // Determine fallback location from header
        const headerDefault = data.destLocationId || data.sourceLocationId || null;

        await prisma.$transaction(async (tx) => {
            // Delete existing lines
            await tx.movementLine.deleteMany({ where: { documentId: id } });

            // Create new lines
            if (data.lines.length > 0) {
                let obCatalogPrices = null;
                if (document.movementType === 'OPENING_BALANCE') {
                    const itemIds = [...new Set(data.lines.map((l) => l.itemId).filter(Boolean))];
                    if (itemIds.length > 0) {
                        const items = await tx.item.findMany({
                            where: { id: { in: itemIds }, tenantId },
                            select: { id: true, unitPrice: true },
                        });
                        obCatalogPrices = new Map(items.map((it) => [it.id, Number(it.unitPrice ?? 0)]));
                    }
                }

                const linesToInsert = data.lines.map(line => {
                    const lineLocationId = (line.locationId && line.locationId.trim() !== '')
                        ? line.locationId
                        : headerDefault;

                    if (!lineLocationId) {
                        throw Object.assign(
                            new Error('A location is required. Please select a location on the document header.'),
                            { statusCode: 400 }
                        );
                    }

                    const qtyInput =
                        line.qtyRequested !== undefined && line.qtyRequested !== null
                            ? line.qtyRequested
                            : line.quantity;
                    let qtyInBaseUnit;
                    let qtyDisplay;
                    if (document.movementType === 'ADJUSTMENT') {
                        const direction = resolveLineAdjustmentDirection(data, line);
                        qtyInBaseUnit = signedQtyForAdjustment(parseFloat(qtyInput) || 0, direction);
                        qtyDisplay = displayQtyFromSigned(qtyInBaseUnit);
                    } else {
                        qtyDisplay = assertPositiveLineQty(parseFloat(qtyInput) || 0);
                        qtyInBaseUnit = qtyDisplay;
                    }
                    let unitCost = parseFloat(line.unitCost) || 0;
                    let totalValue = parseFloat(line.totalValue) || 0;
                    if (obCatalogPrices) {
                        const cat = obCatalogPrices.get(line.itemId);
                        if (cat !== undefined && cat > 0) {
                            unitCost = cat;
                            totalValue = qtyDisplay * unitCost;
                        }
                    } else if (document.movementType === 'ADJUSTMENT' && !(totalValue > 0) && unitCost > 0) {
                        totalValue = qtyDisplay * unitCost;
                    }

                    return {
                        documentId: id,
                        itemId: line.itemId,
                        locationId: lineLocationId,
                        qtyRequested: qtyDisplay,
                        qtyInBaseUnit,
                        unitCost,
                        totalValue,
                        notes: line.notes
                    };
                });
                await tx.movementLine.createMany({ data: linesToInsert });
            }
        });
    }

    // Remove lines from root before main update
    const { lines, adjustmentDirection: _adjDir, clientRequestKey: _crk, ...mainData } = data;

    if (mainData.documentDate) {
        mainData.documentDate = new Date(mainData.documentDate);
    }

    let updatedDocument;

    if (Object.keys(mainData).length > 0) {
        updatedDocument = await prisma.movementDocument.update({
            where: { id },
            data: bumpConcurrencyUpdate(mainData),
            include: {
                lines: { include: { item: { select: { name: true } }, location: { select: { name: true } } } }
            }
        });
    }

    if (data.lines) {
        if (!updatedDocument) {
            await prisma.movementDocument.update({
                where: { id },
                data: bumpConcurrencyUpdate({}),
            });
        }
    }

    const latest = await getMovementById(id, tenantId);

    if (document.movementType === 'ADJUSTMENT' && beforeAudit) {
        await logAction({
            tenantId,
            entityType: EntityType.MOVEMENT,
            entityId: id,
            action: 'UPDATE',
            changedBy: userId ?? document.createdBy,
            note: `ADJUSTMENT draft updated (${latest.documentNo})`,
            beforeValue: beforeAudit,
            afterValue: adjustmentDocumentAuditSnapshot(latest),
        });
    }

    return latest;
};

module.exports = {
    createMovementDraft,
    getMovements,
    getMovementById,
    updateMovementDraft
};
