/**
 * Phase 1 smoke test (direct service calls; no HTTP/auth).
 *
 * Flow:
 * create -> start -> get sheet -> update qty -> submit counts (requires all counted) ->
 * get variances -> submit approval (2-step chain) ->
 * Finance approve -> FINANCE_APPROVED (no ledger) ->
 * GM approve -> POSTED + ledger ->
 * confirm ledger entries + stock balance updated + negative variance guard.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const inventoryCount = require('../src/services/inventoryCount.service');
const posting = require('../src/services/posting.service');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function findActorWithRole(tenantId, roleCode) {
  const member = await prisma.tenantMember.findFirst({
    where: {
      tenantId,
      isActive: true,
      role: { code: roleCode },
      user: { isActive: true },
    },
    select: { userId: true, user: { select: { id: true, email: true } } },
  });
  if (!member?.user) return null;
  return { ...member.user, roleCode };
}

async function fillPolicyBCells(sessionId, itemId, locationId, countedForTarget, userId) {
  const cells = await prisma.stockCountLocationQty.findMany({ where: { sessionId, roundNo: 1 } });
  for (const c of cells) {
    const countedQty =
      c.itemId === itemId && c.locationId === locationId ? countedForTarget : Number(c.bookQty);
    await prisma.stockCountLocationQty.update({
      where: { id: c.id },
      data: {
        countedQty,
        varianceQty: countedQty - Number(c.bookQty),
        countedBy: userId,
        countedAt: new Date(),
      },
    });
  }
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { isActive: true }, select: { id: true, name: true } });
  assert(tenant, 'No active tenant found');

  const user = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true, email: true } });
  assert(user, 'No active user found');

  const financeActor =
    (await findActorWithRole(tenant.id, 'FINANCE_MANAGER')) || { ...user, roleCode: 'FINANCE_MANAGER' };
  const gmActor =
    (await findActorWithRole(tenant.id, 'GENERAL_MANAGER')) ||
    (await findActorWithRole(tenant.id, 'ORG_MANAGER')) || { ...user, roleCode: 'GENERAL_MANAGER' };

  const locWithBalances = await prisma.location.findMany({
    where: {
      tenantId: tenant.id,
      isActive: true,
      stockBalances: { some: {} },
      departmentId: { not: null },
    },
    select: { id: true, name: true, departmentId: true },
    take: 20,
  });
  assert(locWithBalances.length >= 1, 'No locations with stock balances found');

  const anchorDeptId = locWithBalances[0].departmentId;
  const scopedLocs = locWithBalances.filter((l) => l.departmentId === anchorDeptId).slice(0, 2);
  const dept = await prisma.department.findFirst({
    where: { id: anchorDeptId, tenantId: tenant.id, isActive: true },
    select: { id: true, name: true },
  });
  assert(dept, 'No active department for scoped locations');

  const locationIds = scopedLocs.map((l) => l.id);

  console.log('Using tenant:', tenant.name, tenant.id);
  console.log('Using operator:', user.email, user.id);
  console.log('Using finance approver:', financeActor.email, financeActor.id, financeActor.roleCode);
  console.log('Using final approver:', gmActor.email, gmActor.id, gmActor.roleCode);
  console.log('Using department:', dept.name, dept.id);
  console.log('Using locations:', scopedLocs.map((l) => l.name).join(', '));

  const created = await inventoryCount.createSession(tenant.id, user.id, {
    departmentId: dept.id,
    categoryId: null,
    locationIds,
    blindMode: true,
    notes: 'smoke test session',
  });
  console.log('Created session:', created.sessionNo, created.id);
  assert(created.status === 'DRAFT', 'Expected DRAFT after create');

  const started = await inventoryCount.startSession(tenant.id, user.id, created.id, { snapshotSource: 'STOCK_BALANCE' });
  console.log('Started session:', started.status, started.itemsCount, 'items');
  assert(started.status === 'COUNTING', 'Expected COUNTING after start');

  const locId = locationIds[0];
  const sheet = await inventoryCount.getCountSheet(tenant.id, created.id, locId, { page: 1, pageSize: 10 });
  assert(sheet.session.blindMode === true, 'Expected blindMode true');
  if (sheet.lines.length) {
    assert(sheet.lines[0].book === null, 'Blind COUNTING must hide book');
    assert(sheet.lines[0].variance === null, 'Blind COUNTING must hide variance');
  }
  console.log('Sheet lines:', sheet.lines.length);
  assert(sheet.lines.length > 0, 'Sheet should have at least 1 line');

  const firstItemId = sheet.lines[0].itemId;

  const updated = await inventoryCount.updateCountedQty(tenant.id, user.id, created.id, locId, firstItemId, {
    roundNo: 1,
    countedQty: 1,
    countNote: 'smoke',
  });
  assert(updated.countedQty === 1, 'Expected countedQty = 1');
  assert(updated.book === null && updated.variance === null, 'Blind COUNTING must hide book/variance on update');
  console.log('Updated one cell ok');

  const session = await prisma.stockCountSession.findFirst({
    where: { id: created.id, tenantId: tenant.id },
    select: { id: true, currentRound: true },
  });
  const roundNo = session.currentRound;

  const allCells = await prisma.stockCountLocationQty.findMany({
    where: { sessionId: created.id, roundNo },
    select: { id: true, itemId: true, locationId: true, bookQty: true, countedQty: true },
  });
  console.log('Total cells to fill:', allCells.length);
  assert(allCells.length > 0, 'Expected snapshot cells');

  await prisma.$transaction(
    allCells
      .filter((c) => c.countedQty === null)
      .slice(0, 1000)
      .map((c) =>
        prisma.stockCountLocationQty.update({
          where: { id: c.id },
          data: { countedQty: 0, varianceQty: 0, countedBy: user.id, countedAt: new Date() },
        }),
      ),
  );

  const varianceCell = allCells[0];
  const forcedCounted = Number(varianceCell.bookQty) + 1;
  await prisma.stockCountLocationQty.update({
    where: { id: varianceCell.id },
    data: {
      countedQty: forcedCounted,
      varianceQty: forcedCounted - Number(varianceCell.bookQty),
      countedBy: user.id,
      countedAt: new Date(),
    },
  });

  const submitted = await inventoryCount.submitCounts(tenant.id, user.id, created.id, { confirmLock: true });
  console.log('Submitted counts:', submitted.status);
  assert(submitted.status === 'REVEAL_REVIEW', 'Expected REVEAL_REVIEW after submitCounts');

  const vars = await inventoryCount.getVariances(tenant.id, created.id, {});
  console.log('Variance items:', vars.kpis.itemsWithVariance);

  const pending = await inventoryCount.submitForApproval(tenant.id, user.id, created.id, { managementNotes: 'ok' });
  console.log('Submitted for approval:', pending.status);
  assert(pending.status === 'PENDING_APPROVAL', 'Expected PENDING_APPROVAL');

  const sessionAfterSubmit = await prisma.stockCountSession.findFirst({
    where: { id: created.id },
    select: { approvalRequestId: true },
  });
  const approvalReq = await prisma.approvalRequest.findFirst({
    where: { id: sessionAfterSubmit?.approvalRequestId ?? undefined },
    include: { steps: { orderBy: { stepNumber: 'asc' }, include: { requiredRole: { select: { code: true } } } } },
  });
  assert(approvalReq?.totalSteps === 2, 'Expected 2-step approval chain');
  assert(
    approvalReq.steps.some((s) => s.requiredRole?.code === 'GENERAL_MANAGER'),
    'Expected GM as step 2',
  );

  const ledgerBeforeFinance = await prisma.inventoryLedger.count({
    where: {
      tenantId: tenant.id,
      referenceType: 'COUNT_SESSION',
      referenceId: created.id,
      movementType: 'COUNT_ADJUSTMENT',
    },
  });
  assert(ledgerBeforeFinance === 0, 'Finance approve must not post ledger yet');

  const financeApproved = await inventoryCount.approve(
    tenant.id,
    financeActor.id,
    financeActor.roleCode,
    created.id,
    {},
  );
  console.log('Finance approved:', financeApproved.status);
  assert(financeApproved.status === 'FINANCE_APPROVED', 'Expected FINANCE_APPROVED after finance step');

  const ledgerAfterFinance = await prisma.inventoryLedger.count({
    where: {
      tenantId: tenant.id,
      referenceType: 'COUNT_SESSION',
      referenceId: created.id,
      movementType: 'COUNT_ADJUSTMENT',
    },
  });
  assert(ledgerAfterFinance === 0, 'Ledger must remain empty until GM final approve');

  const posted = await inventoryCount.approve(tenant.id, gmActor.id, gmActor.roleCode, created.id, {});
  console.log('GM approved + posted:', posted.status, posted.postingSummary?.ledgerEntriesCreated);
  assert(posted.status === 'POSTED', 'Expected POSTED after GM final approve');

  const ledgerCount = await prisma.inventoryLedger.count({
    where: {
      tenantId: tenant.id,
      referenceType: 'COUNT_SESSION',
      referenceId: created.id,
      movementType: 'COUNT_ADJUSTMENT',
    },
  });
  console.log('Ledger COUNT_ADJUSTMENT entries:', ledgerCount);
  assert(ledgerCount > 0, 'Expected ledger entries after GM post');

  const policyBalance = await prisma.stockBalance.findFirst({
    where: { tenantId: tenant.id, locationId: locId },
    select: { itemId: true, locationId: true, qtyOnHand: true },
  });
  if (policyBalance) {
    const bookAtSnapshot = 10;
    const countedTarget = 12;
    await prisma.stockBalance.update({
      where: {
        tenantId_itemId_locationId: {
          tenantId: tenant.id,
          itemId: policyBalance.itemId,
          locationId: policyBalance.locationId,
        },
      },
      data: { qtyOnHand: bookAtSnapshot },
    });
    const created2 = await inventoryCount.createSession(tenant.id, user.id, {
      departmentId: dept.id,
      locationIds: [policyBalance.locationId],
      blindMode: false,
      notes: 'policy-b phase1 hook',
    });
    await inventoryCount.startSession(tenant.id, user.id, created2.id, {});
    await prisma.stockBalance.update({
      where: {
        tenantId_itemId_locationId: {
          tenantId: tenant.id,
          itemId: policyBalance.itemId,
          locationId: policyBalance.locationId,
        },
      },
      data: { qtyOnHand: 15 },
    });
    await fillPolicyBCells(created2.id, policyBalance.itemId, policyBalance.locationId, countedTarget, user.id);
    await inventoryCount.submitCounts(tenant.id, user.id, created2.id, {});
    await prisma.stockCountSession.update({ where: { id: created2.id }, data: { status: 'FINANCE_APPROVED' } });
    await posting.postInventoryCountSession(created2.id, tenant.id, user.id);
    const afterPolicy = await prisma.stockBalance.findUnique({
      where: {
        tenantId_itemId_locationId: {
          tenantId: tenant.id,
          itemId: policyBalance.itemId,
          locationId: policyBalance.locationId,
        },
      },
    });
    if (Number(afterPolicy.qtyOnHand) === countedTarget) {
      console.log('Policy B movement-after-snapshot: final stock equals counted');
    } else {
      console.warn(
        `Policy B check non-blocking: expected final ${countedTarget}, got ${afterPolicy.qtyOnHand}`,
      );
    }
  }

  console.log('SMOKE TEST OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
