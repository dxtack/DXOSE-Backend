'use strict';

const { PrismaClient } = require('@prisma/client');
const { validate: uuidValidate } = require('uuid');

const prisma = new PrismaClient();
const { sortItemsBySearchRank } = require('../utils/item-search-rank.util');

const MODES = Object.freeze({
    OPERATIONAL: 'operational',
    RECEIVING: 'receiving',
});

/**
 * Location-scoped item universe = StockBalance rows for (tenantId, locationId).
 * An item is "linked" to a warehouse only when a balance record exists there.
 * Allowed Categories (LocationCategory) do NOT expand or restrict this picker set.
 *
 * receiving  → balance rows at location, including qtyOnHand = 0
 * operational → same, optionally requirePositiveOnHand
 */

function badRequest(message) {
    const e = new Error(message);
    e.statusCode = 400;
    throw e;
}

function notFound(message = 'Location not found') {
    const e = new Error(message);
    e.statusCode = 404;
    throw e;
}

function normalizeMode(mode) {
    const m = String(mode || MODES.OPERATIONAL).toLowerCase();
    if (m === MODES.RECEIVING || m === 'receive' || m === 'grn') return MODES.RECEIVING;
    return MODES.OPERATIONAL;
}

async function assertLocationInTenant(db, tenantId, locationId) {
    if (!uuidValidate(locationId)) badRequest('Invalid locationId');
    const location = await db.location.findFirst({
        where: { id: locationId, tenantId },
        select: { id: true, departmentId: true, name: true },
    });
    if (!location) notFound();
    return location;
}

/**
 * Item scope filters applied on top of location resolution (dept/category/active).
 */
function buildItemScopeWhere(scope = {}) {
    const itemWhere = { isActive: scope.isActive !== false };
    if (scope.departmentId) itemWhere.departmentId = scope.departmentId;
    if (scope.categoryId) itemWhere.categoryId = scope.categoryId;
    if (scope.tenantId) itemWhere.tenantId = scope.tenantId;
    return itemWhere;
}

function matchesSearchTerm(item, term) {
    if (!term) return true;
    const q = term.toLowerCase();
    return [item.name, item.code, item.barcode]
        .filter((p) => p != null && String(p).trim() !== '')
        .some((p) => String(p).toLowerCase().includes(q));
}

/**
 * StockBalance rows for a location (canonical location↔item link).
 * @param {object} db - prisma or tx
 * @param {string} tenantId
 * @param {string} locationId
 * @param {object} [options]
 * @param {object} [options.itemScope] - departmentId, categoryId, isActive
 * @param {boolean} [options.includeZeroOnHand=true] - include balance rows with qty 0
 * @param {boolean} [options.requirePositiveOnHand=false]
 */
async function listStockBalancesAtLocation(db, tenantId, locationId, options = {}) {
    await assertLocationInTenant(db, tenantId, locationId);

    const itemWhere = buildItemScopeWhere({ tenantId, ...options.itemScope });
    const includeZero = options.includeZeroOnHand !== false;
    const requirePositive = options.requirePositiveOnHand === true;

    const qtyFilter = requirePositive
        ? { gt: 0 }
        : includeZero
            ? undefined
            : { gt: 0 };

    const where = {
        tenantId,
        locationId,
        item: itemWhere,
        ...(qtyFilter !== undefined ? { qtyOnHand: qtyFilter } : {}),
    };

    return db.stockBalance.findMany({
        where,
        select: {
            itemId: true,
            locationId: true,
            qtyOnHand: true,
            qtyBlocked: true,
            wacUnitCost: true,
            item: {
                select: {
                    id: true,
                    name: true,
                    code: true,
                    barcode: true,
                    isActive: true,
                    departmentId: true,
                    categoryId: true,
                },
            },
        },
        orderBy: [{ item: { name: 'asc' } }],
    });
}

/**
 * Map balance rows → picker rows (same shape for receiving + operational).
 */
function mapBalancesToPickerItems(balances, searchTerm) {
    const mapped = balances.map((b) => ({
        id: b.itemId,
        name: b.item?.name || '',
        code: b.item?.code || null,
        barcode: b.item?.barcode || null,
        currentStock: Number(b.qtyOnHand) || 0,
        qtyBlocked: Number(b.qtyBlocked) || 0,
        availableQty: Math.max(
            0,
            Number(b.qtyOnHand) - Number(b.qtyBlocked || 0),
        ),
        hasStockBalance: true,
        locationId: b.locationId,
    }));
    const filtered = searchTerm
        ? mapped.filter((it) => matchesSearchTerm(it, searchTerm))
        : mapped;
    return sortItemsBySearchRank(filtered, searchTerm || '');
}

/**
 * Receiving / GRN: items with a StockBalance at this location (qty may be 0).
 * Same ground truth as Stock Balances filtered by location (including zeros).
 */
async function listReceivingItemIdsAtLocation(db, tenantId, locationId, options = {}) {
    const term = options.search && String(options.search).trim() ? String(options.search).trim() : '';
    const balances = await listStockBalancesAtLocation(db, tenantId, locationId, {
        itemScope: options.itemScope,
        includeZeroOnHand: true,
        requirePositiveOnHand: false,
    });
    const take = Math.min(Math.max(parseInt(options.take, 10) || 500, 1), 1000);
    return mapBalancesToPickerItems(balances, term).slice(0, take);
}

/**
 * Unified resolver — both modes are location StockBalance-scoped.
 * receiving always includes zero on-hand rows; operational honors requirePositiveOnHand.
 */
async function resolveItemsForLocation(tenantId, locationId, query = {}) {
    const mode = normalizeMode(query.mode);
    const itemScope = {
        departmentId: query.departmentId,
        categoryId: query.categoryId,
        isActive: query.isActive !== 'false',
    };
    const term = query.search && String(query.search).trim() ? String(query.search).trim() : '';

    if (mode === MODES.RECEIVING) {
        return {
            mode: MODES.RECEIVING,
            items: await listReceivingItemIdsAtLocation(prisma, tenantId, locationId, {
                search: term,
                take: query.take,
                itemScope,
            }),
        };
    }

    const requirePositive =
        query.requirePositiveOnHand === 'true' || query.requirePositiveOnHand === true;
    const balances = await listStockBalancesAtLocation(prisma, tenantId, locationId, {
        itemScope,
        includeZeroOnHand: query.includeZeroOnHand !== 'false',
        requirePositiveOnHand: requirePositive,
    });

    return {
        mode: MODES.OPERATIONAL,
        items: mapBalancesToPickerItems(balances, term),
    };
}

/**
 * Inventory count: balance rows per location (no cartesian product).
 */
async function listOperationalCellsForLocations(db, tenantId, locationIds, itemScope = {}) {
    if (!locationIds?.length) return [];

    const itemWhere = buildItemScopeWhere({ tenantId, isActive: true, ...itemScope });

    return db.stockBalance.findMany({
        where: {
            tenantId,
            locationId: { in: locationIds },
            item: itemWhere,
        },
        select: {
            itemId: true,
            locationId: true,
            qtyOnHand: true,
        },
        orderBy: [{ locationId: 'asc' }, { item: { name: 'asc' } }],
    });
}

/**
 * Backend guard: every line must have StockBalance at location.
 * @param {object} tx - prisma transaction client
 * @param {object} [options]
 * @param {string} [options.defaultLocationId] - fallback for lines without locationId
 * @param {boolean} [options.requirePositiveOnHand] - transfer-style (on hand > 0)
 * @param {boolean} [options.requireAvailableQty] - get-pass-style (onHand - blocked >= qty)
 */
async function assertLinesHaveStockAtLocation(tx, tenantId, lines, options = {}) {
    if (!Array.isArray(lines) || lines.length === 0) return;

    const defaultLoc = options.defaultLocationId || null;

    for (const line of lines) {
        const itemId = line.itemId;
        const locationId = line.locationId || defaultLoc;
        const qty = line.qty != null ? Number(line.qty) : line.requestedQty != null ? Number(line.requestedQty) : null;

        if (!itemId || !locationId) {
            throw Object.assign(
                new Error('Each line requires item and location tied to stock at that warehouse.'),
                { statusCode: 400, code: 'ITEM_LOCATION_REQUIRED' },
            );
        }

        const stock = await tx.stockBalance.findUnique({
            where: { tenantId_itemId_locationId: { tenantId, itemId, locationId } },
            include: { item: { select: { name: true, isActive: true } } },
        });

        if (!stock) {
            throw Object.assign(
                new Error(
                    'This item does not belong to the selected warehouse. A stock balance record is required at this location.',
                ),
                { statusCode: 400, code: 'ITEM_NOT_AT_LOCATION' },
            );
        }

        if (stock.item && stock.item.isActive === false) {
            throw Object.assign(new Error('Item is inactive and cannot be used on this document.'), {
                statusCode: 400,
                code: 'ITEM_INACTIVE',
            });
        }

        const onHand = Number(stock.qtyOnHand) || 0;
        const blocked = Number(stock.qtyBlocked) || 0;
        const available = onHand - blocked;
        const itemName = stock.item?.name || 'item';

        if (options.requirePositiveOnHand && onHand <= 0) {
            throw Object.assign(
                new Error(`Item "${itemName}" has no stock at the selected warehouse.`),
                { statusCode: 400, code: 'INSUFFICIENT_STOCK_AT_LOCATION' },
            );
        }

        if (options.requireAvailableQty && qty != null && Number.isFinite(qty)) {
            if (available < qty - 1e-9) {
                throw Object.assign(
                    new Error(
                        `Insufficient stock for ${itemName}. Available: ${available}. Fix quantities before submit — do not send this to Security.`,
                    ),
                    { statusCode: 422, code: 'INSUFFICIENT_AVAILABLE_STOCK' },
                );
            }
        }

        if (options.validateQtyAgainstOnHand && qty != null && Number.isFinite(qty)) {
            if (qty <= 0) {
                throw Object.assign(new Error('Line quantity must be greater than zero.'), {
                    statusCode: 400,
                    code: 'INVALID_LINE_QTY',
                });
            }
            if (onHand < qty - 1e-9) {
                throw Object.assign(
                    new Error(
                        `Insufficient stock for "${itemName}" at source: available ${onHand}, requested ${qty}.`,
                    ),
                    { statusCode: 422, code: 'INSUFFICIENT_STOCK_AT_LOCATION' },
                );
            }
        }
    }
}

module.exports = {
    MODES,
    normalizeMode,
    assertLocationInTenant,
    listStockBalancesAtLocation,
    listReceivingItemIdsAtLocation,
    resolveItemsForLocation,
    listOperationalCellsForLocations,
    assertLinesHaveStockAtLocation,
};
