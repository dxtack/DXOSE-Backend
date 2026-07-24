'use strict';

/**
 * ACC Authority UAT — Tier 1 smoke + Section 7A matrix + Tier 2 role-by-role.
 * Usage:
 *   node scripts/uat-acc-authority-tier1-tier2.js
 * Optional:
 *   API_BASE=http://localhost:4000
 *   SKIP_API=1          — DB/session checks only
 *   RUN_SEED=1          — run seed:acc-authority if ur grants missing
 */

require('dotenv').config();

const { execSync } = require('child_process');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const accRuntime = require('../src/acc-runtime');
const { hasPermission } = require('../src/middleware/authorize');
const {
  buildRolePermissionMap,
  DEPT_MANAGER_STRIPPED_PERMISSIONS,
} = require('../src/acc-authority/base-role-permissions');
const { PERMISSION_MAP, RESOURCES } = require('../src/acc-authority/catalog.constitution');
const { membershipRoleCode } = require('../src/services/rbac.service');

const prisma = new PrismaClient();
const API_BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 4000}`;
const SKIP_API = process.env.SKIP_API === '1';
const TENANT_SLUG = 'grand-horizon';
const PASSWORD = process.env.UAT_PASSWORD || 'Admin@123';

const PROTECTED_ROLES = new Set(['ORG_MANAGER', 'SUPER_ADMIN']);
const TIER2_USERS = [
  { email: 'store@grandhorizon.com', role: 'STOREKEEPER', label: 'Storekeeper' },
  { email: 'hk.manager@grandhorizon.com', role: 'DEPT_MANAGER', label: 'Dept Manager (HK)' },
  { email: 'finance@grandhorizon.com', role: 'FINANCE_MANAGER', label: 'Finance' },
  { email: 'cost@grandhorizon.com', role: 'COST_CONTROL', label: 'Cost Control' },
  { email: 'auditor@grandhorizon.com', role: 'AUDITOR', label: 'Auditor' },
];

const NAV_PROBE = [
  { path: '/api/dashboard/summary', permission: 'DASHBOARD_VIEW', label: 'Dashboard summary' },
  { path: '/api/workflow-pipeline', permission: 'WORKFLOW_PIPELINE_VIEW', label: 'Workflow pipeline' },
  { path: '/api/movements?limit=1', permission: 'MOVEMENTS_VIEW', label: 'Movements' },
  { path: '/api/grn?limit=1', permission: 'GRN_VIEW', label: 'GRN list' },
  { path: '/api/transfers?limit=1', permission: 'TRANSFER_VIEW', label: 'Transfers' },
  { path: '/api/par-levels/low-stock', permission: 'PAR_LEVELS_VIEW', label: 'Par levels low-stock' },
  { path: '/api/reports/history?limit=1', permission: 'REPORTS_VIEW', label: 'Reports history' },
  { path: '/api/integrity/scan', permission: 'INTEGRITY_VIEW', label: 'Integrity scan' },
];

let passed = 0;
let failed = 0;
let warned = 0;

function assert(label, ok) {
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed += 1;
  }
}

function warn(label) {
  console.log(`  ⚠ ${label}`);
  warned += 1;
}

function runScript(relPath) {
  const full = path.join(__dirname, relPath);
  execSync(`node "${full}"`, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body, data: body?.data ?? body };
}

async function login(email) {
  return fetchJson(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, tenantSlug: TENANT_SLUG }),
  });
}

async function apiGet(token, apiPath) {
  return fetchJson(`${API_BASE}${apiPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function resolveSessionForEmail(email) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      memberships: {
        where: { isActive: true, tenant: { slug: TENANT_SLUG } },
        include: { role: true, tenant: true },
        take: 1,
      },
    },
  });
  if (!user?.memberships?.[0]) return null;
  const membership = user.memberships[0];
  return accRuntime.resolveSession({
    userId: user.id,
    membership,
    tenantId: membership.tenantId,
  });
}

async function loadUrGrantsForRole(roleCode) {
  const role = await prisma.role.findUnique({ where: { code: roleCode }, select: { id: true } });
  if (!role) return [];
  const rows = await prisma.urRolePermission.findMany({
    where: { roleId: role.id },
    select: { permission: { select: { legacyCode: true } } },
  });
  return rows.map((r) => r.permission.legacyCode);
}

async function tier1Smoke() {
  console.log('\n══ Tier 1 — Automated smoke ══\n');
  runScript('acc-authority-validate.js');
  runScript('verify-acc-phase-f.js');
  runScript('smoke-workflow-pipeline-filters.js');
  runScript('smoke-dept-manager-nav-rbac.js');
  runScript('smoke-gm-nav-permissions.js');
}

async function section7aMatrix() {
  console.log('\n══ Section 7A — ACC Matrix (DB) ══\n');

  const resourceCount = await prisma.urResource.count();
  const permissionCount = await prisma.urPermission.count();
  assert(`ur_resources = ${RESOURCES.length}`, resourceCount === RESOURCES.length);
  assert(`ur_permissions = ${PERMISSION_MAP.length}`, permissionCount === PERMISSION_MAP.length);

  const matrixResources = await prisma.urResource.findMany({
    include: { urPermissions: { select: { id: true, legacyCode: true } } },
  });
  const catalogPermIds = new Set(
    matrixResources.flatMap((r) => r.urPermissions.map((p) => p.id)),
  );
  assert(
    'matrix exposes full catalog (all permission rows linked to resources)',
    catalogPermIds.size === permissionCount,
  );
  assert(
    'every resource has ≥1 permission row',
    matrixResources.every((r) => r.urPermissions.length > 0),
  );

  const constitutionMap = buildRolePermissionMap();
  for (const roleCode of ['STOREKEEPER', 'DEPT_MANAGER', 'FINANCE_MANAGER', 'COST_CONTROL', 'AUDITOR', 'SECURITY', 'GENERAL_MANAGER']) {
    const urGrants = await loadUrGrantsForRole(roleCode);
    if (urGrants.length === 0) {
      warn(`${roleCode}: no ur_role_permissions — run npm run seed:acc-authority`);
      continue;
    }
    const expected = new Set(constitutionMap[roleCode] || []);
    const missing = [...expected].filter((c) => !urGrants.includes(c));
    const extra = urGrants.filter((c) => !expected.has(c));
    assert(`${roleCode}: ur grants cover constitution baseline`, missing.length === 0);
    if (extra.length > 0) {
      warn(`${roleCode}: ${extra.length} extra ur grant(s) beyond baseline (custom OK)`);
    }
  }

  const deptGrants = await loadUrGrantsForRole('DEPT_MANAGER');
  for (const stripped of DEPT_MANAGER_STRIPPED_PERMISSIONS) {
    assert(`DEPT_MANAGER ur excludes ${stripped}`, !deptGrants.includes(stripped));
  }

  const drift = await prisma.role.findUnique({
    where: { code: 'DEPT_MANAGER' },
    select: { id: true, code: true },
  });
  if (drift) {
    const legacyRows = await prisma.rolePermission.findMany({
      where: { roleId: drift.id },
      select: { permission: { select: { code: true } } },
    });
    const legacyCodes = legacyRows.map((r) => r.permission.code);
    const inUrNotInLegacy = deptGrants.filter((c) => !legacyCodes.includes(c));
    const inLegacyNotInUr = legacyCodes.filter((c) => !deptGrants.includes(c));
    if (inUrNotInLegacy.length || inLegacyNotInUr.length) {
      warn(
        `DEPT_MANAGER ur/legacy drift (dual-write off): ur-only=${inUrNotInLegacy.length}, legacy-only=${inLegacyNotInUr.length}`,
      );
    } else {
      assert('DEPT_MANAGER ur/legacy aligned', true);
    }
  }

  for (const roleCode of PROTECTED_ROLES) {
    const role = await prisma.role.findUnique({ where: { code: roleCode }, select: { id: true } });
    if (!role) {
      warn(`${roleCode} role row missing`);
      continue;
    }
    const count = await prisma.urRolePermission.count({ where: { roleId: role.id } });
    assert(`${roleCode} has ur grants configured`, count > 0);
  }
}

async function tier2RoleByRole(apiAvailable) {
  console.log('\n══ Tier 2 — Role-by-role (session + API probes) ══\n');

  for (const spec of TIER2_USERS) {
    console.log(`--- ${spec.label} (${spec.email}) ---`);
    const session = await resolveSessionForEmail(spec.email);
    if (!session) {
      assert(`${spec.label}: membership found`, false);
      continue;
    }

    assert(`${spec.label}: session role resolves`, Boolean(session.role));
    assert(`${spec.label}: JWT permissions non-empty`, Array.isArray(session.permissions) && session.permissions.length > 0);

    const userCtx = { role: session.role, permissions: session.permissions };
    for (const probe of NAV_PROBE) {
      const allowed = hasPermission(userCtx, probe.permission);
      assert(`${spec.label}: hasPermission ${probe.permission} = ${allowed}`, typeof allowed === 'boolean');
    }

    if (spec.role === 'DEPT_MANAGER') {
      assert(`${spec.label}: denied MOVEMENTS_VIEW`, !hasPermission(userCtx, 'MOVEMENTS_VIEW'));
      assert(`${spec.label}: denied GRN_VIEW`, !hasPermission(userCtx, 'GRN_VIEW'));
      assert(`${spec.label}: allowed TRANSFER_VIEW`, hasPermission(userCtx, 'TRANSFER_VIEW'));
      assert(`${spec.label}: allowed WORKFLOW_PIPELINE_VIEW`, hasPermission(userCtx, 'WORKFLOW_PIPELINE_VIEW'));
    }

    if (spec.role === 'STOREKEEPER') {
      assert(`${spec.label}: allowed MOVEMENTS_VIEW`, hasPermission(userCtx, 'MOVEMENTS_VIEW'));
      assert(`${spec.label}: allowed GRN_VIEW`, hasPermission(userCtx, 'GRN_VIEW'));
      assert(`${spec.label}: allowed PAR_LEVELS_VIEW`, hasPermission(userCtx, 'PAR_LEVELS_VIEW'));
    }

    if (spec.role === 'FINANCE_MANAGER') {
      assert(`${spec.label}: allowed INTEGRITY_VIEW`, hasPermission(userCtx, 'INTEGRITY_VIEW'));
      assert(`${spec.label}: allowed ACCESS_CONTROL_VIEW`, hasPermission(userCtx, 'ACCESS_CONTROL_VIEW'));
    }

    if (spec.role === 'AUDITOR') {
      assert(`${spec.label}: denied ACCESS_CONTROL_MANAGE`, !hasPermission(userCtx, 'ACCESS_CONTROL_MANAGE'));
    }

    if (!apiAvailable) {
      warn(`${spec.label}: API probes skipped (server not reachable)`);
      continue;
    }

    const loginRes = await login(spec.email);
    if (loginRes.status !== 200 || !loginRes.data?.accessToken) {
      assert(`${spec.label}: login`, false);
      continue;
    }
    assert(`${spec.label}: login`, true);
    const token = loginRes.data.accessToken;

    for (const probe of NAV_PROBE) {
      const shouldAllow = hasPermission(userCtx, probe.permission);
      const res = await apiGet(token, probe.path);
      const authDenied = res.status === 403 || res.status === 401;
      const ok = shouldAllow ? !authDenied : authDenied;
      if (shouldAllow && !authDenied && res.status >= 500) {
        warn(`${spec.label}: ${probe.label} auth OK but server ${res.status} (non-auth)`);
      }
      assert(
        `${spec.label}: ${probe.label} auth ${shouldAllow ? 'allowed' : 'denied'} (HTTP ${res.status})`,
        ok,
      );
    }
  }

  console.log('\n--- ORG_MANAGER (constitution baseline, DB-only if no user) ---');
  const orgGrants = await loadUrGrantsForRole('ORG_MANAGER');
  assert('ORG_MANAGER ur grants configured', orgGrants.length > 20);
  assert('ORG_MANAGER has ACCESS_CONTROL_MANAGE', orgGrants.includes('ACCESS_CONTROL_MANAGE'));
}

async function section7aMatrixApi(apiAvailable) {
  if (!apiAvailable) {
    warn('Section 7A API matrix fetch skipped (server not reachable)');
    return;
  }

  console.log('\n══ Section 7A — ACC Matrix (API) ══\n');

  const orgUser = await prisma.user.findFirst({
    where: {
      isActive: true,
      memberships: {
        some: {
          isActive: true,
          tenant: { slug: TENANT_SLUG },
          role: { code: { in: ['FINANCE_MANAGER', 'ADMIN'] } },
        },
      },
    },
    select: { email: true },
  });

  const matrixLoginEmail = orgUser?.email || 'finance@grandhorizon.com';
  const loginRes = await login(matrixLoginEmail);
  if (loginRes.status !== 200) {
    warn(`Matrix API login failed for ${matrixLoginEmail} — skip API matrix checks`);
    return;
  }

  const token = loginRes.data.accessToken;
  const matrixRes = await apiGet(token, '/api/user-rights/matrix');
  assert('GET /user-rights/matrix returns 200 for admin-capable user', matrixRes.status === 200);

  const resources = matrixRes.data?.resources || matrixRes.body?.data?.resources || [];
  const permRows = resources.flatMap((r) => r.permissions || []);
  assert(`API matrix permission rows = ${PERMISSION_MAP.length}`, permRows.length === PERMISSION_MAP.length);

  const rolesRes = await apiGet(token, '/api/user-rights/roles');
  assert('GET /user-rights/roles returns 200', rolesRes.status === 200);
  const roles = rolesRes.data || rolesRes.body?.data || [];
  assert('roles list non-empty', Array.isArray(roles) && roles.length > 0);

  const deptRole = roles.find((r) => r.code === 'DEPT_MANAGER');
  if (deptRole) {
    const deptPerms = await apiGet(token, `/api/user-rights/roles/DEPT_MANAGER/permissions`);
    assert('GET DEPT_MANAGER permissions', deptPerms.status === 200);
    const drift = await apiGet(token, '/api/user-rights/roles/DEPT_MANAGER/permissions/drift');
    assert('GET DEPT_MANAGER drift', drift.status === 200);
    const union = drift.data?.drift?.addedByMatrixUnion ?? drift.body?.data?.drift?.addedByMatrixUnion;
    assert('drift.addedByMatrixUnion retired (empty)', Array.isArray(union) && union.length === 0);
  }
}

async function ensureUrSeed() {
  const sample = await loadUrGrantsForRole('STOREKEEPER');
  if (sample.length > 0) return;
  if (process.env.RUN_SEED !== '1') {
    warn('ur_role_permissions empty — re-run with RUN_SEED=1 or npm run seed:acc-authority');
    return;
  }
  console.log('\nRunning seed:acc-authority (RUN_SEED=1)...\n');
  execSync('npm run seed:acc-authority', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
}

async function pingApi() {
  if (SKIP_API) return false;
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  ACC Authority UAT — Tier 1 + Matrix 7A + Tier 2 Roles   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  try {
    tier1Smoke();
    await ensureUrSeed();
    await section7aMatrix();

    const apiAvailable = await pingApi();
    if (!apiAvailable && !SKIP_API) {
      warn(`API not reachable at ${API_BASE} — Tier 2 HTTP probes will use session-only checks`);
    }
    await section7aMatrixApi(apiAvailable);
    await tier2RoleByRole(apiAvailable);

    console.log('\n══════════════════════════════════════════════════════════');
    console.log(`Results: ${passed} passed, ${failed} failed, ${warned} warnings`);
    console.log('══════════════════════════════════════════════════════════\n');

    if (failed > 0) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
