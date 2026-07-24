/**
 * Smoke: getStockReport physicalCount / physicalVariance (slice 2 — cell-first).
 *
 * Read-only:
 *   node scripts/smoke-stockReport-physical-reconciliation.js
 *
 * Fixtures (POSTED sessions created then deleted; opt-in):
 *   SMOKE_STOCK_REPORT_PHYSICAL=1 node scripts/smoke-stockReport-physical-reconciliation.js
 *
 * Requires DATABASE_URL. Do not use fixture mode against production.
 */
const { PrismaClient } = require('@prisma/client');
const { getStockReport } = require('../src/services/stockReport.service');

const prisma = new PrismaClient();

async function runReadOnly() {
  const tenant = await prisma.tenant.findFirst({ where: { isActive: true }, select: { id: true, name: true } });
  if (!tenant) {
    console.log(JSON.stringify({ error: 'No active tenant' }, null, 2));
    process.exit(1);
  }

  const itemDept = await prisma.item.findFirst({
    where: { tenantId: tenant.id, isActive: true, departmentId: { not: null } },
    select: { departmentId: true },
  });
  if (!itemDept?.departmentId) {
    console.log(JSON.stringify({ error: 'No item with departmentId' }, null, 2));
    process.exit(1);
  }

  const year = new Date().getFullYear();
  const report = await getStockReport(tenant.id, { departmentId: itemDept.departmentId, year });

  const withPhys = report.items.filter((r) => r.physicalCount != null);
  const sample = withPhys.slice(0, 5).map((r) => ({
    itemId: r.itemId,
    name: r.name,
    physicalCount: r.physicalCount,
    physicalVariance: r.physicalVariance,
    closeStock: r.closeStock,
  }));

  console.log(
    JSON.stringify(
      {
        mode: 'read_only',
        hint: 'SMOKE_STOCK_REPORT_PHYSICAL=1 for disposable POSTED sessions + assertions.',
        tenant: tenant.name,
        departmentId: itemDept.departmentId,
        year,
        locationCount: report.locations.length,
        itemsWithPhysicalCount: withPhys.length,
        totalItems: report.items.length,
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

  const deptRow = await prisma.$queryRaw`
    SELECT d.id AS "departmentId"
    FROM departments d
    WHERE d."tenantId" = ${tenant.id}::uuid
      AND (
        SELECT COUNT(*)::int
        FROM items i
        WHERE i."departmentId" = d.id AND i."isActive" = true
      ) >= 2
      AND (
        SELECT COUNT(*)::int
        FROM locations l
        WHERE l."departmentId" = d.id AND l."isActive" = true
      ) >= 1
    LIMIT 1
  `;
  if (!deptRow?.length) {
    console.log(JSON.stringify({ error: 'No department with 2+ items and 1+ location' }, null, 2));
    process.exit(1);
  }
  const departmentId = deptRow[0].departmentId;

  const deptLocations = await prisma.location.findMany({
    where: { tenantId: tenant.id, departmentId, isActive: true },
    orderBy: { name: 'asc' },
  });
  if (deptLocations.length < 1) {
    console.log(JSON.stringify({ error: 'No active locations in department' }, null, 2));
    process.exit(1);
  }
  const multiLocationDept = deptLocations.length >= 2;
  const locA = deptLocations[0];
  const locB = multiLocationDept ? deptLocations[1] : deptLocations[0];

  const items = await prisma.item.findMany({
    where: { tenantId: tenant.id, departmentId, isActive: true },
    select: { id: true },
    take: 2,
  });
  if (items.length < 2) {
    console.log(JSON.stringify({ error: 'Need 2+ items in department' }, null, 2));
    process.exit(1);
  }

  const [i0, i1] = items;
  const year = new Date().getFullYear();
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
          sessionNo: `SMOKE-SR2-LEG-${stamp}`,
          createdBy: member.userId,
          countDate: new Date(),
          status: 'POSTED',
          postedAt: new Date('2099-12-31T12:00:00.000Z'),
          lines: {
            create: {
              itemId: i1.id,
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

      const report = await getStockReport(tenant.id, { departmentId, year });
      const row2 = report.items.find((r) => r.itemId === i1.id);
      const pass = row2 && Number(row2.physicalCount) === 42;
      const physVar =
        row2 &&
        row2.physicalCount != null &&
        Number(row2.physicalVariance) === Number(row2.physicalCount) - Number(row2.totalQty);
      await prisma.stockCountSession.delete({ where: { id: sLeg.id } });
      createdIds.pop();
      return {
        phase: 'legacy_line_only',
        sessionId: sLeg.id,
        sessionNo: sLeg.sessionNo,
        pass: !!(pass && physVar),
        expectedPhysicalCount: 42,
        row: row2
          ? { physicalCount: row2.physicalCount, physicalVariance: row2.physicalVariance, totalQty: row2.totalQty }
          : null,
      };
    };

    const phaseCanonical = async () => {
      const locationQtyCreates = multiLocationDept
        ? [
            {
              itemId: i0.id,
              locationId: locA.id,
              roundNo: 1,
              bookQty: 0,
              countedQty: 10,
              varianceQty: 10,
              countedAt: new Date(Date.now() - 86400000),
              countedBy: member.userId,
            },
            {
              itemId: i0.id,
              locationId: locA.id,
              roundNo: 2,
              bookQty: 0,
              countedQty: 77,
              varianceQty: 77,
              countedAt: new Date(),
              countedBy: member.userId,
            },
            {
              itemId: i1.id,
              locationId: locB.id,
              roundNo: 1,
              bookQty: 0,
              countedQty: 55,
              varianceQty: 55,
              countedAt: new Date(),
              countedBy: member.userId,
            },
          ]
        : [
            {
              itemId: i0.id,
              locationId: locA.id,
              roundNo: 1,
              bookQty: 0,
              countedQty: 10,
              varianceQty: 10,
              countedAt: new Date(Date.now() - 86400000),
              countedBy: member.userId,
            },
            {
              itemId: i0.id,
              locationId: locA.id,
              roundNo: 2,
              bookQty: 0,
              countedQty: 77,
              varianceQty: 77,
              countedAt: new Date(),
              countedBy: member.userId,
            },
            {
              itemId: i1.id,
              locationId: locA.id,
              roundNo: 1,
              bookQty: 0,
              countedQty: 55,
              varianceQty: 55,
              countedAt: new Date(),
              countedBy: member.userId,
            },
          ];

      const sCanon = await prisma.stockCountSession.create({
        data: {
          tenantId: tenant.id,
          locationId: locA.id,
          sessionNo: `SMOKE-SR2-CAN-${stamp}`,
          createdBy: member.userId,
          countDate: new Date(),
          status: 'POSTED',
          postedAt: new Date('2099-12-31T12:00:00.000Z'),
          ...(multiLocationDept
            ? {
                scopedLocations: {
                  create: [{ locationId: locA.id }, { locationId: locB.id }],
                },
              }
            : {}),
          locationQtys: {
            create: locationQtyCreates,
          },
        },
        select: { id: true, sessionNo: true },
      });
      createdIds.push(sCanon.id);

      const report = await getStockReport(tenant.id, { departmentId, year });
      const row0 = report.items.find((r) => r.itemId === i0.id);
      const row1 = report.items.find((r) => r.itemId === i1.id);
      const canonLatestRound = row0 && Number(row0.physicalCount) === 77;
      const canonSecondItem = row1 && Number(row1.physicalCount) === 55;
      const physVar0 =
        row0 &&
        row0.physicalCount != null &&
        Number(row0.physicalVariance) === Number(row0.physicalCount) - Number(row0.totalQty);
      await prisma.stockCountSession.delete({ where: { id: sCanon.id } });
      createdIds.pop();
      return {
        phase: multiLocationDept
          ? 'canonical_cells_multi_location_multi_round'
          : 'canonical_cells_single_department_multi_round',
        multiLocationDept,
        sessionId: sCanon.id,
        sessionNo: sCanon.sessionNo,
        pass: !!(canonLatestRound && canonSecondItem && physVar0),
        assertions: {
          item0_latestRoundPhysicalCount_77: canonLatestRound,
          item1_cellPhysicalCount_55: canonSecondItem,
          item0_physicalVariance_formula: physVar0,
        },
        rows: {
          item0: row0
            ? { physicalCount: row0.physicalCount, physicalVariance: row0.physicalVariance, totalQty: row0.totalQty }
            : null,
          item1: row1
            ? { physicalCount: row1.physicalCount, physicalVariance: row1.physicalVariance, totalQty: row1.totalQty }
            : null,
        },
      };
    };

    const legacyResult = await phaseLegacy();
    const canonResult = await phaseCanonical();

    const out = {
      mode: 'fixtures',
      tenant: tenant.name,
      departmentId,
      year,
      multiLocationDept,
      locations: { locA: locA.name, locB: locB.name, sameStore: !multiLocationDept },
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
  if (process.env.SMOKE_STOCK_REPORT_PHYSICAL === '1') {
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
