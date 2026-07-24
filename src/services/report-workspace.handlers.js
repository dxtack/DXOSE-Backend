'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const reportsLegacy = require('./reports.service');
const { generateOMCReport } = require('./report.service');
const settingService = require('./setting.service');
const { computeTotals, COUNT_VARIANCE_CARDS } = require('./report-analytics-totals');
const { getPassOperationalRows } = require('./get-pass-report.service');
const { tenantDateKey } = require('../utils/tenant-calendar.util');
const { getTenantTimezone } = require('./tenantTimezone.service');

const OFFICIAL_LEDGER_WHERE = { affectsValuation: true };

const COUNT_STATUS_BY_CARD = {
    'pending-approval-sessions': 'PENDING_APPROVAL',
    'rejected-count-sessions': 'REJECTED',
    'count-posting-summary': 'POSTED',
    'count-exceptions': 'REJECTED',
    'count-accuracy-pct': 'POSTED',
    'missing-approval-detection': 'PENDING_APPROVAL',
    'rejected-transactions': 'REJECTED',
    'evidence-completeness-report': 'POSTED',
    'pending-review-queue': 'PENDING_APPROVAL',
    'reviewer-action-queue': 'REVEAL_REVIEW',
    'high-risk-sessions': 'REVEAL_REVIEW',
    'critical-variance-review': 'REVEAL_REVIEW',
    'escalated-operational-issues': 'REVEAL_REVIEW',
    'reviewer-sla-tracking': 'PENDING_APPROVAL',
};

const TRANSFER_OPEN_STATUSES = ['PENDING_DEPT', 'PENDING_FINANCE'];
const TRANSFER_COMPLETED_STATUSES = ['POSTED', 'RECEIVED', 'CLOSED'];

const VARIANCE_GROUP_CARDS = {
    'variance-by-location': 'locationName',
    'variance-by-department': 'department',
    'variance-by-category': 'category',
    'variance-by-counter': 'postedBy',
};

function packResult(rows, extras = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const cardId = extras.cardId;
    const totals = extras.totals ?? (cardId ? computeTotals(cardId, list, extras) : null);
    return {
        rows: list,
        totals: totals && Object.keys(totals).length ? totals : null,
        meta: extras.meta || {},
    };
}

function normalizeHandlerOutput(result, cardId) {
    if (result == null) return packResult([], { cardId, meta: { emptyReason: 'NOT_IMPLEMENTED' } });
    if (Array.isArray(result)) return packResult(result, { cardId });
    return {
        rows: result.rows || [],
        totals: result.totals ?? computeTotals(cardId, result.rows || [], result),
        meta: result.meta || {},
    };
}

/**
 * Map stock balance row for reporting — department from balance location (current ownership).
 * @param {object} b - Prisma stockBalance with location + item includes
 */
function mapStockBalanceExportRow(b) {
    return {
        department: b.location?.department?.name || b.item?.department?.name || '',
        location: b.location?.name || '',
        category: b.item?.category?.name || '',
        itemCode: b.item?.barcode || '',
        itemName: b.item?.name || '',
        uom: b.item?.itemUnits?.[0]?.unit?.abbreviation || b.item?.itemUnits?.[0]?.unit?.name || '—',
        qtyOnHand: Number(b.qtyOnHand),
        reorderPoint: Number(b.reorderPoint ?? b.item?.reorderPoint ?? 0),
        unitCost: Number(b.wacUnitCost || 0),
        value: Number((Number(b.qtyOnHand || 0) * Number(b.wacUnitCost || 0)).toFixed(2)),
    };
}

async function stockBalanceRows(tenantId, locationIds, categoryId, { includeZero = false, cardId } = {}) {
    const obStatus = await settingService.getObStatus(tenantId);
    if (obStatus !== 'FINALIZED') {
        return packResult([], {
            cardId,
            meta: { emptyReason: 'OB_NOT_FINALIZED', obStatus },
        });
    }
    const balances = await prisma.stockBalance.findMany({
        where: {
            tenantId,
            locationId: { in: locationIds },
            ...(!includeZero ? { qtyOnHand: { not: 0 } } : {}),
            ...(categoryId ? { item: { categoryId } } : {}),
        },
        include: {
            location: {
                select: {
                    name: true,
                    department: { select: { name: true } },
                },
            },
            item: {
                select: {
                    name: true,
                    barcode: true,
                    reorderPoint: true,
                    category: { select: { name: true } },
                    department: { select: { name: true } },
                    itemUnits: {
                        where: { unitType: 'BASE' },
                        take: 1,
                        select: { unit: { select: { abbreviation: true, name: true } } },
                    },
                },
            },
        },
        orderBy: [{ location: { name: 'asc' } }, { item: { name: 'asc' } }],
    });
    const rows = balances.map(mapStockBalanceExportRow);
    const timezone = await getTenantTimezone(tenantId);
    const effectiveAsOf = tenantDateKey(new Date(), timezone);
    return packResult(rows, {
        cardId,
        meta: {
            obStatus,
            reportBasis: 'LIVE_STOCK_BALANCE',
            effectiveAsOf,
            asOfIsLive: true,
        },
    });
}

async function countSessionRows(tenantId, { start, end, locationIds, status }) {
    const sessions = await prisma.stockCountSession.findMany({
        where: {
            tenantId,
            countDate: { gte: start, lte: end },
            ...(status ? { status } : {}),
            ...(locationIds?.length
                ? {
                      OR: [
                          { locationId: { in: locationIds } },
                          { scopedLocations: { some: { locationId: { in: locationIds } } } },
                      ],
                  }
                : {}),
        },
        include: {
            location: { select: { name: true } },
            department: { select: { name: true } },
            createdByUser: { select: { firstName: true, lastName: true } },
        },
        orderBy: { countDate: 'desc' },
        take: 1000,
    });
    return sessions.map((s) => ({
        sessionNo: s.sessionNo,
        countDate: s.countDate.toISOString().split('T')[0],
        status: s.status,
        location: s.location?.name || '',
        department: s.department?.name || '',
        blindMode: s.blindMode ? 'Yes' : 'No',
        createdBy: s.createdByUser
            ? `${s.createdByUser.firstName} ${s.createdByUser.lastName}`.trim()
            : '',
        postedAt: s.postedAt ? s.postedAt.toISOString().split('T')[0] : '',
    }));
}

async function countApprovalHistoryRows(tenantId, { start, end, locationIds }) {
    const sessions = await prisma.stockCountSession.findMany({
        where: {
            tenantId,
            approvalRequestId: { not: null },
            updatedAt: { gte: start, lte: end },
            ...(locationIds?.length
                ? {
                      OR: [
                          { locationId: { in: locationIds } },
                          { scopedLocations: { some: { locationId: { in: locationIds } } } },
                      ],
                  }
                : {}),
        },
        include: {
            location: { select: { name: true } },
            department: { select: { name: true } },
            approvalRequest: { select: { status: true, resolvedAt: true, createdAt: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 1000,
    });
    return sessions.map((s) => ({
        sessionNo: s.sessionNo,
        countDate: s.countDate.toISOString().split('T')[0],
        status: s.status,
        approvalStatus: s.approvalRequest?.status || '',
        approvalResolvedAt: s.approvalRequest?.resolvedAt
            ? s.approvalRequest.resolvedAt.toISOString().split('T')[0]
            : '',
        location: s.location?.name || '',
        department: s.department?.name || '',
    }));
}

const { getGovernanceAuditRows } = require('./report-governance.service');

async function auditLogRows(tenantId, { start, end, cardId }) {
    return getGovernanceAuditRows(tenantId, { start, end, cardId: cardId || 'audit-activity-report' });
}

async function ledgerRows(tenantId, { start, end, locationIds, movementType }) {
    const timezone = await getTenantTimezone(tenantId);
    const rows = await prisma.inventoryLedger.findMany({
        where: {
            tenantId,
            ...OFFICIAL_LEDGER_WHERE,
            createdAt: { gte: start, lte: end },
            ...(locationIds?.length ? { locationId: { in: locationIds } } : {}),
            ...(movementType ? { movementType } : {}),
        },
        include: {
            item: { select: { name: true, barcode: true } },
            location: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
    });
    return rows.map((il) => {
        const qtyIn = Number(il.qtyIn || 0);
        const qtyOut = Number(il.qtyOut || 0);
        const unitCost = Number(il.unitCost || 0);
        const lineValue = Number(
            il.totalValue != null
                ? il.totalValue
                : (qtyIn - qtyOut) * unitCost,
        );
        const docNo = il.referenceNo || (il.referenceId ? String(il.referenceId).slice(0, 8) : '—');
        const documentKey = `${il.movementType || 'MOV'}-${docNo}`;
        return {
            date: tenantDateKey(il.postingDate || il.createdAt, timezone),
            docNo,
            documentKey,
            referenceType: il.referenceType || '',
            referenceId: il.referenceId || '',
            location: il.location?.name || '',
            itemCode: il.item?.barcode || '',
            itemName: il.item?.name || '',
            movementType: il.movementType,
            qtyIn,
            qtyOut,
            unitCost,
            lineValue: Number(lineValue.toFixed(2)),
        };
    });
}

async function transferRows(tenantId, { start, end, openOnly }) {
    const transfers = await prisma.storeTransfer.findMany({
        where: {
            tenantId,
            ...(openOnly
                ? { status: { in: TRANSFER_OPEN_STATUSES } }
                : {
                      // EX-010: completed transfers in range by receive/post stamp, not transferDate.
                      OR: [
                          { receivedAt: { gte: start, lte: end } },
                          { receivedAt: null, postedAt: { gte: start, lte: end } },
                      ],
                  }),
        },
        include: {
            sourceLocation: { select: { name: true } },
            destLocation: { select: { name: true } },
        },
        orderBy: openOnly
            ? { transferDate: 'desc' }
            : [{ receivedAt: 'desc' }, { postedAt: 'desc' }],
        take: 500,
    });
    return transfers.map((t) => ({
        transferNo: t.transferNo,
        status: t.status,
        transferDate: (t.receivedAt || t.postedAt || t.transferDate)
            ? (t.receivedAt || t.postedAt || t.transferDate).toISOString().split('T')[0]
            : '',
        fromLocation: t.sourceLocation?.name || '',
        toLocation: t.destLocation?.name || '',
        receivedAt: t.receivedAt ? t.receivedAt.toISOString().split('T')[0] : '',
    }));
}

function mapGetPassReportRow(p, now = new Date()) {
    const { mapGetPassOperationalRow } = require('./get-pass-report.service');
    return mapGetPassOperationalRow(p, now);
}

async function getPassRows(tenantId, opts) {
    return getPassOperationalRows(tenantId, opts);
}

async function lostItemsRows(_tenantId, _opts) {
    // Formerly queried lost_found_items (guest register). Feature retired Phase 3 —
    // card `lost-items-register` returns empty until a LOST-movement report is defined.
    return [];
}

async function periodCloseRows(tenantId, { start, end }) {
    const closes = await prisma.periodClose.findMany({
        where: { tenantId, closedAt: { gte: start, lte: end } },
        orderBy: { closedAt: 'desc' },
        take: 200,
    });
    return closes.map((c) => ({
        year: c.year,
        month: c.month,
        status: c.status,
        closedAt: c.closedAt ? c.closedAt.toISOString().split('T')[0] : '',
        notes: c.notes || '',
    }));
}

async function pendingOperationsRows(tenantId) {
    const [transfers, grns, loss, overdue] = await Promise.all([
        prisma.storeTransfer.count({
            where: { tenantId, status: { in: TRANSFER_OPEN_STATUSES } },
        }),
        prisma.grnImport.count({
            where: { tenantId, status: { in: ['DRAFT', 'VALIDATED', 'PENDING_APPROVAL'] } },
        }),
        prisma.movementDocument.count({
            where: { tenantId, movementType: 'BREAKAGE', status: 'DRAFT' },
        }),
        prisma.getPass.count({
            where: {
                tenantId,
                status: { in: ['OUT', 'PARTIALLY_RETURNED'] },
                expectedReturnDate: { lt: new Date() },
            },
        }),
    ]);
    return [
        { area: 'Transfers', pendingCount: transfers },
        { area: 'GRN', pendingCount: grns },
        { area: 'Breakage (draft)', pendingCount: loss },
        { area: 'Overdue get-passes', pendingCount: overdue },
    ];
}

async function runCountVarianceReport(tenantId, cardId, ctx) {
    const { start, end, locationIds } = ctx;
    const locationId = locationIds?.length === 1 ? locationIds[0] : undefined;
    const result = await reportsLegacy.getCountVariances(tenantId, {
        dateFrom: start.toISOString(),
        dateTo: end.toISOString(),
        locationId,
    });

    let rows = result.data || [];
    if (locationIds?.length > 1) {
        const locs = await prisma.location.findMany({
            where: { id: { in: locationIds } },
            select: { name: true },
        });
        const names = new Set(locs.map((l) => l.name));
        rows = rows.filter((r) => names.has(r.locationName));
    }

    if (cardId === 'top-variance-items') {
        rows = [...rows].sort((a, b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue)).slice(0, 100);
    } else if (VARIANCE_GROUP_CARDS[cardId]) {
        const groupKey = VARIANCE_GROUP_CARDS[cardId];
        const grouped = new Map();
        for (const r of rows) {
            const key = String(r[groupKey] ?? 'Unknown');
            if (!grouped.has(key)) {
                grouped.set(key, {
                    [groupKey]: key,
                    bookQty: 0,
                    countedQty: 0,
                    varianceQty: 0,
                    varianceValue: 0,
                    lineCount: 0,
                });
            }
            const g = grouped.get(key);
            g.bookQty += Number(r.bookQty || 0);
            g.countedQty += Number(r.countedQty || 0);
            g.varianceQty += Number(r.varianceQty || 0);
            g.varianceValue += Number(r.varianceValue || 0);
            g.lineCount += 1;
        }
        rows = Array.from(grouped.values()).map((g) => ({
            ...g,
            bookQty: Number(g.bookQty.toFixed(4)),
            countedQty: Number(g.countedQty.toFixed(4)),
            varianceQty: Number(g.varianceQty.toFixed(4)),
            varianceValue: Number(g.varianceValue.toFixed(2)),
        }));
    }

    const totals = computeTotals(cardId, rows, { totals: result.totals });
    if (rows.length && COUNT_VARIANCE_CARDS.has(cardId) && !VARIANCE_GROUP_CARDS[cardId] && cardId !== 'top-variance-items') {
        Object.assign(totals, computeTotals('count-variance-report', rows));
    }

    return packResult(rows, { cardId, totals, meta: { filters: result.filters } });
}

/**
 * Run a workspace card report by card id (slug).
 * Returns { rows, totals, meta }.
 */
async function runWorkspaceCardReport(tenantId, cardId, ctx) {
    const { start, end, locationIds, categoryId, sourceType } = ctx;

    let raw;

    switch (cardId) {
        case 'current-stock-balance':
            raw = await stockBalanceRows(tenantId, locationIds, categoryId, { includeZero: true, cardId });
            return raw;

        case 'inventory-by-location':
            raw = await stockBalanceRows(tenantId, locationIds, categoryId, { includeZero: false, cardId });
            return raw;

        case 'count-variance-report':
        case 'variance-by-location':
        case 'variance-by-department':
        case 'variance-by-category':
        case 'variance-by-counter':
        case 'variance-value-impact':
        case 'top-variance-items':
            return runCountVarianceReport(tenantId, cardId, ctx);

        case 'count-sessions-history':
            raw = await countSessionRows(tenantId, { start, end, locationIds });
            return packResult(raw, { cardId });

        case 'count-approval-history':
            raw = await countApprovalHistoryRows(tenantId, { start, end, locationIds });
            return packResult(raw, { cardId });

        case 'open-count-sessions':
            raw = await countSessionRows(tenantId, {
                start,
                end,
                locationIds,
                status: 'DRAFT',
            });
            return packResult(raw, { cardId });

        case 'blind-count-review':
        case 'multi-location-count-review':
        case 'recount-analysis':
        case 'cycle-count-performance':
        case 'count-timeline-report':
        case 'unexpected-found-items':
        case 'missing-items-report':
        case 'reviewer-workload':
        case 'operational-follow-up-tracker':
            raw = await countSessionRows(tenantId, { start, end, locationIds });
            return packResult(raw, { cardId });

        case 'audit-activity-report':
        case 'user-operational-activity':
        case 'approval-activity-report':
        case 'workflow-violations':
        case 'unauthorized-actions-review':
        case 'manual-override-tracking':
        case 'operational-exceptions-report':
        case 'audit-reconstruction-report':
        case 'operational-accountability-report':
        case 'reviewer-activity-report-gov':
        case 'governance-exceptions':
        case 'workflow-exceptions':
        case 'workflow-bottlenecks':
            raw = await auditLogRows(tenantId, { start, end, cardId });
            return packResult(raw, { cardId });

        case 'posting-activity-report':
        case 'adjustment-history':
        case 'inventory-change-history':
        case 'workflow-completion-analysis':
        case 'workflow-timeline-report':
            raw = await ledgerRows(tenantId, { start, end, locationIds });
            return packResult(raw, { cardId });

        case 'stock-adjustment-summary':
            raw = await ledgerRows(tenantId, {
                start,
                end,
                locationIds,
                movementType: 'ADJUSTMENT',
            });
            return packResult(raw, { cardId });

        case 'open-transfers':
        case 'transfer-delays':
        case 'open-workflow-attention':
            raw = await transferRows(tenantId, { start, end, openOnly: true });
            return packResult(raw, { cardId });

        case 'transfer-aging':
            raw = await transferRows(tenantId, { start, end, openOnly: false });
            return packResult(raw, { cardId });

        case 'overdue-returns':
        case 'get-pass-activity':
        case 'open-get-passes':
        case 'temporary-movement-report':
        case 'returned-vs-outstanding-assets':
            raw = await getPassOperationalRows(tenantId, {
                start,
                end,
                section: ctx.section,
                lens: ctx.lens,
                cardId,
            });
            return packResult(raw, { cardId });

        case 'lost-items-register':
            raw = await lostItemsRows(tenantId, { start, end });
            return packResult(raw, { cardId });

        case 'breakage-workflow':
            raw = await ledgerRows(tenantId, { start, end, locationIds, movementType: 'BREAKAGE' });
            return packResult(raw, { cardId });

        case 'period-close-validation':
        case 'posting-integrity-check':
            raw = await periodCloseRows(tenantId, { start, end });
            return packResult(raw, { cardId });

        case 'omc-report': {
            const locationId = locationIds?.[0];
            if (!locationId) {
                return packResult([], { cardId, meta: { emptyReason: 'LOCATION_REQUIRED' } });
            }
            const omcResult = await generateOMCReport(tenantId, [locationId], start, end, categoryId || undefined);
            const omcRows = (omcResult.rows || []).map((r) => ({
                department:      r.department || '',
                location:        r.location || '',
                category:        r.category || '',
                itemCode:        r.itemCode || '',
                itemName:        r.itemName || '',
                openingQty:      r.openingQty ?? 0,
                openingValue:    r.openingValue ?? 0,
                obQty:           r.obQty ?? 0,
                // Inbound
                inQty:           r.inQty ?? 0,
                inValue:         r.inValue ?? 0,
                grnQty:          r.grnQty ?? 0,
                returnQty:       r.returnQty ?? 0,
                tfrInQty:        r.tfrInQty ?? 0,
                getPassReturnQty: r.getPassReturnQty ?? 0,
                // Outbound
                outQty:          r.outQty ?? 0,
                outValue:        r.outValue ?? 0,
                issueQty:        r.issueQty ?? 0,
                tfrOutQty:       r.tfrOutQty ?? 0,
                breakageQty:     r.breakageQty ?? 0,
                lostQty:         r.lostQty ?? 0,
                getPassOutQty:   r.getPassOutQty ?? 0,
                loanWriteOffQty: r.loanWriteOffQty ?? 0,
                // Adjustment & closing
                adjQty:          r.adjQty ?? 0,
                adjValue:        r.adjValue ?? 0,
                closingQty:      r.closingQty ?? 0,
                closingValue:    r.closingValue ?? 0,
                unitCost:        r.unitCost ?? 0,
                riskFlags:       r.riskFlags ?? [],
            }));
            return packResult(omcRows, { cardId });
        }

        case 'breakage-loss-report':
        case 'breakage-trend-analysis': {
            const brkLocationId = locationIds?.length === 1 ? locationIds[0] : undefined;
            const brkResult = await reportsLegacy.getBreakageReport(tenantId, {
                dateFrom: start.toISOString(),
                dateTo: end.toISOString(),
                locationId: brkLocationId,
            });
            const brkRows = (brkResult.data || []).map((r) => ({
                date: r.postingDate ? new Date(r.postingDate).toISOString().split('T')[0] : '',
                documentNo: r.referenceNo || '',
                documentKey: r.referenceNo || '—',
                sourceLabel: r.sourceLabel || 'Operational',
                itemCode: r.itemCode || '',
                itemName: r.itemName || '',
                uom: r.uom || '',
                qty: r.qty ?? 0,
                unitCost: r.unitCost ?? 0,
                lineValue: r.totalCost ?? 0,
                status: 'POSTED',
                postedBy: r.postedBy || '',
            }));
            const brkTotals = brkResult.totals ? {
                totalQty: brkResult.totals.totalQty,
                totalValue: brkResult.totals.totalAmount,
                rowCount: brkRows.length,
            } : null;
            return packResult(brkRows, { cardId, totals: brkTotals });
        }

        case 'loss-analysis': {
            const lostLocationId = locationIds?.length === 1 ? locationIds[0] : undefined;
            const lostResult = await reportsLegacy.getLostReport(tenantId, {
                dateFrom: start.toISOString(),
                dateTo: end.toISOString(),
                locationId: lostLocationId,
            });
            const lostRows = (lostResult.data || []).map((r) => ({
                date: r.postingDate ? new Date(r.postingDate).toISOString().split('T')[0] : '',
                documentNo: r.referenceNo || '',
                documentKey: r.referenceNo || '—',
                sourceLabel: r.sourceLabel || 'Operational',
                itemCode: r.itemCode || '',
                itemName: r.itemName || '',
                uom: r.uom || '',
                qty: r.qty ?? 0,
                unitCost: r.unitCost ?? 0,
                lineValue: r.totalCost ?? 0,
                status: 'POSTED',
                postedBy: r.postedBy || '',
            }));
            const lostTotals = lostResult.totals ? {
                totalQty: lostResult.totals.totalQty,
                totalValue: lostResult.totals.totalAmount,
                rowCount: lostRows.length,
            } : null;
            return packResult(lostRows, { cardId, totals: lostTotals });
        }

        case 'transfer-history':
        case 'inter-location-movement': {
            const trxResult = await reportsLegacy.getTransferHistoryReport(tenantId, {
                dateFrom: start.toISOString(),
                dateTo: end.toISOString(),
                sourceLocationId: locationIds?.length === 1 ? locationIds[0] : undefined,
            });
            const trxRows = (trxResult.data || []).map((r) => ({
                transferNo: r.transferNo || '',
                transferDate: r.transferDate ? new Date(r.transferDate).toISOString().split('T')[0] : '',
                type: r.status || '',
                fromLocation: r.sourceLocation || '',
                toLocation: r.destLocation || '',
                itemCode: '',
                itemName: r.itemName || '',
                qty: r.requestedQty ?? 0,
                value: r.totalValue ?? 0,
                receivedAt: r.postedAt ? new Date(r.postedAt).toISOString().split('T')[0] : '',
                status: r.status || '',
                requestedBy: r.requestedBy || '',
            }));
            const trxTotals = {
                totalQty: trxResult.totalQty ?? 0,
                totalValue: trxResult.totalValue ?? 0,
                rowCount: trxResult.total ?? trxRows.length,
            };
            return packResult(trxRows, { cardId, totals: trxTotals });
        }

        case 'pending-operational-actions':
        case 'daily-operational-review':
        case 'operational-attention-report':
            raw = await pendingOperationsRows(tenantId);
            return packResult(raw, { cardId });

        case 'operational-delays':
            raw = await transferRows(tenantId, { start, end, openOnly: true });
            return packResult(raw, { cardId });

        default: {
            const status = COUNT_STATUS_BY_CARD[cardId];
            if (status) {
                raw = await countSessionRows(tenantId, { start, end, locationIds, status });
                return packResult(raw, { cardId });
            }
            return null;
        }
    }
}

module.exports = {
    runWorkspaceCardReport,
    stockBalanceRows,
    mapStockBalanceExportRow,
    normalizeHandlerOutput,
    packResult,
};
