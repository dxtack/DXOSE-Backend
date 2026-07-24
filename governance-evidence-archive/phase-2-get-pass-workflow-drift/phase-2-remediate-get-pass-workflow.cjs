'use strict';

/**
 * Phase 2 — Remediate Get Pass ACC workflow configuration drift.
 * Archives drifted published versions and publishes constitution-aligned replacements.
 * Does NOT migrate in-flight or historical document pins.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../OSE-backend/.env') });
const fs = require('fs');
const path = require('path');
const prisma = require(path.join(__dirname, '../../OSE-backend/src/config/database'));
const { defaultStepsForModule } = require(path.join(__dirname, '../../OSE-backend/src/services/acc-workflow-default-chains'));
const {
  APPROVED_CHAIN,
  chainMatchesConstitution,
  buildConfigurationInventory,
} = require('./phase-2-inventory.lib.cjs');

const GOV_DIR = __dirname;

async function roleIdForCode(code) {
  const row = await prisma.role.findUnique({ where: { code: String(code).trim().toUpperCase() } });
  if (!row) throw new Error(`Role not found: ${code}`);
  return row.id;
}

async function remediateDefinition(definition, notes) {
  const published = definition.versions.filter((v) => v.status === 'PUBLISHED');
  const latestPublished = published.sort((a, b) => b.versionNumber - a.versionNumber)[0];
  const ordered = latestPublished?.steps?.map((s) => String(s.statusKey || '').toUpperCase()).filter(Boolean) || [];
  if (chainMatchesConstitution(ordered)) {
    return { definitionId: definition.id, skipped: true, reason: 'already_aligned' };
  }

  const defaultSteps = defaultStepsForModule('GET_PASS');
  const latestNum = definition.versions.reduce((m, v) => Math.max(m, v.versionNumber), 0);
  const nextVersionNumber = latestNum + 1;

  let newVersionId = null;
  await prisma.$transaction(async (tx) => {
    await tx.accWorkflowVersion.updateMany({
      where: { definitionId: definition.id, status: 'PUBLISHED' },
      data: { status: 'ARCHIVED' },
    });
    const ver = await tx.accWorkflowVersion.create({
      data: {
        definitionId: definition.id,
        versionNumber: nextVersionNumber,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        notes,
      },
    });
    newVersionId = ver.id;
    for (const step of defaultSteps) {
      await tx.accWorkflowStepDefinition.create({
        data: {
          versionId: ver.id,
          stepOrder: step.stepOrder,
          label: step.label,
          statusKey: step.statusKey,
          approverRoleId: await roleIdForCode(step.roleCode),
        },
      });
    }
  });

  return {
    definitionId: definition.id,
    definitionKey: definition.key,
    tenantId: definition.tenantId,
    skipped: false,
    previousPublishedVersionId: latestPublished?.id || null,
    newPublishedVersionId: newVersionId,
    newVersionNumber: nextVersionNumber,
  };
}

async function main() {
  const before = await buildConfigurationInventory(prisma);
  fs.writeFileSync(path.join(GOV_DIR, 'PHASE_2_PRE_REMEDIATION_INVENTORY.json'), JSON.stringify(before, null, 2));

  const mod = await prisma.accModule.findFirst({ where: { key: 'GET_PASS' } });
  const definitions = await prisma.accWorkflowDefinition.findMany({
    where: { moduleId: mod.id, isActive: true },
    include: {
      versions: {
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      },
    },
  });

  const actions = [];
  for (const def of definitions) {
    const hasPublishedDrift = def.versions.some((v) => {
      if (v.status !== 'PUBLISHED') return false;
      const ordered = v.steps.map((s) => String(s.statusKey || '').toUpperCase()).filter(Boolean);
      return !chainMatchesConstitution(ordered);
    });
    if (!hasPublishedDrift) {
      actions.push({ definitionId: def.id, key: def.key, tenantId: def.tenantId, skipped: true, reason: 'no_drifted_published' });
      continue;
    }
    actions.push(
      await remediateDefinition(
        def,
        'Phase 2 constitution alignment — Dept → Cost Control → Finance → Security (no GM)',
      ),
    );
  }

  const after = await buildConfigurationInventory(prisma);
  fs.writeFileSync(path.join(GOV_DIR, 'PHASE_2_CONFIGURATION_INVENTORY.json'), JSON.stringify(after, null, 2));

  const out = {
    executedAt: new Date().toISOString(),
    approvedConstitutionChain: APPROVED_CHAIN,
    beforeSummary: before.summary,
    afterSummary: after.summary,
    remediationActions: actions,
    allTenantsAligned: after.summary.tenantsWithDrift === 0,
  };

  fs.writeFileSync(path.join(GOV_DIR, 'PHASE_2_REMEDIATION_ACTIONS.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  process.exit(out.allTenantsAligned ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
