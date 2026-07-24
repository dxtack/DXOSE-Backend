'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const prisma = require('../../src/config/database');

const ROLLBACK_FILE = path.join(REPORT_DIR, 'ORG_HIERARCHY_FIXTURE_ROLLBACK.json');

async function main() {
  const org = await prisma.tenant.findFirst({ where: { slug: 'dx-hospitality-group' } });
  const gh = await prisma.tenant.findUnique({ where: { id: HOTEL_A.id } });
  if (!org || !gh) throw new Error('Missing org or grand-horizon tenant');

  const rollback = {
    tag: FIXTURE_TAG,
    tenantId: gh.id,
    previousParentId: gh.parentId,
    appliedAt: new Date().toISOString(),
  };

  if (gh.parentId !== org.id) {
    await prisma.tenant.update({
      where: { id: gh.id },
      data: { parentId: org.id },
    });
    rollback.action = 'set_parentId_to_org';
    rollback.newParentId = org.id;
  } else {
    rollback.action = 'already_linked';
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(ROLLBACK_FILE, JSON.stringify(rollback, null, 2));
  console.log('Org hierarchy fixture:', rollback.action, 'rollback at', ROLLBACK_FILE);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
