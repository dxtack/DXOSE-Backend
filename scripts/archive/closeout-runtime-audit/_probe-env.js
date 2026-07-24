'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const prisma = require('../../src/config/database');

(async () => {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true },
    orderBy: { slug: 'asc' },
  });
  console.log('TENANTS:', JSON.stringify(tenants, null, 2));

  for (const slug of ['grand-horizon', 'dx-executive-suites', 'dx-airport-hotel']) {
    const t = tenants.find((x) => x.slug === slug);
    if (!t) continue;
    const members = await prisma.tenantMember.findMany({
      where: { tenantId: t.id, isActive: true },
      include: {
        user: { select: { id: true, email: true, permissionVersion: true } },
        role: { select: { code: true, name: true } },
        department: { select: { id: true, code: true, name: true } },
      },
      take: 30,
    });
    console.log(`\nMEMBERS ${slug}:`, JSON.stringify(members.map((m) => ({
      email: m.user.email,
      userId: m.user.id,
      role: m.role.code,
      dept: m.department?.code || null,
      permissionVersion: m.user.permissionVersion,
    })), null, 2));
  }

  const gh = tenants.find((x) => x.slug === 'grand-horizon');
  if (gh) {
    const depts = await prisma.department.findMany({
      where: { tenantId: gh.id, isActive: true },
      select: { id: true, code: true, name: true },
    });
    const locs = await prisma.location.findMany({
      where: { tenantId: gh.id, isActive: true },
      select: { id: true, name: true, departmentId: true },
      take: 10,
    });
    const items = await prisma.item.findMany({
      where: { tenantId: gh.id, isActive: true },
      select: { id: true, name: true, sku: true },
      take: 5,
    });
    const stock = await prisma.stockBalance.findFirst({
      where: { tenantId: gh.id, qtyOnHand: { gt: 5 } },
      select: { itemId: true, locationId: true, qtyOnHand: true },
    });
    console.log('\nGH FIXTURES:', JSON.stringify({ depts, locs, items, stock }, null, 2));
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
