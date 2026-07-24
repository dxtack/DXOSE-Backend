'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, HOTEL_A, FIXTURE_TAG } = require('./lib/constants');
const { prisma } = require('./lib/evidence');

const OUT = path.join(REPORT_DIR, 'CLOSEOUT_FIXTURE_CLEANUP_PROOF.json');

const REASON_PATTERNS = ['CLOSEOUT_RT_AUDIT', FIXTURE_TAG, 'PHASE5_TIMELINE_FIXTURE', 'PHASE6_TIMELINE'];
const CREATOR_EMAIL_DOMAIN = 'closeout-audit.local';
const GRN_PREFIXES = ['GRN-R7-', 'GRN-V3-', 'GRN-V2-', 'GRN-RT-'];

async function safeDeleteMovementDocs() {
  const closeoutUsers = await prisma.user.findMany({
    where: { email: { endsWith: `@${CREATOR_EMAIL_DOMAIN}` } },
    select: { id: true },
  });
  const userIds = closeoutUsers.map((u) => u.id);
  const docs = await prisma.movementDocument.findMany({
    where: {
      tenantId: HOTEL_A.id,
      postedAt: null,
      OR: [
        ...REASON_PATTERNS.map((p) => ({ reason: { contains: p } })),
        ...(userIds.length ? [{ createdBy: { in: userIds } }] : []),
      ],
    },
    select: { id: true, documentNo: true, movementType: true, reason: true, status: true, postedAt: true },
  });
  const ids = docs.map((d) => d.id);
  if (ids.length) {
    await prisma.movementLine.deleteMany({ where: { documentId: { in: ids } } });
    await prisma.approvalRequest.deleteMany({ where: { documentId: { in: ids } } });
    await prisma.movementDocument.deleteMany({ where: { id: { in: ids } } });
  }
  return docs;
}

async function safeDeleteGetPasses() {
  const passes = await prisma.getPass.findMany({
    where: {
      tenantId: HOTEL_A.id,
      closedAt: null,
      status: { notIn: ['CLOSED'] },
      OR: [{ borrowingEntity: { contains: FIXTURE_TAG } }, { passNo: { startsWith: 'GP-R7-' } }],
    },
    select: { id: true, passNo: true, status: true, borrowingEntity: true },
  });
  const ids = passes.map((p) => p.id);
  if (ids.length) {
    await prisma.getPassLine.deleteMany({ where: { getPassId: { in: ids } } });
    await prisma.getPass.deleteMany({ where: { id: { in: ids } } });
  }
  return passes;
}

async function safeDeleteGrns() {
  const grns = await prisma.grnImport.findMany({
    where: {
      tenantId: HOTEL_A.id,
      status: { not: 'POSTED' },
      OR: GRN_PREFIXES.map((p) => ({ grnNumber: { startsWith: p } })),
    },
    select: { id: true, grnNumber: true, status: true },
  });
  const ids = grns.map((g) => g.id);
  if (ids.length) {
    await prisma.grnLine.deleteMany({ where: { grnImportId: { in: ids } } });
    await prisma.grnImport.deleteMany({ where: { id: { in: ids } } });
  }
  return grns;
}

async function main() {
  const deleted = {
    movementDocuments: await safeDeleteMovementDocs(),
    getPasses: await safeDeleteGetPasses(),
    grns: await safeDeleteGrns(),
  };
  const proof = {
    executedAt: new Date().toISOString(),
    tenantId: HOTEL_A.id,
    policy: 'Delete only harness-tagged unposted fixtures; never delete posted operational documents',
    deletedCounts: {
      movementDocuments: deleted.movementDocuments.length,
      getPasses: deleted.getPasses.length,
      grns: deleted.grns.length,
    },
    deleted,
    skippedOperational: 'Documents without CLOSEOUT tag or with postedAt set were not touched',
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(proof, null, 2));
  console.log('Cleanup proof', proof.deletedCounts);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
