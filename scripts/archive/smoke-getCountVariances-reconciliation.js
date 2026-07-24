/**
 * Reconciliation smoke for reports.getCountVariances (slice 1).
 *
 * Read-only (default):
 *   node scripts/smoke-getCountVariances-reconciliation.js
 *
 * Seeded scenarios (creates three sessions, asserts, deletes — opt-in):
 *   SMOKE_REPORTING_FIXTURES=1 node scripts/smoke-getCountVariances-reconciliation.js
 *
 * Requires DATABASE_URL (local/staging). Fixture mode mutates DB briefly; do not point at prod.
 */
const { PrismaClient } = require('@prisma/client');
const { getCountVariances } = require('../src/services/reports.service');

const prisma = new PrismaClient();

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function dateRange() {
  const from = new Date();
  from.setMonth(from.getMonth() - 14);
  const to = new Date();
  return { dateFrom: isoDate(from), dateTo: isoDate(to) };
}

async function runReadOnlyProbe() {
  const tenant = await prisma.tenant.findFirst({ where: { isActive: true }, select: { id: true, name: true } });
  if (!tenant) {
    console.log(JSON.stringify({ error: 'No active tenant' }, null, 2));
    process.exit(1);
  }

  const filters = dateRange();

  const canonicalSession = await prisma.stockCountSession.findFirst({
    where: {
      tenantId: tenant.id,
      locationQtys: { some: { countedQty: { not: null } } },
    },
    select: {
      id: true,
      sessionNo: true,
      countDate: true,
      locationId: true,
      lines: { select: { id: true, itemId: true, countedQty: true, wacUnitCost: true } },
      locationQtys: { select: { itemId: true, locationId: true, roundNo: true, countedQty: true, bookQty: true } },
      scopedLocations: { select: { locationId: true } },
    },
    orderBy: { countDate: 'desc' },
  });

  const legacySession = await prisma.stockCountSession.findFirst({
    where: {
      tenantId: tenant.id,
      lines: { some: { countedQty: { not: null } } },
      NOT: { locationQtys: { some: { countedQty: { not: null } } } },
    },
    select: {
      id: true,
      sessionNo: true,
      countDate: true,
      locationId: true,
      lines: { select: { itemId: true, countedQty: true, wacUnitCost: true } },
    },
    orderBy: { countDate: 'desc' },
  });

  const multiLoc = await prisma.stockCountSession.findFirst({
    where: {
      tenantId: tenant.id,
      locationQtys: { some: { countedQty: { not: null } } },
      scopedLocations: { some: {} },
    },
    include: {
      scopedLocations: { select: { locationId: true } },
      locationQtys: { where: { countedQty: { not: null } }, select: { locationId: true, roundNo: true, itemId: true } },
    },
    orderBy: { countDate: 'desc' },
  });

  let multiDistinctLocs = 0;
  let multiSessionNo = null;
  let filterLocId = null;
  if (multiLoc) {
    const locSet = new Set(multiLoc.locationQtys.map((c) => c.locationId));
    multiDistinctLocs = locSet.size;
    multiSessionNo = multiLoc.sessionNo;
    if (locSet.size >= 2) {
      filterLocId = [...locSet][1];
    } else if (multiLoc.scopedLocations.length >= 2) {
      filterLocId = multiLoc.scopedLocations[1].locationId;
    }
  }

  const full = await getCountVariances(tenant.id, filters);

  let multiRoundSameCell = [];
  try {
    multiRoundSameCell = await prisma.$queryRaw`
      SELECT "sessionId", "itemId", "locationId", COUNT(*)::int AS "roundCount"
      FROM stock_count_location_qtys
      WHERE "countedQty" IS NOT NULL
      GROUP BY "sessionId", "itemId", "locationId"
      HAVING COUNT(*) > 1
      LIMIT 8
    `;
  } catch (e) {
    multiRoundSameCell = { error: String(e.message) };
  }

  const rowsForCanonical = canonicalSession
    ? full.data.filter((r) => r.sessionNo === canonicalSession.sessionNo)
    : [];
  const rowsForLegacy = legacySession ? full.data.filter((r) => r.sessionNo === legacySession.sessionNo) : [];

  let cellLatestDistinctCount = null;
  let canonicalRowCountMatch = null;
  if (canonicalSession) {
    const cells = await prisma.stockCountLocationQty.findMany({
      where: { sessionId: canonicalSession.id, countedQty: { not: null } },
    });
    const sorted = [...cells].sort((a, b) => b.roundNo - a.roundNo);
    const latestKeys = new Set();
    for (const c of sorted) {
      const k = `${c.itemId}:${c.locationId}`;
      if (!latestKeys.has(k)) latestKeys.add(k);
    }
    cellLatestDistinctCount = latestKeys.size;
    canonicalRowCountMatch = cellLatestDistinctCount === rowsForCanonical.length;
  }

  let filtered = null;
  if (multiSessionNo && filterLocId) {
    const f = { ...filters, locationId: filterLocId };
    filtered = await getCountVariances(tenant.id, f);
  }

  const out = {
    mode: 'read_only',
    hint:
      'Set SMOKE_REPORTING_FIXTURES=1 to create temporary sessions proving G2 legacy-only, G3 multi-location, G4 multi-round (then delete).',
    tenant: tenant.name,
    dateRange: filters,
    fixtures: {
      canonicalSessionNo: canonicalSession?.sessionNo ?? null,
      legacySessionNo: legacySession?.sessionNo ?? null,
      multiSessionNo,
      multiDistinctCountedLocations: multiDistinctLocs,
      filterLocationIdUsed: filterLocId,
      sessionsWithMultiRoundSameCell: Array.isArray(multiRoundSameCell) ? multiRoundSameCell.length : 0,
    },
    totals: full.totals,
    multiRoundSameCellKeys: Array.isArray(multiRoundSameCell) ? multiRoundSameCell : multiRoundSameCell,
    canonicalRowCount: rowsForCanonical.length,
    cellLatestDistinctCount,
    canonicalRowCountMatch,
    legacyRowCount: rowsForLegacy.length,
    canonicalSample: rowsForCanonical.slice(0, 5),
    legacySample: rowsForLegacy.slice(0, 5),
    filteredMulti: filtered
      ? {
          rowCount: filtered.data.filter((r) => r.sessionNo === multiSessionNo).length,
          sample: filtered.data.filter((r) => r.sessionNo === multiSessionNo).slice(0, 8),
        }
      : null,
  };

  console.log(JSON.stringify(out, null, 2));
}

/**
 * Creates three disposable sessions, runs assertions, deletes them.
 * Does not modify prisma seed files.
 */
async function runFixtureMode() {
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
    console.log(JSON.stringify({ error: 'No tenant member for active tenant' }, null, 2));
    process.exit(1);
  }
  const { userId } = member;

  const locations = await prisma.location.findMany({
    where: { tenantId: tenant.id, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: 2,
  });
  if (locations.length < 2) {
    console.log(JSON.stringify({ error: 'Need at least 2 active locations for fixture mode' }, null, 2));
    process.exit(1);
  }
  const [locA, locB] = locations;

  const items = await prisma.item.findMany({
    where: { tenantId: tenant.id, isActive: true },
    select: { id: true },
    take: 3,
  });
  if (items.length < 3) {
    console.log(JSON.stringify({ error: 'Need at least 3 active items for fixture mode' }, null, 2));
    process.exit(1);
  }

  const filters = dateRange();
  const stamp = `${Date.now().toString(36)}`;
  const createdIds = [];

  const cleanup = async () => {
    for (const id of [...createdIds].reverse()) {
      try {
        await prisma.stockCountSession.delete({ where: { id } });
      } catch (e) {
        console.error(JSON.stringify({ fixtureCleanupError: id, message: e.message }));
      }
    }
  };

  try {
    // G2 — legacy-only: lines with counts, no counted location cells
    const g2Session = await prisma.stockCountSession.create({
      data: {
        tenantId: tenant.id,
        locationId: locA.id,
        sessionNo: `SMOKE-G2-${stamp}`,
        createdBy: userId,
        countDate: new Date(),
        lines: {
          create: {
            itemId: items[0].id,
            bookQty: 10,
            countedQty: 12,
            wacUnitCost: 2.5,
            varianceQty: 2,
            varianceValue: 5,
          },
        },
      },
      select: { id: true, sessionNo: true },
    });
    createdIds.push(g2Session.id);

    // G3 — multi-location canonical: counted cells in two locations, scoped to both
    const g3Session = await prisma.stockCountSession.create({
      data: {
        tenantId: tenant.id,
        locationId: locA.id,
        sessionNo: `SMOKE-G3-${stamp}`,
        createdBy: userId,
        countDate: new Date(),
        scopedLocations: {
          create: [{ locationId: locA.id }, { locationId: locB.id }],
        },
        lines: {
          create: [
            {
              itemId: items[0].id,
              bookQty: 1,
              countedQty: null,
              wacUnitCost: 0,
              varianceQty: 0,
              varianceValue: 0,
            },
            {
              itemId: items[1].id,
              bookQty: 2,
              countedQty: null,
              wacUnitCost: 0,
              varianceQty: 0,
              varianceValue: 0,
            },
          ],
        },
        locationQtys: {
          create: [
            {
              itemId: items[0].id,
              locationId: locA.id,
              roundNo: 1,
              bookQty: 1,
              countedQty: 5,
              varianceQty: 4,
              countedAt: new Date(),
              countedBy: userId,
            },
            {
              itemId: items[1].id,
              locationId: locB.id,
              roundNo: 1,
              bookQty: 2,
              countedQty: 8,
              varianceQty: 6,
              countedAt: new Date(),
              countedBy: userId,
            },
          ],
        },
      },
      select: { id: true, sessionNo: true },
    });
    createdIds.push(g3Session.id);

    // G4 — multiple rounds same (item, location): latest round only
    const g4Session = await prisma.stockCountSession.create({
      data: {
        tenantId: tenant.id,
        locationId: locA.id,
        sessionNo: `SMOKE-G4-${stamp}`,
        createdBy: userId,
        countDate: new Date(),
        lines: {
          create: {
            itemId: items[2].id,
            bookQty: 100,
            countedQty: null,
            wacUnitCost: 1,
            varianceQty: 0,
            varianceValue: 0,
          },
        },
        locationQtys: {
          create: [
            {
              itemId: items[2].id,
              locationId: locA.id,
              roundNo: 1,
              bookQty: 100,
              countedQty: 10,
              varianceQty: -90,
              countedAt: new Date(Date.now() - 86400000),
              countedBy: userId,
            },
            {
              itemId: items[2].id,
              locationId: locA.id,
              roundNo: 2,
              bookQty: 100,
              countedQty: 99,
              varianceQty: -1,
              countedAt: new Date(),
              countedBy: userId,
            },
          ],
        },
      },
      select: { id: true, sessionNo: true },
    });
    createdIds.push(g4Session.id);

    const full = await getCountVariances(tenant.id, filters);

    const g2Rows = full.data.filter((r) => r.sessionNo === g2Session.sessionNo);
    const g2Pass =
      g2Rows.length === 1 &&
      Number(g2Rows[0].countedQty) === 12 &&
      g2Rows[0].locationName === locA.name;

    const g3Rows = full.data.filter((r) => r.sessionNo === g3Session.sessionNo);
    const g3Names = new Set(g3Rows.map((r) => r.locationName));
    const g3UnfilteredPass =
      g3Rows.length === 2 && g3Names.has(locA.name) && g3Names.has(locB.name);

    const filteredB = await getCountVariances(tenant.id, { ...filters, locationId: locB.id });
    const g3FilteredRows = filteredB.data.filter((r) => r.sessionNo === g3Session.sessionNo);
    const g3FilterPass =
      g3FilteredRows.length === 1 &&
      g3FilteredRows[0].locationName === locB.name &&
      Number(g3FilteredRows[0].countedQty) === 8;

    const g4Rows = full.data.filter((r) => r.sessionNo === g4Session.sessionNo);
    const g4Pass = g4Rows.length === 1 && Number(g4Rows[0].countedQty) === 99 && Number(g4Rows[0].varianceQty) === -1;

    const cellsG4 = await prisma.stockCountLocationQty.findMany({
      where: { sessionId: g4Session.id, countedQty: { not: null } },
      orderBy: { roundNo: 'desc' },
    });
    const expectedLatestDistinct = 1;

    const out = {
      mode: 'fixtures',
      tenant: tenant.name,
      dateRange: filters,
      locationsUsed: { locA: { id: locA.id, name: locA.name }, locB: { id: locB.id, name: locB.name } },
      g2_legacyOnly: {
        sessionId: g2Session.id,
        sessionNo: g2Session.sessionNo,
        expectedRowCount: 1,
        actualRowCount: g2Rows.length,
        expectedCountedQty: 12,
        actualCountedQty: g2Rows[0] ? Number(g2Rows[0].countedQty) : null,
        expectedLocationName: locA.name,
        actualLocationName: g2Rows[0]?.locationName ?? null,
        pass: g2Pass,
      },
      g3_multiLocation: {
        sessionId: g3Session.id,
        sessionNo: g3Session.sessionNo,
        expectedUnfilteredRowCount: 2,
        actualUnfilteredRowCount: g3Rows.length,
        locationNamesInRows: [...g3Names],
        filterLocationId: locB.id,
        expectedFilteredRowCount: 1,
        actualFilteredRowCount: g3FilteredRows.length,
        filteredRowLocationName: g3FilteredRows[0]?.locationName ?? null,
        matchesCellLocationName: g3FilterPass,
        unfilteredPass: g3UnfilteredPass,
        pass: g3UnfilteredPass && g3FilterPass,
      },
      g4_multiRound: {
        sessionId: g4Session.id,
        sessionNo: g4Session.sessionNo,
        dbCountedRounds: cellsG4.length,
        expectedReportRowCount: expectedLatestDistinct,
        actualReportRowCount: g4Rows.length,
        expectedCountedQtyLatestRound: 99,
        actualCountedQty: g4Rows[0] ? Number(g4Rows[0].countedQty) : null,
        pass: g4Pass,
      },
      overallPass: g2Pass && g3UnfilteredPass && g3FilterPass && g4Pass,
    };

    console.log(JSON.stringify(out, null, 2));

    if (!out.overallPass) {
      process.exitCode = 1;
    }
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

async function main() {
  if (process.env.SMOKE_REPORTING_FIXTURES === '1') {
    await runFixtureMode();
    return;
  }
  await runReadOnlyProbe();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
