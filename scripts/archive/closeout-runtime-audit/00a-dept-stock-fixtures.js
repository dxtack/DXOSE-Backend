'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const prisma = require('../../src/config/database');

async function ensureStockForDepartment(tenantId, deptCode, minQty = 5) {
  const dept = await prisma.department.findFirst({ where: { tenantId, code: deptCode } });
  if (!dept) return { deptCode, error: 'department_not_found' };

  let location = await prisma.location.findFirst({
    where: { tenantId, departmentId: dept.id, isActive: true },
  });
  if (!location) {
    location = await prisma.location.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });
    if (location && !location.departmentId) {
      location = await prisma.location.update({
        where: { id: location.id },
        data: { departmentId: dept.id },
      });
    }
  }
  if (!location) return { deptCode, departmentId: dept.id, error: 'location_not_found' };

  let bal = await prisma.stockBalance.findFirst({
    where: { tenantId, locationId: location.id, qtyOnHand: { gte: minQty } },
    include: { item: { select: { id: true, name: true, unitPrice: true } } },
  });

  if (!bal) {
    const item = await prisma.item.findFirst({ where: { tenantId, isActive: true } });
    if (!item) return { deptCode, error: 'no_item' };
    bal = await prisma.stockBalance.upsert({
      where: {
        tenantId_itemId_locationId: { tenantId, itemId: item.id, locationId: location.id },
      },
      update: { qtyOnHand: minQty + 10 },
      create: {
        tenantId,
        itemId: item.id,
        locationId: location.id,
        qtyOnHand: minQty + 10,
        wacUnitCost: item.unitPrice || 1,
      },
      include: { item: { select: { id: true, name: true, unitPrice: true } } },
    });
  }

  return {
    deptCode,
    departmentId: dept.id,
    locationId: location.id,
    locationName: location.name,
    itemId: bal.itemId,
    itemName: bal.item.name,
    qtyOnHand: Number(bal.qtyOnHand),
    unitCost: Number(bal.item.unitPrice) || Number(bal.avgUnitCost) || 1,
    tag: FIXTURE_TAG,
  };
}

async function main() {
  const fb = await ensureStockForDepartment(HOTEL_A.id, 'FB');
  const hk = await ensureStockForDepartment(HOTEL_A.id, 'HK');
  const out = {
    executedAt: new Date().toISOString(),
    tenantId: HOTEL_A.id,
    tag: FIXTURE_TAG,
    departmentA: fb,
    departmentB: hk,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'DEPT_STOCK_FIXTURES.json'), JSON.stringify(out, null, 2));
  console.log('Wrote DEPT_STOCK_FIXTURES.json', fb.deptCode, hk.deptCode);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
