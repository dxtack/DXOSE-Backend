'use strict';

/**
 * Option A: append GM approval step to in-flight inventory count sessions (totalSteps=1).
 *
 * Usage:
 *   node scripts/migrate-inventory-count-pending-to-gm-step.js
 *   node scripts/migrate-inventory-count-pending-to-gm-step.js --apply
 *   node scripts/migrate-inventory-count-pending-to-gm-step.js --tenant <slug> --apply
 */
const prisma = require('../src/config/database');
const { connectRole } = require('../src/services/rbac.service');

const APPLY = process.argv.includes('--apply');
const tenantSlug = process.argv.includes('--tenant')
  ? process.argv[process.argv.indexOf('--tenant') + 1]
  : null;

async function main() {
  const tenantWhere = tenantSlug ? { slug: tenantSlug } : {};
  const tenants = await prisma.tenant.findMany({
    where: tenantWhere,
    select: { id: true, slug: true, name: true },
  });

  const report = { scanned: 0, migrated: 0, skipped: 0, errors: [] };

  for (const tenant of tenants) {
    const sessions = await prisma.stockCountSession.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ['PENDING_APPROVAL', 'FINANCE_APPROVED'] },
        approvalRequestId: { not: null },
      },
      include: {
        approvalRequest: {
          include: {
            steps: { orderBy: { stepNumber: 'asc' }, include: { requiredRole: { select: { code: true } } } },
          },
        },
      },
    });

    for (const session of sessions) {
      const ar = session.approvalRequest;
      if (!ar) continue;
      report.scanned += 1;

      if (ar.totalSteps !== 1) {
        report.skipped += 1;
        continue;
      }

      const step1 = ar.steps.find((s) => s.stepNumber === 1);
      const hasGm = ar.steps.some((s) => s.requiredRole?.code === 'GENERAL_MANAGER');
      if (hasGm) {
        report.skipped += 1;
        continue;
      }

      const financeApproved = step1?.status === 'APPROVED';
      const nextSessionStatus = financeApproved ? 'FINANCE_APPROVED' : 'PENDING_APPROVAL';
      const nextCurrentStep = financeApproved ? 2 : 1;

      console.log(
        `[${tenant.slug}] ${session.sessionNo} (${session.status}) → totalSteps=2, GM step, session=${nextSessionStatus}`,
      );

      if (!APPLY) continue;

      try {
        await prisma.$transaction(async (tx) => {
          await tx.approvalRequest.update({
            where: { id: ar.id },
            data: { totalSteps: 2, currentStep: nextCurrentStep, status: 'PENDING' },
          });
          await tx.approvalStep.create({
            data: {
              requestId: ar.id,
              stepNumber: 2,
              requiredRole: connectRole('GENERAL_MANAGER'),
              status: 'PENDING',
            },
          });
          await tx.stockCountSession.update({
            where: { id: session.id },
            data: { status: nextSessionStatus, updatedAt: new Date() },
          });
        });
        report.migrated += 1;
      } catch (err) {
        report.errors.push({ sessionNo: session.sessionNo, message: err.message });
      }
    }
  }

  console.log('\n--- Migration report ---');
  console.log(JSON.stringify(report, null, 2));
  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to persist changes.');
  }
  if (report.errors.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
