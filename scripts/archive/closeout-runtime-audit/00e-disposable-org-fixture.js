'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const prisma = require('../../src/config/database');

const ORG_SLUG = 'closeout-audit-org-disposable';
const CHILD_SLUG = 'closeout-audit-hotel-disposable';
const PROOF = path.join(REPORT_DIR, 'DISPOSABLE_ORG_HIERARCHY.json');

async function ensureDisposableHierarchy() {
  const ghBefore = await prisma.tenant.findUnique({
    where: { id: HOTEL_A.id },
    select: { id: true, slug: true, parentId: true },
  });

  let org = await prisma.tenant.findFirst({ where: { slug: ORG_SLUG } });
  if (!org) {
    org = await prisma.tenant.create({
      data: {
        slug: ORG_SLUG,
        name: `${FIXTURE_TAG} Disposable Org`,
        isActive: true,
        parentId: null,
      },
    });
  }

  let child = await prisma.tenant.findFirst({ where: { slug: CHILD_SLUG } });
  const childBefore = child
    ? { id: child.id, slug: child.slug, parentId: child.parentId }
    : null;

  if (!child) {
    child = await prisma.tenant.create({
      data: {
        slug: CHILD_SLUG,
        name: `${FIXTURE_TAG} Disposable Hotel`,
        isActive: true,
        parentId: org.id,
      },
    });
  } else if (child.parentId !== org.id) {
    child = await prisma.tenant.update({
      where: { id: child.id },
      data: { parentId: org.id },
    });
  }

  const ghAfter = await prisma.tenant.findUnique({
    where: { id: HOTEL_A.id },
    select: { id: true, slug: true, parentId: true },
  });

  const proof = {
    executedAt: new Date().toISOString(),
    tag: FIXTURE_TAG,
    policy: 'Test-only org hierarchy — never modify grand-horizon.parentId',
    grandHorizonUnchanged: ghBefore?.parentId === ghAfter?.parentId,
    grandHorizon: { before: ghBefore, after: ghAfter },
    disposableOrg: { id: org.id, slug: org.slug, parentId: org.parentId },
    disposableChild: {
      before: childBefore,
      after: { id: child.id, slug: child.slug, parentId: child.parentId },
    },
    dbQuery: {
      sql: `SELECT slug, "parentId" FROM tenants WHERE slug IN ('${ORG_SLUG}','${CHILD_SLUG}','grand-horizon')`,
      note: 'Verify grand-horizon.parentId unchanged; child linked to disposable org only',
    },
    cleanupPolicy: 'Tenants retained for ORG switch tests; tagged by slug prefix closeout-audit-',
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(PROOF, JSON.stringify(proof, null, 2));
  console.log('Disposable org fixture:', ORG_SLUG, '→', CHILD_SLUG);
  console.log('grand-horizon unchanged:', proof.grandHorizonUnchanged);
  await prisma.$disconnect();
  if (!proof.grandHorizonUnchanged) process.exit(1);
}

ensureDisposableHierarchy().catch((e) => {
  console.error(e);
  process.exit(1);
});
