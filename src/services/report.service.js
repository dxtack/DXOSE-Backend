const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getStorage } = require('../config/storage');
const { generateReportPDF } = require('./pdf.service');
const { enrichWithGrouping } = require('./report-orchestrator.service');
const { getReportColumns } = require('./report-column-contracts');
const { resolveExportDataset } = require('../utils/report-export.util');
const excelService = require('./excel.service');
const { resolveScopeContext, clampReportFilters } = require('./scope/scopeContext');
const { buildTotalsFooterRow, computeTotals } = require('./report-analytics-totals');
const { buildReportReference } = require('../utils/report-format.util');
const { getDisplayCurrency } = require('../platform/displayCurrency.service');
const { maskExportRows } = require('../platform/export-mask.service');
const { resolveFamily } = require('./report-family-registry');
const { resolveFinalLossTreatment, getDocumentApprovalSteps } = require('../utils/resolveFinalLossTreatment');
const { filterDetailColumnDefs } = require('./pdf/report-pdf-profiles');
const {
    resolvePdfClassification,
    buildBreakageSignatureSlots,
} = require('./pdf/report-pdf-signatures.util');
const { replayOfficialLedgerBalances, parseBalanceMapKey } = require('./ledgerReplay.service');
const { generateStockBackedValuationReport, describeValuationBasis } = require('./inventoryValuation.service');

const BREAKAGE_FINANCIAL_STATUSES = ['POSTED', 'APPROVED'];
const BREAKAGE_PENDING_STATUSES = [
    'DRAFT',
    'PENDING_APPROVAL',
    'DEPT_APPROVED',
    'COST_CONTROL_APPROVED',
    'FINANCE_APPROVED',
    'COUNTING',
    'RECOUNTING',
    'REVEAL_REVIEW',
];

const OFFICIAL_LEDGER_WHERE = { affectsValuation: true };

/**
 * Resolve CURRENT snapshot version for report end date (Ch.6.17 / D12).
 */
async function resolveSnapshotVersionForReport(tenantId, endDate) {
    const end = endDate instanceof Date ? endDate : new Date(endDate);
    const year = end.getFullYear();
    const month = end.getMonth() + 1;
    const period = await prisma.periodClose.findFirst({
        where: { tenantId, year, month, status: 'CLOSED' },
        include: {
            snapshotVersions: {
                where: { status: 'CURRENT' },
                take: 1,
                select: { id: true },
            },
        },
    });
    return period?.snapshotVersions?.[0]?.id ?? null;
}

/**
 * Latest StockCountLocationQty per (itemId, locationId) by highest roundNo.
 * When filterLocationId is set, only cells for that location are considered.
 * (Aligned with inventory count reporting stabilization — slices 1–3.)
 */
const pickLatestCountedCells = (locationQtys, filterLocationId) => {
    const sorted = [...(locationQtys || [])].sort((a, b) => b.roundNo - a.roundNo);
    const map = new Map();
    for (const c of sorted) {
        if (filterLocationId && c.locationId !== filterLocationId) continue;
        const key = `${c.itemId}:${c.locationId}`;
        if (!map.has(key)) map.set(key, c);
    }
    return [...map.values()].filter((c) => c.countedQty != null);
};

const sessionHasAnyCountedCells = (locationQtys) =>
    (locationQtys || []).some((q) => q.countedQty != null);

const optimizeReportPayload = (data, { includeSupplier = false, includeLocationQtys = false } = {}) => {
    if (!data || !Array.isArray(data.rows)) return data;
    const optimizedRows = data.rows.map((row) => {
        if (!row || typeof row !== 'object') return row;
        const optimized = { ...row };
        delete optimized.imageUrl;
        if (!includeSupplier) delete optimized.supplier;
        if (!includeLocationQtys) delete optimized.locationQtys;
        return optimized;
    });
    return { ...data, rows: optimizedRows };
};

/**
 * Helper to get the starting date and ending date ISO strings.
 * Validates that dates are within a reasonable range.
 */
const getDateRange = (startDate, endDate) => {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();

    // Validate dates are not NaN and year is in a sane range
    if (isNaN(start.getTime()) || start.getFullYear() > 9999) {
        throw Object.assign(new Error('Invalid start date. Please provide a valid date.'), { status: 400 });
    }
    if (isNaN(end.getTime()) || end.getFullYear() > 9999) {
        throw Object.assign(new Error('Invalid end date. Please provide a valid date.'), { status: 400 });
    }

    // Set end to end of day
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

/**
 * Generate Report and Save to History
 */
const generateReport = async (
    tenantId,
    { reportType, departmentIds, startDate, endDate, generatedBy, categoryId, locationIds: requestedLocationIds, includeSupplier = false, includeLocationQtys = false, healthPreset },
    user = null,
) => {
    if (!['SUMMARY', 'DETAIL', 'BREAKAGE', 'LOST', 'OMC', 'TRANSFERS', 'AGING'].includes(reportType)) {
        throw new Error('Invalid report type');
    }

    const { start, end } = getDateRange(startDate, endDate);
    let data = {};
    const REPORT_TYPE_LABEL = {
        BREAKAGE: 'Breakage',
        LOST: 'Loss',
        OMC: 'OMC',
        TRANSFERS: 'Transfers',
        AGING: 'Aging',
        DETAIL: 'Detail',
        SUMMARY: 'Summary',
    };
    let reportName = `${REPORT_TYPE_LABEL[reportType] ?? reportType} Report`;

    let deptIds = Array.isArray(departmentIds) && departmentIds.length > 0 ? departmentIds : null;
    let locationIdsClamp = null;
    if (user) {
        const scope = await resolveScopeContext(user, tenantId);
        const clamped = clampReportFilters(
            { departmentIds: deptIds || [], locationIds: [] },
            scope,
        );
        deptIds = clamped.departmentIds?.length ? clamped.departmentIds : deptIds;
        locationIdsClamp = clamped.locationIds?.length ? clamped.locationIds : null;
    }

    // Fetch selected departments
    let deptNames = 'All Departments';
    if (deptIds) {
        const depts = await prisma.department.findMany({ where: { id: { in: deptIds } } });
        deptNames = depts.map(d => d.name).join(', ');
        reportName = `${REPORT_TYPE_LABEL[reportType] ?? reportType} Report — ${deptNames}`;
    }

    // Fetch category to link locations to its explicit mapping
    let categoryObj = null;
    let linkedLocIds = null;
    if (categoryId) {
        categoryObj = await prisma.category.findUnique({ 
            where: { id: categoryId },
            include: { locationCategories: true }
        });
        if (categoryObj) {
            linkedLocIds = categoryObj.locationCategories.map(lc => lc.locationId);
        }
    }

    // Determine the locations for the selected departments
    let locationWhere = { tenantId };
    
    // If category is selected, locations must be restricted
    if (categoryObj) {
        if (linkedLocIds && linkedLocIds.length > 0) {
            locationWhere.id = { in: linkedLocIds };
            // Intersect with deptIds if specific departments were chosen
            if (deptIds) locationWhere.departmentId = { in: deptIds };
        } else if (categoryObj.departmentId) {
            // Fallback to the category's department if no explicit explicit links exist
            locationWhere.departmentId = categoryObj.departmentId;
        }
    } else if (deptIds) {
        locationWhere.departmentId = { in: deptIds };
    }
    const locations = await prisma.location.findMany({ where: locationWhere });
    let locationIds = locations.map(l => l.id);
    if (Array.isArray(requestedLocationIds) && requestedLocationIds.length > 0) {
        const allowed = new Set(requestedLocationIds);
        locationIds = locationIds.filter((id) => allowed.has(id));
    }
    if (locationIdsClamp?.length) {
        locationIds = locationIds.filter((id) => locationIdsClamp.includes(id));
    }

    // Common Item Include for Item details
    const itemInclude = {
        category: { select: { name: true } },
    };

    switch (reportType) {
        case 'SUMMARY':
            data = await generateVarianceReport(
                tenantId,
                locationIds,
                start,
                end,
                true,
                categoryId,
                { includeSupplier, includeLocationQtys }
            );
            break;
        case 'DETAIL':
            data = await generateVarianceReport(
                tenantId,
                locationIds,
                start,
                end,
                false,
                categoryId,
                { includeSupplier, includeLocationQtys }
            );
            {
                const detailTotals = computeTotals('detail-report', data.rows);
                const enrichedDetail = enrichWithGrouping(
                    {
                        rows: data.rows,
                        totals: detailTotals,
                        meta: { reportType: 'DETAIL' },
                        locations: data.locations,
                    },
                    'detail-report',
                );
                data = { ...data, ...enrichedDetail, totals: detailTotals };
            }
            break;
        case 'BREAKAGE': {
            data = await generateBreakageReport(tenantId, locationIds, start, end, categoryId, {
                movementTypes: ['BREAKAGE', 'LOAN_WRITE_OFF'],
            });
            const enrichedBrk = enrichWithGrouping(
                { rows: data.rows, totals: data.totals, meta: { reportType: 'BREAKAGE' } },
                'breakage-loss-report',
            );
            data = { ...data, ...enrichedBrk };
            break;
        }
        case 'LOST': {
            data = await generateBreakageReport(tenantId, locationIds, start, end, categoryId, {
                movementTypes: ['LOST'],
            });
            const enrichedLost = enrichWithGrouping(
                { rows: data.rows, totals: data.totals, meta: { reportType: 'LOST' } },
                'breakage-loss-report',
            );
            data = { ...data, ...enrichedLost };
            break;
        }
        case 'OMC': {
            data = await generateOMCReport(tenantId, locationIds, start, end, categoryId, {
                includeSupplier,
                includeLocationQtys,
            });
            const enriched = enrichWithGrouping(
                { rows: data.rows, totals: data.totals, meta: { reportType: 'OMC' } },
                'omc-report',
            );
            data = { ...data, ...enriched };
            break;
        }
        case 'TRANSFERS': {
            data = await generateTransfersReport(tenantId, locationIds, start, end, categoryId, {
                includeSupplier,
                includeLocationQtys,
            });
            const transferRows = data.rows ?? [];
            const enriched = enrichWithGrouping(
                {
                    rows: transferRows,
                    totals: {
                        rowCount: transferRows.length,
                        totalQty: transferRows.reduce((s, r) => s + Number(r.qty || 0), 0),
                        totalValue: transferRows.reduce((s, r) => s + Number(r.value || 0), 0),
                    },
                    meta: { reportType: 'TRANSFERS' },
                },
                'transfer-history',
            );
            data = { ...data, ...enriched };
            break;
        }
        case 'AGING':
            data = await generateAgingReport(tenantId, locationIds, end, categoryId, {
                includeSupplier,
                includeLocationQtys
            });
            if (healthPreset && Array.isArray(data.rows)) {
                data.rows = filterAgingRowsByHealthPreset(data.rows, healthPreset);
            }
            break;
    }
    data = optimizeReportPayload(data, { includeSupplier, includeLocationQtys });

    const snapshotVersionId = await resolveSnapshotVersionForReport(tenantId, end);

    // Save to Database
    const generatedReport = await prisma.generatedReport.create({
        data: {
            tenantId,
            reportType,
            reportName,
            departmentId: (deptIds && deptIds.length === 1) ? deptIds[0] : null,
            startDate: start,
            endDate: end,
            // Persist only the final API shape to keep JSON size lean.
            data: { ...data, deptNames },
            generatedBy,
            snapshotVersionId,
        }
    });

    return generatedReport;
};

/**
 * 1. Summary & 2. Detail Report:
 * Opening, Closing, Physical Count, Variance
 */
const generateVarianceReport = async (
    tenantId,
    locationIds,
    start,
    end,
    isSummary,
    categoryId,
    options = {}
) => {
    const includeSupplier = Boolean(options.includeSupplier);
    const includeLocationQtys = Boolean(options.includeLocationQtys);
    // 1. Fetch Item Master & Current Closing Balances
    const stockBalances = await prisma.stockBalance.findMany({
        where: { 
            tenantId, 
            locationId: { in: locationIds },
            ...(categoryId ? { item: { categoryId } } : {})
        },
        include: { item: { include: { category: true, ...(includeSupplier ? { supplier: true } : {}) } } }
    });

    const locations = await prisma.location.findMany({
        where: { tenantId, id: { in: locationIds } },
        include: { department: true },
    });
    const locMap = Object.fromEntries(locations.map((l) => [l.id, l]));

    const emptyMove = () => ({
        inQty: 0, inVal: 0, outQty: 0, outVal: 0, brkQty: 0, brkVal: 0, adjQty: 0, obQty: 0, obVal: 0,
    });

    const applyLedgerBucket = (m, p) => {
        const qIn = Number(p._sum.qtyIn || 0);
        const qOut = Number(p._sum.qtyOut || 0);
        const val = Number(p._sum.totalValue || 0);

        if (p.movementType === 'RECEIVE' || p.movementType === 'RETURN' || p.movementType === 'TRANSFER_IN' || p.movementType === 'GET_PASS_RETURN') {
            m.inQty += qIn; m.inVal += val;
        } else if (p.movementType === 'BREAKAGE' || p.movementType === 'LOAN_WRITE_OFF' || p.movementType === 'LOST') {
            m.brkQty += qOut; m.brkVal += val;
        } else if (p.movementType === 'ISSUE' || p.movementType === 'TRANSFER_OUT' || p.movementType === 'GET_PASS_OUT') {
            m.outQty += qOut; m.outVal += val;
        } else if (p.movementType === 'OPENING_BALANCE') {
            m.obQty += qIn; m.obVal += val;
        } else if (p.movementType === 'ADJUSTMENT' || p.movementType === 'COUNT_ADJUSTMENT') {
            m.adjQty += (qIn - qOut);
        }
    };
    const itemMap = {};
    stockBalances.forEach(sb => {
        if (!itemMap[sb.itemId]) {
            itemMap[sb.itemId] = { ...sb.item, balances: {} };
        }
        itemMap[sb.itemId].balances[sb.locationId] = { qty: Number(sb.qtyOnHand || 0), value: Number(sb.totalValue || 0) };
    });

    // 2. Fetch Period Movements (In / Out / Tfr)
    const periodLedger = await prisma.inventoryLedger.groupBy({
        by: ['itemId', 'locationId', 'movementType'],
        where: { tenantId, ...OFFICIAL_LEDGER_WHERE, locationId: { in: locationIds }, createdAt: { gte: start, lte: end } },
        _sum: { qtyIn: true, qtyOut: true, totalValue: true }
    });

    // Bucket movements per item (summary) and per item+location (detail)
    const moves = {};
    const movesByLoc = {};
    for (const p of periodLedger) {
        if (!moves[p.itemId]) moves[p.itemId] = emptyMove();
        applyLedgerBucket(moves[p.itemId], p);

        const locKey = `${p.itemId}_${p.locationId}`;
        if (!movesByLoc[locKey]) movesByLoc[locKey] = emptyMove();
        applyLedgerBucket(movesByLoc[locKey], p);
    }

    // 3. Fetch Active Gate Passes
    const activePasses = await prisma.getPassLine.groupBy({
        by: ['itemId', 'locationId'],
        where: {
            getPass: { tenantId, status: { in: ['OUT', 'PARTIALLY_RETURNED'] } },
            locationId: { in: locationIds }
        },
        _sum: { qty: true, qtyReturned: true }
    });
    const gatePassMap = {};
    const gatePassMapByLoc = {};
    for (const ap of activePasses) {
        const qty = Number(ap._sum.qty || 0) - Number(ap._sum.qtyReturned || 0);
        gatePassMapByLoc[`${ap.itemId}_${ap.locationId}`] = qty;
        gatePassMap[ap.itemId] = (gatePassMap[ap.itemId] || 0) + qty;
    }

    // 4. Physical Count — POSTED sessions in range touching report locations (primary OR scoped).
    //    Canonical: sum latest counted StockCountLocationQty per (itemId, locationId) per touched location;
    //    legacy: sum StockCountLine.countedQty once per session (no double-count across scoped locations).
    const itemIdSet = new Set(Object.keys(itemMap));
    const countSessions = await prisma.stockCountSession.findMany({
        where: {
            tenantId,
            countDate: { gte: start, lte: end },
            status: 'POSTED',
            OR: [
                { locationId: { in: locationIds } },
                { scopedLocations: { some: { locationId: { in: locationIds } } } },
            ],
        },
        orderBy: { countDate: 'asc' },
        include: {
            lines: { where: { countedQty: { not: null } } },
            locationQtys: {
                select: { itemId: true, locationId: true, roundNo: true, countedQty: true },
            },
            scopedLocations: { select: { locationId: true } },
        },
    });
    const physicalCounts = {};
    const physicalCountsByLoc = {};
    for (const session of countSessions) {
        const touched = new Set();
        if (locationIds.includes(session.locationId)) touched.add(session.locationId);
        for (const sl of session.scopedLocations || []) {
            if (locationIds.includes(sl.locationId)) touched.add(sl.locationId);
        }
        if (touched.size === 0) continue;

        if (sessionHasAnyCountedCells(session.locationQtys)) {
            for (const locId of touched) {
                const cells = pickLatestCountedCells(session.locationQtys, locId);
                for (const cell of cells) {
                    if (!itemIdSet.has(cell.itemId)) continue;
                    const add = Number(cell.countedQty);
                    const locKey = `${cell.itemId}_${locId}`;
                    physicalCountsByLoc[locKey] = (physicalCountsByLoc[locKey] || 0) + add;
                    physicalCounts[cell.itemId] = (physicalCounts[cell.itemId] || 0) + add;
                }
            }
        } else {
            for (const line of session.lines) {
                if (line.countedQty == null || !itemIdSet.has(line.itemId)) continue;
                const add = Number(line.countedQty);
                physicalCounts[line.itemId] = (physicalCounts[line.itemId] || 0) + add;
                if (touched.has(session.locationId)) {
                    const locKey = `${line.itemId}_${session.locationId}`;
                    physicalCountsByLoc[locKey] = (physicalCountsByLoc[locKey] || 0) + add;
                }
            }
        }
    }

    const buildVarianceRow = (item, unitPrice, closeQty, mov, gatePassQty, physQty, extras = {}) => {
        const closeVal = closeQty * unitPrice;
        const totalPeriodIn = mov.inQty;
        const totalPeriodOut = mov.outQty + mov.brkQty;
        const trueOpenQty = closeQty - totalPeriodIn + totalPeriodOut - mov.adjQty - mov.obQty;
        const reportOpenQty = trueOpenQty + mov.obQty;
        const reportOpenVal = reportOpenQty * unitPrice;
        const theorQty = reportOpenQty + mov.inQty - mov.outQty - mov.brkQty - gatePassQty;
        const theorVal = theorQty * unitPrice;
        const varianceQty = physQty - theorQty;
        const varianceVal = varianceQty * unitPrice;

        return {
            itemId: item.id,
            category: item.category?.name || 'Uncategorized',
            itemCode: item.barcode || 'N/A',
            itemName: item.name || 'Unknown Item',
            ...(includeSupplier ? { supplier: item.supplier?.name || '' } : {}),
            unitPrice,
            openingQty: Number(reportOpenQty.toFixed(4)),
            openingValue: Number(reportOpenVal.toFixed(2)),
            inwardQty: Number(mov.inQty.toFixed(4)),
            inwardValue: Number((mov.inQty * unitPrice).toFixed(2)),
            outwardQty: Number(mov.outQty.toFixed(4)),
            outwardValue: Number((mov.outQty * unitPrice).toFixed(2)),
            breakageQty: Number(mov.brkQty.toFixed(4)),
            breakageValue: Number((mov.brkQty * unitPrice).toFixed(2)),
            gatePassQty: Number(gatePassQty.toFixed(4)),
            gatePassValue: Number((gatePassQty * unitPrice).toFixed(2)),
            theoreticalQty: Number(theorQty.toFixed(4)),
            theoreticalValue: Number(theorVal.toFixed(2)),
            physicalQty: Number(physQty.toFixed(4)),
            physicalValue: Number((physQty * unitPrice).toFixed(2)),
            varianceQty: Number(varianceQty.toFixed(4)),
            varianceValue: Number(varianceVal.toFixed(2)),
            closingQty: Number(closeQty.toFixed(4)),
            closingValue: Number(closeVal.toFixed(2)),
            ...extras,
        };
    };

    const hasMoveActivity = (mov) =>
        mov.inQty || mov.outQty || mov.brkQty || mov.adjQty || mov.obQty;

    // 5. Combine and resolve Opening -> Theoretical
    let rows = [];
    if (isSummary) {
        for (const itemId of Object.keys(itemMap)) {
            const item = itemMap[itemId];
            const unitPrice = Number(item.unitPrice || 0);

            let closeQty = 0;
            const locationQtys = {};

            for (const locId of locationIds) {
                const locBal = item.balances[locId];
                const q = locBal ? locBal.qty : 0;
                locationQtys[locId] = q;
                closeQty += q;
            }

            const mov = moves[itemId] || emptyMove();
            const gatePassQty = gatePassMap[itemId] || 0;
            const physQty = physicalCounts[itemId] !== undefined ? physicalCounts[itemId] : closeQty;

            rows.push(buildVarianceRow(item, unitPrice, closeQty, mov, gatePassQty, physQty, {
                ...(includeLocationQtys ? { locationQtys } : {}),
            }));
        }
    } else {
        for (const itemId of Object.keys(itemMap)) {
            const item = itemMap[itemId];
            const unitPrice = Number(item.unitPrice || 0);

            for (const locId of locationIds) {
                const locBal = item.balances[locId];
                const closeQty = locBal ? locBal.qty : 0;
                const locKey = `${itemId}_${locId}`;
                const mov = movesByLoc[locKey] || emptyMove();
                const gatePassQty = gatePassMapByLoc[locKey] || 0;
                const hasPhysical = physicalCountsByLoc[locKey] !== undefined;
                const physQty = hasPhysical ? physicalCountsByLoc[locKey] : closeQty;

                if (closeQty === 0 && !hasMoveActivity(mov) && !hasPhysical && gatePassQty === 0) continue;

                const loc = locMap[locId];
                const departmentName = loc?.department?.name || '';
                const locationName = loc?.name || '';

                rows.push(buildVarianceRow(item, unitPrice, closeQty, mov, gatePassQty, physQty, {
                    departmentName,
                    locationName,
                    department: departmentName,
                    location: locationName,
                    locationId: locId,
                    ...(includeLocationQtys ? { locationQtys: { [locId]: closeQty } } : {}),
                }));
            }
        }
    }

    if (isSummary) {
        // Group by Category for Summary Report
        const summary = {};
        rows.forEach(r => {
            const cat = r.category;
            if (!summary[cat]) {
                summary[cat] = {
                    category: cat, openingQty: 0, openingValue: 0, closingQty: 0, closingValue: 0,
                    physicalQty: 0, varianceQty: 0, varianceValue: 0
                };
            }
            summary[cat].openingQty += r.openingQty;
            summary[cat].openingValue += r.openingValue;
            summary[cat].closingQty += r.closingQty;
            summary[cat].closingValue += r.closingValue;
            summary[cat].physicalQty += r.physicalQty;
            summary[cat].varianceQty += r.varianceQty;
            summary[cat].varianceValue += r.varianceValue;
        });
        return {
            rows: Object.values(summary).map(s => ({
                category: s.category,
                openingQty: Number(s.openingQty.toFixed(2)),
                openingValue: Number(s.openingValue.toFixed(2)),
                closingQty: Number(s.closingQty.toFixed(2)),
                closingValue: Number(s.closingValue.toFixed(2)),
                physicalQty: Number(s.physicalQty.toFixed(2)),
                varianceQty: Number(s.varianceQty.toFixed(2)),
                varianceValue: Number(s.varianceValue.toFixed(2))
            }))
        };
    }

    // Make sure we pass the location names to the FE so they can render headers
    const locationList = locations.map(l => ({ id: l.id, name: l.name }));

    rows.sort((a, b) =>
        (a.departmentName || '').localeCompare(b.departmentName || '') ||
        (a.locationName || '').localeCompare(b.locationName || '') ||
        a.category.localeCompare(b.category) ||
        a.itemName.localeCompare(b.itemName)
    );

    return { rows, locations: locationList };
};

function resolveBreakageApprover(doc) {
    const steps = getDocumentApprovalSteps(doc);
    const approved = steps
        .filter((s) => s.status === 'APPROVED' && s.actedByUser)
        .sort((a, b) => b.stepNumber - a.stepNumber);
    if (!approved.length) return '—';
    const u = approved[0].actedByUser;
    return `${u.firstName || ''} ${u.lastName || ''}`.trim() || '—';
}

function breakageDocInPeriodWhere(start, end, locationIds) {
    return {
        OR: [
            { postedAt: { gte: start, lte: end } },
            { postedAt: null, documentDate: { gte: start, lte: end } },
            { createdAt: { gte: start, lte: end } },
        ],
        ...(locationIds.length > 0
            ? { lines: { some: { locationId: { in: locationIds } } } }
            : {}),
    };
}

/**
 * 3. Breakage Report — financial loss control (Document → Category → Items)
 */
const generateBreakageReport = async (tenantId, locationIds, start, end, categoryId, options = {}) => {
    const includeSupplier = Boolean(options.includeSupplier);
    const movementTypes = Array.isArray(options.movementTypes)
        ? options.movementTypes
        : ['BREAKAGE', 'LOAN_WRITE_OFF'];
    const storage = getStorage();
    const baseWhere = {
        tenantId,
        movementType: { in: movementTypes },
        ...breakageDocInPeriodWhere(start, end, locationIds),
    };

    const [breakages, pendingDocs, postedDocs] = await Promise.all([
        prisma.movementDocument.findMany({
            where: {
                ...baseWhere,
                status: { in: BREAKAGE_FINANCIAL_STATUSES },
            },
            include: {
                lines: {
                    include: {
                        item: {
                            include: {
                                category: true,
                                itemUnits: { include: { unit: true } },
                                ...(includeSupplier ? { supplier: true } : {}),
                            },
                        },
                        unit: true,
                    },
                },
                createdByUser: { select: { firstName: true, lastName: true } },
                approvalRequests: {
                    include: {
                        steps: {
                            include: { actedByUser: { select: { firstName: true, lastName: true } } },
                            orderBy: { stepNumber: 'asc' },
                        },
                    },
                },
            },
            orderBy: [{ postedAt: 'asc' }, { documentDate: 'asc' }],
        }),
        prisma.movementDocument.findMany({
            where: {
                ...baseWhere,
                status: { in: BREAKAGE_PENDING_STATUSES },
            },
            select: { id: true, documentNo: true },
        }),
        prisma.movementDocument.findMany({
            where: {
                ...baseWhere,
                status: { in: BREAKAGE_FINANCIAL_STATUSES },
            },
            select: { id: true, documentNo: true },
        }),
    ]);

    // Get location and department names separately
    const locationMap = {};
    const usedLocationIds = [
        ...new Set(breakages.flatMap((b) => b.lines.map((line) => line.locationId)).filter(Boolean)),
    ];

    if (usedLocationIds.length > 0) {
        const locs = await prisma.location.findMany({
            where: { id: { in: usedLocationIds } },
            include: { department: true },
        });
        locs.forEach((l) => {
            locationMap[l.id] = {
                name: l.name,
                departmentName: l.department?.name || 'N/A',
            };
        });
    }

    // WAC fallback: one batch query for all (itemId, locationId) pairs in this report.
    const wacPairs = [];
    for (const doc of breakages) {
        for (const line of doc.lines) {
            if (locationIds.length > 0 && !locationIds.includes(line.locationId)) continue;
            wacPairs.push({ itemId: line.itemId, locationId: line.locationId });
        }
    }
    const uniqueWacPairs = [...new Map(wacPairs.map(p => [`${p.itemId}_${p.locationId}`, p])).values()];
    const wacMap = {};
    if (uniqueWacPairs.length > 0) {
        const balances = await prisma.stockBalance.findMany({
            where: {
                tenantId,
                OR: uniqueWacPairs.map(p => ({ itemId: p.itemId, locationId: p.locationId })),
            },
            select: { itemId: true, locationId: true, wacUnitCost: true },
        });
        balances.forEach(b => {
            wacMap[`${b.itemId}_${b.locationId}`] = Number(b.wacUnitCost) || 0;
        });
    }

    const rows = [];
    for (const doc of breakages) {
        let photoUrl = null;
        if (doc.photoKey) {
            try {
                photoUrl = await storage.getSignedUrl(doc.photoKey);
            } catch {
                photoUrl = null;
            }
        }

        const approvedBy = resolveBreakageApprover(doc);
        const postedBy = doc.createdByUser
            ? `${doc.createdByUser.firstName || ''} ${doc.createdByUser.lastName || ''}`.trim()
            : approvedBy;

        const approvalSteps = getDocumentApprovalSteps(doc);
        const finalTreatment = resolveFinalLossTreatment({
            suggestedAction: doc.suggestedAction,
            responsibleEmployeeName: doc.responsibleEmployeeName,
            approvalSteps,
        });

        doc.lines.forEach((line) => {
            if (categoryId && line.item.categoryId !== categoryId) return;
            if (locationIds.length > 0 && !locationIds.includes(line.locationId)) return;
            const effectiveDate = doc.postedAt || doc.documentDate;
            const qty = Number(line.qtyInBaseUnit) || 0;
            const wacKey = `${line.itemId}_${line.locationId}`;
            const wacFallback = wacMap[wacKey] || 0;
            const unitCost = Number(line.unitCost) || Number(line.item?.unitPrice) || wacFallback;
            const lineValue = Number(line.totalValue) || qty * unitCost;
            const uom =
                line.unit?.name ||
                line.item?.itemUnits?.find((iu) => iu.unitType === 'BASE')?.unit?.name ||
                '—';

            rows.push({
                date: effectiveDate.toISOString().split('T')[0],
                documentNo: doc.documentNo,
                documentKey: doc.documentNo,
                movementType: doc.movementType,
                status: doc.status,
                sourceType: doc.sourceType || 'INTERNAL',
                sourceLabel: doc.sourceType === 'GET_PASS_RETURN' ? 'Get Pass Related' : 'Operational',
                department: locationMap[line.locationId]?.departmentName || 'N/A',
                location: locationMap[line.locationId]?.name || line.locationId || 'N/A',
                category: line.item.category?.name || 'Uncategorized',
                itemCode: line.item.barcode || '',
                itemName: line.item.name,
                uom,
                qty,
                unitCost: Number(unitCost.toFixed(4)),
                lineValue: Number(lineValue.toFixed(2)),
                value: Number(lineValue.toFixed(2)),
                approvedBy,
                createdBy: postedBy,
                ...(includeSupplier ? { supplier: line.item.supplier?.name || '' } : {}),
                reason: doc.reason || '',
                photoKey: doc.photoKey || null,
                photoUrl,
                suggestedAction: doc.suggestedAction || null,
                chargeTo: finalTreatment.chargeTo,
                chargeToLabel: finalTreatment.chargeToLabel,
                finalResponsibleParty: finalTreatment.responsibleParty,
                postedAt: doc.postedAt || null,
                responsibleUserId: doc.createdBy || null,
                responsibleUserName: doc.responsibleEmployeeName || null,
            });
        });
    }

    const totalQty = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
    const totalValue = rows.reduce((s, r) => s + Number(r.lineValue || 0), 0);

    const categoryLoss = {};
    for (const r of rows) {
        const cat = r.category || 'Uncategorized';
        categoryLoss[cat] = (categoryLoss[cat] || 0) + Number(r.lineValue || 0);
    }
    let highestLossCategory = '—';
    let highestLossValue = 0;
    for (const [cat, val] of Object.entries(categoryLoss)) {
        if (val > highestLossValue) {
            highestLossValue = val;
            highestLossCategory = cat;
        }
    }

    return {
        rows,
        totals: {
            totalQty: parseFloat(totalQty.toFixed(4)),
            totalValue: parseFloat(totalValue.toFixed(2)),
            rowCount: rows.length,
            postedDocumentCount: new Set(postedDocs.map((d) => d.documentNo)).size,
            pendingDocumentCount: new Set(pendingDocs.map((d) => d.documentNo)).size,
            highestLossCategory,
            highestLossValue: parseFloat(highestLossValue.toFixed(2)),
        },
    };
};

/**
 * 4. OMC (Opening – Movement – Closing) — v2
 *
 * Opening Logic (per item + location):
 *   1. Find latest PeriodSnapshot where period closedAt < startDate
 *   2. If no snapshot → sum ledger entries before startDate (from after last close if any)
 *
 * Movement Breakdown within period (per item + location):
 *   OB (Initial Load) = OPENING_BALANCE               ← Separate bucket, not merged into In
 *   In                = RECEIVE + RETURN               ← Operational receipts only
 *   TransferIn        = TRANSFER_IN
 *   Out               = ISSUE + BREAKAGE
 *   TransferOut       = TRANSFER_OUT
 *   Adjustment        = ADJUSTMENT + COUNT_ADJUSTMENT (signed)
 *
 * Closing = Opening + OB + In + TransferIn - Out - TransferOut ± Adjustment
 */
function computeOmcRiskFlags(row) {
    const flags = [];
    const available = row.openingQty + row.inQty;

    if (row.closingQty < -0.001) {
        flags.push('NEGATIVE_BALANCE');
    }
    if (row.lostQty > 0) {
        flags.push('LOST_DECLARED');
    }
    if (row.breakageQty > 0) {
        flags.push('BREAKAGE_DECLARED');
    }
    if (row.loanWriteOffQty > 0) {
        flags.push('WRITE_OFF_DECLARED');
    }
    if (row.adjQty !== 0) {
        flags.push(row.adjQty < 0 ? 'NEGATIVE_ADJUSTMENT' : 'POSITIVE_ADJUSTMENT');
    }
    if (available > 0 && row.outQty / available > 0.8) {
        flags.push('HIGH_OUTBOUND_RATIO');
    }
    if (row.inQty === 0 && row.outQty > 0) {
        flags.push('PURE_DRAWDOWN');
    }
    if (row.tfrOutQty > 0 && row.tfrInQty === 0) {
        flags.push('NET_TRANSFER_LOSS');
    }
    return flags;
}

const generateOMCReport = async (tenantId, locationIds, start, end, categoryId, options = {}) => {
    const includeSupplier = Boolean(options.includeSupplier);
    const includeLocationQtys = Boolean(options.includeLocationQtys);
    const locFilter = locationIds.length > 0 ? { in: locationIds } : undefined;

    // ── Step 1: Best PeriodSnapshot before startDate ──────────────────────────
    const bestClose = await prisma.periodClose.findFirst({
        where: { tenantId, status: 'CLOSED', closedAt: { lt: start } },
        orderBy: { closedAt: 'desc' },
    });

    const snapshotMap = {};
    if (bestClose) {
        const snapshots = await prisma.periodSnapshot.findMany({
            where: { periodCloseId: bestClose.id, ...(locFilter ? { locationId: locFilter } : {}) },
        });
        for (const s of snapshots) {
            snapshotMap[`${s.itemId}_${s.locationId}`] = {
                qty: Number(s.closingQty),
                wac: Number(s.wacUnitCost),
                value: Number(s.closingValue),
            };
        }
    }

    // ── Step 2: Ledger-fallback opening (entries after last close, before start) ──
    const fallbackWhere = {
        tenantId,
        locationId: locFilter,
        createdAt: {
            gte: bestClose?.closedAt ?? new Date(0),
            lt: start,
        },
    };
    const ledgerBefore = await prisma.inventoryLedger.groupBy({
        by: ['itemId', 'locationId'],
        where: { ...fallbackWhere, ...OFFICIAL_LEDGER_WHERE },
        _sum: { qtyIn: true, qtyOut: true, totalValue: true },
    });

    // ── Step 2b: StockBalance tertiary fallback ───────────────────────────────
    // Used when no period close AND ledger history is insufficient (e.g. OB entries
    // stored with affectsValuation=false). Reverse-engineer opening from current balance.
    const stockBalances = await prisma.stockBalance.findMany({
        where: { tenantId, ...(locFilter ? { locationId: locFilter } : {}) },
        select: { itemId: true, locationId: true, qtyOnHand: true, wacUnitCost: true },
    });
    const stockBalMap = {};
    stockBalances.forEach(sb => {
        stockBalMap[`${sb.itemId}_${sb.locationId}`] = {
            qty: Number(sb.qtyOnHand || 0),
            wac: Number(sb.wacUnitCost || 0),
        };
    });

    // ── Step 3: Period movements (raw, to separate by type) ──────────────────
    const periodEntries = await prisma.inventoryLedger.findMany({
        where: { tenantId, ...OFFICIAL_LEDGER_WHERE, locationId: locFilter, createdAt: { gte: start, lte: end } },
        select: { itemId: true, locationId: true, movementType: true, qtyIn: true, qtyOut: true, totalValue: true, unitCost: true },
    });

    // Custody get-pass outs (non-valuation) — operational narrative only, not closing qty
    const custodyGetPassOutEntries = await prisma.inventoryLedger.findMany({
        where: {
            tenantId,
            movementType: 'GET_PASS_OUT',
            affectsValuation: false,
            locationId: locFilter,
            createdAt: { gte: start, lte: end },
        },
        select: { itemId: true, locationId: true, qtyOut: true },
    });

    // ── Step 4: Build key set ─────────────────────────────────────────────────
    const keySet = new Set();
    Object.keys(snapshotMap).forEach(k => keySet.add(k));
    ledgerBefore.forEach(l => keySet.add(`${l.itemId}_${l.locationId}`));
    periodEntries.forEach(l => keySet.add(`${l.itemId}_${l.locationId}`));
    custodyGetPassOutEntries.forEach(l => keySet.add(`${l.itemId}_${l.locationId}`));

    // ── Step 5: Load item + location details ──────────────────────────────────
    const allItemIds = [...new Set([...keySet].map(k => k.split('_')[0]))];
    const allLocIds  = [...new Set([...keySet].map(k => k.split('_')[1]))];
    const [items, locs] = await Promise.all([
        prisma.item.findMany({
            where: { id: { in: allItemIds }, ...(categoryId ? { categoryId } : {}) },
            include: { category: true, ...(includeSupplier ? { supplier: true } : {}) }
        }),
        prisma.location.findMany({ where: { id: { in: allLocIds } }, include: { department: true } }),
    ]);
    const itemMap = {};
    items.forEach(i => (itemMap[i.id] = i));
    const locMap = {};
    locs.forEach(l => (locMap[l.id] = l));

    // ── Step 6: Aggregate period movements per key ────────────────────────────
    // OPENING_BALANCE goes into its own obQty/obValue bucket — NOT merged into In.
    const moveMap = {};
    for (const e of periodEntries) {
        const key = `${e.itemId}_${e.locationId}`;
        if (!moveMap[key]) moveMap[key] = {
            obQty: 0, obValue: 0,
            // Inbound breakdown
            grnQty: 0, grnValue: 0,
            returnQty: 0, returnValue: 0,
            tfrInQty: 0, tfrInValue: 0,
            getPassReturnQty: 0,
            // Outbound breakdown
            issueQty: 0, issueValue: 0,
            tfrOutQty: 0, tfrOutValue: 0,
            breakageQty: 0, breakageValue: 0,
            lostQty: 0, lostValue: 0,
            getPassOutQty: 0,
            loanWriteOffQty: 0,
            // Adjustments
            adjQty: 0, adjValue: 0,
        };
        const m = moveMap[key];
        const qIn  = Number(e.qtyIn  || 0);
        const qOut = Number(e.qtyOut || 0);
        const val  = Number(e.totalValue || 0);

        switch (e.movementType) {
            case 'OPENING_BALANCE':
                m.obQty += qIn; m.obValue += val; break;
            case 'RECEIVE':
                m.grnQty += qIn; m.grnValue += val; break;
            case 'RETURN':
                m.returnQty += qIn; m.returnValue += val; break;
            case 'GET_PASS_RETURN':
                m.getPassReturnQty += qIn; break;
            case 'TRANSFER_IN':
                m.tfrInQty += qIn; m.tfrInValue += val; break;
            case 'ISSUE':
                m.issueQty += qOut; m.issueValue += val; break;
            case 'TRANSFER_OUT':
                m.tfrOutQty += qOut; m.tfrOutValue += val; break;
            case 'BREAKAGE':
                m.breakageQty += qOut; m.breakageValue += val; break;
            case 'LOST':
                m.lostQty += qOut; m.lostValue += val; break;
            case 'GET_PASS_OUT':
                m.getPassOutQty += qOut; break;
            case 'LOAN_WRITE_OFF':
                m.loanWriteOffQty += qOut; break;
            case 'ADJUSTMENT': case 'COUNT_ADJUSTMENT':
                m.adjQty += (qIn - qOut);
                m.adjValue += (qIn > 0 ? val : -val); break;
        }
    }

    for (const e of custodyGetPassOutEntries) {
        const key = `${e.itemId}_${e.locationId}`;
        if (!moveMap[key]) {
            moveMap[key] = {
                obQty: 0, obValue: 0,
                grnQty: 0, grnValue: 0,
                returnQty: 0, returnValue: 0,
                tfrInQty: 0, tfrInValue: 0,
                getPassReturnQty: 0,
                issueQty: 0, issueValue: 0,
                tfrOutQty: 0, tfrOutValue: 0,
                breakageQty: 0, breakageValue: 0,
                lostQty: 0, lostValue: 0,
                getPassOutQty: 0,
                loanWriteOffQty: 0,
                adjQty: 0, adjValue: 0,
            };
        }
        moveMap[key].getPassOutQty += Number(e.qtyOut || 0);
    }

    // ── Step 7: Build rows ────────────────────────────────────────────────────
    const rows = [];
    for (const key of keySet) {
        const [itemId, locationId] = key.split('_');

        if (categoryId && !itemMap[itemId]) continue;

        // Opening: snapshot preferred
        let openQty = 0, openWac = 0, openValue = 0;
        if (snapshotMap[key]) {
            ({ qty: openQty, wac: openWac, value: openValue } = snapshotMap[key]);
        } else {
            const lb = ledgerBefore.find(l => l.itemId === itemId && l.locationId === locationId);
            if (lb) {
                openQty   = Number(lb._sum.qtyIn || 0) - Number(lb._sum.qtyOut || 0);
                openValue = Number(lb._sum.totalValue || 0);
                openWac   = openQty > 0 ? openValue / openQty : 0;
            }
        }

        const m = moveMap[key] || {
            obQty: 0, obValue: 0,
            grnQty: 0, grnValue: 0, returnQty: 0, returnValue: 0, tfrInQty: 0, tfrInValue: 0, getPassReturnQty: 0,
            issueQty: 0, issueValue: 0, tfrOutQty: 0, tfrOutValue: 0, breakageQty: 0, breakageValue: 0,
            lostQty: 0, lostValue: 0, getPassOutQty: 0, loanWriteOffQty: 0,
            adjQty: 0, adjValue: 0,
        };

        // Derived totals (computed from granular buckets)
        const totalInQty   = m.grnQty + m.returnQty + m.tfrInQty + m.getPassReturnQty;
        const totalInValue = m.grnValue + m.returnValue + m.tfrInValue;
        // getPassOutQty is custody/ops narrative — excluded from official closing qty (ADR-002)
        const totalOutQty  = m.issueQty + m.tfrOutQty + m.breakageQty + m.lostQty + m.loanWriteOffQty;
        const totalOutValue = m.issueValue + m.tfrOutValue + m.breakageValue + m.lostValue;

        // Tertiary opening fallback: reverse-engineer from current stockBalance.
        // Handles cases where no period close exists and OB entries lack affectsValuation.
        // Formula: Opening = CurrentBalance − OB − In + Out − Adj
        if (openQty === 0 && openValue === 0 && !snapshotMap[key] && stockBalMap[key]) {
            const sb = stockBalMap[key];
            openQty   = sb.qty - m.obQty - totalInQty + totalOutQty - m.adjQty;
            openWac   = sb.wac;
            openValue = openQty * sb.wac;
        }

        // Closing = Opening + OB + In - Out ± Adj
        const closeQty = openQty + m.obQty + totalInQty - totalOutQty + m.adjQty;

        // Closing WAC: recalculate weighted average including OB and In
        const totalInValueForWac = openValue + m.obValue + totalInValue;
        const totalInQtyForWac   = openQty + m.obQty + totalInQty;
        const closeWac = totalInQtyForWac > 0 ? totalInValueForWac / totalInQtyForWac : openWac;
        const carryingWac = snapshotMap[key]?.wac ?? stockBalMap[key]?.wac ?? closeWac;
        const closeValue = closeQty * carryingWac;

        // Skip rows with zero activity
        if (openQty === 0 && m.obQty === 0 && totalInQty === 0 && totalOutQty === 0 && m.adjQty === 0) continue;

        rows.push({
            department:   locMap[locationId]?.department?.name || '',
            location:     locMap[locationId]?.name || '',
            category:     itemMap[itemId]?.category?.name || '',
            itemCode:     itemMap[itemId]?.barcode || '',
            itemName:     itemMap[itemId]?.name || 'Unknown',
            ...(includeSupplier ? { supplier: itemMap[itemId]?.supplier?.name || '' } : {}),
            openingQty:   Number((openQty + m.obQty).toFixed(4)),
            openingValue: Number((openValue + m.obValue).toFixed(2)),
            obQty:        0,
            obValue:      0,
            // Inbound breakdown
            inQty:        Number(totalInQty.toFixed(4)),
            inValue:      Number(totalInValue.toFixed(2)),
            grnQty:       Number(m.grnQty.toFixed(4)),
            returnQty:    Number((m.returnQty + m.getPassReturnQty).toFixed(4)),
            tfrInQty:     Number(m.tfrInQty.toFixed(4)),
            getPassReturnQty: 0,
            // Outbound breakdown
            outQty:       Number(totalOutQty.toFixed(4)),
            outValue:     Number(totalOutValue.toFixed(2)),
            issueQty:     Number((m.issueQty + m.getPassOutQty).toFixed(4)),
            tfrOutQty:    Number(m.tfrOutQty.toFixed(4)),
            breakageQty:  Number(m.breakageQty.toFixed(4)),
            lostQty:      Number((m.lostQty + m.loanWriteOffQty).toFixed(4)),
            getPassOutQty: 0,
            loanWriteOffQty: 0,
            // Adjustment
            adjQty:       Number(m.adjQty.toFixed(4)),
            adjValue:     Number(m.adjValue.toFixed(2)),
            // Closing
            closingQty:   Number(closeQty.toFixed(4)),
            closingValue: Number(closeValue.toFixed(2)),
            unitCost:     Number(closeWac.toFixed(4)),
            ...(includeLocationQtys ? { locationQtys: { [locationId]: Number(closeQty.toFixed(4)) } } : {}),
            riskFlags: computeOmcRiskFlags({
                closingQty: closeQty, inQty: totalInQty, outQty: totalOutQty,
                openingQty: openQty, lostQty: m.lostQty, breakageQty: m.breakageQty,
                loanWriteOffQty: m.loanWriteOffQty, adjQty: m.adjQty,
                tfrInQty: m.tfrInQty, tfrOutQty: m.tfrOutQty,
            }),
        });
    }

    rows.sort((a, b) =>
        (a.department || '').localeCompare(b.department || '') ||
        (a.location   || '').localeCompare(b.location   || '') ||
        (a.itemName   || '').localeCompare(b.itemName   || '')
    );

    const sum = (key) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
    const totals = {
        totalOpeningQty:   Number(sum('openingQty').toFixed(4)),
        totalInQty:        Number(sum('inQty').toFixed(4)),
        totalGrnQty:       Number(sum('grnQty').toFixed(4)),
        totalReturnQty:    Number(sum('returnQty').toFixed(4)),
        totalTfrInQty:     Number(sum('tfrInQty').toFixed(4)),
        totalOutQty:       Number(sum('outQty').toFixed(4)),
        totalIssueQty:     Number(sum('issueQty').toFixed(4)),
        totalTfrOutQty:    Number(sum('tfrOutQty').toFixed(4)),
        totalBreakageQty:  Number(sum('breakageQty').toFixed(4)),
        totalLostQty:      Number(sum('lostQty').toFixed(4)),
        totalAdjQty:       Number(sum('adjQty').toFixed(4)),
        totalClosingQty:   Number(sum('closingQty').toFixed(4)),
        totalOpeningValue: Number(sum('openingValue').toFixed(2)),
        totalInValue:      Number(sum('inValue').toFixed(2)),
        totalOutValue:     Number(sum('outValue').toFixed(2)),
        totalClosingValue: Number(sum('closingValue').toFixed(2)),
        rowCount: rows.length,
    };

    return {
        rows,
        totals,
        snapshotUsed: bestClose ? { year: bestClose.year, month: bestClose.month, closedAt: bestClose.closedAt } : null,
    };
};


/**
 * 5. Transfers Report
 */
const generateTransfersReport = async (tenantId, locationIds, start, end, categoryId, options = {}) => {
    const includeSupplier = Boolean(options.includeSupplier);
    const includeLocationQtys = Boolean(options.includeLocationQtys);
    // Determine if the selected locations were source OR dest
    const transfers = await prisma.storeTransfer.findMany({
        where: {
            tenantId,
            status: { in: ['POSTED', 'RECEIVED', 'CLOSED'] },
            AND: [
                {
                    OR: [
                        { receivedAt: { gte: start, lte: end } },
                        // Legacy fallback: some historical rows were not stamped with receivedAt.
                        { receivedAt: null, transferDate: { gte: start, lte: end } },
                    ],
                },
                {
                    OR: [
                        { sourceLocationId: { in: locationIds } },
                        { destLocationId: { in: locationIds } }
                    ],
                },
            ],
        },
        include: {
            sourceLocation: true,
            destLocation: true,
            requestedByUser: true,
            lines: { include: { item: { include: { ...(includeSupplier ? { supplier: true } : {}) } } } }
        },
        orderBy: [{ receivedAt: 'asc' }, { transferDate: 'asc' }]
    });

    let rows = [];
    transfers.forEach(doc => {
        doc.lines.forEach(line => {
            if (categoryId && line.item.categoryId !== categoryId) return;
            const isOut = locationIds.includes(doc.sourceLocationId);
            const isIn = locationIds.includes(doc.destLocationId);
            const effectiveDate = doc.receivedAt || doc.transferDate;
            const receivedAtStr = doc.receivedAt
                ? doc.receivedAt.toISOString().split('T')[0]
                : '';

            let type = 'Internal';
            if (isOut && !isIn) type = 'Transfer Out';
            if (!isOut && isIn) type = 'Transfer In';

            rows.push({
                date: effectiveDate.toISOString().split('T')[0],
                transferNo: doc.transferNo,
                documentNo: doc.transferNo,
                documentKey: doc.transferNo,
                status: doc.status,
                transferDate: effectiveDate.toISOString().split('T')[0],
                receivedAt: receivedAtStr,
                type,
                fromLocation: doc.sourceLocation?.name || '',
                toLocation: doc.destLocation?.name || '',
                // Keep legacy keys for frontend/export compatibility.
                source: doc.sourceLocation?.name || '',
                destination: doc.destLocation?.name || '',
                itemCode: line.item.barcode || '',
                itemName: line.item.name,
                ...(includeSupplier ? { supplier: line.item.supplier?.name || '' } : {}),
                qty: Number(line.receivedQty || line.requestedQty),
                value: Number(line.totalValue),
                requestedBy: doc.requestedByUser?.firstName + ' ' + doc.requestedByUser?.lastName,
                postedAt: doc.receivedAt || null,
                ...(includeLocationQtys
                    ? {
                        locationQtys: {
                            [doc.sourceLocationId]: Number(-(line.receivedQty || line.requestedQty || 0)),
                            [doc.destLocationId]: Number(line.receivedQty || line.requestedQty || 0)
                        }
                    }
                    : {})
            });
        });
    });

    return { rows };
};

const filterAgingRowsByHealthPreset = (rows, preset) => {
    const p = String(preset || '').toLowerCase();
    if (p === 'slow') return rows.filter((r) => Number(r.daysOld) > 90);
    if (p === 'dead') return rows.filter((r) => Number(r.daysOld) >= 180 || r.lastReceiveDate === 'Never');
    if (p === 'zero') return rows.filter((r) => r.lastReceiveDate === 'Never' || Number(r.daysOld) >= 365);
    return rows;
};

/**
 * 6. Aging Report
 */
const generateAgingReport = async (tenantId, locationIds, endDate, categoryId, options = {}) => {
    const includeSupplier = Boolean(options.includeSupplier);
    const includeLocationQtys = Boolean(options.includeLocationQtys);
    const balances = await prisma.stockBalance.findMany({
        where: { 
            tenantId, 
            locationId: { in: locationIds }, 
            qtyOnHand: { gt: 0 },
            ...(categoryId ? { item: { categoryId } } : {})
        },
        include: { location: true, item: { include: { category: true, ...(includeSupplier ? { supplier: true } : {}) } } }
    });

    let rows = [];

    // Prefer report end date for deterministic aging snapshots.
    const asOfDate = endDate ? new Date(endDate) : new Date();
    asOfDate.setHours(23, 59, 59, 999);
    for (const b of balances) {
        // Last official ledger movement for this item/location up to the report as-of date.
        const lastMovement = await prisma.inventoryLedger.findFirst({
            where: {
                tenantId,
                ...OFFICIAL_LEDGER_WHERE,
                itemId: b.itemId,
                locationId: b.locationId,
                createdAt: { lte: asOfDate }
            },
            orderBy: { createdAt: 'desc' }
        });

        const lastDate = lastMovement ? lastMovement.createdAt : null;
        let diffDays = 0;
        if (lastDate) {
            diffDays = Math.max(0, Math.floor((asOfDate - lastDate) / (1000 * 60 * 60 * 24)));
        } else {
            // If never received but has balance, fallback to opening balance concept
            diffDays = 999;
        }

        let bucket = '0-30 Days';
        if (diffDays > 30 && diffDays <= 60) bucket = '31-60 Days';
        else if (diffDays > 60 && diffDays <= 90) bucket = '61-90 Days';
        else if (diffDays > 90) bucket = '90+ Days';

        rows.push({
            location: b.location.name,
            category: b.item.category?.name || '',
            itemName: b.item.name,
            ...(includeSupplier ? { supplier: b.item.supplier?.name || '' } : {}),
            qtyOnHand: Number(b.qtyOnHand),
            value: Number((Number(b.qtyOnHand || 0) * Number(b.item.unitPrice || 0)).toFixed(2)),
            lastReceiveDate: lastDate ? lastDate.toISOString().split('T')[0] : 'Never',
            daysOld: diffDays,
            bucket,
            ...(includeLocationQtys ? { locationQtys: { [b.locationId]: Number(b.qtyOnHand || 0) } } : {})
        });
    }

    // Sort by days old descending
    rows.sort((a, b) => b.daysOld - a.daysOld);

    return { rows };
};


/**
 * Get Report History
 */
const getHistory = async (tenantId, reportType) => {
    return await prisma.generatedReport.findMany({
        where: { tenantId, ...(reportType && { reportType }) },
        orderBy: { createdAt: 'desc' },
        include: { department: true, generatedByUser: true }
    });
};

/**
 * Get Specific Report
 */
const getReportById = async (tenantId, reportId) => {
    const report = await prisma.generatedReport.findFirst({
        where: { id: reportId, tenantId },
        include: { department: true, generatedByUser: true, tenant: true }
    });
    if (!report) throw new Error('Report not found');
    return report;
};

// ─── Export Logic ───

/** PDF fallback columns for saved reports not using report-column-contracts in resolveEngineExportRows. */
const getColumnsForReport = (reportType) => {
    switch (reportType) {
        case 'SUMMARY': return [
            { key: 'category', label: 'Category', width: 25 }, { key: 'openingQty', label: 'Opening Qty', width: 15 },
            { key: 'openingValue', label: 'Op Value', width: 15 }, { key: 'closingQty', label: 'Closing Qty', width: 15 },
            { key: 'closingValue', label: 'Cl Value', width: 15 }, { key: 'physicalQty', label: 'Phys Count', width: 15 },
            { key: 'varianceQty', label: 'Var Qty', width: 15 }, { key: 'varianceValue', label: 'Var Value', width: 15 },
        ];
        case 'AGING': return [
            { key: 'location', label: 'Location', width: 20 }, { key: 'category', label: 'Category', width: 20 },
            { key: 'itemName', label: 'Item', width: 30 }, { key: 'qtyOnHand', label: 'Qty', width: 10 },
            { key: 'value', label: 'Value', width: 12 },
            { key: 'lastReceiveDate', label: 'Last Rx', width: 15 }, { key: 'daysOld', label: 'Days Old', width: 10 },
            { key: 'bucket', label: 'Bucket', width: 15 },
        ];
        default: return [];
    }
};

/** Saved SUMMARY snapshot columns — faithful to generateVarianceReport(isSummary) shape. */
const SUMMARY_SAVED_EXPORT_COLUMNS = [
    { header: 'Category', key: 'category', width: 25, format: 'text', align: 'left' },
    { header: 'Opening Qty', key: 'openingQty', width: 15, format: 'qty', align: 'right' },
    { header: 'Opening Value', key: 'openingValue', width: 15, format: 'sar', align: 'right' },
    { header: 'Closing Qty', key: 'closingQty', width: 15, format: 'qty', align: 'right' },
    { header: 'Closing Value', key: 'closingValue', width: 15, format: 'sar', align: 'right' },
    { header: 'Physical Qty', key: 'physicalQty', width: 15, format: 'qty', align: 'right' },
    { header: 'Variance Qty', key: 'varianceQty', width: 15, format: 'qty', align: 'right' },
    { header: 'Variance Value', key: 'varianceValue', width: 15, format: 'sar', align: 'right' },
];

const SUMMARY_SNAPSHOT_NUMERIC_KEYS = [
    'openingQty', 'openingValue', 'closingQty', 'closingValue',
    'physicalQty', 'varianceQty', 'varianceValue',
];

function computeSummarySnapshotTotals(rows) {
    const totals = {};
    for (const key of SUMMARY_SNAPSHOT_NUMERIC_KEYS) {
        totals[key] = Number(rows.reduce((s, r) => s + Number(r[key] || 0), 0).toFixed(2));
    }
    return totals;
}

function buildSummarySavedExportRows(snapshotRows, totals) {
    const exportRows = (snapshotRows || []).map((r) => ({
        category: r.category ?? '',
        openingQty: r.openingQty,
        openingValue: r.openingValue,
        closingQty: r.closingQty,
        closingValue: r.closingValue,
        physicalQty: r.physicalQty,
        varianceQty: r.varianceQty,
        varianceValue: r.varianceValue,
    }));
    const footer = totals || (exportRows.length ? computeSummarySnapshotTotals(exportRows) : null);
    if (footer) {
        exportRows.push({ rowType: 'GRAND_TOTAL', category: 'TOTAL', ...footer });
    }
    return exportRows;
}

function buildSavedReportExportMetadata(report, options = {}) {
    const generatedBy = report.generatedByUser
        ? `${report.generatedByUser.firstName || ''} ${report.generatedByUser.lastName || ''}`.trim()
            || report.generatedByUser.email || 'System'
        : 'System';
    const periodStart = report.startDate
        ? new Date(report.startDate).toLocaleDateString('en-GB') : 'N/A';
    const periodEnd = report.endDate
        ? new Date(report.endDate).toLocaleDateString('en-GB') : 'N/A';
    return {
        generatedBy,
        generatedAt: report.createdAt ? new Date(report.createdAt).toISOString() : new Date().toISOString(),
        filters: {
            startDate: periodStart,
            endDate: periodEnd,
            ...(options.sourceFilter && options.sourceFilter !== 'all' && {
                sourceFilter: options.sourceFilter,
            }),
            ...(options.chargeToFilter && options.chargeToFilter !== 'all' && {
                chargeToFilter: options.chargeToFilter,
            }),
        },
    };
}

function mapContractColumns(columnDefs) {
    return (columnDefs || []).map((c) => ({
        header: c.header,
        key: c.key,
        width: c.width || 12,
        format: c.format || 'text',
        align: c.align || 'left',
    }));
}

function applyBreakageSourceFilter(reportData, sourceFilter) {
    if (!sourceFilter || sourceFilter === 'all') return reportData;
    const targetLabel = sourceFilter === 'get-pass' ? 'Get Pass Related' : 'Operational';
    const filteredRows = (reportData.rows || []).filter(
        (r) => (r.sourceLabel || 'Operational') === targetLabel,
    );
    const totalQty = filteredRows.reduce((s, r) => s + Number(r.qty || 0), 0);
    const totalValue = filteredRows.reduce((s, r) => s + Number(r.lineValue ?? r.value ?? 0), 0);
    const updatedTotals = {
        ...reportData.totals,
        totalQty,
        totalValue,
        rowCount: filteredRows.length,
    };
    const enriched = enrichWithGrouping(
        { rows: filteredRows, totals: updatedTotals },
        'breakage-loss-report',
    );
    return { ...reportData, ...enriched, rows: filteredRows, totals: updatedTotals };
}

function applyBreakageChargeToFilter(reportData, chargeToFilter) {
    if (!chargeToFilter || chargeToFilter === 'all') return reportData;
    const filteredRows = (reportData.rows || []).filter(
        (r) => r.chargeTo === chargeToFilter,
    );
    const totalQty = filteredRows.reduce((s, r) => s + Number(r.qty || 0), 0);
    const totalValue = filteredRows.reduce((s, r) => s + Number(r.lineValue ?? r.value ?? 0), 0);
    const updatedTotals = {
        ...reportData.totals,
        totalQty,
        totalValue,
        rowCount: filteredRows.length,
    };
    const enriched = enrichWithGrouping(
        { rows: filteredRows, totals: updatedTotals },
        'breakage-loss-report',
    );
    return { ...reportData, ...enriched, rows: filteredRows, totals: updatedTotals };
}

function applyBreakageReportFilters(reportData, options = {}) {
    let data = reportData;
    if (options.sourceFilter) {
        data = applyBreakageSourceFilter(data, options.sourceFilter);
    }
    if (options.chargeToFilter) {
        data = applyBreakageChargeToFilter(data, options.chargeToFilter);
    }
    return data;
}

function relabelCurrencyHeaders(columns, currency) {
    const code = String(currency || 'SAR').toUpperCase();
    return (columns || []).map((c) => ({
        ...c,
        header: String(c.header || c.label || '')
            .replace(/\(SAR\)/gi, `(${code})`)
            .replace(/\bSAR\b/g, code),
    }));
}

async function exportSummarySavedExcel(report) {
    const payload = report.data || {};
    const rows = buildSummarySavedExportRows(payload.rows, payload.totals);
    return excelService.generateExcelBuffer(
        rows,
        SUMMARY_SAVED_EXPORT_COLUMNS,
        report.reportName,
        buildSavedReportExportMetadata(report),
    );
}

async function exportAgingSavedExcel(report) {
    const columnDefs = getReportColumns('inventory-health-aging');
    const rows = report.data?.rows || [];
    return excelService.generateExcelBuffer(
        rows,
        mapContractColumns(columnDefs),
        report.reportName,
        buildSavedReportExportMetadata(report),
    );
}

async function exportEngineGroupedExcel(report, options = {}) {
    if (report.reportType === 'BREAKAGE' || report.reportType === 'LOST') {
        report.data = applyBreakageReportFilters(report.data, {
            sourceFilter: options.sourceFilter,
            chargeToFilter: options.chargeToFilter,
        });
    }

    const { rows, columns } = resolveEngineExportRows(report, {
        formatCells: false,
        ...(options.visibleGroupIds !== undefined && { visibleGroupIds: options.visibleGroupIds }),
    });
    const maskedRows = maskExportRows(rows, options.user);
    const exportColumns = relabelCurrencyHeaders(columns, options.displayCurrency);

    return excelService.generateExcelBuffer(
        maskedRows,
        exportColumns,
        report.reportName,
        {
            ...buildSavedReportExportMetadata(report, options),
            ...(report.reportType === 'OMC' && { accentProfile: 'omc-movement' }),
            ...(report.reportType === 'DETAIL' && { densityProfile: 'wide' }),
        },
    );
}

const exportExcel = async (tenantId, reportId, options = {}) => {
    const displayCurrency = await getDisplayCurrency(tenantId);
    const report = await getReportById(tenantId, reportId);
    if (
        report.reportType === 'BREAKAGE' ||
        report.reportType === 'LOST' ||
        report.reportType === 'TRANSFERS' ||
        report.reportType === 'OMC' ||
        report.reportType === 'DETAIL'
    ) {
        return exportEngineGroupedExcel(report, { ...options, displayCurrency });
    }
    if (report.reportType === 'SUMMARY') {
        return exportSummarySavedExcel(report);
    }
    if (report.reportType === 'AGING') {
        return exportAgingSavedExcel(report);
    }
    throw Object.assign(
        new Error(`Excel export not supported for report type: ${report.reportType}`),
        { status: 400 },
    );
};

function resolveEngineExportRows(report, options = {}) {
    const payload = report.data || {};
    const reportType = report.reportType;
    let columnDefs =
        (reportType === 'BREAKAGE' || reportType === 'LOST')
            ? getReportColumns('breakage-loss-report')
            : reportType === 'OMC'
              ? getReportColumns('omc-report')
              : reportType === 'DETAIL'
                ? getReportColumns('detail-report')
                : reportType === 'TRANSFERS'
                  ? getReportColumns('transfer-history')
                  : null;
    if (reportType === 'DETAIL' && options.visibleGroupIds !== undefined && columnDefs?.length) {
        columnDefs = filterDetailColumnDefs(columnDefs, options.visibleGroupIds);
    }
    const legacyColumns = getColumnsForReport(reportType).map((c) => ({
        header: c.header || c.label,
        key: c.key,
        width: c.width || 12,
        format: c.format || 'text',
        align: c.align || 'left',
    }));

    if (
        (reportType === 'BREAKAGE' || reportType === 'LOST' || reportType === 'OMC' || reportType === 'DETAIL' || reportType === 'TRANSFERS') &&
        payload.groupingEnabled &&
        payload.flatRows?.length
    ) {
        const footerRow = buildTotalsFooterRow(columnDefs, payload.totals);
        const exportSet = resolveExportDataset(payload, columnDefs, footerRow, options);
        if (exportSet) return exportSet;
    }

    const rows = payload.rows || [];
    const footerRow = columnDefs ? buildTotalsFooterRow(columnDefs, payload.totals) : null;
    return {
        rows: footerRow ? [...rows, footerRow] : rows,
        columns: columnDefs?.length
            ? columnDefs.map((c) => ({
                  header: c.header,
                  key: c.key,
                  width: c.width || 12,
                  format: c.format || 'text',
                  align: c.align || 'left',
              }))
            : legacyColumns,
    };
}

const exportPdf = async (tenantId, reportId, options = {}) => {
    const displayCurrency = await getDisplayCurrency(tenantId);
    const report = await getReportById(tenantId, reportId);
    if (report.reportType === 'BREAKAGE' || report.reportType === 'LOST') {
        report.data = applyBreakageReportFilters(report.data, {
            sourceFilter: options.sourceFilter,
            chargeToFilter: options.chargeToFilter,
        });
    }
    const visibleGroupIds =
        report.reportType === 'DETAIL' && options.visibleGroupIds !== undefined
            ? options.visibleGroupIds
            : undefined;
    const { rows, columns } = resolveEngineExportRows(report, {
        formatCells: false,
        visibleGroupIds,
    });
    const maskedRows = maskExportRows(rows, options.user);
    const exportColumns = relabelCurrencyHeaders(columns, displayCurrency);
    const generatedBy = report.generatedByUser
        ? `${report.generatedByUser.firstName || ''} ${report.generatedByUser.lastName || ''}`.trim() || report.generatedByUser.email || 'System'
        : 'System';
    const reportBasis =
        (report.reportType === 'AGING' || report.reportType === 'DETAIL') && report.startDate
            ? formatAgingReviewMonthLabel(report.startDate)
            : report.startDate && report.endDate
              ? `${new Date(report.startDate).toLocaleDateString('en-GB')} - ${new Date(report.endDate).toLocaleDateString('en-GB')}`
              : report.startDate
                  ? `As of ${new Date(report.startDate).toLocaleDateString('en-GB')}`
                  : 'Ad hoc report';

    const generatedAt = report.createdAt || new Date().toISOString();

    const cardId =
        (report.reportType === 'BREAKAGE' || report.reportType === 'LOST')
            ? 'breakage-loss-report'
            : report.reportType === 'OMC'
              ? 'omc-report'
              : report.reportType === 'DETAIL'
                ? 'detail-report'
                : report.reportType === 'TRANSFERS'
                  ? 'transfer-history'
                  : report.reportType === 'AGING'
                    ? 'inventory-health-aging'
                    : report.reportType;
    const family = resolveFamily(cardId);
    const classification = resolvePdfClassification(options.user || {}, options.classification);

    let signatureSlots = null;
    if (report.reportType === 'BREAKAGE') {
        signatureSlots = await buildBreakageSignatureSlots(
            tenantId,
            report.data?.rows || [],
            { generatedBy, generatedAt },
        );
    }

    const purposeLine =
        report.reportType === 'LOST'
            ? 'This report documents items recorded as lost, categorised by operational source, for audit accountability.'
            : report.reportType === 'BREAKAGE'
              ? 'This report documents breakage and write-off transactions with quantities and values for audit review.'
              : undefined;

    const rawRows = report.data?.rows || [];
    const pdfTotals =
        report.reportType === 'AGING'
            ? {
                  rowCount: rawRows.length,
                  totalQty: rawRows.reduce((s, r) => s + Number(r.qtyOnHand || 0), 0),
                  totalValue: rawRows.reduce((s, r) => s + Number(r.value || 0), 0),
                  criticalCount: rawRows.filter((r) => Number(r.daysOld || 0) > 90).length,
              }
            : report.reportType === 'DETAIL'
              ? (report.data?.totals || computeTotals('detail-report', rawRows))
              : report.data?.totals || null;

    return generateReportPDF(maskedRows, exportColumns, report.reportName, {
        displayCurrency,
        generatedBy,
        generatedAt,
        tenantName: report.tenant?.name || 'DX OSE',
        reportBasis,
        reportType: cardId,
        familyId: family?.familyId || 'generic',
        groupingEnabled: Boolean(report.data?.groupingEnabled),
        bilingualHeaders: false,
        classification,
        signatureSlots,
        purposeLine,
        reportReference: buildReportReference(report.reportType, generatedAt),
        reportId: report.id,
        totalRows: (report.data?.rows || []).length,
        totals: pdfTotals,
        ...(report.reportType === 'AGING'
            ? { periodMetaLabel: 'Review Month:', suppressPurposeLine: true }
            : report.reportType === 'DETAIL'
              ? { periodMetaLabel: 'Review Month:', visibleGroupIds: visibleGroupIds ?? [] }
              : {}),
        filters: {
            department: report.department?.name || report.data?.deptNames || undefined,
            period: reportBasis,
        },
    });
};

function formatAgingReviewMonthLabel(startDate) {
    const d = new Date(startDate);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/**
 * 7. Valuation Report — As-of-Date
 *
 * Answers: "What was the inventory value on a specific date?"
 *
 * Algorithm (per item + location):
 *   1. Find best PeriodSnapshot where closedAt <= asOfDate
 *   2. Start qty/WAC from snapshot
 *   3. Add ledger entries from (snapshot closedAt) to asOfDate
 *   4. Recalculate WAC incrementally for receives
 *   5. Adjust qty for issues, transfers, adjustments
 *
 * @param {string}  tenantId
 * @param {Date}    asOfDate        — the point-in-time date
 * @param {Object}  filters         — { locationIds, departmentIds, categoryId }
 */
const generateValuationReport = async (tenantId, asOfDate, filters = {}) => {
    const useLegacyReplay = process.env.INVENTORY_VALUATION_SOURCE === 'ledger_replay';

    if (!useLegacyReplay) {
        const stockBacked = await generateStockBackedValuationReport(tenantId, asOfDate, filters);
        return optimizeReportPayload(stockBacked, { includeSupplier: false, includeLocationQtys: false });
    }

    const { categoryId } = filters;

    const replay = await replayOfficialLedgerBalances(tenantId, asOfDate, filters);
    const { balanceMap, bestClose, asOf, itemMap, locMap, resolvedLocIds } = replay;

    if (resolvedLocIds.length === 0) {
        return {
            rows: [],
            asOfDate: asOf.toISOString(),
            totalValue: 0,
            truthSource: 'LEDGER_REPLAY',
        };
    }

    const rows = [];
    let grandTotal = 0;

    for (const [key, bal] of Object.entries(balanceMap)) {
        if (bal.qty <= 0 && bal.value <= 0) continue;
        const parsed = parseBalanceMapKey(key);
        if (!parsed) continue;
        const { itemId, locationId } = parsed;
        const item = itemMap[itemId];
        const loc = locMap[locationId];
        if (!item || !loc) continue;
        if (categoryId && item.categoryId !== categoryId) continue;

        const totalValue = Number((bal.qty * bal.wac).toFixed(2));
        grandTotal += totalValue;

        rows.push({
            department: loc.department?.name || '',
            location: loc.name,
            category: item.category?.name || '',
            itemCode: item.barcode || '',
            itemName: item.name,
            qtyOnHand: Number(bal.qty.toFixed(4)),
            unitCost: Number(bal.wac.toFixed(4)),
            totalValue,
        });
    }

    rows.sort((a, b) =>
        a.department.localeCompare(b.department) ||
        a.location.localeCompare(b.location) ||
        a.category.localeCompare(b.category) ||
        a.itemName.localeCompare(b.itemName)
    );

    return optimizeReportPayload({
        rows,
        asOfDate: asOf.toISOString(),
        totalValue: Number(grandTotal.toFixed(2)),
        truthSource: 'LEDGER_REPLAY',
        snapshotUsed: bestClose
            ? { id: bestClose.id, year: bestClose.year, month: bestClose.month, closedAt: bestClose.closedAt }
            : null,
    }, { includeSupplier: false, includeLocationQtys: false });
};

/**
 * Excel export for valuation — uses generateValuationReport only (same rows/filters as on-screen report).
 */
const VALUATION_EXPORT_COLUMNS = [
    { header: 'Department', key: 'department', width: 18, format: 'text', align: 'left' },
    { header: 'Location', key: 'location', width: 18, format: 'text', align: 'left' },
    { header: 'Category', key: 'category', width: 16, format: 'text', align: 'left' },
    { header: 'Item Code', key: 'itemCode', width: 14, format: 'text', align: 'left' },
    { header: 'Item Name', key: 'itemName', width: 28, format: 'text', align: 'left' },
    { header: 'Qty On Hand', key: 'qtyOnHand', width: 12, format: 'qty', align: 'right' },
    { header: 'WAC', key: 'unitCost', width: 12, format: 'sar', align: 'right' },
    { header: 'Total Value', key: 'totalValue', width: 14, format: 'sar', align: 'right' },
];

const exportValuationExcel = async (tenantId, asOfDate, filters = {}) => {
    const data = await generateValuationReport(tenantId, asOfDate, filters);
    const exportRows = [...(data.rows || [])];

    if (data.totalValue != null) {
        exportRows.push({
            rowType: 'GRAND_TOTAL',
            department: 'Grand total (value)',
            location: '',
            category: '',
            itemCode: '',
            itemName: '',
            qtyOnHand: '',
            unitCost: '',
            totalValue: data.totalValue,
        });
    }

    const asOfLabel = data.asOfDate
        ? new Date(data.asOfDate).toLocaleDateString('en-GB')
        : String(asOfDate);

    const metadata = {
        generatedBy: 'OSE Inventory',
        generatedAt: new Date().toISOString(),
        filters: {
            asOfDate: asOfLabel,
            truthSource: data.truthSource,
            valuationBasis: data.valuationBasis,
            effectiveAsOfDate: data.effectiveAsOfDate,
            requestedAsOfDate: data.requestedAsOfDate,
            valuationBasisLabel: describeValuationBasis(data),
            ...(data.warning && { warning: data.warning }),
            ...(data.snapshotUsed && {
                snapshotBasis: `Snapshot: ${data.snapshotUsed.year}${data.snapshotUsed.month != null ? '/' + data.snapshotUsed.month : ''} (closed ${data.snapshotUsed.closedAt ? new Date(data.snapshotUsed.closedAt).toLocaleString('en-GB') : ''})`,
            }),
            ...(filters.departmentIds?.length && { departmentIds: filters.departmentIds.join(', ') }),
            ...(filters.categoryId && { categoryId: filters.categoryId }),
            ...(filters.locationIds?.length && { locationCount: String(filters.locationIds.length) }),
        },
    };

    return excelService.generateExcelBuffer(
        exportRows,
        VALUATION_EXPORT_COLUMNS,
        'Inventory Carrying Value Review',
        metadata,
    );
};

module.exports = {
    generateReport,
    generateVarianceReport,
    generateValuationReport,
    exportValuationExcel,
    getHistory,
    getReportById,
    exportExcel,
    exportPdf,
    generateOMCReport,
};
