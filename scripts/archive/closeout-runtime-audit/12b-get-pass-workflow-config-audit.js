'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR } = require('./lib/constants');
const prisma = require('../../src/config/database');

const APPROVED_CHAIN = [
  'PENDING_DEPT',
  'PENDING_COST_CONTROL',
  'PENDING_FINANCE',
  'PENDING_SECURITY',
];

async function auditTenant(tenant) {
  const mod = await prisma.accModule.findFirst({ where: { key: 'GET_PASS' } });
  if (!mod) return { tenant: tenant.slug, error: 'module_not_found' };

  const defs = await prisma.accWorkflowDefinition.findMany({
    where: { moduleId: mod.id, OR: [{ tenantId: null }, { tenantId: tenant.id }] },
    include: {
      versions: {
        where: { status: 'PUBLISHED' },
        orderBy: { versionNumber: 'desc' },
        take: 1,
        include: {
          steps: { orderBy: { stepOrder: 'asc' }, include: { approverRole: { select: { code: true } } } },
        },
      },
    },
  });

  const rows = [];
  for (const def of defs) {
    for (const ver of def.versions) {
      const ordered = ver.steps.map((s) => String(s.statusKey || '').toUpperCase()).filter(Boolean);
      const matches = ordered.length === APPROVED_CHAIN.length && ordered.every((k, i) => k === APPROVED_CHAIN[i]);
      const drift = [];
      if (ordered.includes('PENDING_GM') && !APPROVED_CHAIN.includes('PENDING_GM')) drift.push('EXTRA_GM_STEP');
      if (!matches) drift.push('ORDER_OR_STEPS_MISMATCH');
      rows.push({
        tenant: tenant.slug,
        tenantId: tenant.id,
        publishedDefinitionId: def.id,
        definitionKey: def.key,
        versionId: ver.id,
        versionNumber: ver.versionNumber,
        orderedSteps: ver.steps.map((s) => ({
          stepOrder: s.stepOrder,
          roleCode: s.approverRole?.code,
          statusKey: s.statusKey,
        })),
        orderedStatusKeys: ordered,
        matchesConstitution: matches,
        drift,
        classification: matches
          ? 'CONSTITUTION_ALIGNED'
          : 'Active Tenant Constitution Non-Compliance',
      });
    }
  }
  if (!rows.length) rows.push({ tenant: tenant.slug, tenantId: tenant.id, error: 'no_published_get_pass_version' });
  return rows;
}

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true, slug: { not: 'platform' } },
    select: { id: true, slug: true, name: true },
    orderBy: { slug: 'asc' },
  });

  const audit = [];
  for (const t of tenants) {
    audit.push(...(await auditTenant(t)));
  }

  const out = {
    executedAt: new Date().toISOString(),
    approvedConstitutionChain: APPROVED_CHAIN,
    governanceNote:
      'STALE/mismatch rows are Active Tenant Constitution Non-Compliance — not Product code defect, not ignorable.',
    tenantsAudited: tenants.length,
    rows: audit,
    summary: {
      aligned: audit.filter((r) => r.matchesConstitution).length,
      nonCompliant: audit.filter((r) => r.classification === 'Active Tenant Constitution Non-Compliance').length,
    },
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'GET_PASS_WORKFLOW_CONFIGURATION_AUDIT.json'), JSON.stringify(out, null, 2));
  console.log('Wrote GET_PASS_WORKFLOW_CONFIGURATION_AUDIT.json', out.summary);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
