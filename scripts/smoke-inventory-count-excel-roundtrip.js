/**
 * Excel export → in-buffer edit → upload round-trip (canonical inventory count).
 *
 * Usage:
 *   node scripts/smoke-inventory-count-excel-roundtrip.js
 *   COUNT_EXCEL_LINES=20 node scripts/smoke-inventory-count-excel-roundtrip.js
 *
 * Env COUNT_EXCEL_LINES: target lines to edit (default 5; capped by session sheet size).
 */
'use strict';

const { PrismaClient } = require('@prisma/client');
const ExcelJS = require('exceljs');

const prisma = new PrismaClient();
const inventoryCount = require('../src/services/inventoryCount.service');

const DATA_HEADER_ROW = 7;
const COUNTED_HEADERS = ['Counted Qty', 'Counted', 'countedQty'];

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

function findCountedColIndex(headerRow) {
  for (let c = 1; c <= headerRow.cellCount; c += 1) {
    const v = String(headerRow.getCell(c).value || '').trim();
    if (COUNTED_HEADERS.some((h) => h.toLowerCase() === v.toLowerCase())) return c;
  }
  return null;
}

async function main() {
  const targetLines = Math.max(1, parseInt(process.env.COUNT_EXCEL_LINES || '5', 10) || 5);

  const tenant = await prisma.tenant.findFirst({ where: { isActive: true }, select: { id: true, name: true } });
  assert(tenant, 'No active tenant');

  const user = await prisma.user.findFirst({ where: { isActive: true }, select: { id: true, email: true } });
  assert(user, 'No active user');

  let dept = await prisma.department.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    select: { id: true, name: true },
  });
  assert(dept, 'No active department');

  const locWithBalances = await prisma.location.findMany({
    where: { tenantId: tenant.id, isActive: true, stockBalances: { some: {} } },
    select: { id: true, name: true, departmentId: true },
    take: 1,
  });
  assert(locWithBalances.length >= 1, 'No location with stock balances');

  if (locWithBalances[0].departmentId) {
    const d2 = await prisma.department.findFirst({
      where: { id: locWithBalances[0].departmentId, tenantId: tenant.id },
      select: { id: true, name: true },
    });
    if (d2) dept = d2;
  }

  const locationId = locWithBalances[0].id;
  const locationIds = [locationId];

  console.log(`Round-trip smoke: tenant=${tenant.name}, lines target=${targetLines}`);

  const created = await inventoryCount.createSession(tenant.id, user.id, {
    departmentId: dept.id,
    locationIds,
    blindMode: false,
    notes: 'excel roundtrip smoke',
  });
  await inventoryCount.startSession(tenant.id, user.id, created.id, { snapshotSource: 'STOCK_BALANCE' });

  const buffer = await inventoryCount.exportExcel(tenant.id, created.id, { locationId });
  assert(Buffer.isBuffer(buffer) || buffer instanceof Uint8Array, 'exportExcel must return buffer');

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  assert(ws, 'Workbook must have at least one worksheet');

  const metaSession =
    ws.getCell('B4').value ||
    ws.getCell('A4').value;
  assert(
    String(metaSession || '').includes(created.sessionNo),
    'Metadata Session value must match sessionNo (cell B4)',
  );

  const headerRow = ws.getRow(DATA_HEADER_ROW);
  const countedCol = findCountedColIndex(headerRow);
  assert(countedCol, 'Counted Qty column must exist in export header row');

  let edited = 0;
  const expectedByItem = new Map();

  for (let r = DATA_HEADER_ROW + 1; r <= ws.rowCount && edited < targetLines; r += 1) {
    const row = ws.getRow(r);
    const itemId = String(row.getCell(6).value || '').trim();
    const name = String(row.getCell(2).value || '').trim();
    if (!itemId && !name) continue;
    if (String(row.getCell(1).value || '').toLowerCase().includes('counted by')) break;

    const book = Number(row.getCell(10).value || row.getCell(9).value || 0);
    const newQty = Number.isFinite(book) ? book + 1 + edited * 0.01 : 1 + edited;
    row.getCell(countedCol).value = newQty;
    edited += 1;
    if (itemId) expectedByItem.set(itemId, newQty);
  }

  assert(edited >= 1, 'Must edit at least one data row');
  console.log(`Edited ${edited} counted qty cells in sheet "${ws.name}"`);

  const uploadBuffer = Buffer.from(await wb.xlsx.writeBuffer());
  const uploadResult = await inventoryCount.uploadExcel(tenant.id, user.id, created.id, uploadBuffer, {
    locationId,
  });
  assert(uploadResult.updated >= 1, `Upload must update rows (got ${uploadResult.updated})`);
  console.log('Upload result:', uploadResult);

  const sheet = await inventoryCount.getCountSheet(tenant.id, created.id, locationId, { page: 1, pageSize: 500 });
  for (const line of sheet.lines) {
    const expected = expectedByItem.get(line.itemId);
    if (expected == null) continue;
    const got = line.count?.countedQty;
    assert(
      Number(got) === expected,
      `item ${line.itemId}: expected countedQty ${expected}, got ${got}`,
    );
  }

  // Blind mode round-trip (metadata + upload without snapshot column)
  const blind = await inventoryCount.createSession(tenant.id, user.id, {
    departmentId: dept.id,
    locationIds,
    blindMode: true,
    notes: 'excel roundtrip blind',
  });
  await inventoryCount.startSession(tenant.id, user.id, blind.id, { snapshotSource: 'STOCK_BALANCE' });
  const blindBuf = await inventoryCount.exportExcel(tenant.id, blind.id, { locationId });
  const blindWb = new ExcelJS.Workbook();
  await blindWb.xlsx.load(blindBuf);
  const blindWs = blindWb.worksheets[0];
  const blindHeader = blindWs.getRow(DATA_HEADER_ROW);
  const blindCountedCol = findCountedColIndex(blindHeader);
  assert(blindCountedCol, 'Blind export must have Counted Qty column');
  const blindRow = blindWs.getRow(DATA_HEADER_ROW + 1);
  const blindQty = 3;
  blindRow.getCell(blindCountedCol).value = blindQty;
  const blindUpload = await inventoryCount.uploadExcel(
    tenant.id,
    user.id,
    blind.id,
    Buffer.from(await blindWb.xlsx.writeBuffer()),
    { locationId },
  );
  assert(blindUpload.updated >= 1, 'Blind upload must succeed');

  console.log('\nExcel round-trip smoke passed.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
