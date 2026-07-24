'use strict';

const { PrismaClient } = require('@prisma/client');
const { periodEndInstant, assignedPeriodKey } = require('./postingPeriod.util');
const { tenantPeriodYearMonth } = require('../utils/tenant-calendar.util');
const { getTenantTimezone } = require('../services/tenantTimezone.service');

const prisma = new PrismaClient();

const SNAPSHOT_QTY_EPSILON = 0.0001;
const SNAPSHOT_WAC_EPSILON = 0.0001;

const INBOUND_MOVEMENTS = new Set(['RECEIVE', 'RETURN', 'TRANSFER_IN', 'GET_PASS_RETURN']);
const OUTBOUND_MOVEMENTS = new Set([
    'ISSUE',
    'TRANSFER_OUT',
    'BREAKAGE',
    'LOST',
    'LOAN_WRITE_OFF',
    'GET_PASS_OUT',
]);
const ADJUSTMENT_MOVEMENTS = new Set(['ADJUSTMENT', 'COUNT_ADJUSTMENT']);

function effectivePostingPeriod(entry, timezone) {
    if (entry.assignedPostingPeriod) return entry.assignedPostingPeriod;
    const date = entry.postingDate || entry.createdAt;
    const { year, month } = tenantPeriodYearMonth(date, timezone);
    return `${year}-${String(month).padStart(2, '0')}`;
}

function compareLedgerEntries(a, b, timezone) {
    const periodOrder = effectivePostingPeriod(a, timezone).localeCompare(effectivePostingPeriod(b, timezone));
    if (periodOrder !== 0) return periodOrder;

    const aPostingTime = (a.postingDate || a.createdAt).getTime();
    const bPostingTime = (b.postingDate || b.createdAt).getTime();
    if (aPostingTime !== bPostingTime) return aPostingTime - bPostingTime;

    const createdOrder = a.createdAt.getTime() - b.createdAt.getTime();
    if (createdOrder !== 0) return createdOrder;
    return a.id.localeCompare(b.id);
}

function applyValuationEntry(balance, entry) {
    const qtyIn = Number(entry.qtyIn || 0);
    const qtyOut = Number(entry.qtyOut || 0);
    const totalValue = Number(entry.totalValue || 0);

    if (entry.movementType === 'OPENING_BALANCE') {
        balance.qty += qtyIn - qtyOut;
        balance.value += totalValue;
        return;
    }

    if (INBOUND_MOVEMENTS.has(entry.movementType)) {
        balance.qty += qtyIn;
        balance.value += totalValue;
        return;
    }

    if (OUTBOUND_MOVEMENTS.has(entry.movementType)) {
        balance.qty -= qtyOut;
        balance.value -= totalValue;
        return;
    }

    if (ADJUSTMENT_MOVEMENTS.has(entry.movementType)) {
        balance.qty += qtyIn - qtyOut;
        balance.value += qtyIn > 0 ? totalValue : -totalValue;
        return;
    }

    throw Object.assign(
        new Error(`Cannot build closing snapshot: unsupported valuation movement ${entry.movementType}.`),
        {
            statusCode: 422,
            code: 'SNAPSHOT_UNSUPPORTED_VALUATION_MOVEMENT',
            details: { ledgerId: entry.id, movementType: entry.movementType },
        },
    );
}

function replayValuationEntries(entries, timezone) {
    const balances = new Map();
    const balanceAfterMismatches = [];

    for (const entry of [...entries].sort((a, b) => compareLedgerEntries(a, b, timezone))) {
        if (!entry.affectsValuation) continue;
        const key = `${entry.itemId}:${entry.locationId}`;
        const balance = balances.get(key) || {
            itemId: entry.itemId,
            locationId: entry.locationId,
            qty: 0,
            value: 0,
        };

        applyValuationEntry(balance, entry);
        const ledgerBalanceAfter = Number(entry.balanceAfter);
        if (
            Number.isFinite(ledgerBalanceAfter) &&
            Math.abs(balance.qty - ledgerBalanceAfter) > SNAPSHOT_QTY_EPSILON
        ) {
            balanceAfterMismatches.push({
                ledgerId: entry.id,
                itemId: entry.itemId,
                locationId: entry.locationId,
                movementType: entry.movementType,
                replayQty: balance.qty,
                ledgerBalanceAfter,
            });
        }
        balances.set(key, balance);
    }

    const lines = [...balances.values()]
        .filter((balance) => Math.abs(balance.qty) > SNAPSHOT_QTY_EPSILON)
        .map((balance) => ({
            itemId: balance.itemId,
            locationId: balance.locationId,
            closingQty: balance.qty,
            closingValue: balance.value,
            wacUnitCost: balance.qty > SNAPSHOT_QTY_EPSILON
                ? balance.value / balance.qty
                : 0,
        }));

    return { lines, balanceAfterMismatches };
}

async function loadClosingLedgerEntries(client, tenantId, year, month, timezone) {
    const periodKey = assignedPeriodKey(year, month);
    const end = periodEndInstant(year, month, timezone);

    return client.inventoryLedger.findMany({
        where: {
            tenantId,
            OR: [
                { assignedPostingPeriod: { lte: periodKey } },
                {
                    assignedPostingPeriod: null,
                    postingDate: { lte: end },
                },
                {
                    assignedPostingPeriod: null,
                    postingDate: null,
                    createdAt: { lte: end },
                },
            ],
        },
        select: {
            id: true,
            itemId: true,
            locationId: true,
            movementType: true,
            qtyIn: true,
            qtyOut: true,
            unitCost: true,
            totalValue: true,
            balanceAfter: true,
            affectsValuation: true,
            assignedPostingPeriod: true,
            postingDate: true,
            createdAt: true,
        },
    });
}

async function buildClosingSnapshotResult(client, tenantId, year, month, timezone = null) {
    const tenantTimezone = timezone || await getTenantTimezone(tenantId, client);
    const entries = await loadClosingLedgerEntries(client, tenantId, year, month, tenantTimezone);
    return replayValuationEntries(entries, tenantTimezone);
}

/**
 * Build closing balances from inventory ledger through period end (Ch.6.12 / D4).
 * Qty/WAC use valuation-affecting ledger only (ADR-002 / OMC): Get Pass custody
 * checkout & good-return rows (affectsValuation=false) are operational narrative,
 * not official closing qty — including them double-counts vs BRK/LST on-hand.
 * @param {string} tenantId
 * @param {number} year
 * @param {number} month 1–12
 */
async function buildClosingSnapshotLines(tenantId, year, month, db = prisma) {
    const result = await buildClosingSnapshotResult(db, tenantId, year, month);
    return result.lines;
}

async function validateClosingSnapshotReplay(tenantId, year, month) {
    const timezone = await getTenantTimezone(tenantId, prisma);
    const result = await buildClosingSnapshotResult(prisma, tenantId, year, month, timezone);
    const periodKey = assignedPeriodKey(year, month);
    const end = periodEndInstant(year, month, timezone);
    const laterEntry = await prisma.inventoryLedger.findFirst({
        where: {
            tenantId,
            affectsValuation: true,
            OR: [
                { assignedPostingPeriod: { gt: periodKey } },
                {
                    assignedPostingPeriod: null,
                    postingDate: { gt: end },
                },
                {
                    assignedPostingPeriod: null,
                    postingDate: null,
                    createdAt: { gt: end },
                },
            ],
        },
        select: { id: true },
    });

    const stockBalanceMismatches = [];
    if (!laterEntry) {
        const stocks = await prisma.stockBalance.findMany({
            where: { tenantId },
            select: {
                itemId: true,
                locationId: true,
                qtyOnHand: true,
                wacUnitCost: true,
            },
        });
        const lineMap = new Map(
            result.lines.map((line) => [`${line.itemId}:${line.locationId}`, line]),
        );
        const stockMap = new Map(
            stocks.map((stock) => [`${stock.itemId}:${stock.locationId}`, stock]),
        );
        const keys = new Set([...lineMap.keys(), ...stockMap.keys()]);
        for (const key of keys) {
            const line = lineMap.get(key);
            const stock = stockMap.get(key);
            const replayQty = Number(line?.closingQty || 0);
            const replayValue = Number(line?.closingValue || 0);
            const replayWac = Number(line?.wacUnitCost || 0);
            const stockQty = Number(stock?.qtyOnHand || 0);
            const stockWac = Number(stock?.wacUnitCost || 0);
            if (
                Math.abs(stockQty - replayQty) > SNAPSHOT_QTY_EPSILON ||
                (
                    Math.max(Math.abs(stockQty), Math.abs(replayQty)) > SNAPSHOT_QTY_EPSILON &&
                    Math.abs(stockWac - replayWac) > SNAPSHOT_WAC_EPSILON
                )
            ) {
                stockBalanceMismatches.push({
                    itemId: line?.itemId || stock.itemId,
                    locationId: line?.locationId || stock.locationId,
                    replayQty,
                    replayWac,
                    replayValue,
                    stockQty,
                    stockWac,
                    stockValue: stockQty * stockWac,
                });
            }
        }
    }

    return {
        balanceAfterMismatches: result.balanceAfterMismatches,
        stockBalanceMismatches,
        stockComparisonSkipped: Boolean(laterEntry),
    };
}

module.exports = {
    buildClosingSnapshotLines,
    replayValuationEntries,
    validateClosingSnapshotReplay,
};
