/**
 * Smoke: generateVarianceReport physicalQty / variance (slice 3 — cell-first).
 *
 * Read-only:
 *   node scripts/smoke-generatedVariance-physical-reconciliation.js
 *
 * Fixtures (POSTED sessions + countDate in 2099 window; deleted after):
 *   SMOKE_GENERATED_VARIANCE_PHYSICAL=1 node scripts/smoke-generatedVariance-physical-reconciliation.js
 *
 * Requires DATABASE_URL. Do not use fixture mode against production.
 */
const { PrismaClient } = require('@prisma/client');
const { generateVarianceReport } = require('../src/services/report.service');

const prisma = new PrismaClient();

const WINDOW_START = new Date('2099-01-01T00:00:00.000Z');
const WINDOW_END = new Date('2099-12-31T23:59:59.999Z');

async function pickDepartmentContext(tenantId) {
  const deptRow = await prisma.$queryRaw`
    SELECT d.id AS "departmentId"
    FROM departments d
    WHERE d."tenantId" = ${tenantId}::uuid
      AND (
        SELECT COUNT(*)::int
        FROM items i
        WHERE i."departmentId" = d.id AND i."isActive" = true
      ) >= 1
      AND (
        SELECT COUNT(*)::int
        FROM locations l
        WHERE l."departmentId" = d.id AND l."isActive" = true
      ) >= 1
    LIMIT 1
  `;
  if (!deptRow?.length) return null;
  const departmentId = deptRow[0].departmentId;
  const deptLocations = await prisma.location.findMany({
    where: { tenantId, departmentId, isActive: true },
    orderBy: { name: 'asc' },
  });
  if (deptLocations.length < 1) return null;
  const multiLocationDept = deptLocations.length >= 2;
  const locA = deptLocations[0];
  const locB = multiLocationDept ? deptLocations[1] : deptLocations[0];
  const locationIds = deptLocations.map((l) => l.id);

  const itemIds = [];
  const seen = new Set();
  const balances = await prisma.stockBalance.findMany({
    where: { tenantId, locationId: { in: locationIds } },
    select: { itemId: true },
  });
  for (const b of balances) {
    if (seen.has(b.itemId)) continue;
    seen.add(b.itemId);
    itemIds.push(b.itemId);
    if (itemIds.length >= 2) break;
  }
  if (itemIds.length < 1) return null;

  return { departmentId, locationIds, locA, locB, multiLocationDept, itemIds };
}

async function runReadOnly() {
  const tenant = await prisma.tenant.findFirst({ where: { isActive: true }, select: { id: true, name: true } });
  if (!tenant) {
    console.log(JSON.stringify({ error: 'No active tenant' }, null, 2));
    process.exit(1);
  }

  const ctx = await pickDepartmentContext(tenant.id);
  if (!ctx) {
    console.log(JSON.stringify({ error: 'No suitable department / balances for smoke' }, null, 2));
    process.exit(1);
  }

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999));

  const { rows } = await generateVarianceReport(tenant.id, ctx.locationIds, start, end, false, null, {});
  const sample = rows.slice(0, 5).map((r) => ({
    itemId: r.itemId,
    itemName: r.itemName,
    physicalQty: r.physicalQty,
    closingQty: r.closingQty,
    varianceQty: r.varianceQty,
  }));

  console.log(
    JSON.stringify(
      {
        mode: 'read_only',
        hint: 'SMOKE_GENERATED_VARIANCE_PHYSICAL=1 for 2099-window fixtures.',
        tenant: tenant.name,
        departmentId: ctx.departmentId,
        dateRange: { start: start.toISOString(), end: end.toISOString() },
        rowCount: rows.length,
        sample,
      },
      null,
      2
    )
  );
}

async function runFixtures() {
  const tenant = await prisma.tenant.findFirst({ where: { isActive: true }, select: { id: true, name: true } });
  if (!tenant) {
    console.log(JSON.stringify({ error: 'No active tenant' }, null, 2));
    process.exit(1);
  }

  const member = await prisma.tenantMember.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    select: { userId: true },
  });
  if (!member) {
    console.log(JSON.stringify({ error: 'No tenant member' }, null, 2));
    process.exit(1);
  }

  const ctx = await pickDepartmentContext(tenant.id);
  if (!ctx) {
    console.log(JSON.stringify({ error: 'No suitable department / balances for smoke' }, null, 2));
    process.exit(1);
  }

  const { locationIds, locA, locB, multiLocationDept, itemIds } = ctx;
  const i0 = itemIds[0];
  const twoItems = itemIds.length >= 2;
  const i1 = twoItems ? itemIds[1] : null;
  const stamp = Date.now().toString(36);
  const createdIds = [];

  const cleanup = async () => {
    for (const id of [...createdIds].reverse()) {
      try {
        await prisma.stockCountSession.delete({ where: { id } });
      } catch (e) {
        console.error(JSON.stringify({ cleanupError: id, message: e.message }));
      }
    }
  };

  try {
    const phaseLegacy = async () => {
      const sLeg = await prisma.stockCountSession.create({
        data: {
          tenantId: tenant.id,
          locationId: locA.id,
          sessionNo: `SMOKE-RV3-LEG-${stamp}`,
          createdBy: member.userId,
          countDate: new Date('2099-06-15T12:00:00.000Z'),
          status: 'POSTED',
          postedAt: new Date('2099-06-16T12:00:00.000Z'),
          lines: {
            create: {
              itemId: twoItems ? i1 : i0,
              bookQty: 1,
              countedQty: 42,
              wacUnitCost: 0,
              varianceQty: 41,
              varianceValue: 0,
            },
          },
        },
        select: { id: true, sessionNo: true },
      });
      createdIds.push(sLeg.id);

      const { rows } = await generateVarianceReport(tenant.id, locationIds, WINDOW_START, WINDOW_END, false, null, {});
      const legacyItemId = twoItems ? i1 : i0;
      const row1 = rows.find((r) => r.itemId === legacyItemId);
      const pass = row1 && Number(row1.physicalQty) === 42;
      await prisma.stockCountSession.delete({ where: { id: sLeg.id } });
      createdIds.pop();
      return {
        phase: 'legacy_line_only',
        sessionId: sLeg.id,
        sessionNo: sLeg.sessionNo,
        pass: !!pass,
        row: row1 ? { physicalQty: row1.physicalQty, closingQty: row1.closingQty } : null,
      };
    };

    const phaseCanonical = async () => {
      const locationQtyCreates =
        multiLocationDept && twoItems
          ? [
              {
                itemId: i0,
                locationId: locA.id,
                roundNo: 1,
                bookQty: 0,
                countedQty: 10,
                varianceQty: 10,
                countedAt: new Date('2099-06-10T12:00:00.000Z'),
                countedBy: member.userId,
              },
              {
                itemId: i0,
                locationId: locA.id,
                roundNo: 2,
                bookQty: 0,
                countedQty: 77,
                varianceQty: 77,
                countedAt: new Date('2099-06-11T12:00:00.000Z'),
                countedBy: member.userId,
              },
              {
                itemId: i1,
                locationId: locB.id,
                roundNo: 1,
                bookQty: 0,
                countedQty: 55,
                varianceQty: 55,
                countedAt: new Date('2099-06-11T12:00:00.000Z'),
                countedBy: member.userId,
              },
            ]
          : !multiLocationDept && twoItems
            ? [
                {
                  itemId: i0,
                  locationId: locA.id,
                  roundNo: 1,
                  bookQty: 0,
                  countedQty: 10,
                  varianceQty: 10,
                  countedAt: new Date('2099-06-10T12:00:00.000Z'),
                  countedBy: member.userId,
                },
                {
                  itemId: i0,
                  locationId: locA.id,
                  roundNo: 2,
                  bookQty: 0,
                  countedQty: 77,
                  varianceQty: 77,
                  countedAt: new Date('2099-06-11T12:00:00.000Z'),
                  countedBy: member.userId,
                },
                {
                  itemId: i1,
                  locationId: locA.id,
                  roundNo: 1,
                  bookQty: 0,
                  countedQty: 55,
                  varianceQty: 55,
                  countedAt: new Date('2099-06-11T12:00:00.000Z'),
                  countedBy: member.userId,
                },
              ]
            : [
                {
                  itemId: i0,
                  locationId: locA.id,
                  roundNo: 1,
                  bookQty: 0,
                  countedQty: 10,
                  varianceQty: 10,
                  countedAt: new Date('2099-06-10T12:00:00.000Z'),
                  countedBy: member.userId,
                },
                {
                  itemId: i0,
                  locationId: locA.id,
                  roundNo: 2,
                  bookQty: 0,
                  countedQty: 77,
                  varianceQty: 77,
                  countedAt: new Date('2099-06-11T12:00:00.000Z'),
                  countedBy: member.userId,
                },
              ];

      const sCanon = await prisma.stockCountSession.create({
        data: {
          tenantId: tenant.id,
          locationId: locA.id,
          sessionNo: `SMOKE-RV3-CAN-${stamp}`,
          createdBy: member.userId,
          countDate: new Date('2099-07-01T12:00:00.000Z'),
          status: 'POSTED',
          postedAt: new Date('2099-07-02T12:00:00.000Z'),
          ...(multiLocationDept
            ? {
                scopedLocations: {
                  create: [{ locationId: locA.id }, { locationId: locB.id }],
                },
              }
            : {}),
          locationQtys: { create: locationQtyCreates },
        },
        select: { id: true, sessionNo: true },
      });
      createdIds.push(sCanon.id);

      const { rows } = await generateVarianceReport(tenant.id, locationIds, WINDOW_START, WINDOW_END, false, null, {});
      const row0 = rows.find((r) => r.itemId === i0);
      const row1 = twoItems ? rows.find((r) => r.itemId === i1) : null;
      const p0 = row0 && Number(row0.physicalQty) === 77;
      const passCanon = twoItems
        ? !!(p0 && row1 && Number(row1.physicalQty) === 55)
        : !!p0;
      await prisma.stockCountSession.delete({ where: { id: sCanon.id } });
      createdIds.pop();
      return {
        phase: multiLocationDept
          ? 'canonical_cells_multi_location_multi_round'
          : 'canonical_cells_single_store_multi_round',
        multiLocationDept,
        twoItems,
        sessionId: sCanon.id,
        sessionNo: sCanon.sessionNo,
        pass: passCanon,
        rows: {
          item0: row0 ? { physicalQty: row0.physicalQty } : null,
          item1: row1 ? { physicalQty: row1.physicalQty } : null,
        },
      };
    };

    const legacyResult = await phaseLegacy();
    const canonResult = await phaseCanonical();

    const out = {
      mode: 'fixtures',
      tenant: tenant.name,
      departmentId: ctx.departmentId,
      dateWindow: { start: WINDOW_START.toISOString(), end: WINDOW_END.toISOString() },
      legacyPhase: legacyResult,
      canonicalPhase: canonResult,
      overallPass: legacyResult.pass && canonResult.pass,
    };

    console.log(JSON.stringify(out, null, 2));
    if (!out.overallPass) process.exitCode = 1;
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

async function main() {
  if (process.env.SMOKE_GENERATED_VARIANCE_PHYSICAL === '1') {
    await runFixtures();
    return;
  }
  await runReadOnly();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
