'use strict';

/**
 * READ-ONLY export: Module | Module details | Role × Permissions (✓/✗)
 *   node scripts/export-module-role-permission-checks-md.js --confirm-db=ose_inventory
 */

process.env.DATABASE_URL =
  'postgresql://ose_user:ose_password@127.0.0.1:5433/ose_inventory?schema=public';

const REQUIRED_DB = 'ose_inventory';
if (!process.argv.includes(`--confirm-db=${REQUIRED_DB}`)) {
  throw new Error(`Requires --confirm-db=${REQUIRED_DB}`);
}

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PERMISSION_MAP, RESOURCES } = require('../src/acc-authority/catalog.constitution');
const { getPermissionsForMembership } = require('../src/services/rbac.service');
const { resolvePermissionKey } = require('../src/middleware/authorize');

const prisma = new PrismaClient();

const MODULE_DETAILS = {
  Adjustments: 'إنشاء وعرض تسويات المخزون المباشرة (ADJUSTMENT).',
  'Assets (مؤجل)': 'أصول ثابتة / تحقق وتخلص — موديول مؤجل قيد المراجعة؛ لا مسارات حية.',
  'Audit Log': 'عرض سجل التدقيق.',
  Breakage: 'مستندات الكسر: عرض، إنشاء، موافقة، قراءة.',
  Dashboard: 'شاشة ولوحة تحليلات لوحة التحكم.',
  Diagnostics: 'تشخيص عمليات المستأجر.',
  'Get Pass': 'دورة إذن الخروج: عرض، إنشاء، موافقات، تأكيد وجهة، Force Close، Claims.',
  GRN: 'إشعارات استلام البضائع: عرض وإدارة.',
  Import: 'استيراد Excel وإنشاء جلسات الاستيراد.',
  Integrity: 'لوحة سلامة البيانات.',
  'Inventory Count': 'جرد المخزون: إنشاء، تنفيذ، إلغاء، إعادة عد، تقديم، موافقة، حزمة MANAGE القديمة.',
  'Inventory Stock': 'عرض أرصدة المخزون وإدارة المخزون العامة.',
  'Lost & Found': 'سجل المفقودات والموجودات: عرض، إنشاء، إرجاع.',
  'Lost Items': 'مفقودات القرض/الشطب: عرض، إنشاء، موافقة، قراءة.',
  'Master Data': 'البيانات الأساسية للأصناف والموردين (عرض/تعديل/إدارة).',
  'Movements & Ledger': 'سجل الحركات والدفاتر وتاريخ المخزون.',
  'Par Levels': 'حدود إعادة الطلب (عرض/إدارة).',
  'Period Close': 'إغلاق الفترة، إعادة الفتح، مساحة الحل، الإغلاق التلقائي.',
  'Platform / Super Admin': 'بوابة المنصة وإدارة المستأجرين لـ Super Admin.',
  Reports: 'التقارير والتصدير وتقارير المخزون.',
  Settings: 'إعدادات النظام والمستأجر/المنظمة.',
  'Store Issue (مؤجل/متقاعد)': 'صرف المخزن — متقاعد/مؤجل قيد المراجعة.',
  'Store Requisition (مؤجل/متقاعد)': 'طلبات الصرف — متقاعد/مؤجل قيد المراجعة.',
  Transfer: 'تحويلات المخازن: عرض، إنشاء، موافقة، Dispatch/Receive (مهمل).',
  'User Rights / Access Control': 'مركز التحكم في الصلاحيات (عرض/إدارة).',
  Users: 'إدارة مستخدمي الفندق/المنظمة.',
  'Workflow Pipeline': 'عرض مسار سير العمل والموافقات.',
  Other: 'صلاحيات أخرى غير مصنفة.',
};

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
  return res ? res.name : 'Other';
}

function roleHas(effective, code) {
  if (effective.has(code)) return true;
  const resolved = resolvePermissionKey(code);
  if (resolved !== code && effective.has(resolved)) return true;
  for (const e of effective) {
    if (resolvePermissionKey(e) === code || resolvePermissionKey(e) === resolved) return true;
  }
  return false;
}

function mark(v) {
  return v ? '✓' : '✗';
}

async function main() {
  const db = (await prisma.$queryRaw`SELECT current_database() AS n`)[0].n;
  if (db !== REQUIRED_DB) throw new Error(`Wrong DB: ${db}`);

  const [urPerms, legacyPerms] = await Promise.all([
    prisma.urPermission.findMany({ select: { legacyCode: true, name: true } }),
    prisma.permission.findMany({ select: { code: true, name: true } }),
  ]);

  const byCode = new Map();
  for (const p of PERMISSION_MAP) {
    byCode.set(p.legacyCode, { code: p.legacyCode, name: p.name, resource: p.resource });
  }
  for (const p of urPerms) {
    if (!p.legacyCode || /^E2E_/i.test(p.legacyCode)) continue;
    if (!byCode.has(p.legacyCode)) {
      byCode.set(p.legacyCode, { code: p.legacyCode, name: p.name || p.legacyCode, resource: null });
    }
  }
  for (const p of legacyPerms) {
    if (!p.code || /^E2E_/i.test(p.code)) continue;
    if (!byCode.has(p.code)) {
      byCode.set(p.code, { code: p.code, name: p.name || p.code, resource: null });
    }
  }

  const roles = await prisma.role.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });

  // Exclude obvious test role codes from columns
  const TEST_ROLE = /(e2e|test|fixture|smoke|dummy|qa_|temp_|disposable)/i;
  const activeRoles = roles.filter((r) => !TEST_ROLE.test(r.code) && !TEST_ROLE.test(r.name || ''));

  const roleEffective = new Map();
  for (const role of activeRoles) {
    const codes = await getPermissionsForMembership({
      roleId: role.id,
      roleCode: role.code,
    });
    roleEffective.set(role.code, new Set(codes));
  }

  // Group permissions by module
  const modules = new Map();
  for (const meta of byCode.values()) {
    const mod = moduleFor(meta.code, meta.resource);
    if (!modules.has(mod)) modules.set(mod, []);
    modules.get(mod).push(meta);
  }
  for (const list of modules.values()) {
    list.sort((a, b) => a.code.localeCompare(b.code));
  }

  const modNames = [...modules.keys()].sort((a, b) => a.localeCompare(b, 'en'));
  const lines = [];
  lines.push('# Module — تفاصيل الموديول — Role × Permissions (✓/✗)');
  lines.push('');
  lines.push(`**Database (confirmed):** \`${db}\``);
  lines.push('');
  lines.push(
    `**Generated:** ${new Date().toISOString()} — read-only; ✓ = الدور يملك الصلاحية فعليًا عبر UR؛ ✗ = لا يملكها.`,
  );
  lines.push('');
  lines.push(
    `**Roles:** ${activeRoles.map((r) => r.code).join(', ')}`,
  );
  lines.push('');

  for (const mod of modNames) {
    const perms = modules.get(mod);
    const details = MODULE_DETAILS[mod] || '—';
    lines.push(`## ${mod}`);
    lines.push('');
    lines.push(`**تفاصيل الموديول:** ${details}`);
    lines.push('');

    // Header: Role | perm1 | perm2 | ...
    const header = ['Role', ...perms.map((p) => p.code)];
    lines.push(`| ${header.join(' | ')} |`);
    lines.push(`| ${header.map(() => '---').join(' | ')} |`);

    for (const role of activeRoles) {
      const eff = roleEffective.get(role.code) || new Set();
      const cells = [role.code, ...perms.map((p) => mark(roleHas(eff, p.code)))];
      lines.push(`| ${cells.join(' | ')} |`);
    }
    lines.push('');
  }

  const md = lines.join('\n');
  const outDir = path.join(__dirname, '..', 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'module-role-permission-checks.md');
  fs.writeFileSync(outPath, md, 'utf8');
  process.stderr.write(`Wrote ${outPath}\n`);
  process.stderr.write(`modules=${modNames.length} roles=${activeRoles.length} permissions=${byCode.size}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
