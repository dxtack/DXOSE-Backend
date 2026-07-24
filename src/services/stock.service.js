const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const ExcelJS = require('exceljs');
const settingService = require('./setting.service');
const {
    resolveScopeContext,
    scopeWhereFor,
    metaFor,
    assertInScope,
    SCOPE_MODULE,
} = require('./scope/scopeContext');

const normalizeComparableName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

const decorateStockBalanceRow = (row, tenantId) => {
    const sourceItem = row.item || null;
    const isExternalItem = !sourceItem || sourceItem.tenantId !== tenantId;
    const displayName = isExternalItem
        ? `[External] ${sourceItem?.name?.trim() || row.itemId}`
        : sourceItem?.name || '';
    const displayBarcode = sourceItem?.barcode || null;
    const displayCategoryName = isExternalItem
        ? null
        : sourceItem?.category?.name || null;
    const displayDepartmentName = isExternalItem
        ? null
        : sourceItem?.department?.name || null;

    return {
        ...row,
        item: isExternalItem ? null : sourceItem,
        displayName,
        displayBarcode,
        displayCategoryName,
        displayDepartmentName,
        pendingCategorization: isExternalItem,
    };
};

// ─── Shared WHERE builder ──────────────────────────────────────────────────────
const buildWhere = (tenantId, query = {}, includeZero = false) => {
    const { locationId, categoryId, departmentId, search, showZero, negativeOnly, lowStockOnly } = query;

    const itemFilter = {};
    if (categoryId) itemFilter.categoryId = categoryId;
    if (search) {
        itemFilter.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
        ];
    }

    const qtyFilter = (() => {
        if (negativeOnly === 'true') return { lt: 0 };
        if (lowStockOnly === 'true') return undefined;
        if (!includeZero && showZero !== 'true') return { gt: 0 };
        return undefined;
    })();

    const base = {
        tenantId,
        ...(qtyFilter !== undefined && { qtyOnHand: qtyFilter }),
        ...(locationId && { locationId }),
        ...(departmentId && { location: { departmentId } }),
        ...(Object.keys(itemFilter).length > 0 && { item: itemFilter }),
    };

    return base;
};

/** Mirrors Stock Balances UI display helpers (export only). */
const EXPORT_COLUMN_LABELS = {
    itemName: 'Item name',
    barcode: 'Barcode',
    category: 'Category',
    department: 'Department',
    location: 'Location / Store',
    available: 'Available',
    totalValue: 'Total Value',
    reorderStatus: 'Reorder status',
};

const exportRowReorderStatus = (row) => {
    const qty = Number(row.qtyOnHand);
    const reorder = Number(row.reorderPoint ?? row.item?.reorderPoint ?? 0);
    if (qty === 0) return 'out_of_stock';
    if (reorder > 0 && qty < reorder) return 'low_stock';
    return 'in_stock';
};

const exportReorderStatusLabel = (row) => {
    if (row.pendingCategorization) return 'Pending Categorization';
    switch (exportRowReorderStatus(row)) {
        case 'out_of_stock':
            return 'Out of Stock';
        case 'low_stock':
            return 'Low Stock';
        default:
            return 'In Stock';
    }
};

const exportDisplayItemName = (row) => row.displayName?.trim() || row.item?.name?.trim() || '—';
const exportDisplayBarcode = (row) => row.displayBarcode?.trim() || row.item?.barcode?.trim() || '—';

const exportDisplayCategoryName = (row) => {
    if (row.displayCategoryName?.trim()) return row.displayCategoryName.trim();
    if (row.pendingCategorization) return 'Pending Categorization';
    return row.item?.category?.name?.trim() || 'Uncategorized';
};

const exportDisplayDepartmentName = (row) =>
    row.displayDepartmentName?.trim() || row.item?.department?.name?.trim() || '—';

const exportAvailableQty = (row) => Number(row.qtyOnHand ?? 0) - Number(row.qtyBlocked ?? 0);

const exportLineValue = (row) => Number(row.qtyOnHand ?? 0) * Number(row.wacUnitCost ?? 0);

const formatExportQty = (n) =>
    Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

const formatExportMoney = (n) =>
    Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── GET STOCK BALANCES (paginated) ───────────────────────────────────────────
const getStockBalances = async (tenantId, query = {}, user = null) => {
    const obStatus = await settingService.getObStatus(tenantId);
    if (obStatus !== 'FINALIZED') {
        return { balances: [], total: 0 };
    }

    const { skip = 0, take = 50 } = query;
    const scope = user ? await resolveScopeContext(user, tenantId) : null;
    const scopeWhere = scope ? scopeWhereFor(SCOPE_MODULE.STOCK, scope) : {};
    const where = { ...buildWhere(tenantId, query), ...scopeWhere };
    const lowStockOnly = query.lowStockOnly === 'true';

    const include = {
        item: {
            select: {
                id: true, tenantId: true, name: true, barcode: true,
                reorderPoint: true,
                category: { select: { name: true } },
                department: { select: { name: true } },
            },
        },
        location: { select: { id: true, name: true, type: true } },
    };

    let balances;
    let total;

    if (lowStockOnly) {
        const { qtyOnHand: _omit, ...lowWhere } = where;
        const all = await prisma.stockBalance.findMany({
            where: lowWhere,
            include,
        });
        const filtered = all.filter((b) => {
            const qty = Number(b.qtyOnHand);
            const reorder = Number(b.reorderPoint ?? b.item?.reorderPoint ?? 0);
            return reorder > 0 && qty <= reorder;
        });
        total = filtered.length;
        balances = filtered.slice(parseInt(skip), parseInt(skip) + parseInt(take));
    } else {
        [balances, total] = await Promise.all([
            prisma.stockBalance.findMany({
                where,
                skip: parseInt(skip),
                take: parseInt(take),
                include,
                orderBy: [{ location: { name: 'asc' } }, { item: { name: 'asc' } }],
            }),
            prisma.stockBalance.count({ where }),
        ]);
    }

    const normalizedBalances = balances
        .map((row) => decorateStockBalanceRow(row, tenantId))
        .sort((a, b) => {
            const leftLocation = a.location?.name ?? '';
            const rightLocation = b.location?.name ?? '';
            const locationSort = leftLocation.localeCompare(rightLocation, undefined, { sensitivity: 'base' });
            if (locationSort !== 0) return locationSort;
            return normalizeComparableName(a.displayName).localeCompare(normalizeComparableName(b.displayName), undefined, {
                sensitivity: 'base',
            });
        });

    const scopeMeta = scope ? metaFor(scope, { total }) : null;
    return { balances: normalizedBalances, total, ...scopeMeta };
};

// ─── GET SUMMARY STATS ────────────────────────────────────────────────────────
const getStockSummary = async (tenantId, query = {}, user = null) => {
    const obStatus = await settingService.getObStatus(tenantId);
    if (obStatus !== 'FINALIZED') {
        return {
            totalItems: 0,
            totalQty: 0,
            totalValue: 0,
            lowStockCount: 0,
            zeroStockCount: 0,
        };
    }

    const scope = user ? await resolveScopeContext(user, tenantId) : null;
    const scopeWhere = scope ? scopeWhereFor(SCOPE_MODULE.STOCK, scope) : {};
    const where = { ...buildWhere(tenantId, query, true), ...scopeWhere };

    const [totalItems, rows] = await Promise.all([
        prisma.stockBalance.count({ where }),
        prisma.stockBalance.findMany({
            where,
            select: {
                qtyOnHand: true,
                wacUnitCost: true,
                reorderPoint: true,
            },
        }),
    ]);

    let totalQty = 0;
    let totalValue = 0;
    let lowStockCount = 0;
    let zeroStockCount = 0;

    for (const r of rows) {
        const qty = Number(r.qtyOnHand);
        const wac = Number(r.wacUnitCost);
        totalQty += qty;
        totalValue += qty * wac;
        if (qty === 0) zeroStockCount++;
        const reorder = Number(r.reorderPoint || 0);
        if (reorder > 0 && qty <= reorder) lowStockCount++;
    }

    return {
        totalItems,
        totalQty,
        totalValue,
        lowStockCount,
        zeroStockCount,
    };
};

// ─── EXPORT TO EXCEL ──────────────────────────────────────────────────────────
const exportStockBalances = async (tenantId, query = {}, user = null) => {
    const obStatus = await settingService.getObStatus(tenantId);
    const scope = user ? await resolveScopeContext(user, tenantId) : null;
    const scopeWhere = scope ? scopeWhereFor(SCOPE_MODULE.STOCK, scope) : {};
    const where = { ...buildWhere(tenantId, query), ...scopeWhere };
    const lowStockOnly = query.lowStockOnly === 'true';

    const rawBalances =
        obStatus === 'FINALIZED'
            ? await prisma.stockBalance.findMany({
                  where,
                  include: {
                      item: {
                          select: {
                              id: true,
                              tenantId: true,
                              name: true,
                              barcode: true,
                              reorderPoint: true,
                              category: { select: { name: true } },
                              department: { select: { name: true } },
                          },
                      },
                      location: { select: { name: true } },
                  },
                  orderBy: [{ location: { name: 'asc' } }, { item: { name: 'asc' } }],
              })
            : [];

    let balances = rawBalances.map((row) => decorateStockBalanceRow(row, tenantId));

    if (lowStockOnly) {
        balances = balances.filter((b) => {
            const qty = Number(b.qtyOnHand);
            const reorder = Number(b.reorderPoint ?? b.item?.reorderPoint ?? 0);
            return reorder > 0 && qty <= reorder;
        });
    }

    balances.sort((a, b) => {
        const locationSort = (a.location?.name ?? '').localeCompare(b.location?.name ?? '', undefined, {
            sensitivity: 'base',
        });
        if (locationSort !== 0) return locationSort;
        return normalizeComparableName(a.displayName).localeCompare(normalizeComparableName(b.displayName), undefined, {
            sensitivity: 'base',
        });
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'OSE Inventory';

    const ws = wb.addWorksheet('Stock Balances');

    ws.columns = [
        { header: EXPORT_COLUMN_LABELS.itemName, key: 'name', width: 35 },
        { header: EXPORT_COLUMN_LABELS.barcode, key: 'barcode', width: 18 },
        { header: EXPORT_COLUMN_LABELS.category, key: 'cat', width: 20 },
        { header: EXPORT_COLUMN_LABELS.department, key: 'dept', width: 20 },
        { header: EXPORT_COLUMN_LABELS.location, key: 'loc', width: 22 },
        { header: EXPORT_COLUMN_LABELS.available, key: 'available', width: 14 },
        { header: EXPORT_COLUMN_LABELS.totalValue, key: 'value', width: 18 },
        { header: EXPORT_COLUMN_LABELS.reorderStatus, key: 'status', width: 16 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    headerRow.alignment = { horizontal: 'center' };

    let grandTotal = 0;

    balances.forEach((b) => {
        const lineVal = exportLineValue(b);
        grandTotal += lineVal;
        const statusKey = exportRowReorderStatus(b);

        const row = ws.addRow({
            name: exportDisplayItemName(b),
            barcode: exportDisplayBarcode(b),
            cat: exportDisplayCategoryName(b),
            dept: exportDisplayDepartmentName(b) || '—',
            loc: b.location?.name || '—',
            available: formatExportQty(exportAvailableQty(b)),
            value: `SAR ${formatExportMoney(lineVal)}`,
            status: exportReorderStatusLabel(b),
        });

        row.getCell('available').alignment = { horizontal: 'right' };
        row.getCell('value').alignment = { horizontal: 'right' };
        row.getCell('status').alignment = { horizontal: 'center' };

        if (statusKey === 'out_of_stock') {
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F0' } };
        } else if (statusKey === 'low_stock') {
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
        }
    });

    ws.addRow({});
    const totalRow = ws.addRow({
        name: 'GRAND TOTAL',
        value: `SAR ${formatExportMoney(grandTotal)}`,
    });
    totalRow.font = { bold: true };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
    totalRow.getCell('value').alignment = { horizontal: 'right' };

    ws.getRow(1).eachCell((cell) => {
        cell.border = {
            bottom: { style: 'medium', color: { argb: 'FF1E40AF' } },
        };
    });

    ws.views = [{ state: 'frozen', ySplit: 1 }];

    return wb;
};

// ─── GET ITEM STOCK PROFILE ───────────────────────────────────────────────────
const getItemStockProfile = async (itemId, tenantId) => {
    const item = await prisma.item.findFirst({
        where: { id: itemId, tenantId },
        select: { id: true, name: true, barcode: true, category: { select: { name: true } } },
    });
    if (!item) { const e = new Error('Item not found'); e.statusCode = 404; throw e; }

    const obStatus = await settingService.getObStatus(tenantId);
    if (obStatus !== 'FINALIZED') {
        return {
            item,
            summary: { totalQtyOnHand: 0, averageUnitCost: 0, totalValue: 0 },
            locations: [],
        };
    }

    const balances = await prisma.stockBalance.findMany({
        where: { itemId, tenantId, qtyOnHand: { gt: 0 } },
        include: { location: { select: { id: true, name: true, type: true } } },
        orderBy: { qtyOnHand: 'desc' },
    });

    const totalQty = balances.reduce((s, b) => s + Number(b.qtyOnHand), 0);
    const totalValue = balances.reduce((s, b) => s + Number(b.qtyOnHand) * Number(b.wacUnitCost), 0);
    const avgWac = totalQty > 0 ? totalValue / totalQty : 0;

    return {
        item,
        summary: { totalQtyOnHand: totalQty, averageUnitCost: avgWac, totalValue },
        locations: balances,
    };
};

module.exports = { getStockBalances, getStockSummary, exportStockBalances, getItemStockProfile };
