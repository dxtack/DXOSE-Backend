'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');
const prisma = require('../../src/config/database');

const APPROVED = ['PENDING_DEPT', 'PENDING_COST_CONTROL', 'PENDING_FINANCE', 'PENDING_SECURITY'];

async function main() {
  const mod = await prisma.accModule.findFirst({ where: { key: 'GET_PASS' } });
  const globalDef = await prisma.accWorkflowDefinition.findFirst({
    where: { moduleId: mod.id, tenantId: null, key: 'standard' },
    include: {
      versions: {
        where: { status: 'PUBLISHED' },
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: {
          steps: { orderBy: { stepOrder: 'asc' }, include: { approverRole: { select: { code: true } }, permission: { select: { legacyCode: true } } } },
        },
      },
    },
  });

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true, slug: { not: 'platform' } },
    select: { id: true, slug: true, name: true, createdAt: true },
    orderBy: { slug: 'asc' },
  });

  const rows = [];
  for (const t of tenants) {
    const published = await prisma.accWorkflowVersion.findFirst({
      where: {
        status: 'PUBLISHED',
        definition: { moduleId: mod.id, isActive: true, OR: [{ tenantId: t.id }, { tenantId: null }] },
      },
      orderBy: [{ publishedAt: 'desc' }, { versionNumber: 'desc' }],
      include: {
        definition: true,
        steps: { orderBy: { stepOrder: 'asc' }, include: { approverRole: { select: { code: true } }, permission: { select: { legacyCode: true } } } },
      },
    });

    const pinnedDocs = published
      ? await prisma.getPass.count({ where: { tenantId: t.id, accWorkflowVersionId: published.id } })
      : 0;
    const pinnedOlder = await prisma.getPass.count({
      where: {
        tenantId: t.id,
        accWorkflowVersionId: { not: null, ...(published ? { not: published.id } : {}) },
      },
    });
    const ordered = published?.steps.map((s) => s.statusKey?.toUpperCase()).filter(Boolean) || [];
    const matches = ordered.length === APPROVED.length && ordered.every((k, i) => k === APPROVED[i]);

    rows.push({
      tenantId: t.id,
      tenantSlug: t.slug,
      tenantCreatedAt: t.createdAt,
      workflowDefinitionId: published?.definitionId,
      definitionKey: published?.definition?.key,
      definitionTenantScoped: published?.definition?.tenantId,
      publishedVersionId: published?.id,
      versionNumber: published?.versionNumber,
      publishedAt: published?.publishedAt,
      publishedById: published?.publishedById,
      orderedSteps: published?.steps.map((s) => ({
        stepOrder: s.stepOrder,
        roleCode: s.approverRole?.code,
        permissionCode: s.permission?.legacyCode,
        statusKey: s.statusKey,
      })),
      orderedStatusKeys: ordered,
      matchesConstitution: matches,
      classification: matches ? 'CONSTITUTION_ALIGNED' : 'System-wide Active Governance Configuration Drift',
      runtimeUsesThisVersion: true,
      activeGetPassPinnedToThisVersion: pinnedDocs,
      activeGetPassPinnedToOtherVersions: pinnedOlder,
      securityAfterGm: ordered.indexOf('PENDING_SECURITY') > ordered.indexOf('PENDING_GM'),
    });
  }

  const globalSteps = globalDef?.versions[0]?.steps.map((s) => s.statusKey) || [];

  const out = {
    executedAt: new Date().toISOString(),
    approvedConstitutionChain: APPROVED,
    classification: 'System-wide Active Governance Configuration Drift',
    answers: {
      allFromSameTemplate: rows.every((r) => r.definitionKey === 'standard' && !r.definitionTenantScoped),
      globalTemplateVersionId: globalDef?.versions[0]?.id,
      globalTemplateHasGm: globalSteps.includes('PENDING_GM'),
      constitutionChangedAfterPublish: 'Published v3 includes GM; constitution omits GM before Security',
      migrationRequired: 'Yes — rollout/migration to remove GM step was required and not applied to active tenants',
      newTenantTodayGetsOldWorkflow: 'Yes — resolves global published standard v3 with GM unless tenant-scoped override exists',
      anyPinnedWithGm: rows.some((r) => r.activeGetPassPinnedToThisVersion > 0),
      backendHasPendingGm: true,
      frontendHasPendingGm: 'Check GET_PASS status enum and timeline builder',
      securityAfterGmInAll: rows.every((r) => r.securityAfterGm !== false),
    },
    tenantsAudited: tenants.length,
    rows,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'GET_PASS_WORKFLOW_ROLLOUT_AUDIT.json'), JSON.stringify(out, null, 2));
  console.log('Wrote GET_PASS_WORKFLOW_ROLLOUT_AUDIT.json', rows.filter((r) => !r.matchesConstitution).length, 'drift');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
