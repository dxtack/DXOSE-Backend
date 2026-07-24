'use strict';

/**
 * READ-ONLY: Module | Permission | Users markdown from ose_inventory.
 * Zero writes.
 */

process.env.DATABASE_URL =
  'postgresql://ose_user:ose_password@127.0.0.1:5433/ose_inventory?schema=public';

const REQUIRED_DB = 'ose_inventory';
const confirmation = process.argv.find((a) => a.startsWith('--confirm-db='));
if (confirmation !== `--confirm-db=${REQUIRED_DB}`) {
  throw new Error(`Requires --confirm-db=${REQUIRED_DB}`);
}

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PERMISSION_MAP, RESOURCES } = require('../src/acc-authority/catalog.constitution');
const { getPermissionsForMembership } = require('../src/services/rbac.service');
const { resolvePermissionKey } = require('../src/middleware/authorize');

const prisma = new PrismaClient();

const TEST_RE =
  /(e2e[_-]|[_-]e2e|test[_-]|[_-]test|fixture|smoke[_-]|dummy|qa_|temp_|noreply|example\.com|closeout|phase[0-9]|disposable|dxuat\.com)/i;

function isTestUser(user, tenantSlug) {
  const email = String(user.email || '').toLowerCase();
  if (/\.local$/i.test(email)) return true;
  if (/@(test|example|invalid)\./i.test(email)) return true;
  if (/\.test@/i.test(email)) return true; // e.g. amr.test@dx.com
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  if (/^test\b|\btest$/i.test(name)) return true; // "Amr Test", "Test User"
  const hay = `${email} ${name} ${tenantSlug || ''}`;
  return TEST_RE.test(hay);
}

const REVIEW_EXACT = new Set([
  'GET_PASS_VIEW', // AUDITOR legacy-only gap under review
  'ADJUSTMENT_CREATE', // STOREKEEPER legacy-only gap under review (ORG_MANAGER restored)
]);

function isReviewPermission(code) {
  if (REVIEW_EXACT.has(code)) return true;
  return /^(ASSET_|ISSUE_|REQUISITION_)/.test(code);
}

function moduleFor(code, resourceCode) {
  const c = String(code || '');
  if (/^GET_PASS_/.test(c)) return 'Get Pass';
  if (/^BREAKAGE_|^APPROVE_BREAKAGE$|^READ_BREAKAGE$|^CREATE_BREAKAGE$/.test(c)) return 'Breakage';
  if (/^LOST_FOUND_/.test(c)) return 'Lost & Found';
  if (/^LOST_|^APPROVE_LOST$|^READ_LOST$|^CREATE_LOST$/.test(c)) return 'Lost Items';
  if (/^GRN_/.test(c)) return 'GRN';
  if (/^TRANSFER_/.test(c)) return 'Transfer';
  if (/^STOCK_COUNT_|^APPROVE_INVENTORY_COUNT$|^MANAGE_COUNT$|^VIEW_COUNT$/.test(c)) {
    return 'Inventory Count';
  }
  if (/^PERIOD_/.test(c)) return 'Period Close';
  if (/^ADJUSTMENT_|^CREATE_ADJUSTMENT$/.test(c)) return 'Adjustments';
  if (/^MOVEMENT_|^MOVEMENTS_|^LEDGER_|^INVENTORY_HISTORY_/.test(c)) return 'Movements & Ledger';
  if (/^PAR_LEVELS_/.test(c)) return 'Par Levels';
  if (/^INVENTORY_VIEW$|^STOCK_MANAGE$/.test(c)) return 'Inventory Stock';
  if (/^BASIC_DATA_|^ITEM_MANAGE$|^MANAGE_MASTER_DATA$|^VIEW_MASTER_DATA$/.test(c)) {
    return 'Master Data';
  }
  if (/^REPORTS_|^STOCK_REPORT_|^VIEW_REPORTS$|^EXPORT_REPORTS$/.test(c)) return 'Reports';
  if (/^ACCESS_CONTROL_/.test(c)) return 'User Rights / Access Control';
  if (/^USER_|^USERS_|^HOTEL_USERS_|^MANAGE_USERS$/.test(c)) return 'Users';
  if (/^SETTINGS_|^TENANT_MANAGE$|^MANAGE_SETTINGS$/.test(c)) return 'Settings';
  if (/^AUDIT_LOG_|^VIEW_AUDIT_LOG$/.test(c)) return 'Audit Log';
  if (/^INTEGRITY_/.test(c)) return 'Integrity';
  if (/^IMPORT_|^MANAGE_IMPORTS$/.test(c)) return 'Import';
  if (/^VIEW_DASHBOARD$|^DASHBOARD_/.test(c)) return 'Dashboard';
  if (/^WORKFLOW_PIPELINE_/.test(c)) return 'Workflow Pipeline';
  if (/^PLATFORM_|^SUPER_ADMIN_/.test(c)) return 'Platform / Super Admin';
  if (/^TENANT_OPS_/.test(c)) return 'Diagnostics';
  if (/^ASSET_/.test(c)) return 'Assets (مؤجل)';
  if (/^ISSUE_/.test(c)) return 'Store Issue (مؤجل/متقاعد)';
  if (/^REQUISITION_/.test(c)) return 'Store Requisition (مؤجل/متقاعد)';

  const res = RESOURCES.find((r) => r.code === resourceCode);
  if (res) return res.name;
  return 'Other';
}

function displayName(user) {
  const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
  if (name && user.email) return `${name} <${user.email}>`;
  return user.email || name || user.id;
}

function escapeCell(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

async function main() {
  const dbRows = await prisma.$queryRaw`SELECT current_database() AS n`;
  const dbName = dbRows[0].n;
  console.error('=== DB SAFETY GATE ===');
  console.error('current_database():', dbName);
  if (dbName !== REQUIRED_DB) {
    throw new Error(`ABORT: connected to "${dbName}", expected "${REQUIRED_DB}"`);
  }

  // Catalog permissions + any live UR/legacy codes (for deferred groups not in constitution).
  const [urPerms, legacyPerms] = await Promise.all([
    prisma.urPermission.findMany({ select: { legacyCode: true, name: true } }),
    prisma.permission.findMany({ select: { code: true, name: true } }),
  ]);

  const byCode = new Map();
  for (const p of PERMISSION_MAP) {
    byCode.set(p.legacyCode, {
      code: p.legacyCode,
      name: p.name,
      resource: p.resource,
      inCatalog: true,
    });
  }
  for (const p of urPerms) {
    if (!p.legacyCode) continue;
    if (/^E2E_/i.test(p.legacyCode)) continue;
    if (!byCode.has(p.legacyCode)) {
      byCode.set(p.legacyCode, {
        code: p.legacyCode,
        name: p.name || p.legacyCode,
        resource: null,
        inCatalog: false,
      });
    }
  }
  for (const p of legacyPerms) {
    if (!p.code) continue;
    if (/^E2E_/i.test(p.code)) continue; // fixture junk — not product catalog
    if (!byCode.has(p.code)) {
      byCode.set(p.code, {
        code: p.code,
        name: p.name || p.code,
        resource: null,
        inCatalog: false,
      });
    }
  }

  const activeRoles = await prisma.role.findMany({
    where: { isActive: true },
    select: { id: true, code: true },
  });

  // roleId -> effective permission set (UR-primary runtime)
  const roleEffective = new Map();
  for (const role of activeRoles) {
    const codes = await getPermissionsForMembership({
      roleId: role.id,
      roleCode: role.code,
    });
    roleEffective.set(role.id, new Set(codes));
  }

  const memberships = await prisma.tenantMember.findMany({
    where: { isActive: true, role: { isActive: true } },
    select: {
      roleId: true,
      tenant: { select: { slug: true, name: true } },
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
        },
      },
    },
  });

  // permission code -> Set of display user strings (real only)
  const usersByPerm = new Map();
  const realUserIds = new Set();

  for (const m of memberships) {
    if (!m.user || m.user.isActive === false) continue;
    if (isTestUser(m.user, m.tenant?.slug)) continue;

    const effective = roleEffective.get(m.roleId) || new Set();
    const label = displayName(m.user);
    realUserIds.add(m.user.id);

    // Grant if role effective contains code OR alias-resolves to a held code
    for (const [code] of byCode) {
      let held = effective.has(code);
      if (!held) {
        const resolved = resolvePermissionKey(code);
        if (resolved !== code && effective.has(resolved)) held = true;
        // also: user holds an alias that resolves to this catalog code
        if (!held) {
          for (const e of effective) {
            if (resolvePermissionKey(e) === code || resolvePermissionKey(e) === resolved) {
              held = true;
              break;
            }
          }
        }
      }
      if (!held) continue;
      if (!usersByPerm.has(code)) usersByPerm.set(code, new Map());
      // dedupe by user id via label map key = user.id
      usersByPerm.get(code).set(m.user.id, label);
    }
  }

  const rows = [];
  for (const meta of byCode.values()) {
    const mod = moduleFor(meta.code, meta.resource);
    const usersMap = usersByPerm.get(meta.code);
    const users =
      usersMap && usersMap.size
        ? [...usersMap.values()].sort((a, b) => a.localeCompare(b, 'en'))
        : [];
    const review = isReviewPermission(meta.code) ? 'قيد المراجعة' : '';
    const permLabel = review
      ? `${meta.code} - ${meta.name} (${review})`
      : `${meta.code} - ${meta.name}`;
    rows.push({
      module: mod,
      permission: permLabel,
      code: meta.code,
      users: users.length ? users.join('; ') : 'لا يوجد',
    });
  }

  rows.sort((a, b) => {
    const m = a.module.localeCompare(b.module, 'ar');
    if (m) return m;
    return a.code.localeCompare(b.code);
  });

  const modules = new Set(rows.map((r) => r.module));
  const lines = [];
  lines.push('# Module — Permission — Users');
  lines.push('');
  lines.push(`**Database (confirmed):** \`${dbName}\``);
  lines.push('');
  lines.push(
    `**Generated:** ${new Date().toISOString()} (read-only from ose_inventory; effective = UR-primary runtime grants for active roles; test/E2E/UAT/fixture accounts excluded).`,
  );
  lines.push('');
  lines.push(
    `**Summary:** modules=${modules.size}, permissions=${rows.length}, distinct real users=${realUserIds.size}`,
  );
  lines.push('');
  lines.push('| Module | Permission | Users |');
  lines.push('| --- | --- | --- |');
  for (const r of rows) {
    lines.push(
      `| ${escapeCell(r.module)} | ${escapeCell(r.permission)} | ${escapeCell(r.users)} |`,
    );
  }
  lines.push('');

  const md = lines.join('\n');
  const outDir = path.join(__dirname, '..', 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = path.join(outDir, `module-permission-users-${stamp}.md`);
  fs.writeFileSync(outPath, md, 'utf8');
  console.error('Wrote', outPath);
  process.stdout.write(md);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
