'use strict';

/**
 * READ-ONLY: transposed Role×Permission markdown (permission rows × role cols).
 *   node scripts/export-role-permissions-md-transposed-readonly.js --confirm-db=ose_inventory
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
const { PERMISSION_MAP } = require('../src/acc-authority/catalog.constitution');

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const TEST_ROLE_RE =
  /(^E2E_|_E2E$|_E2E_|E2E[-_]|TEST_|_TEST$|_TEST_|FIXTURE|SMOKE_|DUMMY_|TEMP_ROLE|QA_ONLY)/i;

function cell(inUr, inLegacy) {
  if (!inUr && !inLegacy) return '✗';
  if (inUr && inLegacy) return '✓ (UR+legacy)';
  if (inUr) return '✓';
  return '✓ (legacy only)';
}

function roleSourceSummary(urSet, legacySet) {
  const urCount = urSet.size;
  const legacyCount = legacySet.size;
  const bothCount = [...urSet].filter((c) => legacySet.has(c)).length;
  const urOnly = urCount - bothCount;
  const legacyOnly = legacyCount - bothCount;
  if (urCount === 0 && legacyCount === 0) return 'لا صلاحيات';
  if (legacyOnly === 0 && urCount > 0) {
    return bothCount === urCount && legacyCount > 0
      ? 'UR الرسمي (مع legacy مطابق)'
      : bothCount > 0
        ? 'UR الرسمي أساسًا (+ تداخل legacy)'
        : 'UR الرسمي';
  }
  if (urOnly === 0 && legacyCount > 0) {
    return bothCount > 0 ? 'legacy fallback أساسًا (+ تداخل UR)' : 'legacy fallback';
  }
  return `مختلط: UR فقط=${urOnly}, legacy فقط=${legacyOnly}, كلاهما=${bothCount}`;
}

async function main() {
  const urlDb = (process.env.DATABASE_URL.match(/\/([^/?]+)(\?|$)/) || [])[1];
  if (urlDb !== REQUIRED_DB) throw new Error(`ABORT URL db=${urlDb}`);
  const dbRows = await prisma.$queryRaw`SELECT current_database() AS n`;
  if (dbRows[0].n !== REQUIRED_DB) throw new Error(`ABORT connected=${dbRows[0].n}`);
  process.stderr.write(`CONFIRMED_DB=${dbRows[0].n}\n`);

  const catalogCodes = [...new Set(PERMISSION_MAP.map((p) => p.legacyCode))];
  const [urCatalogRows, legacyCatalogRows] = await Promise.all([
    prisma.urPermission.findMany({ select: { legacyCode: true } }),
    prisma.permission.findMany({ select: { code: true } }),
  ]);
  const permissionColumns = [
    ...new Set([
      ...catalogCodes,
      ...urCatalogRows.map((r) => r.legacyCode).filter(Boolean),
      ...legacyCatalogRows.map((r) => r.code).filter(Boolean),
    ]),
  ].sort();

  const allRoles = await prisma.role.findMany({
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
  });
  const roles = allRoles.filter((r) => !TEST_ROLE_RE.test(`${r.code || ''} ${r.name || ''}`));

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
    matrix.push({ role, urSet, legacySet, src: roleSourceSummary(urSet, legacySet) });
  }

  const lines = [];
  lines.push(`# Role × Permissions (transposed) — DB: ${dbRows[0].n}`);
  lines.push('');
  lines.push('Legend: `✓` = UR only · `✓ (legacy only)` · `✓ (UR+legacy)` · `✗` = none');
  lines.push('');
  lines.push('## Role source summary');
  lines.push('');
  lines.push('| Role | Name | Active | مصدر الصلاحية |');
  lines.push('| --- | --- | --- | --- |');
  for (const row of matrix) {
    lines.push(
      `| ${row.role.code} | ${row.role.name || ''} | ${row.role.isActive ? 'yes' : 'no'} | ${row.src} |`,
    );
  }
  lines.push('');
  lines.push('## Matrix (Permission × Role)');
  lines.push('');

  const header = ['Permission', ...matrix.map((r) => r.role.code)];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '---').join(' | ')} |`);
  for (const code of permissionColumns) {
    const cells = matrix.map((r) => cell(r.urSet.has(code), r.legacySet.has(code)));
    lines.push(`| ${code} | ${cells.join(' | ')} |`);
  }

  const outPath = path.join(__dirname, '..', 'tmp', 'role-permissions-matrix-transposed.md');
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  process.stderr.write(`WROTE ${outPath}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
