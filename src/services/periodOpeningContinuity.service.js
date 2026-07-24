'use strict';

const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { buildClosingSnapshotLines } = require('../platform/periodLedgerSnapshot.service');
const { assignedPeriodKey, periodEndInstant, monthBounds } = require('../platform/postingPeriod.util');
const { getTenantTimezone } = require('./tenantTimezone.service');

const ALGORITHM_VERSION = 'v1';
const QUANTITY_TOLERANCE = 0.0001;
const WAC_TOLERANCE = 0.0001;
const VALUE_TOLERANCE = 0.01;

function previousPeriod(year, month) {
    return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function number(value) {
    return Number(value || 0);
}

function fixed(value) {
    return number(value).toFixed(4);
}

function cellKey(itemId, locationId) {
    return `${itemId}:${locationId}`;
}

function hashJson(value) {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function canonicalCells(rows, fields) {
    return [...rows]
        .map((row) => ({
            itemId: row.itemId,
            locationId: row.locationId,
            ...Object.fromEntries(fields.map((field) => [field, fixed(row[field])])),
        }))
        .sort((a, b) => cellKey(a.itemId, a.locationId).localeCompare(cellKey(b.itemId, b.locationId)));
}

async function loadBoundaryLedgerRows(db, tenantId, year, month, timezone) {
    const periodKey = assignedPeriodKey(year, month);
    const end = periodEndInstant(year, month, timezone);
    return db.inventoryLedger.findMany({
        where: {
            tenantId,
            affectsValuation: true,
            OR: [
                { assignedPostingPeriod: { lte: periodKey } },
                { assignedPostingPeriod: null, postingDate: { lte: end } },
                { assignedPostingPeriod: null, postingDate: null, createdAt: { lte: end } },
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
        orderBy: { id: 'asc' },
    });
}

function hashBoundaryLedgerRows(rows) {
    return hashJson(
        rows.map((row) => ({
            id: row.id,
            itemId: row.itemId,
            locationId: row.locationId,
            movementType: row.movementType,
            qtyIn: fixed(row.qtyIn),
            qtyOut: fixed(row.qtyOut),
            unitCost: fixed(row.unitCost),
            totalValue: fixed(row.totalValue),
            balanceAfter: fixed(row.balanceAfter),
            affectsValuation: row.affectsValuation,
            assignedPostingPeriod: row.assignedPostingPeriod,
            postingDate: row.postingDate?.toISOString() ?? null,
            createdAt: row.createdAt.toISOString(),
        })),
    );
}

async function countTargetPeriodActivity(db, tenantId, year, month, timezone) {
    const key = assignedPeriodKey(year, month);
    const { start, end } = monthBounds(year, month, timezone);
    return db.inventoryLedger.count({
        where: {
            tenantId,
            affectsValuation: true,
            OR: [
                { assignedPostingPeriod: key },
                { assignedPostingPeriod: null, postingDate: { gte: start, lte: end } },
                { assignedPostingPeriod: null, postingDate: null, createdAt: { gte: start, lte: end } },
            ],
        },
    });
}

function sourceCell(row, kind) {
    if (!row) return null;
    if (kind === 'snapshot') {
        return {
            qty: number(row.closingQty),
            wac: number(row.wacUnitCost),
            value: number(row.closingValue),
        };
    }
    if (kind === 'ledger') {
        return {
            qty: number(row.closingQty),
            wac: number(row.wacUnitCost),
            value: number(row.closingValue),
        };
    }
    const qty = number(row.qtyOnHand);
    const wac = number(row.wacUnitCost);
    return { qty, wac, value: qty * wac };
}

function exceeds(a, b, tolerance) {
    return Math.abs(number(a) - number(b)) > tolerance;
}

function classifyCell(snapshot, ledger, opening) {
    if (!snapshot && (ledger || opening)) return 'MISSING_SNAPSHOT_CELL';
    if (snapshot && !opening) return 'MISSING_OPENING_CELL';
    if (!ledger) return 'IRRECONSTRUCTIBLE';
    const sources = [snapshot, ledger, opening];
    const qtyMismatch =
        exceeds(sources[0].qty, sources[1].qty, QUANTITY_TOLERANCE) ||
        exceeds(sources[0].qty, sources[2].qty, QUANTITY_TOLERANCE);
    const wacMismatch =
        exceeds(sources[0].wac, sources[1].wac, WAC_TOLERANCE) ||
        exceeds(sources[0].wac, sources[2].wac, WAC_TOLERANCE);
    const valueMismatch =
        exceeds(sources[0].value, sources[1].value, VALUE_TOLERANCE) ||
        exceeds(sources[0].value, sources[2].value, VALUE_TOLERANCE);
    const mismatchCount = [qtyMismatch, wacMismatch, valueMismatch].filter(Boolean).length;
    if (mismatchCount > 1) return 'MULTI_MISMATCH';
    if (qtyMismatch) return 'QTY_MISMATCH';
    if (wacMismatch) return 'WAC_MISMATCH';
    if (valueMismatch) return 'VALUE_MISMATCH';
    return 'MATCH';
}

async function buildPeriodOpeningContinuityReport(
    { tenantId, targetYear, targetMonth, generatedBy = null },
    db = prisma,
) {
    if (!Number(targetYear) || !Number(targetMonth) || Number(targetMonth) < 1 || Number(targetMonth) > 12) {
        throw Object.assign(new Error('Target year and month (1–12) are required.'), {
            statusCode: 422,
            code: 'INVALID_PERIOD',
        });
    }
    const timezone = await getTenantTimezone(tenantId, db);
    const previous = previousPeriod(targetYear, targetMonth);
    const priorPeriod = await db.periodClose.findUnique({
        where: {
            tenantId_year_month: {
                tenantId,
                year: previous.year,
                month: previous.month,
            },
        },
        include: {
            snapshotVersions: {
                where: { status: 'CURRENT' },
                include: { lines: true },
                orderBy: { versionNumber: 'desc' },
            },
        },
    });
    const currentSnapshots = priorPeriod?.snapshotVersions || [];
    const globalLines = [];
    if (currentSnapshots.length > 1) {
        globalLines.push({
            itemId: null,
            locationId: null,
            classification: 'MULTIPLE_CURRENT_SNAPSHOTS',
            issueCodes: ['MULTIPLE_CURRENT_SNAPSHOTS'],
        });
    }
    const snapshotVersion = currentSnapshots.length === 1 ? currentSnapshots[0] : null;
    if (
        !priorPeriod ||
        priorPeriod.status !== 'CLOSED' ||
        !snapshotVersion ||
        !snapshotVersion.closedAt ||
        !snapshotVersion.closedBy
    ) {
        globalLines.push({
            itemId: null,
            locationId: null,
            classification: 'IRRECONSTRUCTIBLE',
            issueCodes: ['APPROVED_CURRENT_SNAPSHOT_REQUIRED'],
        });
    }

    const targetActivityCount = await countTargetPeriodActivity(
        db,
        tenantId,
        targetYear,
        targetMonth,
        timezone,
    );
    if (targetActivityCount > 0) {
        globalLines.push({
            itemId: null,
            locationId: null,
            classification: 'ACTIVITY_ALREADY_STARTED',
            issueCodes: ['TARGET_PERIOD_ACTIVITY_ALREADY_STARTED'],
        });
    }

    let ledgerLines = [];
    let boundaryRows = [];
    try {
        [ledgerLines, boundaryRows] = await Promise.all([
            buildClosingSnapshotLines(tenantId, previous.year, previous.month, db),
            loadBoundaryLedgerRows(db, tenantId, previous.year, previous.month, timezone),
        ]);
    } catch (error) {
        globalLines.push({
            itemId: null,
            locationId: null,
            classification: 'IRRECONSTRUCTIBLE',
            issueCodes: [error.code || 'LEDGER_REPLAY_FAILED'],
        });
    }
    const stocks = await db.stockBalance.findMany({
        where: { tenantId },
        select: { itemId: true, locationId: true, qtyOnHand: true, wacUnitCost: true },
    });

    const snapshotRows = snapshotVersion?.lines || [];
    const snapshotMap = new Map(snapshotRows.map((row) => [cellKey(row.itemId, row.locationId), row]));
    const ledgerMap = new Map(ledgerLines.map((row) => [cellKey(row.itemId, row.locationId), row]));
    const stockMap = new Map(stocks.map((row) => [cellKey(row.itemId, row.locationId), row]));
    const keys = [...new Set([...snapshotMap.keys(), ...ledgerMap.keys(), ...stockMap.keys()])].sort();
    const lines = keys.map((key) => {
        const snapshotRow = snapshotMap.get(key);
        const ledgerRow = ledgerMap.get(key);
        const stockRow = stockMap.get(key);
        const snapshot = sourceCell(snapshotRow, 'snapshot');
        const ledger = sourceCell(ledgerRow, 'ledger');
        const opening = sourceCell(stockRow, 'opening');
        const [itemId, locationId] = key.split(':');
        const classification = classifyCell(snapshot, ledger, opening);
        return {
            itemId,
            locationId,
            classification,
            snapshot,
            ledger,
            opening,
            quantityDelta: opening && snapshot ? opening.qty - snapshot.qty : null,
            wacDelta: opening && snapshot ? opening.wac - snapshot.wac : null,
            valueDelta: opening && snapshot ? opening.value - snapshot.value : null,
            issueCodes: classification === 'MATCH' ? [] : [classification],
        };
    });
    lines.push(...globalLines);

    const hasIndeterminate = lines.some((line) =>
        ['IRRECONSTRUCTIBLE', 'MULTIPLE_CURRENT_SNAPSHOTS', 'ACTIVITY_ALREADY_STARTED'].includes(
            line.classification,
        ),
    );
    const hasFailure = lines.some((line) => line.classification !== 'MATCH');
    const status = hasIndeterminate ? 'INDETERMINATE' : hasFailure ? 'FAIL' : 'PASS';
    const snapshotHash = snapshotVersion
        ? hashJson(canonicalCells(snapshotRows, ['closingQty', 'wacUnitCost', 'closingValue']))
        : null;
    const ledgerHash = hashBoundaryLedgerRows(boundaryRows);
    const openingStockHash = hashJson(canonicalCells(stocks, ['qtyOnHand', 'wacUnitCost']));
    const evidenceHash = hashJson({
        tenantId,
        targetYear,
        targetMonth,
        sourceSnapshotVersionId: snapshotVersion?.id ?? null,
        snapshotHash,
        ledgerHash,
        openingStockHash,
        algorithmVersion: ALGORITHM_VERSION,
    });
    const counts = Object.fromEntries(
        lines.reduce((map, line) => map.set(line.classification, (map.get(line.classification) || 0) + 1), new Map()),
    );

    return {
        tenantId,
        targetYear,
        targetMonth,
        verificationType: 'CONTINUITY',
        status,
        sourcePeriodCloseId: priorPeriod?.id ?? null,
        sourceSnapshotVersionId: snapshotVersion?.id ?? null,
        algorithmVersion: ALGORITHM_VERSION,
        tolerances: {
            quantity: QUANTITY_TOLERANCE,
            wac: WAC_TOLERANCE,
            value: VALUE_TOLERANCE,
        },
        snapshotHash,
        ledgerHash,
        openingStockHash,
        evidenceHash,
        generatedBy,
        generatedAt: new Date(),
        summary: { totalLines: lines.length, counts, targetActivityCount },
        lines,
    };
}

function verificationCreateData(report, actorId, extra = {}) {
    return {
        tenantId: report.tenantId,
        targetYear: report.targetYear,
        targetMonth: report.targetMonth,
        verificationType: report.verificationType,
        status: report.status,
        isCurrent: true,
        sourcePeriodCloseId: report.sourcePeriodCloseId ?? null,
        sourceSnapshotVersionId: report.sourceSnapshotVersionId ?? null,
        algorithmVersion: report.algorithmVersion,
        quantityTolerance: report.tolerances.quantity,
        wacTolerance: report.tolerances.wac,
        valueTolerance: report.tolerances.value,
        snapshotHash: report.snapshotHash,
        ledgerHash: report.ledgerHash,
        openingStockHash: report.openingStockHash,
        evidenceHash: report.evidenceHash,
        generatedBy: actorId ?? null,
        generatedAt: report.generatedAt,
        acceptedBy: actorId ?? null,
        acceptedAt: report.status === 'PASS' ? new Date() : null,
        ...extra,
    };
}

async function persistAcceptedContinuityVerification(tx, report, actorId) {
    if (report.status !== 'PASS') {
        throw Object.assign(new Error('Period opening continuity verification did not pass.'), {
            statusCode: 422,
            code: 'PERIOD_OPENING_CONTINUITY_BLOCKED',
            report,
        });
    }
    await tx.periodOpeningVerification.updateMany({
        where: {
            tenantId: report.tenantId,
            targetYear: report.targetYear,
            targetMonth: report.targetMonth,
            isCurrent: true,
        },
        data: { isCurrent: false },
    });
    return tx.periodOpeningVerification.create({
        data: {
            ...verificationCreateData(report, actorId),
            lines: {
                create: report.lines.map((line) => ({
                    itemId: line.itemId,
                    locationId: line.locationId,
                    classification: line.classification,
                    snapshotQty: line.snapshot?.qty ?? null,
                    snapshotWac: line.snapshot?.wac ?? null,
                    snapshotValue: line.snapshot?.value ?? null,
                    ledgerQty: line.ledger?.qty ?? null,
                    ledgerWac: line.ledger?.wac ?? null,
                    ledgerValue: line.ledger?.value ?? null,
                    openingQty: line.opening?.qty ?? null,
                    openingWac: line.opening?.wac ?? null,
                    openingValue: line.opening?.value ?? null,
                    quantityDelta: line.quantityDelta,
                    wacDelta: line.wacDelta,
                    valueDelta: line.valueDelta,
                    issueCodes: line.issueCodes,
                })),
            },
        },
    });
}

async function createZeroStateBootstrapVerification(
    tx,
    { tenantId, targetYear, targetMonth, approvedBy, reason, source },
) {
    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!approvedBy || !normalizedReason) {
        throw Object.assign(new Error('Explicit Bootstrap approval actor and reason are required.'), {
            statusCode: 422,
            code: 'PERIOD_BOOTSTRAP_APPROVAL_REQUIRED',
        });
    }
    const [periodCount, valuationLedgerCount, nonZeroStockCount] = await Promise.all([
        tx.periodClose.count({ where: { tenantId } }),
        tx.inventoryLedger.count({ where: { tenantId, affectsValuation: true } }),
        tx.stockBalance.count({
            where: {
                tenantId,
                OR: [{ qtyOnHand: { not: 0 } }, { qtyBlocked: { not: 0 } }],
            },
        }),
    ]);
    if (periodCount > 0 || valuationLedgerCount > 0 || nonZeroStockCount > 0) {
        throw Object.assign(new Error('Bootstrap is allowed only for a zero-state tenant.'), {
            statusCode: 422,
            code: 'PERIOD_BOOTSTRAP_NOT_ZERO_STATE',
            details: { periodCount, valuationLedgerCount, nonZeroStockCount },
        });
    }
    const emptyHash = hashJson([]);
    const report = {
        tenantId,
        targetYear,
        targetMonth,
        verificationType: 'BOOTSTRAP',
        status: 'PASS',
        sourcePeriodCloseId: null,
        sourceSnapshotVersionId: null,
        algorithmVersion: ALGORITHM_VERSION,
        tolerances: { quantity: QUANTITY_TOLERANCE, wac: WAC_TOLERANCE, value: VALUE_TOLERANCE },
        snapshotHash: emptyHash,
        ledgerHash: emptyHash,
        openingStockHash: emptyHash,
        evidenceHash: hashJson({
            tenantId,
            targetYear,
            targetMonth,
            verificationType: 'BOOTSTRAP',
            emptyHash,
            algorithmVersion: ALGORITHM_VERSION,
        }),
        generatedAt: new Date(),
        lines: [],
    };
    await tx.periodOpeningVerification.updateMany({
        where: { tenantId, targetYear, targetMonth, isCurrent: true },
        data: { isCurrent: false },
    });
    return tx.periodOpeningVerification.create({
        data: verificationCreateData(report, approvedBy, {
            bootstrapReason: normalizedReason,
            bootstrapSource: source || 'EXPLICIT',
        }),
    });
}

async function invalidateVerification(db, verification, reason) {
    await db.periodOpeningVerification.updateMany({
        where: { id: verification.id, status: 'PASS', isCurrent: true },
        data: {
            status: 'INVALIDATED',
            isCurrent: false,
            invalidatedAt: new Date(),
            invalidationReason: reason,
        },
    });
}

async function assertOpeningContinuityEvidenceFresh(tenantId, period, db = prisma) {
    const timezone = await getTenantTimezone(tenantId, db);
    if (!period.openingVerificationId) {
        throw Object.assign(new Error('Period has no accepted opening continuity verification.'), {
            statusCode: 422,
            code: 'PERIOD_OPENING_VERIFICATION_REQUIRED',
        });
    }
    const verification = await db.periodOpeningVerification.findUnique({
        where: { id: period.openingVerificationId },
    });
    if (
        !verification ||
        verification.tenantId !== tenantId ||
        verification.targetYear !== period.year ||
        verification.targetMonth !== period.month ||
        verification.status !== 'PASS' ||
        !verification.isCurrent
    ) {
        throw Object.assign(new Error('Period opening verification is not an active PASS.'), {
            statusCode: 422,
            code: 'PERIOD_OPENING_VERIFICATION_STALE',
        });
    }
    if (verification.verificationType === 'BOOTSTRAP') return verification;

    const previous = previousPeriod(period.year, period.month);
    const prior = await db.periodClose.findUnique({
        where: {
            tenantId_year_month: { tenantId, year: previous.year, month: previous.month },
        },
        include: {
            snapshotVersions: {
                where: { status: 'CURRENT' },
                include: { lines: true },
            },
        },
    });
    const currentSnapshots = prior?.snapshotVersions || [];
    const currentSnapshot = currentSnapshots.length === 1 ? currentSnapshots[0] : null;
    const snapshotHash = currentSnapshot
        ? hashJson(canonicalCells(currentSnapshot.lines, ['closingQty', 'wacUnitCost', 'closingValue']))
        : null;
    const ledgerHash = hashBoundaryLedgerRows(
        await loadBoundaryLedgerRows(db, tenantId, previous.year, previous.month, timezone),
    );
    const staleReason =
        currentSnapshot?.id !== verification.sourceSnapshotVersionId
            ? 'SOURCE_SNAPSHOT_CHANGED'
            : snapshotHash !== verification.snapshotHash
              ? 'SOURCE_SNAPSHOT_CONTENT_CHANGED'
              : ledgerHash !== verification.ledgerHash
                ? 'PRIOR_PERIOD_LEDGER_CHANGED'
                : null;
    if (staleReason) {
        await invalidateVerification(db, verification, staleReason);
        throw Object.assign(new Error(`Period opening verification was invalidated: ${staleReason}.`), {
            statusCode: 422,
            code: 'PERIOD_OPENING_VERIFICATION_STALE',
            reason: staleReason,
        });
    }
    return verification;
}

module.exports = {
    ALGORITHM_VERSION,
    QUANTITY_TOLERANCE,
    WAC_TOLERANCE,
    VALUE_TOLERANCE,
    buildPeriodOpeningContinuityReport,
    persistAcceptedContinuityVerification,
    createZeroStateBootstrapVerification,
    assertOpeningContinuityEvidenceFresh,
    classifyContinuityCell: classifyCell,
};
