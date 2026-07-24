/**
 * Pre-Wave 2 RBAC smoke — JWT permission bundles + workflow collector sanity.
 * Run: node scripts/smoke-pre-wave2-rbac.js
 */
const { PrismaClient } = require('@prisma/client');
const { getPermissionsForMembership, getRoleIdByCode, normalizeRole } = require('../src/services/rbac.service');
const { hasPermission } = require('../src/middleware/authorize');
const { ROLE_OPERATIONAL_PERMISSIONS } = require('../src/services/rbac-matrix.constants');
const { INVENTORY_COUNT_ACTIVE_STATUSES } = require('../src/services/workflow-pipeline/workflow-pending.definitions');
const { collectInventoryCounts } = require('../src/services/workflow-pipeline/workflow-pipeline.collectors');

const prisma = new PrismaClient();

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

const STOREKEEPER_REQUIRED = [
  'GRN_VIEW',
  'GRN_MANAGE',
  'STOCK_COUNT_VIEW',
  'STOCK_COUNT_CREATE',
  'STOCK_COUNT_EXECUTE',
  'STOCK_COUNT_CANCEL',
  'STOCK_COUNT_RECOUNT',
  'STOCK_COUNT_SUBMIT',
  'INVENTORY_VIEW',
  'MOVEMENTS_VIEW',
  'LEDGER_VIEW',
];

const FINANCE_REQUIRED = [
  'GRN_MANAGE',
  'STOCK_COUNT_VIEW',
  'STOCK_COUNT_CREATE',
  'STOCK_COUNT_EXECUTE',
  'STOCK_COUNT_CANCEL',
  'STOCK_COUNT_RECOUNT',
  'STOCK_COUNT_SUBMIT',
  'MOVEMENTS_VIEW',
  'LEDGER_VIEW',
  'AUDIT_LOG_VIEW',
  'PERIOD_CLOSE_EXECUTE',
];

async function checkRole(roleCode, required) {
  const roleId = await getRoleIdByCode(roleCode);
  assert(roleId, `Role ${roleCode} missing`);
  const perms = await getPermissionsForMembership({ roleId, roleCode });
  for (const code of required) {
    assert(perms.includes(code), `${roleCode} missing ${code} in JWT bundle`);
  }
  const user = { role: roleCode, permissions: perms };
  for (const code of required) {
    assert(hasPermission(user, code), `${roleCode} hasPermission(${code}) failed`);
  }
  console.log(`  ✓ ${roleCode}: ${required.length} critical permissions`);
}

async function main() {
  console.log('Pre-Wave 2 RBAC smoke\n');

  assert(ROLE_OPERATIONAL_PERMISSIONS.STOREKEEPER?.includes('GRN_MANAGE'), 'matrix STOREKEEPER');
  assert(ROLE_OPERATIONAL_PERMISSIONS.FINANCE_MANAGER?.includes('LEDGER_VIEW'), 'matrix FINANCE');

  await checkRole('STOREKEEPER', STOREKEEPER_REQUIRED);
  await checkRole('FINANCE_MANAGER', FINANCE_REQUIRED);

  const tenant = await prisma.tenant.findFirst({ where: { isActive: true }, select: { id: true } });
  assert(tenant, 'tenant');
  const openCount = await prisma.stockCountSession.count({
    where: { tenantId: tenant.id, status: { in: [...INVENTORY_COUNT_ACTIVE_STATUSES] } },
  });
  const pipelineItems = await collectInventoryCounts(tenant.id);
  console.log(`  ✓ Workflow collector: ${pipelineItems.length} open count session(s) (db total open: ${openCount})`);

  const pendingFinance = pipelineItems.filter(
    (i) => i.status === 'PENDING_APPROVAL' && i.waitingForRole === 'FINANCE_MANAGER',
  );
  if (openCount > 0) {
    assert(pipelineItems.length > 0, 'Expected at least one INVENTORY_COUNT pipeline row when sessions are open');
  }
  console.log(`  ✓ PENDING_APPROVAL → Finance rows: ${pendingFinance.length}`);

  console.log('\nPRE-WAVE 2 RBAC SMOKE OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
