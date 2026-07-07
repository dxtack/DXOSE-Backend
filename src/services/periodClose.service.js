'use strict';

const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');
const prisma = new PrismaClient();
const {
    assertSequentialCloseAllowed,
    assertLatestClosedForReopen,
    getPeriodRegistryRow,
} = require('./periodGuard.service');
const { assertCloseBlockersZero, runMonthEndCloseChecklist } = require('./periodCloseGovernance.service');
const { buildClosingSnapshotLines } = require('../platform/periodLedgerSnapshot.service');
const { logAction, EntityType } = require('./auditTrail.service');

async function ensurePeriodRecord(tenantId, year, month) {
    if (!month || month < 1 || month > 12) {
        throw Object.assign(new Error('Month must be 1–12. Annual close (month=null) is prohibited.'), {
            statusCode: 422,
            code: 'ANNUAL_CLOSE_PROHIBITED',
        });
    }
    let row = await getPeriodRegistryRow(tenantId, year, month);
    if (!row) {
        row = await prisma.periodClose.create({
            data: { tenantId, year, month, status: 'OPEN' },
        });
    }
    return row;
}

const getPeriods = async (tenantId) =>
    prisma.periodClose.findMany({
        where: { tenantId },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        include: {
            snapshotVersions: {
                orderBy: { versionNumber: 'desc' },
                take: 3,
                select: {
                    id: true,
                    versionNumber: true,
                    status: true,
                    closedAt: true,
                    closedBy: true,
                },
            },
        },
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
    const period = await ensurePeriodRecord(tenantId, year, month);
    if (period.status === 'CLOSED') {
        throw Object.assign(new Error(`Period ${year}/${month} is already closed.`), { status: 400 });
    }
    await assertSequentialCloseAllowed(tenantId, year, month);

    const updated =
        period.status === 'CLOSING'
            ? period
            : await prisma.periodClose.update({
                  where: { id: period.id },
                  data: { status: 'CLOSING' },
              });

    const checklist = await runMonthEndCloseChecklist(tenantId, { year, month });

    if (userId) {
        await logAction({
            tenantId,
            entityType: EntityType.PERIOD_CLOSE,
            entityId: updated.id,
            action: 'START_CLOSE',
            changedBy: userId,
            note: `Period ${year}/${month} entered CLOSING`,
        });
    }

    return { ...updated, monthEndChecklist: checklist };
}

async function cancelClosing(tenantId, { year, month }, userId) {
    const period = await getPeriodRegistryRow(tenantId, year, month);
    if (!period || period.status !== 'CLOSING') {
        throw Object.assign(new Error('Period is not in CLOSING state.'), { status: 422, code: 'PERIOD_NOT_CLOSING' });
    }
    const updated = await prisma.periodClose.update({
        where: { id: period.id },
        data: { status: 'OPEN' },
    });
    if (userId) {
        await logAction({
            tenantId,
            entityType: EntityType.PERIOD_CLOSE,
            entityId: period.id,
            action: 'CANCEL_CLOSE',
            changedBy: userId,
            note: `Period ${year}/${month} returned to OPEN`,
        });
    }
    return updated;
}

async function completeClose(tenantId, { year, month, notes }, userId) {
    const period = await ensurePeriodRecord(tenantId, year, month);
    if (period.status === 'CLOSED') {
        throw Object.assign(new Error(`Period ${year}/${month} is already closed.`), { status: 400 });
    }

    if (period.status !== 'CLOSING') {
        await startClosing(tenantId, { year, month }, userId);
    }

    const checklist = await assertCloseBlockersZero(tenantId, { year, month });
    await assertSequentialCloseAllowed(tenantId, year, month);

    const lines = await buildClosingSnapshotLines(tenantId, year, month);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
        const current = await tx.periodClose.findUnique({ where: { id: period.id } });
        const priorVersions = await tx.periodSnapshotVersion.findMany({
            where: { periodCloseId: period.id },
        });
        const nextVersion = priorVersions.length ? Math.max(...priorVersions.map((v) => v.versionNumber)) + 1 : 1;

        if (priorVersions.some((v) => v.status === 'CURRENT')) {
            await tx.periodSnapshotVersion.updateMany({
                where: { periodCloseId: period.id, status: 'CURRENT' },
                data: { status: 'SUPERSEDED' },
            });
        }

        const version = await tx.periodSnapshotVersion.create({
            data: {
                id: uuidv4(),
                periodCloseId: period.id,
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

        const closed = await tx.periodClose.update({
            where: { id: period.id },
            data: {
                status: 'CLOSED',
                closedAt: now,
                closedBy: userId,
                notes: notes ?? current.notes,
            },
        });

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

        return { closed, version, lineCount: lines.length };
    });

    if (userId) {
        await logAction({
            tenantId,
            entityType: EntityType.PERIOD_CLOSE,
            entityId: period.id,
            action: 'CLOSE_PERIOD',
            changedBy: userId,
            note: `Period ${year}/${month} closed — snapshot v${result.version.versionNumber} (${result.lineCount} lines)`,
            afterValue: { snapshotVersionId: result.version.id, versionNumber: result.version.versionNumber },
        });
    }

    return {
        ...result.closed,
        snapshotVersion: result.version,
        snapshotCount: result.lineCount,
        monthEndChecklist: checklist,
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
    const period = await assertLatestClosedForReopen(tenantId, id);

    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!normalizedReason) {
        throw Object.assign(new Error('Reopen reason is required for audit traceability.'), {
            statusCode: 400,
            code: 'PERIOD_REOPEN_REASON_REQUIRED',
        });
    }

    const result = await prisma.periodClose.update({
        where: { id },
        data: { status: 'OPEN', closedAt: null, closedBy: null },
    });

    await logAction({
        tenantId,
        entityType: EntityType.PERIOD_CLOSE,
        entityId: id,
        action: 'REOPEN_PERIOD',
        changedBy: userId,
        note: `Period ${period.year}/${period.month} reopened. Reason: ${normalizedReason}`,
        afterValue: { reason: normalizedReason, year: period.year, month: period.month },
    });

    return result;
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
    ensurePeriodRecord,
    startClosing,
    cancelClosing,
    completeClose,
    closePeriod,
    reopenPeriod,
    getOpeningBalance,
    getSnapshotHistory,
};
