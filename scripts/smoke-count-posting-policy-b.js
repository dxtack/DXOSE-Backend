/**
 * Wave 1 — Policy B posting smoke (direct service calls).
 *
 * Verifies: final stockBalance.qtyOnHand === countedQty after post,
 * including movements after snapshot (canonical inventory-count path).
 *
 * Run: node scripts/smoke-count-posting-policy-b.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const inventoryCount = require('../src/services/inventoryCount.service');
const posting = require('../src/services/posting.service');
const { computePolicyBPostingAdjustment } = require('../src/services/countPostingPolicy');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

async function getFixture() {
  const tenant = await prisma.tenant.findFirst({ where: { isActive: true }, select: { id: true, name: true } });
  assert(tenant, 'No active tenant');
  const user = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true, email: true } });
  assert(user, 'No active user');

  const locWithBalances = await prisma.location.findMany({
    where: {
      tenantId: tenant.id,
      isActive: true,
      departmentId: { not: null },
      stockBalances: { some: { qtyOnHand: { gt: 0 } } },
    },
    select: { id: true, name: true, departmentId: true },
    take: 5,
  });
  assert(locWithBalances.length >= 1, 'No locations with stock balances');

  const loc = locWithBalances[0];
  const dept = await prisma.department.findFirst({
    where: { id: loc.departmentId, tenantId: tenant.id, isActive: true },
    select: { id: true, name: true },
  });
  assert(dept, 'Location department missing');

  const balance = await prisma.stockBalance.findFirst({
    where: { tenantId: tenant.id, locationId: loc.id, qtyOnHand: { gt: 0 } },
    select: {
      itemId: true,
      locationId: true,
      qtyOnHand: true,
      wacUnitCost: true,
      item: { select: { name: true, departmentId: true } },
    },
    orderBy: { qtyOnHand: 'desc' },
  });
  assert(balance, 'Need stock balance at location');

  if (balance.item.departmentId !== dept.id) {
    await prisma.item.update({
      where: { id: balance.itemId },
      data: { departmentId: dept.id },
    });
  }

  return { tenant, user, dept, balance: { ...balance, locationId: loc.id } };
}

async function postSessionThroughApproval(tenantId, userId, sessionId) {
  await prisma.stockCountSession.update({
    where: { id: sessionId },
    data: { status: 'PENDING_APPROVAL' },
  });
  return posting.postInventoryCountSession(sessionId, tenantId, userId);
}

async function fillAllCellsToCounted(sessionId, roundNo, countedBy, mapFn) {
  const cells = await prisma.stockCountLocationQty.findMany({
    where: { sessionId, roundNo },
    select: { id: true, itemId: true, locationId: true, bookQty: true },
  });
  for (const c of cells) {
    const countedQty = mapFn(c);
    const varianceQty = countedQty - Number(c.bookQty);
    await prisma.stockCountLocationQty.update({
      where: { id: c.id },
      data: {
        countedQty,
        varianceQty,
        countedBy,
        countedAt: new Date(),
      },
    });
  }
  return cells.length;
}

/** Policy B unit: adjustment math */
function testPolicyBUnit() {
  const ex = computePolicyBPostingAdjustment(12, 15);
  assert(!ex.skip && ex.adjustmentQty === -3 && ex.targetQty === 12, 'Example: counted 12, live 15 → -3');
  const noop = computePolicyBPostingAdjustment(15, 15);
  assert(noop.skip, 'No adjustment when counted equals live');
  console.log('  ✓ Policy B unit (example snapshot 10 / live 15 / counted 12)');
}

/** 1–2: increase / decrease vs live stock */
async function testIncreaseDecrease(tenant, user, dept, balance) {
  const locId = balance.locationId;
  const itemId = balance.itemId;
  const liveBefore = Number(balance.qtyOnHand);

  const created = await inventoryCount.createSession(tenant.id, user.id, {
    departmentId: dept.id,
    locationIds: [locId],
    blindMode: false,
    notes: 'policy-b increase',
  });
  await inventoryCount.startSession(tenant.id, user.id, created.id, {});

  const countedUp = liveBefore + 4;
  await prisma.stockCountLocationQty.updateMany({
    where: { sessionId: created.id, itemId, locationId: locId, roundNo: 1 },
    data: { countedQty: countedUp, varianceQty: countedUp - liveBefore, countedBy: user.id, countedAt: new Date() },
  });
  await fillAllCellsToCounted(created.id, 1, user.id, (c) =>
    c.itemId === itemId && c.locationId === locId ? countedUp : Number(c.bookQty),
  );
  await inventoryCount.submitCounts(tenant.id, user.id, created.id, {});
  await postSessionThroughApproval(tenant.id, user.id, created.id);

  const afterUp = await prisma.stockBalance.findUnique({
    where: { tenantId_itemId_locationId: { tenantId: tenant.id, itemId, locationId: locId } },
  });
  assert(Number(afterUp.qtyOnHand) === countedUp, `Increase: expected ${countedUp}, got ${afterUp.qtyOnHand}`);

  const created2 = await inventoryCount.createSession(tenant.id, user.id, {
    departmentId: dept.id,
    locationIds: [locId],
    blindMode: false,
    notes: 'policy-b decrease',
  });
  await inventoryCount.startSession(tenant.id, user.id, created2.id, {});
  const live2 = Number(afterUp.qtyOnHand);
  const countedDown = Math.max(0, live2 - 3);
  await fillAllCellsToCounted(created2.id, 1, user.id, (c) =>
    c.itemId === itemId && c.locationId === locId ? countedDown : Number(c.bookQty),
  );
  await inventoryCount.submitCounts(tenant.id, user.id, created2.id, {});
  await postSessionThroughApproval(tenant.id, user.id, created2.id);

  const afterDown = await prisma.stockBalance.findUnique({
    where: { tenantId_itemId_locationId: { tenantId: tenant.id, itemId, locationId: locId } },
  });
  assert(Number(afterDown.qtyOnHand) === countedDown, `Decrease: expected ${countedDown}, got ${afterDown.qtyOnHand}`);
  console.log('  ✓ Increase and decrease count (final = counted)');
}

/** 3: movements after snapshot — canonical example */
async function testMovementsAfterSnapshot(tenant, user, dept, balance) {
  const locId = balance.locationId;

  const created = await inventoryCount.createSession(tenant.id, user.id, {
    departmentId: dept.id,
    locationIds: [locId],
    blindMode: false,
    notes: 'policy-b movement after snapshot',
  });
  await inventoryCount.startSession(tenant.id, user.id, created.id, {});

  const cell = await prisma.stockCountLocationQty.findFirst({
    where: { sessionId: created.id, locationId: locId, roundNo: 1 },
    orderBy: { bookQty: 'desc' },
  });
  assert(cell, 'Snapshot cell missing — check department/location scope');
  const itemId = cell.itemId;
  const movementDelta = 5;
  const countDeltaFromSnapshot = 2;
  const snapshotBook = Number(cell.bookQty);
  const countedQty = snapshotBook + countDeltaFromSnapshot;
  const liveAfterMovement = snapshotBook + movementDelta;

  await prisma.stockBalance.update({
    where: { tenantId_itemId_locationId: { tenantId: tenant.id, itemId, locationId: locId } },
    data: { qtyOnHand: liveAfterMovement },
  });

  await fillAllCellsToCounted(created.id, 1, user.id, (c) =>
    c.itemId === itemId && c.locationId === locId ? countedQty : Number(c.bookQty),
  );

  await inventoryCount.submitCounts(tenant.id, user.id, created.id, {});

  const vars = await inventoryCount.getVariances(tenant.id, created.id, {});
  const itemRow = vars.rows.find((r) => r.itemId === itemId);
  const locRow = itemRow?.locations?.find((l) => l.locationId === locId);
  assert(
    locRow && Number(locRow.varianceQty) === countedQty - snapshotBook,
    'Snapshot variance stays counted - book',
  );
  await postSessionThroughApproval(tenant.id, user.id, created.id);

  const after = await prisma.stockBalance.findUnique({
    where: { tenantId_itemId_locationId: { tenantId: tenant.id, itemId, locationId: locId } },
  });
  assert(Number(after.qtyOnHand) === countedQty, `After movement: expected ${countedQty}, got ${after.qtyOnHand} (not 17)`);

  const ledger = await prisma.inventoryLedger.findFirst({
    where: {
      tenantId: tenant.id,
      referenceType: 'COUNT_SESSION',
      referenceId: created.id,
      itemId,
      locationId: locId,
    },
    orderBy: { createdAt: 'desc' },
  });
  const expectedPostingAdj = countedQty - liveAfterMovement;
  assert(
    ledger &&
      Number(ledger.balanceAfter) === countedQty &&
      (expectedPostingAdj < 0 ? Number(ledger.qtyOut) === Math.abs(expectedPostingAdj) : Number(ledger.qtyIn) === expectedPostingAdj),
    `Ledger should post ${expectedPostingAdj} to reach counted`,
  );
  assert(String(ledger.notes || '').includes('postingPolicy=POLICY_B'), 'Ledger notes should document Policy B');
  console.log('  ✓ Movements after snapshot (12 counted, 15 live → final 12)');
}

/** 4: blind count — snapshot variance unchanged; post still Policy B */
async function testBlindCount(tenant, user, dept, balance) {
  const locId = balance.locationId;
  const created = await inventoryCount.createSession(tenant.id, user.id, {
    departmentId: dept.id,
    locationIds: [locId],
    blindMode: true,
    notes: 'policy-b blind',
  });
  await inventoryCount.startSession(tenant.id, user.id, created.id, {});
  const sheet = await inventoryCount.getCountSheet(tenant.id, created.id, locId, { page: 1, pageSize: 5 });
  assert(sheet.session.blindMode && sheet.lines[0]?.book === null, 'Blind hides book during COUNTING');

  const itemId = sheet.lines[0].itemId;
  const live = Number(
    (
      await prisma.stockBalance.findUnique({
        where: { tenantId_itemId_locationId: { tenantId: tenant.id, itemId, locationId: locId } },
      })
    ).qtyOnHand,
  );
  const countedQty = live;
  await inventoryCount.updateCountedQty(tenant.id, user.id, created.id, locId, itemId, { roundNo: 1, countedQty });
  await fillAllCellsToCounted(created.id, 1, user.id, () => countedQty);
  await inventoryCount.submitCounts(tenant.id, user.id, created.id, {});
  const revealed = await inventoryCount.getCountSheet(tenant.id, created.id, locId, { page: 1, pageSize: 5 });
  assert(revealed.lines[0]?.book !== null, 'Book visible after REVEAL_REVIEW');
  await postSessionThroughApproval(tenant.id, user.id, created.id);
  console.log('  ✓ Blind count (hide until reveal; post Policy B)');
}

/** 5: recount — latest round wins */
async function testRecount(tenant, user, dept, balance) {
  const locId = balance.locationId;
  const itemId = balance.itemId;
  const created = await inventoryCount.createSession(tenant.id, user.id, {
    departmentId: dept.id,
    locationIds: [locId],
    blindMode: false,
    notes: 'policy-b recount',
  });
  await inventoryCount.startSession(tenant.id, user.id, created.id, {});

  const live = Number(
    (
      await prisma.stockBalance.findUnique({
        where: { tenantId_itemId_locationId: { tenantId: tenant.id, itemId, locationId: locId } },
      })
    ).qtyOnHand,
  );
  const round1 = live;
  const round2 = live + 2;

  await prisma.stockCountLocationQty.create({
    data: {
      sessionId: created.id,
      itemId,
      locationId: locId,
      roundNo: 2,
      bookQty: (await prisma.stockCountLocationQty.findFirst({ where: { sessionId: created.id, roundNo: 1, itemId, locationId: locId } })).bookQty,
      countedQty: round2,
      varianceQty: round2 - Number((await prisma.stockCountLocationQty.findFirst({ where: { sessionId: created.id, roundNo: 1, itemId, locationId: locId } })).bookQty),
      countedBy: user.id,
      countedAt: new Date(),
    },
  });
  await prisma.stockCountSession.update({ where: { id: created.id }, data: { currentRound: 2 } });
  await fillAllCellsToCounted(created.id, 2, user.id, (c) =>
    c.itemId === itemId && c.locationId === locId ? round2 : Number(c.bookQty),
  );
  await prisma.stockCountSession.update({ where: { id: created.id }, data: { status: 'REVEAL_REVIEW' } });
  await postSessionThroughApproval(tenant.id, user.id, created.id);

  const after = await prisma.stockBalance.findUnique({
    where: { tenantId_itemId_locationId: { tenantId: tenant.id, itemId, locationId: locId } },
  });
  assert(Number(after.qtyOnHand) === round2, `Recount round 2: expected ${round2}`);
  console.log('  ✓ Recount (latest round posted)');
}

/** 6: multi-location */
async function testMultiLocation(tenant, user, dept) {
  const locations = await prisma.location.findMany({
    where: { tenantId: tenant.id, isActive: true, departmentId: dept.id },
    select: { id: true },
    take: 5,
  });
  const locationIds = locations.map((l) => l.id);
  if (locationIds.length < 2) {
    console.log('  ⊘ Multi-location skipped (need 2 locations in same department)');
    return;
  }

  const balances = await prisma.stockBalance.findMany({
    where: { tenantId: tenant.id, locationId: { in: locationIds }, qtyOnHand: { gt: 0 } },
    take: 10,
    select: { itemId: true, locationId: true, qtyOnHand: true },
  });
  if (balances.length < 1) {
    console.log('  ⊘ Multi-location skipped (no balances in department locations)');
    return;
  }

  const created = await inventoryCount.createSession(tenant.id, user.id, {
    departmentId: dept.id,
    locationIds,
    blindMode: false,
    notes: 'policy-b multi-loc',
  });
  await inventoryCount.startSession(tenant.id, user.id, created.id, {});

  const targets = new Map();
  for (const b of balances) {
    if (!locationIds.includes(b.locationId)) continue;
    const key = `${b.itemId}:${b.locationId}`;
    if (!targets.has(key)) {
      targets.set(key, { counted: Number(b.qtyOnHand) + 1, itemId: b.itemId, locationId: b.locationId });
    }
  }

  const cells = await prisma.stockCountLocationQty.findMany({ where: { sessionId: created.id, roundNo: 1 } });
  for (const c of cells) {
    const t = targets.get(`${c.itemId}:${c.locationId}`);
    const countedQty = t ? t.counted : Number(c.bookQty);
    await prisma.stockCountLocationQty.update({
      where: { id: c.id },
      data: {
        countedQty,
        varianceQty: countedQty - Number(c.bookQty),
        countedBy: user.id,
        countedAt: new Date(),
      },
    });
  }

  await inventoryCount.submitCounts(tenant.id, user.id, created.id, {});
  await postSessionThroughApproval(tenant.id, user.id, created.id);

  for (const [, t] of targets) {
    const row = await prisma.stockBalance.findUnique({
      where: {
        tenantId_itemId_locationId: { tenantId: tenant.id, itemId: t.itemId, locationId: t.locationId },
      },
    });
    assert(Number(row.qtyOnHand) === t.counted, `Multi-loc ${t.itemId}@${t.locationId}`);
  }
  console.log('  ✓ Multi-location');
}

/** 7: concurrent movements — live qty read per cell inside one post transaction */
async function testConcurrentMovements(tenant, user, dept, balance) {
  const locId = balance.locationId;
  const itemId = balance.itemId;

  await prisma.stockBalance.update({
    where: { tenantId_itemId_locationId: { tenantId: tenant.id, itemId, locationId: locId } },
    data: { qtyOnHand: 20 },
  });

  const created = await inventoryCount.createSession(tenant.id, user.id, {
    departmentId: dept.id,
    locationIds: [locId],
    blindMode: false,
    notes: 'policy-b concurrent',
  });
  await inventoryCount.startSession(tenant.id, user.id, created.id, {});

  const countedQty = 18;
  await fillAllCellsToCounted(created.id, 1, user.id, (c) =>
    c.itemId === itemId && c.locationId === locId ? countedQty : Number(c.bookQty),
  );

  await prisma.stockBalance.update({
    where: { tenantId_itemId_locationId: { tenantId: tenant.id, itemId, locationId: locId } },
    data: { qtyOnHand: 25 },
  });

  await inventoryCount.submitCounts(tenant.id, user.id, created.id, {});
  await postSessionThroughApproval(tenant.id, user.id, created.id);

  const after = await prisma.stockBalance.findUnique({
    where: { tenantId_itemId_locationId: { tenantId: tenant.id, itemId, locationId: locId } },
  });
  assert(Number(after.qtyOnHand) === countedQty, 'Concurrent movement: final must equal counted, not snapshot variance path');
  console.log('  ✓ Concurrent movements (live qty at post time)');
}

async function main() {
  console.log('Policy B posting smoke — Wave 1\n');
  testPolicyBUnit();

  const { tenant, user, dept, balance } = await getFixture();
  console.log(`Fixture: ${tenant.name} / ${balance.item.name}\n`);

  await testMovementsAfterSnapshot(tenant, user, dept, balance);
  await testIncreaseDecrease(tenant, user, dept, balance);
  await testBlindCount(tenant, user, dept, balance);
  await testRecount(tenant, user, dept, balance);
  await testMultiLocation(tenant, user, dept);
  await testConcurrentMovements(tenant, user, dept, balance);

  console.log('\nPOLICY B SMOKE OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
