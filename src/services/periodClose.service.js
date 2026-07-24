'use strict';

const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const prisma = new PrismaClient();
const {
    assertSequentialCloseAllowed,
    assertLatestClosedForReopen,
    getPeriodRegistryRow,
    lockPeriodForClose,
} = require('./periodGuard.service');
const { assertCloseBlockersZero, runMonthEndCloseChecklist } = require('./periodCloseGovernance.service');
const { buildClosingSnapshotLines } = require('../platform/periodLedgerSnapshot.service');
const { EntityType } = require('./auditTrail.service');
const { writeAuditLogTransactional } = require('./auditWriter.service');
const {
    buildPeriodOpeningContinuityReport,
    persistAcceptedContinuityVerification,
    createZeroStateBootstrapVerification,
} = require('./periodOpeningContinuity.service');

function validateMonthlyPeriod(month) {
    if (!month || month < 1 || month > 12) {
        throw Object.assign(new Error('Month must be 1–12. Annual close (month=null) is prohibited.'), {
            statusCode: 422,
            code: 'ANNUAL_CLOSE_PROHIBITED',
        });
    }
}

async function requirePeriodRecord(tenantId, year, month, db = prisma) {
    validateMonthlyPeriod(month);
    const period = await getPeriodRegistryRow(tenantId, year, month, db);
    if (!period) {
        throw Object.assign(new Error(`No period registry record for ${year}-${String(month).padStart(2, '0')}.`), {
            statusCode: 422,
            code: 'PERIOD_NOT_REGISTERED',
        });
    }
    return period;
}

/** Explicit ABSENT → OPEN registration. It never reopens or changes an existing period. */
async function openPeriod(
    tenantId,
    { year, month, reason = 'Explicit period registration', bootstrapApproval = null },
    userId,
    db = null,
) {
    validateMonthlyPeriod(month);
    const createInTransaction = async (tx) => {
        const existing = await getPeriodRegistryRow(tenantId, year, month, tx);
        if (existing) return existing;
        const verification = bootstrapApproval
            ? await createZeroStateBootstrapVerification(tx, {
                tenantId,
                targetYear: year,
                targetMonth: month,
                approvedBy: bootstrapApproval.approvedBy || userId,
                reason: bootstrapApproval.reason,
                source: bootstrapApproval.source,
            })
            : await persistAcceptedContinuityVerification(
                tx,
                await buildPeriodOpeningContinuityReport(
                    { tenantId, targetYear: year, targetMonth: month, generatedBy: userId },
                    tx,
                ),
                userId,
            );
        const opened = await tx.periodClose.create({
            data: {
                tenantId,
                year,
                month,
                status: 'OPEN',
                openingVerificationId: verification.id,
            },
        });
        await writeAuditLogTransactional({
            tx,
            tenantId,
            entityType: EntityType.PERIOD_CLOSE,
            entityId: opened.id,
            action: 'CREATE',
            changedBy: userId ?? null,
            note: `Period ${year}/${month} explicitly opened. Reason: ${reason}`,
            beforeValue: null,
            afterValue: {
                status: 'OPEN',
                year,
                month,
                reason,
                openingVerificationId: verification.id,
                verificationType: verification.verificationType,
            },
        });
        return opened;
    };
    return db ? createInTransaction(db) : prisma.$transaction(createInTransaction);
}

const getPeriods = async (tenantId) =>
    prisma.periodClose.findMany({
        where: { tenantId },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

const getPeriodById = async (id, tenantId) => {
    const period = await prisma.periodClose.findFirst({
        where: { id, tenantId },
        include: {
            snapshotVersions: {
                orderBy: { versionNumber: 'desc' },
                include: {
                    lines: { take: 20 },
                    _count: { select: { lines: true } },
                },
            },
        },
    });
    if (!period) throw Object.assign(new Error('Period not found'), { status: 404 });
    return period;
};

async function startClosing(tenantId, { year, month }, userId) {
    const result = await prisma.$transaction(async (tx) => {
        await requirePeriodRecord(tenantId, year, month, tx);
        const period = await lockPeriodForClose(tx, tenantId, year, month);
        if (period.status === 'CLOSED') {
            throw Object.assign(new Error(`Period ${year}/${month} is already closed.`), { status: 400 });
        }
        await assertSequentialCloseAllowed(tenantId, year, month, tx);
        if (period.status === 'CLOSING') {
            return {
                updated: period,
                checklist: await runMonthEndCloseChecklist(tenantId, { year, month }, tx),
            };
        }
        const claimed = await tx.periodClose.updateMany({
            where: { id: period.id, status: 'OPEN' },
            data: { status: 'CLOSING' },
        });
        if (claimed.count !== 1) {
            throw Object.assign(new Error('Period state changed before close could start.'), {
                statusCode: 409,
                code: 'PERIOD_STATE_CHANGED',
            });
        }
        const updated = await tx.periodClose.findUnique({ where: { id: period.id } });
        await writeAuditLogTransactional({
            tx,
            tenantId,
            entityType: EntityType.PERIOD_CLOSE,
            entityId: updated.id,
            action: 'START_CLOSE',
            changedBy: userId,
            note: `Period ${year}/${month} entered CLOSING`,
            beforeValue: { status: 'OPEN' },
            afterValue: { status: 'CLOSING', year, month },
        });
        return {
            updated,
            checklist: await runMonthEndCloseChecklist(tenantId, { year, month }, tx),
        };
    });
    return { ...result.updated, monthEndChecklist: result.checklist };
}

async function cancelClosing(tenantId, { year, month }, userId) {
    return prisma.$transaction(async (tx) => {
        await requirePeriodRecord(tenantId, year, month, tx);
        const period = await lockPeriodForClose(tx, tenantId, year, month);
        if (period.status !== 'CLOSING') {
            throw Object.assign(new Error('Period is not in CLOSING state.'), {
                status: 422,
                code: 'PERIOD_NOT_CLOSING',
            });
        }
        const released = await tx.periodClose.updateMany({
            where: { id: period.id, status: 'CLOSING' },
            data: { status: 'OPEN' },
        });
        if (released.count !== 1) {
            throw Object.assign(new Error('Period state changed before close could be cancelled.'), {
                statusCode: 409,
                code: 'PERIOD_STATE_CHANGED',
            });
        }
        const updated = await tx.periodClose.findUnique({ where: { id: period.id } });
        await writeAuditLogTransactional({
            tx,
            tenantId,
            entityType: EntityType.PERIOD_CLOSE,
            entityId: period.id,
            action: 'CANCEL_CLOSE',
            changedBy: userId,
            note: `Period ${year}/${month} returned to OPEN`,
            beforeValue: { status: 'CLOSING' },
            afterValue: { status: 'OPEN', year, month },
        });
        return updated;
    });
}

async function completeClose(tenantId, { year, month, notes }, userId) {
    const result = await prisma.$transaction(async (tx) => {
        await requirePeriodRecord(tenantId, year, month, tx);
        const current = await lockPeriodForClose(tx, tenantId, year, month);
        if (current.status !== 'CLOSING') {
            throw Object.assign(new Error('Period must be in CLOSING state before Complete Close.'), {
                statusCode: 422,
                code: 'PERIOD_NOT_CLOSING',
            });
        }
        const checklist = await assertCloseBlockersZero(tenantId, { year, month }, tx);
        await assertSequentialCloseAllowed(tenantId, year, month, tx);
        const lines = await buildClosingSnapshotLines(tenantId, year, month, tx);
        const now = new Date();
        const priorVersions = await tx.periodSnapshotVersion.findMany({
            where: { periodCloseId: current.id },
        });
        const nextVersion = priorVersions.length ? Math.max(...priorVersions.map((v) => v.versionNumber)) + 1 : 1;

        if (priorVersions.some((v) => v.status === 'CURRENT')) {
            const supersededIds = priorVersions.filter((v) => v.status === 'CURRENT').map((v) => v.id);
            await tx.periodOpeningVerification.updateMany({
                where: {
                    sourceSnapshotVersionId: { in: supersededIds },
                    status: 'PASS',
                    isCurrent: true,
                },
                data: {
                    status: 'INVALIDATED',
                    isCurrent: false,
                    invalidatedAt: now,
                    invalidationReason: 'SOURCE_SNAPSHOT_SUPERSEDED',
                },
            });
            await tx.periodSnapshotVersion.updateMany({
                where: { periodCloseId: current.id, status: 'CURRENT' },
                data: { status: 'SUPERSEDED' },
            });
        }

        const version = await tx.periodSnapshotVersion.create({
            data: {
                id: uuidv4(),
                periodCloseId: current.id,
                versionNumber: nextVersion,
                status: 'CURRENT',
                closedAt: now,
                closedBy: userId,
                notes,
            },
        });

        if (lines.length > 0) {
            await tx.periodSnapshotLine.createMany({
                data: lines.map((l) => ({
                    id: uuidv4(),
                    snapshotVersionId: version.id,
                    itemId: l.itemId,
                    locationId: l.locationId,
                    closingQty: l.closingQty,
                    closingValue: l.closingValue,
                    wacUnitCost: l.wacUnitCost,
                })),
            });
        }

        const closeClaim = await tx.periodClose.updateMany({
            where: { id: current.id, status: 'CLOSING' },
            data: {
                status: 'CLOSED',
                closedAt: now,
                closedBy: userId,
                notes: notes ?? current.notes,
            },
        });
        if (closeClaim.count !== 1) {
            throw Object.assign(new Error('Period state changed before Complete Close committed.'), {
                statusCode: 409,
                code: 'PERIOD_STATE_CHANGED',
            });
        }
        const closed = await tx.periodClose.findUnique({ where: { id: current.id } });

        await tx.tenantSetting.upsert({
            where: { tenantId_key: { tenantId, key: 'allowOpeningBalance' } },
            update: {
                value: 'LOCKED',
                reason: `Auto-locked: Period ${year}/${month} closed at ${now.toISOString()}`,
            },
            create: {
                tenantId,
                key: 'allowOpeningBalance',
                value: 'LOCKED',
                reason: `Auto-locked: Period ${year}/${month} closed at ${now.toISOString()}`,
            },
        });

        await writeAuditLogTransactional({
            tx,
            tenantId,
            entityType: EntityType.PERIOD_CLOSE,
            entityId: current.id,
            action: 'CLOSE_PERIOD',
            changedBy: userId ?? null,
            note: `Period ${year}/${month} closed — snapshot v${version.versionNumber} (${lines.length} lines)`,
            beforeValue: { status: 'CLOSING' },
            afterValue: {
                status: 'CLOSED',
                snapshotVersionId: version.id,
                versionNumber: version.versionNumber,
            },
        });
        return {
            closed,
            version,
            lineCount: lines.length,
            totalInventoryValue: Number(
                lines.reduce((sum, line) => sum + Number(line.closingValue || 0), 0).toFixed(4),
            ),
            checklist,
        };
    });

    return {
        ...result.closed,
        snapshotVersion: result.version,
        snapshotCount: result.lineCount,
        totalInventoryValue: result.totalInventoryValue,
        monthEndChecklist: result.checklist,
    };
}

/** Manual close: OPEN/CLOSING → CLOSED when blockers=0 (Ch.6.3). */
const closePeriod = async (tenantId, { year, month, notes }, userId) => {
    if (!year) throw Object.assign(new Error('Year is required'), { status: 400 });
    const m = parseInt(month, 10);
    if (!m || m < 1 || m > 12) {
        throw Object.assign(new Error('Month (1–12) is required. Annual close is prohibited.'), {
            statusCode: 422,
            code: 'ANNUAL_CLOSE_PROHIBITED',
        });
    }
    return completeClose(tenantId, { year: parseInt(year, 10), month: m, notes }, userId);
};

const reopenPeriod = async (id, tenantId, userId, { reason } = {}) => {
    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!normalizedReason) {
        throw Object.assign(new Error('Reopen reason is required for audit traceability.'), {
            statusCode: 400,
            code: 'PERIOD_REOPEN_REASON_REQUIRED',
        });
    }

    return prisma.$transaction(async (tx) => {
        const initial = await tx.periodClose.findFirst({ where: { id, tenantId } });
        if (!initial) throw Object.assign(new Error('Period not found'), { status: 404 });
        const locked = await lockPeriodForClose(tx, tenantId, initial.year, initial.month);
        const period = await assertLatestClosedForReopen(tenantId, locked.id, tx);
        const reopened = await tx.periodClose.updateMany({
            where: { id, status: 'CLOSED' },
            data: { status: 'OPEN', closedAt: null, closedBy: null },
        });
        if (reopened.count !== 1) {
            throw Object.assign(new Error('Period state changed before reopen committed.'), {
                statusCode: 409,
                code: 'PERIOD_STATE_CHANGED',
            });
        }
        const result = await tx.periodClose.findUnique({ where: { id } });
        await writeAuditLogTransactional({
            tx,
            tenantId,
            entityType: EntityType.PERIOD_CLOSE,
            entityId: id,
            action: 'REOPEN_PERIOD',
            changedBy: userId,
            note: `Period ${period.year}/${period.month} reopened. Reason: ${normalizedReason}`,
            beforeValue: { status: 'CLOSED', closedAt: period.closedAt, closedBy: period.closedBy },
            afterValue: { status: 'OPEN', reason: normalizedReason, year: period.year, month: period.month },
        });
        return result;
    });
};

const getOpeningBalance = async (tenantId, year) => {
    const decClose = await prisma.periodClose.findFirst({
        where: { tenantId, status: 'CLOSED', year: year - 1, month: 12 },
        include: {
            snapshotVersions: {
                where: { status: 'CURRENT' },
                include: { lines: true },
                take: 1,
            },
        },
    });
    if (!decClose?.snapshotVersions?.[0]) return null;
    return decClose.snapshotVersions[0].lines;
};

const getSnapshotHistory = async (periodId, tenantId) => {
    const period = await prisma.periodClose.findFirst({
        where: { id: periodId, tenantId },
        include: {
            snapshotVersions: {
                orderBy: { versionNumber: 'asc' },
                select: {
                    id: true,
                    versionNumber: true,
                    status: true,
                    closedAt: true,
                    closedBy: true,
                    notes: true,
                    _count: { select: { lines: true } },
                },
            },
        },
    });
    if (!period) throw Object.assign(new Error('Period not found'), { status: 404 });
    return period.snapshotVersions;
};

module.exports = {
    getPeriods,
    getPeriodById,
    openPeriod,
    startClosing,
    cancelClosing,
    completeClose,
    closePeriod,
    reopenPeriod,
    getOpeningBalance,
    getSnapshotHistory,
};
