/**
 * Restore `legacy:<tenantMemberId>` notes on assignments that lost linkage.
 *
 * Usage:
 *   node scripts/remediate-legacy-tag-notes.js --dry-run
 *   node scripts/remediate-legacy-tag-notes.js --apply
 */

'use strict';

require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const { legacyTag, extractLegacyTag } = require('../src/services/acc-membership-assignment-sync.service');

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run') || !apply;

async function main() {
  console.log(`\nLegacy tag notes remediation — ${dryRun ? 'DRY RUN' : 'APPLY'}`);
  console.log('='.repeat(60));

  const members = await prisma.tenantMember.findMany({
    where: { isActive: true },
    include: {
      user: { select: { email: true } },
      role: { select: { code: true } },
      tenant: { select: { name: true } },
    },
  });

  const taggedNotes = await prisma.urUserAssignment.findMany({
    where: { notes: { startsWith: 'legacy:' } },
    select: { notes: true },
  });
  const tagSet = new Set(taggedNotes.map((a) => extractLegacyTag(a.notes)).filter(Boolean));

  const plans = [];

  for (const member of members) {
    const expected = legacyTag(member.id);
    if (tagSet.has(expected)) continue;

    const candidates = await prisma.urUserAssignment.findMany({
      where: {
        userId: member.userId,
        roleId: member.roleId,
        isActive: true,
        properties: member.tenantId ? { some: { propertyId: member.tenantId } } : { none: {} },
      },
      select: { id: true, notes: true },
      orderBy: { createdAt: 'asc' },
    });

    if (candidates.length === 0) {
      plans.push({
        memberId: member.id,
        email: member.user.email,
        tenant: member.tenant?.name ?? 'GLOBAL',
        role: member.role?.code,
        action: 'no-assignment-found',
      });
      continue;
    }

  if (candidates.length > 1) {
      plans.push({
        memberId: member.id,
        email: member.user.email,
        tenant: member.tenant?.name ?? 'GLOBAL',
        role: member.role?.code,
        action: 'ambiguous',
        assignmentIds: candidates.map((c) => c.id),
      });
      continue;
    }

    plans.push({
      memberId: member.id,
      email: member.user.email,
      tenant: member.tenant?.name ?? 'GLOBAL',
      role: member.role?.code,
      action: 'restore-tag',
      assignmentId: candidates[0].id,
      currentNotes: candidates[0].notes,
      expectedNotes: expected,
    });
  }

  if (plans.length === 0) {
    console.log('No remediation required.');
    console.log('');
    return;
  }

  for (const plan of plans) {
    console.log(`\n${plan.email} | ${plan.tenant} | ${plan.role}`);
    console.log(`  Action: ${plan.action}`);
    if (plan.action === 'restore-tag') {
      console.log(`  Assignment: ${plan.assignmentId}`);
      console.log(`  Current notes: ${JSON.stringify(plan.currentNotes)}`);
      console.log(`  Restore to:    ${plan.expectedNotes}`);
      if (apply) {
        await prisma.urUserAssignment.update({
          where: { id: plan.assignmentId },
          data:  { notes: plan.expectedNotes },
        });
        console.log('  Applied ✓');
      }
    } else if (plan.action === 'ambiguous') {
      console.log(`  Ambiguous assignment IDs: ${plan.assignmentIds.join(', ')}`);
    }
  }

  console.log(`\nTotal plans: ${plans.length}`);
  console.log('='.repeat(60));
  console.log('');
}

main()
  .catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
