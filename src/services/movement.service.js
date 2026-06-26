const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const settingService = require('./setting.service');
const { assertMovementRegisterMutable } = require('./movementRegisterGuard.service');
const { withUserFacingState } = require('../platform/lifecyclePresentation.service');
const { generateDocNumber, prefixFromMovementType } = require('./docNumbering.service');
const { assertConcurrencyVersion, bumpConcurrencyUpdate } = require('../platform/concurrency.service');
const { EntityType } = require('./auditTrail.service');
const {
    assertCreateDraftOrigin,
    assertDirectApiCreateType,
} = require('./movementDirectAdjustment.guard');

function assertPositiveLineQty(qty, label = 'Line quantity') {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
        throw Object.assign(new Error(`${label} must be greater than zero.`), { statusCode: 422 });
    }
    return n;
}

/**
 * Create a new draft movement document.
 * @param {object} data
 * @param {string} tenantId
 * @param {string} userId
 * @param {import('@prisma/client').Prisma.TransactionClient | import('@prisma/client').PrismaClient} [db]
 * @param {{ origin: 'DIRECT_API' | 'INTERNAL' }} options — required; fail-closed (no default)
 */
const createMovementDraft = async (data, tenantId, userId, db = prisma, options) => {
    const origin = assertCreateDraftOrigin(options);

    if (origin === 'DIRECT_API') {
        assertDirectApiCreateType(data.movementType);
        data.movementType = 'ADJUSTMENT';
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

    // ── Phase 5 MANDATORY GUARD: No manual ISSUE without an approved Requisition ──
    if (data.movementType === 'ISSUE') {
        if (!data.requisitionId) {
            const err = new Error('Direct ISSUE movements are not allowed. All stock issues must reference an approved Store Requisition.');
            err.statusCode = 403;
            throw err;
        }
        const reqn = await db.storeRequisition.findFirst({
            where: { id: data.requisitionId, tenantId },
        });
        if (!reqn) {
            const err = new Error('Referenced Requisition not found.');
            err.statusCode = 404;
            throw err;
        }
        if (!['APPROVED', 'PARTIALLY_ISSUED'].includes(reqn.status)) {
            const err = new Error(`Referenced Requisition must be APPROVED or PARTIALLY_ISSUED. Current status: ${reqn.status}`);
            err.statusCode = 403;
            throw err;
        }
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
    }

    if (data.destLocationId) {
        const dest = await db.location.findFirst({ where: { id: data.destLocationId, tenantId } });
        if (!dest) throw Object.assign(new Error('Destination location not found'), { statusCode: 404 });
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

    // Build line items for nested create
    const linesCreate = (data.lines && data.lines.length > 0)
        ? {
            create: data.lines.map(line => {
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
                const qtyReq = assertPositiveLineQty(parseFloat(qtyInput) || 0);
                let unitCost = parseFloat(line.unitCost) || 0;
                let totalValue = parseFloat(line.totalValue) || 0;
                if (data.movementType === 'OPENING_BALANCE' && obCatalogPrices) {
                    const cat = obCatalogPrices.get(line.itemId);
                    if (cat !== undefined && cat > 0) {
                        unitCost = cat;
                        totalValue = qtyReq * unitCost;
                    }
                }

                return {
                    item: { connect: { id: line.itemId } },
                    location: { connect: { id: lineLocationId } },
                    qtyRequested: qtyReq,
                    qtyInBaseUnit: qtyReq,
                    unitCost,
                    totalValue,
                    notes: line.notes || null
                };
            })
        }
        : undefined;

    // Remove lines and other non-Prisma fields from the root data
    const { lines, referenceNumber, ...headerData } = data;

    const documentData = {
        ...headerData,
        documentNo,
        documentDate: new Date(data.documentDate || new Date()),
        status: 'DRAFT',
        createdBy: userId,
        tenantId,
        ...(linesCreate && { lines: linesCreate })
    };

    return db.movementDocument.create({
        data: documentData,
        include: {
            lines: { include: { item: { select: { name: true, barcode: true } } } },
            createdByUser: { select: { firstName: true, lastName: true } }
        }
    });
};

/**
 * Get movement documents (List)
 */
const getMovements = async (tenantId, query) => {
    const obStatus = await settingService.getObStatus(tenantId);
    if (obStatus !== 'FINALIZED') {
        return {
            documents: [],
            total: 0,
            status: 'SETUP_IN_PROGRESS',
            obStatus,
        };
    }

    const { skip = 0, take = 10, status, movementType, search, sourceType } = query;

    const sourceFilter =
        sourceType === 'INTERNAL'
            ? { getPassId: null }
            : sourceType === 'GET_PASS_RETURN'
                ? { getPassId: { not: null } }
                : {};

    const where = {
        tenantId,
        ...(status && { status }),
        ...(movementType && { movementType }),
        ...sourceFilter,
        ...(search && {
            OR: [
                { documentNo: { contains: search, mode: 'insensitive' } },
                { department: { contains: search, mode: 'insensitive' } },
                { notes: { contains: search, mode: 'insensitive' } }
            ]
        })
    };

    const [documents, total] = await Promise.all([
        prisma.movementDocument.findMany({
            where,
            skip: parseInt(skip),
            take: parseInt(take),
            orderBy: { documentDate: 'desc' },
            include: {
                createdByUser: { select: { firstName: true, lastName: true } },
                getPass: { select: { id: true, passNo: true } },
                _count: { select: { lines: true } }
            }
        }),
        prisma.movementDocument.count({ where })
    ]);

    return {
        documents: documents.map((doc) => withUserFacingState('MOVEMENT', doc)),
        total,
    };
};

/**
 * Get specific movement document details
 */
const getMovementById = async (id, tenantId) => {
    const obStatus = await settingService.getObStatus(tenantId);
    if (obStatus !== 'FINALIZED') {
        const error = new Error('Stock movements are unavailable while opening balance setup is in progress.');
        error.statusCode = 409;
        error.code = 'SETUP_IN_PROGRESS';
        error.details = { obStatus };
        throw error;
    }

    const document = await prisma.movementDocument.findFirst({
        where: { id, tenantId },
        include: {
            lines: {
                include: {
                    item: { select: { name: true, barcode: true, unitPrice: true } },
                    location: { select: { name: true } }
                }
            },
            createdByUser: { select: { firstName: true, lastName: true } }
        }
    });

    if (!document) {
        const error = new Error('Movement document not found');
        error.statusCode = 404;
        throw error;
    }

    return withUserFacingState('MOVEMENT', document);
};

/**
 * Update a DRAFT movement document
 */
const updateMovementDraft = async (id, data, tenantId, userId = null, expectedVersion = null) => {
    const document = await getMovementById(id, tenantId);

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
                    const qtyReq = assertPositiveLineQty(parseFloat(qtyInput) || 0);
                    let unitCost = parseFloat(line.unitCost) || 0;
                    let totalValue = parseFloat(line.totalValue) || 0;
                    if (obCatalogPrices) {
                        const cat = obCatalogPrices.get(line.itemId);
                        if (cat !== undefined && cat > 0) {
                            unitCost = cat;
                            totalValue = qtyReq * unitCost;
                        }
                    }

                    return {
                        documentId: id,
                        itemId: line.itemId,
                        locationId: lineLocationId,
                        qtyRequested: qtyReq,
                        qtyInBaseUnit: qtyReq,
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
    const { lines, ...mainData } = data;

    // Ensure documentDate is a proper Date object if present
    if (mainData.documentDate) {
        mainData.documentDate = new Date(mainData.documentDate);
    }

    if (Object.keys(mainData).length > 0) {
        return prisma.movementDocument.update({
            where: { id },
            data: bumpConcurrencyUpdate(mainData),
            include: {
                lines: { include: { item: { select: { name: true } } } }
            }
        });
    }

    if (data.lines) {
        await prisma.movementDocument.update({
            where: { id },
            data: bumpConcurrencyUpdate({}),
        });
    }

    // Re-fetch to return latest data if only lines were updated
    return getMovementById(id, tenantId);
};

module.exports = {
    createMovementDraft,
    getMovements,
    getMovementById,
    updateMovementDraft
};
