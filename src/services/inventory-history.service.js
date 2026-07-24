'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const settingService = require('./setting.service');
const {
    resolveScopeContext,
    scopeWhereFor,
    metaFor,
    SCOPE_MODULE,
} = require('./scope/scopeContext');

const mapHistoryRow = (entry) => ({
    id: entry.id,
    movementType: entry.movementType,
    referenceType: entry.referenceType,
    referenceId: entry.referenceId,
    referenceNo: entry.referenceNo,
    qtyIn: entry.qtyIn,
    qtyOut: entry.qtyOut,
    unitCost: entry.unitCost,
    totalValue: entry.totalValue,
    notes: entry.notes,
    createdAt: entry.createdAt,
    item: entry.item,
    location: entry.location,
    createdByUser: entry.createdByUser,
});

/**
 * Paginated inventory movement history from inventory_ledger (P0-B).
 * Filters: itemId, locationId, movementType, dateFrom, dateTo, referenceNo
 */
const getInventoryHistory = async (tenantId, query = {}, user = null) => {
    const obStatus = await settingService.getObStatus(tenantId);
    if (obStatus !== 'FINALIZED') {
        return {
            entries: [],
            total: 0,
            status: 'SETUP_IN_PROGRESS',
            obStatus,
        };
    }

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const { itemId, locationId, dateFrom, dateTo, movementType, referenceNo } = query;

    const scope = user ? await resolveScopeContext(user, tenantId) : null;
    const scopeWhere = scope ? scopeWhereFor(SCOPE_MODULE.LEDGER, scope) : {};

    const where = {
        tenantId,
        ...scopeWhere,
        ...(itemId && { itemId }),
        ...(locationId && { locationId }),
        ...(movementType && { movementType }),
        ...(referenceNo && {
            referenceNo: { contains: String(referenceNo).trim(), mode: 'insensitive' },
        }),
        ...((dateFrom || dateTo) && {
            createdAt: {
                ...(dateFrom && { gte: new Date(dateFrom) }),
                ...(dateTo && { lte: new Date(`${dateTo}T23:59:59.999Z`) }),
            },
        }),
    };

    const [entries, total] = await Promise.all([
        prisma.inventoryLedger.findMany({
            where,
            skip,
            take: limit,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            include: {
                item: { select: { id: true, name: true, barcode: true } },
                location: { select: { id: true, name: true } },
                createdByUser: { select: { firstName: true, lastName: true, email: true } },
            },
        }),
        prisma.inventoryLedger.count({ where }),
    ]);

    const scopeMeta = scope ? metaFor(scope, { total }) : null;
    return { entries: entries.map(mapHistoryRow), total, page, limit, ...scopeMeta };
};

module.exports = {
    getInventoryHistory,
};
