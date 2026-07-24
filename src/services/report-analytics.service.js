'use strict';

const { Prisma, PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const excelService = require('./excel.service');
const { generateReportPDF } = require('./pdf.service');
const { buildReportReference } = require('../utils/report-format.util');
const { runWorkspaceCardReport, normalizeHandlerOutput } = require('./report-workspace.handlers');
const { computeTotals, buildTotalsFooterRow } = require('./report-analytics-totals');
const {
    getReportContract,
    getReportColumns,
    projectRowsForContract,
    resolveContractId,
} = require('./report-column-contracts');
const { enrichWithGrouping } = require('./report-orchestrator.service');
const { isGovernanceAuditLogProxy, resolveFamily } = require('./report-family-registry');
const { resolvePdfClassification } = require('./pdf/report-pdf-signatures.util');
const { resolveExportDataset } = require('../utils/report-export.util');
const { resolvePdfProfile } = require('./pdf/report-pdf-profiles');
const { toInclusiveUtcEndOfDay } = require('../utils/report-date-range.util');
const { tenantDateKey } = require('../utils/tenant-calendar.util');
const { getTenantTimezone } = require('./tenantTimezone.service');

const OFFICIAL_LEDGER_WHERE = { affectsValuation: true };

/** Legacy slug aliases → workspace card id */
const ANALYTICS_ALIASES = {
    'item-movement-history': 'inventory-change-history', // permanent backward-compat alias
    'negative-stock': 'negative-stock-report',
    'critical-stock-levels': 'critical-stock-levels',
    'slow-moving-items': 'slow-moving-items',
    'dead-stock': 'dead-stock',
    'zero-movement-items': 'zero-movement-items',
    'high-consumption-items': 'high-consumption-items',
    'stock-movement-analysis': 'stock-movement-analysis',
    'stock-adjustment-summary': 'stock-adjustment-summary',
    'inventory-by-location': 'inventory-by-location',
};

const LEGACY_ONLY_TYPES = new Set([
    'negative-stock-report',
    'slow-moving-items',
    'dead-stock',
    'zero-movement-items',
    'high-consumption-items',
    'stock-movement-analysis',
    'stock-adjustment-summary',
]);

const normalizeCardId = (analyticsType) => ANALYTICS_ALIASES[analyticsType] || analyticsType;

const getDateRange = (startDate, endDate) => {
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = toInclusiveUtcEndOfDay(
        endDate != null && endDate !== '' ? endDate : new Date().toISOString().slice(0, 10),
    );
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw Object.assign(new Error('Invalid date range'), { status: 400 });
    }
    return { start, end };
};

const resolveLocationIds = async (tenantId, { departmentIds, categoryId, locationIds: requestedLocationIds } = {}) => {
    const deptIds = Array.isArray(departmentIds) && departmentIds.length > 0 ? departmentIds : null;
    let locationWhere = { tenantId };

    if (categoryId) {
        const categoryObj = await prisma.category.findUnique({
            where: { id: categoryId },
            include: { locationCategories: true },
        });
        if (categoryObj) {
            const linkedLocIds = categoryObj.locationCategories.map((lc) => lc.locationId);
            if (linkedLocIds.length > 0) {
                locationWhere.id = { in: linkedLocIds };
                if (deptIds) locationWhere.departmentId = { in: deptIds };
            } else if (categoryObj.departmentId) {
                locationWhere.departmentId = categoryObj.departmentId;
            }
        }
    } else if (deptIds) {
        locationWhere.departmentId = { in: deptIds };
    }

    const locations = await prisma.location.findMany({
        where: locationWhere,
        select: { id: true, name: true, departmentId: true },
    });
    if (Array.isArray(requestedLocationIds) && requestedLocationIds.length > 0) {
        const allowed = new Set(requestedLocationIds);
        return locations.filter((l) => allowed.has(l.id));
    }
    return locations;
};

const agingRowsForLocations = async (tenantId, locationIds, asOfDate, categoryId) => {
    const balances = await prisma.stockBalance.findMany({
        where: {
            tenantId,
            locationId: { in: locationIds },
            qtyOnHand: { gt: 0 },
            ...(categoryId ? { item: { categoryId } } : {}),
        },
        include: {
            location: { select: { name: true } },
            item: { include: { category: { select: { name: true } } } },
        },
    });

    const rows = [];
    for (const b of balances) {
        const lastMovement = await prisma.inventoryLedger.findFirst({
            where: {
                tenantId,
                ...OFFICIAL_LEDGER_WHERE,
                itemId: b.itemId,
                locationId: b.locationId,
                createdAt: { lte: asOfDate },
            },
            orderBy: { createdAt: 'desc' },
        });

        const lastDate = lastMovement ? lastMovement.createdAt : null;
        let diffDays = 0;
        if (lastDate) {
            diffDays = Math.max(0, Math.floor((asOfDate - lastDate) / (1000 * 60 * 60 * 24)));
        } else {
            diffDays = 999;
        }

        let bucket = '0-30 Days';
        if (diffDays > 30 && diffDays <= 60) bucket = '31-60 Days';
        else if (diffDays > 60 && diffDays <= 90) bucket = '61-90 Days';
        else if (diffDays > 90) bucket = '90+ Days';

        rows.push({
            location: b.location?.name || '',
            category: b.item?.category?.name || '',
            itemCode: b.item?.barcode || '',
            itemName: b.item?.name || '',
            qtyOnHand: Number(b.qtyOnHand),
            value: Number((Number(b.qtyOnHand || 0) * Number(b.wacUnitCost || 0)).toFixed(2)),
            lastReceiveDate: lastDate ? lastDate.toISOString().split('T')[0] : 'Never',
            daysOld: diffDays,
            bucket,
        });
    }
    rows.sort((a, b) => b.daysOld - a.daysOld);
    return rows;
};

const runLegacyAnalytics = async (tenantId, cardId, ctx) => {
    const { start, end, locationIds, categoryId } = ctx;
    let rows = [];

    switch (cardId) {
        case 'negative-stock-report': {
            const balances = await prisma.stockBalance.findMany({
                where: {
                    tenantId,
                    locationId: { in: locationIds },
                    qtyOnHand: { lt: 0 },
                    ...(categoryId ? { item: { categoryId } } : {}),
                },
                include: {
                    location: { select: { name: true } },
                    item: { include: { category: { select: { name: true } } } },
                },
                orderBy: [{ location: { name: 'asc' } }],
            });
            rows = balances.map((b) => ({
                location: b.location?.name || '',
                category: b.item?.category?.name || '',
                itemCode: b.item?.barcode || '',
                itemName: b.item?.name || '',
                qtyOnHand: Number(b.qtyOnHand),
                value: Number((Number(b.qtyOnHand || 0) * Number(b.wacUnitCost || 0)).toFixed(2)),
            }));
            break;
        }
        case 'critical-stock-levels': {
            const balances = await prisma.stockBalance.findMany({
                where: {
                    tenantId,
                    locationId: { in: locationIds },
                    ...(categoryId ? { item: { categoryId } } : {}),
                },
                include: {
                    location: { select: { name: true } },
                    item: {
                        select: {
                            name: true,
                            barcode: true,
                            reorderPoint: true,
                            category: { select: { name: true } },
                        },
                    },
                },
            });
            rows = balances
                .filter((b) => {
                    const qty = Number(b.qtyOnHand);
                    const reorder = Number(b.reorderPoint ?? b.item?.reorderPoint ?? 0);
                    return reorder > 0 && qty <= reorder;
                })
                .map((b) => ({
                    location: b.location?.name || '',
                    category: b.item?.category?.name || '',
                    itemCode: b.item?.barcode || '',
                    itemName: b.item?.name || '',
                    qtyOnHand: Number(b.qtyOnHand),
                    reorderPoint: Number(b.reorderPoint ?? b.item?.reorderPoint ?? 0),
                    value: Number((Number(b.qtyOnHand || 0) * Number(b.wacUnitCost || 0)).toFixed(2)),
                }))
                .sort((a, b) => a.qtyOnHand - b.qtyOnHand);
            break;
        }
        case 'slow-moving-items': {
            const all = await agingRowsForLocations(tenantId, locationIds, end, categoryId);
            rows = all.filter((r) => r.daysOld > 90);
            break;
        }
        case 'dead-stock': {
            const all = await agingRowsForLocations(tenantId, locationIds, end, categoryId);
            rows = all.filter((r) => r.daysOld >= 180 || r.lastReceiveDate === 'Never');
            break;
        }
        case 'zero-movement-items': {
            const all = await agingRowsForLocations(tenantId, locationIds, end, categoryId);
            rows = all.filter((r) => r.lastReceiveDate === 'Never' || r.daysOld >= 365);
            break;
        }
        case 'high-consumption-items': {
            const raw = await prisma.$queryRaw`
                SELECT i."name" as "itemName",
                       i."barcode" as "itemCode",
                       c."name" as "category",
                       SUM(il."qtyOut")::float as "totalQty",
                       SUM(il."qtyOut" * il."unitCost")::float as "totalValue"
                FROM inventory_ledger il
                JOIN items i ON i."id" = il."itemId"
                LEFT JOIN categories c ON c."id" = i."categoryId"
                WHERE il."tenantId" = ${tenantId}::uuid
                  AND il."movementType" = 'ISSUE'
                  AND il."affectsValuation" = true
                  AND il."locationId" = ANY(ARRAY[${Prisma.join(locationIds)}]::uuid[])
                  AND il."createdAt" >= ${start}
                  AND il."createdAt" <= ${end}
                GROUP BY i."id", i."name", i."barcode", c."name"
                ORDER BY "totalValue" DESC NULLS LAST
                LIMIT 500
            `;
            rows = raw.map((r) => ({
                itemName: r.itemName,
                itemCode: r.itemCode || '',
                category: r.category || '',
                totalQty: Number(r.totalQty || 0),
                totalValue: Number(r.totalValue || 0),
            }));
            break;
        }
        case 'stock-movement-analysis': {
            const ledger = await prisma.inventoryLedger.findMany({
                where: {
                    tenantId,
                    ...OFFICIAL_LEDGER_WHERE,
                    locationId: { in: locationIds },
                    createdAt: { gte: start, lte: end },
                    ...(categoryId ? { item: { categoryId } } : {}),
                },
                include: {
                    item: { select: { name: true, barcode: true, category: { select: { name: true } } } },
                    location: { select: { name: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 2000,
            });
            rows = ledger.map((il) => {
                const qtyIn = Number(il.qtyIn || 0);
                const qtyOut = Number(il.qtyOut || 0);
                const unitCost = Number(il.unitCost || 0);
                const lineValue = Number(
                    il.totalValue != null ? il.totalValue : (qtyIn - qtyOut) * unitCost,
                );
                return {
                    date: il.createdAt.toISOString().split('T')[0],
                    location: il.location?.name || '',
                    category: il.item?.category?.name || '',
                    itemCode: il.item?.barcode || '',
                    itemName: il.item?.name || '',
                    movementType: il.movementType,
                    qtyIn,
                    qtyOut,
                    lineValue: Number(lineValue.toFixed(2)),
                };
            });
            break;
        }
        case 'stock-adjustment-summary': {
            const docs = await prisma.movementDocument.findMany({
                where: {
                    tenantId,
                    movementType: 'ADJUSTMENT',
                    status: 'POSTED',
                    postedAt: { gte: start, lte: end },
                    OR: [
                        { sourceLocationId: { in: locationIds } },
                        { destLocationId: { in: locationIds } },
                    ],
                    ...(categoryId
                        ? { lines: { some: { item: { categoryId } } } }
                        : {}),
                },
                include: {
                    sourceLocation: { select: { name: true } },
                    destLocation: { select: { name: true } },
                    lines: {
                        include: {
                            item: {
                                select: {
                                    categoryId: true,
                                    barcode: true,
                                    name: true,
                                    category: { select: { name: true } },
                                },
                            },
                        },
                    },
                },
                orderBy: { postedAt: 'desc' },
                take: 500,
            });
            for (const doc of docs) {
                for (const line of doc.lines) {
                    if (categoryId && line.item?.categoryId !== categoryId) continue;
                    rows.push({
                        date: (doc.postedAt || doc.createdAt).toISOString().split('T')[0],
                        documentNo: doc.documentNo,
                        location: doc.sourceLocation?.name || doc.destLocation?.name || '',
                        category: line.item?.category?.name || '',
                        itemCode: line.item?.barcode || '',
                        itemName: line.item?.name || '',
                        qty: Number(line.qty || 0),
                        value: Number(line.totalValue || 0),
                    });
                }
            }
            break;
        }
        default:
            break;
    }

    return rows;
};

const GLOBAL_LOCATION_CARDS = new Set([
    'pending-operational-actions',
    'daily-operational-review',
    'operational-attention-report',
    'get-pass-activity',
    'overdue-returns',
    'open-get-passes',
    'temporary-movement-report',
    'returned-vs-outstanding-assets',
]);

const buildFiltersApplied = (filters, locations, start, end, filterMode) => ({
    startDate: filters.startDate || start.toISOString().split('T')[0],
    endDate: filters.endDate || end.toISOString().split('T')[0],
    asOfDate: filters.asOfDate || null,
    filterMode,
    departmentIds: filters.departmentIds || [],
    categoryId: filters.categoryId || null,
    locationIds: locations.map((l) => l.id),
    locationCount: locations.length,
});

const INVENTORY_HEALTH_MODE_MAP = {
    'critical-stock':   'critical-stock-levels',
    'high-consumption': 'high-consumption-items',
    'slow-moving':      'slow-moving-items',
    'dead-stock':       'dead-stock',
};

const runAnalytics = async (tenantId, analyticsType, filters = {}) => {
    const cardId = normalizeCardId(analyticsType);

    // Inventory Health merged card — dispatch to underlying mode card (recursive, safe: modeCardId ≠ inventory-health)
    if (cardId === 'inventory-health') {
        const mode = filters.mode || 'critical-stock';
        const modeCardId = INVENTORY_HEALTH_MODE_MAP[mode] || 'critical-stock-levels';
        const { mode: _stripped, ...restFilters } = filters;
        return runAnalytics(tenantId, modeCardId, restFilters);
    }

    const filterMode = filters.filterMode || 'period';
    const { start, end } =
        filterMode === 'snapshot'
            ? getDateRange(filters.asOfDate || filters.endDate, filters.asOfDate || filters.endDate)
            : getDateRange(filters.startDate, filters.endDate);

    const departmentIds = filters.departmentIds || [];
    const categoryId = filters.categoryId || undefined;
    const requestedLocationIds = Array.isArray(filters.locationIds) ? filters.locationIds : [];
    const locations = await resolveLocationIds(tenantId, {
        departmentIds,
        categoryId,
        locationIds: requestedLocationIds,
    });
    const locationIds = locations.map((l) => l.id);

    const ctx = {
        start,
        end,
        locationIds,
        categoryId,
        departmentIds,
        section: filters.section || undefined,
        lens: filters.lens || undefined,
    };
    const filtersApplied = buildFiltersApplied(filters, locations, start, end, filterMode);
    // P2 #29 — Current Stock Balance is always live stock_balances; never a historical as-of.
    if (cardId === 'current-stock-balance' || cardId === 'inventory-by-location') {
        const timezone = await getTenantTimezone(tenantId);
        const liveAsOf = tenantDateKey(new Date(), timezone);
        filtersApplied.filterMode = 'live';
        filtersApplied.asOfDate = liveAsOf;
        filtersApplied.startDate = liveAsOf;
        filtersApplied.endDate = liveAsOf;
        filtersApplied.reportBasis = 'LIVE_STOCK_BALANCE';
        filtersApplied.asOfIsLive = true;
    }

    if (locationIds.length === 0 && !GLOBAL_LOCATION_CARDS.has(cardId)) {
        return {
            rows: [],
            totals: {},
            filtersApplied,
            meta: {
                cardId,
                analyticsType: cardId,
                locationCount: 0,
                emptyReason: 'NO_LOCATIONS',
            },
        };
    }

    let handlerResult = await runWorkspaceCardReport(tenantId, cardId, ctx);
    let normalized = normalizeHandlerOutput(handlerResult, cardId);

    if (handlerResult === null && (LEGACY_ONLY_TYPES.has(cardId) || cardId === 'critical-stock-levels')) {
        const legacyRows = await runLegacyAnalytics(tenantId, cardId, ctx);
        normalized = normalizeHandlerOutput(legacyRows, cardId);
    }

    let rows = normalized.rows || [];
    const contractId = resolveContractId(cardId);
    const contract = getReportContract(cardId);
    const columnDefs = getReportColumns(cardId);
    if (columnDefs?.length) {
        rows = projectRowsForContract(cardId, rows);
    }

    const totals =
        normalized.totals && Object.keys(normalized.totals).length
            ? normalized.totals
            : computeTotals(cardId, rows);

    const basePayload = {
        rows,
        totals,
        filtersApplied,
        columns: columnDefs,
        contract: contract ? { reportId: contract.reportId, bands: contract.bands || null } : null,
        meta: {
            cardId,
            analyticsType: cardId,
            contractId,
            locationCount: locationIds.length,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            filterMode,
            governancePlanned: isGovernanceAuditLogProxy(cardId),
            ...(normalized.meta || {}),
        },
    };

    return enrichWithGrouping(basePayload, cardId);
};

const buildExportColumns = (cardId, rows) => {
    const defs = getReportColumns(cardId);
    if (defs?.length) {
        return defs.map((c) => ({
            header: c.header,
            key: c.key,
            width: c.width || 12,
            format: c.format || 'text',
            align: c.align || 'left',
        }));
    }
    if (!rows.length) return [];
    return Object.keys(rows[0]).map((key) => ({
        header: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
        key,
        width: 14,
    }));
};

const buildTotalsFooterForExport = (columnDefs, totals) => {
    if (!columnDefs?.length) return null;
    const cols = columnDefs.map((c) => ({ header: c.header, key: c.key, width: c.width }));
    return buildTotalsFooterRow(cols, totals);
};

function flatLineExportOptions(cardId, extra = {}) {
    const profile = resolvePdfProfile(cardId);
    return {
        formatCells: false,
        ...extra,
        flatLineRowsOnly: profile?.mode === 'flat',
    };
}

const exportAnalyticsExcel = async (tenantId, analyticsType, filters = {}, user = {}) => {
    const payload = await runAnalytics(tenantId, analyticsType, filters);
    const { rows, totals, meta, filtersApplied } = payload;
    if (!rows.length) {
        throw Object.assign(new Error('No data to export'), { status: 400 });
    }

    const cardId = meta.cardId || normalizeCardId(analyticsType);
    const columnDefs = getReportColumns(cardId);
    const footerRow = buildTotalsFooterForExport(columnDefs, totals);
    const { rows: exportRows, columns } = resolveExportDataset(
        payload,
        columnDefs,
        footerRow,
        flatLineExportOptions(cardId),
    ) || { rows: footerRow ? [...rows, footerRow] : rows, columns: buildExportColumns(cardId, rows) };

    const buffer = await excelService.generateExcelBuffer(exportRows, columns, cardId, {
        generatedBy: user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : (user.email || 'System'),
        generatedAt: new Date().toISOString(),
        filters: {
            startDate: filtersApplied?.startDate,
            endDate: filtersApplied?.endDate,
            asOfDate: filtersApplied?.asOfDate,
            departmentIds: filtersApplied?.departmentIds?.join?.(', '),
            categoryId: filtersApplied?.categoryId,
            locationCount: filtersApplied?.locationCount,
        },
        totalsRow: footerRow,
    });

    return buffer;
};

const exportAnalyticsPdf = async (tenantId, analyticsType, filters = {}, user = {}, exportOptions = {}) => {
    const payload = await runAnalytics(tenantId, analyticsType, filters);
    const { rows, totals, meta, filtersApplied } = payload;
    if (!rows.length) {
        throw Object.assign(new Error('No data to export'), { status: 400 });
    }

    const cardId = meta.cardId || normalizeCardId(analyticsType);
    const columnDefs = getReportColumns(cardId);
    const footerRow = buildTotalsFooterForExport(columnDefs, totals);
    const exportSet = resolveExportDataset(payload, columnDefs, footerRow, flatLineExportOptions(cardId, {
        formatCells: false,
    })) || {
        rows: footerRow ? [...rows, footerRow] : rows,
        columns: buildExportColumns(cardId, rows),
    };

    const title = (cardId || 'Report').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const reportBasis =
        filtersApplied.asOfIsLive || filtersApplied.filterMode === 'live'
            ? `Live balance as of ${filtersApplied.asOfDate || filtersApplied.endDate}`
            : filtersApplied.filterMode === 'snapshot'
              ? `As of ${filtersApplied.asOfDate || filtersApplied.endDate}`
              : `${filtersApplied.startDate} – ${filtersApplied.endDate}`;

    const generatedAt = new Date().toISOString();
    const generatedBy = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : (user.email || 'System');

    const family = resolveFamily(cardId);
    const classification = resolvePdfClassification(user, exportOptions.classification);
    return generateReportPDF(exportSet.rows, exportSet.columns, title, {
        generatedBy,
        generatedAt,
        tenantName: user.tenantName || 'DX OSE',
        reportType: cardId,
        familyId: family?.familyId || 'generic',
        groupingEnabled: Boolean(payload.groupingEnabled),
        bilingualHeaders: false,
        classification,
        reportBasis,
        reportReference: buildReportReference(cardId, generatedAt),
        subtitle: 'DX OSE inventory & audit report',
        totalRows: rows.length,
        filters: {
            period: reportBasis,
            departments: filtersApplied.departmentIds?.join?.(', ') || 'All',
            category: filtersApplied.categoryId || 'All',
            locations: String(filtersApplied.locationCount ?? ''),
        },
        totals,
    });
};

module.exports = { runAnalytics, exportAnalyticsExcel, exportAnalyticsPdf, normalizeCardId };
