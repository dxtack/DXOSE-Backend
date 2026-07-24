const prisma = require('../config/database');
const locationItemResolution = require('./location-item-resolution.service');

function badRequest(message) {
    const e = new Error(message);
    e.statusCode = 400;
    return e;
}

/** Min-only: below configured minimum (qty may be zero). */
const isBelowMinimumStock = (balance) => {
    const qty = parseFloat(balance.qtyOnHand) || 0;
    const min = parseFloat(balance.minQty) || 0;
    return min > 0 && qty < min;
};

// ── GET PAR LEVELS FOR A LOCATION ─────────────────────────────────────────────
const getParLevels = async (tenantId, locationId, { categoryId } = {}) => {
    const { items } = await locationItemResolution.resolveItemsForLocation(tenantId, locationId, {
        mode: locationItemResolution.MODES.RECEIVING,
        categoryId,
        take: 10000, // fetch all expected items for location
    });

    const itemIds = items.map((it) => it.id);
    if (itemIds.length === 0) return [];

    const balances = await prisma.stockBalance.findMany({
        where: { tenantId, locationId, itemId: { in: itemIds } },
    });

    const balanceMap = new Map(balances.map((b) => [b.itemId, b]));

    const location = await prisma.location.findFirst({
        where: { id: locationId, tenantId },
        select: { id: true, name: true },
    });

    const fullItems = await prisma.item.findMany({
        where: { tenantId, id: { in: itemIds } },
        select: {
            id: true, name: true, barcode: true, imageUrl: true, unitPrice: true,
            categoryId: true,
            category: { select: { id: true, name: true, departmentId: true } },
        },
    });

    const itemMap = new Map(fullItems.map((it) => [it.id, it]));

    return items.map((it) => {
        const bal = balanceMap.get(it.id);
        const fullItem = itemMap.get(it.id);
        return {
            tenantId,
            locationId,
            itemId: it.id,
            qtyOnHand: bal ? bal.qtyOnHand : 0,
            qtyBlocked: bal ? bal.qtyBlocked : 0,
            totalQtyLost: bal ? bal.totalQtyLost : 0,
            totalQtyDamage: bal ? bal.totalQtyDamage : 0,
            wacUnitCost: bal ? bal.wacUnitCost : 0,
            minQty: bal ? bal.minQty : 0,
            reorderPoint: bal ? bal.reorderPoint : 0,
            item: fullItem,
            location,
        };
    }).sort((a, b) => (a.item?.name || '').localeCompare(b.item?.name || ''));
};

// ── UPDATE PAR LEVELS (minQty only — max/reorder left unchanged in DB) ─────────
// updates = [{ itemId, minQty? }] — all rows must belong to `locationId`.
const updateParLevels = async (tenantId, locationId, updates) => {
    if (!locationId) throw badRequest('locationId is required');
    if (!Array.isArray(updates) || updates.length === 0) throw badRequest('updates must be a non-empty array');

    const location = await prisma.location.findFirst({
        where: { id: locationId, tenantId },
        select: { id: true },
    });
    if (!location) throw badRequest('Location not found or does not belong to this tenant');

    const itemIds = updates.map((u) => u.itemId).filter(Boolean);
    if (itemIds.length !== updates.length) throw badRequest('Each update must include a valid itemId');
    if (new Set(itemIds).size !== itemIds.length) throw badRequest('Duplicate itemId in updates');

    for (const u of updates) {
        if (u.locationId !== undefined && u.locationId !== locationId) {
            throw badRequest(`locationId mismatch for item ${u.itemId}`);
        }
    }

    const num = (v) => {
        const n = typeof v === 'number' ? v : parseFloat(v);
        return Number.isFinite(n) ? n : NaN;
    };

    for (const u of updates) {
        if (u.minQty !== undefined) {
            const effMin = num(u.minQty);
            if (Number.isNaN(effMin) || effMin < 0) {
                throw badRequest(`Invalid minimum quantity for Item ID: ${u.itemId}`);
            }
        }
    }

    const ops = updates
        .filter((u) => u.minQty !== undefined)
        .map((u) =>
            prisma.stockBalance.upsert({
                where: {
                    tenantId_itemId_locationId: {
                        tenantId,
                        itemId: u.itemId,
                        locationId,
                    },
                },
                update: { minQty: u.minQty },
                create: {
                    tenantId,
                    itemId: u.itemId,
                    locationId,
                    qtyOnHand: 0,
                    wacUnitCost: 0,
                    minQty: u.minQty,
                },
            })
        );

    if (ops.length === 0) throw badRequest('Each update must include minQty');

    await prisma.$transaction(ops);
    return { updated: ops.length };
};

// ── CHECK LOW STOCK (min-only) ────────────────────────────────────────────────
const checkLowStock = async (tenantId, locationId) => {
    const where = { tenantId, minQty: { gt: 0 } };
    if (locationId) where.locationId = locationId;

    const balances = await prisma.stockBalance.findMany({
        where,
        include: {
            item: { select: { id: true, name: true, barcode: true, imageUrl: true, unitPrice: true, department: { select: { name: true } } } },
            location: { select: { id: true, name: true } },
        },
    });

    return balances.filter(isBelowMinimumStock);
};

module.exports = {
    getParLevels,
    updateParLevels,
    checkLowStock,
    isBelowMinimumStock,
};
