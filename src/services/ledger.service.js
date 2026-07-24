const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const settingService = require('./setting.service');
const {
    resolveScopeContext,
    scopeWhereFor,
    metaFor,
    assertInScope,
    SCOPE_MODULE,
} = require('./scope/scopeContext');

const withRunningBalance = (e) => ({
    ...e,
    // Frontend expects `runningBalance`; DB column is `balanceAfter`.
    runningBalance: e?.balanceAfter,
});

/**
 * Resolve ledger rows for a movement document by UUID and/or human document number.
 * Matches both referenceId and referenceNo so deep-links survive legacy/mis-keyed rows.
 */
async function resolveMovementDocumentReferenceFilter(tenantId, movementDocumentId, documentNo) {
    const docId = String(movementDocumentId ?? '').trim();
    const docNo = String(documentNo ?? '').trim();
    if (!docId && !docNo) {
        return null;
    }

    const movementDoc = await prisma.movementDocument.findFirst({
        where: {
            tenantId,
            OR: [
                ...(docId ? [{ id: docId }] : []),
                ...(docNo ? [{ documentNo: docNo }] : []),
            ],
        },
        select: { id: true, documentNo: true },
    });

    if (movementDoc) {
        return {
            OR: [
                { referenceId: movementDoc.id },
                { referenceNo: movementDoc.documentNo },
            ],
        };
    }

    return {
        OR: [
            ...(docId ? [{ referenceId: docId }] : []),
            ...(docNo ? [{ referenceNo: docNo }] : []),
        ],
    };
}

async function loadMovementDocumentForLedgerFallback(tenantId, movementDocumentId, documentNo) {
    const docId = String(movementDocumentId ?? '').trim();
    const docNo = String(documentNo ?? '').trim();
    if (!docId && !docNo) {
        return null;
    }

    return prisma.movementDocument.findFirst({
        where: {
            tenantId,
            OR: [
                ...(docId ? [{ id: docId }] : []),
                ...(docNo ? [{ documentNo: docNo }] : []),
            ],
        },
        include: {
            lines: {
                include: {
                    item: { select: { id: true, name: true, barcode: true } },
                    location: { select: { id: true, name: true } },
                },
            },
        },
    });
}

function syntheticLedgerRowsFromMovementDocument(document) {
    const createdAt = document.postedAt ?? document.documentDate ?? document.updatedAt ?? new Date();

    return (document.lines ?? []).map((line, index) => {
        const qty = Number(line.qtyInBaseUnit ?? line.qtyRequested ?? 0);
        const isPositive = qty >= 0;
        const absQty = Math.abs(qty);
        const unitCost = Number(line.unitCost ?? 0);
        const totalValue = Number(line.totalValue ?? 0) || absQty * unitCost;
        const itemId = line.itemId ?? line.item?.id;
        const locationId = line.locationId ?? line.location?.id;

        return {
            id: `movement-line:${line.id ?? index}`,
            tenantId: document.tenantId,
            itemId,
            locationId,
            movementType: document.movementType,
            qtyIn: isPositive ? absQty : 0,
            qtyOut: isPositive ? 0 : absQty,
            unitCost,
            totalValue,
            referenceNo: document.documentNo,
            referenceId: document.id,
            createdAt,
            item: line.item
                ? { id: itemId, name: line.item.name, barcode: line.item.barcode ?? null }
                : null,
            location: line.location
                ? { id: locationId, name: line.location.name }
                : null,
            runningBalance: null,
            syntheticFromMovement: true,
        };
    });
}

async function syntheticLedgerEntriesForDocument(tenantId, documentId, documentNo, user) {
    const movementDoc = await loadMovementDocumentForLedgerFallback(tenantId, documentId, documentNo);
    if (!movementDoc || !Array.isArray(movementDoc.lines) || movementDoc.lines.length === 0) {
        return [];
    }

    if (user) {
        const scope = await resolveScopeContext(user, tenantId);
        try {
            await assertInScope(SCOPE_MODULE.MOVEMENT, { id: movementDoc.id }, scope, 'read');
        } catch {
            return [];
        }
    }

    return syntheticLedgerRowsFromMovementDocument(movementDoc);
}

/**
 * Get ledger entries with full filtering and pagination.
 * Supports: itemId, locationId, dateFrom, dateTo, movementDocumentId, movementType
 */
const getLedgerEntries = async (tenantId, query = {}, user = null) => {
    const obStatus = await settingService.getObStatus(tenantId);
    if (obStatus !== 'FINALIZED') {
        return {
            entries: [],
            total: 0,
            status: 'SETUP_IN_PROGRESS',
            obStatus,
        };
    }

    const {
        skip = 0,
        take = 50,
        itemId,
        locationId,
        dateFrom,
        dateTo,
        movementDocumentId,
        documentNo,
        movementType
    } = query;

    const scope = user ? await resolveScopeContext(user, tenantId) : null;
    const scopeWhere = scope ? scopeWhereFor(SCOPE_MODULE.LEDGER, scope) : {};
    const movementRefFilter = movementDocumentId || documentNo
        ? await resolveMovementDocumentReferenceFilter(tenantId, movementDocumentId, documentNo)
        : null;

    const where = {
        tenantId,
        ...scopeWhere,
        ...(movementRefFilter ?? {}),
        ...(itemId && { itemId }),
        ...(locationId && { locationId }),
        ...(movementType && { movementType }),
        ...((dateFrom || dateTo) && {
            createdAt: {
                ...(dateFrom && { gte: new Date(dateFrom) }),
                ...(dateTo && { lte: new Date(dateTo + 'T23:59:59.999Z') })
            }
        })
    };

    const [entries, total] = await Promise.all([
        prisma.inventoryLedger.findMany({
            where,
            skip: parseInt(skip),
            take: parseInt(take),
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            include: {
                item: { select: { id: true, name: true, barcode: true } },
                location: { select: { id: true, name: true } },
                createdByUser: { select: { firstName: true, lastName: true } }
            }
        }),
        prisma.inventoryLedger.count({ where })
    ]);

    if (entries.length === 0 && movementRefFilter) {
        const synthetic = await syntheticLedgerEntriesForDocument(
            tenantId,
            movementDocumentId,
            documentNo,
            user,
        );
        const scopeMeta = scope ? metaFor(scope, { total: synthetic.length }) : null;
        return { entries: synthetic, total: synthetic.length, ...scopeMeta };
    }

    const scopeMeta = scope ? metaFor(scope, { total }) : null;
    return { entries: entries.map(withRunningBalance), total, ...scopeMeta };
};

/**
 * Export ledger entries with full filtering but without pagination.
 */
const exportLedgerEntries = async (tenantId, query = {}, user = null) => {
    const obStatus = await settingService.getObStatus(tenantId);
    if (obStatus !== 'FINALIZED') {
        return [];
    }

    const {
        itemId,
        locationId,
        dateFrom,
        dateTo,
        movementDocumentId,
        documentNo,
        movementType
    } = query;

    const scope = user ? await resolveScopeContext(user, tenantId) : null;
    const scopeWhere = scope ? scopeWhereFor(SCOPE_MODULE.LEDGER, scope) : {};
    const movementRefFilter = movementDocumentId || documentNo
        ? await resolveMovementDocumentReferenceFilter(tenantId, movementDocumentId, documentNo)
        : null;

    const where = {
        tenantId,
        ...scopeWhere,
        ...(movementRefFilter ?? {}),
        ...(itemId && { itemId }),
        ...(locationId && { locationId }),
        ...(movementType && { movementType }),
        ...((dateFrom || dateTo) && {
            createdAt: {
                ...(dateFrom && { gte: new Date(dateFrom) }),
                ...(dateTo && { lte: new Date(dateTo + 'T23:59:59.999Z') })
            }
        })
    };

    const entries = await prisma.inventoryLedger.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: {
            item: { select: { id: true, name: true, barcode: true } },
            location: { select: { id: true, name: true } },
            createdByUser: { select: { firstName: true, lastName: true } }
        }
    });

    return entries.map(withRunningBalance);
};

/**
 * Get ledger entries for a specific movement document (by referenceId / referenceNo).
 */
const getLedgerByDocument = async (documentId, tenantId, user = null, options = {}) => {
    const obStatus = await settingService.getObStatus(tenantId);
    if (obStatus !== 'FINALIZED') {
        return [];
    }

    const scope = user ? await resolveScopeContext(user, tenantId) : null;
    const scopeWhere = scope ? scopeWhereFor(SCOPE_MODULE.LEDGER, scope) : {};
    const movementRefFilter = await resolveMovementDocumentReferenceFilter(
        tenantId,
        documentId,
        options.documentNo,
    );

    if (!movementRefFilter) {
        return [];
    }

    const entries = await prisma.inventoryLedger.findMany({
        where: {
            tenantId,
            ...scopeWhere,
            ...movementRefFilter,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: {
            item: { select: { id: true, name: true, barcode: true } },
            location: { select: { id: true, name: true } }
        }
    });

    if (entries.length > 0) {
        return entries.map(withRunningBalance);
    }

    return syntheticLedgerEntriesForDocument(
        tenantId,
        documentId,
        options.documentNo,
        user,
    );
};

module.exports = {
    getLedgerEntries,
    exportLedgerEntries,
    getLedgerByDocument
};
