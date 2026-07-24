'use strict';

/**
 * READ-ONLY export: Role × Permission matrix from ose_inventory.
 * Never writes/updates/deletes. Never connects to test DBs.
 *
 *   node scripts/export-role-permissions-excel-readonly.js --confirm-db=ose_inventory
 */

const path = require('path');
const fs = require('fs');

// Force production inventory DB — never inherit a test URL.
process.env.DATABASE_URL =
  'postgresql://ose_user:ose_password@127.0.0.1:5433/ose_inventory?schema=public';

const REQUIRED_DB = 'ose_inventory';
const confirmation = process.argv.find((a) => a.startsWith('--confirm-db='));
if (confirmation !== `--confirm-db=${REQUIRED_DB}`) {
  throw new Error(`Requires --confirm-db=${REQUIRED_DB}`);
}

const urlDb = (process.env.DATABASE_URL.match(/\/([^/?]+)(\?|$)/) || [])[1];
console.log('=== DB SAFETY GATE ===');
console.log('Configured DATABASE_URL database name:', urlDb);
if (urlDb !== REQUIRED_DB) {
  throw new Error(`ABORT: connection string DB is "${urlDb}", expected "${REQUIRED_DB}"`);
}

const { PrismaClient } = require('@prisma/client');
const ExcelJS = require('exceljs');
const { PERMISSION_MAP } = require('../src/acc-authority/catalog.constitution');

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

/** Obvious test / E2E / fixture role patterns — excluded from the export. */
const TEST_ROLE_RE =
  /(^E2E_|_E2E$|_E2E_|E2E[-_]|TEST_|_TEST$|_TEST_|FIXTURE|SMOKE_|DUMMY_|TEMP_ROLE|QA_ONLY)/i;

function isTestRole(role) {
  const hay = `${role.code || ''} ${role.name || ''}`;
  return TEST_ROLE_RE.test(hay);
}

function sourceLabel(inUr, inLegacy) {
  if (inUr && inLegacy) return 'UR + legacy (كلا المصدرين)';
  if (inUr) return 'UR الرسمي';
  if (inLegacy) return 'legacy fallback';
  return '—';
}

function mark(has) {
  return has ? '✓' : '✗';
}

async function assertDb() {
  const rows = await prisma.$queryRaw`SELECT current_database() AS n`;
  const name = rows[0].n;
  console.log('current_database() confirmed:', name);
  if (name !== REQUIRED_DB) {
    throw new Error(`ABORT: connected to "${name}", expected "${REQUIRED_DB}"`);
  }
  return name;
}

async function main() {
  const dbName = await assertDb();

  const catalogCodes = [...new Set(PERMISSION_MAP.map((p) => p.legacyCode))].sort();
  console.log('Catalog permission columns:', catalogCodes.length);

  // Also surface any live UR/legacy codes not in constitution catalog (extra cols).
  const [urCatalogRows, legacyCatalogRows] = await Promise.all([
    prisma.urPermission.findMany({ select: { legacyCode: true }, orderBy: { legacyCode: 'asc' } }),
    prisma.permission.findMany({ select: { code: true }, orderBy: { code: 'asc' } }),
  ]);
  const liveCodes = new Set([
    ...catalogCodes,
    ...urCatalogRows.map((r) => r.legacyCode).filter(Boolean),
    ...legacyCatalogRows.map((r) => r.code).filter(Boolean),
  ]);
  const permissionColumns = [...liveCodes].sort();
  console.log('Total permission columns (catalog + live extras):', permissionColumns.length);

  const allRoles = await prisma.role.findMany({
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
  });

  const excluded = allRoles.filter(isTestRole);
  const roles = allRoles.filter((r) => !isTestRole(r));
  console.log('Roles total:', allRoles.length, '| excluded test/E2E:', excluded.length, '| exported:', roles.length);
  if (excluded.length) {
    console.log(
      'Excluded:',
      excluded.map((r) => `${r.code} (${r.isActive ? 'active' : 'inactive'})`).join(', '),
    );
  }

  const matrix = [];
  for (const role of roles) {
    const [urRows, legacyRows] = await Promise.all([
      prisma.urRolePermission.findMany({
        where: { roleId: role.id },
        select: { permission: { select: { legacyCode: true } } },
      }),
      prisma.rolePermission.findMany({
        where: { roleId: role.id },
        select: { permission: { select: { code: true } } },
      }),
    ]);
    const urSet = new Set(urRows.map((r) => r.permission?.legacyCode).filter(Boolean));
    const legacySet = new Set(legacyRows.map((r) => r.permission?.code).filter(Boolean));

    // Per-permission source detail for the "مصدر الصلاحية" summary column
    // and a detailed second sheet.
    const sources = [];
    for (const code of permissionColumns) {
      const inUr = urSet.has(code);
      const inLegacy = legacySet.has(code);
      if (inUr || inLegacy) sources.push(`${code}:${sourceLabel(inUr, inLegacy)}`);
    }

    // Role-level source summary: how this role's grants are provisioned overall.
    let roleSourceSummary;
    const urCount = urSet.size;
    const legacyCount = legacySet.size;
    const bothCount = [...urSet].filter((c) => legacySet.has(c)).length;
    const urOnly = urCount - bothCount;
    const legacyOnly = legacyCount - bothCount;
    if (urCount === 0 && legacyCount === 0) {
      roleSourceSummary = 'لا صلاحيات';
    } else if (legacyOnly === 0 && urCount > 0) {
      roleSourceSummary = bothCount === urCount && legacyCount > 0
        ? 'UR الرسمي (مع صفوف legacy مطابقة — مكررة)'
        : bothCount > 0
          ? `UR الرسمي أساسًا (+ ${bothCount} متداخلة مع legacy)`
          : 'UR الرسمي';
    } else if (urOnly === 0 && legacyCount > 0) {
      roleSourceSummary = bothCount > 0
        ? `legacy fallback أساسًا (+ ${bothCount} متداخلة مع UR)`
        : 'legacy fallback';
    } else {
      roleSourceSummary = `مختلط: UR فقط=${urOnly}, legacy فقط=${legacyOnly}, كلاهما=${bothCount}`;
    }

    matrix.push({
      role,
      urSet,
      legacySet,
      roleSourceSummary,
      urCount,
      legacyCount,
      bothCount,
      urOnly,
      legacyOnly,
    });
  }

  const outDir = path.join(__dirname, '..', 'tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = path.join(outDir, `role-permissions-matrix-ose_inventory-${stamp}.xlsx`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'OSE read-only export';
  wb.created = new Date();

  // Sheet 1: Role × Permission matrix (✓/✗) + source summary
  const ws = wb.addWorksheet('Role × Permissions', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }],
  });

  const header = [
    'Role (code)',
    'Role (name)',
    'Active',
    'مصدر الصلاحية',
    'UR count',
    'legacy count',
    'UR∩legacy',
    ...permissionColumns,
  ];
  ws.addRow(header);
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { wrapText: true, vertical: 'middle' };

  for (const row of matrix) {
    const cells = [
      row.role.code,
      row.role.name || '',
      row.role.isActive ? 'yes' : 'no',
      row.roleSourceSummary,
      row.urCount,
      row.legacyCount,
      row.bothCount,
      ...permissionColumns.map((code) => {
        const inUr = row.urSet.has(code);
        const inLegacy = row.legacySet.has(code);
        if (!inUr && !inLegacy) return '✗';
        // Granted if present in either store; mark with source hint when dual.
        if (inUr && inLegacy) return '✓ (UR+legacy)';
        if (inUr) return '✓';
        return '✓ (legacy only)';
      }),
    ];
    ws.addRow(cells);
  }

  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 8;
  ws.getColumn(4).width = 48;
  for (let i = 5; i <= 7; i++) ws.getColumn(i).width = 12;
  for (let i = 8; i <= header.length; i++) ws.getColumn(i).width = 18;

  // Sheet 2: long-form (role, permission, UR?, legacy?, source) — clearer dual-source view
  const ws2 = wb.addWorksheet('Grant detail (long)', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws2.addRow([
    'Role (code)',
    'Role (name)',
    'Active',
    'Permission',
    'In UR؟',
    'In legacy؟',
    'مصدر الصلاحية',
  ]);
  ws2.getRow(1).font = { bold: true };

  for (const row of matrix) {
    const codes = new Set([...row.urSet, ...row.legacySet]);
    const sorted = [...codes].sort();
    if (sorted.length === 0) {
      ws2.addRow([row.role.code, row.role.name || '', row.role.isActive ? 'yes' : 'no', '—', '✗', '✗', 'لا صلاحيات']);
      continue;
    }
    for (const code of sorted) {
      const inUr = row.urSet.has(code);
      const inLegacy = row.legacySet.has(code);
      ws2.addRow([
        row.role.code,
        row.role.name || '',
        row.role.isActive ? 'yes' : 'no',
        code,
        mark(inUr),
        mark(inLegacy),
        sourceLabel(inUr, inLegacy),
      ]);
    }
  }
  ws2.getColumn(1).width = 22;
  ws2.getColumn(2).width = 28;
  ws2.getColumn(3).width = 8;
  ws2.getColumn(4).width = 36;
  ws2.getColumn(5).width = 10;
  ws2.getColumn(6).width = 12;
  ws2.getColumn(7).width = 28;

  // Sheet 3: meta / exclusions
  const ws3 = wb.addWorksheet('Meta');
  ws3.addRow(['database', dbName]);
  ws3.addRow(['exported_at_utc', new Date().toISOString()]);
  ws3.addRow(['mode', 'READ_ONLY']);
  ws3.addRow(['roles_exported', roles.length]);
  ws3.addRow(['roles_excluded_test_e2e', excluded.length]);
  ws3.addRow(['permission_columns', permissionColumns.length]);
  ws3.addRow(['constitution_catalog_codes', catalogCodes.length]);
  ws3.addRow([]);
  ws3.addRow(['excluded_role_code', 'excluded_role_name', 'active']);
  for (const r of excluded) {
    ws3.addRow([r.code, r.name || '', r.isActive ? 'yes' : 'no']);
  }
  ws3.getColumn(1).width = 28;
  ws3.getColumn(2).width = 40;
  ws3.getColumn(3).width = 10;

  await wb.xlsx.writeFile(outPath);
  console.log('Wrote:', outPath);

  // Console summary
  console.log('\n=== SUMMARY ===');
  console.log('Database:', dbName);
  console.log('Roles exported:', roles.length);
  console.log('Roles excluded (test/E2E):', excluded.length);
  console.log('Permission columns:', permissionColumns.length);
  for (const row of matrix) {
    console.log(
      `  ${row.role.code.padEnd(22)} UR=${String(row.urCount).padStart(3)} legacy=${String(row.legacyCount).padStart(3)} both=${String(row.bothCount).padStart(3)} | ${row.roleSourceSummary}`,
    );
  }

  return outPath;
}

main()
  .then((outPath) => {
    console.log('\nDONE (read-only). File:', outPath);
  })
  .catch((err) => {
    console.error('EXPORT FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
