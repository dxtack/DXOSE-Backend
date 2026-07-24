/**
 * Legacy stock-count evidence pack (JSON / PDF / Excel).
 * Cell-first when StockCountLocationQty has counted values; else StockCountLine (legacy).
 * Aligned with inventory count reporting stabilization (slices 1–3).
 */
const prisma = require('../config/database');

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

async function fetchLocationQtys(sessionId) {
    return prisma.stockCountLocationQty.findMany({
        where: { sessionId },
        include: {
            item: { include: { category: true } },
            location: true,
        },
    });
}

/**
 * Build display rows: merge latest cells per (item, location) with line snapshot for WAC/item meta.
 * If no counted cells anywhere, one row per StockCountLine (legacy).
 */
function buildEvidenceRows(session, locationQtys) {
    const lines = session.lines || [];
    if (!sessionHasAnyCountedCells(locationQtys)) {
        return lines.map((l) => ({
            itemId: l.itemId,
            itemLabel: l.item?.name || '—',
            barcode: l.item?.barcode || '',
            category: l.item?.category?.name || '',
            bookQty: Number(l.bookQty || 0),
            countedQty: l.countedQty != null ? Number(l.countedQty) : null,
            varianceQty: Number(l.varianceQty || 0),
            wacUnitCost: Number(l.wacUnitCost || 0),
            varianceValue: Number(l.varianceValue || 0),
        }));
    }

    const latestCells = pickLatestCountedCells(locationQtys, null);
    const cellsByItemId = new Map();
    for (const c of latestCells) {
        if (!cellsByItemId.has(c.itemId)) cellsByItemId.set(c.itemId, []);
        cellsByItemId.get(c.itemId).push(c);
    }

    const rows = [];
    const usedCellKeys = new Set();

    for (const line of lines) {
        const cells = cellsByItemId.get(line.itemId) || [];
        if (cells.length === 0) {
            rows.push({
                itemId: line.itemId,
                itemLabel: line.item?.name || '—',
                barcode: line.item?.barcode || '',
                category: line.item?.category?.name || '',
                bookQty: Number(line.bookQty || 0),
                countedQty: line.countedQty != null ? Number(line.countedQty) : null,
                varianceQty: Number(line.varianceQty || 0),
                wacUnitCost: Number(line.wacUnitCost || 0),
                varianceValue: Number(line.varianceValue || 0),
            });
            continue;
        }
        const wac = Number(line.wacUnitCost || 0);
        for (const cell of cells) {
            const key = `${cell.itemId}:${cell.locationId}`;
            usedCellKeys.add(key);
            const book = Number(cell.bookQty || 0);
            const counted = Number(cell.countedQty);
            const varianceQty = counted - book;
            const varianceValue = varianceQty * wac;
            const locName = cell.location?.name || '';
            const itemName = cell.item?.name || line.item?.name || '—';
            const showLoc =
                cells.length > 1 || (cell.locationId && cell.locationId !== session.locationId);
            const itemLabel = showLoc ? `${itemName} @ ${locName}` : itemName;
            rows.push({
                itemId: line.itemId,
                itemLabel,
                barcode: cell.item?.barcode || line.item?.barcode || '',
                category: cell.item?.category?.name || line.item?.category?.name || '',
                bookQty: book,
                countedQty: counted,
                varianceQty,
                wacUnitCost: wac,
                varianceValue,
            });
        }
    }

    // Cells without a matching line (unusual; still surface canonical qty)
    for (const cell of latestCells) {
        const key = `${cell.itemId}:${cell.locationId}`;
        if (usedCellKeys.has(key)) continue;
        const book = Number(cell.bookQty || 0);
        const counted = Number(cell.countedQty);
        const varianceQty = counted - book;
        const wac = 0;
        const locName = cell.location?.name || '';
        const itemName = cell.item?.name || '—';
        rows.push({
            itemId: cell.itemId,
            itemLabel: `${itemName} @ ${locName}`,
            barcode: cell.item?.barcode || '',
            category: cell.item?.category?.name || '',
            bookQty: book,
            countedQty: counted,
            varianceQty,
            wacUnitCost: wac,
            varianceValue: varianceQty * wac,
        });
    }

    return rows;
}

function varianceSummaryFromRows(rows) {
    const positive = rows.filter((r) => Number(r.varianceQty) > 0);
    const negative = rows.filter((r) => Number(r.varianceQty) < 0);
    const totalPositiveValue = positive.reduce((s, r) => s + Math.abs(Number(r.varianceValue || 0)), 0);
    const totalNegativeValue = negative.reduce((s, r) => s + Math.abs(Number(r.varianceValue || 0)), 0);
    return {
        itemsCounted: rows.filter((r) => r.countedQty !== null && r.countedQty !== undefined).length,
        totalItems: rows.length,
        overQty: positive.reduce((s, r) => s + Math.abs(Number(r.varianceQty)), 0),
        shortQty: negative.reduce((s, r) => s + Math.abs(Number(r.varianceQty)), 0),
        overValue: totalPositiveValue,
        shortValue: totalNegativeValue,
        netVarianceValue: totalPositiveValue - totalNegativeValue,
    };
}

/**
 * Full evidence payload for JSON, PDF, and Excel exports.
 */
async function buildEvidencePack(session, tenantId) {
    let ledgerEntries = [];
    if (session.status === 'POSTED') {
        ledgerEntries = await prisma.inventoryLedger.findMany({
            where: { referenceId: session.id, tenantId },
        });
    }

    const locationQtys = await fetchLocationQtys(session.id);
    const displayRows = buildEvidenceRows(session, locationQtys);
    const varianceSummary = varianceSummaryFromRows(displayRows);

    const jsonLines = displayRows.map((r) => ({
        item: r.itemLabel,
        bookQty: r.bookQty,
        countedQty: r.countedQty,
        varianceQty: r.varianceQty,
        unitCost: r.wacUnitCost,
        varianceValue: r.varianceValue,
    }));

    return {
        sessionInfo: {
            sessionNo: session.sessionNo,
            location: session.location.name,
            status: session.status,
            snapshotAt: session.snapshotAt,
            postedAt: session.postedAt,
            createdBy: `${session.createdByUser.firstName} ${session.createdByUser.lastName}`,
        },
        approvalHistory: session.approvalRequest
            ? session.approvalRequest.steps.map((s) => ({
                  step: s.stepNumber,
                  role: s.requiredRole?.code ?? s.requiredRole,
                  status: s.status,
                  actedBy: s.actedByUser ? `${s.actedByUser.firstName} ${s.actedByUser.lastName}` : null,
                  actedAt: s.actedAt,
                  comment: s.comment,
              }))
            : [],
        varianceSummary,
        lines: jsonLines,
        /** Rich rows for Excel (same order as lines). */
        excelRows: displayRows,
        ledgerEntries: ledgerEntries.map((l) => ({
            itemId: l.itemId,
            type: l.movementType,
            qtyIn: Number(l.qtyIn),
            qtyOut: Number(l.qtyOut),
            totalValue: Number(l.totalValue),
        })),
    };
}

module.exports = {
    buildEvidencePack,
    /** Exported for smoke / unit tests only */
    _buildEvidenceRows: buildEvidenceRows,
    _pickLatestCountedCells: pickLatestCountedCells,
    _sessionHasAnyCountedCells: sessionHasAnyCountedCells,
};
