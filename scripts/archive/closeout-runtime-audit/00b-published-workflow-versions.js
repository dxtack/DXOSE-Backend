'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { REPORT_DIR, HOTEL_A, HOTEL_B } = require('./lib/constants');
const prisma = require('../../src/config/database');

const APPROVED_GET_PASS_CHAIN = [
  'PENDING_DEPT',
  'PENDING_COST_CONTROL',
  'PENDING_FINANCE',
  'PENDING_GM',
  'PENDING_SECURITY',
];

async function dumpModule(moduleKey, tenantId) {
  const mod = await prisma.accModule.findFirst({ where: { key: moduleKey } });
  if (!mod) return { moduleKey, error: 'module_not_found' };

  const defs = await prisma.accWorkflowDefinition.findMany({
    where: {
      moduleId: mod.id,
      OR: [{ tenantId: null }, { tenantId }],
    },
    include: {
      versions: {
        where: { status: 'PUBLISHED' },
        orderBy: { versionNumber: 'desc' },
        include: {
          steps: {
            orderBy: { stepOrder: 'asc' },
            include: {
              approverRole: { select: { code: true, name: true } },
              permission: { select: { legacyCode: true, description: true } },
            },
          },
        },
      },
    },
  });

  const published = [];
  for (const def of defs) {
    for (const ver of def.versions) {
      published.push({
        definitionId: def.id,
        definitionKey: def.key,
        definitionName: def.name,
        tenantScoped: def.tenantId,
        versionId: ver.id,
        versionNumber: ver.versionNumber,
        publishedAt: ver.publishedAt,
        steps: ver.steps.map((s) => ({
          stepOrder: s.stepOrder,
          label: s.label,
          roleCode: s.approverRole?.code || null,
          permissionCode: s.permission?.legacyCode || null,
          statusKey: s.statusKey,
          autoApprove: s.autoApprove,
        })),
        orderedStatusKeys: ver.steps.map((s) => s.statusKey).filter(Boolean),
        orderedRoles: ver.steps.map((s) => s.approverRole?.code).filter(Boolean),
        staleVsApprovedGetPass:
          moduleKey === 'GET_PASS'
            ? !arraysEqual(
                ver.steps.map((s) => String(s.statusKey || '').toUpperCase()).filter(Boolean),
                APPROVED_GET_PASS_CHAIN,
              )
            : null,
      });
    }
  }

  return { moduleKey, moduleId: mod.id, publishedVersions: published };
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

async function main() {
  const modules = ['GET_PASS', 'BREAKAGE', 'LOST', 'GRN', 'TRANSFER', 'INVENTORY_COUNT'];
  const tenants = [
    { label: 'Hotel_A_grand_horizon', id: HOTEL_A.id, slug: HOTEL_A.slug },
    { label: 'Hotel_B_dx_airport', id: HOTEL_B.id, slug: HOTEL_B.slug },
  ];

  const report = {
    executedAt: new Date().toISOString(),
    approvedGetPassChain: APPROVED_GET_PASS_CHAIN,
    note: 'GM step in published GET_PASS version => STALE_WORKFLOW_CONFIGURATION for constitution comparison',
    tenants: {},
  };

  for (const t of tenants) {
    report.tenants[t.label] = {};
    for (const mk of modules) {
      report.tenants[t.label][mk] = await dumpModule(mk, t.id);
    }
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'PUBLISHED_WORKFLOW_VERSIONS.json'), JSON.stringify(report, null, 2));
  console.log('Wrote PUBLISHED_WORKFLOW_VERSIONS.json');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
