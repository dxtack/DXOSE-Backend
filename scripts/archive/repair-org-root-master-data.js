/**
 * Report or remove master-data rows stored on organization-root tenants
 * when branch hotels exist (mis-scoped FY setup data).
 *
 * Usage:
 *   node scripts/repair-org-root-master-data.js              # dry-run report
 *   node scripts/repair-org-root-master-data.js --apply      # delete misplaced rows
 *   node scripts/repair-org-root-master-data.js --names "Admin & General,Finance"
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const namesArg = process.argv.find((a) => a.startsWith('--names='));
const NAME_FILTER = namesArg
    ? namesArg
          .slice('--names='.length)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
    : null;

const MASTER_TABLES = [
    { label: 'departments', model: 'department', nameField: 'name' },
    { label: 'categories', model: 'category', nameField: 'name' },
    { label: 'subcategories', model: 'subcategory', nameField: 'name' },
    { label: 'locations', model: 'location', nameField: 'name' },
    { label: 'units', model: 'unit', nameField: 'name' },
    { label: 'suppliers', model: 'supplier', nameField: 'name' },
    { label: 'items', model: 'item', nameField: 'name' },
];

async function orgRootsWithBranches() {
    return prisma.tenant.findMany({
        where: {
            parentId: null,
            hasBranches: true,
            children: { some: { isActive: true } },
        },
        select: {
            id: true,
            name: true,
            slug: true,
            children: {
                where: { isActive: true },
                select: { id: true, name: true, slug: true },
            },
        },
        orderBy: { name: 'asc' },
    });
}

async function countForTenant(model, tenantId, nameField) {
    const where = { tenantId };
    if (NAME_FILTER?.length) {
        where[nameField] = { in: NAME_FILTER, mode: 'insensitive' };
    }
    return prisma[model].count({ where });
}

async function listSample(model, tenantId, nameField, take = 20) {
    const where = { tenantId };
    if (NAME_FILTER?.length) {
        where[nameField] = { in: NAME_FILTER, mode: 'insensitive' };
    }
    return prisma[model].findMany({
        where,
        take,
        select: { id: true, [nameField]: true },
        orderBy: { [nameField]: 'asc' },
    });
}

async function deleteForOrgRoot(tenantId) {
    // Respect FK order — items and dependents first.
    const tx = [
        prisma.item.deleteMany({ where: { tenantId } }),
        prisma.subcategory.deleteMany({ where: { tenantId } }),
        prisma.locationCategory.deleteMany({
            where: { location: { tenantId } },
        }),
        prisma.locationUser.deleteMany({
            where: { location: { tenantId } },
        }),
        prisma.location.deleteMany({ where: { tenantId } }),
        prisma.category.deleteMany({ where: { tenantId } }),
        prisma.department.deleteMany({ where: { tenantId } }),
        prisma.supplier.deleteMany({ where: { tenantId } }),
        // Keep default seeded units on org root unless explicitly deleting all master data
        ...(NAME_FILTER ? [] : [prisma.unit.deleteMany({ where: { tenantId } })]),
    ];
    await prisma.$transaction(tx);
}

async function auditDepartmentNamesAcrossOrg(org) {
    const tenantIds = [org.id, ...org.children.map((c) => c.id)];
    const departments = await prisma.department.findMany({
        where: {
            tenantId: { in: tenantIds },
            ...(NAME_FILTER?.length
                ? { name: { in: NAME_FILTER, mode: 'insensitive' } }
                : {}),
        },
        select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
            tenantId: true,
            tenant: { select: { name: true, slug: true, parentId: true } },
        },
        orderBy: [{ name: 'asc' }, { tenant: { slug: 'asc' } }],
    });
    return departments;
}

async function main() {
    console.log(`Mode: ${APPLY ? 'APPLY (destructive)' : 'DRY-RUN (report only)'}`);
    if (NAME_FILTER) {
        console.log(`Name filter: ${NAME_FILTER.join(', ')}`);
    }

    const orgs = await orgRootsWithBranches();
    if (orgs.length === 0) {
        console.log('No organization-root tenants with active branches found.');
        return;
    }

    for (const org of orgs) {
        console.log('\n' + '='.repeat(72));
        console.log(`Organization: ${org.name} (${org.slug})`);
        console.log(`Org root tenantId: ${org.id}`);
        console.log(`Branch properties: ${org.children.map((c) => c.slug).join(', ')}`);

        let orgRootTotal = 0;
        for (const table of MASTER_TABLES) {
            const count = await countForTenant(table.model, org.id, table.nameField);
            if (count > 0) {
                orgRootTotal += count;
                const sample = await listSample(table.model, org.id, table.nameField);
                console.log(`  ${table.label}: ${count}`);
                for (const row of sample) {
                    console.log(`    - ${row[table.nameField]} (${row.id})`);
                }
                if (count > sample.length) {
                    console.log(`    ... and ${count - sample.length} more`);
                }
            }
        }

        if (orgRootTotal === 0) {
            console.log('  (no master-data rows on org root — OK)');
        } else if (APPLY) {
            console.log(`  Deleting ${orgRootTotal} misplaced master-data row(s) on org root...`);
            await deleteForOrgRoot(org.id);
            console.log('  Done.');
        } else {
            console.log(`  >> ${orgRootTotal} row(s) should be removed or migrated (re-run with --apply)`);
        }

        const deptAudit = await auditDepartmentNamesAcrossOrg(org);
        if (deptAudit.length > 0) {
            console.log('\n  Department name audit (org + branches):');
            for (const d of deptAudit) {
                const scope = d.tenant.parentId ? 'branch' : 'ORG-ROOT';
                console.log(
                    `    [${scope}] ${d.tenant.slug}: "${d.name}" (${d.code}) active=${d.isActive}`,
                );
            }
        }
    }

    console.log('\nFinished.');
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
