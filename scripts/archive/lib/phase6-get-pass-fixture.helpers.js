'use strict';

const getPassService = require('../../src/services/getPass.service');
const { actorFromMember, findActorWithRole } = require('./grn-timeline-fixture.helpers');

const FIXTURE_TAG = 'PHASE6_TIMELINE_FIXTURE';

const GM_FIXTURE_EMAIL = 'richard.evans@dxuat.com';
const SECURITY_FIXTURE_EMAIL = 'steven.clark@dxuat.com';

const PERMS = Object.freeze({
    STOREKEEPER: ['GET_PASS_CREATE', 'GET_PASS_VIEW', 'GET_PASS_APPROVE_RETURN'],
    DEPT_MANAGER: ['GET_PASS_CREATE', 'GET_PASS_VIEW', 'GET_PASS_APPROVE'],
    COST_CONTROL: ['GET_PASS_VIEW', 'GET_PASS_APPROVE'],
    FINANCE_MANAGER: ['GET_PASS_VIEW', 'GET_PASS_APPROVE'],
    GENERAL_MANAGER: ['GET_PASS_VIEW', 'GET_PASS_APPROVE_FINAL'],
    SECURITY: ['GET_PASS_VIEW', 'GET_PASS_APPROVE_FINAL', 'GET_PASS_APPROVE_EXIT', 'GET_PASS_APPROVE_RETURN'],
});

async function ensureTenantMember(prisma, tenantId, email, roleCode) {
    const user = await prisma.user.findFirst({ where: { email, isActive: true } });
    if (!user) {
        throw new Error(`Fixture user missing: ${email}`);
    }
    const role = await prisma.role.findFirst({ where: { code: roleCode, isActive: true } });
    if (!role) {
        throw new Error(`Role missing: ${roleCode}`);
    }
    const existing = await prisma.tenantMember.findFirst({ where: { tenantId, userId: user.id } });
    if (existing) {
        if (existing.roleId !== role.id || !existing.isActive) {
            await prisma.tenantMember.update({
                where: { id: existing.id },
                data: { roleId: role.id, isActive: true },
            });
        }
        return prisma.tenantMember.findFirst({
            where: { id: existing.id },
            include: { user: true, role: true },
        });
    }
    const created = await prisma.tenantMember.create({
        data: { tenantId, userId: user.id, roleId: role.id, isActive: true },
        include: { user: true, role: true },
    });
    return created;
}

async function findDistinctStockLines(prisma, tenantId, count) {
    const rows = await prisma.stockBalance.findMany({
        where: { tenantId, qtyOnHand: { gte: 1 } },
        orderBy: { qtyOnHand: 'desc' },
        include: { item: true, location: true },
        take: count * 3,
    });
    const lines = [];
    const used = new Set();
    for (const row of rows) {
        const key = `${row.itemId}:${row.locationId}`;
        if (used.has(key)) continue;
        const available = Number(row.qtyOnHand) - Number(row.qtyBlocked || 0);
        if (available < 1) continue;
        used.add(key);
        lines.push({
            itemId: row.itemId,
            locationId: row.locationId,
            qty: 1,
            conditionOut: 'GOOD',
            itemName: row.item?.name,
        });
        if (lines.length >= count) break;
    }
    return lines;
}

async function resolvePhase6Actors(prisma, tenantId) {
    await ensureTenantMember(prisma, tenantId, GM_FIXTURE_EMAIL, 'GENERAL_MANAGER');
    await ensureTenantMember(prisma, tenantId, SECURITY_FIXTURE_EMAIL, 'SECURITY');

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
    const gmMember = await prisma.tenantMember.findFirst({
        where: { tenantId, isActive: true, role: { code: 'GENERAL_MANAGER' }, user: { isActive: true } },
        include: { user: true, role: true },
    });
    const securityMember = await prisma.tenantMember.findFirst({
        where: { tenantId, isActive: true, role: { code: 'SECURITY' }, user: { isActive: true } },
        include: { user: true, role: true },
    });

    const creator = actorFromMember(storeMember, PERMS.STOREKEEPER);
    const deptUser = actorFromMember(deptMember, PERMS.DEPT_MANAGER);
    const costUser = actorFromMember(costMember, PERMS.COST_CONTROL);
    const financeUser = actorFromMember(financeMember, PERMS.FINANCE_MANAGER);
    const gmUser = actorFromMember(gmMember, PERMS.GENERAL_MANAGER);
    const securityUser = actorFromMember(securityMember, PERMS.SECURITY);

    if (!creator || !deptUser || !costUser || !financeUser || !gmUser || !securityUser) {
        return null;
    }
    return { creator, deptUser, costUser, financeUser, gmUser, securityUser };
}

function actorForStatus(status, actors) {
    switch (status) {
        case 'PENDING_DEPT':
            return actors.deptUser;
        case 'PENDING_COST_CONTROL':
            return actors.costUser;
        case 'PENDING_FINANCE':
            return actors.financeUser;
        case 'PENDING_GM':
            return actors.gmUser;
        case 'PENDING_SECURITY':
            return actors.securityUser;
        default:
            return null;
    }
}

async function refreshPass(id, tenantId, user) {
    return getPassService.getGetPassById(id, tenantId, user);
}

async function approveIfPending(id, tenantId, actors, expectedStatus) {
    let current = await refreshPass(id, tenantId, actors.creator);
    if (current.status !== expectedStatus) {
        return current;
    }
    const actor = actorForStatus(expectedStatus, actors);
    if (!actor) {
        throw new Error(`No actor for status ${expectedStatus}`);
    }
    return getPassService.approveGetPass(id, tenantId, actor, current.concurrencyVersion);
}

async function approveThrough(id, tenantId, actors, stopBeforeStatus) {
    const order = [
        'PENDING_DEPT',
        'PENDING_COST_CONTROL',
        'PENDING_FINANCE',
        'PENDING_GM',
        'PENDING_SECURITY',
    ];
    let current = await refreshPass(id, tenantId, actors.creator);
    for (const status of order) {
        if (status === stopBeforeStatus) break;
        if (current.status === status) {
            current = await approveIfPending(id, tenantId, actors, status);
        }
    }
    return current;
}

async function buildCreatePayload(prisma, tenantId, scenarioKey, stockLine) {
    const department = await prisma.department.findFirst({ where: { tenantId } });
    const returnDate = new Date();
    returnDate.setDate(returnDate.getDate() + 7);
    return {
        transferType: 'TEMPORARY',
        departmentId: department?.id ?? null,
        borrowingEntity: `${FIXTURE_TAG} ${scenarioKey}`,
        reason: `${FIXTURE_TAG} ${scenarioKey}`,
        notes: FIXTURE_TAG,
        expectedReturnDate: returnDate.toISOString(),
        returnDate: returnDate.toISOString(),
        lines: [
            {
                itemId: stockLine.itemId,
                locationId: stockLine.locationId,
                qty: stockLine.qty,
                conditionOut: stockLine.conditionOut,
            },
        ],
    };
}

async function createSubmittedPass(prisma, tenantId, actors, stockLine, scenarioKey) {
    const payload = await buildCreatePayload(prisma, tenantId, scenarioKey, stockLine);
    const created = await getPassService.createGetPass(tenantId, payload, actors.creator.id);
    const submitted = await getPassService.submitGetPass(
        created.id,
        tenantId,
        actors.creator,
        created.concurrencyVersion,
    );
    return submitted;
}

async function createActiveWorkflow(prisma, tenantId, actors, stockLine) {
    const submitted = await createSubmittedPass(prisma, tenantId, actors, stockLine, 'active_workflow');
    const current = await approveIfPending(submitted.id, tenantId, actors, 'PENDING_DEPT');
    return {
        id: current.id,
        passNo: current.passNo,
        status: current.status,
        scenario: 'active_workflow',
    };
}

async function createPendingSecurity(prisma, tenantId, actors, stockLine) {
    const submitted = await createSubmittedPass(prisma, tenantId, actors, stockLine, 'pending_security');
    const current = await approveThrough(submitted.id, tenantId, actors, 'PENDING_SECURITY');
    return {
        id: current.id,
        passNo: current.passNo,
        status: current.status,
        scenario: 'pending_security',
    };
}

async function createSecurityOut(prisma, tenantId, actors, stockLine) {
    const submitted = await createSubmittedPass(prisma, tenantId, actors, stockLine, 'security_out');
    let current = await approveThrough(submitted.id, tenantId, actors, 'PENDING_SECURITY');
    if (current.status === 'PENDING_SECURITY') {
        current = await approveIfPending(current.id, tenantId, actors, 'PENDING_SECURITY');
    }
    return {
        id: current.id,
        passNo: current.passNo,
        status: current.status,
        scenario: 'security_out',
    };
}

async function createReturned(prisma, tenantId, actors, stockLine) {
    const outDoc = await createSecurityOut(prisma, tenantId, actors, stockLine);
    let current = await refreshPass(outDoc.id, tenantId, actors.creator);
    if (current.status !== 'OUT') {
        throw new Error(`Expected OUT before return, got ${current.status}`);
    }
    const linesPayload = current.lines.map((line) => ({
        lineId: line.id,
        qtyGood: Number(line.qty),
    }));
    current = await getPassService.processReturns(
        current.id,
        tenantId,
        actors.creator.id,
        linesPayload,
        `${FIXTURE_TAG} full return`,
    );
    if (current.status !== 'RETURNED') {
        throw new Error(`Expected RETURNED after processReturns, got ${current.status}`);
    }
    return {
        id: current.id,
        passNo: current.passNo,
        status: current.status,
        scenario: 'returned',
    };
}

async function createRejected(prisma, tenantId, actors, stockLine) {
    const submitted = await createSubmittedPass(prisma, tenantId, actors, stockLine, 'rejected');
    let current = await approveIfPending(submitted.id, tenantId, actors, 'PENDING_DEPT');
    if (current.status !== 'PENDING_COST_CONTROL') {
        throw new Error(`Expected PENDING_COST_CONTROL before reject, got ${current.status}`);
    }
    current = await getPassService.rejectGetPass(
        current.id,
        tenantId,
        actors.costUser,
        `${FIXTURE_TAG} budget not approved for timeline test`,
        current.concurrencyVersion,
    );
    return {
        id: current.id,
        passNo: current.passNo,
        status: current.status,
        scenario: 'rejected',
    };
}

async function assertApproveAfterRejectBlocked(id, tenantId, actors) {
    const gp = await refreshPass(id, tenantId, actors.costUser);
    if (gp.status !== 'REJECTED') {
        throw new Error(`Expected REJECTED, got ${gp.status}`);
    }
    let blocked = false;
    try {
        await getPassService.approveGetPass(id, tenantId, actors.costUser, gp.concurrencyVersion);
    } catch (err) {
        blocked = true;
    }
    return blocked;
}

async function findExistingFixture(prisma, tenantId, scenario) {
    return prisma.getPass.findFirst({
        where: {
            tenantId,
            notes: { contains: FIXTURE_TAG },
            reason: { contains: scenario },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, passNo: true, status: true },
    });
}

module.exports = {
    FIXTURE_TAG,
    GM_FIXTURE_EMAIL,
    SECURITY_FIXTURE_EMAIL,
    ensureTenantMember,
    findDistinctStockLines,
    resolvePhase6Actors,
    createActiveWorkflow,
    createPendingSecurity,
    createSecurityOut,
    createReturned,
    createRejected,
    assertApproveAfterRejectBlocked,
    findExistingFixture,
    approveIfPending,
    refreshPass,
};
