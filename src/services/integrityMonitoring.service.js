/**
 * Proactive data integrity monitoring (Phase F3).
 * Detects stock/ledger drift, orphans, workflow anomalies before manual discovery.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const OFFICIAL_LEDGER_WHERE = { affectsValuation: true };
const DRIFT_TOLERANCE = 0.0001;
const MAX_STOCK_LEDGER_SAMPLES = 200;
const MAX_ORPHAN_SAMPLES = 25;
const INTEGRITY_HISTORY_KEY = 'integrity.scanHistory';
const INTEGRITY_HISTORY_MAX = 48;

const { randomUUID } = require('crypto');

/**
 * @param {string} tenantId
 * @param {{ stockLedgerSampleSize?: number }} [opts]
 */
async function runIntegrityScan(tenantId, opts = {}) {
    const sampleSize = Math.min(opts.stockLedgerSampleSize ?? MAX_STOCK_LEDGER_SAMPLES, 500);
    const scannedAt = new Date().toISOString();
    /** @type {Array<{ code: string, severity: string, message: string, count: number, sample?: unknown[] }>} */
    const issues = [];

    const balances = await prisma.stockBalance.findMany({
        where: { tenantId },
        select: { itemId: true, locationId: true, qtyOnHand: true, wacUnitCost: true },
        take: sampleSize,
        orderBy: { lastUpdated: 'desc' },
    });

    const zeroWacWithQty = balances.filter((b) => Number(b.qtyOnHand) > DRIFT_TOLERANCE && Number(b.wacUnitCost || 0) <= DRIFT_TOLERANCE);
    if (zeroWacWithQty.length) {
        issues.push({
            code: 'WAC_ANOMALY_ZERO_WITH_QTY',
            severity: 'WARNING',
            message: 'On-hand quantity with zero WAC (valuation incomplete).',
            count: zeroWacWithQty.length,
            sample: zeroWacWithQty.slice(0, 5),
        });
    }

    const stockLedgerDrift = [];
    for (const b of balances) {
        const agg = await prisma.inventoryLedger.aggregate({
            where: {
                tenantId,
                itemId: b.itemId,
                locationId: b.locationId,
                ...OFFICIAL_LEDGER_WHERE,
            },
            _sum: { qtyIn: true, qtyOut: true },
        });
        const netLedger = Number(agg._sum.qtyIn || 0) - Number(agg._sum.qtyOut || 0);
        const onHand = Number(b.qtyOnHand || 0);
        if (Math.abs(netLedger - onHand) > DRIFT_TOLERANCE) {
            stockLedgerDrift.push({
                itemId: b.itemId,
                locationId: b.locationId,
                qtyOnHand: onHand,
                netLedgerQty: netLedger,
                drift: onHand - netLedger,
            });
        }
    }
    if (stockLedgerDrift.length) {
        issues.push({
            code: 'STOCK_LEDGER_DRIFT',
            severity: 'BLOCKER',
            message:
                'Stock on-hand does not match net official ledger quantity (sampled balances). Investigate before period close.',
            count: stockLedgerDrift.length,
            sample: stockLedgerDrift.slice(0, 5),
        });
    }

    const orphanGetPassReturnDocs = await prisma.movementDocument.findMany({
        where: {
            tenantId,
            sourceType: 'GET_PASS_RETURN',
            getPassId: null,
        },
        select: { id: true, documentNo: true, movementType: true, status: true },
        take: MAX_ORPHAN_SAMPLES,
    });
    if (orphanGetPassReturnDocs.length) {
        issues.push({
            code: 'ORPHAN_GET_PASS_RETURN_DOC',
            severity: 'BLOCKER',
            message: 'GET_PASS_RETURN movement document(s) missing getPassId linkage.',
            count: orphanGetPassReturnDocs.length,
            sample: orphanGetPassReturnDocs,
        });
    }

    const duplicatePostedCounts = await prisma.stockCountSession.groupBy({
        by: ['sessionNo'],
        where: { tenantId, status: 'POSTED' },
        _count: { id: true },
        having: { id: { _count: { gt: 1 } } },
    });
    if (duplicatePostedCounts.length) {
        issues.push({
            code: 'DUPLICATE_POSTED_COUNT_SESSION_NO',
            severity: 'BLOCKER',
            message: 'Duplicate POSTED count session numbers detected.',
            count: duplicatePostedCounts.length,
            sample: duplicatePostedCounts,
        });
    }

    const ledgerZeroBalanceAfter = await prisma.inventoryLedger.count({
        where: {
            tenantId,
            ...OFFICIAL_LEDGER_WHERE,
            balanceAfter: { lte: 0 },
            movementType: { in: ['COUNT_ADJUSTMENT', 'BREAKAGE', 'LOST', 'RECEIVE', 'ISSUE', 'TRANSFER_IN', 'TRANSFER_OUT'] },
            OR: [{ qtyIn: { gt: 0 } }, { qtyOut: { gt: 0 } }],
        },
    });
    if (ledgerZeroBalanceAfter > 0) {
        issues.push({
            code: 'LEDGER_SUSPICIOUS_BALANCE_AFTER',
            severity: 'WARNING',
            message: 'Ledger row(s) with zero balanceAfter on quantity-moving official entries.',
            count: ledgerZeroBalanceAfter,
        });
    }

    const openCounts = await prisma.stockCountSession.count({
        where: { tenantId, status: { notIn: ['POSTED', 'VOID', 'REJECTED'] } },
    });
    if (openCounts > 0) {
        issues.push({
            code: 'OPEN_COUNT_SESSION',
            severity: 'INFO',
            message: 'Non-terminal inventory count session(s).',
            count: openCounts,
        });
    }

    const blockerCount = issues.filter((i) => i.severity === 'BLOCKER').length;
    const warningCount = issues.filter((i) => i.severity === 'WARNING').length;

    return {
        tenantId,
        scannedAt,
        healthy: blockerCount === 0,
        summary: {
            issueCount: issues.length,
            blockerCount,
            warningCount,
            balancesSampled: balances.length,
        },
        issues,
    };
}

async function loadScanHistory(tenantId) {
    const row = await prisma.tenantSetting.findUnique({
        where: { tenantId_key: { tenantId, key: INTEGRITY_HISTORY_KEY } },
    });
    if (!row?.value) return [];
    try {
        const parsed = JSON.parse(row.value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function persistScanRun(tenantId, scanResult, triggeredBy = 'API') {
    const history = await loadScanHistory(tenantId);
    const entry = {
        id: randomUUID(),
        triggeredBy,
        ...scanResult,
    };
    history.unshift(entry);
    const trimmed = history.slice(0, INTEGRITY_HISTORY_MAX);
    await prisma.tenantSetting.upsert({
        where: { tenantId_key: { tenantId, key: INTEGRITY_HISTORY_KEY } },
        update: { value: JSON.stringify(trimmed) },
        create: { tenantId, key: INTEGRITY_HISTORY_KEY, value: JSON.stringify(trimmed) },
    });
    return entry;
}

async function runAndPersistIntegrityScan(tenantId, opts = {}) {
    const result = await runIntegrityScan(tenantId, opts);
    const entry = await persistScanRun(tenantId, result, opts.triggeredBy || 'API');
    return entry;
}

async function getIntegrityScanHistory(tenantId, { limit = 20 } = {}) {
    const history = await loadScanHistory(tenantId);
    return history.slice(0, Math.min(limit, INTEGRITY_HISTORY_MAX));
}

module.exports = {
    runIntegrityScan,
    runAndPersistIntegrityScan,
    getIntegrityScanHistory,
    persistScanRun,
    OFFICIAL_LEDGER_WHERE,
    DRIFT_TOLERANCE,
};
