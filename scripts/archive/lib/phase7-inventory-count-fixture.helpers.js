'use strict';

const inventoryCount = require('../../src/services/inventoryCount.service');
const { actorFromMember, findActorWithRole } = require('./grn-timeline-fixture.helpers');
const { ensureTenantMember, GM_FIXTURE_EMAIL } = require('./phase6-get-pass-fixture.helpers');

const FIXTURE_TAG = 'PHASE7_TIMELINE_FIXTURE';

const PERMS = Object.freeze({
    STOREKEEPER: [
        'STOCK_COUNT_CREATE',
        'STOCK_COUNT_EXECUTE',
        'STOCK_COUNT_CANCEL',
        'STOCK_COUNT_RECOUNT',
        'STOCK_COUNT_SUBMIT',
        'STOCK_COUNT_VIEW',
    ],
    FINANCE_MANAGER: ['STOCK_COUNT_VIEW', 'APPROVE_INVENTORY_COUNT'],
    GENERAL_MANAGER: ['STOCK_COUNT_VIEW', 'APPROVE_INVENTORY_COUNT'],
});

async function resolvePhase7Actors(prisma, tenantId) {
    await ensureTenantMember(prisma, tenantId, GM_FIXTURE_EMAIL, 'GENERAL_MANAGER');

    const storeMember = await prisma.tenantMember.findFirst({
        where: { tenantId, isActive: true, role: { code: 'STOREKEEPER' }, user: { isActive: true } },
        include: { user: true, role: true },
    });
    const financeMember = await prisma.tenantMember.findFirst({
        where: { tenantId, isActive: true, role: { code: 'FINANCE_MANAGER' }, user: { isActive: true } },
        include: { user: true, role: true },
    });
    const gmMember = await prisma.tenantMember.findFirst({
        where: { tenantId, isActive: true, role: { code: 'GENERAL_MANAGER' }, user: { isActive: true } },
        include: { user: true, role: true },
    });

    const operator = actorFromMember(storeMember, PERMS.STOREKEEPER);
    const financeUser = actorFromMember(financeMember, PERMS.FINANCE_MANAGER);
    const gmUser = actorFromMember(gmMember, PERMS.GENERAL_MANAGER);

    if (!operator || !financeUser || !gmUser) return null;
    return { operator, financeUser, gmUser };
}

async function resolveCountContext(prisma, tenantId) {
    const loc = await prisma.location.findFirst({
        where: {
            tenantId,
            isActive: true,
            departmentId: { not: null },
            stockBalances: { some: { qtyOnHand: { gt: 0 } } },
        },
        include: { stockBalances: { where: { qtyOnHand: { gt: 0 } }, take: 1 } },
    });
    if (!loc?.departmentId) return null;
    const dept = await prisma.department.findFirst({ where: { id: loc.departmentId, tenantId } });
    if (!dept) return null;
    return { departmentId: dept.id, locationIds: [loc.id], anchorBalance: loc.stockBalances[0] };
}

async function fillAllCells(prisma, sessionId, roundNo, userId, countedForCell) {
    const cells = await prisma.stockCountLocationQty.findMany({ where: { sessionId, roundNo } });
    for (const cell of cells) {
        const countedQty =
            typeof countedForCell === 'function'
                ? countedForCell(cell)
                : countedForCell ?? Number(cell.bookQty);
        await prisma.stockCountLocationQty.update({
            where: { id: cell.id },
            data: {
                countedQty,
                varianceQty: countedQty - Number(cell.bookQty),
                countedBy: userId,
                countedAt: new Date(),
            },
        });
    }
}

async function createBaseSession(prisma, tenantId, actors, ctx, scenarioKey, blindMode = false) {
    const created = await inventoryCount.createSession(tenantId, actors.operator.id, {
        departmentId: ctx.departmentId,
        locationIds: ctx.locationIds,
        blindMode,
        notes: `${FIXTURE_TAG} ${scenarioKey}`,
    });
    await inventoryCount.startSession(tenantId, actors.operator.id, created.id, {});
    return created;
}

async function submitCountsToReveal(prisma, tenantId, actors, sessionId, countedQtyResolver) {
    const session = await prisma.stockCountSession.findFirst({ where: { id: sessionId } });
    const cells = await prisma.stockCountLocationQty.findMany({
        where: { sessionId, roundNo: session.currentRound },
    });
    const target = cells[0];
    if (!target) throw new Error('No count cells for session');

    let countedQty;
    if (typeof countedQtyResolver === 'function') {
        countedQty = await countedQtyResolver(target, prisma, tenantId);
    } else {
        const stock = await prisma.stockBalance.findUnique({
            where: {
                tenantId_itemId_locationId: {
                    tenantId,
                    itemId: target.itemId,
                    locationId: target.locationId,
                },
            },
        });
        countedQty = countedQtyResolver ?? Number(stock?.qtyOnHand ?? target.bookQty) + 3;
    }

    await fillAllCells(prisma, sessionId, session.currentRound, actors.operator.id, (cell) =>
        cell.itemId === target.itemId && cell.locationId === target.locationId
            ? countedQty
            : Number(cell.bookQty),
    );
    return inventoryCount.submitCounts(tenantId, actors.operator.id, sessionId, {});
}

async function createActiveApproval(prisma, tenantId, actors, ctx) {
    const created = await createBaseSession(prisma, tenantId, actors, ctx, 'active_approval');
    await submitCountsToReveal(prisma, tenantId, actors, created.id);
    const pending = await inventoryCount.submitForApproval(tenantId, actors.operator.id, created.id, {
        managementNotes: FIXTURE_TAG,
    });
    return { id: pending.id, sessionNo: created.sessionNo, status: pending.status, scenario: 'active_approval' };
}

async function createPosted(prisma, tenantId, actors, ctx) {
    const created = await createBaseSession(prisma, tenantId, actors, ctx, 'posted');
    await submitCountsToReveal(prisma, tenantId, actors, created.id);
    await inventoryCount.submitForApproval(tenantId, actors.operator.id, created.id, { managementNotes: FIXTURE_TAG });
    await inventoryCount.approve(tenantId, actors.financeUser.id, actors.financeUser, created.id, {
        comment: 'Phase7 finance OK',
    });
    const posted = await inventoryCount.approve(tenantId, actors.gmUser.id, actors.gmUser, created.id, {
        comment: 'Phase7 GM post',
    });
    return {
        id: posted.id,
        sessionNo: created.sessionNo,
        status: posted.status,
        scenario: 'posted',
        postingSummary: posted.postingSummary,
    };
}

async function createRejected(prisma, tenantId, actors, ctx) {
    const created = await createBaseSession(prisma, tenantId, actors, ctx, 'rejected');
    await submitCountsToReveal(prisma, tenantId, actors, created.id);
    await inventoryCount.submitForApproval(tenantId, actors.operator.id, created.id, { managementNotes: FIXTURE_TAG });
    const rejected = await inventoryCount.reject(tenantId, actors.financeUser.id, actors.financeUser, created.id, {
        reason: `${FIXTURE_TAG} variance exceeds tolerance`,
    });
    return { id: rejected.id, sessionNo: created.sessionNo, status: rejected.status, scenario: 'rejected' };
}

async function createRecountRound2(prisma, tenantId, actors, ctx) {
    const created = await createBaseSession(prisma, tenantId, actors, ctx, 'recount_round2', false);
    const cell = await prisma.stockCountLocationQty.findFirst({
        where: { sessionId: created.id, roundNo: 1 },
    });
    const stock = await prisma.stockBalance.findUnique({
        where: {
            tenantId_itemId_locationId: {
                tenantId,
                itemId: cell.itemId,
                locationId: cell.locationId,
            },
        },
    });
    const liveQty = Number(stock?.qtyOnHand ?? cell.bookQty);
    await fillAllCells(prisma, created.id, 1, actors.operator.id, (c) =>
        c.id === cell.id ? liveQty : Number(c.bookQty),
    );
    await inventoryCount.submitCounts(tenantId, actors.operator.id, created.id, {});
    await inventoryCount.startRecount(tenantId, actors.operator.id, created.id, {
        reason: `${FIXTURE_TAG} recount requested`,
    });
    const round2Qty = liveQty + 5;
    await fillAllCells(prisma, created.id, 2, actors.operator.id, (c) =>
        c.itemId === cell.itemId && c.locationId === cell.locationId ? round2Qty : Number(c.bookQty),
    );
    await inventoryCount.submitCounts(tenantId, actors.operator.id, created.id, {});
    await inventoryCount.submitForApproval(tenantId, actors.operator.id, created.id, { managementNotes: FIXTURE_TAG });
    await inventoryCount.approve(tenantId, actors.financeUser.id, actors.financeUser, created.id, {
        comment: 'Phase7 finance after recount',
    });
    const posted = await inventoryCount.approve(tenantId, actors.gmUser.id, actors.gmUser, created.id, {
        comment: 'Phase7 GM post after recount',
    });
    return {
        id: posted.id,
        sessionNo: created.sessionNo,
        status: posted.status,
        scenario: 'recount_round2',
        round2Qty,
    };
}

async function verifyPostingReconciliation(prisma, tenantId, sessionId) {
    const session = await prisma.stockCountSession.findFirst({
        where: { id: sessionId, tenantId },
        include: { scopedLocations: true },
    });
    if (!session || session.status !== 'POSTED') {
        throw new Error('Session must be POSTED for reconciliation');
    }

    const ledgerRows = await prisma.inventoryLedger.findMany({
        where: {
            tenantId,
            referenceType: 'COUNT_SESSION',
            referenceId: sessionId,
            movementType: 'COUNT_ADJUSTMENT',
        },
    });
    if (!ledgerRows.length) {
        throw new Error('No COUNT_ADJUSTMENT ledger rows for posted session');
    }

    const cells = await prisma.stockCountLocationQty.findMany({ where: { sessionId } });
    const latest = new Map();
    for (const c of cells) {
        const key = `${c.itemId}:${c.locationId}`;
        const prev = latest.get(key);
        if (!prev || c.roundNo > prev.roundNo) latest.set(key, c);
    }

    const mismatches = [];
    for (const row of ledgerRows) {
        const stock = await prisma.stockBalance.findUnique({
            where: {
                tenantId_itemId_locationId: {
                    tenantId,
                    itemId: row.itemId,
                    locationId: row.locationId,
                },
            },
        });
        const balanceAfter = Number(stock?.qtyOnHand ?? 0);
        const ledgerAfter = Number(row.balanceAfter ?? 0);
        if (Math.abs(balanceAfter - ledgerAfter) > 1e-6) {
            mismatches.push({ itemId: row.itemId, locationId: row.locationId, balanceAfter, ledgerAfter });
        }
        const cell = latest.get(`${row.itemId}:${row.locationId}`);
        if (cell && Math.abs(Number(cell.countedQty) - balanceAfter) > 1e-6) {
            mismatches.push({
                itemId: row.itemId,
                locationId: row.locationId,
                countedQty: Number(cell.countedQty),
                balanceAfter,
            });
        }
    }

    return { ledgerCount: ledgerRows.length, mismatches, ledgerRows };
}

async function findExistingFixture(prisma, tenantId, scenario) {
    return prisma.stockCountSession.findFirst({
        where: {
            tenantId,
            AND: [{ notes: { contains: FIXTURE_TAG } }, { notes: { contains: scenario } }],
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, sessionNo: true, status: true },
    });
}

module.exports = {
    FIXTURE_TAG,
    resolvePhase7Actors,
    resolveCountContext,
    createActiveApproval,
    createPosted,
    createRejected,
    createRecountRound2,
    verifyPostingReconciliation,
    findExistingFixture,
};
