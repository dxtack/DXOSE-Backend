'use strict';

const breakageService = require('../../src/services/breakage.service');
const lostItemsService = require('../../src/services/lostItems.service');
const { findActorWithRole, actorFromMember } = require('./grn-timeline-fixture.helpers');

const FIXTURE_TAG = 'PHASE5_TIMELINE_FIXTURE';

async function findStockLine(prisma, tenantId, minQty = 2) {
    const row = await prisma.stockBalance.findFirst({
        where: { tenantId, qtyOnHand: { gte: minQty } },
        orderBy: { qtyOnHand: 'desc' },
        include: { item: true, location: true },
    });
    if (!row) return null;
    return {
        itemId: row.itemId,
        locationId: row.locationId,
        qty: 1,
        unitCost: Number(row.item?.defaultCost || 1),
        totalValue: Number(row.item?.defaultCost || 1),
        itemName: row.item?.name,
    };
}

async function resolvePhase5Actors(prisma, tenantId) {
    const storeMember = await prisma.tenantMember.findFirst({
        where: { tenantId, isActive: true, role: { code: 'STOREKEEPER' }, user: { isActive: true } },
        include: { user: true, role: true },
    });
    const deptMember = await prisma.tenantMember.findFirst({
        where: { tenantId, isActive: true, role: { code: 'DEPT_MANAGER' }, user: { isActive: true } },
        include: { user: true, role: true },
    });
    const costMember = await prisma.tenantMember.findFirst({
        where: { tenantId, isActive: true, role: { code: 'COST_CONTROL' }, user: { isActive: true } },
        include: { user: true, role: true },
    });
    const financeMember = await prisma.tenantMember.findFirst({
        where: { tenantId, isActive: true, role: { code: 'FINANCE_MANAGER' }, user: { isActive: true } },
        include: { user: true, role: true },
    });
    const creator =
        actorFromMember(storeMember, ['BREAKAGE_MANAGE', 'LOST_MANAGE']) ||
        actorFromMember(deptMember, ['BREAKAGE_MANAGE', 'LOST_MANAGE']) ||
        (await findActorWithRole(prisma, tenantId, 'ORG_MANAGER'));
    const costUser = actorFromMember(costMember, ['APPROVE_BREAKAGE', 'APPROVE_LOST', 'BREAKAGE_MANAGE', 'LOST_MANAGE']);
    const financeUser = actorFromMember(financeMember, [
        'APPROVE_BREAKAGE',
        'APPROVE_LOST',
        'BREAKAGE_MANAGE',
        'LOST_MANAGE',
    ]);
    const deptUser = actorFromMember(deptMember, ['APPROVE_BREAKAGE', 'APPROVE_LOST']);
    if (!creator || !costUser || !financeUser) {
        return null;
    }
    return { creator, deptUser, costUser, financeUser };
}

function linePayload(stockLine) {
    return {
        itemId: stockLine.itemId,
        locationId: stockLine.locationId,
        qty: stockLine.qty,
        unitCost: stockLine.unitCost,
        totalValue: stockLine.totalValue,
        notes: FIXTURE_TAG,
    };
}

async function createBreakageHappyPath(prisma, tenantId, actors, stockLine) {
    const doc = await breakageService.createBreakage(
        {
            reason: `${FIXTURE_TAG} happy path`,
            suggestedAction: 'HOTEL',
            lines: [linePayload(stockLine)],
            notes: FIXTURE_TAG,
        },
        tenantId,
        actors.creator,
    );
    await breakageService.submitBreakage(doc.id, tenantId, actors.creator, doc.concurrencyVersion);
    let current = await breakageService.getBreakageById(doc.id, tenantId, actors.costUser);
    current = await breakageService.processApprovalStep(
        doc.id,
        tenantId,
        actors.costUser,
        'APPROVE',
        'Phase5 cost approval OK',
        null,
        current.concurrencyVersion,
    );
    current = await breakageService.processApprovalStep(
        doc.id,
        tenantId,
        actors.financeUser,
        'APPROVE',
        'Phase5 finance approval OK',
        null,
        current.concurrencyVersion,
    );
    return { id: doc.id, documentNo: doc.documentNo, status: current.status };
}

async function createBreakageReject(prisma, tenantId, actors, stockLine) {
    const doc = await breakageService.createBreakage(
        {
            reason: `${FIXTURE_TAG} reject`,
            suggestedAction: 'HOTEL',
            lines: [linePayload(stockLine)],
            notes: FIXTURE_TAG,
        },
        tenantId,
        actors.creator,
    );
    await breakageService.submitBreakage(doc.id, tenantId, actors.creator, doc.concurrencyVersion);
    let current = await breakageService.getBreakageById(doc.id, tenantId, actors.costUser);
    await breakageService.processApprovalStep(
        doc.id,
        tenantId,
        actors.costUser,
        'REJECT',
        'Phase5 reject note',
        null,
        current.concurrencyVersion,
    );
    return { id: doc.id, documentNo: doc.documentNo, status: 'REJECTED' };
}

async function createLostHappyPath(prisma, tenantId, actors, stockLine) {
    const doc = await lostItemsService.createLost(
        tenantId,
        actors.creator,
        {
            reason: `${FIXTURE_TAG} happy path`,
            suggestedAction: 'HOTEL',
            lines: [linePayload(stockLine)],
            notes: FIXTURE_TAG,
        },
    );
    let current = await lostItemsService.getLostById(doc.id, tenantId, actors.costUser);
    current = await lostItemsService.processLostApprovalStep(
        doc.id,
        tenantId,
        actors.costUser,
        'APPROVE',
        'Phase5 cost approval OK',
        null,
    );
    current = await lostItemsService.processLostApprovalStep(
        doc.id,
        tenantId,
        actors.financeUser,
        'APPROVE',
        'Phase5 finance approval OK',
        null,
    );
    return { id: doc.id, documentNo: doc.documentNo, status: current.status };
}

async function createLostReject(prisma, tenantId, actors, stockLine) {
    const doc = await lostItemsService.createLost(
        tenantId,
        actors.creator,
        {
            reason: `${FIXTURE_TAG} reject`,
            suggestedAction: 'HOTEL',
            lines: [linePayload(stockLine)],
            notes: FIXTURE_TAG,
        },
    );
    let current = await lostItemsService.getLostById(doc.id, tenantId, actors.costUser);
    await lostItemsService.processLostApprovalStep(
        doc.id,
        tenantId,
        actors.costUser,
        'REJECT',
        'Phase5 reject note',
        null,
    );
    return { id: doc.id, documentNo: doc.documentNo, status: 'REJECTED' };
}

async function findDistinctStockLines(prisma, tenantId, count) {
    const rows = await prisma.stockBalance.findMany({
        where: { tenantId, qtyOnHand: { gte: count } },
        orderBy: { qtyOnHand: 'desc' },
        take: 5,
        include: { item: true },
    });
    if (rows.length > 0) {
        const primary = rows[0];
        return Array.from({ length: count }, () => ({
            itemId: primary.itemId,
            locationId: primary.locationId,
            qty: 1,
            unitCost: Number(primary.item?.defaultCost || 1),
            totalValue: Number(primary.item?.defaultCost || 1),
            itemName: primary.item?.name,
        }));
    }

    const fallback = await findStockLine(prisma, tenantId, 1);
    return fallback ? Array.from({ length: count }, () => ({ ...fallback })) : [];
}

module.exports = {
    FIXTURE_TAG,
    resolvePhase5Actors,
    findStockLine,
    findDistinctStockLines,
    createBreakageHappyPath,
    createBreakageReject,
    createLostHappyPath,
    createLostReject,
};
